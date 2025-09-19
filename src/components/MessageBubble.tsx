import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { format } from 'date-fns';

interface MessageBubbleProps {
    message: string;
    timestamp: Date;
    isUser?: boolean;
    style?: StyleProp<ViewStyle>;
}

/**
 * A chat message bubble component that displays the message content and timestamp.
 * Features:
 * - Different styles for user and other participants
 * - Timestamp display
 * - Customizable container styling
 */
export function MessageBubble({ message, timestamp, isUser = false, style }: MessageBubbleProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            maxWidth: '80%',
            padding: 12,
            borderRadius: 16,
            marginVertical: 4,
        },
        userMessage: {
            alignSelf: 'flex-end',
            backgroundColor: theme.colors.primary,
            borderBottomRightRadius: 4,
        },
        otherMessage: {
            alignSelf: 'flex-start',
            backgroundColor: theme.colors.surfaceVariant,
            borderBottomLeftRadius: 4,
        },
        messageText: {
            fontSize: 16,
            lineHeight: 20,
        },
        userMessageText: {
            color: theme.colors.onPrimary,
        },
        otherMessageText: {
            color: theme.colors.onSurfaceVariant,
        },
        timestamp: {
            fontSize: 12,
            marginTop: 4,
            opacity: 0.7,
        },
        userTimestamp: {
            color: theme.colors.onPrimary,
        },
        otherTimestamp: {
            color: theme.colors.onSurfaceVariant,
        },
    });

    const containerStyle = [
        styles.container,
        isUser ? styles.userMessage : styles.otherMessage,
        style,
    ];

    const textStyle = [
        styles.messageText,
        isUser ? styles.userMessageText : styles.otherMessageText,
    ];

    const timestampStyle = [
        styles.timestamp,
        isUser ? styles.userTimestamp : styles.otherTimestamp,
    ];

    return (
        <View style={containerStyle}>
            <Text style={textStyle}>{message}</Text>
            <Text style={timestampStyle}>
                {format(timestamp, 'HH:mm')}
            </Text>
        </View>
    );
} 