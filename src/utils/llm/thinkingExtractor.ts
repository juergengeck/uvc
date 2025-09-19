/**
 * Thinking Extractor Utility
 * 
 * Functions for extracting thinking content from LLM responses and storing it as CLOBs
 */

import { storeThinkingAsClob } from '../storage/clobStorage';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { CLOB } from '@refinio/one.core/lib/recipes.js';
import type { LLMSettings } from '@src/types/ai';

/**
 * Extract thinking content from an LLM response and store it as a CLOB attachment
 * @param modelId The model ID that generated the response
 * @param response The raw LLM response object 
 * @param modelSettings The model settings
 * @returns Hash of the stored thinking content CLOB, or null if no thinking content
 */
export async function extractAndStoreThinking(
  modelId: string,
  response: any,
  modelSettings: LLMSettings
): Promise<SHA256Hash<CLOB> | null> {
  try {
    if (!modelSettings || !modelSettings.thinkingEnabled) {
      return null;
    }
    
    // Extract thinking/reasoning content if available
    let thinkingContent = '';
    let thinkingType: 'thinking' | 'reasoning' = 'thinking';
    
    // Check for reasoning_content from LLM
    if (response.reasoning_content && typeof response.reasoning_content === 'string') {
      thinkingContent = response.reasoning_content;
      thinkingType = 'reasoning';
    } 
    // If no reasoning_content but model has thinking extraction enabled, try to extract from text
    else if (modelSettings.thinkingEnabled && response.text) {
      // Extract thinking content using regex patterns based on model's format
      thinkingContent = extractThinkingFromText(response.text, modelSettings.reasoningFormat);
    }
    
    // If no thinking content was found, return null
    if (!thinkingContent) {
      return null;
    }
    
    // Store as CLOB with appropriate metadata
    const result = await storeThinkingAsClob(
      thinkingContent,
      thinkingType,
      0,  // partIndex - could be incremented for multi-part thinking
      {
        modelId,
        timestamp: Date.now(),
        responseLength: response.content?.length || 0
      }
    );
    
    console.log(`[ThinkingExtractor] Stored thinking content as CLOB: ${result.hash}`);
    return result.hash;
  } catch (error) {
    console.error('[ThinkingExtractor] Error extracting and storing thinking:', error);
    return null;
  }
}

/**
 * Extract thinking content from text based on model format
 * @param text The raw text to extract thinking from
 * @param format Optional format identifier for model-specific extraction
 */
export function extractThinkingFromText(text: string, format?: string): string {
  if (!text) return '';
  
  try {
    // Default to generic extraction if no format specified
    if (!format) {
      // Standard <think>...</think> tags
      const thinkTagMatch = /<think>([\s\S]*?)<\/think>/g.exec(text);
      if (thinkTagMatch && thinkTagMatch[1]) {
        return thinkTagMatch[1].trim();
      }
      
      // Alternative formats
      const markdownThink = /```think([\s\S]*?)```/g.exec(text);
      if (markdownThink && markdownThink[1]) {
        return markdownThink[1].trim();
      }
      
      const bracketThink = /\[thinking\]([\s\S]*?)\[\/thinking\]/g.exec(text);
      if (bracketThink && bracketThink[1]) {
        return bracketThink[1].trim();
      }
      
      // Special command format
      const commandThink = /<\|START_THINKING\|>([\s\S]*?)<\|END_THINKING\|>/g.exec(text);
      if (commandThink && commandThink[1]) {
        return commandThink[1].trim();
      }
      
      // DeepSeek format (from the example we saw in the response)
      const deepseekMatch = /<｜Assistant｜>(.*?)/g.exec(text);
      if (deepseekMatch && deepseekMatch[1] && text.includes("</think>")) {
        // If there's a </think> tag somewhere but our regex didn't capture it,
        // try splitting by it to get everything before as thinking
        const parts = text.split("</think>");
        if (parts.length > 1) {
          const thinkPart = parts[0];
          const thinkContentMatch = /<think>([\s\S]*?)$/g.exec(thinkPart);
          if (thinkContentMatch && thinkContentMatch[1]) {
            return thinkContentMatch[1].trim();
          }
        }
      }
      
      return '';
    }
    
    // Format-specific extraction
    switch (format.toLowerCase()) {
      case 'deepseek':
      case 'deepseek_r1':
        const deepseekMatch = /<think>([\s\S]*?)<\/think>/g.exec(text);
        return deepseekMatch && deepseekMatch[1] ? deepseekMatch[1].trim() : '';
        
      case 'command_r7b':
        const commandMatch = /<\|START_THINKING\|>([\s\S]*?)<\|END_THINKING\|>/g.exec(text);
        return commandMatch && commandMatch[1] ? commandMatch[1].trim() : '';
        
      default:
        // Default to generic extraction
        return extractThinkingFromText(text);
    }
  } catch (error) {
    console.error('[ThinkingExtractor] Error in extractThinkingFromText:', error);
    return '';
  }
} 