#!/bin/bash
echo "Enter WiFi SSID:"
read SSID
echo "Enter WiFi Password:"
read -s PASSWORD

# Update sdkconfig.defaults
sed -i '' "s/CONFIG_ESP_WIFI_SSID=.*/CONFIG_ESP_WIFI_SSID=\"$SSID\"/" sdkconfig.defaults
sed -i '' "s/CONFIG_ESP_WIFI_PASSWORD=.*/CONFIG_ESP_WIFI_PASSWORD=\"$PASSWORD\"/" sdkconfig.defaults

# Save to wifi_config.tmp for reference
echo "CONFIG_ESP_WIFI_SSID=\"$SSID\"" > wifi_config.tmp
echo "CONFIG_ESP_WIFI_PASSWORD=\"$PASSWORD\"" >> wifi_config.tmp
echo "" >> wifi_config.tmp

echo "WiFi configured for SSID: $SSID"
echo "Now rebuild and flash with: idf.py fullclean && idf.py build && idf.py flash"