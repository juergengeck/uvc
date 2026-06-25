/**
 * Group Manager - Uses OneGroupPlan from refinio.api for proper group creation
 * with AffirmationCertificates and certificate-based trust validation
 */

import { OneGroupPlan } from '@refinio/api/plans/OneGroupPlan.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Create a group with proper certificate-based trust
 *
 * This replaces the buggy leuteModel.createGroup() which doesn't create HashGroup
 */
export async function createGroupWithCertificate(
  leuteModel: LeuteModel,
  members: SHA256IdHash<any>[]
): Promise<{
  success: boolean;
  groupId?: SHA256IdHash<any>;
  error?: string;
}> {
  try {
    const plan = new OneGroupPlan(leuteModel);
    const result = await plan.createWithCertificate(members as string[]);

    return {
      success: true,
      groupId: result.groupId as SHA256IdHash<any>,
      memberCount: result.memberCount,
      certificate: result.certificate
    } as any;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? String(error)
    };
  }
}

/**
 * Validate a group using certificate-based trust
 *
 * Checks if the group has a valid AffirmationCertificate from a trusted person
 */
export async function validateGroup(
  leuteModel: LeuteModel,
  groupId: SHA256IdHash<any>
): Promise<{
  success: boolean;
  valid?: boolean;
  error?: string;
}> {
  try {
    const plan = new OneGroupPlan(leuteModel);
    const result = await plan.validate(groupId as string);

    return {
      success: true,
      ...result
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? String(error)
    };
  }
}
