import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import {
  Text,
  List,
  IconButton,
  Divider,
  ActivityIndicator,
  useTheme,
  Card,
  Chip,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { getOrganisationHashes } from '@src/utils/organisationRegistry';
import type { Organisation, Department } from '@OneObjectInterfaces';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

interface OrganisationWithHash extends Organisation {
  hash: SHA256Hash;
  departmentCount?: number;
}

export const OrganisationList: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { instance, models } = useInstance();
  const [organisations, setOrganisations] = useState<OrganisationWithHash[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrganisations = useCallback(async () => {
    if (!instance) {
      console.error('[OrganisationList] Instance not available');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[OrganisationList] Loading organisations...');
      
      // Get all organisations from registry
      const orgHashes = await getOrganisationHashes();
      console.log('[OrganisationList] Found organisation hashes:', orgHashes.length);
      
      const orgs: OrganisationWithHash[] = [];
      
      for (const hash of orgHashes) {
        try {
          const org = await getObject<Organisation>(hash);
          if (org && org.$type$ === 'Organisation') {
            // Count departments if they exist
            let departmentCount = 0;
            if (org.departments && Array.isArray(org.departments)) {
              departmentCount = org.departments.length;
            }
            
            orgs.push({
              ...org,
              hash,
              departmentCount
            });
          }
        } catch (error) {
          console.warn('[OrganisationList] Error loading organisation:', hash, error);
        }
      }
      
      // Sort by creation date (newest first)
      orgs.sort((a, b) => (b.created || 0) - (a.created || 0));
      
      console.log('[OrganisationList] Loaded organisations:', orgs.length);
      setOrganisations(orgs);
    } catch (error) {
      console.error('[OrganisationList] Error loading organisations:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [instance]);

  useEffect(() => {
    if (instance) {
      loadOrganisations();
    }
  }, [loadOrganisations, instance]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrganisations();
  }, [loadOrganisations]);

  const handleCreateDepartment = useCallback((organisationHash: SHA256Hash, organisationName: string) => {
    // Navigate to create department screen with organisation context
    router.push({
      pathname: '/(screens)/devices/create-department',
      params: {
        organisationHash: organisationHash,
        organisationName: organisationName
      }
    });
  }, [router]);

  const handleOrganisationPress = useCallback((org: OrganisationWithHash) => {
    // Could navigate to organisation details in the future
    console.log('[OrganisationList] Organisation pressed:', org.name);
  }, []);

  const renderOrganisation = ({ item }: { item: OrganisationWithHash }) => (
    <Card style={styles.card}>
      <List.Item
        title={item.name}
        description={item.description || 'No description'}
        onPress={() => handleOrganisationPress(item)}
        style={styles.listItem}
        left={(props) => (
          <List.Icon {...props} icon="office-building" color={theme.colors.primary} />
        )}
        right={(props) => (
          <View style={styles.rightContainer}>
            {item.departmentCount !== undefined && item.departmentCount > 0 && (
              <Chip
                {...props}
                mode="outlined"
                compact
                style={styles.departmentChip}
              >
                {item.departmentCount} {item.departmentCount === 1 ? 'dept' : 'depts'}
              </Chip>
            )}
            <IconButton
              {...props}
              icon="plus"
              size={20}
              mode="contained"
              containerColor={theme.colors.primaryContainer}
              iconColor={theme.colors.onPrimaryContainer}
              onPress={() => handleCreateDepartment(item.hash, item.name)}
              style={styles.addButton}
            />
          </View>
        )}
      />
    </Card>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading organisations...</Text>
      </View>
    );
  }

  if (organisations.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No organisations yet</Text>
        <Text style={styles.emptySubtext}>
          Create an organisation to manage departments and devices
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {organisations.map((item, index) => (
        <React.Fragment key={item.hash}>
          {renderOrganisation({ item })}
          {index < organisations.length - 1 && <View style={{ height: 8 }} />}
        </React.Fragment>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  card: {
    elevation: 2,
  },
  listItem: {
    paddingVertical: 8,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  departmentChip: {
    marginRight: 4,
  },
  addButton: {
    margin: 0,
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
});