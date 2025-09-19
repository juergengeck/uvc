import type {ReactElement} from 'react';
import {Image, View} from 'react-native';
import {useEffect} from 'react';
import { router } from 'expo-router';
import { ActivityIndicator } from 'react-native-paper';
import { useTheme } from '@src/providers/app/AppTheme';

const headerImage = require('../../src/assets/images/lama.one.png');

export default function WelcomePage(): ReactElement {
    const { theme } = useTheme();

    useEffect(() => {
        // Short delay to ensure layout initialization is complete
        const timer = setTimeout(() => {
            router.replace('/(auth)/login');
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={{ 
            flex: 1, 
            backgroundColor: theme.colors.background,
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <Image 
                source={headerImage} 
                style={{ 
                    width: 240, 
                    height: 240, 
                    resizeMode: 'contain',
                    marginBottom: 32 
                }}
            />
            <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
    );
} 