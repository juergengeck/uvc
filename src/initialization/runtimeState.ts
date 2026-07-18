import type MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser';
import type {AppModel} from '../models/AppModel';

/**
 * Process-owned application graph.
 *
 * Metro Fast Refresh re-evaluates JavaScript modules without terminating the
 * native process. Owners of ONE storage, identity, or networking must outlive
 * an individual evaluation of the module that exposes them.
 */
export interface AppRuntimeState {
  initializationPromise?: Promise<void>;
  authenticator?: MultiUser;
  model?: AppModel;
  isLoggedIn: boolean;
  handlersAttached: boolean;
  isLoginInProgress: boolean;
  isModelInitInProgress: boolean;
  objectEventsInitialized: boolean;
  platformInitialized: boolean;
}

type RuntimeGlobal = typeof globalThis & {
  __UVC_APP_RUNTIME_STATE__?: AppRuntimeState;
};

const runtimeGlobal = globalThis as RuntimeGlobal;

export const appRuntimeState: AppRuntimeState =
  runtimeGlobal.__UVC_APP_RUNTIME_STATE__ ??
  (runtimeGlobal.__UVC_APP_RUNTIME_STATE__ = {
    isLoggedIn: false,
    handlersAttached: false,
    isLoginInProgress: false,
    isModelInitInProgress: false,
    objectEventsInitialized: false,
    platformInitialized: false,
  });
