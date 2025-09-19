/**
 * Text processing utilities
 * 
 * Common functions for text manipulation, sanitization, and formatting.
 */

/**
 * Sanitizes the response text from an LLM to remove template artifacts and control tokens
 * @param text The raw text from the LLM
 * @returns Clean response text
 */
export function sanitizeLLMText(text: string): string {
  if (!text) return '';
  
  // Remove template artifacts that often appear in AI model output
  return text
    // Remove any "Final Answer:" sections
    .replace(/Final Answer:[\s]*/g, '')
    // Remove any "Revised Response:" sections
    .replace(/Revised Response:[\s]*/g, '')
    // Clean up repeated separators
    .replace(/---+/g, '')
    // Remove any lines containing only asterisks or hashes
    .replace(/^[\s*#]+$/gm, '')
    // Remove lines that just say "Assistant:" or "AI:"
    .replace(/^(Assistant|AI):[\s]*$/gm, '')
    // Remove lines with markdown bold markers on "Final Answer"
    .replace(/\*\*Final Answer\*\*[\s]*/g, '')
    // Remove all variations of end-of-sentence and thinking markers
    .replace(/<[\s]*?\/think[\s]*?>/g, '')
    .replace(/<[\s]*?think[\s]*?>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove think tags with content
    .replace(/<[\s]*?end__of__sentence[\s]*?>/g, '')
    .replace(/<[\s]*?\|[\s]*?end__of__sentence[\s]*?\|[\s]*?>/g, '')
    .replace(/<[\s]*?end_of_sentence[\s]*?>/g, '')
    .replace(/<[\s]*?\|[\s]*?end_of_sentence[\s]*?\|[\s]*?>/g, '')
    // Specific pattern for the format we're seeing: < | end_of_sentence | >
    .replace(/<\s*\|\s*end_of_sentence\s*\|\s*>/g, '')
    // Broader pattern to catch any similar control tokens
    .replace(/<[\s]*?[\/\|]?[\s]*?end[\w_]*?[\s]*?[\/\|]?[\s]*?>/g, '')
    // Trim any extra whitespace
    .trim();
}

/**
 * Get a concise version of a longer text (first paragraph or first N chars)
 * @param text The full text to truncate
 * @param maxLength Maximum length for truncation (default: 150)
 * @returns Truncated text with ellipsis if needed
 */
export function getTruncatedText(text: string, maxLength: number = 150): string {
  if (!text) return '';
  
  // First sanitize the text
  const sanitizedText = sanitizeLLMText(text);
  
  // Get first paragraph if possible
  const firstParagraphMatch = sanitizedText.match(/^(.+?)(\n\n|$)/);
  if (firstParagraphMatch) {
    const firstParagraph = firstParagraphMatch[1].trim();
    // If the first paragraph is under maxLength + 50 chars, just show it
    if (firstParagraph.length < maxLength + 50) {
      return firstParagraph;
    }
  }
  
  // Otherwise truncate to maxLength chars with ellipsis
  return sanitizedText.substring(0, maxLength).trim() + '...';
}

/**
 * Helper function to get name without extension
 * @param filename The full filename
 * @returns The filename without the extension
 */
export function getNameWithoutExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? filename : filename.substring(0, dotIndex);
} 