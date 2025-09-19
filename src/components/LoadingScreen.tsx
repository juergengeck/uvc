import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';

interface LoadingScreenProps {
    style?: any;
}

/**
 * A full-screen loading indicator
 * 
 * @component
 */
export default function LoadingScreen({ style }: LoadingScreenProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.colors.background,
        },
        spinner: {
            transform: [{ scale: 1.5 }],
        },
    });

    return (
        <View style={[styles.container, style]}>
            <ActivityIndicator size="large" style={styles.spinner} />
        </View>
    );
} 