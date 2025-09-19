/**
 * Test component to verify AI model loading functionality
 * This tests the complete pipeline: LLMManager → LlamaModel → llama.rn
 */
import React, { useState, useEffect } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import { getAppModelInstance } from '../models/AppModel';

export default function TestModelLoading() {
  const [status, setStatus] = useState<string>('Ready to test');
  const [log, setLog] = useState<string[]>([]);
  const [llmManager, setLLMManager] = useState<any>(null);

  const addLog = (message: string) => {
    console.log(`[TestModelLoading] ${message}`);
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    const initializeTest = async () => {
      try {
        const appModel = getAppModelInstance();
        if (appModel?.llmManager) {
          setLLMManager(appModel.llmManager);
          addLog('LLMManager found in AppModel');
        } else {
          addLog('LLMManager not found in AppModel');
        }
      } catch (error) {
        addLog(`Error getting LLMManager: ${error}`);
      }
    };

    initializeTest();
  }, []);

  const testModelLoading = async () => {
    try {
      setStatus('Testing model loading...');
      addLog('Starting AI model loading test');

      if (!llmManager) {
        addLog('❌ LLMManager not available');
        setStatus('Failed - LLMManager not available');
        return;
      }

      // Step 1: Check available models
      addLog('📋 Listing available models...');
      const models = await llmManager.listModels();
      addLog(`Found ${models.length} models`);
      
      if (models.length === 0) {
        addLog('❌ No models available for testing');
        setStatus('Failed - No models available');
        return;
      }

      const testModel = models[0];
      addLog(`🎯 Testing with model: ${testModel.name}`);

      // Step 2: Get model path
      const modelPath = await llmManager.getModelPath(testModel.idHash);
      addLog(`📁 Model path: ${modelPath}`);

      // Step 3: Test if llama.rn module is available
      const llamaModel = await import('../models/ai/LlamaModel');
      const llamaInstance = llamaModel.LlamaModel.getInstance();
      
      if (llamaInstance.isModuleAvailable()) {
        addLog('✅ llama.rn module is available');
      } else {
        addLog('❌ llama.rn module not available');
        setStatus('Failed - llama.rn module not available');
        return;
      }

      // Step 4: Try to load the model
      addLog('🔄 Loading model...');
      const context = await llmManager.loadModel(testModel.idHash);
      
      if (context) {
        addLog('✅ Model loaded successfully');
        setStatus('✅ Model loading successful!');
        
        // Step 5: Test a simple completion
        addLog('🤖 Testing completion...');
        const response = await llmManager.completeWithModel(
          testModel.idHash,
          "Hello, how are you?",
          { maxTokens: 50, temperature: 0.7 }
        );
        
        if (response) {
          addLog(`✅ Completion successful: "${response.substring(0, 100)}..."`);
          setStatus('✅ Full AI pipeline working!');
        } else {
          addLog('⚠️ Model loaded but completion failed');
          setStatus('⚠️ Model loaded but completion failed');
        }
      } else {
        addLog('❌ Model loading failed');
        setStatus('❌ Model loading failed');
      }

    } catch (error) {
      addLog(`❌ Error: ${error}`);
      setStatus(`❌ Failed: ${error}`);
      console.error('TestModelLoading error:', error);
    }
  };

  const testBasicInfrastructure = async () => {
    try {
      setStatus('Testing basic infrastructure...');
      addLog('🔧 Testing basic infrastructure');

      // Test 1: AppModel
      const appModel = getAppModelInstance();
      if (appModel) {
        addLog('✅ AppModel accessible');
      } else {
        addLog('❌ AppModel not accessible');
        return;
      }

      // Test 2: LLMManager
      if (appModel.llmManager) {
        addLog('✅ LLMManager accessible');
      } else {
        addLog('❌ LLMManager not accessible');
        return;
      }

      // Test 3: llama.rn module
      try {
        const llamaModel = await import('../models/ai/LlamaModel');
        const llamaInstance = llamaModel.LlamaModel.getInstance();
        
        if (llamaInstance.isModuleAvailable()) {
          addLog('✅ llama.rn module available');
        } else {
          addLog('❌ llama.rn module not available');
        }
      } catch (error) {
        addLog(`❌ Error loading LlamaModel: ${error}`);
      }

      // Test 4: Known models
      const knownModels = llmManager.getKnownModels();
      addLog(`📋 Known models: ${knownModels.length}`);

      setStatus('✅ Infrastructure check complete');

    } catch (error) {
      addLog(`❌ Infrastructure test error: ${error}`);
      setStatus(`❌ Infrastructure test failed: ${error}`);
    }
  };

  const clearLog = () => {
    setLog([]);
    setStatus('Ready to test');
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>AI Model Loading Test</Text>
      <Text style={styles.status}>Status: {status}</Text>
      
      <View style={styles.buttonContainer}>
        <Button title="Test Infrastructure" onPress={testBasicInfrastructure} />
        <Button title="Test Model Loading" onPress={testModelLoading} />
        <Button title="Clear Log" onPress={clearLog} />
      </View>

      <Text style={styles.logTitle}>Log:</Text>
      <ScrollView style={styles.logContainer}>
        {log.map((entry, index) => (
          <Text key={index} style={styles.logEntry}>{entry}</Text>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  logTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logContainer: {
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 5,
    maxHeight: 400,
  },
  logEntry: {
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
}); 