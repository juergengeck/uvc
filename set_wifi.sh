#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${ESP32_PROJECT_DIR:-$SCRIPT_DIR/../vger/packages/esp32.core/firmware/esp32-quicvc-project}"
CONFIG_FILE="$PROJECT_DIR/sdkconfig"
USE_KEYCHAIN=false

if [[ "${1:-}" == "--keychain" ]]; then
    USE_KEYCHAIN=true
    shift
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ESP-IDF configuration not found: $CONFIG_FILE" >&2
    exit 1
fi

SSID="${1:-}"
if [[ -z "$SSID" ]]; then
    CURRENT_SSID="$(sed -n 's/^CONFIG_ESP_WIFI_SSID="\(.*\)"$/\1/p' "$CONFIG_FILE")"
    read -r -p "Enter WiFi SSID${CURRENT_SSID:+ [$CURRENT_SSID]}: " SSID
    SSID="${SSID:-$CURRENT_SSID}"
fi

if [[ -z "$SSID" ]]; then
    echo "WiFi SSID must not be empty" >&2
    exit 1
fi

if $USE_KEYCHAIN; then
    if PASSWORD="$(security find-generic-password -D "AirPort network password" -a "$SSID" -w 2>/dev/null)"; then
        :
    elif PASSWORD="$(security find-generic-password -a "$SSID" -w 2>/dev/null)"; then
        :
    else
        echo "No Keychain credential found for WiFi network '$SSID'" >&2
        exit 1
    fi
else
    read -r -s -p "Enter WiFi Password: " PASSWORD
    echo
fi

if [[ -z "$PASSWORD" ]]; then
    echo "WiFi password must not be empty" >&2
    exit 1
fi

kconfig_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    printf '%s' "$value"
}

SSID_ESCAPED="$(kconfig_escape "$SSID")"
PASSWORD_ESCAPED="$(kconfig_escape "$PASSWORD")"
TEMP_CONFIG="$(mktemp "$CONFIG_FILE.tmp.XXXXXX")"
trap 'rm -f "$TEMP_CONFIG"' EXIT

SSID_WRITTEN=false
PASSWORD_WRITTEN=false
while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
        CONFIG_ESP_WIFI_SSID=*)
            printf 'CONFIG_ESP_WIFI_SSID="%s"\n' "$SSID_ESCAPED" >> "$TEMP_CONFIG"
            SSID_WRITTEN=true
            ;;
        CONFIG_ESP_WIFI_PASSWORD=*)
            printf 'CONFIG_ESP_WIFI_PASSWORD="%s"\n' "$PASSWORD_ESCAPED" >> "$TEMP_CONFIG"
            PASSWORD_WRITTEN=true
            ;;
        *)
            printf '%s\n' "$line" >> "$TEMP_CONFIG"
            ;;
    esac
done < "$CONFIG_FILE"

$SSID_WRITTEN || printf 'CONFIG_ESP_WIFI_SSID="%s"\n' "$SSID_ESCAPED" >> "$TEMP_CONFIG"
$PASSWORD_WRITTEN || printf 'CONFIG_ESP_WIFI_PASSWORD="%s"\n' "$PASSWORD_ESCAPED" >> "$TEMP_CONFIG"

chmod "$(stat -f '%Lp' "$CONFIG_FILE")" "$TEMP_CONFIG"
mv "$TEMP_CONFIG" "$CONFIG_FILE"
trap - EXIT
unset PASSWORD PASSWORD_ESCAPED

echo "WiFi configured for SSID: $SSID"
echo "Firmware configuration: $CONFIG_FILE"
