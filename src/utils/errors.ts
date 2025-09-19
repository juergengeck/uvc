/**
 * Error handling utilities for the ONE platform
 */

export type ErrorType = 
    | 'DELETE_INSTANCE_ERROR' 
    | 'PLATFORM_ERROR' 
    | 'INSTANCE_ERROR'
    | 'NO_DOCUMENT_DIRECTORY'
    | 'SECURE_STORE_UNAVAILABLE'
    | 'CRYPTO_UNAVAILABLE'
    | 'AUTH_STATE_ERROR'
    // Image error types
    | 'IMAGE_TOO_LARGE'
    | 'UNSUPPORTED_TYPE'
    | 'PROCESSING_ERROR'
    | 'FILE_SYSTEM_ERROR';

export interface AppError extends Error {
    type: ErrorType;
    cause?: Error;
}

export function createError(type: ErrorType, options: { cause?: Error; message?: string } = {}): AppError {
    const error = new Error() as AppError;
    error.message = options.message || type;
    error.cause = options.cause;
    error.type = type;
    return error;
} 

export default {
    createError
};