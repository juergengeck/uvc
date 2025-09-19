import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { 
  Text, 
  Appbar, 
  List, 
  RadioButton, 
  Button, 
  Card,
  ActivityIndicator,
  Divider,
  Portal,
  Dialog,
  TextInput
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@src/providers/app/AppTheme';
import { useAppModel } from '@src/hooks/useAppModel';
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
  const { appModel } = useAppModel();  // Destructure properly!
  const organisationModel = appModel?.organisationModel;
  
  const [selectedRoom, setSelectedRoom] = useState<SHA256Hash | null>(null);
  const [availableRooms, setAvailableRooms] = useState<RoomWithPath[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Load available rooms
  useEffect(() => {
    const loadRooms = async () => {
      if (!organisationModel) {
        console.error('[RoomAssignment] OrganisationModel not available - this should not happen!');
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
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
        setIsLoading(false);
      }
    };
    
    loadRooms();
  }, [organisationModel]);
  
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
  
  
  
  return (
    <View style={themedStyles?.container || { flex: 1, backgroundColor: theme?.colors?.background || '#fff' }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Assign to Room" />
      </Appbar.Header>
      
      {!organisationModel ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text variant="headlineSmall" style={{ color: theme?.colors?.error, marginBottom: 8 }}>System Error</Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center' }}>Organisation management is not available. Please restart the app.</Text>
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
              <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors?.onSurfaceVariant }}>
                Model exists: {organisationModel ? 'Yes' : 'No'}
              </Text>
              <Button 
                mode="outlined" 
                onPress={() => {
                  console.log('[RoomAssignment] Manual refresh triggered');
                  setAvailableRooms([]); // Clear first
                  // Trigger reload by toggling a state
                  const loadRooms = async () => {
                    if (!organisationModel) {
                      console.log('[RoomAssignment] No model for manual refresh');
                      return;
                    }
                    try {
                      console.log('[RoomAssignment] Manual refresh: calling getAllRooms');
                      const rooms = await organisationModel.getAllRooms();
                      console.log('[RoomAssignment] Manual refresh: got', rooms.length, 'rooms');
                      const simpleRooms = rooms.map(r => ({
                        hash: r.hash,
                        room: r.room,
                        department: null as any,
                        organisation: null as any,
                        path: r.room.name
                      }));
                      simpleRooms.sort((a, b) => a.room.name.localeCompare(b.room.name));
                      setAvailableRooms(simpleRooms);
                    } catch (error) {
                      console.error('[RoomAssignment] Manual refresh error:', error);
                    }
                  };
                  loadRooms();
                }}
                style={{ marginTop: 12 }}
              >
                Refresh Rooms
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