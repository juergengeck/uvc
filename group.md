# Group Management in one.leute Reference Implementation

## Overview

The one.leute reference implementation provides comprehensive group management functionality that demonstrates how to:
- Create and manage groups
- Add/remove participants from groups
- Create group-based chat topics
- Handle group permissions and access

## Key Components

### 1. Group Model (GroupModel)
- Located in `@refinio/one.models/lib/models/Leute/GroupModel.js`
- Extends from ONE platform's base model architecture
- Manages group state and persistence

### 2. Group Creation Flow

#### CreateGroup Component (`/root/group/create/CreateGroup.tsx`)
```typescript
// Group creation process
const group = await props.leuteModel.createGroup();
group.name = groupProfile.name !== '' ? groupProfile.name : 'Group';
group.picture = groupProfile.picture;
group.persons.push(...groupMembers);
await group.saveAndLoad();
```

The creation flow involves two steps:
1. **ADD_PICTURE_NAME**: User sets group name and picture
2. **ADD_MEMBERS**: User selects group members from available profiles

### 3. Group Management Components

#### GroupView (`/root/group/groupId/GroupView.tsx`)
- Displays group details (name, picture)
- Shows list of group members
- Provides menu options to edit group details or members

#### EditGroupMembers (`/root/group/groupId/edit/members/EditGroupMembers.tsx`)
```typescript
// Update group members
group.persons = [...groupMembers];
await group.saveAndLoad();
```

#### GroupMembersPicker
- Allows selection of members from all available profiles
- Uses checkbox interface for multi-selection
- Filters to show only default profiles of all identities

### 4. Group Hooks (`/hooks/contact/groupHooks.ts`)

#### useGroupsPreview
- Loads all groups from LeuteModel
- Sorts groups alphabetically by name
- Registers update listeners for each group
- Returns array of group objects with name and model

#### useGroup
- Loads a specific group by ID
- Handles blacklist checking
- Provides error handling with navigation fallback

### 5. Group Topics and Chat Integration

#### Topic Creation for Groups
The TopicModel supports group-based topics through:
- `createGroupTopic(name)` - Creates a topic for a specific group
- `addGroupToTopic(groupIdHash, topicId)` - Associates a group with a topic

#### Special Groups
The system includes predefined special groups:
- **'everyone'** - Global group for all users
- **'glue.one'** - System group for platform communications
- **'bin'** - Special group for deleted/archived content

#### StartGroupChat Component
```typescript
// Maps special groups to their topic IDs
switch (group.name) {
    case 'everyone':
        return TopicModel.EVERYONE_TOPIC_ID;
    case 'glue.one':
        return TopicModel.GLUE_TOPIC_ID;
}
```

### 6. Group Properties

Groups in the system have the following key properties:
- `groupIdHash` - Unique identifier (SHA256IdHash<Group>)
- `name` - Display name of the group
- `picture` - Optional ArrayBuffer for group avatar
- `persons` - Array of SHA256IdHash<Person> representing members

### 7. Integration Points

#### LeuteModel Integration
```typescript
// Create a new group
const group = await leuteModel.createGroup(name?: string);

// Get all groups
const groups = await leuteModel.groups();

// Add group to someone's groups
await leuteModel.addSomeoneToGroup(someoneId, groupId);
```

#### Access Control
Groups integrate with the LeuteAccessRightsManager to control:
- Who can see group content
- Who can add/remove members
- Who can modify group details

### 8. UI/UX Patterns

#### Group List Display
- Groups shown in CollapsibleConversationsList
- Each group displays name, picture, and chat access button
- Click on group navigates to group details view

#### Member Selection
- Checkbox list of all available profiles
- Search/filter capability for large lists
- Visual indicators for selected members

## Implementation Notes

1. **State Management**: Groups use the same StateMachine pattern as other models
2. **Persistence**: Group data is stored in ONE's encrypted local storage
3. **Synchronization**: Changes to groups are synchronized across devices via CHUM protocol
4. **Events**: Group updates trigger events that components can listen to
5. **Navigation**: Group routes follow pattern `/group/{groupId}` with sub-routes for editing

## Best Practices from Reference Implementation

1. Always check group existence before operations
2. Use hooks for consistent data loading and error handling
3. Register update listeners to keep UI in sync with model changes
4. Handle special groups (everyone, glue.one) separately from user-created groups
5. Implement proper cleanup in useEffect hooks to prevent memory leaks
6. Use TypeScript types for group-related data structures