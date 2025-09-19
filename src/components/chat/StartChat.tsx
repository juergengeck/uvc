/**
 * StartChat Component
 * 
 * Mobile version of one.leute's StartChat component.
 * Uses react-native-paper components instead of MUI.
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Badge, IconButton, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type Notifications from '@refinio/one.models/lib/models/Notifications.js';
import { usePersonId } from '../../hooks/contact/commonHooks';
import { useTopicId } from '../../hooks/chat/topicHooks';

/**
 * When notifications is missing, does not load unread messages indicator
 */
export default function StartChat({
  leuteModel,
  topicModel,
  receiverProfile,
  notifications,
}: {
  leuteModel: LeuteModel;
  topicModel: TopicModel;
  receiverProfile: ProfileModel;
  notifications?: Notifications;
}) {
  const router = useRouter();
  const theme = useTheme();
  const [unreadMessages, setUnreadMessages] = React.useState(0);
  const myPersonId = usePersonId(leuteModel);
  const topicId = useTopicId(topicModel, myPersonId, receiverProfile.personId);

  React.useEffect(() => {
    // wait for dependencies
    if (!notifications || !myPersonId || !topicId) {
      return;
    }

    function updateUnreadMessages() {
      if (!notifications || !topicId) {
        return;
      }
      setUnreadMessages(notifications.getNotificationCountForTopic(topicId));
    }

    // Subscribe to notifications
    const unsubscribe = topicModel.onUpdated(() => {
      updateUnreadMessages();
    });

    // Initial update
    updateUnreadMessages();

    return () => {
      unsubscribe();
    };
  }, [notifications, myPersonId, topicId, topicModel]);

  const handlePress = () => {
    if (topicId) {
      router.push(`/(screens)/chat/${topicId}`);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <View style={styles.container}>
        <IconButton
          icon="message"
          size={24}
          onPress={handlePress}
        />
        {unreadMessages > 0 && (
          <Badge
            style={[
              styles.badge,
              { backgroundColor: theme.colors.error }
            ]}
          >
            {unreadMessages}
          </Badge>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
}); 