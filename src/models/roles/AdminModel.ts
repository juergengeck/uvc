/**
 * Admin Role Model
 * 
 * Manages admin-specific functionality and group membership.
 */

import type { Instance } from '@refinio/one.core/lib/recipes';
import type { Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import { BaseRoleModel } from './BaseRoleModel';
import { Role } from './role-utils';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';

export class AdminModel extends BaseRoleModel {
    private static readonly ADMIN_GROUP = 'admins';
    private adminGroup?: GroupModel;

    constructor(instance: Instance, leuteModel: LeuteModel) {
        super(instance, leuteModel, Role.ADMIN, 'lama');
    }

    /**
     * Initialize the admin model
     */
    public async initialize(): Promise<void> {
        await super.initialize();
        this.adminGroup = await GroupModel.constructWithNewGroup(AdminModel.ADMIN_GROUP);
    }

    /**
     * Shutdown the admin model
     */
    public async shutdown(): Promise<void> {
        // No special cleanup needed
    }

    /**
     * Make a person an admin
     */
    public async makeAdmin(personId: SHA256IdHash<Person>): Promise<void> {
        try {
            if (!this.adminGroup) {
                throw new Error('Admin group not initialized');
            }

            // Add to admin group
            if (!this.adminGroup.persons.includes(personId)) {
                this.adminGroup.persons.push(personId);
                await this.adminGroup.saveAndLoad();
            }

            // Create admin role certificate
            await this.assignRole(personId);
        } catch (error) {
            console.error('[AdminModel] Error making admin:', error);
            throw error;
        }
    }
}

export default {
    AdminModel,
};