/**
 * InstanceList Component
 * 
 * Mobile version of one.leute's InstancesSettingsView component.
 * Uses react-native-paper components instead of MUI.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Instance } from '@refinio/one.core/lib/recipes.js';
import { useInstancesList } from '../../hooks/settings/instanceHooks';

interface InstanceListItemType {
  mainProfile: ProfileModel;
  instanceId?: SHA256IdHash<Instance>;
}

interface InstanceListProps {
  leuteModel: LeuteModel;
}

export function InstanceList({ leuteModel }: InstanceListProps) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const [myInstances, otherInstances] = useInstancesList(leuteModel);

  const handleInstancePress = React.useCallback((instance: InstanceListItemType) => {
    router.push(`/(screens)/settings/${instance.mainProfile.personId}`);
  }, [router]);

  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        {t('settings.instances')}
      </Text>
      
      <List.Section>
        {myInstances.map((instance: InstanceListItemType, index: number) => (
          <List.Item
            key={index}
            title={leuteModel.getPersonName(instance.mainProfile.personId)}
            left={props => <List.Icon {...props} icon="account" />}
            onPress={() => handleInstancePress(instance)}
          />
        ))}
      </List.Section>

      <Text variant="titleMedium" style={styles.title}>
        {t('settings.others')}
      </Text>
      
      <List.Section>
        {otherInstances.map((instance: InstanceListItemType, index: number) => (
          <List.Item
            key={index}
            title={leuteModel.getPersonName(instance.mainProfile.personId)}
            left={props => <List.Icon {...props} icon="account" />}
            onPress={() => handleInstancePress(instance)}
          />
        ))}
      </List.Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    padding: 16,
  },
}); 