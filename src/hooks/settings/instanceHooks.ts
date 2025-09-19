/**
 * Hooks for settings management
 */

import { useEffect, useState } from 'react';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Instance } from '@refinio/one.core/lib/recipes.js';

export interface InstanceListItem {
  mainProfile: ProfileModel;
  instanceId?: SHA256IdHash<Instance>;
}

/**
 * Hook to get lists of instances for the current user and others
 */
export function useInstancesList(leuteModel: LeuteModel): [InstanceListItem[], InstanceListItem[]] {
  const [myInstances, setMyInstances] = useState<InstanceListItem[]>([]);
  const [otherInstances, setOtherInstances] = useState<InstanceListItem[]>([]);

  useEffect(() => {
    async function fetchInstances() {
      const me = await leuteModel.me();
      const others = await leuteModel.others();

      const myInstancesList = [{
        mainProfile: await me.mainProfile()
      }];

      const othersInstancesList = await Promise.all(
        others.map(async (someone) => ({
          mainProfile: await someone.mainProfile()
        }))
      );

      setMyInstances(myInstancesList);
      setOtherInstances(othersInstancesList);
    }

    fetchInstances().catch(console.error);
  }, [leuteModel]);

  return [myInstances, otherInstances];
} 