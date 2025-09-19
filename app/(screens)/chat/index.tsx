import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, FAB, useTheme, TouchableRipple, Button, Card } from 'react-native-paper';
import { useRouter, Stack } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTopics } from '@src/hooks/chat/topicHooks';
import { LoadingSpinner } from '@src/components/LoadingSpinner';

export default function ChatList() {
  const { instance, isAuthenticated, models } = useInstance();
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const theme = useTheme();

  // Use the useTopics hook to get topics with last messages and participant counts
  const topics = useTopics(models?.topicModel, models?.channelManager);

  React.useEffect(() => {
    // Check if all required models are available
    if (isAuthenticated) {
      if (models?.topicModel && models?.channelManager) {
        setIsLoading(false);
      } else {
        setError('Required models not available. Please try again later.');
        setIsLoading(false);
      }
    }
  }, [models, isAuthenticated]);

  // Check if LLMManager is missing specifically for chat initialization
  React.useEffect(() => {
    if (!isLoading && isAuthenticated && !models?.llmManager) {
      console.warn('[ChatList] LLMManager is missing but required for chat functionality');
      setError('AI Model Manager not initialized. Some chat features may be limited.');
    }
  }, [models?.llmManager, isLoading, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text>{t('common.errors.unauthorized')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen 
          options={{
            title: t('chat.title', { defaultValue: 'Chat' }),
            headerLeft: () => (
              <Button 
                icon="arrow-left" 
                onPress={() => router.push('/(tabs)')} 
                mode="text" 
                compact
              >
                Back
              </Button>
            ),
          }}
        />
        <LoadingSpinner
          message={t('chat.loading.title', { defaultValue: 'Loading Chat' })}
          subtitle={t('chat.loading.topics', { defaultValue: 'Getting your conversations...' })}
          size="large"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen 
          options={{
            title: t('chat.title', { defaultValue: 'Chat' }),
            headerLeft: () => (
              <Button 
                icon="arrow-left" 
                onPress={() => router.push('/(tabs)')} 
                mode="text" 
                compact
              >
                Back
              </Button>
            ),
          }}
        />
        <Card style={styles.errorCard}>
          <Card.Content>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorDescription}>
              {!models?.llmManager 
                ? 'The AI system is not properly initialized. This is required for chat functionality.'
                : 'Some models required for chat are not available.'}
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button onPress={() => router.push('/(tabs)')}>Go Home</Button>
            <Button onPress={() => router.push('/(tabs)/messages')}>Messages</Button>
          </Card.Actions>
        </Card>
      </View>
    );
  }

  const renderItem = ({ item }: { item: any }) => (
    <TouchableRipple
      onPress={() => router.push(`/(screens)/chat/${item.id}`)}
      style={styles.topicItem}
    >
      <View>
        <Text style={styles.topicName}>{item.name}</Text>
        {item.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        )}
        <Text style={styles.participantCount}>
          {t('chat.participantCount', { count: item.participantCount })}
        </Text>
      </View>
    </TouchableRipple>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{
          title: t('chat.title', { defaultValue: 'Chat' }),
          headerLeft: () => (
            <Button 
              icon="arrow-left" 
              onPress={() => router.push('/(tabs)')} 
              mode="text" 
              compact
            >
              Back
            </Button>
          ),
        }}
      />
      
      <View style={styles.listContent}>
        {topics.length > 0 ? (
          topics.map((item) => renderItem({ item }))
        ) : (
          <View style={styles.emptyContainer}>
            <Text>{t('chat.noTopics')}</Text>
          </View>
        )}
      </View>
      
      <FAB
        icon="plus"
        onPress={() => router.push('/(screens)/chat/new')}
        style={[styles.fab, { bottom: bottom + 16 }]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  topicItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  topicName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  participantCount: {
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 8,
  },
  errorDescription: {
    color: '#666',
    textAlign: 'center',
    fontSize: 14,
  },
  errorCard: {
    margin: 16,
    padding: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#2196F3',
  },
}); 