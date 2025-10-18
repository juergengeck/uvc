import React from 'react';
import { View, Pressable } from 'react-native';
import { useFeatureTracking } from '@src/hooks/useFeatureTracking';

interface LEDControlProps {
  device: any; // Full device object passed from parent
  onToggleLED?: (device: any) => void;
  isLoading: boolean;
  isPending?: boolean;
}

export const LEDControl = React.memo(function LEDControl({ device, onToggleLED, isLoading, isPending = false }: LEDControlProps) {
  const { trackAction } = useFeatureTracking('led_control');
  const [isBlinking, setIsBlinking] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  React.useEffect(() => {
    if (device.blueLedStatus === 'blink') {
      const interval = setInterval(() => {
        setIsBlinking(prev => !prev);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setIsBlinking(false);
    }
  }, [device.blueLedStatus]);
  
  return (
    <View style={{ 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      gap: 4 
    }}>
      {/* Red LED - Power/Online Status (not controllable) */}
      <View style={{ padding: 6, justifyContent: 'center', alignItems: 'center' }}>
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: device.online ? '#FF4444' : '#FFFFFF',
            borderWidth: 1.5,
            borderColor: device.online ? '#CC0000' : '#CCCCCC',
            shadowColor: device.online ? '#FF4444' : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: device.online ? 0.8 : 0,
            shadowRadius: 6,
            elevation: device.online ? 6 : 0
          }}
        />
      </View>
      
      {/* Blue LED - Controllable */}
      <View>
        <Pressable
          onPress={async () => {
            // Prevent multiple presses
            if (isProcessing) {
              return;
            }

            try {
              // Blue LED pressed
              if (!onToggleLED) {
                return;
              }

              setIsProcessing(true);

              await trackAction('toggle_blue_led', {
                currentState: device.blueLedStatus,
                isOnline: device.online,
                isConnected: device.connected
              });

              // Call handler
              await onToggleLED(device);
            } catch (error) {
              console.error('[LEDControl] Error handling LED press:', error);
            } finally {
              setIsProcessing(false);
            }
          }}
          style={{ padding: 6, justifyContent: 'center', alignItems: 'center' }}
          disabled={isLoading || !onToggleLED || isPending || isProcessing}
        >
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: 
                !onToggleLED ? '#E0E0E0' :  // Gray when not controllable
                device.blueLedStatus === 'on' ? '#0066FF' :
                device.blueLedStatus === 'off' ? '#FFFFFF' :
                device.blueLedStatus === 'blink' ? (isBlinking ? '#0066FF' : '#FFFFFF') :
                '#FFFFFF',
              borderWidth: 1.5,
              borderColor: 
                !onToggleLED ? '#CCCCCC' :  // Gray border when not controllable
                device.blueLedStatus === 'on' ? '#0044CC' :
                device.blueLedStatus === 'off' ? '#CCCCCC' :
                device.blueLedStatus === 'blink' ? '#0044CC' :
                '#CCCCCC',
              shadowColor: (onToggleLED && (device.blueLedStatus === 'on' || (device.blueLedStatus === 'blink' && isBlinking))) ? '#0066FF' : 'transparent',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: (onToggleLED && (device.blueLedStatus === 'on' || (device.blueLedStatus === 'blink' && isBlinking))) ? 0.8 : 0,
              shadowRadius: 6,
              elevation: (onToggleLED && (device.blueLedStatus === 'on' || (device.blueLedStatus === 'blink' && isBlinking))) ? 6 : 0
            }}
          />
        </Pressable>
      </View>
    </View>
  );
});