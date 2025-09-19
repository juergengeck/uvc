import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { LoadingSpinner } from '@src/components/LoadingSpinner';
import { TopicList } from '@src/components/chat/TopicList';
import { ActionButton } from '@src/components/common/ActionButton';

/**
 * Component for displaying recent topics in a collapsible card on the home screen
 * Uses the enhanced TopicList component with name resolution and avatars
 * 
 * Fixed: Now uses useInstance() hook instead of useModel() for consistent reactivity
 * with Messages tab, ensuring topic updates are properly reflected on Home tab.
 */
export function TopicsCard() {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  
  // Use the same hook as Messages tab for consistency and reactivity
  const { instance, isAuthenticated, models } = useInstance();
  
  // Only get the topic model and channel manager if authenticated and models are available
  const topicModel = models?.topicModel;
  const channelManager = models?.channelManager;

  const handleTopicPress = async (topicId: string) => {
    // Navigate to topic screen (using the same route as Messages screen)
    router.push(`/(screens)/topics/${topicId}`);
  };

  const handleAddTopic = () => {
    router.push('/(screens)/contacts/invite');
  };

  // Toggle function for showing/hiding topics
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // If not authenticated or models not available, show a loading state
  if (!isAuthenticated || !models) {
    return (
      <View style={themedStyles.collapsibleSection}>
        <View style={themedStyles.collapsibleHeader}>
          <Text style={themedStyles.collapsibleHeaderText}>Topics</Text>
        </View>
        <View style={[themedStyles.collapsibleContent, styles.loadingContainer]}>
          <LoadingSpinner 
            message="Loading Topics" 
            size="small"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={themedStyles.collapsibleSection}>
      <TouchableOpacity onPress={toggleExpanded} style={themedStyles.collapsibleHeader}>
        <Text style={themedStyles.collapsibleHeaderText}>
          {t('topics.title', { defaultValue: 'Topics' })}
        </Text>
        <IconButton
          icon={isExpanded ? 'chevron-up' : 'chevron-down'}
          onPress={toggleExpanded}
          size={20}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={themedStyles.collapsibleContent}>
          {/* Enhanced topic list with name resolution and avatars */}
          {topicModel && channelManager ? (
            <View style={styles.topicListContainer}>
              {/* Wrap TopicList in a fixed height container to prevent nested scroll issues */}
              <View style={styles.topicListWrapper}>
                <TopicList
                  topicModel={topicModel}
                  channelManager={channelManager}
                  onTopicSelect={handleTopicPress}
                />
              </View>
              {/* Invite Contact button after the list */}
              <ActionButton
                title={t('home:invite_contact', { defaultValue: 'Invite Contact' })}
                onPress={() => router.push('/(screens)/contacts/invite')}
                style={styles.addButton}
              />
            </View>
          ) : (
            <ActionButton
              title={t('home:invite_contact', { defaultValue: 'Invite Contact' })}
              onPress={() => router.push('/(screens)/contacts/invite')}
              style={styles.addButton}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicListContainer: {
    flex: 1,
  },
  topicListWrapper: {
    height: 400, // Fixed height to show multiple topics
    marginBottom: 8,
  },
  addButton: {
    marginTop: 16,
  }
}); 