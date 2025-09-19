/**
 * Base Role Model
 * 
 * Base class for all role-specific models.
 * Provides common functionality for role management.
 */

import type { Instance } from '@refinio/one.core/lib/recipes';
import type { Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { RoleCertificate } from '../../utils/RoleCertificate';
import type { OneVersionedObjectTypeNames } from '@refinio/one.core/lib/recipes';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import { Model } from '@refinio/one.models/lib/models/Model.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { objectEvents } from '@refinio/one.models/lib/misc/ObjectEventDispatcher';
import { hasRole, Role, getPersonIdsForRole } from './role-utils';

export abstract class BaseRoleModel extends Model {
    protected readonly instance: Instance;
    protected readonly leuteModel: LeuteModel;
    protected readonly roleName: string;
    protected readonly appName: string;

    public onRoleChange = new OEvent<() => void | Promise<void>>();
    private roleChangeListener: (() => void) | null = null;

    constructor(instance: Instance, leuteModel: LeuteModel, roleName: string, appName: string) {
        super();
        this.instance = instance;
        this.leuteModel = leuteModel;
        this.roleName = roleName;
        this.appName = appName;
    }

    /**
     * Initialize the model
     */
    public async init(): Promise<void> {
        // Only initialize once
        if (this.state.currentState === 'Initialised') {
            return;
        }

        try {
            // Set up role change listener using objectEvents
            this.roleChangeListener = objectEvents.onNewVersion(
                async () => {
                    await this.leuteModel.trust.refreshCaches();
                    await this.onRoleChange.emitAll();
                },
                'RoleCertificateListener',
                'RoleCertificate'
            );

            this.state.triggerEvent('init');
            await this.onRoleChange.emitAll();
        } catch (error) {
            console.error('[BaseRoleModel] Error during initialization:', error);
            throw error;
        }
    }

    /**
     * Shutdown the model
     */
    public async shutdown(): Promise<void> {
        if (this.state.currentState === 'Uninitialised') {
            return;
        }

        try {
            // Remove role change listener
            if (this.roleChangeListener) {
                this.roleChangeListener();
                this.roleChangeListener = null;
            }

            this.state.triggerEvent('shutdown');
        } catch (error) {
            console.error('[BaseRoleModel] Error during shutdown:', error);
            throw error;
        }
    }

    /**
     * Get all persons with this role
     */
    public async getPersonsWithRole(): Promise<Person[]> {
        const personIds = await getPersonIdsForRole(this.leuteModel, this.roleName as Role, this.appName);
        const persons: Person[] = [];
        for (const id of personIds) {
            try {
                const someone = await this.leuteModel.getSomeone(id);
                if (someone) {
                    const personId = await someone.mainIdentity();
                    persons.push({
                        $type$: 'Person',
                        email: personId
                    });
                }
            } catch (error) {
                console.error(`[BaseRoleModel] Error getting person ${id}:`, error);
            }
        }
        return persons;
    }

    /**
     * Check if a person has this role
     */
    public async hasRole(personId: SHA256IdHash): Promise<boolean> {
        return hasRole(this.leuteModel, personId, this.roleName as Role, this.appName);
    }

    /**
     * Check if a certificate is a role certificate for this role
     */
    protected isRoleCertificate(
        certificate: RoleCertificate,
        person?: SHA256IdHash<Person>
    ): boolean {
        // Ensure model is initialized
        if (this.state.currentState !== 'Initialised') {
            throw new Error(`${this.roleName}Model must be initialized before checking certificates`);
        }

        return (
            certificate.app === this.appName &&
            certificate.role === this.roleName &&
            (person === undefined || certificate.person === person)
        );
    }

    /**
     * Assign this role to a person
     */
    protected async assignRole(personId: SHA256IdHash<Person>): Promise<void> {
        // Ensure model is initialized
        if (this.state.currentState !== 'Initialised') {
            throw new Error(`${this.roleName}Model must be initialized before assigning roles`);
        }

        try {
            const myMainIdentity = await this.leuteModel.myMainIdentity();

            // Create role certificate
            await this.leuteModel.trust.certify(
                'RoleCertificate',
                {
                    person: personId,
                    role: this.roleName,
                    app: this.appName
                },
                myMainIdentity
            );

            // Refresh caches and emit change
            await this.leuteModel.trust.refreshCaches();
            await this.onRoleChange.emitAll();
        } catch (error) {
            console.error(`[${this.roleName}Model] Error assigning role:`, error);
            throw error;
        }
    }
} 