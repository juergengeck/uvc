import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, StyleSheet, Keyboard, Platform, Animated, ScrollView, Text, TouchableOpacity } from 'react-native';
import { IconButton, useTheme, Menu } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';

export interface InputToolbarProps {
  /**
   * Callback when a message is sent
   */
  onSend: (message: string) => void;
  
  /**
   * Whether the LLM is currently processing
   */
  isProcessing?: boolean;
  
  /**
   * Placeholder text for the input
   */
  placeholder?: string;

  /**
   * Called when files are selected
   */
  onFileChange?: (files: { uri: string, type: string, name: string }[]) => Promise<void>;

  /**
   * Called when emoji picker is toggled
   */
  onEmojiPickerToggle?: (isVisible: boolean) => void;
}

export function InputToolbar({ 
  onSend, 
  isProcessing = false,
  placeholder,
  onFileChange,
  onEmojiPickerToggle
}: InputToolbarProps) {
  // Component instance ID for tracking (stable across renders)
  const instanceId = React.useRef(`input-${Math.random().toString(36).substring(2, 10)}`);
  
  // Get translations
  const { t } = useTranslation(Namespaces.CHAT);
  
  // Log creation only once
  React.useEffect(() => {
    console.log(`[InputToolbar] Component instance ${instanceId.current} mounted`);
    return () => {
      console.log(`[InputToolbar] Component instance ${instanceId.current} unmounted`);
    };
  }, []);
  
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const emojiPickerHeight = useRef(new Animated.Value(0)).current;
  
  // Listen to keyboard events
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    // Clean up listeners
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);
  
  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const toggleEmojiPicker = () => {
    const isOpening = !emojiPickerVisible;
    setEmojiPickerVisible(isOpening);
    
    Animated.timing(emojiPickerHeight, {
      toValue: isOpening ? 280 : 0, // Increased height for better emoji visibility
      duration: 300,
      useNativeDriver: false, // We need to animate height, which requires layout
    }).start();
    
    if (!isOpening) {
      // Focus back on input when closing emoji picker
      inputRef.current?.focus();
    }

    if (onEmojiPickerToggle) {
      onEmojiPickerToggle(isOpening);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prevMessage => prevMessage + emoji);
    // Keep emoji picker open for multiple selections
  };

  const handleImagePick = async () => {
    closeMenu();
    if (!onFileChange) return;
    
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
    if (!onFileChange) return;
    
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
    if (!onFileChange) return;
    
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
  
  const handleSend = useCallback(() => {
    if (message.trim() && !isProcessing) {
      Haptics.selectionAsync();
      console.log(`[InputToolbar] handleSend called on instance ${instanceId.current} with message:`, message.substring(0, 20) + (message.length > 20 ? '...' : ''));
      console.log('[InputToolbar] Calling onSend function');
      onSend(message.trim());
      console.log('[InputToolbar] onSend function called successfully');
      setMessage('');
    }
  }, [message, isProcessing, onSend]);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 1,
      backgroundColor: 'transparent',
      paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 4) : 4,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      borderRadius: 20,
      paddingLeft: 12,
      paddingRight: 4,
      minHeight: Platform.OS === 'ios' ? 36 : 40,
      marginLeft: 4,
      marginRight: 8,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.onSurface,
      padding: 0,
      margin: 0,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    sendButton: {
      margin: 0,
      backgroundColor: isProcessing ? theme.colors.surfaceVariant : theme.colors.primary,
      width: 36,
      height: Platform.OS === 'ios' ? 36 : 40,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: isProcessing ? 0 : 2,
      shadowColor: theme.dark ? 'transparent' : '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: theme.dark ? 0 : 0.2,
      shadowRadius: 2,
    },
    plusButton: {
      backgroundColor: 'transparent',
      margin: 0,
      padding: 4,
    }
  });

  return (
    <View>
    <View style={styles.container}>
      {onFileChange && (
        <IconButton
          icon="plus"
          size={24}
          onPress={openMenu}
          disabled={isProcessing}
          style={styles.plusButton}
          iconColor={theme.colors.onSurfaceVariant}
        />
      )}
      
      {/* Menu separate from the plus button for better positioning */}
      {onFileChange && (
        <Menu
          visible={menuVisible}
          onDismiss={closeMenu}
          anchor={
            // Use empty view as anchor but position menu by the plus button
            <View style={{ width: 1, height: 1 }} />
          }
        >
          <Menu.Item
            leadingIcon="image"
            onPress={handleImagePick}
            title={t('input.chooseImage')}
          />
          <Menu.Item
            leadingIcon="camera"
            onPress={handleCameraCapture}
            title={t('input.takePhoto')}
          />
          <Menu.Item
            leadingIcon="file"
            onPress={handleDocumentPick}
            title={t('input.chooseFile')}
          />
        </Menu>
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
            style={[styles.input, { 
              color: theme.colors.onSurface 
            }]}
            placeholder="Sag was ..."
            placeholderTextColor={`${theme.colors.onSurface}40`}
          value={message}
          onChangeText={setMessage}
          multiline={false}
          maxLength={2000}
          autoCorrect={true}
          autoCapitalize="sentences"
          editable={!isProcessing}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={true}
          onFocus={handleFocus}
          onBlur={handleBlur}
          underlineColorAndroid="transparent"
        />
          
          {/* Emoji picker button */}
          <TouchableOpacity
            onPress={toggleEmojiPicker}
            disabled={isProcessing}
            style={{ margin: 0 }}
          >
            <Text style={{ fontSize: 24 }}>🦙</Text>
          </TouchableOpacity>
      </View>
      
      {/* Send button positioned outside the input container */}
      <IconButton
        icon={isProcessing ? 'dots-horizontal' : 'send'}
        mode="contained"
        size={20}
        onPress={handleSend}
        disabled={!message.trim() || isProcessing}
        style={styles.sendButton}
          iconColor={isProcessing ? theme.colors.onSurfaceVariant : theme.colors.onPrimary}
        />
      </View>
      
      {/* Emoji Picker - slides up below input */}
      <Animated.View style={{
        height: emojiPickerHeight,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}>
        {emojiPickerVisible && (
          <ScrollView 
            style={{ padding: 6, paddingTop: 1 }} // Minimal padding throughout
            showsVerticalScrollIndicator={false}
          >
            {/* Popular emojis - push down in section */}
            <View style={{ marginBottom: 8, marginTop: 12 }}>
              <View style={{ 
                flexDirection: 'row', 
                flexWrap: 'wrap', 
                justifyContent: 'space-between' 
              }}>
                {['😀', '😂', '🥰', '😍', '🤔', '👍', '❤️', '🔥'].map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleEmojiSelect(emoji)}
                    style={{
                      width: '12%',
                      aspectRatio: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Line separator - first third of screen */}
            <View style={{ 
              alignItems: 'center', 
              marginVertical: 8 
            }}>
              <View style={{
                width: '25%',
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.outline,
                opacity: 0.6
              }} />
            </View>

            {/* Smileys & People */}
            <View style={{ marginBottom: 8 }}>
              <View style={{ 
                flexDirection: 'row', 
                flexWrap: 'wrap', 
                justifyContent: 'space-between' 
              }}>
                {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏'].map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleEmojiSelect(emoji)}
                    style={{
                      width: '12%',
                      aspectRatio: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Line separator */}
            <View style={{ 
              alignItems: 'center', 
              marginVertical: 8 
            }}>
              <View style={{
                width: '25%',
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.outline,
                opacity: 0.6
              }} />
            </View>

            {/* Nature */}
            <View style={{ marginBottom: 8 }}>
              <View style={{ 
                flexDirection: 'row', 
                flexWrap: 'wrap', 
                justifyContent: 'space-between' 
              }}>
                {['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴'].map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleEmojiSelect(emoji)}
                    style={{
                      width: '12%',
                      aspectRatio: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Line separator */}
            <View style={{ 
              alignItems: 'center', 
              marginVertical: 8 
            }}>
              <View style={{
                width: '25%',
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.outline,
                opacity: 0.6
              }} />
            </View>

            {/* Objects & Symbols */}
            <View style={{ marginBottom: 8 }}>
              <View style={{ 
                flexDirection: 'row', 
                flexWrap: 'wrap', 
                justifyContent: 'space-between' 
              }}>
                {['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈'].map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleEmojiSelect(emoji)}
                    style={{
                      width: '12%',
                      aspectRatio: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
} 