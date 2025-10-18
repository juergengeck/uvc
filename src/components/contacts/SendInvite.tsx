import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { useAppModel } from '@src/hooks/useAppModel';
import { sendInviteToPerson } from '@src/utils/inviteUtils';
import { Person } from '@refinio/one.core/lib/recipes';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';

interface SendInviteProps {
  personId?: SHA256IdHash<Person>;
  onInviteSent?: () => void;
}

/**
 * Component to send an invite to a contact
 */
export const SendInvite: React.FC<SendInviteProps> = ({ personId, onInviteSent }) => {
  const [message, setMessage] = useState("I'd like to connect with you");
  const [title, setTitle] = useState("Contact Request");
  const [isSending, setIsSending] = useState(false);
  const { appModel } = useAppModel();

  const handleSendInvite = async () => {
    if (!personId) {
      Alert.alert('Error', 'No person selected to invite');
      return;
    }

    if (!appModel) {
      Alert.alert('Error', 'App model not available');
      return;
    }

    setIsSending(true);
    
    try {
      // Use our utility function to send the invite
      await sendInviteToPerson(appModel, personId, message, title);
      
      Alert.alert('Success', 'Invite sent successfully');
      
      if (onInviteSent) {
        onInviteSent();
      }
    } catch (error) {
      console.error('Failed to send invite:', error);
      Alert.alert('Error', `Failed to send invite: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Invite Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Enter invite title"
      />
      
      <Text style={styles.label}>Message</Text>
      <TextInput
        style={[styles.input, styles.messageInput]}
        value={message}
        onChangeText={setMessage}
        placeholder="Enter your invitation message"
        multiline
      />
      
      <Button
        title={isSending ? "Sending..." : "Send Invite"}
        onPress={handleSendInvite}
        disabled={!personId || isSending}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  messageInput: {
    height: 100,
    textAlignVertical: 'top',
  },
});

export default SendInvite; 