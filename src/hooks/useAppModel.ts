import { useInstance } from '@src/providers/app/useInstance';
import type { AppModel } from '../models/AppModel';

/**
 * Hook to access the AppModel from anywhere in the component tree
 *
 * Returns the AppModel directly without any useEffect delay, eliminating race conditions
 *
 * @returns {Object} Object containing the AppModel instance
 */
export const useAppModel = () => {
  const { instance } = useInstance();

  return { appModel: instance as AppModel | null };
}; 