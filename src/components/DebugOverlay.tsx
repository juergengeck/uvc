import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { debugService } from '../utils/DebugService';

// Define types for our debug message
type DebugMessage = {
  id: string;
  timestamp: Date;
  message: string;
  level: 'info' | 'warn' | 'error';
  data?: any;
};

// Create context for managing debug messages
type DebugContextType = {
  messages: DebugMessage[];
  addMessage: (message: string, level?: 'info' | 'warn' | 'error', data?: any) => void;
  clearMessages: () => void;
  isVisible: boolean;
  setVisible: (visible: boolean) => void;
  toggleVisibility: () => void;
};

const DebugContext = createContext<DebugContextType>({
  messages: [],
  addMessage: () => {},
  clearMessages: () => {},
  isVisible: false,
  setVisible: () => {},
  toggleVisibility: () => {},
});

// Hook for components to use the debug context
export const useDebug = () => useContext(DebugContext);

// Provider component to wrap the app
export const DebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  
  // Maximum number of messages to keep
  const MAX_MESSAGES = 50;

  // Function to add a new debug message
  const addMessage = useCallback((message: string, level: 'info' | 'warn' | 'error' = 'info', data?: any) => {
    setMessages(prevMessages => {
      const newMessages = [
        {
          id: Date.now().toString(),
          timestamp: new Date(),
          message,
          level,
          data
        },
        ...prevMessages,
      ];
      
      // Trim messages if exceeding max count
      return newMessages.slice(0, MAX_MESSAGES);
    });
  }, []);

  // Function to clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Toggle visibility
  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => !prev);
  }, []);

  // Connect to the debug service
  useEffect(() => {
    // Subscribe to debug messages from the service
    const unsubscribe = debugService.subscribe((message, level, data) => {
      addMessage(message, level, data);
    });
    
    // Subscribe to visibility changes from the service
    const unsubscribeVisibility = debugService.subscribeVisibility((visible) => {
      setIsVisible(visible);
    });
    
    return () => {
      unsubscribe();
      unsubscribeVisibility();
    };
  }, [addMessage]);
  
  // Keep the service's visibility in sync with our state
  useEffect(() => {
    debugService.setVisible(isVisible);
  }, [isVisible]);

  // Context value
  const contextValue = {
    messages,
    addMessage,
    clearMessages,
    isVisible,
    setVisible: setIsVisible,
    toggleVisibility
  };

  return (
    <DebugContext.Provider value={contextValue}>
      {children}
      {isVisible && <OverlayComponent />}
    </DebugContext.Provider>
  );
};

// The actual overlay component that renders the debug messages
const OverlayComponent: React.FC = () => {
  const { messages, clearMessages, toggleVisibility } = useDebug();
  
  // Auto-scroll to bottom on new messages
  const scrollViewRef = React.useRef<ScrollView>(null);
  
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: false });
    }
  }, [messages]);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.header}>
        <Text style={styles.title}>Debug Console</Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={clearMessages} style={styles.button}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleVisibility} style={styles.button}>
            <Text style={styles.buttonText}>Hide</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.contentContainer}
      >
        {messages.map((msg) => (
          <Text 
            key={msg.id} 
            style={[
              styles.message, 
              msg.level === 'error' && styles.errorMessage,
              msg.level === 'warn' && styles.warnMessage,
            ]}
          >
            {`[${msg.timestamp.toLocaleTimeString()}] ${msg.message}`}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

// Styles for the overlay
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 50,
    right: 5,
    maxWidth: '85%',
    width: 300,
    maxHeight: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    borderColor: '#ff5555',
    borderWidth: 1,
    zIndex: 9999,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomColor: '#ff5555',
    borderBottomWidth: 1,
  },
  title: {
    color: '#ff5555',
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
  },
  button: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#333',
    borderRadius: 4,
  },
  buttonText: {
    color: '#ff5555',
    fontSize: 12,
  },
  scrollContainer: {
    maxHeight: '100%',
  },
  contentContainer: {
    padding: 8,
  },
  message: {
    color: '#ff5555',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  errorMessage: {
    color: '#ff3333',
    fontWeight: 'bold',
  },
  warnMessage: {
    color: '#ffaa00',
  },
});

// Export for use in other components
export default DebugProvider; 