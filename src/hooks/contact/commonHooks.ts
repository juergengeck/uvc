/**
 * Common hooks for contact management
 */

import { useEffect, useState } from 'react';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Hook to get the current user's person ID
 */
export function usePersonId(leuteModel: LeuteModel): SHA256IdHash<Person> | undefined {
  const [personId, setPersonId] = useState<SHA256IdHash<Person>>();

  useEffect(() => {
    leuteModel.me()
      .then(me => me.mainIdentity())
      .then(id => setPersonId(id))
      .catch(console.error);
  }, [leuteModel]);

  return personId;
} 