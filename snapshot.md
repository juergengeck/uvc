# Lama System Snapshot

## Contact Management System

### Core Identity Architecture [FIXED]

1. **Object Relationship Hierarchy**:
   - Person → Profile → Someone → Contacts
   - Each level builds on the previous and must be created in sequence
   - All objects use content-addressing (SHA256IdHash) for identity

2. **AI Model Identity Generation**:
   - Each LLM gets a deterministic Person identity
   - Format: `${slugifyModelName(modelName)}@llama.local`
   - Slugification: lowercase, non-alphanumeric chars to hyphens

3. **Key Creation Functions [CONSOLIDATED]**:
   - `LLMManager.getOrCreateSomeoneForModel`: Centralized identity creation function
   - `LLMManager.setupLLMWithIdentity`: Called during model import/initialization
   - `getPersonIdForLLM`: Generates deterministic Person IDs
   - ✅ Fixed: All identity creation now flows through LLMManager

### Implementation Details

1. **Person Objects**:
   - Versioned objects stored with `storeVersionedObject`
   - Minimal fields: `$type$: 'Person'`, `email`, `name`
   - IDs calculated using `calculateIdHashOfObj`

2. **Profile Objects**:
   - Created via `ProfileModel.constructWithNewProfile`
   - Contain descriptors like `PersonName`, `OrganisationName`
   - May include AI-specific metadata in `personDescriptions`

3. **Someone Objects**:
   - Created via `SomeoneModel.constructWithNewSomeone`
   - Link Person IDs and Profile IDs
   - Added to contacts with `leuteModel.addSomeoneElse`

4. **Contact Addition Workflow**:
   - Check if Someone already exists for Person ID
   - Verify Person exists (create if needed)
   - Create Profile with proper descriptors
   - Create Someone linking Person and Profile
   - Add Someone to contacts list

### Common Issues

1. **Duplicate Someones [FIXED]**:
   - Multiple Someone objects were being created for same Person ID
   - Caused by parallel/duplicate calls to `getOrCreateSomeoneForLLM` from different components
   - ✅ Fixed: Added promise-based locking mechanism to prevent concurrent creation
   - ✅ Fixed: Added double-check for existing Someone during creation process
   - ✅ Fixed: Consolidated AIAssistantModel identity creation to use LLMManager

2. **Missing Relationships**:
   - Person without Someone: Interrupted creation process
   - LLM with personId but no Person/Someone: Storage inconsistencies 

3. **Email Domain Inconsistency [FIXED]**:
   - Previously: Code used `@llm.refinio.com` but docs specified `@llama.local`
   - Could cause identity detection issues
   - ✅ Fixed: Now consistently using `@llama.local` as per documentation

4. **Missing PersonId on Loaded Models [FIXED]**:
   - Previously: Models loaded from storage were missing personIds
   - Caused models to not show up in contact list
   - ✅ Fixed: Now ensuring all models get a personId during loading
   - ✅ Fixed: Properly storing updated models with personIds back to channel

## LLM Management System

1. **LLMManager [IMPROVED]**:
   - Central management class for LLM models
   - **EXCLUSIVE owner of LLM identity management** ✅
   - Handles model import, configuration, identity setup
   - Uses `setupLLMWithIdentity` to create model identities
   - Stores models in ChannelManager storage
   - ✅ Added: Centralized `getOrCreateSomeoneForModel` method as single point of identity creation
   - ✅ Fixed: Proper typing for SHA256IdHash parameters

2. **AIAssistantModel [FIXED]**:
   - Manages AI assistant capabilities
   - Creates/manages topics for chat conversations
   - ✅ Fixed: Now defers to LLMManager for identity creation
   - ✅ Fixed: Removed all direct identity creation logic
   - ✅ Fixed: Only handles topic creation, not contact identities

3. **Model Settings**:
   - Global settings apply to all models by default
   - Per-model settings override globals
   - Temperature, maxTokens, threads, etc.
   - Stored in LLMSettingsManager

4. **Identity Verification**:
   - AIModelSettings component includes diagnostic logging
   - Verifies proper Person/Someone creation
   - Detects duplicate Someones and relationship issues

## Interface Components

1. **AIModelSettings**:
   - Displays/manages available AI models
   - Shows model settings and global preferences
   - Handles model import and configuration
   - Includes diagnostics for identity relationships

2. **Model Loading**:
   - Primary source: LLMManager `listModels()`
   - Secondary source: AIAssistantModel `getAvailableModels()`
   - Fallback: Storage recovery with `recoverModelsFromStorage()`

## Development Principles

1. **Fail Fast Philosophy**:
   - No delays or retries in the code
   - Honor system capabilities, fail quickly and fix root causes
   - Avoid defensive programming approaches

2. **Type Handling**:
   - SHA256IdHash objects are opaque types
   - Don't use string methods on hash objects
   - Use `ensureIdHash()` for consistent handling
   - Direct `===` comparisons work on hash objects 