import React, {useCallback, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {esp32WiFiProvisioningService} from '@src/services/ESP32WiFiProvisioningService';

type SetupState = 'editing' | 'sending' | 'sent';

export default function ESP32WiFiSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {deviceId, deviceName} = useLocalSearchParams<{
    deviceId?: string;
    deviceName?: string;
  }>();
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [state, setState] = useState<SetupState>('editing');
  const [error, setError] = useState<string | null>(null);

  const displayName = deviceName?.trim() || 'ESP32';
  const canSubmit = Boolean(deviceId && ssid.length > 0) && state !== 'sending';

  const handleSubmit = useCallback(async () => {
    if (!deviceId || ssid.length === 0) return;

    setError(null);
    setState('sending');
    try {
      await esp32WiFiProvisioningService.provision(deviceId, ssid, password);
      setPassword('');
      setState('sent');
    } catch (provisioningError) {
      setError(
        provisioningError instanceof Error
          ? provisioningError.message
          : String(provisioningError),
      );
      setState('editing');
    }
  }, [deviceId, password, ssid]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, {backgroundColor: theme.colors.background}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: Math.max(insets.bottom, 24)},
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heading}>
          <Text variant="headlineSmall">Connect {displayName} to WiFi</Text>
          <Text
            variant="bodyMedium"
            style={{color: theme.colors.onSurfaceVariant}}
          >
            Enter the network credentials to send directly to this nearby device over Bluetooth.
          </Text>
        </View>

        <Card mode="outlined">
          <Card.Content style={styles.form}>
            {state === 'sent' ? (
              <>
                <Text variant="titleMedium" style={{color: theme.colors.primary}}>
                  Credentials sent
                </Text>
                <Text style={{color: theme.colors.onSurfaceVariant}}>
                  {displayName} is connecting. It will appear through local discovery when WiFi is ready.
                </Text>
                <Button mode="contained" onPress={() => router.back()}>
                  Back to devices
                </Button>
              </>
            ) : (
              <>
                <TextInput
                  mode="outlined"
                  label="Network name (SSID)"
                  value={ssid}
                  onChangeText={value => {
                    setSsid(value);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="next"
                  disabled={state === 'sending'}
                  error={Boolean(error)}
                />

                <TextInput
                  mode="outlined"
                  label="Password"
                  value={password}
                  onChangeText={value => {
                    setPassword(value);
                    setError(null);
                  }}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  textContentType="none"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (canSubmit) void handleSubmit();
                  }}
                  disabled={state === 'sending'}
                  error={Boolean(error)}
                  right={
                    <TextInput.Icon
                      icon={passwordVisible ? 'eye-off' : 'eye'}
                      onPress={() => setPasswordVisible(visible => !visible)}
                      forceTextInputFocus={false}
                      accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                    />
                  }
                />

                <HelperText type="info" visible={!error} padding="none">
                  The password is sent exactly as entered, including punctuation.
                </HelperText>
                {error && (
                  <HelperText type="error" visible padding="none">
                    {error}
                  </HelperText>
                )}

                <View style={styles.actions}>
                  <Button
                    mode="outlined"
                    onPress={() => router.back()}
                    disabled={state === 'sending'}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => void handleSubmit()}
                    disabled={!canSubmit}
                    loading={state === 'sending'}
                  >
                    Connect
                  </Button>
                </View>
              </>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: 20,
    padding: 20,
  },
  heading: {
    gap: 8,
  },
  form: {
    gap: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
