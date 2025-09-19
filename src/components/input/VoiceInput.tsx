import React, { useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useVoiceInput } from '@src/hooks/ai/useVoiceInput';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  language?: string;
  size?: number;
  disabled?: boolean;
}

export function VoiceInput({
  onTranscription,
  language,
  size = 24,
  disabled = false
}: VoiceInputProps) {
  const {
    state: { isRecording, isTranscribing, error },
    startRecording,
    stopRecording,
    initializeModel,
    cleanup
  } = useVoiceInput({
    language,
    onError: console.error
  });

  useEffect(() => {
    // Initialize model
    initializeModel().catch(console.error);

    // Cleanup function
    return () => {
      cleanup().catch(console.error);
    };
  }, [initializeModel, cleanup]);

  const handlePress = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) {
        onTranscription(text);
      }
    } else {
      await startRecording();
    }
  };

  if (isTranscribing) {
    return <ActivityIndicator size={size} />;
  }

  return (
    <IconButton
      icon={isRecording ? 'stop' : 'microphone'}
      size={size}
      onPress={handlePress}
      disabled={disabled || isTranscribing}
      mode={isRecording ? 'contained' : 'outlined'}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    margin: 0
  }
}); 