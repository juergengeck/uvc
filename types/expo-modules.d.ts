// Type declarations for Expo and React Native modules

// Global Web APIs available in React Native/Expo
declare global {
    const TextEncoder: {
        new (): {
            encode(input?: string): Uint8Array;
        };
    };
    
    const TextDecoder: {
        new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): {
            decode(input?: BufferSource, options?: { stream?: boolean }): string;
        };
    };
    
    const global: typeof globalThis;
    
    namespace NodeJS {
        interface Timeout {
            ref(): this;
            unref(): this;
        }
    }
}

declare module 'expo-crypto' {
    export function digestStringAsync(
        algorithm: string,
        data: string,
        options?: { encoding?: string }
    ): Promise<string>;
    
    export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
}

declare module 'expo-secure-store' {
    export function setItemAsync(key: string, value: string): Promise<void>;
    export function getItemAsync(key: string): Promise<string | null>;
    export function deleteItemAsync(key: string): Promise<void>;
}

declare module 'react-native-fs' {
    export const DocumentDirectoryPath: string;
    export const CachesDirectoryPath: string;
    
    export function writeFile(filepath: string, contents: string, encoding?: string): Promise<void>;
    export function readFile(filepath: string, encoding?: string): Promise<string>;
    export function exists(filepath: string): Promise<boolean>;
    export function mkdir(filepath: string, options?: { NSURLIsExcludedFromBackupKey?: boolean }): Promise<void>;
    export function readdir(dirpath: string): Promise<string[]>;
    export function unlink(filepath: string): Promise<void>;
    export function stat(filepath: string): Promise<{
        size: number;
        isFile(): boolean;
        isDirectory(): boolean;
        mtime: Date;
        ctime: Date;
    }>;
}

declare module 'debug' {
    interface Debugger {
        (message: any, ...args: any[]): void;
        enabled: boolean;
        namespace: string;
    }
    
    function debug(namespace: string): Debugger;
    export = debug;
}

declare module 'buffer' {
    export class Buffer extends Uint8Array {
        static alloc(size: number, fill?: any, encoding?: string): Buffer;
        static from(data: any, encoding?: string): Buffer;
        static isBuffer(obj: any): obj is Buffer;
        
        toString(encoding?: string): string;
        slice(start?: number, end?: number): Buffer;
        
        readonly buffer: ArrayBuffer;
        readonly byteOffset: number;
        readonly byteLength: number;
    }
}

export {}; 