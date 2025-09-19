/**
 * ChatAiSelector Component
 * 
 * Mobile version of one.leute's ChatAiSelector component.
 * Uses react-native-paper components and expo's image picker.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import type { AiResult } from '@src/types/ai';
import AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import { LLMManager } from '@src/models/ai/LLMManager';
import { AppModel } from '@src/models/AppModel';

export interface Props {
  /**
   * Whether the component is in a loading state
   */
  loading: boolean;
  
  /**
   * The AI assistant model instance
   */
  aiModel: AIAssistantModel;

  /**
   * Callback when image selection is complete
   */
  onImageSelected: (files: { uri: string, type: string, name: string }[]) => Promise<void>;

  /**
   * Callback when AI generates a result
   */
  onAiResult: (result: AiResult) => Promise<void>;
}

export default function ChatAiSelector({ loading, aiModel, onImageSelected, onAiResult }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [enabledProvider, setEnabledProvider] = useState<string>();
  const [hasModels, setHasModels] = useState(false);
  const [model, setModel] = useState<AppModel | null>(null);

  useEffect(() => {
    async function checkModels() {
      try {
        if (!model?.channelManager) {
          console.warn('No app model or channel manager available');
          return;
        }

        // Get LLMManager via aiModel since that's the proper way
        const modelManager = aiModel.getLLMManager();
        const models = await modelManager.listModels();
        setHasModels(models.length > 0);
      } catch (error) {
        console.error('Failed to check models:', error);
        setHasModels(false);
      }
    }
    checkModels();
  }, [aiModel, model]);

  useEffect(() => {
    // Get currently enabled provider
    try {
      const provider = aiModel.getEnabledAIProvider();
      setEnabledProvider(provider);
    } catch (error) {
      console.error('Error getting enabled AI provider:', error);
    }
  }, [aiModel]);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const handleImagePick = async () => {
    closeMenu();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.fileName || 'image.jpg'
      }));
      onImageSelected(files);
    }
  };

  const handleCameraCapture = async () => {
    closeMenu();
    if (!permission?.granted) {
      const status = await requestPermission();
      if (!status.granted) return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.fileName || 'camera.jpg'
      }));
      onImageSelected(files);
    }
  };

  const handleProviderToggle = async (providerId: string) => {
    closeMenu();
    try {
      await aiModel.setProviderEnabled(providerId as 'local' | 'cloud', true);
      setEnabledProvider(providerId);
    } catch (error) {
      console.error('Error toggling AI provider:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <IconButton
            icon="robot"
            size={24}
            onPress={openMenu}
            disabled={loading}
          />
        }
      >
        <Menu.Item
          leadingIcon="image"
          onPress={handleImagePick}
          title="Analyze Image"
        />
        <Menu.Item
          leadingIcon="camera"
          onPress={handleCameraCapture}
          title="Take & Analyze Photo"
        />
        {hasModels && (
          <Menu.Item
            leadingIcon="brain"
            onPress={() => handleProviderToggle('local')}
            title="Use Local AI"
            trailingIcon={enabledProvider === 'local' ? 'check' : undefined}
          />
        )}
        <Menu.Item
          leadingIcon="cloud"
          onPress={() => handleProviderToggle('cloud')}
          title="Use Cloud AI"
          trailingIcon={enabledProvider === 'cloud' ? 'check' : undefined}
        />
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 4,
  },
}); 