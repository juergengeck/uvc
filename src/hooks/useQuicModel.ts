import { useContext } from 'react';
import { useApp } from '../providers/app/AppContext';
import { QuicModel } from '../models/network/QuicModel';

/**
 * Hook to access the QuicModel from the AppContext
 * @returns The QuicModel instance or undefined if not available
 */
export function useQuicModel(): QuicModel | undefined {
  const appContext = useApp();
  return appContext.quicModel;
} 