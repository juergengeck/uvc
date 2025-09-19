# Channel Storage Investigation Plan

## Problem Statement

We've identified issues with Channel storage operations where LLM objects are not consistently found in their respective channels. This investigation aims to diagnose these issues without modifying the existing behavior.

## Initial Findings

Analysis of the logs has revealed important constraints on the LLM object schema:

- **ModelType Validation**: LLM objects must have a `modelType` value of either "local" or "cloud".
  - Error if invalid: `O2M-RTYC3: Property "modelType" value "test" does not match RegExp "^(local|cloud)$"`
- **Empty Channel State**: The channel exists but initially has no LLM objects stored in it
- **In-Memory Models**: The application adds in-memory models that aren't found in storage

These findings have been incorporated into the diagnostic tools to ensure that all test models conform to the required schema.

## Investigation Approach

### 1. Monitoring & Diagnostics (Implemented)

- **Channel Operations Monitoring**: Capture all channel read/write/delete operations
- **State Snapshots**: Record channel state at critical moments
- **Storage Validation**: Verify consistency between operations and actual storage state
- **Operation Logging**: Maintain a chronological log of all channel-related operations
- **LLM Load Testing**: Track the full lifecycle of model loading operations

### 2. Key Investigation Points

- **Initialization Sequence**: Check if channels are properly initialized before use
- **Storage Timing**: Identify potential race conditions in storage operations
- **Data Consistency**: Verify data integrity across channel operations
- **Event Handling**: Monitor event propagation for channel updates
- **Model Lifecycle**: Track LLM state changes during the load process

### 3. Focus Areas

- **LLM Channel Specific Issues**: 
  - Track LLM object lifecycle from creation to storage
  - Monitor channel registration and access patterns
  - Validate consistency between channel storage and retrieval operations
  - Trace model loading process and state transitions

- **Channel Manager Operation**:
  - Track channel creation, registration, and indexing
  - Monitor channel storage operations order and timing
  - Verify channel lookup operations

### 4. Data Collection

The diagnostic utility (`src/utils/channelDiagnostics.ts`) collects:

- **Operation Log**: Chronological record of all channel operations
- **State Snapshots**: Channel state at critical points in application lifecycle
- **Validation Results**: Consistency checks between expected and actual state
- **Error Conditions**: Any exceptions or unexpected behaviors
- **Load Process Stages**: Detailed step-by-step tracking of model loading

### 5. Analysis Methods

- **Timeline Analysis**: Correlate operations with state changes
- **Consistency Checking**: Compare expected vs. actual storage state
- **Pattern Recognition**: Identify recurring patterns in failure cases
- **Root Cause Identification**: Trace errors to their source
- **Method Introspection**: Use reflection to find appropriate loading methods

## Implementation Details

The investigation is implemented non-invasively through:

- **AppModel Integration**: Channel diagnostics are started after LLMManager initialization
- **Cleanup Handling**: Proper shutdown of diagnostics during application termination
- **Error Isolation**: Diagnostics failures do not affect application functionality
- **Documentation**: This document and code comments explain the approach
- **Developer Console Access**: Global diagnostics interface for direct testing

## Diagnostic Commands

The channel diagnostics module now provides specific diagnostic commands that can be triggered in the app:

```typescript
// Example usage:
import { runDiagnosticCommand } from '../utils/channelDiagnostics';

// List available models
const models = await runDiagnosticCommand(appModel, 'list');

// Test loading a specific model
const loadResult = await runDiagnosticCommand(appModel, 'test-load', {
  modelName: 'example-model'
});

// Validate channel storage
const validationResult = await runDiagnosticCommand(appModel, 'validate-storage');

// Capture state of a specific channel
const channelState = await runDiagnosticCommand(appModel, 'capture-state', {
  channelId: 'llm'
});

// Monitor a channel for a specified duration
const monitoringResult = await runDiagnosticCommand(appModel, 'monitor', {
  channelId: 'llm',
  duration: 60000 // Monitor for 1 minute
});
```

## Console Diagnostics

For convenient testing, the diagnostics are also exposed through a global interface in the developer console:

```javascript
// List all available models
window.channelDiagnostics.listModels()

// Test loading a specific model
window.channelDiagnostics.testLoad('example-model')

// Validate storage
window.channelDiagnostics.validateStorage()

// Run all diagnostics
window.channelDiagnostics.runAll()

// Create and load a valid test model
window.channelDiagnostics.createTestModel()

// Custom commands with options
window.channelDiagnostics.run('monitor', {
  channelId: 'llm',
  duration: 120000 // 2 minutes
})
```

This interface is automatically available when the application loads, making it easy to run diagnostics during development or testing sessions without modifying the application code.

## LLM Schema Requirements

Based on the investigation, we've identified strict schema requirements for LLM objects:

- **ModelType Restriction**: The `modelType` property must be either "local" or "cloud"
  - Error if invalid: `O2M-RTYC3: Property "modelType" value "test" does not match RegExp "^(local|cloud)$"`
- **Creator Required**: The `creator` property is mandatory and must be a string
  - Error if missing: `O2M-RTYC2: Mandatory property "creator" missing; Rule: {"itemprop":"creator","itemtype":{"type":"string"}}`
- **Required Properties**: All LLM objects must include:
  - `$type$`: Must be 'LLM'
  - `name`: Identifier for the model
  - `filename`: Storage filename
  - `modelType`: Either 'local' or 'cloud'
  - `creator`: String identifying who/what created the model
  - `active`: Boolean state
  - `deleted`: Boolean flag
  - `capabilities`: Array of supported functions
  - `parameters`: Object with model settings

The diagnostic tools have been updated to ensure all test models comply with these schema requirements, allowing successful storage and retrieval testing.

## LLM Load Testing

The new `testLLMLoad` function tracks the entire model loading process through the following stages:

1. **Initialization**: Start of the loading process
2. **List Models**: Retrieve available models from LLMManager
3. **Model Selection**: Select the model to load (specified or default)
4. **Check Storage**: Verify the model's presence in channel storage
5. **Model Load**: Attempt to load the model using appropriate method
6. **Verify Load**: Check if the model loaded successfully
7. **Check Storage After Load**: Verify channel state after loading

Each stage is logged with timestamps and detailed information, making it possible to identify exactly where in the process any issues occur.

## Expected Outcomes

- **Bug Identification**: Precise identification of storage consistency issues
- **Fix Recommendations**: Clear guidance on how to resolve identified issues
- **Architectural Insights**: Better understanding of channel architecture behaviors
- **Improved Reliability**: Path to more robust channel operations
- **Model Management**: Better understanding of LLM lifecycle in the application

## Usage Instructions

1. Run the application with diagnostics enabled
2. Use one of the diagnostic methods:
   - **Via Code**: Use the API methods in your components
   - **Via Console**: Use the `window.channelDiagnostics` interface in the browser console
   - **Via Command Line**: Run specific tests from the command line
3. Check the diagnostics output in the console and logs
4. Use the collected data to identify patterns and issues

## Interpreting Results

The diagnostic tools produce structured JSON results that indicate:

- Success/failure of each operation
- Timestamps for tracking sequence and timing issues
- Detailed state information before and after operations
- Method calls used (helpful for understanding implementation variations)
- Error messages and stack traces when failures occur

Look for patterns such as:
- Objects present in storage but not retrievable in queries
- Successful store operations that don't update the channel state
- Missing event propagation after channel updates
- Inconsistent state between related objects 