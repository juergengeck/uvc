declare module 'one.core/lib/errors' {
    export interface BaseError extends Error {
        code?: string;
        cause?: {
            name: string;
            message: string;
            code?: string;
            stack?: string;
        };
    }

    export interface WebsocketRequestError extends BaseError {
        name: 'WebsocketRequestError';
        code: 'WSRQ-JRMH1';
        cause: {
            name: 'Error' | 'FileNotFoundError' | 'TypeError' | 'CustomError';
            message: string;
            code?: string;
        };
    }

    export interface FileNotFoundError extends BaseError {
        name: 'FileNotFoundError';
        code: 'SB-READ2';
    }

    export interface RegistrationError extends BaseError {
        name: 'RegistrationError';
    }

    export interface SyntaxError extends BaseError {
        name: 'SyntaxError';
    }

    export interface CustomError extends BaseError {
        name: 'CustomError';
        code: 'CE-CODE-TEST';
    }

    export interface TypeCheckError extends BaseError {
        name: 'TypeError';
        message: string;
    }

    export interface StorageError extends BaseError {
        name: 'StorageError';
        code: 'IN-CADCI1' | 'O2M-RTYC2' | 'M2IH-XID1' | 'WSP-ONCL' | 'M2O-PH1';
    }

    export interface CryptoError extends BaseError {
        name: 'CryptoError';
        code: 'CYENC-SYMDEC' | 'SC-LDENC';
    }

    // Add type guard functions that the tests use
    export function isError(err: unknown): err is Error;
    export function isWebsocketRequestError(err: unknown): err is WebsocketRequestError;
    export function isFileNotFoundError(err: unknown): err is FileNotFoundError;
    export function isRegistrationError(err: unknown): err is RegistrationError;
    export function isSyntaxError(err: unknown): err is SyntaxError;
    export function isCustomError(err: unknown): err is CustomError;
    export function isTypeCheckError(err: unknown): err is TypeCheckError;
    export function isStorageError(err: unknown): err is StorageError;
    export function isCryptoError(err: unknown): err is CryptoError;

    // Add error creation function
    export function createError<T extends BaseError>(
        code: string,
        options?: {
            message?: string;
            cause?: Error;
            [key: string]: any;
        }
    ): T;
}

// Add global chai extensions for error handling
declare global {
    namespace Chai {
        interface Assertion {
            error: Assertion;
            instanceof(constructor: ErrorConstructor): Assertion;
            property(name: string): Assertion;
            include: {
                (value: string): Assertion;
                string(value: string): Assertion;
            };
            equal(value: any): Assertion;
            undefined: Assertion;
        }
    }

    // Add catch clause variable type assertions
    var err: import('one.core/lib/errors').BaseError;
    var error: import('one.core/lib/errors').BaseError;
} 