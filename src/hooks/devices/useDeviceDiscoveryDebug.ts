/**
 * Debug hook for device discovery
 * 
 * Shows what's happening with discovery messages
 */

import { useEffect } from 'react';
import { useAppModel } from '@src/hooks/useAppModel';

export function useDeviceDiscoveryDebug() {
  const { appModel } = useAppModel();

  useEffect(() => {
    if (!appModel) return;

    const transport = appModel.transportManager?.getTransport();
    if (!transport) return;
    
    // Listen to raw UDP messages
    const handleMessage = (data: ArrayBuffer, remoteInfo: any) => {
      const bytes = new Uint8Array(data);
      const serviceType = bytes[0];
      
      // Convert to string starting from byte 1
      const messageData = new TextDecoder().decode(bytes.slice(1));
      
      console.log('[DiscoveryDebug] Raw message received:', {
        from: `${remoteInfo.address}:${remoteInfo.port}`,
        serviceType,
        size: data.byteLength,
        firstBytes: Array.from(bytes.slice(0, 10)),
        messagePreview: messageData.substring(0, 100)
      });
      
      // Log non-self messages more prominently
      if (remoteInfo.address !== '192.168.178.102') {
        console.log('[DiscoveryDebug] 🚨 MESSAGE FROM DIFFERENT DEVICE:', remoteInfo.address);
      }
      
      // Check if it's HTML
      if (messageData.includes('<!DOCTYPE html>')) {
        console.log('[DiscoveryDebug] HTML discovery message detected!');
        console.log('[DiscoveryDebug] Full HTML:', messageData);
      }
    };
    
    // Add raw listener
    transport.onMessage?.listen?.(handleMessage);
    
    return () => {
      transport.onMessage?.unlisten?.(handleMessage);
    };
  }, [appModel]);
}