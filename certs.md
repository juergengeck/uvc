# Message Certificates in Lama

This document outlines how the certificate system works in Lama, particularly for message authentication.

## Certificate System Overview

Certificates are a critical part of the trust system in Lama, based on the ONE core framework. They provide authentication, verification, and trust establishment between entities.

### Certificate Types

The system supports several types of certificates:

- **MessageSignature**: Used to authenticate and verify message senders
  - `system-message-authentication`: Used for system messages
  - `user-message-authentication`: Used for user messages
- **RoleCertificate**: Used to assign roles to users/personas
- **AffirmationCertificate**: Used to affirm the authenticity of an object
- **TrustKeysCertificate**: Used to certify trust in a profile's cryptographic keys
- **SignupCertificate**: Validates user registration

## Message Certificate Architecture

### Key Components

1. **TrustedKeysManager**
   - Accessed via `leuteModel.trust`
   - Provides methods for creating, verifying and managing certificates
   - The foundation of the certificate system

2. **MessageSignature**
   - A simple certificate object with the following structure:
   ```typescript
   {
     $type$: 'MessageSignature',
     signer: string, // 'SYSTEM', 'USER', etc.
     timestamp: number,
     certificate: string // Certificate type identifier
   }
   ```

3. **Attachments Mechanism**
   - Certificates are attached to messages via the `attachments` array
   - The message transformer checks for specific certificate types in attachments

## Message Certificate Types

### System Message Certificate

Used to authenticate system-generated messages:

```typescript
const messageSignature = {
  $type$: 'MessageSignature',
  signer: 'SYSTEM',
  timestamp: Date.now(),
  certificate: 'system-message-authentication'
};
```

### User Message Certificate

Used to authenticate user-generated messages:

```typescript
const messageSignature = {
  $type$: 'MessageSignature',
  signer: 'USER',
  timestamp: Date.now(),
  certificate: 'user-message-authentication'
};
```

## Certificate Workflow

### Creating Certificates

1. Create a MessageSignature object
2. Store it with `storeVersionedObject`
3. Add the resulting hash to the message's `attachments` array

### Example: Adding a Certificate to a User Message

```typescript
// Create message signature
const messageSignature = {
  $type$: 'MessageSignature',
  signer: 'USER', // Indicates a user message
  timestamp: Date.now(),
  certificate: 'user-message-authentication'
};

// Store signature and get hash
const signatureResult = await storeVersionedObject(messageSignature);

// Create message with attachment
const message = {
  $type$: 'ChatMessage',
  text: 'Hello, world!',
  sender: myPersonId,
  attachments: []
};

// Add signature to message attachments
if (signatureResult && signatureResult.hash) {
  message.attachments.push(signatureResult.hash);
}

// Send the message
await channelManager.postToChannel(
  channelId,
  message,
  ownerIdHash,
  undefined,
  myPersonId
);
```

### Message Classification and Certificate Verification

The system uses a combination of sender identity, explicit type flags, and certificates to classify messages. This happens in the `transformToUIMessage` function:

```typescript
// System message detection using metadata
const isSystemMessage = 
  // Check for explicit system property if it exists
  ('isSystem' in message && message.isSystem === true);

// Check for certificates in attachments
const hasSystemCertificate = message.attachments?.some(attachment => {
  return attachment.toString().includes('system-message-authentication');
}) || false;

const hasUserCertificate = message.attachments?.some(attachment => {
  return attachment.toString().includes('user-message-authentication');
}) || false;

// Check if sender matches current user
const senderMatchesUser = myPersonId ? 
  message.sender.toString() === myPersonId.toString() : false;

// Message classification
const isSystem = isSystemMessage || hasSystemCertificate;
const isUser = senderMatchesUser && !isSystemMessage && !hasSystemCertificate;
const isAI = isAISender ? isAISender(message.sender) : false;
```

#### Classification Logic

1. **System Messages**:
   - Must have `isSystem: true` property, OR
   - Must have a `system-message-authentication` certificate

2. **User Messages**:
   - Must match the current user's ID
   - Cannot be a system message (no system property or certificate)
   - Should have a `user-message-authentication` certificate (optional for backward compatibility)

3. **AI Messages**:
   - Determined by the `isAISender` function which checks against known AI contacts
   - This check is separate from certificate verification

#### Certificate Lookup Process

1. Look for certificate hashes in the message's `attachments` array
2. For each attachment hash:
   - Check if the hash string contains the certificate type identifier
   - Classify the message based on the certificate type found

## Implementation in ChatModel

The ChatModel implements certificate creation for all user messages sent through the platform:

```typescript
async sendMessage(text: string) {
  // ... other code ...
  
  // Create message object with attachments array
  const message: ChatMessage = {
    $type$: 'ChatMessage',
    text,
    sender: myId,
    attachments: []
  };

  // Add user certificate
  const certificateHash = await this.createUserMessageCertificate();
  if (certificateHash) {
    message.attachments = message.attachments || [];
    message.attachments.push(certificateHash);
  }
  
  // ... send message ...
}
```

## Trust Management

The `TrustedKeysManager` provides methods for more complex certificate operations:

1. **Affirming Objects**:
   ```typescript
   await leuteModel.trust.affirm(dataHash);
   ```

2. **Creating Certificates**:
   ```typescript
   await leuteModel.trust.certify(
     'RoleCertificate',
     {
       person: personId,
       role: roleName,
       app: appName
     }
   );
   ```

3. **Verifying Certificates**:
   ```typescript
   const certificates = await leuteModel.trust.getCertificatesOfType(
     objectHash,
     'AffirmationCertificate'
   );
   ```

4. **Refreshing Certificate Caches**:
   ```typescript
   await leuteModel.trust.refreshCaches();
   ```

## Advanced Certificate Verification

For more rigorous verification, the system can load and verify certificates using the `getObjectByIdHash` function:

```typescript
// Load each signature object
for (const hash of signatureHashes) {
  try {
    const signatureResult = await getObjectByIdHash(ensureIdHash(hash.toString()));
    
    if (!signatureResult || !signatureResult.obj) {
      console.warn(`Signature object not found: ${hash.toString()}`);
      continue;
    }
    
    if (signatureResult.obj.$type$ === 'MessageSignature') {
      // Verify certificate type
      const certificate = signatureResult.obj.certificate || '';
      // Additional verification can be done here, such as:
      // - Validating the signer against expected values
      // - Checking timestamp for expiration
      // - Verifying against a trusted key registry
    }
  } catch (err) {
    console.error(`Error loading signature ${hash.toString()}:`, err);
  }
}
```

## Best Practices

1. **Consistent Certificate Types**: Use consistent certificate types for each message category
2. **Proper Storage**: Always store certificates before referencing them in attachments
3. **Error Handling**: Implement proper error handling for certificate creation failures
4. **Certificate Verification**: Always check for the appropriate certificate when processing messages
5. **Type Safety**: Use TypeScript interfaces to ensure certificate structure consistency
6. **Backwards Compatibility**: Maintain backward compatibility with messages that don't have certificates
7. **Performance Optimization**: Cache certificate verification results when appropriate
8. **Multiple Certificates**: Support multiple certificates per message for different verification purposes

# Certificate Management and Message Classification in Lama

## Overview
This document outlines how certificates are used to classify and authenticate messages in the Lama application, focusing on the implementation for system and user messages. It explains the issues encountered after removing content pattern matching for system messages and proposes solutions.

## Existing Certificate System

### 1. Foundation Components

- **TrustedKeysManager**: Part of `LeuteModel` (accessed as `leuteModel.trust`), provides the core certificate creation, verification, and management functionality.
- **MessageSignature**: Custom objects used to certify messages, containing fields like `signer`, `timestamp`, and `certificate`.
- **Versioned Object Storage**: Stores certificates as versioned objects that can be referenced by hash.

### 2. System Message Implementation

System messages are identified and verified through two mechanisms:

- **isSystem Property**: Messages have an `isSystem: true` flag set when created.
- **Certificate Attachments**: System messages have a `MessageSignature` object attached with `certificate: 'system-message-authentication'`.

The `AIAssistantModel` handles creating these system messages:

```typescript
const initialMessage = {
  $type$: 'ChatMessage',
  text: `[SYSTEM] Welcome to your conversation with ${modelName}.`,
  sender: (someone as any).idHash,
  attachments: [] as SHA256Hash[],
  isSystem: true // Explicitly set the system flag
};

// Create a message signature for this system message
const messageSignature = {
  $type$: 'MessageSignature',
  signer: 'SYSTEM',
  timestamp: Date.now(),
  certificate: 'system-message-authentication'
};

// Store the signature
const signatureResult = await storeVersionedObject(messageSignature);

// Add the signature to the message attachments
if (signatureResult && signatureResult.hash) {
  initialMessage.attachments.push(signatureResult.hash);
}
```

## The Problem

When we removed content pattern matching for detecting system messages, messages stopped appearing. Analysis of the code revealed the issue:

### In `useChatMessages.ts`:

The hook that loads messages still relies on content pattern matching to detect system messages:

```typescript
// Check if this is a system message
const isSystemMessage = msg.data.text?.startsWith('Chat initialized') ||
                       msg.data.text?.startsWith('Topic created');
```

This logic directly affects message classification when calling `createMessageCard`:

```typescript
createMessageCard(
  { ...chatMessage, idHash: msg.channelEntryHash },
  !hasDifferentSender && !isSystemMessage, // isUser
  isAI, // isAI - use the explicit check
  isSystemMessage, // Flag used to set isSystem in the message card
  msg.creationTime || new Date()
)
```

### In `transformers.ts`:

We changed the detection logic to use only metadata and certificates:

```typescript
// System message detection using only metadata
const isSystemMessage = 
  // Check for explicit system property if it exists
  ('isSystem' in message && message.isSystem === true);

// Check for message certificates
const hasSystemCertificate = message.attachments?.some(attachment => {
  return attachment.toString().includes('system-message-authentication');
}) || false;
```

This creates a mismatch between how messages are initially classified when loading from the channel and how they're transformed for display.

## Solution

We need to align the message classification logic across the system:

1. **Update `useChatMessages`** to check for both property and certificate:
   ```typescript
   // Check if this is a system message using metadata and certificates
   const isSystemMessage = 
     // First check for explicit system property
     (msg.data.isSystem === true) ||
     // Then check certificate attachments if available
     (msg.data.attachments?.some(att => 
       att.toString().includes('system-message-authentication')));
   ```

2. **Add Certificate Support for User Messages**:
   ```typescript
   // When sending a user message
   const userMessageSignature = {
     $type$: 'MessageSignature',
     signer: 'USER',
     timestamp: Date.now(),
     certificate: 'user-message-authentication'
   };
   
   const signatureResult = await storeVersionedObject(userMessageSignature);
   message.attachments.push(signatureResult.hash);
   ```

3. **Standardize Message Creation**: Create a utility function to consistently create messages with proper typing and certificates.

## Implementation Plan

1. Update `useChatMessages.ts` to check for the `isSystem` property and system certificates.
2. Create a message utility service for centralized message creation and certificate management.
3. Update `ChatModel.sendMessage()` to add certificates to user messages.
4. Maintain certificate checking in the transformer function but ensure compatibility with existing messages.

This approach will ensure consistent message classification while adding certificate support for user messages. 