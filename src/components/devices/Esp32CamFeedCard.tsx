import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, HelperText, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import type { DeviceSettings } from '@src/recipes/device';
import { ModelService } from '@src/services/ModelService';
import {
  appendCacheBust,
  buildDefaultEsp32CamEndpoints,
  isEsp32CamCandidate,
  mergeEsp32CamCustomFields,
  resolveEsp32CamEndpoints,
  type Esp32CamEndpoints,
} from '@src/utils/esp32Cam';

interface Esp32CamFeedCardProps {
  address: string;
  capabilities?: string[];
  cardTitle?: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

type FeedMode = 'live' | 'snapshot';

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const createStreamHtml = (streamUrl: string, deviceName: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #000;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }
    </style>
  </head>
  <body>
    <img src="${escapeHtmlAttribute(streamUrl)}" alt="${escapeHtmlAttribute(deviceName)} live feed" />
  </body>
</html>`;

export function Esp32CamFeedCard({
  address,
  capabilities = [],
  cardTitle,
  deviceId,
  deviceName,
  deviceType,
}: Esp32CamFeedCardProps) {
  const theme = useTheme();
  const [draftEndpoints, setDraftEndpoints] = useState<Esp32CamEndpoints>(() => buildDefaultEsp32CamEndpoints(address));
  const [savedEndpoints, setSavedEndpoints] = useState<Esp32CamEndpoints>(() => buildDefaultEsp32CamEndpoints(address));
  const [feedMode, setFeedMode] = useState<FeedMode>('live');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(Date.now());
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(true);

  const canShowFeed = isEsp32CamCandidate(deviceType, address, capabilities);
  const defaultEndpoints = useMemo(() => buildDefaultEsp32CamEndpoints(address), [address]);

  const normalizedDraftEndpoints = useMemo(
    () => ({
      controlUrl: draftEndpoints.controlUrl.trim(),
      snapshotUrl: draftEndpoints.snapshotUrl.trim(),
      streamUrl: draftEndpoints.streamUrl.trim(),
    }),
    [draftEndpoints]
  );

  const hasUnsavedChanges = useMemo(
    () =>
      normalizedDraftEndpoints.controlUrl !== savedEndpoints.controlUrl ||
      normalizedDraftEndpoints.snapshotUrl !== savedEndpoints.snapshotUrl ||
      normalizedDraftEndpoints.streamUrl !== savedEndpoints.streamUrl,
    [normalizedDraftEndpoints, savedEndpoints]
  );

  const streamHtml = useMemo(
    () => createStreamHtml(appendCacheBust(savedEndpoints.streamUrl, refreshToken), deviceName),
    [deviceName, refreshToken, savedEndpoints.streamUrl]
  );

  const snapshotUri = useMemo(
    () => appendCacheBust(savedEndpoints.snapshotUrl, refreshToken),
    [refreshToken, savedEndpoints.snapshotUrl]
  );

  const resetViewerState = useCallback(() => {
    setViewerError(null);
    setViewerLoading(true);
  }, []);

  const loadCameraConfiguration = useCallback(async () => {
    setIsLoadingConfig(true);
    setLoadError(null);

    try {
      const deviceModel = ModelService.getDeviceModel();
      const deviceSettings = deviceModel ? await deviceModel.getDeviceSettings(deviceId) : null;
      const resolvedEndpoints = resolveEsp32CamEndpoints(address, deviceSettings?.customFields);

      setDraftEndpoints(resolvedEndpoints);
      setSavedEndpoints(resolvedEndpoints);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load camera endpoints';
      setLoadError(message);
      setDraftEndpoints(defaultEndpoints);
      setSavedEndpoints(defaultEndpoints);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [address, defaultEndpoints, deviceId]);

  useEffect(() => {
    if (!canShowFeed) {
      setIsLoadingConfig(false);
      return;
    }

    loadCameraConfiguration();
  }, [canShowFeed, loadCameraConfiguration]);

  useEffect(() => {
    resetViewerState();
  }, [feedMode, refreshToken, resetViewerState, savedEndpoints.snapshotUrl, savedEndpoints.streamUrl]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setLoadError(null);

    try {
      const deviceModel = ModelService.getDeviceModel();
      if (!deviceModel) {
        throw new Error('Device model is not ready yet');
      }

      const existingSettings = await deviceModel.getDeviceSettings(deviceId);
      const mergedCustomFields = mergeEsp32CamCustomFields(existingSettings?.customFields, normalizedDraftEndpoints);
      const nextSettings: Partial<Omit<DeviceSettings, '$type$' | 'deviceId' | 'forDevice' | 'lastModified' | 'modifiedBy'>> = {
        customFields: mergedCustomFields,
      };

      await deviceModel.updateDeviceSettings(deviceId, nextSettings);
      setSavedEndpoints(normalizedDraftEndpoints);
      setRefreshToken(Date.now());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not save camera endpoints');
    } finally {
      setIsSaving(false);
    }
  }, [deviceId, normalizedDraftEndpoints]);

  const handleResetDraft = useCallback(() => {
    setDraftEndpoints(defaultEndpoints);
  }, [defaultEndpoints]);

  const handleReload = useCallback(() => {
    setRefreshToken(Date.now());
  }, []);

  const handleOpenControlPage = useCallback(async () => {
    try {
      await Linking.openURL(savedEndpoints.controlUrl);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not open the camera control page');
    }
  }, [savedEndpoints.controlUrl]);

  if (!canShowFeed) {
    return null;
  }

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text selectable variant="titleMedium">
              {cardTitle || deviceName}
            </Text>
            <Text selectable style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              {address}
            </Text>
          </View>
          <Button mode="text" onPress={handleOpenControlPage} icon="open-in-new">
            Control
          </Button>
        </View>

        <View style={styles.chipRow}>
          <Text style={[styles.chip, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant }]}>
            ESP32-CAM
          </Text>
          <Text style={[styles.chip, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant }]}>
            {feedMode === 'live' ? 'Live' : 'Snapshot'}
          </Text>
        </View>

        {isLoadingConfig ? (
          <View style={styles.loadingState}>
            <ActivityIndicator animating size="small" />
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading camera endpoints...</Text>
          </View>
        ) : (
          <>
            <View style={styles.viewerToolbar}>
              <SegmentedButtons
                value={feedMode}
                onValueChange={value => setFeedMode(value as FeedMode)}
                buttons={[
                  { value: 'live', label: 'Live' },
                  { value: 'snapshot', label: 'Snapshot' },
                ]}
                style={styles.segmentedButtons}
              />
              <Button mode="text" onPress={handleReload} icon="refresh">
                Reload
              </Button>
            </View>

            <View style={[styles.viewerFrame, { borderColor: theme.colors.outlineVariant || theme.colors.outline }]}>
              {feedMode === 'live' ? (
                <WebView
                  key={`${savedEndpoints.streamUrl}:${refreshToken}`}
                  originWhitelist={['*']}
                  mixedContentMode="always"
                  source={{ html: streamHtml }}
                  style={styles.webView}
                  onLoadStart={() => setViewerLoading(true)}
                  onLoadEnd={() => setViewerLoading(false)}
                  onError={() => {
                    setViewerLoading(false);
                    setViewerError('The live stream could not be loaded with the current endpoint.');
                  }}
                />
              ) : (
                <Image
                  key={snapshotUri}
                  source={{ uri: snapshotUri }}
                  style={styles.snapshotImage}
                  resizeMode="contain"
                  onLoadStart={() => setViewerLoading(true)}
                  onLoadEnd={() => setViewerLoading(false)}
                  onError={() => {
                    setViewerLoading(false);
                    setViewerError('The snapshot could not be loaded with the current endpoint.');
                  }}
                />
              )}

              {viewerLoading ? (
                <View style={styles.viewerOverlay}>
                  <ActivityIndicator animating color="#ffffff" />
                </View>
              ) : null}
            </View>

            <HelperText type={viewerError ? 'error' : 'info'} visible style={styles.helperText}>
              {viewerError || 'Defaults assume the common ESP32-CAM endpoints `/capture` and `:81/stream`.'}
            </HelperText>

            <Text selectable style={[styles.endpointLabel, { color: theme.colors.onSurfaceVariant }]}>
              Live stream
            </Text>
            <TextInput
              value={draftEndpoints.streamUrl}
              onChangeText={value => setDraftEndpoints(current => ({ ...current, streamUrl: value }))}
              autoCapitalize="none"
              autoCorrect={false}
              mode="outlined"
            />

            <Text selectable style={[styles.endpointLabel, { color: theme.colors.onSurfaceVariant }]}>
              Snapshot
            </Text>
            <TextInput
              value={draftEndpoints.snapshotUrl}
              onChangeText={value => setDraftEndpoints(current => ({ ...current, snapshotUrl: value }))}
              autoCapitalize="none"
              autoCorrect={false}
              mode="outlined"
            />

            <View style={styles.actionsRow}>
              <Button mode="outlined" onPress={handleResetDraft} disabled={isSaving}>
                Defaults
              </Button>
              <Button mode="contained" onPress={handleSave} disabled={!hasUnsavedChanges || isSaving} loading={isSaving}>
                Save endpoints
              </Button>
            </View>

            {loadError ? (
              <HelperText type="error" visible>
                {loadError}
              </HelperText>
            ) : null}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  card: {
    marginTop: 12,
  },
  chip: {
    borderRadius: 999,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  content: {
    gap: 12,
  },
  endpointLabel: {
    fontSize: 13,
    marginBottom: -4,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  helperText: {
    marginTop: -4,
  },
  loadingState: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 120,
  },
  segmentedButtons: {
    flex: 1,
  },
  snapshotImage: {
    backgroundColor: '#000000',
    flex: 1,
    width: '100%',
  },
  viewerFrame: {
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    height: 240,
    overflow: 'hidden',
    position: 'relative',
  },
  viewerOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  viewerToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  webView: {
    backgroundColor: '#000000',
    flex: 1,
  },
});
