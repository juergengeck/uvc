import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Text,
  List,
  IconButton,
  ActivityIndicator,
  useTheme,
  Card,
  Chip,
  Surface,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Organisation, Department, Room, Device } from '@OneObjectInterfaces';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import { ESP32ConnectionManager } from '@src/models/network/esp32/ESP32ConnectionManager';

interface HierarchicalItem {
  id: SHA256Hash | string; // This will be the hash or device ID
  type: 'organisation' | 'department' | 'room' | 'device';
  name: string;
  description?: string;
  parentId?: SHA256Hash; // Parent's hash
  expanded?: boolean;
  children?: HierarchicalItem[];
  data?: Organisation | Department | Room | Device;
}

export const HierarchicalDeviceList: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { models } = useInstance();
  const [items, setItems] = useState<HierarchicalItem[]>([]);
  const [unassignedDevices, setUnassignedDevices] = useState<HierarchicalItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Track organisation model state
  const organisationModel = models?.appModel?.organisationModel;
  const [modelReady, setModelReady] = useState(false);
  
  // Check model state manually to avoid conditional hook usage
  useEffect(() => {
    console.log('[HierarchicalDeviceList] 🔥🔥🔥 CODE VERSION: NEW - ' + Date.now());
    console.log('[HierarchicalDeviceList] Debug - models exists?', !!models);
    console.log('[HierarchicalDeviceList] Debug - appModel exists?', !!models?.appModel);
    console.log('[HierarchicalDeviceList] Debug - organisationModel exists?', !!organisationModel);
    if (models) {
      console.log('[HierarchicalDeviceList] Models keys:', Object.keys(models));
    }
    if (models?.appModel) {
      console.log('[HierarchicalDeviceList] AppModel properties:', Object.keys(models.appModel));
    }
    
    if (organisationModel) {
      console.log('[HierarchicalDeviceList] 🔵 OrganisationModel currentState:', organisationModel.currentState);
      const checkState = () => {
        const state = organisationModel.currentState;
        console.log('[HierarchicalDeviceList] 🔵 Checking state:', state);
        const isReady = state === 'Initialised';
        setModelReady(isReady);
        if (!isReady && state !== 'Initialising' && state !== 'Uninitialised') {
          // Check again in a moment
          setTimeout(checkState, 100);
        }
      };
      checkState();
    }
  }, [organisationModel, models]);

  const loadHierarchy = useCallback(async () => {
    if (!models?.appModel?.organisationModel) {
      console.error('[HierarchicalDeviceList] OrganisationModel not available');
      setIsLoading(false);
      return;
    }
    
    // Don't try to load if model isn't ready
    const orgState = models.appModel.organisationModel.currentState;
    if (orgState !== 'Initialised') {
      console.log('[HierarchicalDeviceList] Waiting for OrganisationModel to be ready, current state:', orgState);
      return;
    }

    try {
      console.log('[HierarchicalDeviceList] Loading hierarchy...');
      
      const hierarchicalItems: HierarchicalItem[] = [];
      
      // Load all data from OrganisationModel
      console.log('[HierarchicalDeviceList] Fetching organisations...');
      const orgs = await models.appModel.organisationModel.getAllOrganisations();
      console.log('[HierarchicalDeviceList] Fetching departments...');
      const depts = await models.appModel.organisationModel.getAllDepartments();
      console.log('[HierarchicalDeviceList] Fetching rooms...');
      const rooms = await models.appModel.organisationModel.getAllRooms();
      
      console.log('[HierarchicalDeviceList] Query results - Orgs:', orgs?.length || 0, 'Depts:', depts?.length || 0, 'Rooms:', rooms?.length || 0);
      
      // Create maps for quick lookup
      const deptMap = new Map<string, Array<{ hash: SHA256Hash; department: Department }>>();
      const roomMap = new Map<string, Array<{ hash: SHA256Hash; room: Room }>>();
      
      // Group departments by organisation
      depts.forEach(item => {
        const orgHash = item.department.organisation;
        if (!deptMap.has(orgHash)) {
          deptMap.set(orgHash, []);
        }
        deptMap.get(orgHash)!.push(item);
      });
      
      // Group rooms by department
      rooms.forEach(item => {
        const deptHash = item.room.department;
        if (!roomMap.has(deptHash)) {
          roomMap.set(deptHash, []);
        }
        roomMap.get(deptHash)!.push(item);
      });
      
      // Build hierarchy
      for (const orgData of orgs) {
        const orgItem: HierarchicalItem = {
          id: orgData.hash,
          type: 'organisation',
          name: orgData.organisation.name,
          description: orgData.organisation.description,
          children: [],
          data: orgData.organisation
        };
        
        // Add departments for this organisation
        const orgDepts = deptMap.get(orgData.hash) || [];
        for (const deptData of orgDepts) {
          const deptItem: HierarchicalItem = {
            id: deptData.hash,
            type: 'department',
            name: deptData.department.name,
            description: deptData.department.description,
            parentId: orgData.hash,
            children: [],
            data: deptData.department
          };
          
          // Add rooms for this department
          const deptRooms = roomMap.get(deptData.hash) || [];
          for (const roomData of deptRooms) {
            const roomItem: HierarchicalItem = {
              id: roomData.hash,
              type: 'room',
              name: roomData.room.name,
              description: roomData.room.description,
              parentId: deptData.hash,
              children: [],
              data: roomData.room
            };
            
            // Load devices for this room
            if (roomData.room.devices && Array.isArray(roomData.room.devices)) {
              // Get ESP32 devices to match against
              const esp32Manager = ESP32ConnectionManager.getInstance();
              const connectedDevices = esp32Manager ? esp32Manager.getDevices() : [];

              for (const deviceIdOrHash of roomData.room.devices) {
                // First check if it's a device ID (string) from ESP32
                const esp32Device = connectedDevices.find(d => d.id === deviceIdOrHash);
                if (esp32Device) {
                  const deviceItem: HierarchicalItem = {
                    id: deviceIdOrHash,
                    type: 'device',
                    name: esp32Device.name || esp32Device.id,
                    description: `${esp32Device.type} - ${esp32Device.address || 'No address'}${esp32Device.isAuthenticated ? ' (Connected)' : ' (Not connected)'}`,
                    parentId: roomData.hash,
                    data: {
                      $type$: 'Device',
                      deviceId: esp32Device.id,
                      deviceType: esp32Device.type,
                      address: esp32Device.address
                    } as Device
                  };
                  roomItem.children!.push(deviceItem);
                } else {
                  // Try to load as a Device object hash (for future compatibility)
                  try {
                    const device = await getObject<Device>(deviceIdOrHash as unknown as SHA256Hash<Device>);
                    if (device && device.$type$ === 'Device') {
                      const deviceItem: HierarchicalItem = {
                        id: deviceIdOrHash as unknown as SHA256Hash,
                        type: 'device',
                        name: device.deviceId || 'Unknown Device',
                        description: `${device.deviceType || 'Unknown'} - ${device.address || 'No address'}`,
                        parentId: roomData.hash,
                        data: device
                      };
                      roomItem.children!.push(deviceItem);
                    }
                  } catch (error) {
                    // Not a hash, probably just a device ID we don't have info for
                    console.warn('[HierarchicalDeviceList] Device not found in ESP32 manager:', deviceIdOrHash);
                  }
                }
              }
            }
            
            deptItem.children!.push(roomItem);
          }
          
          orgItem.children!.push(deptItem);
        }
        
        hierarchicalItems.push(orgItem);
      }
      
      // Sort by creation date (newest first)
      hierarchicalItems.sort((a, b) => {
        const aCreated = (a.data as Organisation)?.created || 0;
        const bCreated = (b.data as Organisation)?.created || 0;
        return bCreated - aCreated;
      });

      // Get all connected ESP32 devices
      const esp32Manager = ESP32ConnectionManager.getInstance();
      const connectedDevices = esp32Manager ? esp32Manager.getDevices() : [];

      // Find which devices are already assigned to rooms
      const assignedDeviceIds = new Set<string>();

      // Collect device IDs directly from room objects
      for (const roomData of rooms) {
        if (roomData.room.devices && Array.isArray(roomData.room.devices)) {
          for (const deviceId of roomData.room.devices) {
            // Device IDs are stored as strings in the room
            if (typeof deviceId === 'string') {
              assignedDeviceIds.add(deviceId);
            }
          }
        }
      }

      // Filter out unassigned devices
      const unassignedList: HierarchicalItem[] = connectedDevices
        .filter(device => !assignedDeviceIds.has(device.id))
        .map(device => ({
          id: device.id,
          type: 'device' as const,
          name: device.name || device.id,
          description: `${device.type} - ${device.address || 'No address'}${device.isAuthenticated ? ' (Connected)' : ' (Not connected)'}`,
          data: {
            $type$: 'Device',
            deviceId: device.id,
            deviceType: device.type,
            address: device.address
          } as Device
        }));

      console.log('[HierarchicalDeviceList] Loaded hierarchy:', hierarchicalItems.length);
      console.log('[HierarchicalDeviceList] Unassigned devices:', unassignedList.length);
      setItems(hierarchicalItems);
      setUnassignedDevices(unassignedList);
    } catch (error) {
      console.error('[HierarchicalDeviceList] Error loading hierarchy:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [models]);

  // Load hierarchy when the model is ready
  useEffect(() => {
    if (modelReady) {
      console.log('[HierarchicalDeviceList] OrganisationModel is ready, loading hierarchy...');
      setIsLoading(true);
      loadHierarchy();
    } else if (!models?.appModel?.organisationModel) {
      console.log('[HierarchicalDeviceList] Waiting for OrganisationModel to be created...');
      setIsLoading(false); // Don't show loading if model doesn't exist
    } else {
      console.log('[HierarchicalDeviceList] Waiting for OrganisationModel to initialize...');
    }
  }, [modelReady]); // Remove loadHierarchy and models from dependencies to avoid infinite loop

  // Auto-expand organizations when items are loaded
  useEffect(() => {
    if (items.length > 0) {
      const orgIds = items.map(item => item.id);
      setExpandedItems(prev => {
        const newSet = new Set(prev);
        orgIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [items]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (modelReady) {
        loadHierarchy();
      }
    }, [modelReady]) // Remove loadHierarchy from dependencies
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHierarchy();
  }, [loadHierarchy]);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleAddItem = useCallback((parentItem?: HierarchicalItem) => {
    if (!parentItem) {
      // Add organisation
      router.push('/(screens)/devices/create-organisation');
    } else if (parentItem.type === 'organisation') {
      // Add department
      router.push({
        pathname: '/(screens)/devices/create-department',
        params: {
          organisationHash: parentItem.id
        }
      });
    } else if (parentItem.type === 'department') {
      // Add room
      router.push({
        pathname: '/(screens)/devices/create-room',
        params: {
          departmentHash: parentItem.id,
          departmentName: parentItem.name,
          organisationHash: parentItem.parentId
        }
      });
    } else if (parentItem.type === 'room') {
      // Add device
      router.push({
        pathname: '/(screens)/devices/add-device',
        params: {
          roomHash: parentItem.id,
          roomName: parentItem.name,
          departmentHash: parentItem.parentId
        }
      });
    }
  }, [router]);

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'organisation': return 'office-building';
      case 'department': return 'briefcase';
      case 'room': return 'door';
      case 'device': return 'devices';
      default: return 'folder';
    }
  };

  const getItemColor = (type: string) => {
    switch (type) {
      case 'organisation': return theme.colors.primary;
      case 'department': return theme.colors.secondary;
      case 'room': return theme.colors.tertiary;
      case 'device': return theme.colors.onSurfaceVariant;
      default: return theme.colors.onSurface;
    }
  };

  const renderItem = (item: HierarchicalItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const canExpand = item.type !== 'device'; // Organizations, departments, and rooms can expand
    const canAddChildren = item.type !== 'device';

    return (
      <View key={item.id} style={[styles.itemContainer, { marginLeft: level * 20 }]}>
        <Surface style={[styles.itemSurface, { elevation: level === 0 ? 2 : 1 }]}>
          <List.Item
            title={item.name}
            description={item.description}
            onPress={() => canExpand && toggleExpanded(item.id)}
            style={styles.listItem}
            left={(props) => (
              <View style={styles.leftContainer}>
                {canExpand && (
                  <IconButton
                    {...props}
                    icon={isExpanded ? 'chevron-down' : 'chevron-right'}
                    size={20}
                    onPress={() => toggleExpanded(item.id)}
                  />
                )}
                <List.Icon 
                  {...props} 
                  icon={getItemIcon(item.type)} 
                  color={getItemColor(item.type)}
                  style={!canExpand ? { marginLeft: 28 } : undefined}
                />
              </View>
            )}
            right={(props) => (
              <View style={styles.rightContainer}>
                {hasChildren && (
                  <Chip
                    {...props}
                    mode="outlined"
                    compact
                    style={styles.countChip}
                  >
                    {item.children!.length}
                  </Chip>
                )}
                {canAddChildren && (
                  <IconButton
                    {...props}
                    icon="plus"
                    size={20}
                    mode="contained"
                    containerColor={theme.colors.primaryContainer}
                    iconColor={theme.colors.onPrimaryContainer}
                    onPress={() => handleAddItem(item)}
                    style={styles.addButton}
                  />
                )}
              </View>
            )}
          />
        </Surface>
        
        {isExpanded && canExpand && (
          <View style={styles.childrenContainer}>
            {hasChildren ? (
              item.children!.map(child => renderItem(child, level + 1))
            ) : (
              <View style={[styles.emptyChildrenContainer, { marginLeft: (level + 1) * 20 }]}>
                <Text style={styles.emptyChildrenText}>
                  {item.type === 'organisation' ? 'No departments yet' : 
                   item.type === 'department' ? 'No rooms yet' : 
                   'No devices yet'}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Show loading state while model is initializing or data is loading
  if (!modelReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading device hierarchy...</Text>
        <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8 }]}>
          {!modelReady 
            ? 'Initializing organization system...'
            : 'Loading organizations...'}
        </Text>
      </View>
    );
  }
  
  // Show empty state if no model available
  if (!models?.appModel?.organisationModel) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Organization system not available</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No organisations yet</Text>
          <Text style={styles.emptySubtext}>
            Start by creating an organisation to manage your devices
          </Text>
          <IconButton
            icon="plus"
            mode="contained"
            size={24}
            containerColor={theme.colors.primary}
            iconColor={theme.colors.onPrimary}
            onPress={() => handleAddItem()}
            style={styles.emptyAddButton}
          />
          {/* Debug: Add test data button */}
          <IconButton
            icon="test-tube"
            mode="contained"
            size={24}
            containerColor={theme.colors.secondary}
            iconColor={theme.colors.onSecondary}
            onPress={async () => {
              if (models?.appModel?.organisationModel) {
                console.log('[HierarchicalDeviceList] Creating test organisation...');
                try {
                  const orgHash = await models.appModel.organisationModel.createOrganisation(
                    'Test Organisation',
                    'A test organisation for debugging'
                  );
                  console.log('[HierarchicalDeviceList] Created test org:', orgHash);
                  
                  // Reload the hierarchy
                  await loadHierarchy();
                } catch (error) {
                  console.error('[HierarchicalDeviceList] Error creating test org:', error);
                }
              }
            }}
            style={[styles.emptyAddButton, { marginTop: 16 }]}
          />
        </View>
      ) : (
        <>
          {items.map(item => renderItem(item))}

          {/* Unassigned Devices Section */}
          {unassignedDevices.length > 0 && (
            <View style={styles.unassignedSection}>
              <Surface style={styles.unassignedHeader}>
                <View style={styles.unassignedHeaderContent}>
                  <List.Icon icon="devices" color={theme.colors.error} />
                  <View style={styles.unassignedHeaderText}>
                    <Text style={styles.unassignedTitle}>Unassigned Devices</Text>
                    <Text style={styles.unassignedSubtitle}>
                      {unassignedDevices.length} device{unassignedDevices.length !== 1 ? 's' : ''} not assigned to any room
                    </Text>
                  </View>
                </View>
              </Surface>

              {unassignedDevices.map(device => (
                <View key={device.id} style={styles.unassignedDeviceItem}>
                  <Surface style={styles.itemSurface}>
                    <List.Item
                      title={device.name}
                      description={device.description}
                      onPress={() => {
                        // Navigate to room assignment screen
                        router.push({
                          pathname: '/(screens)/devices/room-assignment',
                          params: {
                            deviceId: device.id,
                            deviceName: device.name,
                            deviceType: (device.data as Device).deviceType || 'Unknown'
                          }
                        });
                      }}
                      left={(props) => (
                        <List.Icon
                          {...props}
                          icon="devices"
                          color={theme.colors.onSurfaceVariant}
                          style={{ marginLeft: 28 }}
                        />
                      )}
                      right={(props) => (
                        <IconButton
                          {...props}
                          icon="arrow-right"
                          size={20}
                          onPress={() => {
                            router.push({
                              pathname: '/(screens)/devices/room-assignment',
                              params: {
                                deviceId: device.id,
                                deviceName: device.name,
                                deviceType: (device.data as Device).deviceType || 'Unknown'
                              }
                            });
                          }}
                        />
                      )}
                    />
                  </Surface>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  itemContainer: {
    marginBottom: 8,
  },
  itemSurface: {
    borderRadius: 8,
  },
  listItem: {
    paddingVertical: 8,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countChip: {
    marginRight: 4,
  },
  addButton: {
    margin: 0,
  },
  childrenContainer: {
    marginTop: 4,
  },
  emptyChildrenContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  emptyChildrenText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 64,
  },
  emptyText: {
    fontSize: 18,
    opacity: 0.7,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyAddButton: {
    marginTop: 8,
  },
  unassignedSection: {
    marginTop: 24,
  },
  unassignedHeader: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
  },
  unassignedHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unassignedHeaderText: {
    flex: 1,
    marginLeft: 8,
  },
  unassignedTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  unassignedSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  unassignedDeviceItem: {
    marginBottom: 8,
    marginLeft: 20,
  },
});