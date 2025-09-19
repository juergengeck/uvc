/**
 * Auth Provider Component
 * 
 * Provides access to authenticator instance for auth routes.
 */

import React from 'react';
import type MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser.js';

interface AuthContextType {
  authenticator: MultiUser;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  authenticator: MultiUser;
  children: React.ReactNode;
}

export function AuthProvider({ authenticator, children }: AuthProviderProps) {
  const contextValue = React.useMemo(() => ({
    authenticator
  }), [authenticator]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider; 