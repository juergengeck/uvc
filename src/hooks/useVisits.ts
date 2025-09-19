import { useInstance } from '@src/providers/app';
import type { Visit } from '@src/types/visits';
import { useEffect, useState } from 'react';

export function useVisits() {
  const { instance } = useInstance();
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    if (!instance) return;
    // TODO: Implement visits loading
  }, [instance]);

  return { visits };
}

export default useVisits;