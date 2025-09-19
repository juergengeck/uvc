/**
 * Consolidated type declarations for @refinio/one.models
 */

declare module '@refinio/one.models/lib/misc/OEvent.js' {
  export class OEvent<T extends (...args: any[]) => void> {
    listen(callback: T): { remove?: () => void };
    emit(...args: Parameters<T>): void;
  }
}

declare module '@refinio/one.models/lib/models/ConnectionsModel.js' {
  interface ConnectionsModel {
    [key: string]: any;
  }
  const ConnectionsModel: any;
  export default ConnectionsModel;
}

declare module '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js' {
  export interface Invitation {
    token: string;
    publicKey: string;
    url: string;
    [key: string]: any;
  }
}

declare module '@refinio/one.models/lib/misc/ObjectEventDispatcher.js' {
    const ObjectEventDispatcher: any;
    export default ObjectEventDispatcher;
}

declare module '@refinio/one.models/lib/models/Model.js' {
    export interface Model {
        [key: string]: any;
    }
}

declare module '@refinio/one.models/lib/misc/Authenticator/Authenticator.js' {
    const Authenticator: any;
    export default Authenticator;
}

declare module '@refinio/one.models/lib/models/Leute/LeuteModel.js' {
    const LeuteModel: any;
    export default LeuteModel;
}

declare module '@refinio/one.models/lib/models/QuestionnaireModel.js' {
    const QuestionnaireModel: any;
    export default QuestionnaireModel;
}

declare module '@refinio/one.models/lib/models/Chat/TopicModel.js' {
    const TopicModel: any;
    export default TopicModel;
}

declare module '@refinio/one.models/lib/misc/StateMachine.js' {
  import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
  
  export class StateMachine<StateT extends string, EventT> {
    onEnterState: OEvent<(enteredState: StateT) => void>;
    onLeaveState: OEvent<(leftState: StateT) => void>;
    onStateChange: OEvent<(srcState: StateT, dstState: StateT, event: EventT) => void>;
    onStatesChange: OEvent<(srcStates: StateT[], dstStates: StateT[], event: EventT) => void>;
    
    get currentState(): StateT;
    get currentStates(): StateT[];
    
    addState(state: StateT, subStateMachine?: StateMachine<StateT, EventT>): void;
    setInitialState(state: StateT, hasHistory?: boolean): void;
    addEvent(event: EventT): void;
    addTransition(event: EventT, srcState: StateT, dstState: StateT): void;
    triggerEvent(event: EventT): void;
    reset(event: EventT): void;
  }
}

declare module '@refinio/one.models/lib/models/Leute/ProfileModel.js' {
  const ProfileModel: any;
  export default ProfileModel;
}

declare module '@refinio/one.models/lib/models/Leute/SomeoneModel.js' {
  const SomeoneModel: any;
  export default SomeoneModel;
}

declare module '@refinio/one.models/lib/recipes/Leute/Someone.js' {
  const Someone: any;
  export default Someone;
  export { Someone };
}

declare module '@refinio/one.models/lib/recipes/Leute/Profile.js' {
  const Profile: any;
  export default Profile;
  export { Profile };
}

declare module '@refinio/one.models/lib/models/ChannelManager.js' {
  const ChannelManager: any;
  export default ChannelManager;
}

declare module '@refinio/one.models/lib/models/Leute/BlacklistModel.js' {
  const BlacklistModel: any;
  export default BlacklistModel;
}

declare module '@refinio/one.models/lib/recipes/ChatRecipes.js' {
  export const ChatMessage: any;
  export const ChatAttachment: any;
  export const Topic: any;
}

declare module '@refinio/one.models/lib/models/Authenticator/Authenticator.js' {
  const Authenticator: any;
  export default Authenticator;
}

declare module '@refinio/one.models/lib/models/SettingsModel.js' {
  const SettingsModel: any;
  export default SettingsModel;
} 