declare module 'one.core/lib/objects' {
    export type SHA256Hash = string & { readonly __brand: unique symbol };
    export type SHA256IdHash = string & { readonly __brand: unique symbol };
    export type BLOB = Uint8Array & { readonly __brand: unique symbol };
    export type CLOB = string & { readonly __brand: unique symbol };
    
    // Re-export from recipes
    export type { Recipe } from '@refinio/one.core/lib/recipes';
}

// Add global type declarations
declare global {
    type SHA256Hash = import('one.core/lib/objects').SHA256Hash;
    type SHA256IdHash = import('one.core/lib/objects').SHA256IdHash;
    type BLOB = import('one.core/lib/objects').BLOB;
    type CLOB = import('one.core/lib/objects').CLOB;
    type Recipe = import('one.core/lib/recipes').Recipe;
} 