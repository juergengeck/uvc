/**
 * Auth state and event types for the authentication state machine
 */

/**
 * Possible states for the authentication state machine
 */
export type AuthState = 
  | 'logged_out'
  | 'logging_in'
  | 'logged_in'
  | 'logging_out'
  | 'error';

/**
 * Events that can trigger authentication state transitions
 */
export type AuthEvent =
  | 'login'
  | 'login_success'
  | 'login_error'
  | 'logout'
  | 'logout_success'
  | 'logout_error'; 