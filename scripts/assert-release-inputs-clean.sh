#!/usr/bin/env bash
set -euo pipefail

ALLOW_DIRTY_INPUTS=false
REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty-inputs) ALLOW_DIRTY_INPUTS=true; shift ;;
    --ref) REF="${2:?missing ref}"; shift 2 ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--ref branch] [--allow-dirty-inputs]" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UVC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_ROOT="$(cd "$UVC_ROOT/.." && pwd)"

check_git_input() {
  local repo_dir="$1"
  local label="$2"
  local requested_ref="${3:-}"

  if [[ ! -d "$repo_dir/.git" && ! -f "$repo_dir/.git" ]]; then
    echo "Release input $label is not a git checkout: $repo_dir" >&2
    exit 1
  fi

  local branch
  branch="$(git -C "$repo_dir" branch --show-current)"
  local ref="${requested_ref:-$branch}"
  local status
  status="$(git -C "$repo_dir" status --porcelain --untracked-files=normal)"
  if [[ -n "$status" ]]; then
    if [[ "$ALLOW_DIRTY_INPUTS" == true ]]; then
      echo "Continuing with dirty $label because --allow-dirty-inputs was passed." >&2
    else
      echo "Refusing to release with dirty $label checkout: $repo_dir" >&2
      echo "$status" >&2
      echo "Commit or stash local changes first. Release inputs must match pushed git state." >&2
      exit 1
    fi
  fi

  if [[ -z "$ref" ]]; then
    echo "Release input $label is detached; checkout a branch and push it before release." >&2
    exit 1
  fi

  local remote_head
  remote_head="$(git -C "$repo_dir" ls-remote --heads origin "$ref" | awk '{print $1}' | head -n 1)"
  if [[ -z "$remote_head" ]]; then
    echo "Remote branch origin/$ref does not exist for $label." >&2
    echo "Push $label first, then rerun the release." >&2
    exit 1
  fi

  local local_head
  local_head="$(git -C "$repo_dir" rev-parse HEAD)"
  if [[ "$local_head" != "$remote_head" ]]; then
    echo "$label HEAD is not pushed to origin/$ref." >&2
    echo "  local:  $local_head" >&2
    echo "  remote: $remote_head" >&2
    echo "Push $label first so the published artifacts have reproducible source inputs." >&2
    exit 1
  fi
}

for command in git awk; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

check_git_input "$UVC_ROOT" "uvc" "$REF"
check_git_input "$SOURCE_ROOT/one" "one" ""
check_git_input "$SOURCE_ROOT/vger" "vger" ""
check_git_input "$SOURCE_ROOT/refinio" "refinio.one publisher" ""
