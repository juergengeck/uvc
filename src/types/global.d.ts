import type MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser';

declare global {
  var __auth: MultiUser | undefined;
  var APP_START_TIME: number | undefined;
  var HOT_RELOAD_DETECTED: boolean | undefined;
} 