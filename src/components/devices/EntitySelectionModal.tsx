import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal, Card, Title, List, Button, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface EntitySelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectEntity: (entityType: EntityType) => void;
}

export type EntityType = 'Organisation' | 'Department' | 'Room' | 'Device' | 'Person';

const ENTITY_OPTIONS: Array<{
  type: EntityType;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    type: 'Organisation',
    title: 'Organisation',
    description: 'Create a new organisation',
    icon: 'domain'
  },
  {
    type: 'Department',
    title: 'Department',
    description: 'Create a new department within an organisation',
    icon: 'office-building'
  },
  {
    type: 'Room',
    title: 'Room',
    description: 'Create a new room within a department',
    icon: 'home-outline'
  },
  {
    type: 'Device',
    title: 'Device',
    description: 'Add a new device',
    icon: 'devices'
  },
  {
    type: 'Person',
    title: 'Person',
    description: 'Add a new person with profile and email',
    icon: 'account-plus'
  }
];

export function EntitySelectionModal({ visible, onDismiss, onSelectEntity }: EntitySelectionModalProps) {
  const theme = useTheme();

  return (
    <Portal>
      <Modal 
        visible={visible} 
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: theme.colors.surface }
        ]}
      >
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.header}>
              <Title style={styles.title}>Add New Entity</Title>
              <IconButton
                icon="close"
                size={24}
                onPress={onDismiss}
                iconColor={theme.colors.onSurface}
              />
            </View>
            
            <List.Section>
              {ENTITY_OPTIONS.map((option) => (
                <List.Item
                  key={option.type}
                  title={option.title}
                  description={option.description}
                  left={() => (
                    <List.Icon 
                      icon={option.icon} 
                      color={theme.colors.primary}
                    />
                  )}
                  right={() => (
                    <List.Icon 
                      icon="chevron-right" 
                      color={theme.colors.onSurfaceVariant}
                    />
                  )}
                  onPress={() => {
                    onSelectEntity(option.type);
                    onDismiss();
                  }}
                  style={styles.listItem}
                />
              ))}
            </List.Section>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  listItem: {
    paddingVertical: 8,
  },
});