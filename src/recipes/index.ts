/**
 * Central Recipe Registry
 * 
 * Collects and exports all application-specific recipes.
 * These recipes complement the core recipes from one.core and one.models.
 */

import type { Recipe } from '@refinio/one.core/lib/recipes.js';
import { MessageRecipe, TypingStatusRecipe } from './MessageRecipes';
import RoleCertificate from './RoleCertificate';
import { LLMRecipe } from './llm';
import { JournalEntryRecipe } from './JournalRecipes';
import { GlobalLLMSettingsRecipe } from './GlobalLLMSettingsRecipe';
import LLMSettingsRecipes, { LLMSettingsRecipe } from './LLMSettingsRecipe';
import MessageSignatureRecipe from './MessageSignatureRecipe';
import AIRecipes, { 
  AIProviderConfigRecipe,
  AIProcessingStatusRecipe,
  AIResponseRecipe, 
  LocalAIConfigRecipe
} from './AIRecipes';
import {
  TransportConfigRecipe,
  ConnectionInstanceRecipe
} from './transport';
import { DiscoveryIDRecipe } from './DiscoveryID';
import { VerifiableCredentialRecipe } from './VerifiableCredential';
import { DeviceRecipe, DeviceSettingsRecipe, DeviceListRecipe } from './device';
import { OrganisationRecipe, DepartmentRecipe, RoomRecipe } from './OrganisationalRecipes';
import {
  DeviceIdentityCredentialRecipe,
  LEDControlCommandRecipe,
  LEDStatusResponseRecipe,
  DeviceDiscoveryInfoRecipe,
  OwnershipRemovalCommandRecipe
} from '../types/device-control-recipes';
import {
  UVC_PHONE_BOOK_RECIPES,
  UvcPhoneBookEntryRecipe,
  UvcPhoneBookRecipe,
  UvcPhoneBookRegistryRecipe,
} from './UvcPhoneBookRecipes';
import {ConnectionPhoneBookRecipes} from '@refinio/connection.core/recipes';
import {UVC_RECIPES} from '@refinio/uvc.core';
import {
  UVC_DEVICE_CONTROL_RECIPES,
  UvcDeviceControlCommandRecipe,
  UvcDeviceControlObservationRecipe,
} from './UvcDeviceControlRecipes';

// Verify the recipe array
console.log('[RECIPES] LLMSettingsRecipes array:', 
  Array.isArray(LLMSettingsRecipes) ? 
  `Array with ${LLMSettingsRecipes.length} items` : 
  'Not an array');

// Application recipes in registration order 
// Make sure each recipe appears exactly once
export const ALL_RECIPES: Recipe[] = [
  // Core functionality
  RoleCertificate.Recipe,
  LLMRecipe,
  GlobalLLMSettingsRecipe,
  LLMSettingsRecipe,
  
  // AI functionality
  AIProviderConfigRecipe,
  AIProcessingStatusRecipe,
  AIResponseRecipe,
  LocalAIConfigRecipe,
  
  // Journal
  JournalEntryRecipe,
  
  // Communication
  MessageRecipe,
  TypingStatusRecipe,
  MessageSignatureRecipe.Recipe,
  
  // Transport
  TransportConfigRecipe,
  ConnectionInstanceRecipe,
  
  // Discovery
  DiscoveryIDRecipe,

  // Device
  VerifiableCredentialRecipe,
  DeviceRecipe,
  DeviceSettingsRecipe,
  DeviceListRecipe,

  // Device Control Commands (QUIC-VC)
  DeviceIdentityCredentialRecipe,
  LEDControlCommandRecipe,
  LEDStatusResponseRecipe,
  DeviceDiscoveryInfoRecipe,
  OwnershipRemovalCommandRecipe,

  // Shared command and authority-observation evidence for Groov and ESP32.
  ...UVC_DEVICE_CONTROL_RECIPES,

  // Shared trie roots and discovery/control/journal entries. These recipes
  // live in ../one so Expo, browser and Cube use the same storage contract.
  ...UVC_RECIPES,

  // Certified UVC-to-UVC contact/device directory
  // connection.core owns reachability, route memory, and trusted instance
  // introductions; UVC_PHONE_BOOK_RECIPES owns certified contact/device data.
  ...ConnectionPhoneBookRecipes,
  ...UVC_PHONE_BOOK_RECIPES,

  // Organisational hierarchy
  OrganisationRecipe,
  DepartmentRecipe,
  RoomRecipe,
];

// Log all registered recipes for diagnostics
console.log('[RECIPES] Registered recipes:', ALL_RECIPES.map(recipe => {
  const name = recipe.name || 'unnamed';
  return `${recipe.$type$} - ${name}`;
}));

// Check for duplicate recipes
const recipeNames = ALL_RECIPES.map(recipe => recipe.name);
const uniqueNames = new Set(recipeNames);
if (recipeNames.length !== uniqueNames.size) {
  const duplicates = recipeNames.filter((name, index) => 
    recipeNames.indexOf(name) !== index);
  console.warn('[RECIPES] ⚠️ Found duplicate recipes:', [...new Set(duplicates)]);
}

// Export individual recipes for direct access
export {
  RoleCertificate,
  LLMRecipe,
  MessageRecipe,
  TypingStatusRecipe,
  JournalEntryRecipe,
  GlobalLLMSettingsRecipe,
  LLMSettingsRecipe,
  LLMSettingsRecipes,
  MessageSignatureRecipe,
  AIProviderConfigRecipe,
  AIProcessingStatusRecipe,
  AIResponseRecipe,
  LocalAIConfigRecipe,
  AIRecipes,
  TransportConfigRecipe,
  ConnectionInstanceRecipe,
  DiscoveryIDRecipe,
  VerifiableCredentialRecipe,
  DeviceRecipe,
  DeviceSettingsRecipe,
  DeviceListRecipe,
  DeviceIdentityCredentialRecipe,
  LEDControlCommandRecipe,
  LEDStatusResponseRecipe,
  DeviceDiscoveryInfoRecipe,
  OwnershipRemovalCommandRecipe,
  UvcDeviceControlCommandRecipe,
  UvcDeviceControlObservationRecipe,
  UvcPhoneBookEntryRecipe,
  UvcPhoneBookRecipe,
  UvcPhoneBookRegistryRecipe,
  OrganisationRecipe,
  DepartmentRecipe,
  RoomRecipe
};
