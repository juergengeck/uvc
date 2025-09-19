/**
 * ContactsManager
 * 
 * Integrates device contacts (from expo-contacts) with our LeuteModel-based contact system.
 * Device contacts are stored as additional profile objects within the LeuteModel system
 * to maintain consistency across platforms.
 */

import * as Contacts from 'expo-contacts';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { createPerson } from '@refinio/one.models/lib/misc/person.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { AppModel } from '../AppModel';
import { getPersonIdByEmail } from '../../utils/contactUtils';
import { createContact } from '../../utils/contactUtils';

// To fix TypeScript errors, we need to import the actual models
import ProfileModelActual from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import SomeoneModelActual from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';

interface DeviceContact {
  id: string;
  name: string;
  email?: string;
  phoneNumbers?: { label: string; number: string }[];
  imageAvailable?: boolean;
  image?: Contacts.Image;
}

// Helper function to cast types
function castToPersonIdHash(hash: string | SHA256IdHash<any>): SHA256IdHash<Person> {
  return hash as SHA256IdHash<Person>;
}

export class ContactsManager {
  private leuteModel: any; // Use any to avoid TypeScript errors with methods that exist but aren't in the type definition
  private appModel: AppModel;
  private hasPermission: boolean = false;
  
  constructor(leuteModel: LeuteModel, appModel: AppModel) {
    this.leuteModel = leuteModel;
    this.appModel = appModel;
  }

  /**
   * Request permission to access device contacts
   * @returns True if permission granted, false otherwise
   */
  async requestPermission(): Promise<boolean> {
    const { status } = await Contacts.requestPermissionsAsync();
    this.hasPermission = status === 'granted';
    return this.hasPermission;
  }

  /**
   * Check if we have permission to access device contacts
   * @returns True if permission granted, false otherwise
   */
  async checkPermission(): Promise<boolean> {
    const { status } = await Contacts.getPermissionsAsync();
    this.hasPermission = status === 'granted';
    return this.hasPermission;
  }

  /**
   * Get all device contacts
   * @returns Array of device contacts
   */
  async getDeviceContacts(): Promise<DeviceContact[]> {
    if (!this.hasPermission && !(await this.requestPermission())) {
      return [];
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.ID,
        Contacts.Fields.Name,
        Contacts.Fields.Emails,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Image,
        Contacts.Fields.ImageAvailable,
      ],
    });

    return data
      .filter(contact => contact.id !== undefined)
      .map(contact => ({
        id: contact.id!,
        name: contact.name || 'Unknown',
        email: contact.emails?.[0]?.email,
        phoneNumbers: contact.phoneNumbers?.map(phone => ({
          label: phone.label || 'other',
          number: phone.number || '',
        })),
        imageAvailable: contact.imageAvailable,
        image: contact.image,
      }));
  }

  /**
   * Import device contacts into LeuteModel
   * Contacts are matched by email if possible
   * @returns Number of contacts imported
   */
  async importDeviceContacts(): Promise<number> {
    const deviceContacts = await this.getDeviceContacts();
    let importCount = 0;

    for (const contact of deviceContacts) {
      if (!contact.email) continue;

      try {
        // Find or create a someone based on the email
        const someoneId = await this.findOrCreateSomeoneByEmail(contact.email);
        if (someoneId) {
          // Add device contact info as an additional profile
          await this.addDeviceContactProfile(someoneId, contact);
          importCount++;
        }
      } catch (error) {
        console.error(`Failed to import contact ${contact.name}:`, error);
      }
    }

    return importCount;
  }

  /**
   * Find or create a someone by email address
   * @param email Email address to search for
   * @returns The Someone ID or null if it couldn't be created
   */
  private async findOrCreateSomeoneByEmail(email: string): Promise<SHA256IdHash<Someone> | null> {
    try {
      // Use the canonical contact creation function
      const result = await createContact(email, this.leuteModel);
      
      // Return the Someone ID
      return result.someoneId as SHA256IdHash<Someone>;
    } catch (error) {
      console.error(`[ContactsManager] Failed to find/create someone with email ${email}:`, error);
      return null;
    }
  }

  /**
   * Add device contact information as an additional profile
   * @param someoneId SomeoneId to add profile to
   * @param contact Device contact information
   */
  private async addDeviceContactProfile(someoneId: SHA256IdHash<Someone>, contact: DeviceContact): Promise<void> {
    try {
      const someone = await this.leuteModel.getSomeone(someoneId as unknown as SHA256IdHash<Person>);
      if (!someone) return;

      // Get the main profile ID for this someone
      const mainProfile = await someone.mainProfile();
      if (!mainProfile) return;
      
      // Create a new profile for the device contact info
      const profileId = `device-contact-${contact.id}-${Date.now()}`;
      const profile = await this.leuteModel.createProfileForPerson(
        mainProfile.personId,
        profileId
      );
      
      // Create name description
      const nameObj = {
        $type$: 'PersonName',
        name: contact.name
      };
      
      // Create phone number descriptions if available
      const phoneDescs = contact.phoneNumbers?.map(phone => ({
        $type$: 'Phone',
        number: phone.number,
        type: phone.label
      })) || [];
      
      // Create email description if available
      const emailDescs = contact.email ? [{
        $type$: 'Email',
        address: contact.email
      }] : [];
      
      // Add device contact metadata
      const deviceContactDesc = {
        $type$: 'DeviceContact',
        deviceContactId: contact.id,
        source: 'expo-contacts'
      };
      
      // Add all descriptions to profile
      profile.personDescriptions.push(
        nameObj,
        deviceContactDesc,
        ...phoneDescs,
        ...emailDescs
      );
      
      // Save the profile - this is necessary because we're modifying the profile directly
      await profile.saveAndLoad();
      console.log(`[ContactsManager] Saved device contact profile for ${contact.name}`);
    } catch (error) {
      console.error(`Failed to add device contact profile for ${contact.name}:`, error);
    }
  }

  /**
   * Add a contact by email
   * 
   * @param email Email address to add
   * @returns The Person ID or undefined if it couldn't be created
   */
  async addContactByEmail(email: string): Promise<SHA256IdHash<Person> | undefined> {
    try {
      // Use the canonical contact creation function
      const result = await createContact(email, this.leuteModel);
      
      // Return the person ID
      return result.personId as SHA256IdHash<Person>;
    } catch (error) {
      console.error(`[ContactsManager] Failed to create contact with email ${email}:`, error);
      return undefined;
    }
  }

  /**
   * Create a new contact
   * 
   * @param email Email address for the new contact
   * @param leuteModel LeuteModel instance
   * @param appModel Optional AppModel instance for explicit state saving
   * @returns Object with created IDs
   */
  static async createContact(
    email: string,
    leuteModel: any,
    appModel?: any
  ): Promise<{ personId: string; someoneId: string; profileId: string }> {
    if (!leuteModel) {
      throw new Error('[ContactsManager] CRITICAL: LeuteModel is required for contact creation');
    }
    
    try {
      // Use the canonical contact creation implementation
      const result = await createContact(email, leuteModel);
      
      return {
        personId: result.personId,
        someoneId: result.someoneId,
        profileId: result.profileId
      };
    } catch (error) {
      console.error(`[ContactsManager] Error creating contact: ${error}`);
      throw error;
    }
  }
} 