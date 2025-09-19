import { useState, useEffect } from 'react';
import { useInstance } from '@src/providers/app/useInstance';
import type { AppModel } from '../models/AppModel';

/**
 * Hook to access the AppModel from anywhere in the component tree
 * 
 * @returns {Object} Object containing the AppModel instance
 */
export const useAppModel = () => {
  const [appModel, setAppModel] = useState<AppModel | null>(null);
  const { instance } = useInstance();

  useEffect(() => {
    if (instance) {
      setAppModel(instance as unknown as AppModel);
    }
  }, [instance]);

  return { appModel };
}; 