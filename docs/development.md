# Developer Documentation

## Overview

Lama.one is a React Native/Expo mobile app for secure local-first AI chat, built on the ONE platform. This documentation covers development setup, architecture, and implementation details.

## Getting Started

### Prerequisites
- Node.js 18+
- Xcode 15+ (for iOS)
- CocoaPods
- Expo CLI
- Git

### Initial Setup
```bash
# Clone repository
git clone <repository-url>
cd lama.one

# Install dependencies
npm install

# Setup iOS
cd ios && pod install && cd ..

# Start development
npx expo start
```

### Development Environment
- Use VSCode with recommended extensions
- Enable TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting

## Architecture

### Core Components

1. ONE Platform Integration
   - Uses one.core for data management
   - Uses one.models for model definitions
   - Follows ONE principles:
     * Recipe-based type system
     * Single instance per runtime
     * Local-first architecture

2. AI Integration
   - Local LLM via MLX
   - Cloud providers via model context protocol
   - Provider abstraction layer
   - Model management system

3. Chat System
   - Uses TopicModel for messages
   - Real-time updates via ChannelManager
   - End-to-end encryption
   - Offline support

### Module Structure
```
app/
├── initialization/     # Setup logic
├── models/            # App models
├── (auth)/            # Auth routes
├── (screens)/         # Main screens
├── (tabs)/            # Tab navigation
└── src/
    ├── components/    # UI components
    ├── hooks/         # React hooks
    ├── models/        # Model implementations
    ├── types/         # TypeScript types
    └── utils/         # Utilities
```

## Development Workflow

### 1. Code Organization

- Follow feature-based organization
- Keep components small and focused
- Use TypeScript for type safety
- Follow React/Expo best practices

### 2. State Management

- Use ONE platform for core state
- React hooks for UI state
- Context for theme/localization
- Avoid redundant state

### 3. Error Handling

- Use typed error classes
- Proper error propagation
- User-friendly error messages
- Error recovery patterns

### 4. Testing

- Jest for unit tests
- Integration tests for core flows
- E2E tests for critical paths
- Performance benchmarks

## Building & Deployment

### Local Development
```bash
# Start development server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on iOS device
npx expo run:ios --device

# Clean build
npm run clean && npm run pod-install
```

### Production Build
```bash
# iOS Release
npm run build:ios

# Android Release
npm run build:android
```

## Core APIs

### 1. AI Provider Interface
```typescript
interface AIProvider {
  initialize(config: ProviderConfig): Promise<void>;
  generate(prompt: string, options?: GenerateOptions): Promise<Response>;
  cleanup(): Promise<void>;
}
```

### 2. Chat Interface
```typescript
interface ChatAPI {
  sendMessage(content: string): Promise<void>;
  getMessages(limit?: number): Promise<Message[]>;
  subscribeToUpdates(callback: UpdateCallback): Unsubscribe;
}
```

### 3. Model Management
```typescript
interface AIModelManager {
  // Model lifecycle management
  importFromUrl(url: string, knownModelId?: string): Promise<LLMDefinition>;
  importFromFile(fileUri: string, metadata: Partial<AIModelMetadata>): Promise<SHA256Hash<BLOB>>;
  deleteModel(filename: string): Promise<void>;
  
  // Model discovery and validation
  listModels(): Promise<AIModelMetadata[]>;
  getModelPath(filename: string): Promise<string>;
  getKnownModels(): KnownModelDefinition[];
  findKnownModel(id: string): KnownModelDefinition | undefined;
  
  // Model loading and validation
  loadModel(weightHash: SHA256Hash<BLOB>): Promise<{ data: ArrayBuffer; metadata: AIModelMetadata }>;
  validateAgainstKnown(metadata: AIModelMetadata): { valid: boolean; knownModel?: KnownModelDefinition; issues: string[] };
}
```

## Best Practices

### 1. Code Style
- Use TypeScript features appropriately
- Follow functional programming principles
- Keep functions pure when possible
- Use proper typing

### 2. Performance
- Optimize render cycles
- Use proper list virtualization
- Implement proper caching
- Monitor memory usage

### 3. Security
- Follow ONE security model
- Implement proper key management
- Use secure storage
- Validate all inputs

### 4. UI/UX
- Follow platform guidelines
- Implement proper loading states
- Handle errors gracefully
- Support accessibility

## Troubleshooting

### Common Issues

1. Build Errors
   - Clean build folders
   - Update dependencies
   - Check pod installation
   - Verify Xcode version

2. Runtime Errors
   - Check initialization order
   - Verify model availability
   - Check storage permissions
   - Monitor memory usage

3. Performance Issues
   - Profile render cycles
   - Check list performance
   - Monitor memory leaks
   - Verify cache usage

### Debug Tools
- React Native Debugger
- Flipper
- Xcode Instruments
- Chrome DevTools

## Contributing

### Pull Request Process
1. Create feature branch
2. Implement changes
3. Add tests
4. Update documentation
5. Submit PR

### Code Review Guidelines
- Verify type safety
- Check error handling
- Review performance impact
- Ensure test coverage

## Resources

### Documentation
- [ONE Platform](link-to-one-docs)
- [MLX Documentation](link-to-mlx-docs)
- [Expo Guides](link-to-expo-docs)
- [React Native](link-to-rn-docs)

### Tools
- [VSCode Setup](link-to-vscode-setup)
- [Debugging Tools](link-to-debug-tools)
- [Testing Tools](link-to-test-tools)

### References
- [API Documentation](link-to-api-docs)
- [Architecture Guide](link-to-arch-guide)
- [Style Guide](link-to-style-guide) 