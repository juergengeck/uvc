import React from 'react';
import { Stack, useRouter, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, IconButton } from 'react-native-paper';
import { View } from 'react-native';
import { SettingsProvider } from '@src/providers/app/SettingsProvider';
import { OneProvider } from '@src/providers/app/OneProvider';
import { getAuthenticator } from '@src/initialization';
import { useEffect, useState } from 'react';

console.log('[ScreensLayout] Rendering screens layout');

export default function ScreensLayout() {
    const { t } = useTranslation();
    const theme = useTheme();
    const router = useRouter();
    const [authenticator, setAuthenticator] = useState(getAuthenticator());
    const [ready, setReady] = useState(false);
    
    // Ensure we have an authenticator and it's in the logged_in state
    useEffect(() => {
        const auth = getAuthenticator();
        if (auth) {
            console.log('[ScreensLayout] Got authenticator, current state:', auth.authState.currentState);
            setAuthenticator(auth);
            
            // Check if already logged in
            if (auth.authState.currentState === 'logged_in') {
                setReady(true);
            }
            
            // Listen for auth state changes
            const unsubscribe = auth.authState.onStateChange.listen((_, newState) => {
                console.log(`[ScreensLayout] Auth state changed to: ${newState}`);
                setReady(newState === 'logged_in');
            });
            
            return () => unsubscribe();
        } else {
            // If no auth, this route shouldn't be accessible
            console.error('[ScreensLayout] No authenticator available, navigating to auth');
            router.replace('/(auth)');
        }
    }, [router]);
    
    // Immediately redirect to auth if not ready - no spinner
    if (!ready || !authenticator) {
        console.log('[ScreensLayout] Not ready or no authenticator, redirecting to auth');
        return <Redirect href="/(auth)" />;
    }
    
    // Once ready, render screens with OneProvider and SettingsProvider
    return (
        <OneProvider authenticator={authenticator}>
            <SettingsProvider>
                <Stack
                    screenOptions={{
                        headerShown: true,
                        headerStyle: {
                            backgroundColor: theme.colors.background,
                        },
                        headerTintColor: theme.colors.onSurface,
                        headerTitleAlign: 'center',
                        headerTitleStyle: {
                            fontWeight: '600',
                        },
                        headerShadowVisible: false,
                        headerBackVisible: true,
                        contentStyle: {
                            backgroundColor: theme.colors.background,
                        },
                        gestureEnabled: true,
                        animation: 'slide_from_right',
                        headerRight: () => (
                            <IconButton
                                icon="home"
                                onPress={() => router.push('/(tabs)/home')}
                                size={24}
                                style={{ margin: 0, marginRight: -8 }}
                                iconColor={theme.colors.onSurface}
                            />
                        ),
                    }}
                >
                    <Stack.Screen
                        name="settings"
                        options={{
                            headerTitle: t('settings:settings.title'),
                        }}
                    />
                    

                    <Stack.Screen
                        name="edit-profile"
                        options={{
                            headerTitle: t('settings:settings.user.profile.edit'),
                            headerLargeTitle: false,
                        }}
                    />

                    <Stack.Screen
                        name="language-selection"
                        options={{
                            headerTitle: t('settings:settings.language.title'),
                            headerLargeTitle: false,
                        }}
                    />

                    <Stack.Screen
                        name="data-management"
                        options={{
                            headerTitle: t('settings:settings.dataManagement.title'),
                            headerLargeTitle: false,
                        }}
                    />

                    <Stack.Screen
                        name="about"
                        options={{
                            headerTitle: t('settings:settings.about.title'),
                            headerLargeTitle: false,
                        }}
                    />

                    <Stack.Screen
                        name="ai-settings"
                        options={{
                            headerTitle: t('settings:settings.ai.title'),
                        }}
                    />

                    <Stack.Screen
                        name="network"
                        options={{
                            headerShown: false,
                        }}
                    />

                    <Stack.Screen
                        name="debug-settings"
                        options={{
                            headerTitle: 'Debug Settings',
                        }}
                    />

                    <Stack.Screen
                        name="consent"
                        options={{
                            headerTitle: t('settings:settings.consent.title'),
                            headerLargeTitle: false,
                        }}
                    />

                    <Stack.Screen
                        name="calendar"
                        options={{
                            headerTitle: t('calendar:title'),
                            headerLargeTitle: false,
                            headerRight: () => (
                                <View style={{ flexDirection: 'row' }}>
                                    <IconButton
                                        icon="home"
                                        onPress={() => router.push('/(tabs)/')}
                                        size={24}
                                        style={{ margin: 0, marginRight: 8 }}
                                    />
                                    <IconButton
                                        icon="notebook"
                                        onPress={() => router.push('/(tabs)/journal')}
                                        size={24}
                                        style={{ margin: 0, marginRight: -8 }}
                                    />
                                </View>
                            ),
                        }}
                    />
                    
                    {/* Contact screens */}
                    <Stack.Screen
                        name="contacts/add-contact"
                        options={{
                            headerTitle: t('contacts:add_contact.title'),
                            headerLargeTitle: false,
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                        }}
                    />

                    <Stack.Screen
                        name="contacts/share-contact"
                        options={{
                            headerTitle: t('contacts:share_contact.title'),
                            headerLargeTitle: false,
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                        }}
                    />

                    <Stack.Screen
                        name="contacts/invite"
                        options={{
                            headerTitle: t('contacts:invite.title', { defaultValue: 'Invite' }),
                            headerLargeTitle: false,
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                        }}
                    />
                    
                    <Stack.Screen
                        name="contacts/[id]"
                        options={{
                            headerLargeTitle: false,
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                        }}
                    />
                    
                    {/* Chat routes with proper layout group for handling dynamic segments */}
                    <Stack.Screen
                        name="chat"
                        options={{
                            headerShown: false,
                        }}
                    />
                    
                    <Stack.Screen
                        name="udp-diagnostic"
                        options={{
                            headerTitle: "ESP32 UDP Diagnostics",
                            headerLargeTitle: false,
                            animation: 'slide_from_bottom',
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                            headerRight: () => (
                                <IconButton
                                    icon="home"
                                    onPress={() => router.push('/(tabs)/')}
                                    size={24}
                                    style={{ margin: 0, marginRight: -8 }}
                                />
                            ),
                        }}
                    />
                    
                    {/* Topic screens */}
                    <Stack.Screen
                        name="topics/new"
                        options={{
                            headerTitle: t('topics:new', { defaultValue: 'New Topic' }),
                            headerLargeTitle: false,
                            headerLeft: () => (
                                <IconButton
                                    icon="arrow-left"
                                    onPress={() => router.back()}
                                    size={24}
                                    style={{ margin: 0 }}
                                />
                            ),
                        }}
                    />
                </Stack>
            </SettingsProvider>
        </OneProvider>
    );
} 