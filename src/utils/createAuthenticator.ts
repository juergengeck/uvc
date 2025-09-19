/**
 * Utility for creating an authenticator instance
 */
import Authenticator from '@refinio/one.models/lib/models/Authenticator/Authenticator.js';
import RecipesStable from '@refinio/one.models/lib/recipes/recipes-stable.js';
import RecipesExperimental from '@refinio/one.models/lib/recipes/recipes-experimental.js';

// Define the options type manually to match the JS implementation
interface AuthOptions {
  directory?: string;
  recipes?: any[];
  reverseMaps?: Map<string, Set<string>>;
  reverseMapsForIdObjects?: Map<string, Set<string>>;
  storageInitTimeout?: number;
}

/**
 * Creates an authenticator instance with the provided configuration
 * @param appName Application name used for storage directory
 * @returns Configured authenticator instance
 */
export function createAuthenticator(appName: string = 'lama'): any {
  // Type assertion needed because Authenticator is defined as abstract in TS
  // but implemented as a concrete class in JS
  const ConcreteAuthenticator = Authenticator as any;
  
  // Create authenticator with required options
  const options: AuthOptions = {
    directory: appName,
    recipes: [...RecipesStable, ...RecipesExperimental],
    // Optional parameters can be added here as needed
  };
  
  const auth = new ConcreteAuthenticator(options);
  
  console.log('[createAuthenticator] Authenticator created for app:', appName);
  
  return auth;
} 