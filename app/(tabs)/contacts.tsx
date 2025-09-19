import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Searchbar, useTheme, IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { HierarchicalDeviceList } from '@src/components/devices/HierarchicalDeviceList';
import { EntitySelectionModal, type EntityType } from '@src/components/devices/EntitySelectionModal';

export default function DevicesScreen() {
  const { instance } = useInstance();
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const handleEntitySelection = (entityType: EntityType) => {
    switch (entityType) {
      case 'Organisation':
        router.push('/(screens)/devices/create-organisation');
        break;
      case 'Department':
        router.push('/(screens)/devices/create-department');
        break;
      case 'Room':
        router.push('/(screens)/devices/create-room');
        break;
      case 'Device':
        router.push('/(screens)/devices/add-device');
        break;
      case 'Person':
        // We don't handle Person here anymore
        break;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Search Bar with Add Button */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Searchbar
            placeholder="Search devices..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={[styles.searchBar, { backgroundColor: theme.colors.surface }]}
          />
          <IconButton
            icon="plus"
            size={24}
            onPress={() => router.push('/(screens)/devices/create-organisation')}
            iconColor={theme.colors.primary}
            style={styles.addButton}
          />
        </View>
      </View>

      {/* Hierarchical Device List */}
      <View style={styles.contentContainer}>
        <HierarchicalDeviceList />
      </View>

      {/* Entity Selection Modal */}
      <EntitySelectionModal
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        onSelectEntity={handleEntitySelection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
  },
  addButton: {
    margin: 0,
  },
  contentContainer: {
    flex: 1,
  },
});