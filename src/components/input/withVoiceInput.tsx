import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { VoiceInput } from './VoiceInput';

interface WithVoiceInputProps extends TextInputProps {
  language?: string;
  voiceInputSize?: number;
  onChangeText?: (text: string) => void;
}

export function withVoiceInput(WrappedInput: typeof TextInput) {
  return function VoiceEnabledInput({
    language,
    voiceInputSize,
    style,
    onChangeText,
    ...rest
  }: WithVoiceInputProps) {
    const handleTranscription = (text: string) => {
      onChangeText?.(text);
    };

    return (
      <View style={styles.container}>
        <WrappedInput
          style={[styles.input, style]}
          onChangeText={onChangeText}
          {...rest}
        />
        <VoiceInput
          onTranscription={handleTranscription}
          language={language}
          size={voiceInputSize}
          disabled={rest.editable === false}
        />
      </View>
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
  },
}); 