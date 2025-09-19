import React from 'react';
import { Stack } from 'expo-router';
import { TestQuicVCScreen } from '@src/screens/TestQuicVCScreen';

export default function QuicVCTestRoute() {
    return (
        <>
            <Stack.Screen 
                options={{
                    title: 'QUICVC Test',
                    headerShown: true,
                }}
            />
            <TestQuicVCScreen />
        </>
    );
}