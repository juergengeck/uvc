/**
 * Error handling utilities
 */

/**
 * Extracts a user-friendly error message from various error types
 * @param {any} error - The error to process
 * @returns {string} A user-friendly error message
 */
export function getErrorMessage(error) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Unknown error');
}

export default {
  getErrorMessage
}; 