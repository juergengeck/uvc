import { useCallback, useEffect, useState } from 'react';
import { useModel } from '@src/providers/app/OneProvider';
import AIAssistantModel from '../../models/ai/assistant/AIAssistantModel';
import { useLLM } from './useLLM';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes';
import type { GenerationProgressEvent } from '../../models/ai/types';
import type { LocalAISettings } from '@/types/llm';

interface UseAISummaryOptions {
  onError?: (error: Error) => void;
  onProgress?: (event: GenerationProgressEvent) => void;
}

function isLocalAISettings(settings: any): settings is LocalAISettings {
  return 'threads' in settings;
}

export function useAISummary({ onError, onProgress }: UseAISummaryOptions = {}) {
  const { model } = useModel();
  const aiModel = model?.topicModel as unknown as AIAssistantModel;
  const llm = useLLM({ onError, onProgress });
  const [generating, setGenerating] = useState(false);

  // Check if we need to generate a new summary
  useEffect(() => {
    if (!aiModel) return;

    const config = aiModel.getProviderConfig('local');
    if (!config?.enabled || generating) return;

    // For now, we'll just generate summaries periodically
    // TODO: Implement proper summary interval tracking
    generateSummary([]).catch(console.error);
  }, [aiModel, llm, generating]);

  const generateSummary = useCallback(async (messages: ChatMessage[]) => {
    if (!llm.isInitialized || !aiModel) return;

    try {
      setGenerating(true);

      // Format messages for LLM
      const formattedMessages = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));

      // Generate summary
      const response = await llm.summarize(formattedMessages);

      // Update provider config with summary
      const config = aiModel.getProviderConfig('local');
      if (config && isLocalAISettings(config.settings)) {
        await aiModel.updateProviderConfig('local', {
          ...config,
          settings: {
            ...config.settings,
            lastSummary: {
              text: response.text,
              timestamp: Date.now()
            }
          }
        });
      }

      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate summary');
      onError?.(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [llm, aiModel, onError]);

  const getCurrentSummary = useCallback(() => {
    if (!aiModel) return undefined;
    const config = aiModel.getProviderConfig('local');
    if (!config || !isLocalAISettings(config.settings)) return undefined;
    return config.settings.lastSummary;
  }, [aiModel]);

  return {
    generating,
    generateSummary,
    getCurrentSummary
  };
} 