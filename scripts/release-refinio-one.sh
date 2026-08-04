#!/usr/bin/env bash
set -euo pipefail

CHANNEL="latest"
REF=""
REMOTE_HOST="juergen@89.167.55.116"
VERSION_OVERRIDE=""
ARTIFACTS_FILE=""
ALLOW_DIRTY_INPUTS=false
ALLOW_SAME_VERSION=false
USE_EXISTING_DESCRIPTOR=false
DRY_RUN=false
SKIP_PROVENANCE_CHECK=false
WINDOWS_ARTIFACT=""
LINUX_ARTIFACT=""
RIO_ARTIFACT=""
ESP32_ARTIFACT=""

usage() {
  cat <<'EOF'
Usage: scripts/release-refinio-one.sh [options]

Options:
  --channel latest|preview        Release channel (default: latest)
  --ref branch                    Pushed UVC branch to release (default: current branch)
  --host user@host                Refinio deployment host
  --version x.y.z                 Require an already synchronized package version
  --artifacts-file path           Descriptor output/input path
  --windows-artifact path         Override the conventional Windows artifact
  --linux-artifact path           Override the conventional Linux artifact
  --rio-artifact path             Override the conventional groov RIO artifact
  --esp32-artifact path           Override the conventional ESP32-C6 artifact
  --use-existing-descriptor       Publish an existing descriptor without regenerating it
  --deploy-existing-artifacts     Alias for --use-existing-descriptor
  --allow-dirty-inputs            Explicitly allow dirty source checkouts
  --allow-same-version            Explicitly allow republishing the current latest version
  --skip-provenance-check         Skip git checks for --dry-run validation only
  --dry-run                       Validate the complete release without publishing
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel) CHANNEL="${2:?missing channel}"; shift 2 ;;
    --ref) REF="${2:?missing ref}"; shift 2 ;;
    --host) REMOTE_HOST="${2:?missing host}"; shift 2 ;;
    --version) VERSION_OVERRIDE="${2:?missing version}"; shift 2 ;;
    --artifacts-file) ARTIFACTS_FILE="${2:?missing artifacts file}"; shift 2 ;;
    --windows-artifact) WINDOWS_ARTIFACT="${2:?missing Windows artifact}"; shift 2 ;;
    --linux-artifact) LINUX_ARTIFACT="${2:?missing Linux artifact}"; shift 2 ;;
    --rio-artifact) RIO_ARTIFACT="${2:?missing RIO artifact}"; shift 2 ;;
    --esp32-artifact) ESP32_ARTIFACT="${2:?missing ESP32 artifact}"; shift 2 ;;
    --use-existing-descriptor|--deploy-existing-artifacts) USE_EXISTING_DESCRIPTOR=true; shift ;;
    --allow-dirty-inputs) ALLOW_DIRTY_INPUTS=true; shift ;;
    --allow-same-version) ALLOW_SAME_VERSION=true; shift ;;
    --skip-provenance-check) SKIP_PROVENANCE_CHECK=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$CHANNEL" =~ ^(latest|preview)$ ]]; then
  echo "Unsupported channel: $CHANNEL" >&2
  exit 2
fi
if [[ -n "$VERSION_OVERRIDE" && ! "$VERSION_OVERRIDE" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "--version must be a semantic version" >&2
  exit 2
fi
if [[ "$USE_EXISTING_DESCRIPTOR" == true ]] &&
   [[ -n "$WINDOWS_ARTIFACT$LINUX_ARTIFACT$RIO_ARTIFACT$ESP32_ARTIFACT" ]]; then
  echo "Artifact path overrides cannot be combined with --use-existing-descriptor." >&2
  exit 2
fi
if [[ "$SKIP_PROVENANCE_CHECK" == true && "$DRY_RUN" != true ]]; then
  echo "--skip-provenance-check is allowed only together with --dry-run." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UVC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSIGN_VERSION_SCRIPT="$SCRIPT_DIR/assign-release-version.mjs"
ASSERT_INPUTS_SCRIPT="$SCRIPT_DIR/assert-release-inputs-clean.sh"
CREATE_DESCRIPTOR_SCRIPT="$SCRIPT_DIR/create-release-artifacts.mjs"
PUBLISH_SCRIPT="$SCRIPT_DIR/publish-release.sh"

for command in git node bash; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done
for required in \
  "$ASSIGN_VERSION_SCRIPT" \
  "$ASSERT_INPUTS_SCRIPT" \
  "$CREATE_DESCRIPTOR_SCRIPT" \
  "$PUBLISH_SCRIPT"; do
  [[ -f "$required" ]] || { echo "Missing release helper: $required" >&2; exit 1; }
done

CURRENT_BRANCH="$(git -C "$UVC_ROOT" branch --show-current)"
REF="${REF:-$CURRENT_BRANCH}"
INPUT_ARGS=(--ref "$REF")
if [[ "$ALLOW_DIRTY_INPUTS" == true ]]; then
  INPUT_ARGS+=(--allow-dirty-inputs)
fi
if [[ "$SKIP_PROVENANCE_CHECK" == true ]]; then
  echo "Skipping git provenance checks for validation-only dry run." >&2
else
  bash "$ASSERT_INPUTS_SCRIPT" "${INPUT_ARGS[@]}"
fi

if [[ -n "$VERSION_OVERRIDE" ]]; then
  VERSION="$VERSION_OVERRIDE"
elif [[ "$ALLOW_SAME_VERSION" == true ]]; then
  VERSION_READ_JSON="$(node "$ASSIGN_VERSION_SCRIPT" --json)"
  VERSION="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value.localVersion || ""));' "$VERSION_READ_JSON")"
  if [[ -z "$VERSION" ]]; then
    echo "Could not determine the synchronized local UVC version." >&2
    exit 1
  fi
else
  VERSION_WRITE_JSON="$(node "$ASSIGN_VERSION_SCRIPT" --write --json)"
  VERSION="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value.assignedVersion || ""));' "$VERSION_WRITE_JSON")"
  if [[ -z "$VERSION" ]]; then
    echo "Could not determine the next UVC release version." >&2
    exit 1
  fi
  VERSION_WROTE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value.wrote));' "$VERSION_WRITE_JSON")"
  if [[ "$VERSION_WROTE" == true ]]; then
    echo "Assigned and synchronized UVC release version: $VERSION" >&2
    echo "Updated package versions:" >&2
    echo "  packages/uvc.cube/package.json" >&2
    echo "  packages/uvc.cube/package-lock.json" >&2
    echo "  packages/uvc.groov/package.json" >&2
    echo "  packages/uvc.groov/package-lock.json" >&2
    echo "  package-lock.json" >&2
    echo "Commit and push the version change, build the release artifacts, then rerun this command." >&2
    exit 1
  fi
fi

VERSION_ASSERT_ARGS=(
  --assert-version "$VERSION"
  --channel "$CHANNEL"
)
if [[ "$ALLOW_SAME_VERSION" == true ]]; then
  VERSION_ASSERT_ARGS+=(--allow-same-version)
fi
node "$ASSIGN_VERSION_SCRIPT" "${VERSION_ASSERT_ARGS[@]}" >/dev/null

ARTIFACTS_FILE="${ARTIFACTS_FILE:-$UVC_ROOT/release/$VERSION/uvc-release-artifacts.json}"
ARTIFACTS_FILE="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$ARTIFACTS_FILE")"

TEMP_DIR=""
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

if [[ "$USE_EXISTING_DESCRIPTOR" == true ]]; then
  [[ -f "$ARTIFACTS_FILE" ]] || {
    echo "Existing artifact descriptor does not exist: $ARTIFACTS_FILE" >&2
    exit 1
  }
else
  WINDOWS_ARTIFACT="${WINDOWS_ARTIFACT:-$UVC_ROOT/packages/uvc.cube/release/UVC-Cube-$VERSION-setup.exe}"
  LINUX_ARTIFACT="${LINUX_ARTIFACT:-$UVC_ROOT/packages/uvc.cube/release/UVC-Cube-$VERSION-x86_64.AppImage}"
  RIO_ARTIFACT="${RIO_ARTIFACT:-$UVC_ROOT/release/$VERSION/uvc-rio-$VERSION.tar.gz}"
  ESP32_ARTIFACT="${ESP32_ARTIFACT:-$UVC_ROOT/release/$VERSION/uvc-esp32c6-$VERSION.tar.gz}"

  if [[ "$DRY_RUN" == true ]]; then
    TEMP_DIR="$(mktemp -d /tmp/uvc-release-descriptor.XXXXXX)"
    ARTIFACTS_FILE="$TEMP_DIR/uvc-release-artifacts.json"
  else
    mkdir -p "$(dirname "$ARTIFACTS_FILE")"
  fi

  node "$CREATE_DESCRIPTOR_SCRIPT" \
    --version "$VERSION" \
    --windows "$WINDOWS_ARTIFACT" \
    --linux "$LINUX_ARTIFACT" \
    --rio "$RIO_ARTIFACT" \
    --esp32 "$ESP32_ARTIFACT" \
    --output "$ARTIFACTS_FILE" >/dev/null
fi

echo "=== Releasing refinio.one UVC downloads ==="
echo "Ref:        $REF"
echo "Channel:    $CHANNEL"
echo "Version:    $VERSION"
echo "Descriptor: $ARTIFACTS_FILE"
echo "Target:     $REMOTE_HOST"
if [[ "$DRY_RUN" == true ]]; then
  echo "Mode:       validation only"
fi
echo ""

PUBLISH_ARGS=(
  --version "$VERSION"
  --channel "$CHANNEL"
  --host "$REMOTE_HOST"
  --artifacts-file "$ARTIFACTS_FILE"
)
if [[ "$ALLOW_SAME_VERSION" == true ]]; then
  PUBLISH_ARGS+=(--allow-same-version)
fi
if [[ "$DRY_RUN" == true ]]; then
  PUBLISH_ARGS+=(--dry-run)
fi
bash "$PUBLISH_SCRIPT" "${PUBLISH_ARGS[@]}"
