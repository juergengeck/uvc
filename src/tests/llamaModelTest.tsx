import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { LlamaModel } from '../models/ai/LlamaModel';

const MODEL_DIRECTORY = FileSystem.documentDirectory + 'models/';
const MODEL_FILENAME = 'tinyllama-1.1b-chat-q4_0.gguf';

const LlamaModelTest: React.FC = () => {
  const [model, setModel] = useState<LlamaModel | null>(null);
  const [modelStatus, setModelStatus] = useState<string>('Not initialized');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<string>('');

  // Initialize the model on component mount
  useEffect(() => {
    const setupModel = async () => {
      try {
        // Ensure the model directory exists
        const dirInfo = await FileSystem.getInfoAsync(MODEL_DIRECTORY);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(MODEL_DIRECTORY, { intermediates: true });
        }

        // Check if the model file exists
        const modelPath = MODEL_DIRECTORY + MODEL_FILENAME;
        const fileInfo = await FileSystem.getInfoAsync(modelPath);
        
        if (fileInfo.exists) {
          // Create and initialize model
          const llamaModel = new LlamaModel(modelPath);
          
          // Listen for state changes
          llamaModel.onStateChange.listen((event) => {
            setModelStatus(event.state);
          });
          
          // Listen for progress updates during generation
          llamaModel.onProgress.listen((event) => {
            setProgress(prev => prev + event.token);
          });
          
          // Initialize the model
          const success = await llamaModel.initializeModel();
          if (success) {
            setModel(llamaModel);
            setModelStatus('Model loaded successfully');
          } else {
            setModelStatus('Failed to initialize model');
          }
        } else {
          setModelStatus(`Model file not found: ${modelPath}`);
        }
      } catch (error) {
        setModelStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    setupModel();

    // Cleanup
    return () => {
      if (model) {
        model.destroy().catch(console.error);
      }
    };
  }, []);

  // Run a test generation
  const runTest = async () => {
    if (!model) {
      setResult('Model not initialized');
      return;
    }

    try {
      setLoading(true);
      setProgress('');
      setResult('');

      const prompt = 'Explain quantum computing in simple terms:';
      const response = await model.complete(prompt, {
        maxTokens: 150,
        temperature: 0.7,
      });

      setResult(response);
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Llama Model Test</Text>
      <Text style={styles.status}>Status: {modelStatus}</Text>
      
      <Button 
        title="Run Test" 
        onPress={runTest} 
        disabled={loading || !model} 
      />
      
      {loading && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Generation in progress:</Text>
          <Text style={styles.progress}>{progress}</Text>
        </View>
      )}
      
      {result && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Result:</Text>
          <Text style={styles.result}>{result}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
  },
  progressContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  progressTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  progress: {
    fontSize: 14,
  },
  resultContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 5,
    maxHeight: 300,
  },
  resultTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  result: {
    fontSize: 14,
  },
});

export default LlamaModelTest; 