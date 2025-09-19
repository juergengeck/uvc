import React from 'react';
import { View, Button, StyleSheet, Text } from 'react-native';
import { useAppModel } from '../hooks/useAppModel';
import { showContacts } from '../scripts/debugContacts';

/**
 * A debug component that provides tools for developers
 */
export const DebugTools = () => {
  const { appModel } = useAppModel();

  const handleShowContacts = async () => {
    if (appModel) {
      await showContacts(appModel);
    } else {
      console.error('AppModel not available for debugging');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Tools</Text>
      <View style={styles.buttonContainer}>
        <Button 
          title="Show Contacts in Logs" 
          onPress={handleShowContacts} 
          color="#841584"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  buttonContainer: {
    marginVertical: 8,
  },
}); 