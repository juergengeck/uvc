import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, GestureResponderEvent, Dimensions } from 'react-native';
import { debugService } from './DebugService';

interface Props {
  children: React.ReactNode;
}

// Configuration for the debug gesture (triple tap in top right)
const TRIPLE_TAP_TIMEOUT = 500; // ms
const TAP_AREA_SIZE = 60; // size of the tap area in pixels
const REQUIRED_TAPS = 3; // number of taps required

/**
 * A component that wraps the app and listens for a specific gesture pattern
 * to activate the debug overlay.
 */
const DebugGesture: React.FC<Props> = ({ children }) => {
  // Keep track of taps
  const tapCount = useRef(0);
  const lastTapTime = useRef(0);
  
  // Handle tap
  const handleTap = (evt: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = evt.nativeEvent;
    
    // Only respond to taps in the top right corner
    const screenWidth = Dimensions.get('window').width;
    const isInTopRightCorner = pageX > (screenWidth - TAP_AREA_SIZE) && pageY < TAP_AREA_SIZE;
    
    if (!isInTopRightCorner) {
      // Reset if tap outside the activation area
      tapCount.current = 0;
      return false;
    }
    
    const now = Date.now();
    
    // Check if this is a sequence of taps within timeout
    if (now - lastTapTime.current > TRIPLE_TAP_TIMEOUT) {
      tapCount.current = 1;
    } else {
      tapCount.current++;
    }
    
    lastTapTime.current = now;
    
    // Toggle debug if we've reached the required number of taps
    if (tapCount.current === REQUIRED_TAPS) {
      debugService.toggleVisibility();
      debugService.info('Debug overlay toggled via gesture');
      tapCount.current = 0;
    }
    
    // Don't capture the event if we're not in the target area
    return false;
  };
  
  return (
    <View 
      style={styles.container}
      onStartShouldSetResponder={handleTap}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default DebugGesture; 