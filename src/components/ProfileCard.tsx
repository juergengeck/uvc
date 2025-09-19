import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text, Surface, useTheme, Badge } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ProfileCardProps {
    name: string;
    email: string;
    role: string;
    imageUrl?: string;
    isOnline?: boolean;
    lastSeen?: string;
    onPress?: () => void;
}

/**
 * A card component that displays user profile information
 * 
 * @component
 */
export default function ProfileCard({
    name,
    email,
    role,
    imageUrl,
    isOnline,
    lastSeen,
    onPress
}: ProfileCardProps) {
    const theme = useTheme();

    const styles = StyleSheet.create({
        container: {
            margin: 16,
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
        imageContainer: {
            position: 'relative',
            marginRight: 16,
        },
        image: {
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: theme.colors.surfaceVariant,
        },
        onlineBadge: {
            position: 'absolute',
            bottom: 0,
            right: 0,
            backgroundColor: theme.colors.primary,
        },
        offlineBadge: {
            position: 'absolute',
            bottom: 0,
            right: 0,
            backgroundColor: theme.colors.error,
        },
        info: {
            flex: 1,
        },
        name: {
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.onSurface,
            marginBottom: 4,
        },
        email: {
            fontSize: 14,
            color: theme.colors.onSurfaceVariant,
            marginBottom: 4,
        },
        role: {
            fontSize: 12,
            color: theme.colors.onSurfaceVariant,
        },
        lastSeen: {
            fontSize: 12,
            color: theme.colors.onSurfaceVariant,
            marginTop: 4,
        },
    });

    return (
        <View style={styles.container}>
            <Surface style={styles.surface}>
                <View style={styles.header}>
                    <View style={styles.imageContainer}>
                        {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.image} />
                        ) : (
                            <MaterialCommunityIcons
                                name="account-circle"
                                size={60}
                                color={theme.colors.onSurfaceVariant}
                            />
                        )}
                        {isOnline !== undefined && (
                            <Badge
                                size={12}
                                style={isOnline ? styles.onlineBadge : styles.offlineBadge}
                            />
                        )}
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.email}>{email}</Text>
                        <Text style={styles.role}>{role}</Text>
                        {lastSeen && (
                            <Text style={styles.lastSeen}>
                                Last seen: {lastSeen}
                            </Text>
                        )}
                    </View>
                </View>
            </Surface>
        </View>
    );
}