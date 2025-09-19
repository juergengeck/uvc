import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Group, Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import {serializeWithType} from '@refinio/one.core/lib/util/promise.js';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {createAccess} from '@refinio/one.core/lib/access.js';

import QuestionnaireModel from '@refinio/one.models/lib/models/QuestionnaireModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type {RawChannelEntry} from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type {SignKey} from '@refinio/one.models/lib/recipes/Leute/PersonDescriptions.js';
import type TrustedKeysManager from '@refinio/one.models/lib/models/Leute/TrustedKeysManager.js';
import type {ChannelInfo} from '@refinio/one.models/lib/recipes/ChannelRecipes.js';

/**
 * This type defines how access rights for channels are specified
 */
type ChannelAccessRights = {
    owner: SHA256IdHash<Person> | null; // The owner of the channels
    persons: SHA256IdHash<Person>[]; // The persons who should gain access
    groups: SHA256IdHash<Group>[];
    channels: string[]; // The channels that should gain access
};

type ChannelAccessRightsSingleChannel = Omit<ChannelAccessRights, 'channels'> & {channel: string};

type GroupConfig = {
    iom?: SHA256IdHash<Group>;
    leuteReplicant?: SHA256IdHash<Group>;
    glueReplicant?: SHA256IdHash<Group>;
    everyone?: SHA256IdHash<Group>;
};

/**
 * This class manages all access rights for IoM & IoP.
 *
 * The replicant has its own file in its own repo.
 *
 */
export default class LeuteAccessRightsManager {
    private readonly channelManager: ChannelManager;
    // private readonly connectionsModel: ConnectionsModel;
    private readonly leuteModel: LeuteModel;
    // private initialized: boolean;
    private groupConfig: GroupConfig = {};

    /**
     * Create a new instance.
     *
     * @param channelManager
     * @param connectionsModel
     * @param leuteModel
     */
    constructor(
        channelManager: ChannelManager,
        connectionsModel: ConnectionsModel,
        leuteModel: LeuteModel
    ) {
        this.channelManager = channelManager;
        // this.connectionsModel = connectionsModel;
        this.leuteModel = leuteModel;
        // this.initialized = false;

        // Register hook for new connections && contacts
        connectionsModel.pairing.onPairingSuccess(
            LeuteAccessRightsManager.trustPairingKeys.bind(this, leuteModel.trust)
        );

        this.leuteModel.afterMainIdSwitch(() => {
            this.giveAccessToMainProfileForEverybody().catch(console.error);
        });

        // Commented, so that not al profiles are shared with everybody
        // objectEvents.onNewVersion.addListener(
        //     this.shareProfileWithEverybody.bind(this),
        //     'LeuteAccessRightsManager: shareProfileWithEverybody', 'Profile'
        // );

        // Share all questionnaire channels with IoM
        channelManager.onUpdated(
            async (
                channelInfoIdHash: SHA256IdHash<ChannelInfo>,
                channelId: string,
                channelOwner: SHA256IdHash<Person> | null,
                _timeOfEarliestChange: Date,
                data: RawChannelEntry[]
            ) => {
                try {
                    // Original: Grant channel info access to IoM group
                    await createAccess([
                        {
                            id: channelInfoIdHash,
                            person: [],
                            group: this.groups('iom'),
                            mode: SET_ACCESS_MODE.ADD
                        }
                    ]);

                    // NEW: For 1-to-1 chats, grant access to the other person
                    if (channelId.includes('<->')) {
                        // Extract participant IDs from channel name
                        const participants = channelId.split('<->');
                        const myId = await this.leuteModel.myMainIdentity();
                        const myIdString = myId.toString();
                        const otherPersonId = participants.find(id => id !== myIdString);
                        
                        // Enhanced logging with user names
                        const myIdShort = myIdString.substring(0, 8);
                        const userName = myIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
                        const otherIdShort = otherPersonId?.substring(0, 8);
                        const otherName = otherIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
                        
                        console.log(`[LeuteAccessRightsManager] [${userName}] 1-to-1 chat detected: ${channelId}`);
                        console.log(`[LeuteAccessRightsManager] [${userName}] Channel entries to grant access: ${data?.length || 0}`);
                        
                        if (otherPersonId) {
                            // Grant access to channel info for the other person
                            await createAccess([
                                {
                                    id: channelInfoIdHash,
                                    person: [otherPersonId as SHA256IdHash<Person>],
                                    group: [],
                                    mode: SET_ACCESS_MODE.ADD
                                }
                            ]);

                            // Grant access to all channel entries for the other person
                            if (data && data.length > 0) {
                                const entryAccessGrants = [];
                                for (const [idx, entry] of data.entries()) {
                                    if (!entry.channelEntryHash) {
                                        console.log(`[LeuteAccessRightsManager] [${userName}] ⚠️ Entry ${idx} missing channelEntryHash`);
                                    }
                                    if (!entry.dataHash) {
                                        console.log(`[LeuteAccessRightsManager] [${userName}] ⚠️ Entry ${idx} missing dataHash`);
                                    }
                                    
                                    // Grant access to the channel entry itself
                                    if (entry.channelEntryHash) {
                                        entryAccessGrants.push({
                                            object: entry.channelEntryHash,  // Use 'object' for regular hashes!
                                            person: [otherPersonId as SHA256IdHash<Person>],
                                            group: [],
                                            mode: SET_ACCESS_MODE.ADD
                                        });
                                    }
                                    
                                    // Grant access to the message data
                                    if (entry.dataHash) {
                                        entryAccessGrants.push({
                                            object: entry.dataHash,  // Use 'object' for regular hashes!
                                            person: [otherPersonId as SHA256IdHash<Person>],
                                            group: [],
                                            mode: SET_ACCESS_MODE.ADD
                                        });
                                    }
                                }
                                
                                if (entryAccessGrants.length > 0) {
                                    await createAccess(entryAccessGrants as any);
                                    console.log(`[LeuteAccessRightsManager] [${userName}] ✅ Granted access to ${entryAccessGrants.length} objects for ${otherName} (${otherIdShort}...)`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('[LeuteAccessRightsManager] Error creating access grants:', error);
                }
            }
        );
    }

    /**
     * Set up the access rights handling for the application on the current instance.
     *
     * @param groups
     */
    public async init(groups?: GroupConfig): Promise<void> {
        if (groups) {
            this.groupConfig = groups;
        }
        await this.giveAccessToChannels();
        await this.giveAccessToMainProfileForEverybody();
        // this.initialized = true;
    }

    /**
     * Shuts everything down.
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    public async shutdown(): Promise<void> {
        // this.initialized = false;
        this.groupConfig = {};
    }

    // ######## Group helper functions ########

    groups(...groupNames: Array<keyof GroupConfig>): SHA256IdHash<Group>[] {
        const groups: SHA256IdHash<Group>[] = [];
        for (const groupName of groupNames) {
            const groupConfigEntry = this.groupConfig[groupName];
            if (groupConfigEntry !== undefined) {
                groups.push(groupConfigEntry);
            }
        }
        return groups;
    }

    // ######## Share stuff functions ########

    // /**
    //  * Handler for new versions or new profiles.
    //  * @param result
    //  */
    // private async shareProfileWithEverybody(result: VersionedObjectResult<Profile>): Promise<void> {
    //     try {
    //         await serializeWithType('Share', async () => {
    //             const setAccessParam = {
    //                 id: result.idHash,
    //                 person: [],
    //                 group: this.groups('everyone'),
    //                 mode: SET_ACCESS_MODE.ADD
    //             };
    //             await createAccess([setAccessParam]);
    //         });
    //     } catch (e) {
    //         console.error(e);
    //     }
    // }

    /**
     * Gives access to the main profile for everybody.
     *
     * @private
     */
    private async giveAccessToMainProfileForEverybody(): Promise<void> {
        const me = await this.leuteModel.me();
        const mainProfile = me.mainProfileLazyLoad();

        await serializeWithType('Share', async () => {
            const setAccessParam = {
                id: mainProfile.idHash,
                person: [],
                group: this.groups('everyone'),
                mode: SET_ACCESS_MODE.ADD
            };
            await createAccess([setAccessParam]);
        });
    }

    /**
     * This function trusts the keys of the newly paired connection.
     *
     * Since keys are transported after the established connection via chum, we need to wait
     * for a while until keys are available. => 10 retries each seconds.
     *
     * @param trust
     * @param _initiatedLocally
     * @param localPersonId
     * @param _localInstanceId
     * @param remotePersonId
     * @param _remoteInstanceId
     * @param _token
     */
    private static async trustPairingKeys(
        trust: TrustedKeysManager,
        _initiatedLocally: boolean,
        localPersonId: SHA256IdHash<Person>,
        _localInstanceId: SHA256IdHash<Instance>,
        remotePersonId: SHA256IdHash<Person>,
        _remoteInstanceId: SHA256IdHash<Instance>,
        _token: string
    ): Promise<void> {
        try {
            const keys = await getAllEntries(remotePersonId, 'Keys');

            if (keys.length > 0) {
                const key = await getObject(keys[0]);

                const signKey: SignKey = {
                    $type$: 'SignKey',
                    key: key.publicSignKey
                };

                const profile = await ProfileModel.constructWithNewProfile(
                    remotePersonId,
                    localPersonId,
                    'default',
                    [],
                    [signKey]
                );

                if (profile.loadedVersion === undefined) {
                    throw new Error('Profile model has no hash for profile with sign key');
                }

                await trust.certify('TrustKeysCertificate', {profile: profile.loadedVersion});
                await trust.refreshCaches(); // Just a hack until we have a better way of refresh
                console.log('Key signing succeeded', remotePersonId);
            }
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Setup access rights for the patient app.
     *
     * Note that this function is just a hack until group are functioning properly
     * TODO: this function should be removed when the group data sharing is working
     */
    private async giveAccessToChannels(): Promise<void> {
        const me = await this.leuteModel.me();
        const mainId = await me.mainIdentity();

        // Build list of access rights for our own channels
        const channelAccessRights = [
            {
                owner: mainId,
                persons: [],
                groups: this.groups('iom', 'leuteReplicant', 'glueReplicant'),
                channels: [QuestionnaireModel.channelId]
            }
        ];
        await this.applyAccessRights(channelAccessRights);
    }

    // ######## Generic function for applying access rights ########

    /**
     * Apply the specified channel access rights by writing access objects.
     *
     * Note that the array should not have duplicate entries in regard to owner / channelname combinations.
     * Otherwise, only one of them will be applied. Which one is not deterministic.
     *
     * @param channelAccessRights
     */
    private async applyAccessRights(channelAccessRights: ChannelAccessRights[]): Promise<void> {
        await serializeWithType('IdAccess', async () => {
            // Transform each ChannelAccessRights element to multiple ChannelAccessRightsSingleChannel elements.
            const accessRights: ChannelAccessRightsSingleChannel[] = [];
            for (const accessRight of channelAccessRights) {
                const {channels, ...accessRightWithoutChannels} = accessRight;

                for (const channel of channels) {
                    accessRights.push({
                        ...accessRightWithoutChannels,
                        channel
                    });
                }
            }

            // Apply all access rights
            await Promise.all(
                accessRights.map(async accessInfo => {
                    await this.channelManager.createChannel(accessInfo.channel, accessInfo.owner);

                    const channelIdHash = await calculateIdHashOfObj({
                        $type$: 'ChannelInfo',
                        id: accessInfo.channel,
                        owner: accessInfo.owner === null ? undefined : accessInfo.owner
                    });

                    await createAccess([
                        {
                            id: channelIdHash,
                            person: accessInfo.persons,
                            group: accessInfo.groups,
                            mode: SET_ACCESS_MODE.ADD
                        }
                    ]);
                })
            );
        });
    }
    
}