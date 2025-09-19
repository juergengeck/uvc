/**
 * Type references for one.models modules
 * This file provides TypeScript with paths to the type definitions
 */

/// <reference path="../../tmp/one.models/lib/models/Leute/LeuteModel.d.ts" />
/// <reference path="../../tmp/one.models/lib/models/Leute/GroupModel.d.ts" />
/// <reference path="../../tmp/one.models/lib/models/ChannelManager.d.ts" />
/// <reference path="../../tmp/one.models/lib/models/ConnectionsModel.d.ts" />
/// <reference path="../../tmp/one.models/lib/misc/OEvent.d.ts" />
/// <reference path="../../tmp/one.models/lib/initialization.d.ts" />
/// <reference path="../../tmp/one.models/lib/models/Questionnaire/QuestionnaireModel.d.ts" />
/// <reference path="../../tmp/one.models/lib/recipes/Questionnaire/types.d.ts" />

// Re-export types for convenience
import type { Instance } from '@refinio/one.core/lib/recipes';
import type { Person, OneObjectTypes } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { OEvent } from '@refinio/one.models/lib/misc/OEvent';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import type GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile';
import type { QuestionnaireItem, QuestionType, BasisfragebogenAppDe } from './questionnaire';
import type { QuestionnaireData } from '../recipes/QuestionnaireTypes';
import type { AuthenticatorOptions } from '@refinio/one.models/lib/models/Authenticator/Authenticator';

// Import local types
import type { HEALTH_RECIPES } from '../recipes/health/recipes';
import type { CanRiskData } from '../recipes/canrisk/types';
import type { HealthKitReading } from '../recipes/healthkit/types';
import type { ImageErrorType } from '../utils/image';

export interface Message {
    $type$: 'Message';
    type: string;
    content: string;
    read: boolean;
    status: string;
    timestamp: number;
}

export type {
    Instance,
    Person,
    OneObjectTypes,
    SHA256IdHash,
    OEvent,
    LeuteModel,
    GroupModel,
    ChannelManager,
    ConnectionsModel,
    QuestionnaireItem,
    QuestionType,
    QuestionnaireData,
    BasisfragebogenAppDe,
    AuthenticatorOptions,
    Message,
    // Local types
    HEALTH_RECIPES,
    CanRiskData,
    HealthKitReading,
    ImageErrorType,
    Profile
};

// Add empty default export since this is a type definition file
export default {};