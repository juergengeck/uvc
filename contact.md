# How one.leute Manages Contacts and Connections

This document outlines the architecture and implementation of contacts and connections management in one.leute, which can serve as a reference for similar implementations in lama.

## Contacts Management Architecture

### Core Model Architecture
- Built on the ONE platform architecture with `LeuteModel` as the central model for managing contacts
- Contacts are represented as `Someone` objects with associated `Profile` objects containing personal information
- Each contact has a unique identifier (`SHA256IdHash<Person>`) and can have multiple profiles
- Profile objects contain structured descriptions (`personDescriptions`) to store contact details like names, emails, and phone numbers

### Contact Creation and Storage
- Contacts are stored using ONE's object storage system through `storeVersionedObject`
- A properly formed `Person` object MUST only contain fields defined in the one.core `Person` type
  - The `$type$: 'Person'` field is required
  - The `email` field is required for a valid Person object
  - Custom properties should NOT be added directly to the Person object
- The result returned from `storeVersionedObject` contains an `idHash` property that should be properly cast to `SHA256IdHash<Person>`
- API methods include `me()`, `others()`, `addSomeoneElse()`, etc. for manipulating contacts

### AI Contact Creation - Correct Implementation
- AI contacts must follow the same pattern as regular contacts, conforming to one.leute expectations
- The Person object must be a standard Person without custom fields
- AI contacts MUST follow this standardized email naming pattern:
  ```typescript
  /**
   * Generate a standardized email for an AI model
   * Follows the format:
   * - Local models: [slugified-model-name]@llama.local
   * - Cloud models: [model-name]@[provider].local (e.g., claude2@anthropic.local)
   */
  private generateAIEmail(model: LLM): string {
    // Slugify the model name (lowercase, spaces to hyphens, alphanumeric only)
    const slugifiedName = model.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    // Determine domain based on model type
    if (model.modelType === 'cloud' && model.provider) {
      return `${slugifiedName}@${model.provider}.local`;
    }
    
    // Default to llama.local for local models
    return `${slugifiedName}@llama.local`;
  }
  ```

- Examples:
  ```typescript
  // For a local model named "DeepSeek Distill 1.5B"
  // Email: deepseek-distill-15b@llama.local
  
  // For a cloud model from Anthropic
  // Email: claude-3-opus@anthropic.local
  ```

- AI-specific information should be stored in the profile's `personDescriptions`:
  ```typescript
  // Standard PersonName descriptor
  const nameObj = {
    $type$: 'PersonName',
    name: 'AI Assistant Name'
  };
  
  // Organization name to mark as AI
  const orgName = {
    $type$: 'OrganisationName',
    name: 'AI Model'
  };
  
  // AI marker using standard PersonDescription
  const aiMarker = {
    $type$: 'PersonDescription',
    key: 'aiModel',
    value: modelType
  };
  
  // AI model details using standard PersonDescription
  const modelDetails = {
    $type$: 'PersonDescription',
    key: 'ai-model-info',
    value: JSON.stringify({
      name: modelInfo.name,
      type: modelInfo.modelType,
      architecture: modelInfo.architecture,
      created: new Date().toISOString()
    })
  };
  
  // Add all descriptors to the profile
  profile.personDescriptions.push(nameObj, orgName, aiMarker, modelDetails);
  ```
- This approach ensures compatibility with one.leute's contact display and management

### AI Contact Detection
- The correct way to detect AI contacts is to check for specific markers in the profile's person descriptions
- It's important to check both the `aiModel` key and the organization name for compatibility:
  ```typescript
  function isAIProfile(profile: ProfileModel): boolean {
    if (!profile) return false;
    
    // Method 1: Check for AI model description
    const hasAIModelKey = profile.personDescriptions?.some(desc => 
      desc.$type$ === 'PersonDescription' && 
      desc.key === 'aiModel'
    );
    
    if (hasAIModelKey) return true;
    
    // Method 2: Check organization names
    if (typeof profile.descriptionsOfType === 'function') {
      const organizationNames = profile.descriptionsOfType('OrganisationName');
      const hasAIOrg = organizationNames.some(org => 
        org.name?.includes('AI Model') || 
        org.name?.includes('AI Assistant')
      );
      
      if (hasAIOrg) return true;
    }
    
    // Method 3: Check email domain for .local TLD
    // This method is complementary and should not be used alone
    const email = profile.person?.email;
    if (email && email.endsWith('.local')) {
      return true;
    }
    
    // For backward compatibility
    return false;
  }
  ```

### AIAssistantModel Integration
- The `AIAssistantModel` should maintain the list of AI contacts
- Always use the `isAIProfile` or similar method for AI contact detection
- The proper workflow for creating an AI contact is:
  1. Create a standard Person object with only the required fields
  2. Store it using `storeVersionedObject` to get a result with idHash
  3. Use the idHash from the result: `const personId = ensureIdHash<Person>(result.idHash)`
  4. Create a Someone object: `const someone = await SomeoneModel.constructWithNewSomeone(personId, profileId)`
  5. Register the contact with `leuteModel.addSomeoneElse(someone.idHash)`
  6. Get the `Someone` object: `const someone = await leuteModel.getSomeone(personId)`
  7. Create or get its profile: `const profile = await leuteModel.createProfileForPerson(personId)`
  8. Add AI-specific descriptors to the profile
  9. Save the profile: `await profile.saveAndLoad()`

### Best Practices
- Avoid storing objects with incorrect types or extra fields
- Use proper type assertions and handle potential undefined values
- Always follow one.leute's patterns for contact management
- Properly await asynchronous operations - NEVER use retries or delays
- If operations fail, throw clear errors that indicate which component has the bug
- Fail fast and fix root causes rather than masking issues with workarounds
- Keep Person and Someone types distinct - never force-cast between incompatible types
- Use the `aiContactUtils.ts` utility functions for common AI contact operations
- Never store AI-specific fields directly on Person objects
- Use the `ProfileModel.descriptionsOfType()` method to get descriptions by type
- Always check if functions exist before calling them

### Contact Synchronization
- Device contacts (from `expo-contacts`) can be imported and synced into the ONE system
- `ContactsManager` handles importing, matching, and creating contacts from device address books
- Contacts are matched by email when possible to avoid duplicates
- New profiles are created for imported contacts and linked to existing Someone objects when matches are found

## Type Definitions for AI Contacts

### LLM Type
The LLM type should be used for storing AI model information:
```typescript
export interface LLM {
  $type$: 'LLM';
  name: string;
  modelType: 'local' | 'cloud';
  filename: string;
  personId?: string;
  deleted: boolean;
  active: boolean;
  creator: string;
  created: number;
  modified: number;
  size: number;
  parameters: {
    temperature?: number;
    batchSize?: number;
    threads?: number;
    maxTokens?: number;
    contextSize?: number;
    mirostat?: number;
    topK?: number;
    topP?: number;
  };
  capabilities: string[];
  architecture?: string;
  checksum?: string;
  provider?: string;
}
```

### Person Descriptions
Use standard person description types for AI contacts:
```typescript
// Name descriptor
const nameDesc = {
  $type$: 'PersonName',
  name: displayName
};

// Organization descriptor for AI
const orgDesc = {
  $type$: 'OrganisationName',
  name: 'AI Model'
};

// Custom descriptors using PersonDescription
const aiMarker = {
  $type$: 'PersonDescription',
  key: 'aiModel',
  value: modelInfo.modelType
};
```

## User Interface Integration

### Contact List Display
- Contacts are displayed in a searchable list with the `ContactList` component
- The list is typically separated into "Me" (the current user) and "Others" (contacts)
- Display names are extracted from profile data using helper functions
- Contact display prioritizes the most user-friendly information available

### AI Contact Display
- The proper way to get an AI contact's display name is:
  ```typescript
  function getAIDisplayName(profile: ProfileModel): string {
    try {
      // Try to get name from PersonName description
      if (typeof profile.descriptionsOfType === 'function') {
        const names = profile.descriptionsOfType('PersonName');
        if (names && names.length > 0 && names[0].name) {
          return names[0].name;
        }
      }
      
      // Fall back to model info
      const modelInfoDesc = profile.personDescriptions.find(desc => 
        desc.$type$ === 'PersonDescription' && 
        desc.key === 'ai-model-info'
      );
      
      if (modelInfoDesc) {
        try {
          const modelInfo = JSON.parse(modelInfoDesc.value);
          if (modelInfo.name) {
            return modelInfo.name;
          }
        } catch (e) {
          // Skip if JSON parsing fails
        }
      }
      
      // Default fallback
      return 'AI Assistant';
    } catch (error) {
      return 'AI Assistant';
    }
  }
  ```

- For components that need to detect AI contacts, use the utility functions:
  ```typescript
  // In a component
  import { isAIProfile, getAIDisplayName } from '../utils/aiContactUtils';
  
  function ContactItem({ profile }) {
    const isAI = isAIProfile(profile);
    const displayName = isAI ? getAIDisplayName(profile) : getRegularDisplayName(profile);
    
    return (
      <div className={isAI ? 'ai-contact' : 'regular-contact'}>
        {displayName}
      </div>
    );
  }
  ```

### AI Contact Actions
- AI contacts may have special actions or capabilities
- They can be disabled or have status changes
- Use the standard API patterns for updating their status:
  ```typescript
  async function updateAIStatus(personId, status) {
    const someone = await leuteModel.getSomeone(personId);
    if (!someone) return;
    
    const profile = await someone.mainProfile();
    profile.setStatus(status, 'lama.ai-assistant');
    await profile.saveAndLoad();
  }
  ```

## Topic Creation for AI Chats

### Creating Topics
When creating topics for AI chats, follow these patterns:
```typescript
async function createAITopic(name, participants) {
  const topic = await topicModel.createGroupTopic(name);
  
  // Add participants if needed
  await topicModel.addPersonsToTopic(participants, topic);
  
  return topic.id;
}
```

### Entering Topic Rooms
To enter a topic room:
```typescript
async function enterAITopicRoom(topicId) {
  const room = await topicModel.enterTopicRoom(topicId);
  return room;
}
```

### Sending Messages
To send messages in a topic room:
```typescript
async function sendMessage(room, text, sender) {
  await room.sendMessage(text, sender);
}

async function sendMessageWithAttachments(room, text, attachments, sender) {
  await room.sendMessageWithAttachmentAsHash(text, attachments, sender);
}
```

## Common Issues and Solutions

### Type System Errors
- Using custom properties in Person objects leads to TypeScript errors and runtime issues
- Casting hash IDs incorrectly (e.g., without the `unknown` intermediate step) breaks type safety
- Creating custom descriptor types instead of using standard ones like `PersonDescription`

### AI Contact Integration Problems
- Adding AI-specific fields directly to Person objects rather than in personDescriptions
- Using non-standard `$type$` values in personDescriptions that one.leute doesn't recognize
- Improperly detecting AI contacts by looking for custom types rather than standard patterns

### Implementation Guidelines
- Always create minimal, valid Person objects with only the required fields
- Store custom attributes in `personDescriptions` using standard descriptors
- Use proper type assertions with intermediate `unknown` type where necessary
- Follow consistent patterns for detecting contact types using descriptor properties

## Implementation Notes

- The contact and connection system relies heavily on async/await patterns
- Error handling includes graceful fallbacks for missing data
- UI components are designed to handle loading states and errors
- The implementation separates business logic (in models) from presentation (in components) 
- Use the provided `aiContactUtils.ts` utilities for common AI contact operations 