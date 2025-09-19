import { useInstance } from '@src/providers/app';
import { useEffect, useState } from 'react';

export function useProfiles() {
  const { instance } = useInstance();
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (!instance) return;
    // TODO: Implement profiles loading
  }, [instance]);

  return { profiles };
}