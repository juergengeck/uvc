import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

interface StatisticsCardProps {
    title: string;
    value: string | number;
    icon?: keyof typeof MaterialIcons.glyphMap;
    description?: string;
}

/**
 * A card component that displays statistics with an icon and description
 * 
 * @component
 */
export default function StatisticsCard({
    title,
    value,
    icon = 'trending-up',
    description
}: StatisticsCardProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            margin: 8,
            borderRadius: 12,
            overflow: 'hidden',
        },
        surface: {
            padding: 16,
            backgroundColor: theme.colors.surface,
            elevation: 1,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
        },
        iconContainer: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.primaryContainer,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
        },
        title: {
            fontSize: 14,
            color: theme.colors.onSurfaceVariant,
        },
        value: {
            fontSize: 24,
            fontWeight: '600',
            color: theme.colors.onSurface,
            marginBottom: 4,
        },
        description: {
            fontSize: 12,
            color: theme.colors.onSurfaceVariant,
        },
    });

    return (
        <View style={styles.container}>
            <Surface style={styles.surface}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <MaterialIcons
                            name={icon}
                            size={24}
                            color={theme.colors.primary}
                        />
                    </View>
                    <Text style={styles.title}>{title}</Text>
                </View>
                <Text style={styles.value}>{value}</Text>
                {description && (
                    <Text style={styles.description}>{description}</Text>
                )}
            </Surface>
        </View>
    );
}