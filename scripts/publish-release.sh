#!/usr/bin/env bash
set -euo pipefail

CHANNEL="latest"
REMOTE_HOST="juergen@89.167.55.116"
VERSION=""
ARTIFACTS_FILE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel) CHANNEL="${2:?missing channel}"; shift 2 ;;
    --host) REMOTE_HOST="${2:?missing host}"; shift 2 ;;
    --version) VERSION="${2:?missing version}"; shift 2 ;;
    --artifacts-file) ARTIFACTS_FILE="${2:?missing artifacts file}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --version <version> [--artifacts-file <json>] [--channel latest|preview] [--host user@host] [--dry-run]" >&2
      exit 2
      ;;
  esac
done

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "--version must be a semantic version" >&2
  exit 2
fi
if [[ ! "$CHANNEL" =~ ^(latest|preview)$ ]]; then
  echo "Unsupported channel: $CHANNEL" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UVC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_ROOT="$(cd "$UVC_ROOT/.." && pwd)"
REFINIO_ONE_DIR="${REFINIO_ONE_DIR:-$SOURCE_ROOT/refinio/packages/refinio.one}"
ARTIFACTS_FILE="${ARTIFACTS_FILE:-$UVC_ROOT/release/$VERSION/uvc-release-artifacts.json}"
VERIFY_SCRIPT="$SCRIPT_DIR/verify-release-artifacts.mjs"
REFINIO_PUBLISHER="$REFINIO_ONE_DIR/scripts/publish-uvc-downloads.sh"

for required in \
  "$ARTIFACTS_FILE" \
  "$VERIFY_SCRIPT" \
  "$REFINIO_PUBLISHER" \
  "$UVC_ROOT/packages/uvc.cube/package.json" \
  "$UVC_ROOT/packages/uvc.groov/package.json"; do
  [[ -f "$required" ]] || { echo "Missing required release input: $required" >&2; exit 1; }
done

ARTIFACTS_FILE="$(cd "$(dirname "$ARTIFACTS_FILE")" && pwd)/$(basename "$ARTIFACTS_FILE")"

read_package_version() {
  node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(p.version || ""));' "$1"
}

CUBE_VERSION="$(read_package_version "$UVC_ROOT/packages/uvc.cube/package.json")"
RIO_VERSION="$(read_package_version "$UVC_ROOT/packages/uvc.groov/package.json")"
if [[ "$CUBE_VERSION" != "$VERSION" || "$RIO_VERSION" != "$VERSION" ]]; then
  echo "Release version $VERSION must match uvc.cube ($CUBE_VERSION) and uvc.groov ($RIO_VERSION)" >&2
  exit 1
fi

echo "=== Validating UVC release $VERSION ($CHANNEL) ==="
node "$VERIFY_SCRIPT" --version "$VERSION" --artifacts-file "$ARTIFACTS_FILE"
(cd "$UVC_ROOT" && npm run test:release)

if [[ "$DRY_RUN" == true ]]; then
  echo "=== UVC release validation complete; publication skipped ==="
  echo "Publisher: $REFINIO_PUBLISHER"
  echo "Target:    $REMOTE_HOST"
  exit 0
fi

echo "=== Publishing UVC release $VERSION ($CHANNEL) ==="
bash "$REFINIO_PUBLISHER" \
  --version "$VERSION" \
  --channel "$CHANNEL" \
  --host "$REMOTE_HOST" \
  --artifacts-file "$ARTIFACTS_FILE"
