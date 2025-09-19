# Unified Contact System

This directory contains the unified contact management system that consolidates human contacts and AI assistants into a single, consistent interface.

## Components

### UnifiedContactList
- **Purpose**: Main contact list component for the contacts tab
- **Features**: 
  - Displays both human contacts and AI assistants
  - Search functionality across all contact fields
  - Context menu with actions (chat, details, edit)
  - Pull-to-refresh support
  - Automatic sorting (AI first, then alphabetical)

### UnifiedContactPicker
- **Purpose**: Modal contact picker for adding participants to chats
- **Features**:
  - Single or multi-select modes
  - Excludes already selected contacts
  - Includes AI assistants when enabled
  - Search functionality
  - Consistent styling with the main contact list

## Key Features

### Unified Contact Types
Both components handle:
- **Human contacts**: Regular contacts with names, emails, organizations
- **AI assistants**: AI models with proper names and model information

### Consistent Interface
- AI contacts show with robot icons and "AI Assistant" labels
- Human contacts show with text avatars based on names
- Search works across all fields (name, email, organization, AI model)
- Sorting prioritizes AI contacts, then alphabetical order

### Integration
- Uses `LeuteModel` for human contacts
- Uses `AIAssistantModel` for AI contacts
- Proper type safety with TypeScript interfaces
- Follows ONE platform patterns

## Migration from Old System

### From ContactPicker → UnifiedContactPicker
```typescript
// Old
import { ContactPicker } from '@src/components/ContactPicker';

// New
import { UnifiedContactPicker } from '@src/components/contacts/UnifiedContactPicker';

// Usage changes:
<UnifiedContactPicker
  // ... existing props
  includeAI={true}  // New: control AI inclusion
/>
```

### From SomeoneContactList → UnifiedContactList
```typescript
// Old
import { SomeoneContactList } from '@src/components/SomeoneContactList';

// New
import { UnifiedContactList } from '@src/components/contacts/UnifiedContactList';

// Usage changes:
<UnifiedContactList
  searchQuery={searchQuery}
  showContextMenu={true}      // New: show context menu
  includeAI={true}           // New: include AI contacts
  onContactSelected={handler} // Same callback pattern
/>
```

## Translation Keys

Add these keys to your translation files:

```json
{
  "contacts": {
    "startChat": "Start Chat",
    "viewDetails": "View Details",
    "edit": "Edit",
    "noResults": "No results found",
    "noContacts": "No contacts yet",
    "addContact": "Add Contact"
  }
}
```

## Future Enhancements

1. **Group Contacts**: Support for contact groups/categories
2. **Favorites**: Mark frequently contacted people/AI as favorites
3. **Recent Contacts**: Show recently contacted people first
4. **Bulk Operations**: Select multiple contacts for bulk actions
5. **Contact Sync**: Sync with device contacts (with permission)
6. **Contact Import/Export**: VCard support for portability