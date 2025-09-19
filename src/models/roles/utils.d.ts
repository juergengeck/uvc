import type { Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import type { LeuteModel } from '@refinio/one.models/lib/models';

export declare function getGroup(name: string): Promise<GroupModel>;

export declare function getPersonIdsForRole(
    leuteModel: LeuteModel,
    isRole: (personId: SHA256IdHash<Person>) => Promise<boolean>,
    exclude?: Array<SHA256IdHash<Person>>
): Promise<Array<SHA256IdHash<Person>>>; 