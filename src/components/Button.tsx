import React from 'react';
import { StyleSheet, TouchableOpacity, View, ActivityIndicator, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface ButtonProps {
    onPress: () => void;
    title: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    loading?: boolean;
    mode?: 'contained' | 'outlined';
    icon?: IconName;
    iconPosition?: 'left' | 'right';
    iconSize?: number;
    iconColor?: string;
    contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * A standardized button component that follows our design system.
 * Features:
 * - Contained and outlined variants
 * - Loading state with spinner
 * - Icon support (using MaterialCommunityIcons)
 * - Customizable text and icon styling
 * - Flexible content layout
 */
export function Button({
    onPress,
    title,
    disabled = false,
    style,
    textStyle,
    loading = false,
    mode = 'contained',
    icon,
    iconPosition = 'left',
    iconSize = 20,
    iconColor,
    contentContainerStyle
}: ButtonProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        button: {
            minHeight: 48,
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: disabled ? 0.5 : 1,
        },
        buttonContained: {
            backgroundColor: theme.colors.primary,
        },
        buttonOutlined: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: theme.colors.primary,
        },
        contentContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        icon: {
            marginRight: iconPosition === 'left' ? 8 : 0,
            marginLeft: iconPosition === 'right' ? 8 : 0,
        },
        text: {
            fontSize: 16,
            fontWeight: '500',
            textAlign: 'center',
        },
        textContained: {
            color: theme.colors.onPrimary,
        },
        textOutlined: {
            color: theme.colors.primary,
        },
    });

    const buttonStyles = [
        styles.button,
        mode === 'contained' ? styles.buttonContained : styles.buttonOutlined,
        style,
    ];

    const textStyles = [
        styles.text,
        mode === 'contained' ? styles.textContained : styles.textOutlined,
        textStyle,
    ];

    const defaultIconColor = mode === 'contained' ? theme.colors.onPrimary : theme.colors.primary;

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            style={buttonStyles}
        >
            <View style={[styles.contentContainer, contentContainerStyle]}>
                {loading ? (
                    <ActivityIndicator
                        color={mode === 'contained' ? theme.colors.onPrimary : theme.colors.primary}
                    />
                ) : (
                    <>
                        {icon && iconPosition === 'left' && (
                            <MaterialCommunityIcons
                                name={icon}
                                size={iconSize}
                                color={iconColor || defaultIconColor}
                                style={styles.icon}
                            />
                        )}
                        <Text style={textStyles}>{title}</Text>
                        {icon && iconPosition === 'right' && (
                            <MaterialCommunityIcons
                                name={icon}
                                size={iconSize}
                                color={iconColor || defaultIconColor}
                                style={styles.icon}
                            />
                        )}
                    </>
                )}
            </View>
        </TouchableOpacity>
    );
}

export default Button; 
