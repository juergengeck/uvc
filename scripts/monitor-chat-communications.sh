#!/bin/bash

# Monitor chat communications between two Lama simulators
# Focus on access rights, topic rooms, and message transfer

echo "🔍 Monitoring Chat Communications Between Simulators"
echo "=================================================="
echo "📱 Device 1: iPhone 16 Pro (F4C6B2B0)"  
echo "📱 Device 2: iPhone 15 Pro (5F9D62CE)"
echo ""
echo "🎯 Watching for:"
echo "   ✅ applyChatChannelAccessRights - Access rights being applied"
echo "   🏠 enterTopicRoom - Entering 1-to-1 chat rooms"  
echo "   👥 getParticipants - Getting chat participants"
echo "   📨 postToChannel - Messages being sent"
echo "   🔗 ChannelManager - Channel operations"
echo "   💬 Message transfer events"
echo ""

# Function to format and filter logs
format_log() {
    local prefix=$1
    while IFS= read -r line; do
        # Extract timestamp and message
        timestamp=$(date '+%H:%M:%S.%3N')
        
        # Filter for key communication events
        if [[ $line =~ applyChatChannelAccessRights ]]; then
            echo "[$prefix] $timestamp ✅ ACCESS_RIGHTS: $line"
        elif [[ $line =~ enterTopicRoom ]]; then
            echo "[$prefix] $timestamp 🏠 ENTER_TOPIC: $line"
        elif [[ $line =~ getParticipants ]]; then
            echo "[$prefix] $timestamp 👥 PARTICIPANTS: $line"
        elif [[ $line =~ (postToChannel|sendMessage) ]]; then
            echo "[$prefix] $timestamp 📨 SEND_MSG: $line"
        elif [[ $line =~ (ChannelManager|CHANNEL_) ]]; then
            echo "[$prefix] $timestamp 🔗 CHANNEL: $line"
        elif [[ $line =~ (Message.*received|Message.*sent) ]]; then
            echo "[$prefix] $timestamp 💬 MESSAGE: $line"
        elif [[ $line =~ (Connection|WebSocket|CHUM) ]]; then
            echo "[$prefix] $timestamp 🌐 NETWORK: $line"
        elif [[ $line =~ (TopicRoom|Topic) ]]; then
            echo "[$prefix] $timestamp 🗂️  TOPIC: $line"
        elif [[ $line =~ (createAccess|Access.*rights) ]]; then
            echo "[$prefix] $timestamp 🔐 ACCESS: $line"
        fi
    done
}

# Monitor React Native logs (covers both simulators)
echo "🚀 Starting React Native log monitoring..."
npx react-native log-ios 2>/dev/null | format_log "RN" &

# Monitor device-specific logs for iPhone 16 Pro
echo "📱 Starting iPhone 16 Pro log monitoring..."
xcrun simctl spawn F4C6B2B0-431C-4D0D-9736-FE76606350BB log stream --predicate 'category CONTAINS "lama" OR category CONTAINS "Lama"' --style compact 2>/dev/null | format_log "16PRO" &

# Monitor device-specific logs for iPhone 15 Pro  
echo "📱 Starting iPhone 15 Pro log monitoring..."
xcrun simctl spawn 5F9D62CE-2AD2-41F7-AE03-1EEA15943361 log stream --predicate 'category CONTAINS "lama" OR category CONTAINS "Lama"' --style compact 2>/dev/null | format_log "15PRO" &

echo ""
echo "✅ Monitoring active! Now:"
echo "1. Open both simulators"
echo "2. Pair the devices using QR codes"
echo "3. Start a 1-to-1 chat"
echo "4. Send messages between devices"
echo ""
echo "🛑 Press Ctrl+C to stop monitoring"

# Keep script running
trap 'echo "🛑 Stopping monitoring..."; kill $(jobs -p) 2>/dev/null; exit' INT
wait 