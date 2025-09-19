/**
 * Screen Layout Component
 * 
 * Provides consistent layout for screens with header and navigation controls.
 * Features a collapsible header that shrinks on scroll.
 */

import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

interface ScreenLayoutProps {
  title?: string;
  showBack?: boolean;
  children: React.ReactNode;
}

const HEADER_MAX_HEIGHT = 120;
const HEADER_MIN_HEIGHT = 64;
const HEADER_SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;

export function ScreenLayout({ title, showBack = true, children }: ScreenLayoutProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  const scrollY = useRef(new Animated.Value(0)).current;

  const titleScale = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [1.4, 1],
    extrapolate: 'clamp',
  });

  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, -20],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, -HEADER_SCROLL_DISTANCE],
    extrapolate: 'clamp',
  });

  const backOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [1, 0.7],
    extrapolate: 'clamp',
  });

  const handleScroll = useCallback(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      { useNativeDriver: true }
    ),
    [scrollY]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Animated.View 
        style={[
          styles.header, 
          { 
            transform: [{ translateY: headerTranslateY }],
            paddingTop: insets.top,
            backgroundColor: theme.colors.elevation.level1,
            zIndex: 1000,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
              },
              android: {
                elevation: 4,
              },
            }),
          }
        ]}
      >
        <View style={[styles.headerContent, { height: HEADER_MIN_HEIGHT }]}>
          {showBack && (
            <Animated.View style={{ opacity: backOpacity }}>
              <Pressable 
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <IconButton
                  icon="chevron-left"
                  size={28}
                  iconColor={theme.colors.primary}
                  style={styles.backIcon}
                />
                <Text
                  variant="bodyLarge"
                  style={[styles.backText, { color: theme.colors.primary }]}
                >
                  {t('common.back')}
                </Text>
              </Pressable>
            </Animated.View>
          )}
          {title && (
            <Animated.Text 
              style={[
                styles.title,
                { 
                  color: theme.colors.onBackground,
                  transform: [
                    { scale: titleScale },
                    { translateY: titleTranslateY }
                  ]
                }
              ]}
            >
              {title}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
      <Animated.ScrollView
        style={[styles.scrollView, { marginTop: HEADER_MAX_HEIGHT + insets.top }]}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_MAX_HEIGHT,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  backIcon: {
    margin: 0,
  },
  backText: {
    marginLeft: -8,
    fontWeight: '500',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 12,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
}); 