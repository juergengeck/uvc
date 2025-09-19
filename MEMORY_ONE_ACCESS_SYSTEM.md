# ONE Platform Access System Memory

## Critical Understanding: How CHUM Access Discovery Actually Works

Based on examination of the ONE platform codebase, here's how access grants are discovered and why CHUM message synchronization might be failing:

### 1. Reverse Map System (STILL EXISTS but uses file storage)

The reverse map system in ONE core uses **file-based storage** in `STORAGE.RMAPS` directory:

```
File naming pattern: ${targetHash}.Object.${referencingObjectType}
Example: abc123...def.Object.Access

File content (newline-separated hashes):
hash1
hash2
hash3
```

**Key Functions:**
- `getAllEntries(targetHash, typeOfReferencingObj)` - Reads reverse map file
- `getOnlyLatestReferencingObjsHashAndId(targetHash, typeOfReferencingObj)` - Gets only latest versions
- Reverse maps are updated when objects are created that reference other objects

### 2. Access Grant Discovery Flow in `getAccessibleRootHashes()`

```typescript
// From one.core/src/util/determine-accessible-hashes.ts
export async function determineAccessibleHashes(person: SHA256IdHash<Person>) {
    // 1. Find Access objects that directly reference this person
    const personAccessObjs = await getOnlyLatestReferencingObjsHashAndId(person, 'Access');
    
    // 2. Find IdAccess objects that directly reference this person  
    const personIdAccessObjs = await getOnlyLatestReferencingObjsHashAndId(person, 'IdAccess');
    
    // 3. Find Groups that contain this person
    const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(person, 'Group');
    
    // 4. For each group, find Access/IdAccess objects that reference the group
    for (const group of groupsContainingPerson) {
        const groupAccess = await getOnlyLatestReferencingObjsHashAndId(group.idHash, 'Access');
        const groupIdAccess = await getOnlyLatestReferencingObjsHashAndId(group.idHash, 'IdAccess');
    }
}
```

### 3. Access vs IdAccess Objects

**Access Objects** (for unversioned objects):
```typescript
{
    object: "hash-of-target-object",    // Direct hash reference
    person: ["person1", "person2"],
    group: ["group1"],
    mode: SET_ACCESS_MODE.ADD
}
```

**IdAccess Objects** (for versioned objects):
```typescript
{
    id: "id-hash-of-target-object",     // ID hash reference
    person: ["person1", "person2"], 
    group: ["group1"],
    mode: SET_ACCESS_MODE.ADD
}
```

### 4. Critical Issues in Our Implementation

#### Problem 1: Wrong Object Type for Channel Messages
- `ChannelEntry` objects are **versioned** → Need `IdAccess` objects
- `ChatMessage` objects are **versioned** → Need `IdAccess` objects  
- `ChannelInfo` objects are **versioned** → Need `IdAccess` objects

Our `buildAccessGrant()` always creates `Access` objects (unless `useId=true`).

#### Problem 2: Group Membership
For group-based access to work:
1. Remote person must be a **member** of the group
2. This means there must be a `Group` object that **references** the remote person
3. The reverse map `${remotePersonId}.Object.Group` must exist and contain the group hash

#### Problem 3: Reverse Map File Creation
Reverse maps are created automatically when objects are stored, BUT:
- Must use correct ONE core storage functions
- Must have proper object references in the stored objects
- Files are stored in `STORAGE.RMAPS` directory

### 5. Diagnostic Requirements

To debug the access system, we need to check:

1. **Reverse Map Files Exist:**
   ```
   Check files: ${remotePersonId}.Object.Access
                ${remotePersonId}.Object.IdAccess  
                ${remotePersonId}.Object.Group
                ${groupId}.Object.Access
                ${groupId}.Object.IdAccess
   ```

2. **Object References Are Correct:**
   - Access objects must reference correct person/group IDs
   - Group objects must contain person as member
   - Use correct hash types (hash vs idHash)

3. **Access Grant Creation:**
   - Verify `createAccess()` actually stores objects
   - Check reverse maps are updated after storage
   - Ensure proper serialization with `serializeWithType()`

### 6. Root Cause Hypothesis

The CHUM synchronization failure is likely caused by:

1. **Creating Access instead of IdAccess** for versioned objects
2. **Missing group membership** - remote person is not actually in the "everyone" group
3. **Reverse map corruption** - files not properly created/updated
4. **Wrong hash targeting** - using concrete hashes instead of ID hashes for versioned objects

### 7. Reference Implementation Comparison

The one.leute implementation in `LeuteAccessRightsManager.ts`:
- Only creates access for `channelInfoIdHash` (line 95-102)  
- Uses `person: []` and `group: this.groups('iom')` (lines 98-99)
- Uses `SET_ACCESS_MODE.ADD` (line 100)
- Does NOT create access for individual message objects

This suggests our implementation is over-engineering by trying to grant access to every message individually.

### 8. Correct Implementation Strategy

Follow one.leute exactly:
1. Create access grants ONLY for `ChannelInfo` objects
2. Use `IdAccess` objects (since ChannelInfo is versioned)
3. Ensure remote person is member of target groups
4. Let CHUM protocol handle message discovery through channel access

### 9. Next Steps

1. Create diagnostic tool to examine reverse map files directly
2. Test group membership for remote persons
3. Verify access grant object creation and storage
4. Fix object type usage (Access vs IdAccess)
5. Simplify to match one.leute implementation exactly