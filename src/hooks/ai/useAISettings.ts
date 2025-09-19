import { useInstance } from '@src/providers/app/useInstance';
import { useEffect, useState } from 'react';
import type { AIProviderConfig, AISummaryConfig, AIAssistantTopic } from '@src/types/llm';
import type { Model } from '@refinio/one.models/lib/models/Model.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom.js';

interface ExtendedModel extends Model {
  topicModel: TopicModel;
  leuteModel: LeuteModel;
  channelManager: ChannelManager;
}

const DEFAULT_PROVIDER_CONFIGS: Record<string, AIProviderConfig> = {
  local: {
    $type$: 'AIProviderConfig',
    id: 'local',
    model: '',
    capabilities: ['chat', 'inference'],
    enabled: false,
    settings: {
      modelPath: '',
      modelName: '',
      architecture: '',
      threads: 4,
      batchSize: 512,
      temperature: 0.7
    },
    lastUpdated: Date.now()
  },
  cloud: {
    $type$: 'AIProviderConfig',
    id: 'cloud',
    model: '',
    capabilities: ['chat', 'inference'],
    enabled: false,
    settings: {
      endpoint: '',
      apiKey: '',
      maxTokens: 2048,
      temperature: 0.7
    },
    lastUpdated: Date.now()
  }
};

const DEFAULT_SUMMARY_CONFIG: AISummaryConfig = {
  enabled: false,
  maxTokens: 100,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0
};

/**
 * Hook to manage AI settings
 */
export function useAISettings() {
  const { instance } = useInstance() as { instance: ExtendedModel | undefined };
  const [aiModel, setAiModel] = useState<AIAssistantModel>();
  const [topicId, setTopicId] = useState<string>();
  const [providerConfigs, setProviderConfigs] = useState<Record<string, AIProviderConfig>>(DEFAULT_PROVIDER_CONFIGS);
  const [summaryConfig, setSummaryConfig] = useState<AISummaryConfig>(DEFAULT_SUMMARY_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    if (!instance?.topicModel || !instance?.leuteModel || !instance?.channelManager) {
      console.log('[useAISettings] Missing required models');
      return;
    }

    // Wait for platform to be ready
    if (instance.state.currentState !== 'Initialised') {
      console.log('[useAISettings] Platform not ready yet, state:', instance.state.currentState);
      return;
    }

    const initAI = async () => {
      if (isInitializing) return;
      setIsInitializing(true);
      setError(null);
      
      try {
        // Create model instance
        const me = await instance.leuteModel.me();
        const profile = await me.mainProfile();
        
        const model = new AIAssistantModel(
          instance.leuteModel,
          profile.personId,
          profile.idHash
        );
        
        setAiModel(model);
        console.log('[useAISettings] AI model initialized');

      } catch (err) {
        // Log but don't treat as error since AI is optional
        console.log('[useAISettings] Note: AI not initialized:', err);
        setAiModel(undefined);
      } finally {
        setIsInitializing(false);
      }
    };

    initAI();
  }, [instance]);

  const updateProvider = async (providerId: string, config: Partial<AIProviderConfig>) => {
    console.log('[useAISettings] Updating provider:', { providerId, config });
    if (!aiModel) {
      console.log('[useAISettings] No AI model available yet');
      return;
    }
    
    try {
      setError(null);

      // For Local AI, just update the config for now
      if (providerId === 'local') {
        console.log('[useAISettings] Updating Local AI config:', config);
        setProviderConfigs(prev => ({
          ...prev,
          local: {
            ...prev.local,
            ...config,
            settings: {
              ...prev.local.settings,
              ...config.settings
            },
            lastUpdated: Date.now()
          }
        }));
        return;
      }

      // For cloud provider, same simple update
      if (providerId === 'cloud') {
        console.log('[useAISettings] Updating Cloud AI config:', config);
        setProviderConfigs(prev => ({
          ...prev,
          cloud: {
            ...prev.cloud,
            ...config,
            settings: {
              ...prev.cloud.settings,
              ...config.settings
            },
            lastUpdated: Date.now()
          }
        }));
      }

    } catch (err) {
      console.error('[useAISettings] Failed to update provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to update provider settings');
    }
  };

  const updateSummary = async (config: Partial<AISummaryConfig>) => {
    if (!aiModel) return;
    
    try {
      setError(null);
      
      // Update the local state
      setSummaryConfig(prev => ({
        ...prev,
        ...config
      }));

      // If summary is being enabled/disabled, update the local provider
      if (typeof config.enabled !== 'undefined') {
        console.log('[useAISettings] Provider enabled state changed:', config.enabled);
        // No-op for now, as the AIAssistantModel doesn't support this operation directly
      }
    } catch (err) {
      console.error('[useAISettings] Failed to update summary config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update summary settings');
      throw err;
    }
  };

  return {
    providerConfigs,
    summaryConfig,
    updateProvider,
    updateSummary,
    error
  };
} 