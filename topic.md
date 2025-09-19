# Topics and Entity Management

## Table of Contents

1. [Topics](#topics)
   - [Initialization](#initialization)
   - [Topic ID Structure](#topic-id-structure)
   - [Creating a Topic](#creating-a-topic)
   - [Working with Topic Rooms](#working-with-topic-rooms)
   - [Managing Topic Sequences](#managing-topic-sequences)
   - [Channels vs Topics](#channels-vs-topics)
2. [Entity Relationship Overview](#entity-relationship-overview)
3. [Person Management](#person-management)
   - [Creating a Person](#creating-a-person)
   - [Person Description Types](#person-description-types)
4. [Someone Management](#someone-management)
   - [Creating a Someone](#creating-a-someone)
   - [Adding Contacts](#adding-contacts)
5. [Profile Management](#profile-management)
   - [Creating a Profile](#creating-a-profile)
   - [Managing Person Descriptions](#managing-person-descriptions)
6. [Persistence Flow](#persistence-flow)
   - [Someone Persistence](#someone-persistence)
   - [Profile Persistence](#profile-persistence)
   - [Topic Persistence](#topic-persistence)
   - [Channel Persistence](#channel-persistence)
   - [Message Persistence](#message-persistence)
   - [General Object Persistence](#general-object-persistence)
   - [Persistence Best Practices](#persistence-best-practices)
7. [Reading Objects from Storage](#reading-objects-from-storage)

## Topics

### Initialization

Topic creation follows a specific sequence that must be followed to ensure proper initialization and storage:

1. Create topic using `topicModel.createGroupTopic` or similar methods
   - This creates the channel with a null head
   - Stores the topic object
   - Adds it to the registry

2. Enter the topic room with `topicModel.enterTopicRoom`
   - This validates the topic exists in registry
   - Sets up the channel connection

3. Send an initial message with `topicRoom.sendMessage`
   - This initializes the channel head
   - Triggers storage events that complete topic registration

4. Wait for storage event completion
   - Storage layer emits event when message is stored
   - ChannelManager's `processNewVersion` handles event
   - Head pointer is updated
   - Channel is fully initialized

This sequence is required because:
- The channel needs a valid head to be properly initialized
- Storage events from the first message complete the topic registration
- The sequence cannot be reordered or have steps skipped
- Messages cannot be retrieved until the storage event completes

#### Example:

```typescript
// Create a topic (creates channel with null head)
const topic = await topicModel.createGroupTopic(name, id);

// Enter topic room
const topicRoom = await topicModel.enterTopicRoom(id);

// Send initial message to initialize channel and trigger storage events
await topicRoom.sendMessage("Topic created");

// Wait for storage event to complete before trying to read messages
await new Promise<void>((resolve) => {
  const unsubscribe = channelManager.onUpdated.listen(() => {
    unsubscribe();
    resolve();
  });
});

// Now the channel is fully initialized and messages can be retrieved
const messages = await topicRoom.retrieveAllMessages();
```

### Topic ID Structure

Each topic has a unique ID that identifies it in the system. The format of the topic ID depends on the type of topic:

1. **One-to-One Topics**: For direct conversations between two people, the topic ID follows this format:
   ```
   [personId1]<->[personId2]
   ```
   Where the person IDs are sorted alphabetically and joined with the `<->` delimiter.

   Example:
   ```typescript
   // Creating a one-to-one topic ID manually
   const topicChannelId = [myPersonId, otherPersonId].sort().join('<->');
   ```

2. **AI Chat Topics**: For conversations with AI models, the topic ID follows this format:
   ```
   chat-with-[model-name]
   ```
   Where `[model-name]` is a slugified version of the model name (lowercase, with spaces replaced by hyphens).

   Example:
   ```typescript
   // Creating an AI chat topic ID
   const modelName = "DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M";
   const slugifiedName = modelName
     .toLowerCase()
     .replace(/\s+/g, '-')
     .replace(/[^a-z0-9-]/g, '');
   const topicId = `chat-with-${slugifiedName}`;
   // Result: "chat-with-deepseek-r1-distill-qwen-15b-q4km"
   ```

3. **Group Topics**: For group conversations, the topic ID is typically the group name.

4. **System Topics**: Special topics like "everyone" or "glue" topics have specific IDs assigned during system initialization.

### Accessing Topic IDs

There are several ways to access a topic ID:

1. **Directly from a Topic object**:
   ```typescript
   // Access the ID directly from a topic object
   const topicId = topic.id;
   ```

2. **Getting a topic hash by ID**:
   ```typescript
   // Get the topic hash from an ID
   const topicHash = await topicModel.topics.queryHashById(topicId);
   ```

3. **Using React hooks** (in UI components):
   ```typescript
   // Get topic ID using the provided hook
   const topicId = useTopicId(topicModel, myPersonId, otherPersonId);
   ```

The topic ID is used for:
- Routing to chat views
- Creating or entering topic rooms
- Sending messages to specific conversations
- Retrieving topic information

For one-to-one conversations, the topic ID is deterministic - it will always be the same for the same two people, which allows the system to find existing conversations rather than creating duplicates.

### Creating a Topic

Topics are conversation channels between users. There are several types of topics:

- One-to-one topics (between two persons)
- Group topics
- Everyone topics (system-wide)
- Glue topics (for system messages)

```typescript
// Create a one-to-one topic
const topic = await topicModel.createOneToOneTopic(myPersonId, otherPersonId);

// Create a group topic
const topic = await topicModel.createGroupTopic(groupName);

// System topics (usually created during initialization)
const everyoneTopic = await topicModel.createEveryoneTopic();
const glueTopic = await topicModel.createGlueTopic();
```

### Working with Topic Rooms

To interact with a topic (e.g., to send or receive messages), you need to enter a topic room:

```typescript
// Enter a topic room using the topic ID
const topicRoom = await topicModel.enterTopicRoom(topicId);

// Send a message in the topic room
await topicRoom.sendMessage("Hello world!");

// Send a message with attachments
await topicRoom.sendMessageWithAttachmentAsHash(
    "Check this out",
    [attachmentHash],
    undefined,
    null
);
```

### Managing Topic Sequences

Topic sequences refer to the order and grouping of messages within a topic. The system handles messages in sequences based on the sender.

Messages in a topic are grouped into sequences based on the author. A new sequence starts when:

- It's the first message in the topic
- The current message has a different author than the previous message

The sequence functionality helps in displaying messages in a chat-like interface, where consecutive messages from the same author are grouped together.

#### Implementing Sequence Logic

```typescript
function isFirstMessageInSequence(index: number): boolean {
    return index > 0 
        ? messages[index].authorIdHash !== messages[index - 1].authorIdHash 
        : true;
}
```

This function determines if a message starts a new sequence by checking if it has a different author than the previous message, or if it's the first message.

#### Topic Channel Settings

Topics can have various channel settings that affect how messages are handled:

```typescript
// Example channel settings
channelManager.setChannelSettingsMaxSize(topic.channel, 1024 * 1024 * 100); // 100MB
channelManager.setChannelSettingsAppendSenderProfile(topic.channel, true);
channelManager.setChannelSettingsRegisterSenderProfileAtLeute(topic.channel, true);
```

These settings control:
- Maximum channel size
- Whether to append sender profile information
- Whether to register sender profiles in the Leute system

### Channels vs Topics

Unlike topics, channels do not require an initial "welcome" message to work properly. Channels can be created with `channelManager.createChannel()` and will function correctly without an immediate message post.

Topics are built on top of channels and have additional requirements:
1. They need an initial message to properly trigger events in the storage system
2. Each topic maintains a reference to its underlying channel using the channel's info hash (`SHA256IdHash<ChannelInfo>`)
3. The channel info hash is obtained when creating the channel via `channelManager.createChannel()`

Example of proper channel creation and reference:
```typescript
// Create a channel and get its info hash
const channelInfoIdHash = await channelManager.createChannel(channelId);

// Create a topic that references the channel
const topic: Topic = {
    $type$: 'Topic',
    id: channelId,
    name: 'My Topic',
    channel: channelInfoIdHash // Use the hash returned from createChannel
};
```

### Topic Creation Process

1. **Check Existence**:
   - Before creating a topic, check if it already exists using `findTopicById`
   - If found, return the existing topic

2. **Create Channel**:
   - Create a new channel using `channelManager.createChannel`
   - This returns a `SHA256IdHash<ChannelInfo>` that uniquely identifies the channel
   - For system topics: Use predefined channel IDs ('everyone', 'glue')
   - For group topics: Use the generated topic ID

3. **Create Topic**:
   - Create a new Topic object with:
     - Appropriate ID
     - Human-readable name
     - Channel reference using the channel info hash from step 2

4. **Cache Management**:
   - Store the topic in the local cache
   - Emit an update event to notify listeners

5. **Initialize Topic** (if needed):
   - Send an initial message to trigger storage system events
   - This step is required for proper topic initialization

### Creating AI Chat Topics

When creating a chat with an AI model, use the content-based approach for deterministic topic IDs:

```typescript
// Get the Person ID for the LLM
const personId = await getPersonIdForLLM(llmName);

// For AI chats, use "chat-with-[model-name]" format
const modelName = llmName;
const slugifiedName = modelName
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9-]/g, '');
const topicId = `chat-with-${slugifiedName}`;

// Create a channel with this ID
await channelManager.createChannel(topicId);

// Create a topic using this channel
await topicModel.createGroupTopic(
  `Chat with ${llmName}`,  // topic name
  topicId,                 // topic ID
  null                     // channel owner (default)
);
```

This approach ensures deterministic, content-based IDs for all topic types, aligning with our content-addressed database architecture and matching one.leute's implementation for regular chats.

## Entity Relationship Overview

The system uses several related entities to represent users and communication:

- **Person**: Represents a user's identity in the system
- **Someone**: A container that can hold multiple Person identities
- **Profile**: A view/representation of a Person with specific details like name, avatar, etc.
- **Topic**: A conversation channel between users

The relationship hierarchy is:
- A Someone can contain multiple Person identities
- Each Person can have multiple Profiles
- Topics connect Profiles/Persons for communication

## Person Management

### Creating a Person

A Person is typically created as part of creating a Someone or directly through the LeuteModel.

```typescript
// A person is usually created when creating a Someone
const someoneId = await leuteModel.createSomeoneWithShallowIdentity(email);
const someone = await SomeoneModel.constructFromLatestVersion(someoneId);
const personId = await someone.mainIdentity(); // This is the person ID
```

### Person Description Types

Profiles store information about a person through a collection of PersonDescription objects. The system uses various PersonDescription types from the `@refinio/one.models/lib/recipes/Leute/PersonDescriptions.js` module.

#### Common PersonDescription Types

1. **PersonName**: Stores the name of the person
   ```typescript
   const personName: PersonName = {
       $type$: 'PersonName',
       name: 'John Doe'
   };
   ```

2. **ProfileImage**: Stores the profile picture
   ```typescript
   const profileImage: ProfileImage = {
       $type$: 'ProfileImage',
       image: imageHash // SHA256Hash<BLOB>
   };
   ```

3. **PersonStatus**: Represents a status update for the person
   ```typescript
   const personStatus: PersonStatus = {
       $type$: 'PersonStatus',
       status: 'Available',
       timestamp: new Date()
   };
   ```

4. **OrganisationName**: Stores the organization name (if applicable)
   ```typescript
   const organisationName: OrganisationName = {
       $type$: 'OrganisationName',
       name: 'Example Corp'
   };
   ```

## Someone Management

### Creating a Someone

A Someone entity is a container that can hold multiple identities (Person entities). Creating a Someone typically also creates the main Person identity.

#### UI Flow

1. Navigate to the Someone creation route (e.g., `/someone/create`)
2. Fill in the required information (name, email, optional avatar)
3. Submit the form to create the Someone

#### Programmatic Creation

```typescript
// Basic creation
const someoneId = await leuteModel.createSomeoneWithShallowIdentity(email);

// Creation with description (name, email, optional avatar)
const someoneId = await createSomeoneWithDescription(
    leuteModel,
    name,
    email,
    imageHash // optional
);
```

The `createSomeoneWithDescription` utility function:
1. Creates a Someone with a shallow identity
2. Gets the Someone model
3. Gets the main profile
4. Adds person descriptions (name)
5. Adds profile image if provided
6. Adds email if provided
7. Saves the profile changes
8. Returns the main identity (Person ID)

### Adding Contacts

Contacts (Someone entities) can be added to the system in two ways: manually through the UI or automatically through message exchanges.

#### Manual Contact Creation

Users can explicitly create new contacts through the UI:

```typescript
// Creating a contact manually
const createSomeone = async () => {
    // 1. Create a Someone entity with a shallow identity (Person)
    const someoneIdHash = await leuteModel.createSomeoneWithShallowIdentity();
    
    // 2. Load the created Someone model
    const someoneModel = await SomeoneModel.constructFromLatestVersion(someoneIdHash);
    
    // 3. Get the main profile of the Someone
    const profile = await someoneModel.mainProfile();
    
    // 4. Update the profile with details
    profile.personDescriptions.push({$type$: 'PersonName', name: 'Contact Name'});
    profile.communicationEndpoints.push({$type$: 'Email', email: 'contact@example.com'});
    
    // 5. Persist the changes
    await profile.saveAndLoad();
};
```

#### Automatic Contact Registration from Messages

The system can automatically register profiles of people who send messages as contacts:

```typescript
// In Topic Channel Settings (typically set during initialization)
channelManager.setChannelSettingsAppendSenderProfile(topic.channel, true);
channelManager.setChannelSettingsRegisterSenderProfileAtLeute(topic.channel, true);
```

These settings enable:
1. `setChannelSettingsAppendSenderProfile`: Attaches the sender's profile information to messages
2. `setChannelSettingsRegisterSenderProfileAtLeute`: Automatically adds the sender as a contact in the LeuteModel

#### Contact Storage and Retrieval

Contacts are stored in the system and can be retrieved in several ways:

```typescript
// Get all contacts (Someone objects)
const allContacts = await leuteModel.others();

// Specific contact retrieval
const specificContact = await SomeoneModel.constructFromLatestVersion(someoneId);

// Querying with filtering
const contactsIterator = leuteModel.someoneIterator({
    // Query options for filtering and pagination
    limit: 20,
    offset: 0,
    // Additional filter criteria...
});
```

## Profile Management

### Creating a Profile

A Profile represents a specific view of a Person and belongs to a Someone. A Someone can have multiple profiles for different contexts.

#### UI Flow

1. Navigate to the Profile creation route (e.g., `/profile/create/:someoneId`)
2. Select the Person identity if the Someone has multiple identities
3. Fill in the required profile information (name, email, optional avatar)
4. Submit the form to create the Profile

#### Programmatic Creation

```typescript
// Create a profile for an existing Person
const profile = await leuteModel.createProfileForPerson(
    personId,
    undefined, // options
    someoneId
);

// Or create a profile with a new identity for the Someone
const profile = await leuteModel.createShallowIdentityForSomeone(someoneId);

// Using the utility function:
const profile = await createProfile(
    leuteModel,
    someoneId,
    personId // optional - if undefined, creates a new identity
);

// Update the profile with details
await updateProfilePersonDescription(profile, profileDetails);
await profile.saveAndLoad();
```

### Managing Person Descriptions

The Profile model contains an array of PersonDescription objects:

```typescript
profile.personDescriptions: PersonDescriptionTypes[]
```

#### Adding Person Descriptions

There are several approaches for adding person descriptions to a profile:

##### 1. Direct Addition

The simplest approach is to directly push a new description to the array:

```typescript
// Add a name description
profile.personDescriptions.push({
    $type$: 'PersonName', 
    name: 'John Doe'
});

// Add a profile image
profile.personDescriptions.push({
    $type$: 'ProfileImage',
    image: imageHash
});

// Remember to persist changes
await profile.saveAndLoad();
```

##### 2. Update or Add Pattern

For descriptions that should be unique per profile (like PersonName or ProfileImage), use a find-then-update-or-add pattern:

```typescript
// Find existing name description
const existingPersonName = profile.personDescriptions.find(
    desc => desc.$type$ === 'PersonName'
) as PersonName | undefined;

if (existingPersonName) {
    // Update existing
    existingPersonName.name = 'New Name';
} else {
    // Add new
    profile.personDescriptions.push({
        $type$: 'PersonName',
        name: 'New Name'
    });
}

// Remember to persist changes
await profile.saveAndLoad();
```

##### 3. Using Helper Functions

The system provides utility functions that handle the update-or-add pattern automatically:

```typescript
// This function handles finding, updating, or adding multiple description types
await updateProfilePersonDescription(profile, {
    name: 'John Doe',           // Updates or adds PersonName
    avatar: imageArrayBuffer,   // Updates or adds ProfileImage
    organisationName: 'Acme'    // Updates or adds OrganisationName
});

// The function handles persistence internally
```

##### 4. Time-Series Descriptions

For descriptions that represent a time series (like status updates), always add a new entry with a timestamp:

```typescript
// Add a new status update
profile.personDescriptions.push({
    $type$: 'PersonStatus',
    status: 'Available',
    timestamp: new Date()
});

// Later, add another status (don't replace the old one)
profile.personDescriptions.push({
    $type$: 'PersonStatus',
    status: 'Away',
    timestamp: new Date()
});

await profile.saveAndLoad();
```

When reading time-series descriptions, you typically want the most recent one:

```typescript
// Get all status descriptions
const allStatuses = profile.personDescriptions.filter(
    desc => desc.$type$ === 'PersonStatus'
) as PersonStatus[];

// Get the most recent status
const mostRecentStatus = allStatuses.reduce((latest, current) => 
    latest.timestamp > current.timestamp ? latest : current
);
```

#### Retrieving Person Descriptions

To retrieve descriptions of a specific type:

```typescript
// Get all descriptions of a specific type
const personNames = profile.personDescriptions.filter(
    desc => desc.$type$ === 'PersonName'
) as PersonName[];

// Many profile models also have helper methods
const profileImages = profile.descriptionsOfType('ProfileImage');
```

## Persistence Flow

Understanding when and how to persist objects is crucial for maintaining data integrity and ensuring the system functions correctly. Different types of objects have different persistence patterns.

### Someone Persistence

1. **Initial Creation**: When calling `leuteModel.createSomeoneWithShallowIdentity()`, the Someone object is immediately persisted to the database.
   ```typescript
   // Persisted automatically when created
   const someoneId = await leuteModel.createSomeoneWithShallowIdentity(email);
   ```

2. **Profile Association**: The main profile is automatically created and persisted as part of the Someone creation process.

3. **Updates**: After making changes to a Someone (like adding identities), you must call `await someoneModel.saveAndLoad()` to persist those changes.
   ```typescript
   // After adding an identity or making other changes
   someone.identities.push(newPersonId);
   await someone.saveAndLoad(); // Explicit persistence required
   ```

4. **When to Persist**: Persist Someone objects:
   - After initial creation (automatic)
   - After adding or removing identities (manual)
   - After changing any properties of the Someone object (manual)

### Profile Persistence

1. **Initial Creation**: Profiles are persisted when initially created through methods like `leuteModel.createProfileForPerson()` or `leuteModel.createShallowIdentityForSomeone()`.
   ```typescript
   // Persisted automatically when created
   const profile = await leuteModel.createProfileForPerson(personId);
   ```

2. **Updates**: After making changes to a Profile (like updating descriptions, adding communication endpoints, etc.), you must explicitly call `await profile.saveAndLoad()` to persist those changes.
   ```typescript
   // Example of updating and persisting profile changes
   profile.personDescriptions.push({$type$: 'PersonName', name: name});
   if (imageHash) {
       profile.personDescriptions.push({
           $type$: 'ProfileImage',
           image: imageHash
       });
   }
   await profile.saveAndLoad(); // This is when changes are actually saved to the database
   ```

3. **In UI Components**: In components like `ProfileCreate` and `CreateSomeone`, persistence occurs at the end of the workflow after all user inputs have been collected and processed.

4. **When to Persist**: Persist Profile objects:
   - After initial creation (automatic)
   - After adding, updating, or removing person descriptions (manual)
   - After adding, updating, or removing communication endpoints (manual)
   - After any changes to profile properties (manual)

### Topic Persistence

1. **Creation**: Topics are persisted immediately upon creation via methods like `topicModel.createOneToOneTopic()` or `topicModel.createGroupTopic()`.
   ```typescript
   // Persisted automatically when created
   const topic = await topicModel.createOneToOneTopic(myPersonId, otherPersonId);
   ```

2. **Channel Settings**: Channel settings are applied and persisted immediately when calling methods like `channelManager.setChannelSettingsMaxSize()`.
   ```typescript
   // Settings are persisted automatically
   channelManager.setChannelSettingsMaxSize(topic.channel, 1024 * 1024 * 100);
   ```

3. **Initialization**: Remember that topics require an initial message to be fully initialized. This initial message is also persisted automatically.
   ```typescript
   // Message is persisted automatically
   await topicRoom.sendMessage("Initial topic setup message");
   ```

4. **When to Persist**: Persist Topic objects:
   - After initial creation (automatic)
   - When changing topic settings (automatic)
   - After sending initial messages (automatic)

### Channel Persistence

1. **Creation**: Channels are persisted immediately upon creation with `channelManager.createChannel()`.
   ```typescript
   // Persisted automatically when created
   const channelId = await channelManager.createChannel(channelName, owner);
   ```

2. **Settings**: Channel settings are applied and persisted immediately when configured.
   ```typescript
   // Settings are persisted automatically
   channelManager.setChannelSettingsMaxSize(channelId, maxSize);
   ```

3. **Access Rights**: When adding or modifying access rights to a channel, those changes are persisted immediately.
   ```typescript
   // Access rights are persisted automatically
   await createAccess([
       {
           id: channelIdHash,
           person: [personId],
           group: [],
           mode: SET_ACCESS_MODE.ADD
       }
   ]);
   ```

4. **When to Persist**: Persist Channel objects:
   - After initial creation (automatic)
   - When changing channel settings (automatic)
   - When modifying access rights (automatic)
   - Unlike topics, channels don't require initial messages to function

### Message Persistence

1. **Sending Messages**: When sending a message through a topic room, the message is persisted automatically.
   ```typescript
   // Message is persisted automatically
   await topicRoom.sendMessage("Hello world!");
   ```

2. **Messages with Attachments**: When sending messages with attachments, both the message and attachments are persisted automatically.
   ```typescript
   // All content is persisted automatically
   await topicRoom.sendMessageWithAttachmentAsFile(
       "Check this file",
       [file],
       undefined,
       channelOwner
   );
   ```

3. **Attachment Upload**: When uploading a file to be used as an attachment, it should be persisted before referencing it in a message.
   ```typescript
   // First persist the file
   const blobDescriptor = await storeFileWithBlobDescriptor(file);
   
   // Then send a message referencing it (also automatically persisted)
   await topicRoom.sendMessageWithAttachmentAsHash(
       "Check this out",
       [blobDescriptor.hash],
       undefined,
       null
   );
   ```

4. **When to Persist**: Persist Message objects:
   - When sending messages (automatic)
   - When sending attachments (automatic)
   - Before referencing external content in messages (manual)

### General Object Persistence

1. **Unversioned Objects**: For general objects that don't have special handling, use the storage API directly:
   ```typescript
   import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
   
   // Persist a custom object
   const myObject = { $type$: 'MyCustomType', data: 'Something' };
   const result = await storeUnversionedObject(myObject);
   ```

2. **Binary Data (BLOBs)**: For binary data like images, files, etc.:
   ```typescript
   import { storeBlob } from '@refinio/one.core/lib/storage-blob.js';
   
   // Persist binary data
   const blobHash = await storeBlob(arrayBuffer);
   ```

3. **When to Persist**: Persist general objects:
   - Before referencing them in other objects
   - As soon as they're created
   - Before attempting to share them with other users

### Persistence Best Practices

1. **Batch Changes**: When making multiple changes to the same object, batch them together before persisting.
   ```typescript
   // Inefficient
   profile.personDescriptions.push(desc1);
   await profile.saveAndLoad();
   profile.personDescriptions.push(desc2);
   await profile.saveAndLoad();
   
   // Efficient
   profile.personDescriptions.push(desc1);
   profile.personDescriptions.push(desc2);
   await profile.saveAndLoad(); // Single persistence operation
   ```

2. **Handle Errors**: Always handle persistence errors, as they might indicate storage problems or version conflicts.
   ```typescript
   try {
       await profile.saveAndLoad();
   } catch (error) {
       console.error('Failed to save profile:', error);
       // Implement appropriate error handling
   }
   ```

3. **Check Persistence Patterns**: Some objects persist automatically, others require explicit persistence:
   - Automatic persistence: Topics, Channels, Messages, initial creation of Someone/Profile objects
   - Manual persistence: Updates to existing Someone/Profile objects, custom objects

4. **Persistence Timing**: Be mindful of when you persist objects:
   - Persist as late as possible when making multiple related changes
   - Persist as early as necessary when creating objects that will be referenced elsewhere
   - Persist before sharing objects with other users or systems

5. **Avoid Race Conditions**: When dealing with objects that might be modified concurrently, use locks or versioning checks:
   ```typescript
   const profile = await ProfileModel.constructFromLatestVersion(profileId);
   // Apply changes...
   
   try {
       await profile.saveAndLoad();
   } catch (error) {
       if (error.message.includes('version conflict')) {
           // Handle version conflict - reload and try again
       }
   }
   ```

Following these persistence patterns ensures data integrity, minimizes storage operations, and helps prevent issues like data loss or inconsistency.

## Reading Objects from Storage

Once objects are stored in the system, they can be retrieved using their hash. Different types of objects require different retrieval methods.

### Basic Object Retrieval

There are three main methods to read objects from storage depending on the type of object:

1. **For unversioned objects** (like message attachments, general objects):
   ```typescript
   import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
   
   const object = await getObject(hash);
   ```
   
   For objects with a specific type:
   ```typescript
   import {getObjectWithType} from '@refinio/one.core/lib/storage-unversioned-objects.js';
   
   const typedObject = await getObjectWithType<MyType>(hash);
   ```

2. **For versioned ID objects** (like Person, Someone, Profile):
   ```typescript
   import {getIdObject} from '@refinio/one.core/lib/storage-versioned-objects.js';
   
   const idObject = await getIdObject(idHash);
   ```
   
   To get a specific version:
   ```typescript
   import {getObjectByIdHash} from '@refinio/one.core/lib/storage-versioned-objects.js';
   
   const versionedObject = await getObjectByIdHash(idHash);
   ```

3. **For binary data (BLOBs)** (like images, files):
   ```typescript
   import {readBlobAsArrayBuffer} from '@refinio/one.core/lib/storage-blob.js';
   
   const arrayBuffer = await readBlobAsArrayBuffer(blobHash);
   ```

### Model Object Retrieval

The system provides higher-level methods to load model objects with their functionality:

```typescript
// Load a Someone model with the latest version
const someone = await SomeoneModel.constructFromLatestVersion(someoneId);

// Load a Profile model with the latest version
const profile = await ProfileModel.constructFromLatestVersion(profileId);

// Load a Profile by specific fields
const specificProfile = await ProfileModel.constructFromLatestVersionByIdFields(
    personId,
    ownerId,
    profileId
);
```

### Loading and Monitoring Someone Data Example

Here's an example of loading and monitoring Someone data for changes:

```typescript
function loadAndMonitorSomeoneData(
    someoneId: SHA256IdHash<Someone>,
    onData: (data: SomeoneData) => void,
    onError: (e: unknown) => void
): () => void {
    const someone = new SomeoneModel(someoneId);

    async function updateSomeoneData(): Promise<void> {
        try {
            await someone.loadLatestVersion();
            onData({
                identities: someone.identities(),
                profiles: await someone.profiles(),
                mainProfile: await someone.mainProfile()
            });
        } catch (e) {
            onError(e);
        }
    }

    updateSomeoneData().catch(console.error);
    return someone.onUpdate.listen(updateSomeoneData);
}
```

### Best Practices

- Use the appropriate retrieval method based on the object type
- For model objects, use the model constructors (like `constructFromLatestVersion`) 
- Handle potential errors in loading, as objects might not exist or might be corrupt
- For objects that might change, consider using update listeners
- When loading binary data (BLOBs), be mindful of memory usage for large files 

## Workflow Summary

1. **Create a Someone**: This creates a container with a main Person identity (persisted immediately)
2. **Create additional Profiles**: If needed, for different contexts (persisted on creation)
3. **Update Profiles with details**: Then save changes with `saveAndLoad()` (explicit persistence)
4. **Create Topics**: For communication between Persons (persisted immediately)
5. **Manage message sequences**: The system handles this automatically based on message author

Following this flow ensures proper user management, communication, and data persistence in the system.

# Topic System Documentation

## Overview

The topic system provides a higher-level abstraction over channels for managing communication spaces in the application. It is primarily implemented through the `TopicModel` class which handles topic creation and management.

## Core Components

### TopicModel

The `TopicModel` class is the central component that manages all topic-related operations. It provides functionality for:

- Creating and managing topics
- Handling system topics (Everyone and Glue)
- Creating group topics
- Managing topic-channel relationships

### Topic Types

```typescript
interface Topic {
    $type$: 'Topic';
    id: string;
    name: string;
    channel: SHA256IdHash<ChannelInfo>;  // References the underlying channel
}
```

## Topic Identification Details

A topic's identity in the system is determined by multiple components:

1. **Topic ID**: A unique identifier for the topic
   - For system topics: Fixed IDs ('EveryoneTopic', 'GlueTopic')
   - For group topics: Generated as `topic-${timestamp}-${randomString}`

2. **Topic Name**: Human-readable name for the topic
   - Everyone topic: "Everyone"
   - Glue topic: "System Messages"
   - Group topics: User-provided name

3. **Channel Reference**: Each topic is backed by a channel
   - The channel is identified by its `SHA256IdHash<ChannelInfo>`
   - This ensures proper linking between topics and their underlying channels

## System Topics

### Everyone Topic

The "Everyone" topic is a system-wide topic accessible to all users:
```typescript
{
    $type$: 'Topic',
    id: 'EveryoneTopic',
    name: 'Everyone',
    channel: channelInfoIdHash // Hash of the 'everyone' channel
}
```

### Glue Topic

The "Glue" topic is used for system messages:
```typescript
{
    $type$: 'Topic',
    id: 'GlueTopic',
    name: 'System Messages',
    channel: channelInfoIdHash // Hash of the 'glue' channel
}
```

## Topic Creation Process

1. **Check Existence**:
   - Before creating a topic, check if it already exists using `findTopicById`
   - If found, return the existing topic

2. **Create Channel**:
   - Create a new channel using `channelManager.createChannel`
   - This returns a `SHA256IdHash<ChannelInfo>` that uniquely identifies the channel
   - For system topics: Use predefined channel IDs ('everyone', 'glue')
   - For group topics: Use the generated topic ID

3. **Create Topic**:
   - Create a new Topic object with:
     - Appropriate ID
     - Human-readable name
     - Channel reference using the channel info hash from step 2

4. **Cache Management**:
   - Store the topic in the local cache
   - Emit an update event to notify listeners

5. **Initialize Topic** (if needed):
   - Send an initial message to trigger storage system events
   - This step is required for proper topic initialization

## Best Practices

1. **Topic Creation**:
   - Always check for existing topics before creating new ones
   - Use appropriate topic types for different use cases
   - Maintain consistent naming conventions

2. **Channel Management**:
   - Let the TopicModel handle channel creation
   - Don't manipulate channels directly for topics
   - Use the channel info hash for references

3. **Cache Usage**:
   - Check the local cache before querying channels
   - Keep the cache updated when topics change
   - Clear the cache during shutdown

4. **Event Handling**:
   - Listen for topic updates using `onUpdated` event
   - Handle topic changes appropriately in the UI
   - Clean up event listeners when no longer needed

## Example Usage

```typescript
// Create the Everyone topic
const everyoneTopic = await topicModel.createEveryoneTopic();

// Create the Glue topic
const glueTopic = await topicModel.createGlueTopic();

// Create a group topic
const groupTopic = await topicModel.createGroupTopic('Project Discussion');

// Listen for topic updates
const disconnect = topicModel.onUpdated.listen(() => {
    // Handle topic changes
    console.log('Topics were updated');
});

// Clean up when done
await topicModel.shutdown();
disconnect();
```
