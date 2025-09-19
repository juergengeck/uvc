import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, Avatar, useTheme } from 'react-native-paper';
import { format } from 'date-fns';

interface ChatBubbleProps {
    message: string;
    timestamp: Date;
    sender: {
        name: string;
        avatar?: string;
    };
    isUser?: boolean;
    style?: StyleProp<ViewStyle>;
}

/**
 * A chat bubble component that displays the message, sender info, and timestamp.
 * Features:
 * - Different styles for user and other participants
 * - Avatar display
 * - Sender name
 * - Timestamp
 * - Customizable container styling
 */
export function ChatBubble({
    message,
    timestamp,
    sender,
    isUser = false,
    style,
}: ChatBubbleProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            flexDirection: isUser ? 'row-reverse' : 'row',
            marginVertical: 8,
            marginHorizontal: 16,
            alignItems: 'flex-end',
        },
        avatar: {
            marginRight: isUser ? 0 : 8,
            marginLeft: isUser ? 8 : 0,
        },
        contentContainer: {
            maxWidth: '70%',
        },
        senderName: {
            fontSize: 12,
            marginBottom: 4,
            color: theme.colors.onSurfaceVariant,
            textAlign: isUser ? 'right' : 'left',
        },
        bubble: {
            padding: 12,
            borderRadius: 16,
            backgroundColor: isUser ? theme.colors.primary : theme.colors.surfaceVariant,
            borderBottomRightRadius: isUser ? 4 : 16,
            borderBottomLeftRadius: isUser ? 16 : 4,
        },
        message: {
            fontSize: 16,
            lineHeight: 20,
            color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
        },
        timestamp: {
            fontSize: 12,
            marginTop: 4,
            color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
            opacity: 0.7,
            textAlign: isUser ? 'right' : 'left',
        },
    });

    return (
        <View style={[styles.container, style]}>
            <Avatar.Image
                size={32}
                source={sender.avatar ? { uri: sender.avatar } : require('@/assets/default-avatar.png')}
                style={styles.avatar}
            />
            <View style={styles.contentContainer}>
                <Text style={styles.senderName}>{sender.name}</Text>
                <View style={styles.bubble}>
                    <Text style={styles.message}>{message}</Text>
                    <Text style={styles.timestamp}>
                        {format(timestamp, 'HH:mm')}
                    </Text>
                </View>
            </View>
        </View>
    );
} 