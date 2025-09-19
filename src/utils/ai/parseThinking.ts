/**
 * Extract thinking content from a message
 * @param text Message text that may contain thinking tags
 * @returns The extracted thinking content without tags
 */
export function extractThinkingContent(text: string): string {
  if (!text) return '';
  
  try {
    // Look for content inside <think> tags
    const thinkingMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkingMatch && thinkingMatch[1]) {
      return thinkingMatch[1].trim();
    }
    
    // Check for </think> tag (maybe incomplete)
    if (text.includes('</think>')) {
      const parts = text.split('</think>');
      if (parts.length > 0 && parts[0]) {
        return parts[0].trim();
      }
    }
    
    return '';
  } catch (error) {
    console.error('[parseThinking] Error extracting thinking content:', error);
    return '';
  }
}

/**
 * Clean message text by removing thinking tags and content
 * @param text Message text to clean
 * @param isAI Whether the message is from an AI (affects cleaning)
 * @returns Cleaned message text
 */
export function cleanMessageText(text: string, isAI: boolean = false): string {
  if (!text) return '';
  
  try {
    let cleanedText = text;
    
    // Only do AI-specific cleaning for AI messages
    if (isAI) {
      // Remove all variations of end_of_sentence markers (including those with spaces)
      cleanedText = cleanedText.replace(/<\s*\|\s*end_of_sentence\s*\|\s*>/g, '');
      cleanedText = cleanedText.replace(/\|\s*end_of_sentence\s*\|/g, '');
      cleanedText = cleanedText.replace(/<\s*end_of_sentence\s*>/g, '');
      cleanedText = cleanedText.replace(/<\s*\/?\s*end_of_sentence\s*>/g, '');
      // Handle the specific format seen in the screenshot: < | end_of_sentence | >
      cleanedText = cleanedText.replace(/<\s*\|\s*end_?_?of_?_?sentence\s*\|\s*>/g, '');
      // Also handle variations with underscores
      cleanedText = cleanedText.replace(/end_?_?of_?_?sentence/g, '');
      
      // Remove User: and Assistant: prefixes
      cleanedText = cleanedText.replace(/^User:\s+.*$/gm, '');
      cleanedText = cleanedText.replace(/^Assistant:\s+/gm, '');
      
      // Remove model-specific end tokens
      cleanedText = cleanedText.replace(/<\|im_end\|>/g, '');
      cleanedText = cleanedText.replace(/<\|im_start\|>/g, '');
      cleanedText = cleanedText.replace(/<\|endoftext\|>/g, '');
      cleanedText = cleanedText.replace(/\[\/INST\]/g, '');
      cleanedText = cleanedText.replace(/\[INST\]/g, '');
      
      // Remove redundant greeting patterns
      const greetingPatterns = [
        /Hello!?\s+How can I (help|assist) you today\?\s+/gi,
        /Of course,?\s+I'm here to help!?\s+/gi,
        /Let me know how I can assist you\.?\s+/gi
      ];
      
      // Keep only the first occurrence of each greeting pattern
      greetingPatterns.forEach(pattern => {
        let matches = cleanedText.match(pattern);
        if (matches && matches.length > 1) {
          // Keep only the first occurrence
          for (let i = 1; i < matches.length; i++) {
            cleanedText = cleanedText.replace(matches[i], '');
          }
        }
      });
    }
    
    // Remove any thinking tags and their content (for all messages)
    cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // Also remove any leftover opening or closing thinking tags
    cleanedText = cleanedText.replace(/<\/?think>/g, '');
    
    // Trim the text
    cleanedText = cleanedText.trim();
    
    return cleanedText;
  } catch (error) {
    console.error('[parseThinking] Error cleaning message:', error);
    return text.replace(/<\/?think>/g, ''); // At minimum, remove think tags
  }
} 