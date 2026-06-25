# Migration to refinio.api Patterns

This document shows how to use the proper patterns from `@refinio/refinio-api` instead of legacy buggy code.

## Overview

refinio.api provides:
1. **Plans** - Clean API wrappers (OneLeutePlan, OneChannelsPlan, etc.)
2. **GroupHandler** - Certificate-based group creation
3. **ContactCreationHelper** - Proper Person→Profile→Someone flow

## Group Creation

### ❌ Old (Buggy)
```typescript
// This doesn't create HashGroup properly - causes O2M-RTYC2 errors
const group = await leuteModel.createGroup('mygroup');
```

### ✅ New (Correct)
```typescript
import { createGroupWithCertificate } from '@src/helpers/groupManager';

const result = await createGroupWithCertificate(leuteModel, [personId1, personId2]);
if (result.success) {
  console.log(`Group created: ${result.groupId}`);
}
```

## Contact Creation

### ❌ Old (Complex & Error-Prone)
```typescript
// Manual ceremony - easy to get wrong
const person = await Person.create(...);
const profile = await ProfileModel.constructWithNewProfile(...);
await profile.saveAndLoad();
const someone = await storeVersionedObject({
  $type$: 'Someone',
  someoneId: personId,
  mainProfile: profileHash,
  identities: new Map(...)
});
await leuteModel.addSomeoneElse(someone.idHash);
```

### ✅ New (Simple & Correct)
```typescript
import { ensureContact } from '@src/helpers/contactManager';

const someone = await ensureContact(leuteModel, personId, {
  displayName: 'John Doe'
});
```

## Pairing Success Handler

### ❌ Old (Incomplete)
```typescript
connectionsModel.pairing.onPairingSuccess(async (
  initiatedLocally,
  localPersonId,
  localInstanceId,
  remotePersonId,
  remoteInstanceId,
  token
) => {
  // Missing proper contact creation
  console.log('Paired!');
});
```

### ✅ New (Complete)
```typescript
import { handlePairingSuccess } from '@src/helpers/contactManager';

connectionsModel.pairing.onPairingSuccess(async (
  initiatedLocally,
  localPersonId,
  localInstanceId,
  remotePersonId,
  remoteInstanceId,
  token
) => {
  await handlePairingSuccess(leuteModel, remotePersonId, 'Remote User');
  console.log('✅ Pairing complete with contact created');
});
```

## Using Plans for Clean API Access

### Example: Get Contacts
```typescript
import { OneLeutePlan } from '@refinio/refinio-api/dist/handlers/OneLeutePlan.js';

const leutePlan = new OneLeutePlan(leuteModel);

// Get own identity
const me = await leutePlan.getOwnIdentity();

// Get all contacts
const contacts = await leutePlan.getContacts();

// Get specific contact
const contact = await leutePlan.getContact(personId);
```

### Example: Channel Operations
```typescript
import { OneChannelsPlan } from '@refinio/refinio-api/dist/handlers/OneChannelsPlan.js';

const channelsPlan = new OneChannelsPlan(channelManager);

// Create channel
await channelsPlan.createChannel({
  id: channelId,
  owner: personId
});

// List all channels
const channels = await channelsPlan.listChannels();
```

### Example: Storage Operations
```typescript
import { OneStoragePlan } from '@refinio/refinio-api/dist/handlers/OneStoragePlan.js';

const storagePlan = new OneStoragePlan();

// Store versioned object
const result = await storagePlan.storeVersionedObject(myObject);
console.log(`Stored: ${result.idHash}`);

// Get object
const obj = await storagePlan.getObjectByIdHash(idHash);
```

## Migration Checklist

- [ ] Replace `leuteModel.createGroup()` with `createGroupWithCertificate()`
- [ ] Replace manual Person/Profile/Someone creation with `ensureContact()`
- [ ] Add `handlePairingSuccess()` to pairing callbacks
- [ ] Use Plans for clean, type-safe API access
- [ ] Remove legacy groupUtils where using GroupHandler
- [ ] Test group creation (verify HashGroup is created)
- [ ] Test contact creation (verify all objects are linked)
- [ ] Test pairing flow (verify contacts appear in leuteModel.others())

## Benefits

✅ **Correct**: Uses proper ONE.core patterns
✅ **Certificate-based**: Groups have AffirmationCertificates
✅ **Type-safe**: Full TypeScript support
✅ **Tested**: Battle-tested patterns from refinio.api
✅ **Maintainable**: Centralized in refinio.api package
✅ **Clean**: Plans provide high-level API abstraction
