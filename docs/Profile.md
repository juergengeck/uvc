# Profile Recipe Management

## Overview
The Profile recipe is a core component of the Digionko application, handled primarily by one.core. It provides the foundation for user identity and profile management within the application.

## Profile Structure
```typescript
interface Profile {
    $type$: 'Profile';
    profileId: string;
    personId: SHA256IdHash<Person>;
    owner: SHA256IdHash<Person>;
    name: string;
    email: string;
    avatar?: string;
    status: 'online' | 'offline';
    lastSeen?: Date;
}
```

## Integration Points

### 1. Core Recipe Management
- Profile recipe is managed by one.core as a core recipe
- Initialized during application startup in `app/initialization/core.ts`
- Integrated with the instance management system

### 2. Recipe Registration
```typescript
// Core recipes (like Profile) are handled by one.core
export const DIGIONKO_RECIPES = [
    ...RecipesStable,
    ...RecipesExperimental,
    ...ROLE_RECIPES,
    ...STUDY_RECIPES
];

// Core reverse maps (like Profile) are handled by one.core
export const DIGIONKO_REVERSE_MAPS = new Map([
    ...ReverseMapsStable,
    ...ReverseMapsExperimental,
    ...ROLE_REVERSE_MAPS
]);
```

### 3. Instance Initialization
```typescript
await initInstance({
    ...DEMO_CREDENTIALS,
    recipes: DIGIONKO_RECIPES,
    reverseMaps: DIGIONKO_REVERSE_MAPS,
    reverseMapsForIdObjects: DIGIONKO_REVERSE_MAPS_FOR_ID_OBJECTS
});
```

## Profile Management

### 1. Model Integration
- Profiles are managed through the `LeuteModel` from one.models
- Profile operations are handled through model methods
- Profile state is managed through React hooks and context

### 2. React Integration
```typescript
// Profile Hook
export function useProfile() {
  const { model } = useLeuteModel();
  const [state, setState] = useState<ProfileState>({
    profile: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    async function loadProfile() {
      try {
        const profile = await model.getMyMainProfile();
        setState({
          profile,
          loading: false,
          error: null
        });
      } catch (err) {
        setState({
          profile: null,
          loading: false,
          error: err as Error
        });
      }
    }

    loadProfile();
  }, [model]);

  return state;
}
```

### 3. UI Components
- `ProfileCard` component for displaying profile information
- Profile editing through dedicated edit screens
- Status indicators for online/offline state

## Security and Data Management

### 1. Encryption
- Profile data is encrypted using one.core's crypto system
- Secure storage integration for profile data
- Proper key derivation and management

### 2. Data Flow
- Profile updates are synchronized through the LeuteModel
- Changes are propagated through the ONE object system
- Real-time status updates via the messaging system

## Best Practices

1. **Profile Access**
   - Always use the `useProfile` hook for accessing profile data
   - Handle loading and error states appropriately
   - Maintain proper type safety with TypeScript

2. **Profile Updates**
   - Use model methods for profile modifications
   - Handle asynchronous operations properly
   - Validate data before updates

3. **Security**
   - Never expose sensitive profile data
   - Always use proper encryption
   - Follow ONE security guidelines

## Dependencies
- one.core: Core recipe and instance management
- one.models: LeuteModel for profile operations
- React Native: UI components and hooks
- Expo: Platform-specific implementations

## Error Handling
- Proper error boundaries for profile components
- Graceful degradation for missing profile data
- Clear error messages for users

## Future Considerations
1. Profile data validation improvements
2. Enhanced offline support
3. Profile data migration strategies
4. Performance optimizations for profile operations 