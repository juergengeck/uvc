/**
 * ChatFileSelector Component
 * 
 * Mobile version of one.leute's ChatFileSelector component.
 * Uses react-native-paper components and expo's document/image pickers.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton, Menu, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export interface Props {
  /**
   * Whether the component is in a loading state
   */
  loading?: boolean;

  /**
   * Called when files are selected
   */
  onFileChange: (files: { uri: string, type: string, name: string }[]) => Promise<void>;
}

export default function ChatFileSelector({ loading, onFileChange }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const theme = useTheme();

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const handleImagePick = async () => {
    closeMenu();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.fileName || 'image.jpg'
      }));
      onFileChange(files);
    }
  };

  const handleDocumentPick = async () => {
    closeMenu();
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true
    });

    if (!result.canceled) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.mimeType || 'application/octet-stream',
        name: asset.name
      }));
      onFileChange(files);
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
      onFileChange(files);
    }
  };

  return (
    <View style={styles.container}>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <IconButton
            icon="plus"
            size={18}
            onPress={openMenu}
            disabled={loading}
            style={styles.iconButton}
            iconColor={theme.colors.onSurfaceVariant}
          />
        }
      >
        <Menu.Item
          leadingIcon="image"
          onPress={handleImagePick}
          title="Choose Image"
        />
        <Menu.Item
          leadingIcon="camera"
          onPress={handleCameraCapture}
          title="Take Photo"
        />
        <Menu.Item
          leadingIcon="file"
          onPress={handleDocumentPick}
          title="Choose File"
        />
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  iconButton: {
    margin: 0,
    padding: 0,
    backgroundColor: 'transparent',
    width: 24,
    height: 24,
    borderRadius: 0,
  }
}); 