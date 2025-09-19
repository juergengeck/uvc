#!/bin/bash

# Monitor communications between two Lama simulators
# Focus on message transfer, access rights, and channel operations

echo "🔍 LAMA DUAL SIMULATOR COMMUNICATION MONITOR"
echo "=============================================="
echo "📱 Device 1: iPhone 16 Pro (F4C6B2B0)"  
echo "📱 Device 2: iPhone 16 (57FBA72A)"
echo ""
echo "🎯 Monitoring for:"
echo "   ✅ applyChatChannelAccessRights - Access rights application"
echo "   🏠 enterTopicRoom - Topic room entry"
echo "   👥 getParticipants - Participant retrieval"
echo "   📨 postToChannel - Message sending"
echo "   📥 Message transfer events"
echo "   🔗 Channel operations"
echo "   🤝 Connection events"
echo "   ❌ Error conditions"
echo ""

# Function to format device logs
format_device_log() {
    local device_id=$1
    local device_name=$2
    local color_code=$3
    
    while IFS= read -r line; do
        # Filter for relevant Lama logs
        if [[ $line =~ (applyChatChannelAccessRights|enterTopicRoom|getParticipants|postToChannel|ChannelManager|TopicRoom|Message|Connection|Error|CHUM|WebSocket|Invitation) ]]; then
            timestamp=$(date '+%H:%M:%S.%3N')
            echo -e "\033[${color_code}m[$timestamp] $device_name:\033[0m $line"
        fi
    done
}

# Function to monitor a specific simulator
monitor_device() {
    local device_id=$1
    local device_name=$2
    local color_code=$3
    
    # Use Metro logs for better React Native log capture
    npx react-native log-ios --simulator=$device_id 2>/dev/null | format_device_log "$device_id" "$device_name" "$color_code" &
}

echo "🚀 Starting monitoring..."

# Start monitoring both devices
monitor_device "F4C6B2B0-431C-4D0D-9736-FE76606350BB" "📱 iPhone 16 Pro" "36"  # Cyan
monitor_device "57FBA72A-C551-45AE-AFD8-4EA2DEB18CD8" "📱 iPhone 16" "35"      # Magenta

# Keep the script running
echo "📊 Monitoring active. Press Ctrl+C to stop."
echo ""

# Wait for user to stop
wait 