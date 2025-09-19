import { useInstance } from '@src/providers/app';
import { useEffect, useState } from 'react';

export function useHealthPermissions() {
  const { instance } = useInstance();
  const [permissions, setPermissions] = useState<any[]>([]);

  useEffect(() => {
    if (!instance) return;
    // TODO: Implement health permissions loading
  }, [instance]);

  return { permissions };
}