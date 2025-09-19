/**
 * Role Helper Functions
 * 
 * Helper functions for checking roles that depend on modelManager.
 */

import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import { Role } from './role-utils';
import { hasRole } from './role-utils';

export async function isAdmin(leuteModel: LeuteModel): Promise<boolean> {
    try {
        const myId = await leuteModel.myMainIdentity();
        if (!myId) {
            console.log('[role-helpers] No main identity found yet');
            return false;
        }
        return hasRole(leuteModel, myId, Role.ADMIN);
    } catch (error) {
        if (error instanceof Error && error.message.includes('File not found')) {
            console.log('[role-helpers] Storage files not initialized yet');
            return false;
        }
        console.error('[role-helpers] Error checking admin role:', error);
        return false;
    }
}

export async function isPhysician(leuteModel: LeuteModel): Promise<boolean> {
    try {
        const myId = await leuteModel.myMainIdentity();
        if (!myId) {
            console.log('[role-helpers] No main identity found yet');
            return false;
        }
        return hasRole(leuteModel, myId, Role.PHYSICIAN);
    } catch (error) {
        if (error instanceof Error && error.message.includes('File not found')) {
            console.log('[role-helpers] Storage files not initialized yet');
            return false;
        }
        console.error('[role-helpers] Error checking physician role:', error);
        return false;
    }
}

export async function isClinic(leuteModel: LeuteModel): Promise<boolean> {
    try {
        const myId = await leuteModel.myMainIdentity();
        if (!myId) {
            console.log('[role-helpers] No main identity found yet');
            return false;
        }
        return hasRole(leuteModel, myId, Role.CLINIC);
    } catch (error) {
        if (error instanceof Error && error.message.includes('File not found')) {
            console.log('[role-helpers] Storage files not initialized yet');
            return false;
        }
        console.error('[role-helpers] Error checking clinic role:', error);
        return false;
    }
}

export async function isPatient(leuteModel: LeuteModel): Promise<boolean> {
    try {
        const myId = await leuteModel.myMainIdentity();
        if (!myId) {
            console.log('[role-helpers] No main identity found yet');
            return false;
        }
        return hasRole(leuteModel, myId, Role.PATIENT);
    } catch (error) {
        if (error instanceof Error && error.message.includes('File not found')) {
            console.log('[role-helpers] Storage files not initialized yet');
            return false;
        }
        console.error('[role-helpers] Error checking patient role:', error);
        return false;
    }
}

export default {
    isAdmin,
    isPhysician,
    isClinic,
    isPatient
};