#!/bin/bash

# Monitor communications between two iOS simulators running Lama
# This script will show logs from both devices side by side

echo "🔍 Starting dual simulator monitoring..."
echo "📱 iPhone 16 Pro: F4C6B2B0-431C-4D0D-9736-FE76606350BB"
echo "📱 iPhone 15 Pro: 5F9D62CE-2AD2-41F7-AE03-1EEA15943361"
echo ""

# Function to monitor a specific simulator
monitor_device() {
    local device_id=$1
    local device_name=$2
    local prefix=$3
    
    echo "Starting monitoring for $device_name..."
    xcrun simctl spawn $device_id log stream --predicate 'subsystem CONTAINS "com.apple.console"' --style compact 2>/dev/null | \
    while IFS= read -r line; do
        # Filter for Lama app logs and important communication events
        if [[ $line =~ (Lama|lama|CHUM|Channel|Topic|Message|Connection|WebSocket|Invitation|Access|Rights) ]]; then
            echo "[$prefix] $(date '+%H:%M:%S') $line"
        fi
    done &
}

# Start monitoring both devices
monitor_device "F4C6B2B0-431C-4D0D-9736-FE76606350BB" "iPhone 16 Pro" "📱16PRO" &
monitor_device "5F9D62CE-2AD2-41F7-AE03-1EEA15943361" "iPhone 15 Pro" "📱15PRO" &

# Also monitor React Native Metro logs for both devices
echo "🚀 Monitoring Metro logs for communication events..."
npx react-native log-ios 2>/dev/null | \
while IFS= read -r line; do
    # Filter for important communication events
    if [[ $line =~ (applyChatChannelAccessRights|enterTopicRoom|getParticipants|createAccess|postToChannel|ChannelManager|TopicRoom|Message|Connection|WebSocket|CHUM|Invitation) ]]; then
        echo "[🚀METRO] $(date '+%H:%M:%S') $line"
    fi
done &

echo ""
echo "✅ Monitoring started! You should see logs from both devices."
echo "📋 Look for these key events:"
echo "   - applyChatChannelAccessRights: Access rights being applied"
echo "   - enterTopicRoom: Entering 1-to-1 chat rooms"
echo "   - getParticipants: Getting chat participants"
echo "   - postToChannel: Messages being sent"
echo "   - ChannelManager: Channel operations"
echo ""
echo "🛑 Press Ctrl+C to stop monitoring"

# Wait for user to stop
wait 