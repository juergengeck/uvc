import React from 'react';
import { TextInput } from 'react-native';
import { withVoiceInput } from './withVoiceInput';

export const VoiceEnabledTextInput = withVoiceInput(TextInput); 