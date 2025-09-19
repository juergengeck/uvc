# Model Management in Refinio Apps

This document explains the approach taken by one.leute for model management and provides a guide for implementing the same pattern in lama.

## One.leute Approach

One.leute takes a systematic approach to model management with these key principles:

1. **Single Instance Creation**: All models are created once in the constructor of the main Model class.
```typescript
// From one.leute/src/model/Model.ts
constructor(commServerUrl: string, initialIopPeers?: InitialIopPeerInfo[]) {
    // Setup basic models
    this.leuteModel = new LeuteModel(commServerUrl, true);
    this.channelManager = new ChannelManager(this.leuteModel);
    this.questionnaireModel = new QuestionnaireModel(this.channelManager);
    this.topicModel = new TopicModel(this.channelManager, this.leuteModel);
    // ...other models
}
```

2. **Sequential Initialization**: Models are initialized in a specific order in a separate init method.
```typescript
public async init(_instanceName: string, _secret: string): Promise<void> {
    // Initialize contact model first - base for identity handling
    await this.leuteModel.init();
    
    // Initialize IoM
    await this.iom.init();
    
    // Channel manager must be initialized before models that depend on it
    await this.channelManager.init();
    
    // Models that depend on channelManager
    await this.topicModel.init();
    await this.questionnaireModel.init();
    // ...other models
}
```

3. **Orderly Shutdown**: All models are shut down in reverse order.
```typescript
public async shutdown(): Promise<void> {
    try {
        await this.topicModel.shutdown();
    } catch (e) {
        console.error(e);
    }
    
    // ... other models
    
    try {
        await this.channelManager.shutdown();
    } catch (e) {
        console.error(e);
    }
    
    // ... finally
    try {
        await this.leuteModel.shutdown();
    } catch (e) {
        console.error(e);
    }
}
```

4. **Direct Model Reference**: Never use `as any` type assertions. The model system is designed to be type-safe without hacks.

5. **No Dynamic Creation**: Never create new instances of models on the fly - always use the singleton instances created at startup.

## Current Issues in Lama

1. **Type Assertions**: Excessive use of `as any` assertions that bypass type safety.

2. **Model Re-creation**: Creating new instances of TopicModel in various places, leading to data loss and inconsistency.

3. **Inconsistent Initialization Order**: Not following the correct dependency order for model initialization.

4. **Dual Import Paths**: Confusion between `/Users/gecko/src/one.models/...` and `@refinio/one.models/...` paths that point to the same files.

## Implementation Plan for Lama

1. **Central Model Creation**: Create all models once in the `AppModel` constructor.
```typescript
constructor(commServerUrl: string) {
    super();
    this.leuteModel = new LeuteModel(commServerUrl, true);
    this.channelManager = new ChannelManager(this.leuteModel);
    this.questionnaireModel = new QuestionnaireModel(this.channelManager);
    this.topicModel = new TopicModel(this.channelManager, this.leuteModel);
    // ...other models
}
```

2. **Proper Initialization Sequence**: Initialize models in the correct order:
```typescript
async init() {
    // First initialize LeuteModel
    await this.leuteModel.init();
    
    // Wait for LeuteModel to be ready if needed
    if (this.leuteModel.state.currentState !== 'Initialised') {
        // ...wait for it to be ready
    }
    
    // Initialize ChannelManager after LeuteModel
    await this.channelManager.init();
    
    // Initialize models that depend on ChannelManager
    await this.questionnaireModel.init();
    await this.topicModel.init();
    // ...other models
}
```

3. **Reference vs. Recreation**: When needing to use TopicModel in a component, reference the singleton instead of creating a new instance.
```typescript
// BAD approach:
const topicModel = new TopicModel(channelManager, leuteModel);

// GOOD approach:
const { topicModel } = useModel(); // Get reference from app model
```

4. **Channel Management**: Always ensure the ChannelManager is fully initialized before attempting to use it through TopicModel.

5. **Consistent Import Strategy**: Use a single import path strategy throughout the codebase, preferably through the `@refinio/one.models` alias.

## Critical Dependencies

The key dependency sequence is:
1. LeuteModel must be initialized first
2. ChannelManager depends on LeuteModel
3. TopicModel depends on both ChannelManager and LeuteModel

This sequence must be maintained in both the creation order and initialization order.

## Conclusion

By following the time-tested pattern from one.leute, we can ensure reliable and consistent behavior in lama without resorting to type assertions or creating duplicate model instances. The focus should be on maintaining a single source of truth for all models and respecting their initialization sequences and dependencies. 