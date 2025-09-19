# Proper Contact Creation in ONE System

## Problem Identified

Our codebase contains multiple implementations for creating contact objects (Person, Profile, Someone) that try to manually manage object relationships instead of using the proper ONE framework methods. This leads to errors like:

```
Error: Person ID missing for Someone object
```

This happens because:
1. We're using direct constructor calls via dynamic imports
2. We're manually managing object dependencies and relationships
3. We're not letting the ONE framework handle object consistency

## Correct Approach

### 1. Use LeuteModel's Built-in Methods

ONE's `LeuteModel` already provides proper methods to create and manage contacts that ensure correct object relationships:

```typescript
// Instead of manual Person/Profile/Someone creation:
const contactResult = await leuteModel.createContact({
  email: normalizedEmail,
  displayName: options.displayName
});

// The result contains properly linked objects
const { personId, profileId, someoneId } = contactResult;
```

### 2. For AI Contacts, Use the Dedicated API

For AI contacts, there should be a specialized method in `AIAssistantModel` that properly creates contacts for AI entities:

```typescript
// This should be implemented in AIAssistantModel
public async createAIContact(modelName: string): Promise<Someone> {
  // Use LeuteModel's standard methods to ensure proper object creation
  const result = await this.leuteModel.createContact({
    email: `ai.${modelName.toLowerCase()}@lama.one`,
    displayName: `${modelName} (AI)`,
    isAI: true // Special flag for AI contacts
  });
  
  return await this.leuteModel.getSomeone(result.personId);
}
```

### 3. Avoid Dynamic Imports and Direct Constructor Calls

Never use:
```typescript
// Bad practice - bypasses proper object creation flow
const ProfileModelImport = (await import('@refinio/one.models/lib/models/Leute/ProfileModel.js')).default;
const profile = await ProfileModelImport.constructWithNewProfile(...);
```

Instead, always use the model instances provided by the application:
```typescript
// Get models from the app context
const { leuteModel } = this.appModel;
// Use proper API methods
const someone = await leuteModel.getSomeone(personId);
```

## Implementation Plan

1. Remove all dynamic imports of model constructors
2. Replace direct constructor calls with LeuteModel API methods
3. Consolidate contact creation code into a single, well-tested utility
4. Remove redundant validation that should be handled by the ONE framework
5. Ensure proper error handling that propagates framework errors rather than creating custom ones

By following these guidelines, we'll ensure proper object relationships and avoid the "Person ID missing for Someone object" errors. 