#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_dir="$(cd "$script_dir/.." && pwd)"
groov_target="${GROOV_SSH_TARGET:-dev@rio.local}"
bundle_path="${GROOV_HEADLESS_BUNDLE:-}"
version="${GROOV_RELEASE_VERSION:-$(node -p "require('$package_dir/package.json').version")}"

if [[ -z "$bundle_path" || ! -f "$bundle_path" ]]; then
  echo "Set GROOV_HEADLESS_BUNDLE to the built VGER headless bundle.mjs" >&2
  exit 2
fi

release_dir="$(mktemp -d /tmp/uvc-rio-deploy.XXXXXX)"
cleanup() {
  rm -rf "$release_dir"
}
trap cleanup EXIT

node "$script_dir/build-rio-release.mjs" \
  --bundle "$bundle_path" \
  --version "$version" \
  --output-dir "$release_dir" \
  --minimum-firmware "${GROOV_MINIMUM_FIRMWARE:-4.1.2}" \
  --models "${GROOV_SUPPORTED_MODELS:-GRV-R7-MM1001-10}"

install_args=(--archive "$release_dir/uvc-rio-$version.tar.gz")
if [[ -n "${GROOV_RIO_MODEL:-}" ]]; then
  install_args+=(--model "$GROOV_RIO_MODEL")
fi
if [[ -n "${GROOV_RIO_FIRMWARE:-}" ]]; then
  install_args+=(--firmware "$GROOV_RIO_FIRMWARE")
fi

"$script_dir/install-rio.sh" "${install_args[@]}" "$groov_target"
