import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, Text, List, TouchableRipple, Menu, Button, Divider, Card, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { Namespaces } from '@src/i18n/namespaces';
import { useTopics } from '@src/hooks/chat/topicHooks';
import { TopicList } from '@src/components/chat/TopicList';
import QRCode from 'react-native-qrcode-svg';
import { LoadingSpinner } from '@src/components/LoadingSpinner';
import { ActionButton } from '@src/components/common/ActionButton';

export default function MessagesScreen() {
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  const router = useRouter();
  const { instance, isAuthenticated, authState, models } = useInstance();
  const { t: tMessages } = useTranslation(Namespaces.MESSAGES);
  const { t: tNav } = useTranslation(Namespaces.NAVIGATION);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showDebug, setShowDebug] = React.useState(false);

  // Add debugging for models
  React.useEffect(() => {
    console.log('[MessagesScreen] Models updated:', {
      hasInstance: !!instance,
      hasModels: !!models,
      hasTopicModel: !!models?.topicModel,
      hasChannelManager: !!models?.channelManager,
      hasLeuteModel: !!models?.leuteModel,
      isAuthenticated,
      authState
    });
  }, [instance, models, isAuthenticated, authState]);

  React.useEffect(() => {
    if (isAuthenticated && models?.topicModel && models?.channelManager) {
      setIsLoading(false);
    }
  }, [models?.topicModel, models?.channelManager, isAuthenticated]);

  const handleAddTopic = () => {
    router.push('/(screens)/contacts/invite');
  };

  const handleTopicPress = (topicId: string) => {
    router.push(`/(screens)/topics/${topicId}`);
  };

  const handleSettingsPress = () => {
    router.push('/(screens)/settings');
  };

  // Debug section helpers
  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  // Render the model status debug info
  const renderModelDebugStatus = () => {
    if (!instance) return null;
    
    return (
      <Card style={styles.debugCard}>
        <Card.Title title="Model Status" subtitle={`App State: ${instance.currentState || 'Unknown'}`} />
        <Card.Content>
          <List.Section>
            {models ? (
              <>
                <List.Item
                  title="topicModel"
                  description={models.topicModel ? 'Available' : 'Missing'}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={models.topicModel ? 'check-circle' : 'alert-circle'}
                      color={models.topicModel ? theme.colors.primary : theme.colors.error}
                    />
                  )}
                />
                <List.Item
                  title="channelManager"
                  description={models.channelManager ? 'Available' : 'Missing'}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={models.channelManager ? 'check-circle' : 'alert-circle'}
                      color={models.channelManager ? theme.colors.primary : theme.colors.error}
                    />
                  )}
                />
                <List.Item
                  title="leuteModel"
                  description={models.leuteModel ? 'Available' : 'Missing'}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={models.leuteModel ? 'check-circle' : 'alert-circle'}
                      color={models.leuteModel ? theme.colors.primary : theme.colors.error}
                    />
                  )}
                />
                <List.Item
                  title="llmManager"
                  description={models.llmManager ? 'Available' : 'Missing'}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={models.llmManager ? 'check-circle' : 'alert-circle'}
                      color={models.llmManager ? theme.colors.primary : theme.colors.error}
                    />
                  )}
                />
                <List.Item
                  title="aiAssistantModel"
                  description={models.aiAssistantModel ? 'Available' : 'Optional'}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={models.aiAssistantModel ? 'check-circle' : 'information'}
                      color={models.aiAssistantModel ? theme.colors.primary : theme.colors.secondary}
                    />
                  )}
                />
              </>
            ) : (
                <List.Item
                title="No Models"
                description="Models not available"
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon="help-circle"
                      color={theme.colors.secondary}
                    />
                  )}
                />
            )}
          </List.Section>
          <Divider style={{ marginVertical: 8 }} />
          <Text variant="bodySmall">Auth State: {authState}</Text>
          <Text variant="bodySmall">Models from hook: {models ? 'Available' : 'Not Available'}</Text>
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => router.push('/(screens)/chat/new')}>New Topic</Button>
          <Button onPress={() => router.push('/')}>Home</Button>
        </Card.Actions>
      </Card>
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text>{tMessages('error.unauthorized')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <LoadingSpinner
          message={tMessages('loading.title')}
          subtitle={tMessages('loading.topics')}
          size="large"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Debug button */}
        <TouchableRipple onPress={toggleDebug} style={styles.debugButton}>
          <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
            {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
          </Text>
        </TouchableRipple>
        
        {/* Debug section */}
        {showDebug && renderModelDebugStatus()}
        
      {showDebug && (
        <View style={styles.qrContainer}>
          <QRCode
            value="/(tabs)/messages"
            size={150}
            color={theme.colors.onBackground}
            backgroundColor={theme.colors.background}
          />
          <Text style={[styles.routeText, { color: theme.colors.onBackground }]}>
            /(tabs)/messages
          </Text>
        </View>
      )}

      {/* Enhanced topic list with name resolution and avatars */}
      {models?.topicModel && models?.channelManager ? (
        <View style={styles.contentContainer}>
          <TopicList
            topicModel={models.topicModel}
            channelManager={models.channelManager}
            onTopicSelect={handleTopicPress}
          />
          {/* Invite Contact button after the list */}
          <ActionButton
            title={tMessages('messages:invite_contact', { defaultValue: 'Invite Contact' })}
            onPress={() => router.push('/(screens)/contacts/invite')}
            style={styles.actionButton}
          />
                    </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {tMessages('topics.loading')}
              </Text>
          <ActionButton
            title={tMessages('messages:invite_contact', { defaultValue: 'Invite Contact' })}
            onPress={() => router.push('/(screens)/contacts/invite')}
            style={styles.actionButton}
          />
            </View>
          )}
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  contentContainer: {
    flex: 1,
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  actionButton: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  routeText: {
    marginTop: 8,
    opacity: 0.7,
    fontSize: 12,
  },
  debugButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  debugCard: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
}); 