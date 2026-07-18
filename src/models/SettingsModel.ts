import PropertyTreeStore from '@refinio/one.models/lib/models/SettingsModel';

/**
 * Legacy PropertyTree owner retained for non-settings metadata and the one-time
 * settings.core migration. New application settings must not be added here.
 */
export class SettingsModel {
    private _propertyTree?: PropertyTreeStore;

    constructor(private readonly appName: string = 'lama-app') {}

    public async init(): Promise<void> {
        if (this._propertyTree) {
            return;
        }
        const propertyTree = new PropertyTreeStore(this.appName);
        await propertyTree.init();
        this._propertyTree = propertyTree;
    }

    public get propertyTree(): PropertyTreeStore {
        if (!this._propertyTree) {
            throw new Error('Legacy PropertyTree accessed before initialization');
        }
        return this._propertyTree;
    }

    public async shutdown(): Promise<void> {
        this._propertyTree = undefined;
    }
}
