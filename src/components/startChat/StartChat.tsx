import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {StyleSheet, TouchableOpacity, View, Text} from 'react-native';
import {Badge} from 'react-native-paper';
import {router} from 'expo-router';

import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type Notifications from '@refinio/one.models/lib/models/Notifications.js';

import {usePersonId} from '@/hooks/contact/commonHooks.js';
import {useTopicId} from '@/hooks/chat/topicHooks.js';

const styles = StyleSheet.create({
    container: {
        padding: 8,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
    },
    icon: {
        padding: 8,
    },
    fallbackIcon: {
        fontSize: 24,
        padding: 8,
    }
});

/**
 * When notifications is missing, does not load unread messages indicator
 */
export default function StartChat(props: {
    leuteModel: LeuteModel;
    topicModel: TopicModel;
    receiverProfile: ProfileModel;
    notifications?: Notifications;
}): ReactElement {
    const [unreadMessages, setUnreadMessages] = useState<number>(0);
    const myPersonId = usePersonId(props.leuteModel);
    const topicId = useTopicId(props.topicModel, myPersonId, props.receiverProfile.personId);

    useEffect(() => {
        if (props.notifications === undefined || myPersonId === undefined || topicId === undefined) {
            return;
        }
        
        function updateUnreadMessages(): void {
            if (props.notifications === undefined || topicId === undefined) {
                return;
            }
            setUnreadMessages(props.notifications.getNotificationCountForTopic(topicId));
        }
        
        updateUnreadMessages();
        return props.topicModel.onUpdated.listen(updateUnreadMessages);
    }, [props.notifications, myPersonId, topicId, props.topicModel.onUpdated]);

    function startChat(): void {
        if (myPersonId === undefined) {
            return;
        }
        router.push(`/(tabs)/chat/${topicId}`);
    }

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={startChat}>
                <View>
                    <Text style={styles.fallbackIcon}>💬</Text>
                    {unreadMessages > 0 && (
                        <Badge
                            style={styles.badge}
                            size={16}
                        />
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
} 