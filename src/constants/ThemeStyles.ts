import { StyleSheet, Platform } from 'react-native';
import type { MD3Theme } from 'react-native-paper';

/**
 * Creates reusable styles that depend on the theme
 * Following Apple's iOS Settings design patterns for consistency across all screens
 * @param theme The current theme
 * @returns StyleSheet with theme-dependent styles
 */
export function createThemedStyles(theme: MD3Theme) {
  // Common values
  const borderRadius = 10;
  const standardPadding = 16;
  const smallPadding = 8;
  
  return StyleSheet.create({
    // Layout
    screenContainer: {
      flex: 1,
      paddingTop: standardPadding,
      backgroundColor: theme.colors.background,
    },
    
    // Typography
    screenTitle: {
      fontSize: 34,
      fontWeight: 'bold',
      paddingHorizontal: standardPadding,
      paddingTop: standardPadding,
      paddingBottom: smallPadding,
      color: theme.colors.onBackground,
      textAlign: 'left',
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '500',
      paddingHorizontal: standardPadding,
      paddingTop: 24,
      paddingBottom: 8,
      color: Platform.select({
        ios: theme.dark ? '#858585' : '#858585',
        default: theme.colors.onSurfaceVariant,
      }),
      textTransform: 'uppercase',
      textAlign: 'left',
    },
    itemTitle: {
      fontSize: 17,
      fontWeight: '400',
      color: theme.colors.onSurface,
      textAlign: 'left',
    },
    itemDescription: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
    },
    
    // Error styles
    error: {
      marginHorizontal: standardPadding,
      marginBottom: standardPadding,
      color: theme.colors.error,
      fontSize: 13,
    },
    
    // Card/Container styles - based on iOS Settings
    card: {
      marginHorizontal: standardPadding,
      marginBottom: standardPadding,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 1)',
        default: theme.colors.surface,
      }),
      borderRadius: borderRadius,
      overflow: 'hidden',
      // No shadows in iOS Settings
    },
    
    // Settings styles
    settingsSection: {
      marginBottom: standardPadding,
      marginHorizontal: standardPadding,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 1)',
        default: theme.colors.surface,
      }),
      borderRadius: borderRadius,
      overflow: 'hidden',
    },
    settingsSectionTitle: {
      paddingHorizontal: standardPadding,
      paddingTop: 16,
      paddingBottom: 8,
      fontSize: 13,
      color: Platform.select({
        ios: theme.dark ? '#858585' : '#858585',
        default: theme.colors.onSurfaceVariant,
      }),
      textTransform: 'uppercase',
      marginBottom: 8,
      textAlign: 'left',
    },
    settingsItem: {
      paddingVertical: smallPadding,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 1)',
        default: theme.colors.surface,
      }),
    },
    settingsItemLast: {
      borderBottomLeftRadius: borderRadius,
      borderBottomRightRadius: borderRadius,
    },
    settingsDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.29)' : 'rgba(60, 60, 67, 0.29)',
        default: theme.colors.outlineVariant,
      }),
      marginLeft: standardPadding,
    },
    
    // Input fields - iOS style
    inputContainer: {
      marginHorizontal: standardPadding,
      marginBottom: 24,
    },
    inputLabel: {
      fontSize: 17,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
      textAlign: 'left',
      opacity: 0.7,
    },
    input: {
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 8,
      paddingBottom: 10,
      fontSize: 17,
      color: theme.colors.onSurface,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.3)' : 'rgba(60, 60, 67, 0.3)',
        default: theme.colors.outline,
      }),
      width: '100%',
    },
    
    // Button styles - iOS style
    buttonPrimary: {
      backgroundColor: theme.colors.primary, // Use theme primary color (green)
      borderRadius: borderRadius,
      paddingVertical: 14,
      marginHorizontal: standardPadding,
      marginBottom: standardPadding,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPrimaryText: {
      color: 'white',
      fontSize: 17,
      fontWeight: '600',
    },
    buttonSecondary: {
      borderRadius: borderRadius,
      paddingVertical: 14,
      marginHorizontal: standardPadding,
      marginBottom: standardPadding,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondaryText: {
      color: theme.colors.primary, // Use theme primary color (green)
      fontSize: 17,
      fontWeight: '400',
    },
    buttonLink: {
      paddingVertical: smallPadding,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonLinkText: {
      color: theme.colors.primary, // Use theme primary color (green)
      fontSize: 17,
      fontWeight: '400',
    },
    
    // Device settings specific styles
    deviceItem: {
      marginBottom: 4,
    },
    deviceControls: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    emptyText: {
      padding: standardPadding,
      fontStyle: 'italic',
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
    
    // Collapsible sections (for Start screen)
    collapsibleSection: {
      marginHorizontal: standardPadding,
      marginBottom: standardPadding,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 1)',
        default: theme.colors.surface,
      }),
      borderRadius: borderRadius,
      overflow: 'hidden',
    },
    collapsibleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: standardPadding,
      paddingVertical: 14,
    },
    collapsibleHeaderText: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'left',
    },
    collapsibleContent: {
      paddingHorizontal: standardPadding,
      paddingBottom: standardPadding,
    },
    
    // Action buttons (for Start screen)
    actionButton: {
      borderWidth: 1,
      borderColor: theme.colors.primary, // Use theme primary color (green)
      borderRadius: borderRadius,
      paddingVertical: 12,
      marginVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      color: theme.colors.primary, // Use theme primary color (green)
      fontSize: 17,
      fontWeight: '400',
    },
    
    // Surface styles
    surfaceContainer: {
      marginHorizontal: standardPadding,
      marginBottom: smallPadding,
    },
    surface: {
      borderRadius: borderRadius,
      overflow: 'hidden',
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 1)',
        default: theme.colors.surface,
      }),
    },
    
    // Dividers
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.29)' : 'rgba(60, 60, 67, 0.29)',
        default: theme.colors.outlineVariant,
      }),
    },
    
    // Loading overlay
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    
    // Modal styles - iOS style
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      padding: standardPadding,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
      borderRadius: borderRadius,
      padding: 24,
      backgroundColor: Platform.select({
        ios: theme.dark ? '#1C1C1E' : 'white',
        default: theme.colors.surface,
      }),
    },
    modalTitle: {
      marginBottom: standardPadding,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    modalText: {
      marginBottom: standardPadding,
      textAlign: 'center',
      fontSize: 15,
      color: theme.colors.onSurface,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: standardPadding,
    },
    modalButton: {
      flex: 1,
      marginHorizontal: 4,
    },
    
    // Device List Screen styles (missing from original)
    headerContainer: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      elevation: 2,
    },
    appbarHeader: {
      backgroundColor: 'transparent',
      elevation: 0,
    },
    screenContent: {
      flex: 1,
      paddingBottom: standardPadding,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: standardPadding,
    },
    searchContainer: {
      paddingHorizontal: standardPadding,
      paddingVertical: smallPadding,
    },
    searchBar: {
      elevation: 0,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        default: theme.colors.surfaceVariant,
      }),
      borderRadius: borderRadius,
    },
    listContent: {
      paddingBottom: standardPadding,
    },
    emptyContainer: {
      padding: standardPadding,
      alignItems: 'center',
      justifyContent: 'center',
    },
    button: {
      marginTop: standardPadding,
    },
    fab: {
      position: 'absolute',
      right: standardPadding,
      bottom: standardPadding,
      backgroundColor: theme.colors.primary,
    }
  });
} 