import type { ObjectData } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { QuestionnaireResponses } from '@refinio/one.models/lib/models/QuestionnaireModel.js';

/**
 * Helper function to clean and normalize questionnaire URLs
 * @param url The raw URL to clean
 * @returns The cleaned URL
 */
export function cleanQuestionnaireUrl(url: string): string {
  if (!url) return '';

  // First decode the URL - handle all decoding here
  try {
    // Try decoding until no more encoding is found
    let decodedUrl = url;
    while (decodedUrl.includes('%')) {
      const nextDecoded = decodeURIComponent(decodedUrl);
      if (nextDecoded === decodedUrl) break;
      decodedUrl = nextDecoded;
    }
    url = decodedUrl;
  } catch (e) {
    console.warn('Failed to decode URL:', e);
  }

  // Remove the deep link scheme and any extra slashes
  url = url.replace(/^one\.refinio\.lama:\/+/, '');
  url = url.replace(/\/+/g, '/');
  
  // Remove any .page suffix
  url = url.replace(/\.page$/, '');
  
  // If the URL starts with /questionnaire/, extract the actual questionnaire URL
  if (url.startsWith('/questionnaire/')) {
    url = url.substring('/questionnaire/'.length);
  }

  // Handle case where URL is already a full http URL
  if (url.startsWith('http:/') && !url.startsWith('http://')) {
    url = 'http://' + url.substring(6);
  }
  if (url.startsWith('https:/') && !url.startsWith('https://')) {
    url = 'https://' + url.substring(7);
  }

  // Fix common URL issues
  url = url.replace(/questionaire/, 'questionnaire');

  // Ensure URL starts with http:// if not already
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `${QUESTIONNAIRE_BASE_URL}/${url}`;
  }

  // Remove any trailing slashes
  let cleanUrl = url.replace(/\/$/, '');
  
  // Extract the questionnaire name
  const match = cleanUrl.match(/\/([^/]+)$/);
  if (match) {
    const name = match[1];
    // Convert to PascalCase format
    const pascalName = name
      .split(/[_-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
    
    // Replace the name in the URL
    cleanUrl = cleanUrl.replace(/[^/]+$/, pascalName);
  }
  
  return cleanUrl;
}

/**
 * Type guard to check if a response collection is valid.
 * Following one.baypass pattern of validating response collections before access.
 * 
 * A valid response collection must have:
 * 1. A response array with at least one item
 * 2. The first response must have a questionnaire URL
 * 3. The first response must have a status
 * 
 * @param data - The response collection to validate
 * @returns true if the collection is valid and can be safely accessed
 */
export function isValidResponseCollection(data: ObjectData<QuestionnaireResponses>): boolean {
  return !!(data.data?.response?.[0]?.questionnaire && data.data?.response?.[0]?.status);
}

/**
 * Constants for questionnaire URLs
 */
export const QUESTIONNAIRE_BASE_URL = 'http://refinio.one/questionnaire';
export const QUESTIONNAIRE_ROUTES = {
  registration: `${QUESTIONNAIRE_BASE_URL}/BayPassRegistrierung`,
  pradigtBefunde: `${QUESTIONNAIRE_BASE_URL}/PräDigtBefunde`,
  pradigtDEGS: `${QUESTIONNAIRE_BASE_URL}/PräDigtDEGS`,
  // Add other questionnaire routes here
} as const;

/**
 * Get the questionnaire identifier from a URL or deep link
 * @param url Full questionnaire URL or deep link ID
 * @returns The questionnaire identifier (e.g. 'PräDigtBefunde')
 */
export function getQuestionnaireId(url: string): string {
  if (!url) return '';

  // First remove .page suffix if present
  url = url.replace(/\.page$/, '');

  // If it's already just an ID (from deep link), use it directly
  if (!url.includes('/')) {
    return url;
  }

  // Otherwise clean the full URL and extract ID
  const cleanUrl = cleanQuestionnaireUrl(url);
  const match = cleanUrl.match(new RegExp(`${QUESTIONNAIRE_BASE_URL}/(.+)$`));
  return match?.[1] || '';
}

/**
 * Get the full questionnaire URL from an identifier
 * @param id Questionnaire identifier (e.g. 'PräDigtBefunde')
 * @returns The full questionnaire URL
 */
export function getQuestionnaireUrl(id: string): string {
  // If it's already a full URL, clean and return it
  if (id.includes('/')) {
    return cleanQuestionnaireUrl(id);
  }
  // Otherwise construct the URL from the ID
  return `${QUESTIONNAIRE_BASE_URL}/${id}`;
}

/**
 * Normalize a questionnaire name to a consistent format (e.g. praedigt_befunde)
 * @param name The questionnaire name to normalize
 * @returns The normalized questionnaire name
 */
export function normalizeQuestionnaireName(name: string): string {
    return name
        .toLowerCase()
        // Replace umlauts
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        // Convert PräDigt to praedigt
        .replace(/präedigt/g, 'praedigt')
        .replace(/prädigt/g, 'praedigt')
        // Convert BayPass to baypass
        .replace(/baypass(?!_)/g, 'baypass_')
        .replace(/praedigt(?!_)/g, 'praedigt_')
        // Convert camelCase to underscore_case for known patterns
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        // Remove double underscores that might have been created
        .replace(/__/g, '_')
        // Remove leading/trailing underscores
        .replace(/^_+|_+$/g, '');
} 