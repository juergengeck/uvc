#!/usr/bin/env bash
set -euo pipefail

# Publish the current Expo app alongside the existing public UVC website.
# Usage: ./deploy.sh [--build-only]
BUILD_ONLY=false
case "${1:-}" in
  --build-only) BUILD_ONLY=true ;;
  '') ;;
  *) echo "Usage: $0 [--build-only]" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_DIR="${UVC_WEBSITE_DIR:-$SCRIPT_DIR/../one.uvc/html}"
DEPLOY_DIR="$SCRIPT_DIR/.expo/pages-deploy"
[[ -f "$WEBSITE_DIR/index.html" && -f "$WEBSITE_DIR/_headers" ]] || {
  echo "Missing public website at $WEBSITE_DIR (set UVC_WEBSITE_DIR)." >&2
  exit 1
}
cd "$SCRIPT_DIR"

npm run build:lane-worker
# A cached worker must never be paired with an app using a newer worker API.
export EXPO_PUBLIC_LANE_WORKER_VERSION="$(shasum -a 256 public/lane.worker.js | cut -d ' ' -f 1)"
npx expo export --platform web
[[ -s dist/index.html && -s dist/lane.worker.js ]] || {
  echo "App HTML or lab worker is missing from the export." >&2
  exit 1
}

# This directory contains only generated deployment files.
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
rsync -a --exclude='.*' "$WEBSITE_DIR/" "$DEPLOY_DIR/"
rsync -a --exclude=index.html --exclude=favicon.ico --exclude='*.map' dist/ "$DEPLOY_DIR/"
cp dist/index.html "$DEPLOY_DIR/mobile.html"
cp dist/favicon.ico "$DEPLOY_DIR/app-icon.ico"

python3 - "$DEPLOY_DIR" <<'PY'
from pathlib import Path
import hashlib
import re
import sys
root = Path(sys.argv[1])
# Cloudflare Pages never uploads node_modules directories, so Expo's vendored
# assets (icon fonts, navigation images) would 404 into the HTML fallback.
# Serve them from assets/vendor and point the bundles there before versioning.
vendored = root / 'assets' / 'node_modules'
if vendored.is_dir():
    target = root / 'assets' / 'vendor'
    if target.exists():
        sys.exit(f'{target} already exists; cannot relocate Expo node_modules assets.')
    vendored.rename(target)
    for script in (root / '_expo').rglob('*.js'):
        text = script.read_text()
        if '/assets/node_modules/' in text:
            script.write_text(text.replace('/assets/node_modules/', '/assets/vendor/'))
stale = [str(path) for path in root.rglob('*') if 'node_modules' in path.parts]
stale += [str(path) for path in root.rglob('*') if path.suffix in ('.js', '.html', '.css')
          and '/assets/node_modules/' in path.read_text(errors='ignore')]
if stale:
    sys.exit('Deployment still references node_modules assets: ' + ', '.join(stale[:5]))
html = root / 'mobile.html'
text = html.read_text().replace('href="/favicon.ico"', 'href="/app-icon.ico"')
# A CDN can cache the website fallback at a new script URL during rollout.
# Version entry scripts by their actual deployed bytes to bypass that response.
def version_script(match):
    url = match.group(2)
    revision = hashlib.sha256((root / url.lstrip('/')).read_bytes()).hexdigest()
    return f'{match.group(1)}{url}?v={revision}{match.group(3)}'
text = re.sub(r'(<script\b[^>]*\bsrc=")(/_expo/static/[^"?]+)(")', version_script, text)
html.write_text(text)
headers = root / '_headers'
text = headers.read_text()
# The existing ONE endpoints remain allowed; IoM pairing uses the Glue relay.
text = text.replace("connect-src 'self' ", "connect-src 'self' https://api.glue.one wss://api.glue.one ")
text += "\n/_expo/static/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/lane.worker.js\n  Cache-Control: public, max-age=0, must-revalidate\n"
headers.write_text(text)
# Explicit app routes keep website pages and asset URLs out of the SPA rewrite.
# Target the extensionless HTML URL to avoid Pages' .html canonical redirects.
routes = set()
for source in Path('app').rglob('*.tsx'):
    if source.stem.startswith(('_', '+')):
        continue
    parts = [part for part in source.relative_to('app').with_suffix('').parts
             if not part.startswith('(')]
    if parts and parts[-1] == 'index':
        parts.pop()
    if not parts:
        continue
    parts = ['*' if part.startswith('[...') else ':' + part[1:-1]
             if part.startswith('[') else part for part in parts]
    routes.add('/' + '/'.join(parts))
redirects = ['/app /journal 302', '/app/ /journal 302', '/app/* /:splat 302']
for route in sorted(routes, key=lambda route: ('*' in route, ':' in route, route)):
    redirects.append(f'{route} /mobile 200')
    if '*' not in route:
        redirects.append(f'{route}/ /mobile 200')
(root / '_redirects').write_text('\n'.join(redirects) + '\n')
PY

printf 'Deployment assembled: %s\n' "$DEPLOY_DIR"
if [[ "$BUILD_ONLY" == true ]]; then
  exit 0
fi
npx wrangler pages deploy "$DEPLOY_DIR" --project-name=uvc-one --branch=main --commit-dirty=true --no-bundle
printf 'Deployed: https://uvc.one/app/ and https://uvc.one/lab\n'
