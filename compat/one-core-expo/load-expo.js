import tweetnacl from 'tweetnacl';
import * as expoCrypto from 'expo-crypto';
import { setPlatformForCh } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { setPlatformForCs } from '@refinio/one.core/lib/system/crypto-scrypt.js';
import { setPlatformForFf } from '@refinio/one.core/lib/system/fetch-file.js';
import { setPlatformForPj } from '@refinio/one.core/lib/system/post-json.js';
import { setPlatformForSs } from '@refinio/one.core/lib/system/settings-store.js';
import { setPlatformForSb } from '@refinio/one.core/lib/system/storage-base.js';
import { setPlatformForSbdf } from '@refinio/one.core/lib/system/storage-base-delete-file.js';
import { setPlatformForSst } from '@refinio/one.core/lib/system/storage-streams.js';
import { setPlatformForWs } from '@refinio/one.core/lib/system/websocket.js';
import { createError } from '@refinio/one.core/lib/errors.js';
import { setPlatformLoaded } from '@refinio/one.core-expo/dist/system/platform.js';
import * as CH from '@refinio/one.core-expo/dist/system/crypto-helpers.js';
import * as CS from '@refinio/one.core-expo/dist/system/crypto-scrypt.js';
import * as FF from '@refinio/one.core/lib/system/browser/fetch-file.js';
import * as PJ from '@refinio/one.core/lib/system/browser/post-json.js';
import * as SS from '@refinio/one.core-expo/dist/system/settings-store.js';
import * as SB from './storage-base.js';
import * as SBDF from './storage-base-delete-file.js';
import * as SST from './storage-streams-impl.js';
import * as WS from '@refinio/one.core/lib/system/browser/websocket.js';

tweetnacl.setPRNG((x, n) => {
  x.set(expoCrypto.getRandomBytes(n));
});

const isReactNative =
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

if (isReactNative !== true) {
  throw createError('PL-SPL1', { expected: 'expo/react-native', actual: 'unknown' });
}

setPlatformForCh(CH);
setPlatformForCs(CS);
setPlatformForFf(FF);
setPlatformForPj(PJ);
setPlatformForSs(SS);
setPlatformForSb(SB);
setPlatformForSbdf(SBDF);
setPlatformForSst(SST);
setPlatformForWs(WS);
setPlatformLoaded('expo');
