import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { Esp32CamFeedCard } from '@src/components/devices/Esp32CamFeedCard';
import { useDeviceDiscovery } from '@src/hooks/devices/useDeviceDiscovery';
import { isEsp32CamCandidate } from '@src/utils/esp32Cam';

export default function DeviceCameraFeedsScreen() {
  const theme = useTheme();
  const { devices, handleRefresh, isLoading, refreshing } = useDeviceDiscovery();

  const cameraDevices = useMemo(
    () =>
      devices.filter(device => isEsp32CamCandidate(device.type, device.address)).sort((left, right) => {
        if (left.online !== right.online) {
          return left.online ? -1 : 1;
        }

        if (left.connected !== right.connected) {
          return left.connected ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [devices]
  );

  if (isLoading && cameraDevices.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={cameraDevices}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Esp32CamFeedCard
          address={item.address}
          cardTitle={item.name}
          deviceId={item.id}
          deviceName={item.name}
          deviceType={item.type}
        />
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.contentContainer,
        cameraDevices.length === 0 ? styles.emptyContentContainer : null,
      ]}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text variant="titleLarge">ESP32-CAM Feeds</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Live and snapshot views for discovered ESP32 cameras on your local network.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text variant="titleMedium">No camera feeds yet</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            Bring an ESP32-CAM online and it will appear here as soon as the app sees a reachable LAN address.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    padding: 16,
  },
  emptyContentContainer: {
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  header: {
    gap: 6,
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 16,
  },
});
