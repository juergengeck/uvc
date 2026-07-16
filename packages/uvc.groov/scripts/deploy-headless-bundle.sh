#!/usr/bin/env bash

set -euo pipefail

groov_target="${GROOV_SSH_TARGET:-dev@rio.local}"
bundle_path="${GROOV_HEADLESS_BUNDLE:-}"
remote_dir="${GROOV_REMOTE_DIR:-/home/dev/uvc}"
service_name="${GROOV_SERVICE_NAME:-uvc-headless.service}"
hardware_device_id="${GROOV_HARDWARE_DEVICE_ID:-rio}"

if [[ ! "$hardware_device_id" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "GROOV_HARDWARE_DEVICE_ID contains unsupported characters" >&2
  exit 2
fi

if [[ -z "$bundle_path" || ! -f "$bundle_path" ]]; then
  echo "Set GROOV_HEADLESS_BUNDLE to the built VGER headless bundle.mjs" >&2
  exit 2
fi

node --check "$bundle_path"

staged_name="uvc-headless.staged.mjs"
scp -q "$bundle_path" "$groov_target:$remote_dir/$staged_name"

ssh "$groov_target" "REMOTE_DIR='$remote_dir' SERVICE_NAME='$service_name' STAGED_NAME='$staged_name' HARDWARE_DEVICE_ID='$hardware_device_id' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

cd "$REMOTE_DIR"
node --check "$STAGED_NAME"

stamp="$(date +%Y%m%d-%H%M%S)"
bundle="uvc-headless.mjs"
unit="uvc-headless.service"
bundle_backup="$bundle.rollback-$stamp"
unit_backup="$unit.rollback-$stamp"

cp "$bundle" "$bundle_backup"
cp "$unit" "$unit_backup"
mv "$STAGED_NAME" "$bundle"

ensure_flag() {
  local flag="$1"
  local value="${2:-}"
  if grep -q -- "$flag" "$unit"; then
    if [[ -n "$value" ]]; then
      sed -i "/^ExecStart=/ s|$flag [^ ]*|$flag $value|" "$unit"
    fi
    return
  fi
  sed -i "/^ExecStart=/ s|$| $flag${value:+ $value}|" "$unit"
}

ensure_flag --device-type groov
ensure_flag --storage ./uvc-data
ensure_flag --uvc-provisioning-state ./uvc-provisioning-state.json
ensure_flag --no-whatsapp
ensure_flag --no-embeddings
ensure_flag --no-seller-services

# Instance identity is derived from the ONE instance name. A display-label flag
# must never be added here; rename the Device through instance.updateName.
sed -i '/^ExecStart=/ s/ --name [^ ]*//' "$unit"
if grep -q '^Environment=UVC_HARDWARE_DEVICE_ID=' "$unit"; then
  sed -i "s/^Environment=UVC_HARDWARE_DEVICE_ID=.*/Environment=UVC_HARDWARE_DEVICE_ID=$HARDWARE_DEVICE_ID/" "$unit"
else
  sed -i "/^\[Service\]$/a Environment=UVC_HARDWARE_DEVICE_ID=$HARDWARE_DEVICE_ID" "$unit"
fi

sudo cp "$unit" "/etc/systemd/system/$SERVICE_NAME"
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE_NAME"

stable_pid=""
stable_ready_count=0
for _ in $(seq 1 90); do
  current_pid="$(sudo systemctl show "$SERVICE_NAME" --property MainPID --value 2>/dev/null || true)"
  health="$(curl -fsS --max-time 3 http://localhost:3000/health 2>/dev/null || true)"
  if [[ -n "$current_pid" && "$current_pid" != "0" ]] &&
    HEALTH_JSON="$health" node -e '
      try {
        const health = JSON.parse(process.env.HEALTH_JSON || "");
        const auth = health.auth || {};
        process.exit(
          health.ready === true &&
          auth.initialized === true &&
          auth.loggedIn === true &&
          auth.postLoginReady === true &&
          auth.ownerSessionReady === true
            ? 0
            : 1
        );
      } catch {
        process.exit(1);
      }
    '
  then
    if [[ "$current_pid" == "$stable_pid" ]]; then
      stable_ready_count=$((stable_ready_count + 1))
    else
      stable_pid="$current_pid"
      stable_ready_count=1
    fi

    if (( stable_ready_count >= 5 )); then
      echo "Groov headless deployment $stamp is ready on stable PID $stable_pid"
      exit 0
    fi
  else
    stable_pid=""
    stable_ready_count=0
  fi
  sleep 5
done

echo "Groov headless failed readiness; rolling back" >&2
sudo systemctl stop "$SERVICE_NAME" || true
cp "$bundle_backup" "$bundle"
cp "$unit_backup" "$unit"
sudo cp "$unit" "/etc/systemd/system/$SERVICE_NAME"
sudo systemctl daemon-reload
sudo systemctl start "$SERVICE_NAME"
exit 1
REMOTE_SCRIPT
