# Chat System Documentation

## Overview

This document describes the chat system architecture in our React Native app, which builds on the ONE platform's messaging capabilities with additional features for AI integration and attachment handling.

## Architecture Overview

### Core Components

#### 1. **TopicModel** (ONE Platform)
- Manages chat topics (conversations)
- Handles 1-to-1 and group messaging
- Creates and manages channels for message exchange
- Provides real-time message synchronization via CHUM protocol

#### 2. **ChannelManager** (ONE Platform)
- Manages individual channels within topics
- Each participant owns their channel in 1-to-1 chats
- Handles message posting and retrieval
- Provides event-driven updates for new messages

#### 3. **ChatModel** (App Layer)
- Extends TopicModel with app-specific functionality
- Manages message formatting and display
- Integrates AI assistant capabilities
- Handles attachment processing

## Message Architecture

### Message Structure

```typescript
interface ChatMessage {
  $type$: 'ChatMessage';
  id: string;
  text: string;
  sender: SHA256IdHash<Person>;
  timestamp: number;
  attachments?: SHA256Hash[];
  reactions?: MessageReaction[];
  edited?: boolean;
  editTimestamp?: number;
  replyTo?: string;
}
```

### Two-Channel Pattern for 1-to-1 Chats

Following the ONE/Leute architecture:
1. Each participant owns one channel
2. Both participants write to their own channel
3. Both participants read from both channels
4. CHUM protocol synchronizes channels between devices

```
User A <-> User B Chat:
- Channel A (owned by User A)
- Channel B (owned by User B)
- Topic ID: "personA<->personB" (sorted)
```

## Attachment System

### Attachment Types

The attachment system supports various content types following one.leute patterns:

```typescript
type AttachmentType = 
  | 'blob'        // Binary files
  | 'clob'        // Text content
  | 'thinking'    // AI thinking content
  | 'image'       // Images with thumbnail support
  | 'video'       // Videos with thumbnail support
  | 'audio'       // Audio files
  | 'document'    // PDFs, documents
  | 'unknown';    // Fallback type
```

### Attachment Storage

#### BLOB Storage (Binary)
- Images, videos, audio files, documents
- Stored using `storeArrayBufferAsBlob()`
- Retrieved using `readBlobAsArrayBuffer()`

#### CLOB Storage (Text)
- AI thinking content
- Large text documents
- Stored using `storeUTF8Clob()`
- Retrieved using `readUTF8TextFile()`

### Attachment Factory Pattern

```typescript
// Factory creates appropriate view based on attachment type
export function createAttachmentView(
  attachment: ChatAttachment,
  props?: Partial<AttachmentViewProps>
): React.ReactElement | null
```

Components:
- `ImageAttachmentView` - Image display with tap to preview
- `VideoAttachmentView` - Video thumbnail with playback
- `AudioAttachmentView` - Audio player controls
- `DocumentAttachmentView` - Document icon with metadata
- `ThinkingAttachmentView` - AI thinking content display
- `UnknownAttachmentView` - Fallback for unknown types

### Attachment Caching

The `AttachmentCache` class provides:
- Memory-based caching with TTL
- Automatic type detection from file signatures
- Concurrent request deduplication
- Memory usage management
- Cache statistics

```typescript
const attachment = await attachmentCache.getAttachment(hash);
```

## AI Integration

### AI Message Handling

AI participants are treated as regular participants with special handling:

1. **AI Person Creation**
   ```typescript
   const aiPerson = await createAIPerson(modelId);
   ```

2. **AI Topic Creation**
   ```typescript
   const topic = await createTopic(myPersonId, aiPersonId);
   ```

3. **AI Message Processing**
   - User messages posted to user's channel
   - AI responses posted to AI's channel
   - Thinking content stored as CLOB attachments

### Thinking Content

AI thinking content is preserved and stored separately:

```typescript
interface ThinkingSegment {
  $type$: 'ThinkingSegment';
  id: string;
  type: 'thinking' | 'reasoning' | 'response' | 'raw';
  content: string;
  metadata: ThinkingSegmentMetadata;
}
```

Thinking storage flow:
1. Extract `<think>...</think>` tags from AI response
2. Store thinking content as CLOB
3. Add CLOB hash to message attachments
4. Display via `ThinkingAttachmentView`

## UI Components

### ChatMessageItem

The main message rendering component:
- Displays message text with Markdown support
- Renders attachments inline using factory pattern
- Shows sender information in group chats
- Handles message actions (copy, reply, etc.)
- Supports collapsible AI messages

### MessageList

Manages the chat message list:
- Efficient scrolling with FlashList
- Automatic scroll to bottom for new messages
- Message grouping by sender
- Timestamp display logic
- Pull-to-refresh for history loading

### InputToolbar

Handles message composition:
- Text input with auto-grow
- Attachment picker (future)
- Send button with loading states
- AI model selector for AI chats

## Real-time Updates

### Event Handling

The chat system uses ONE platform events:

```typescript
// Listen for new messages
topicModel.onMessagesUpdated.listen((topicId, timeOfEarliestChange) => {
  // Reload messages for the topic
});

// Listen for channel updates
channelManager.onUpdated.listen((channelId, timestamp) => {
  // Process new messages
});
```

### Message Synchronization

1. **Local Updates**: Immediate UI updates when sending
2. **Remote Updates**: CHUM protocol syncs with other devices
3. **Offline Support**: Messages queued when offline
4. **Conflict Resolution**: Last-write-wins based on timestamps

## Performance Optimizations

### Message Loading
- Pagination with `getRecentMessages()`
- Lazy loading of older messages
- Efficient diff updates for new messages

### Attachment Loading
- Asynchronous loading with loading states
- Cache layer prevents redundant loads
- Thumbnail support for media files
- Progressive loading for large files

### Memory Management
- Message list virtualization
- Attachment cache with size limits
- Automatic cleanup of old data

## Security Considerations

### Message Security
- End-to-end encryption via ONE platform
- Channel-based access control
- Cryptographic identity verification
- No server-side message storage

### Attachment Security
- Attachments encrypted at rest
- Hash-based content addressing
- Access controlled by channel membership
- No direct file system access

## Future Enhancements

### Planned Features
1. **Rich Media Support**
   - Image/video capture and upload
   - Voice message recording
   - File sharing with progress

2. **Message Features**
   - Message reactions
   - Message editing
   - Thread/reply support
   - Message search

3. **AI Enhancements**
   - Multi-turn conversations
   - Context awareness
   - Tool/function calling
   - Multiple AI model support

4. **Performance**
   - Attachment thumbnails generation
   - Progressive image loading
   - Message pre-caching
   - Background sync optimization

## Migration Notes

### From Legacy Patterns
- Old: `chat-with-[model]` topic IDs
- New: Standard `person<->person` format
- Migration handled automatically in `AITopicManager`

### Attachment System
- Replaces simple thinking display with comprehensive attachment system
- Supports multiple attachment types beyond thinking
- Follows one.leute patterns for consistency

## API Reference

### Key Hooks
- `useTopicMessages()` - Load messages for a topic
- `useMessageAttachments()` - Load attachments for a message
- `useChatModel()` - Access chat model instance
- `useAIChat()` - AI-specific chat functionality

### Key Functions
- `createTopic()` - Create new chat topic
- `sendMessage()` - Send a message
- `storeThinkingAsClob()` - Store thinking content
- `createAttachmentView()` - Render attachment

### Key Models
- `TopicModel` - Core messaging
- `ChannelManager` - Channel operations
- `ChatModel` - App-specific features
- `AIAssistantModel` - AI integration