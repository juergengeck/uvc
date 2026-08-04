#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
uvc_root="$(cd "$script_dir/.." && pwd)"
source_root="$(cd "$uvc_root/.." && pwd)"
project_dir="$source_root/vger/packages/esp32.core/firmware/esp32-quicvc-project"
output_dir=""
version=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) version="${2:?missing version}"; shift 2 ;;
    --project-dir) project_dir="${2:?missing project directory}"; shift 2 ;;
    --output-dir) output_dir="${2:?missing output directory}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "--version must be a semantic version" >&2
  exit 2
fi
if [[ ! -f "$project_dir/CMakeLists.txt" ]]; then
  echo "ESP32 project does not exist: $project_dir" >&2
  exit 2
fi
output_dir="${output_dir:-$uvc_root/release/$version}"

if [[ -n "${IDF_PATH:-}" ]]; then
  if [[ ! -f "$IDF_PATH/export.sh" ]]; then
    echo "IDF_PATH does not contain export.sh: $IDF_PATH" >&2
    exit 2
  fi
  # Honor the explicitly selected SDK even when another idf.py is already on PATH.
  # shellcheck disable=SC1090
  source "$IDF_PATH/export.sh" >/dev/null
elif ! command -v idf.py >/dev/null 2>&1; then
  echo "idf.py is unavailable; set IDF_PATH or source the ESP-IDF export.sh first" >&2
  exit 2
fi

dependency_lock="$project_dir/dependencies.lock"
if [[ -f "$dependency_lock" ]]; then
  expected_idf_version="$(awk '
    /^  idf:$/ { in_idf = 1; next }
    in_idf && /^    version:/ {
      value = $2
      gsub(/[\047\042]/, "", value)
      print value
      exit
    }
  ' "$dependency_lock")"
  idf_version_output="$(idf.py --version)"
  if [[ -n "$expected_idf_version" && "$idf_version_output" != *"v$expected_idf_version"* ]]; then
    echo "ESP-IDF version mismatch: firmware lock requires v$expected_idf_version, found: $idf_version_output" >&2
    exit 2
  fi
fi

public_build_root="$(mktemp -d /tmp/uvc-esp32c6-public.XXXXXX)"
cleanup() {
  rm -rf "$public_build_root"
}
trap cleanup EXIT

public_build_dir="$public_build_root/build"
public_sdkconfig="$public_build_root/sdkconfig"
idf.py \
  -C "$project_dir" \
  -B "$public_build_dir" \
  -D "SDKCONFIG=$public_sdkconfig" \
  -D "SDKCONFIG_DEFAULTS=$script_dir/esp32-release-sdkconfig.defaults" \
  set-target esp32c6 build

node "$script_dir/build-esp32-release.mjs" \
  --project-dir "$project_dir" \
  --build-dir "$public_build_dir" \
  --sdkconfig "$public_sdkconfig" \
  --version "$version" \
  --output-dir "$output_dir"
