#!/bin/sh

set -eu

fail() {
  printf 'uvc-rio installer: %s\n' "$*" >&2
  exit 1
}

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
manifest_url="${UVC_RIO_MANIFEST_URL:-https://refinio.one/downloads/uvc/current-release.json}"
verifier="${UVC_RIO_VERIFIER:-$script_dir/verify-refinio-release.mjs}"
archive=""
model=""
firmware=""
target=""

while [ "$#" -gt 0 ]
do
  case "$1" in
    --archive) archive="${2:-}"; shift 2 ;;
    --manifest-url) manifest_url="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    --firmware) firmware="${2:-}"; shift 2 ;;
    --verifier) verifier="${2:-}"; shift 2 ;;
    --help)
      printf 'usage: install-rio.sh [--archive file] [--model model] [--firmware version] user@rio\n'
      exit 0
      ;;
    -*) fail "unknown option: $1" ;;
    *) [ -z "$target" ] || fail "only one SSH target is allowed"; target="$1"; shift ;;
  esac
done

[ -n "$target" ] || fail "an SSH target such as dev@rio.local is required"
case "$target" in
  *[!A-Za-z0-9._@:-]*) fail "SSH target contains unsupported characters" ;;
esac
if [ -n "$model" ]; then
  case "$model" in *[!A-Z0-9-]*) fail "model contains unsupported characters" ;; esac
fi
if [ -n "$firmware" ]; then
  case "$firmware" in *[!0-9A-Za-z.+-]*) fail "firmware contains unsupported characters" ;; esac
fi

for command in node curl scp ssh tar
do
  command -v "$command" >/dev/null 2>&1 || fail "missing required command: $command"
done

temporary="$(mktemp -d /tmp/uvc-rio-install.XXXXXX)"
cleanup() { rm -rf "$temporary"; }
trap cleanup EXIT INT TERM

if [ -z "$archive" ]; then
  if [ ! -f "$verifier" ]; then
    verifier="$temporary/verify-refinio-release.mjs"
    curl -fsSL https://refinio.one/downloads/uvc/verify-refinio-release.mjs -o "$verifier"
  fi
  manifest="$temporary/current-release.json"
  curl -fsSL "$manifest_url" -o "$manifest"
  artifact_url="$(node "$verifier" --manifest "$manifest" --print-url)"
  archive="$temporary/$(basename "$artifact_url")"
  curl -fsSL "$artifact_url" -o "$archive"
  node "$verifier" --manifest "$manifest" --archive "$archive" >/dev/null
else
  archive="$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd)/$(basename "$archive")"
  [ -f "$archive" ] || fail "archive does not exist: $archive"
fi

archive_base="$(basename "$archive")"
case "$archive_base" in
  uvc-rio-*.tar.gz) ;;
  *) fail "unexpected archive filename: $archive_base" ;;
esac

remote_archive="/tmp/$archive_base"
scp -q "$archive" "$target:$remote_archive"

remote_environment=""
if [ -n "$model" ]; then
  remote_environment="$remote_environment UVC_RIO_MODEL=$model"
fi
if [ -n "$firmware" ]; then
  remote_environment="$remote_environment UVC_RIO_FIRMWARE=$firmware"
fi
ssh "$target" \
  "set -eu; work=\$(mktemp -d /tmp/uvc-rio-release.XXXXXX); trap 'rm -rf \"\$work\" \"$remote_archive\"' EXIT; tar -xzf '$remote_archive' -C \"\$work\"; release=\$(find \"\$work\" -mindepth 1 -maxdepth 1 -type d | head -n 1); sudo env$remote_environment sh \"\$release/bin/install\""

printf 'UVC RIO installation completed on %s.\n' "$target"
printf 'Configure /home/dev/uvc/shared/uvc.env and commission the device. Keep SSH available on a trusted management network for break-glass UVC recovery.\n'
