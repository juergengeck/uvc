import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { useTheme } from 'react-native-paper';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface AnimatedProgressPieProps {
  size?: number;
  strokeWidth?: number;
  progress?: number; // 0-100
  color?: string;
  backgroundColor?: string;
  showPulse?: boolean;
}

export const AnimatedProgressPie: React.FC<AnimatedProgressPieProps> = ({
  size = 24,
  strokeWidth = 3,
  progress = 0,
  color,
  backgroundColor,
  showPulse = true,
}) => {
  const theme = useTheme();
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Ensure progress is a valid number between 0 and 100
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Primary color for the progress
  const progressColor = color || theme.colors.primary;
  const bgColor = backgroundColor || theme.colors.surfaceVariant;
  
  // Animate progress changes
  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: safeProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [safeProgress, animatedProgress]);
  
  // Pulse animation for when progress is 0 (loading state)
  useEffect(() => {
    if (showPulse && safeProgress === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [showPulse, safeProgress, pulseAnim]);
  
  // Use stroke-dasharray and stroke-dashoffset for animation
  const strokeDasharray = `${circumference} ${circumference}`;
  // Calculate stroke dash offset: when progress is 0%, offset is full circumference (hide all)
  // When progress is 100%, offset is 0 (show all)
  // Calculate the actual offset based on current progress
  const calculatedOffset = circumference - (circumference * safeProgress) / 100;
  
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });
  
  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={bgColor}
            strokeWidth={strokeWidth}
            fill="none"
            opacity={0.3}
          />
          
          {/* Progress circle using stroke-dasharray technique */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
          
          {/* Animated loading indicator when progress is 0 */}
          {safeProgress === 0 && (
            <Circle
              cx={size / 2}
              cy={strokeWidth / 2}
              r={strokeWidth / 2}
              fill={progressColor}
            />
          )}
        </G>
      </Svg>
    </Animated.View>
  );
};