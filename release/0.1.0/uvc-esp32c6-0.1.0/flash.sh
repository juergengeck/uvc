#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo "usage: ./flash.sh <serial-port>" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }
cd "$(dirname "$0")"
python3 -m esptool --chip esp32c6 --port "$1" --before default-reset --after hard-reset write-flash --flash-mode dio --flash-size 4MB --flash-freq 80m '0x0' 'firmware/bootloader/bootloader.bin' '0x10000' 'firmware/esp32_quicvc_app.bin' '0x8000' 'firmware/partition_table/partition-table.bin'
