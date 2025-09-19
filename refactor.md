# Lama Refactoring Plan

## Core Principles

1. **Follow one.leute patterns**: The reference implementation already works in production
2. **Direct usage of one.models**: Minimize custom wrappers and leverage core functionality
3. **Linear code flow**: Simplify initialization sequences and dependencies
4. **Fail fast**: In a controlled environment, prefer clear failures over complex fallbacks

## High Priority Refactoring Tasks

### 1. AppModel Initialization

- Rewrite AppModel to match one.leute's initialization sequence exactly
- Remove defensive programming patterns and fallbacks
- Use `await` rather than event listeners where possible to make flow linear
- Clearly document the initialization sequence requirements

```typescript
// Simplified linear initialization approach
public async init(): Promise<boolean> {
  // Basic prerequisite checks
  if (this.state && this.state.currentState === 'Initialised') return true;
  
  // Core initialization (order matters)
  await ensurePlatformLoaded();
  await objectEvents.init();
  await this.leuteModel.init();
  await this.channelManager.init();
  await this.topicModel.init();
  await this.journalModel.init();
  
  // Extended initialization
  await this.createSystemTopics();
  await this.initLLMManager();
  await this.setupAIAssistant();
  
  // Signal completion
  this.state.fire('init');
  this.onUpdated.emit();
  
  return true;
}
```

### 2. Model Direct Integration

- **Journal**: Use JournalModel from one.models directly without adding custom methods
  - Study the one.leute implementation for proper integration patterns
  - Remove our custom retrieveLatestDayEvents method and use native functionality
  - Connect UI directly to standard model events/methods

- **Contacts**: Use LeuteModel functionality directly rather than through wrappers
  - Leverage SomeoneModel and ProfileModel as used in one.leute
  - Remove custom type handling and use the correct types from one.models
  - Align with ONE architecture patterns for contact management

### 3. LLMManager and AIAssistantModel

- Reimplement following one.leute patterns exactly
- Remove custom event handling and retry logic
- Make initialization explicit and synchronous where possible
- Implement proper error propagation rather than silent recovery

## Medium Priority Tasks

### 1. Remove Type Assertions

- Remove all `as any` type assertions
- Create proper interfaces that match runtime expectations
- Use proper type declarations for all external dependencies

### 2. Unify Component Error Handling

- Implement consistent approach to error states in React components
- Use ErrorBoundary components at appropriate levels
- Replace `try/catch` inline handling with proper propagation

### 3. Model Access Pattern

- Standardize how components access models (useAppModel hook)
- Remove direct manipulation of models from components
- Implement proper separation between data and presentation

## Low Priority Tasks

### 1. Code Cleanup

- Remove commented-out code
- Fix linter errors
- Add comprehensive JSDoc documentation

## Implementation Strategy

1. Begin with AppModel refactoring to establish proper initialization sequence
2. Rewrite Journal tab to use one.models JournalModel directly
   - Study one.leute source code for reference implementation
   - Remove all custom JournalModel extensions
3. Rewrite Contacts tab to use LeuteModel directly
   - Use standard SomeoneModel and ProfileModel patterns
   - Remove custom type handling
4. Address UI components after model layer is properly aligned with ONE architecture

## Success Criteria

- No dynamic property additions at runtime
- Clear linear initialization sequence
- No defensive programming or fallback logic
- Complete type safety with no `any` types
- Full compatibility with one.leute functionality
- Direct use of one.core and one.models without custom extensions 