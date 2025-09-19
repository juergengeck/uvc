import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface InputToolbarProps {
    onSend: (text: string) => void;
    placeholder?: string;
    style?: StyleProp<ViewStyle>;
    disabled?: boolean;
}

/**
 * A chat input toolbar component with a text input and send button.
 * Features:
 * - Text input with placeholder
 * - Send button that appears when there's text
 * - Disabled state
 * - Customizable container styling
 */
export function InputToolbar({
    onSend,
    placeholder = 'Type a message...',
    style,
    disabled = false,
}: InputToolbarProps) {
    const [text, setText] = useState('');
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.outlineVariant,
        },
        input: {
            flex: 1,
            marginRight: 8,
            backgroundColor: theme.colors.surfaceVariant,
            borderRadius: 20,
        },
        sendButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: text.trim().length > 0 ? 1 : 0.5,
        },
    });

    const handleSend = () => {
        const trimmedText = text.trim();
        if (trimmedText && !disabled) {
            onSend(trimmedText);
            setText('');
        }
    };

    return (
        <View style={[styles.container, style]}>
            <TextInput
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                mode="flat"
                disabled={disabled}
                style={styles.input}
                multiline
                maxLength={1000}
                dense
            />
            <TouchableOpacity
                onPress={handleSend}
                disabled={!text.trim() || disabled}
                style={styles.sendButton}
            >
                <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color={theme.colors.onPrimary}
                />
            </TouchableOpacity>
        </View>
    );
} 