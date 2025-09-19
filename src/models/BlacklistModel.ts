import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import { Model } from '@refinio/one.models/lib/models/Model';

// Type assertion to work around TypeScript import issues
type Person = any;

export default class BlacklistModel extends Model {
    private blacklistGroup: GroupModel | undefined;
    private everyoneGroup: GroupModel | undefined;
    private disconnectListeners: (() => void)[];

    constructor() {
        super();
        this.disconnectListeners = [];
    }

    /**
     * Set up the blacklist.
     *
     * @param groups
     */
    public init(blacklistGroup: GroupModel, everyoneGroup: GroupModel): void {
        this.blacklistGroup = blacklistGroup;
        this.everyoneGroup = everyoneGroup;

        this.disconnectListeners.push(
            this.blacklistGroup.onUpdated(
                async (added?: SHA256IdHash<Person>[], removed?: SHA256IdHash<Person>[]) => {
                    if (this.everyoneGroup === undefined) {
                        throw Error('Model not initialized');
                    }

                    if (added) {
                        this.everyoneGroup.persons = this.everyoneGroup.persons.filter(
                            personId => !added.includes(personId)
                        );
                    }
                    if (removed) {
                        this.everyoneGroup.persons.push(...removed);
                    }
                    if (added || removed) {
                        await this.everyoneGroup.saveAndLoad();
                    }
                }
            )
        );
    }

    public get blacklistGroupModel(): GroupModel {
        if (this.blacklistGroup === undefined) {
            throw Error('Model not initialized');
        }
        return this.blacklistGroup;
    }

    /**
     * Shuts everything down.
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async shutdown(): Promise<void> {
        for (const disconnectListener of this.disconnectListeners) {
            disconnectListener();
        }
    }
} 