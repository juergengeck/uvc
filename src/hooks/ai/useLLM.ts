import { useEffect, useRef, useState } from 'react';
import type { GenerateParams, GenerateResult, ModelState } from '../../models/ai/types';
import type { LocalAISettings, LLM } from '@/types/llm';
import { LLMManager } from '../../models/ai/LLMManager';
import type LlamaModel from '../../models/ai/LlamaModel';
import type AIAssistantModel from '../../models/ai/assistant/AIAssistantModel';
import { useModel } from '@src/providers/app/OneProvider';
import { useAppModel } from '../useAppModel';

interface UseLLMOptions {
  model?: LLM;
  onError?: (error: Error) => void;
  onProgress?: (event: { generatedTokens: number; partialText: string }) => void;
}

export function useLLM({ model, onError, onProgress }: UseLLMOptions) {
  const { model: appModel } = useModel();
  const aiModel = model as unknown as AIAssistantModel;
  const modelRef = useRef<LlamaModel>();
  const [state, setState] = useState<ModelState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (!aiModel || !appModel) {
          throw new Error('No AI model or app model configured');
        }

        // Get the LLMManager from the AppModel
        let llmManager;
        try {
          llmManager = appModel.getModelManager();
          console.log('[useLLM] Got LLMManager from AppModel');
        } catch (e) {
          console.error('[useLLM] Error getting LLMManager from AppModel:', e);
          setError('Failed to get LLM manager');
          return;
        }

        const modelPath = await llmManager.getModelPath(model?.$versionHash$ || '');
        if (!modelPath) {
          throw new Error('Model path not found');
        }

        const llmModel = new LlamaModel(modelPath);
        modelRef.current = llmModel;

        // Register event listeners
        llmModel.onProgress.listen(event => {
          onProgress?.(event);
        });

        llmModel.onStateChange.listen(event => {
          setState(event.state);
          if (event.state === 'error' && event.error) {
            onError?.(new Error(event.error));
          }
        });

        // Initialize model
        await llmModel.initialize();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error('Failed to initialize LLM model'));
      }
    };

    initialize();

    return () => {
      modelRef.current?.cleanup();
      modelRef.current = undefined;
    };
  }, [aiModel, onError, onProgress, model, appModel]);

  const chat = async (
    messages: { role: string; content: string }[]
  ): Promise<GenerateResult> => {
    if (!modelRef.current) {
      throw new Error('LLM model not initialized');
    }

    try {
      const params: GenerateParams = {
        input: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
        stopTokens: ['</s>', '\nuser:', '\nassistant:']
      };

      return await modelRef.current.generate(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Chat failed');
      onError?.(error);
      throw error;
    }
  };

  const summarize = async (
    messages: { role: string; content: string }[]
  ): Promise<GenerateResult> => {
    if (!modelRef.current) {
      throw new Error('LLM model not initialized');
    }

    try {
      const params: GenerateParams = {
        input: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
        maxTokens: 512,
        temperature: 0.3,
        topP: 0.9,
        stopTokens: ['</s>']
      };

      return await modelRef.current.generate(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Summarization failed');
      onError?.(error);
      throw error;
    }
  };

  return {
    isInitialized: !!modelRef.current,
    isGenerating: state === 'generating',
    chat,
    summarize
  };
} 