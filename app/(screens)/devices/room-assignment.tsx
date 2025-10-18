import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import {
  Text,
  List,
  RadioButton,
  Button,
  Card,
  ActivityIndicator
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@src/providers/app/AppTheme';
import { useAppModel } from '@src/hooks/useAppModel';
import { useModelState } from '@src/hooks/useModelState';
import type { Organisation, Department, Room } from '@OneObjectInterfaces';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

interface RoomWithPath {
  hash: SHA256Hash;
  room: Room;
  department: Department;
  organisation: Organisation;
  path: string;
}

export default function RoomAssignmentScreen() {
  const router = useRouter();
  const { deviceId, deviceName, deviceType } = useLocalSearchParams<{
    deviceId: string;
    deviceName: string;
    deviceType: string;
  }>();

  const { theme, styles: themedStyles } = useTheme();
  const { appModel } = useAppModel();
  const organisationModel = appModel?.organisationModel;

  // Use useModelState to wait for OrganisationModel to be ready
  const { isReady: isOrgModelReady, isLoading: isOrgModelLoading } = useModelState(
    organisationModel,
    'OrganisationModel'
  );

  const [selectedRoom, setSelectedRoom] = useState<SHA256Hash | null>(null);
  const [availableRooms, setAvailableRooms] = useState<RoomWithPath[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load available rooms only when model is ready
  useEffect(() => {
    const loadRooms = async () => {
      if (!isOrgModelReady || !organisationModel) {
        setIsLoadingRooms(false);
        return;
      }
      
      try {
        setIsLoadingRooms(true);

        // Get all rooms from the model
        const rooms = await organisationModel.getAllRooms();
        console.log('[RoomAssignment] Loaded', rooms.length, 'rooms from model');

        // Simply show all rooms with their names
        const simpleRooms = rooms.map(r => ({
          hash: r.hash,
          room: r.room,
          department: null as any,
          organisation: null as any,
          path: r.room.name
        }));

        // Sort by room name
        simpleRooms.sort((a, b) => a.room.name.localeCompare(b.room.name));

        setAvailableRooms(simpleRooms);
      } catch (error) {
        console.error('[RoomAssignment] Error loading rooms:', error);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    loadRooms();
  }, [isOrgModelReady, organisationModel]);
  
  const handleAssign = useCallback(async () => {
    if (!selectedRoom || !organisationModel) return;
    
    setIsSaving(true);
    
    try {
      await organisationModel.addDeviceToRoom(selectedRoom, deviceId);
      
      Alert.alert(
        'Success',
        `${deviceName} has been assigned to the selected room.`,
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      console.error('[RoomAssignment] Error assigning device:', error);
      Alert.alert(
        'Error',
        'Failed to assign device to room. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [selectedRoom, organisationModel, deviceId, deviceName, router]);
  
  
  
  // Combined loading state: wait for model AND room data
  const isLoading = isOrgModelLoading || isLoadingRooms;

  return (
    <View style={themedStyles?.container || { flex: 1, backgroundColor: theme?.colors?.background || '#fff' }}>
      {!isOrgModelReady || !organisationModel ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16 }}>Loading organisation management...</Text>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16 }}>Loading rooms...</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <Card style={{ margin: 16 }}>
            <Card.Content>
              <Text variant="titleMedium">Device Information</Text>
              <Text variant="bodyMedium" style={{ marginTop: 8 }}>
                Name: {deviceName || 'Unknown'}
              </Text>
              <Text variant="bodyMedium">
                Type: {deviceType || 'Unknown'}
              </Text>
              <Text variant="bodySmall" style={{ marginTop: 4, color: theme?.colors?.onSurfaceVariant }}>
                ID: {deviceId || 'Unknown'}
              </Text>
            </Card.Content>
          </Card>
          
          {availableRooms.length === 0 ? (
          <Card style={{ margin: 16 }}>
            <Card.Content>
              <Text variant="titleMedium">No Rooms Available</Text>
              <Text variant="bodyMedium" style={{ marginTop: 8 }}>
                Please create an organisation structure first before assigning devices to rooms.
              </Text>
              <Button
                mode="contained"
                onPress={() => {
                  router.push('/(screens)/devices/create-organisation');
                }}
                style={{ marginTop: 12 }}
              >
                Create Organisation
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Text variant="titleMedium" style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
              Select a Room
            </Text>
            
            <RadioButton.Group
              onValueChange={value => setSelectedRoom(value as SHA256Hash)}
              value={selectedRoom || ''}
            >
              <List.Section>
                {availableRooms.map(room => (
                  <List.Item
                    key={room.hash}
                    title={room.room.name}
                    description={room.room.description || 'No description'}
                    onPress={() => setSelectedRoom(room.hash)}
                    left={() => (
                      <RadioButton
                        value={room.hash}
                        status={selectedRoom === room.hash ? 'checked' : 'unchecked'}
                      />
                    )}
                    right={props => <List.Icon {...props} icon="home" />}
                  />
                ))}
              </List.Section>
            </RadioButton.Group>
          </>
        )}
        </ScrollView>
      )}
      
      <View style={{ padding: 16, gap: 8 }}>
        <Button
          mode="contained"
          onPress={handleAssign}
          disabled={!selectedRoom || isSaving}
          loading={isSaving}
        >
          Assign to Selected Room
        </Button>
        
        
        <Button
          mode="text"
          onPress={() => router.back()}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </View>
      
    </View>
  );
}