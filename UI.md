# LAMA UI Guidelines

## Design Principles

LAMA follows iOS Settings-style design patterns for consistency and user familiarity. This document outlines the UI component structure and styling patterns to ensure consistent implementation across the app.

## Component Hierarchy

### Settings Screen Structure

```
SettingsScreen
├── SettingsSectionTitle (uppercase label)
├── SettingsSection (container)
│   ├── SettingsContent (component)
│   │   ├── List.Subheader (optional)
│   │   ├── List.Item
│   │   ├── List.Item
│   │   └── ...
```

### Styling Responsibility

1. **Parent Components**: Responsible for:
   - Section containers (cards)
   - Spacing between sections
   - Section titles
   - Border radius for the entire section

2. **Child Components**: Responsible for:
   - Internal content only
   - Should NOT implement their own section boundaries
   - Should NOT add their own section padding

3. **List Components**: 
   - Individual List.Items should use `themedStyles.settingsItem`
   - Last item should use `themedStyles.settingsItemLast` to remove bottom border

## Dialog Styling Guidelines

Dialogs should follow iOS design standards:

1. **Corner Radius**: Use a 14px corner radius for all dialogs to match iOS alerts
   ```typescript
   <Dialog style={{ borderRadius: 14 }}>
     {/* Dialog content */}
   </Dialog>
   ```

2. **Button Colors**:
   - Cancel/dismiss buttons should use default theme colors
   - Destructive actions (like Delete) should use `paperTheme.colors.error`
   - Primary actions should use `paperTheme.colors.primary`

3. **Dialog Title**: Should be brief and clear, describing the action or decision

4. **Dialog Content**: Should provide concise information, using standard text components

## Correct Implementation Patterns

### ✅ DO: Content-Only Components

Settings content components should focus on content, not containers:

```typescript
export function MySettings() {
  return (
    <>
      <List.Subheader>My Section</List.Subheader>
      <List.Item 
        title="Setting One"
        style={themedStyles.settingsItem}
      />
      <List.Item 
        title="Setting Two"
        style={[themedStyles.settingsItem, themedStyles.settingsItemLast]} 
      />
    </>
  );
}
```

### ❌ DON'T: Nested Section Containers

Avoid creating nested section containers inside content components:

```typescript
// DON'T DO THIS
export function MySettings() {
  return (
    <View style={themedStyles.settingsSection}>  // WRONG! Parent already provides this
      <List.Section>  // WRONG! Creates nested section with its own borders/dividers
        <List.Subheader>My Section</List.Subheader>
        <List.Item title="Setting One" />
      </List.Section>
    </View>
  );
}
```

## Themed Styles Reference

Key style definitions:

```typescript
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
  paddingTop: 24,
  paddingBottom: 8,
  fontSize: 13,
  color: Platform.select({
    ios: theme.dark ? '#858585' : '#858585',
    default: theme.colors.onSurfaceVariant,
  }),
  textTransform: 'uppercase',
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
```

## Integration Examples

### Parent Component (Settings Screen)

```typescript
<Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
  {t('settings.ai.models.title').toUpperCase()}
</Text>
<View style={themedStyles.settingsSection}>
  <AIModelSettings />
</View>
```

### Child Component (Content Only)

```typescript
export function AIModelSettings() {
  return (
    <>
      <List.Subheader>{t('settings.ai.models.importModel')}</List.Subheader>
      <List.Item
        title={t('settings.ai.models.importFromFile')}
        style={themedStyles.settingsItem}
        /* other props */
      />
      <List.Item
        title={t('settings.ai.models.importFromUrl')}
        style={[themedStyles.settingsItem, themedStyles.settingsItemLast]}
        /* other props */
      />
      
      <List.Subheader>{t('settings.ai.models.installedModels')}</List.Subheader>
      {/* Items with themedStyles.settingsItem */}
      {/* Last item with themedStyles.settingsItemLast */}
    </>
  );
}
``` 