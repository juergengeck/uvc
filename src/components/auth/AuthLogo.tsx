import React from 'react';
import { View, StyleSheet, useWindowDimensions, Image } from 'react-native';

// UVC logo from wonko.one
const uvcLogoPath = require('@src/assets/images/uvc-logo.png');

interface AuthLogoProps {
  size?: number;
  fillHeight?: boolean;
}

/**
 * AuthLogo Component
 * 
 * Displays the UVC logo on authentication screens.
 * The logo is rendered using a PNG image and maintains aspect ratio.
 * 
 * @param {number} size - The desired width of the logo (default: calculated from screen width)
 * @param {boolean} fillHeight - If true, the logo will fill the available height
 */
export function AuthLogo({ size, fillHeight = false }: AuthLogoProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const aspectRatio = 332 / 730; // UVC logo aspect ratio (height / width)

  // For the wide UVC logo, limit width to 50% of screen width, max 200px
  const defaultSize = Math.min(screenWidth * 0.5, 200);
  
  let logoWidth = size || defaultSize;
  let logoHeight = logoWidth * aspectRatio;

  if (fillHeight) {
    // Calculate size based on available height (assuming ~30% of screen height for wide logos)
    const availableHeight = screenHeight * 0.3;
    logoHeight = availableHeight;
    logoWidth = logoHeight / aspectRatio;
    
    // Ensure width doesn't exceed 60% of screen width
    const maxWidth = screenWidth * 0.6;
    if (logoWidth > maxWidth) {
      logoWidth = maxWidth;
      logoHeight = logoWidth * aspectRatio;
    }
  }

  return (
    <View style={styles.container}>
      <Image 
        source={uvcLogoPath} 
        style={{ 
          width: logoWidth, 
          height: logoHeight,
          resizeMode: 'contain'
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 20,  // Added 20 points margin to move the logo down
    marginBottom: 24,
  },
}); 
