import React, { createContext, useContext } from 'react';

// Create context with default values
const AppContext = createContext({});

/**
 * AppContext Provider for global application state
 */
export const AppContextProvider = ({ children, value = {} }) => {
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

/**
 * Hook to access the app context
 */
export const useAppContext = () => {
  return useContext(AppContext);
};

export default AppContext; 