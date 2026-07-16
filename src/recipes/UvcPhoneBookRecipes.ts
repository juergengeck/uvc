/**
 * Compatibility export for the shared UVC phone-book storage contract.
 *
 * The recipe must be owned by uvc.core so every CHUM runtime that can receive
 * the root (Expo, Cube, and headless peers) registers the identical schema.
 */
export * from '@refinio/uvc.core';
