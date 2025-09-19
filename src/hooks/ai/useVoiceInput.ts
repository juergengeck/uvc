import { useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

interface UseVoiceInputOptions {
  onTranscriptionStart?: () => void;
  onTranscriptionComplete?: () => void;
  onError?: (error: Error) => void;
}

interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: Error | null;
}

/**
 * Hook for voice input functionality.
 * Currently only handles recording - transcription is temporarily disabled.
 * A new transcription solution will be implemented in the future.
 */
export function useVoiceInput({
  onTranscriptionStart,
  onTranscriptionComplete,
  onError
}: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    error: null
  });

  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  // Placeholder for future transcription model initialization
  const initializeModel = useCallback(async () => {
    // No-op until new transcription solution is implemented
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setState(prev => ({ ...prev, isRecording: true, error: null }));
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }));
      onError?.(error as Error);
    }
  }, [onError]);

  // Stop recording - currently just saves the file without transcription
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!recording) return '';

    try {
      await recording.stopAndUnloadAsync();
      setState(prev => ({ ...prev, isRecording: false }));

      const uri = recording.getURI();
      if (!uri) throw new Error('No recording URI available');

      // Clean up the audio file
      await FileSystem.deleteAsync(uri);
      setRecording(null);

      // Return placeholder message since transcription is disabled
      onTranscriptionComplete?.();
      return '[Voice transcription temporarily unavailable]';
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isRecording: false, 
        isTranscribing: false, 
        error: error as Error 
      }));
      onError?.(error as Error);
      return '';
    }
  }, [recording, onTranscriptionComplete, onError]);

  // Cleanup
  const cleanup = useCallback(async () => {
    if (recording) {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setState({
      isRecording: false,
      isTranscribing: false,
      error: null
    });
  }, [recording]);

  return {
    state,
    startRecording,
    stopRecording,
    initializeModel,
    cleanup
  };
} 