import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface SnackbarNotificationProps {
    message: string;
    type?: NotificationType;
    onDismiss?: () => void;
    style?: StyleProp<ViewStyle>;
    duration?: number;
}

/**
 * A snackbar notification component that displays messages with different styles based on type.
 * Features:
 * - Different styles for info, success, warning, and error messages
 * - Dismiss button
 * - Auto-dismiss after specified duration
 * - Customizable container styling
 */
export function SnackbarNotification({
    message,
    type = 'info',
    onDismiss,
    style,
    duration = 4000,
}: SnackbarNotificationProps) {
    const theme = useTheme();

    React.useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(onDismiss, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onDismiss]);

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    backgroundColor: theme.colors.primaryContainer,
                    iconColor: theme.colors.onPrimaryContainer,
                    textColor: theme.colors.onPrimaryContainer,
                };
            case 'warning':
                return {
                    backgroundColor: theme.colors.tertiaryContainer,
                    iconColor: theme.colors.onTertiaryContainer,
                    textColor: theme.colors.onTertiaryContainer,
                };
            case 'error':
                return {
                    backgroundColor: theme.colors.errorContainer,
                    iconColor: theme.colors.onErrorContainer,
                    textColor: theme.colors.onErrorContainer,
                };
            default:
                return {
                    backgroundColor: theme.colors.secondaryContainer,
                    iconColor: theme.colors.onSecondaryContainer,
                    textColor: theme.colors.onSecondaryContainer,
                };
        }
    };

    const getTypeIcon = () => {
        switch (type) {
            case 'success':
                return 'check-circle';
            case 'warning':
                return 'alert';
            case 'error':
                return 'alert-circle';
            default:
                return 'information';
        }
    };

    const typeStyles = getTypeStyles();

    const styles = StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: typeStyles.backgroundColor,
            borderRadius: 8,
            padding: 12,
            margin: 16,
            elevation: 6,
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
        },
        icon: {
            marginRight: 8,
        },
        message: {
            flex: 1,
            color: typeStyles.textColor,
            fontSize: 14,
            lineHeight: 20,
        },
    });

    return (
        <View style={[styles.container, style]}>
            <MaterialCommunityIcons
                name={getTypeIcon()}
                size={24}
                color={typeStyles.iconColor}
                style={styles.icon}
            />
            <Text style={styles.message}>{message}</Text>
            {onDismiss && (
                <IconButton
                    icon="close"
                    size={20}
                    iconColor={typeStyles.iconColor}
                    onPress={onDismiss}
                />
            )}
        </View>
    );
} 