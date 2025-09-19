import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { getAppModelInstance } from '../../models/AppModel';
import { useTheme } from 'react-native-paper';

const AIModelSettings = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const appModel = getAppModelInstance();
  
  const handleEnsureTopics = async () => {
    if (!appModel) return;
    
    setIsProcessing(true);
    try {
      const ensured = await appModel.forceTopicCreation();
      Alert.alert(
        'Topics Ensured',
        `Successfully ensured ${ensured} topics for AI models.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to ensure topics: ${error instanceof Error ? error.message : String(error)}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };
  
  const theme = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.onBackground }]}>AI Model Settings</Text>
      
      <View style={styles.buttonContainer}>
        <Button 
          title={isProcessing ? "Processing..." : "Ensure Topics for All Models"} 
          onPress={handleEnsureTopics}
          disabled={isProcessing}
        />
        {isProcessing && <ActivityIndicator style={styles.spinner} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  buttonContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinner: {
    marginLeft: 10,
  }
});

export default AIModelSettings; 