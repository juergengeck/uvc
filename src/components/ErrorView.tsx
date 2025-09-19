import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Themed';
import { Button } from './Button';

interface ErrorViewProps {
    error: Error;
    onRetry?: () => void;
}

const ErrorView: React.FC<ErrorViewProps> = ({ error, onRetry }) => {
    const { t } = useTranslation();
    
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{t('common.error')}</Text>
            <Text style={styles.message}>{error.message}</Text>
            {onRetry && (
                <Button
                    title={t('common.retry')}
                    onPress={onRetry}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    message: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
        opacity: 0.7,
    }
});

export default ErrorView; 