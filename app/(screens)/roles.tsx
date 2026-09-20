/**
 * Role & Authority Management Screen (EN 17141 Compliance)
 *
 * Provides cryptographic role inspection, authority verification,
 * and role certificate issuance for UVC facility administrators and clinicians.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Surface,
  Text,
  Chip,
  IconButton,
  Button,
  Divider,
  TextInput,
  Portal,
  Dialog,
  Menu,
  ActivityIndicator,
  Card,
  useTheme,
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useInstance } from '@src/providers/app/useInstance';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import {
  UvcRole,
  UVC_ROLE_DESCRIPTORS,
  hasRole,
  type RoleDescriptor,
} from '@src/models/roles/role-utils';
import type { Person, Profile } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { RoleCertificate } from '@src/recipes/RoleCertificate';

interface ContactRoleEntry {
  personId: string;
  name: string;
  email?: string;
  roles: Array<{
    role: string;
    app: string;
    issuer?: string;
    certificateHash?: string;
  }>;
}

export default function RolesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  const { models } = useInstance();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myPersonId, setMyPersonId] = useState<string>('');
  const [myProfileName, setMyProfileName] = useState<string>('My Identity');
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [contacts, setContacts] = useState<ContactRoleEntry[]>([]);

  // Issue Role Dialog State
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [targetPersonInput, setTargetPersonInput] = useState('');
  const [targetPersonName, setTargetPersonName] = useState('');
  const [selectedRoleToGrant, setSelectedRoleToGrant] = useState<string>(UvcRole.DOCTOR);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [submittingRole, setSubmittingRole] = useState(false);

  // Active Tab: 'overview' | 'directory' | 'matrix'
  const [activeTab, setActiveTab] = useState<'overview' | 'directory' | 'matrix'>('overview');

  const availableRolesList = useMemo(
    () => [
      UvcRole.ADMIN,
      UvcRole.DOCTOR,
      UvcRole.PHYSICIAN,
      UvcRole.OPERATOR,
      UvcRole.TECHNICIAN,
      UvcRole.AUDITOR,
      UvcRole.PATIENT,
      UvcRole.LAMP,
      UvcRole.SENSOR,
    ],
    []
  );

  const loadRoleData = useCallback(async () => {
    if (!models?.leuteModel) {
      setLoading(false);
      return;
    }

    try {
      const leute = models.leuteModel;
      const myId = await leute.myMainIdentity();
      if (!myId) {
        setLoading(false);
        return;
      }
      setMyPersonId(myId);

      // Fetch my profile name
      try {
        const me = await leute.me();
        const profile = await me.mainProfile();
        if (profile?.personDescriptions) {
          for (const desc of profile.personDescriptions) {
            if (desc.$type$ === 'PersonName' && (desc as any).name) {
              setMyProfileName((desc as any).name);
              break;
            }
          }
        }
      } catch {
        // Fallback to truncated ID
      }

      // Check current user's roles
      const userRoles: string[] = [];
      for (const r of availableRolesList) {
        const has = await hasRole(leute, myId, r, 'uvc');
        if (has) {
          userRoles.push(r);
        }
      }
      // If no explicit role certificate exists yet, check if admin by default in dev/single-node
      const adminStatus = userRoles.includes(UvcRole.ADMIN) || userRoles.length === 0;
      if (userRoles.length === 0) {
        userRoles.push('admin (default anchor)');
      }
      setMyRoles(userRoles);
      setIsUserAdmin(adminStatus);

      // Load contacts and their role certificates
      const otherContacts = await leute.others();
      const contactEntries: ContactRoleEntry[] = [];

      for (const contact of otherContacts) {
        try {
          let contactId = '';
          if (contact.pSomeone?.identities) {
            contactId = contact.pSomeone.identities.keys().next().value ?? '';
          }
          if (!contactId) continue;

          let contactName = 'Unknown Contact';
          let contactEmail: string | undefined;

          try {
            const profile = await contact.mainProfile();
            if (profile?.personDescriptions) {
              for (const desc of profile.personDescriptions) {
                if (desc.$type$ === 'PersonName' && (desc as any).name) {
                  contactName = (desc as any).name;
                } else if (desc.$type$ === 'PersonEmail' && (desc as any).email) {
                  contactEmail = (desc as any).email;
                }
              }
            }
          } catch {
            // Profile read failure fallback
          }

          // Fetch RoleCertificates for contact
          const certs = await leute.trust.getCertificatesOfType(
            contactId as SHA256IdHash<Person>,
            'RoleCertificate'
          );

          const roleList = certs.map(c => {
            const cert = c.certificate as unknown as RoleCertificate;
            return {
              role: cert.role,
              app: cert.app,
              issuer: (c.signature as any)?.issuer,
              certificateHash: (c as any).hash,
            };
          });

          contactEntries.push({
            personId: contactId,
            name: contactName,
            email: contactEmail,
            roles: roleList,
          });
        } catch (err) {
          console.warn('[RolesScreen] Error parsing contact role:', err);
        }
      }

      setContacts(contactEntries);
    } catch (err) {
      console.error('[RolesScreen] Error loading roles:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [models?.leuteModel, availableRolesList]);

  useEffect(() => {
    loadRoleData();
  }, [loadRoleData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRoleData();
  }, [loadRoleData]);

  const handleIssueRole = async () => {
    if (!models?.leuteModel) return;
    if (!targetPersonInput.trim()) {
      Alert.alert('Validation Error', 'Please specify a target Person ID or choose a contact.');
      return;
    }

    try {
      setSubmittingRole(true);
      const leute = models.leuteModel;
      const issuerId = await leute.myMainIdentity();
      if (!issuerId) throw new Error('No local signing identity available.');

      await leute.trust.certify(
        'RoleCertificate',
        {
          person: targetPersonInput.trim() as SHA256IdHash<Person>,
          role: selectedRoleToGrant,
          app: 'uvc',
        },
        issuerId
      );

      await leute.trust.refreshCaches();
      setIssueDialogOpen(false);
      setTargetPersonInput('');
      setTargetPersonName('');
      Alert.alert(
        'Certificate Issued',
        `Successfully issued role certificate "${selectedRoleToGrant}" to ${
          targetPersonName || targetPersonInput.slice(0, 10) + '…'
        }.`
      );
      loadRoleData();
    } catch (error) {
      console.error('[RolesScreen] Failed to issue role:', error);
      Alert.alert('Issuance Failed', (error as Error)?.message || 'Failed to issue role certificate.');
    } finally {
      setSubmittingRole(false);
    }
  };

  const openGrantDialogForContact = (c: ContactRoleEntry) => {
    setTargetPersonInput(c.personId);
    setTargetPersonName(c.name);
    setIssueDialogOpen(true);
  };

  const getRoleDesc = (roleKey: string): RoleDescriptor => {
    const cleanKey = roleKey.toLowerCase().split(' ')[0];
    return (
      UVC_ROLE_DESCRIPTORS[cleanKey] || {
        key: roleKey,
        title: roleKey.toUpperCase(),
        description: 'Assigned system role.',
        badgeIcon: 'shield-account',
        color: '#64748b',
        authorityLevel: 'technical',
      }
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Roles & Authority',
          headerBackVisible: true,
        }}
      />

      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* Header Card: Active Identity & Authority Posture */}
          <Surface
            style={[
              styles.identityCard,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.identityRow}>
              <View
                style={[
                  styles.avatarContainer,
                  { backgroundColor: isUserAdmin ? '#dc262622' : '#2563eb22' },
                ]}
              >
                <MaterialCommunityIcons
                  name={isUserAdmin ? 'shield-crown' : 'account-check'}
                  size={32}
                  color={isUserAdmin ? '#ef4444' : '#3b82f6'}
                />
              </View>
              <View style={styles.identityTextCol}>
                <View style={styles.nameBadgeRow}>
                  <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                    {myProfileName}
                  </Text>
                  <Chip
                    compact
                    style={[
                      styles.authorityChip,
                      {
                        backgroundColor: isUserAdmin ? '#dc262633' : '#2563eb33',
                      },
                    ]}
                    textStyle={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isUserAdmin ? '#f87171' : '#60a5fa',
                    }}
                  >
                    {isUserAdmin ? 'ROOT ANCHOR' : 'MEMBER'}
                  </Chip>
                </View>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace' }}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {myPersonId || 'Initializing...'}
                </Text>
              </View>
            </View>

            <Divider style={styles.cardDivider} />

            <View style={styles.activeRolesContainer}>
              <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
                MY CERTIFIED ROLES (EN 17141)
              </Text>
              <View style={styles.roleBadgesWrap}>
                {myRoles.map(r => {
                  const desc = getRoleDesc(r);
                  return (
                    <Chip
                      key={r}
                      icon={() => (
                        <MaterialCommunityIcons
                          name={desc.badgeIcon as any}
                          size={14}
                          color={desc.color}
                        />
                      )}
                      style={[
                        styles.roleChip,
                        {
                          backgroundColor: `${desc.color}1a`,
                          borderColor: `${desc.color}44`,
                        },
                      ]}
                      textStyle={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 12 }}
                    >
                      {desc.title}
                    </Chip>
                  );
                })}
              </View>
            </View>
          </Surface>

          {/* Tab Navigation */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              onPress={() => setActiveTab('overview')}
              style={[
                styles.tabButton,
                activeTab === 'overview' && [
                  styles.activeTabButton,
                  { borderBottomColor: theme.colors.primary },
                ],
              ]}
            >
              <Text
                variant="labelLarge"
                style={[
                  styles.tabLabel,
                  activeTab === 'overview'
                    ? { color: theme.colors.primary, fontWeight: '700' }
                    : { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Overview
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('directory')}
              style={[
                styles.tabButton,
                activeTab === 'directory' && [
                  styles.activeTabButton,
                  { borderBottomColor: theme.colors.primary },
                ],
              ]}
            >
              <Text
                variant="labelLarge"
                style={[
                  styles.tabLabel,
                  activeTab === 'directory'
                    ? { color: theme.colors.primary, fontWeight: '700' }
                    : { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Node Directory ({contacts.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('matrix')}
              style={[
                styles.tabButton,
                activeTab === 'matrix' && [
                  styles.activeTabButton,
                  { borderBottomColor: theme.colors.primary },
                ],
              ]}
            >
              <Text
                variant="labelLarge"
                style={[
                  styles.tabLabel,
                  activeTab === 'matrix'
                    ? { color: theme.colors.primary, fontWeight: '700' }
                    : { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Role Matrix
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
                Verifying cryptographic certificates...
              </Text>
            </View>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & ISSUANCE */}
              {activeTab === 'overview' && (
                <View style={styles.tabContent}>
                  <View style={styles.actionHeaderRow}>
                    <View>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                        Facility Authority Actions
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Issue cryptographic RoleCertificates to peers and devices
                      </Text>
                    </View>
                    <Button
                      mode="contained"
                      icon="certificate"
                      buttonColor="#dc2626"
                      textColor="#fff"
                      onPress={() => {
                        setTargetPersonInput('');
                        setTargetPersonName('');
                        setIssueDialogOpen(true);
                      }}
                      style={styles.grantButton}
                    >
                      Issue Role
                    </Button>
                  </View>

                  {/* Summary Cards */}
                  <View style={styles.summaryGrid}>
                    <Surface
                      style={[
                        styles.metricCard,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <MaterialCommunityIcons name="shield-account" size={24} color="#3b82f6" />
                      <Text variant="headlineSmall" style={{ fontWeight: '800', marginTop: 6, color: theme.colors.onSurface }}>
                        {contacts.reduce((acc, c) => acc + c.roles.length, myRoles.length)}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Active Certificates
                      </Text>
                    </Surface>

                    <Surface
                      style={[
                        styles.metricCard,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <MaterialCommunityIcons name="devices" size={24} color="#10b981" />
                      <Text variant="headlineSmall" style={{ fontWeight: '800', marginTop: 6, color: theme.colors.onSurface }}>
                        {contacts.length}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Paired Nodes / Peers
                      </Text>
                    </Surface>

                    <Surface
                      style={[
                        styles.metricCard,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <MaterialCommunityIcons name="check-decagram" size={24} color="#f59e0b" />
                      <Text variant="headlineSmall" style={{ fontWeight: '800', marginTop: 6, color: theme.colors.onSurface }}>
                        EN 17141
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Compliance Level
                      </Text>
                    </Surface>
                  </View>

                  {/* Governance Notice */}
                  <Surface
                    style={[
                      styles.noticeCard,
                      { backgroundColor: `${theme.colors.primary}12`, borderColor: `${theme.colors.primary}33` },
                    ]}
                  >
                    <MaterialCommunityIcons name="information" size={20} color={theme.colors.primary} />
                    <Text variant="bodySmall" style={[styles.noticeText, { color: theme.colors.onSurface }]}>
                      In the UVC decentralized architecture, roles are not entries in a centralized database. Each role is a tamper-evident, cryptographically signed <Text style={{ fontWeight: 'bold' }}>RoleCertificate</Text> anchored in the ONE distributed object store.
                    </Text>
                  </Surface>
                </View>
              )}

              {/* TAB 2: DIRECTORY */}
              {activeTab === 'directory' && (
                <View style={styles.tabContent}>
                  {contacts.length === 0 ? (
                    <Surface
                      style={[
                        styles.emptyCard,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={44} color={theme.colors.onSurfaceVariant} />
                      <Text variant="titleMedium" style={{ marginTop: 12, color: theme.colors.onSurface }}>
                        No Paired Contacts Yet
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ textAlign: 'center', marginTop: 6, color: theme.colors.onSurfaceVariant }}
                      >
                        Pair with clinicians, technicians, or hardware devices via the Contacts tab to issue certificates.
                      </Text>
                      <Button
                        mode="outlined"
                        onPress={() => router.push('/(tabs)/contacts')}
                        style={{ marginTop: 16 }}
                      >
                        Go to Contacts
                      </Button>
                    </Surface>
                  ) : (
                    contacts.map(contact => (
                      <Surface
                        key={contact.personId}
                        style={[
                          styles.contactCard,
                          {
                            backgroundColor: theme.colors.surfaceVariant,
                            borderColor: theme.colors.outlineVariant,
                          },
                        ]}
                      >
                        <View style={styles.contactHeader}>
                          <View style={styles.contactAvatar}>
                            <MaterialCommunityIcons name="account" size={24} color="#94a3b8" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                              {contact.name}
                            </Text>
                            {contact.email && (
                              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {contact.email}
                              </Text>
                            )}
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace', fontSize: 10 }}
                              numberOfLines={1}
                              ellipsizeMode="middle"
                            >
                              {contact.personId}
                            </Text>
                          </View>
                          <IconButton
                            icon="plus-circle-outline"
                            size={22}
                            iconColor={theme.colors.primary}
                            onPress={() => openGrantDialogForContact(contact)}
                          />
                        </View>

                        <Divider style={styles.cardDivider} />

                        <View style={styles.contactRolesSection}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                            ROLES & CERTIFICATES ({contact.roles.length})
                          </Text>
                          {contact.roles.length === 0 ? (
                            <Text variant="bodySmall" style={{ fontStyle: 'italic', color: theme.colors.onSurfaceVariant }}>
                              No role certificates assigned. Tap + to certify.
                            </Text>
                          ) : (
                            <View style={styles.roleBadgesWrap}>
                              {contact.roles.map((cr, idx) => {
                                const desc = getRoleDesc(cr.role);
                                return (
                                  <Chip
                                    key={idx}
                                    icon={() => (
                                      <MaterialCommunityIcons
                                        name={desc.badgeIcon as any}
                                        size={12}
                                        color={desc.color}
                                      />
                                    )}
                                    style={[
                                      styles.roleChip,
                                      {
                                        backgroundColor: `${desc.color}15`,
                                        borderColor: `${desc.color}33`,
                                      },
                                    ]}
                                    textStyle={{ fontSize: 11, color: theme.colors.onSurface }}
                                  >
                                    {desc.title} ({cr.app})
                                  </Chip>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      </Surface>
                    ))
                  )}
                </View>
              )}

              {/* TAB 3: ROLE MATRIX */}
              {activeTab === 'matrix' && (
                <View style={styles.tabContent}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                    EN 17141 cleanroom and healthcare disinfection privilege hierarchy:
                  </Text>
                  {Object.values(UVC_ROLE_DESCRIPTORS).map(desc => (
                    <Card
                      key={desc.key}
                      style={[
                        styles.matrixCard,
                        {
                          backgroundColor: theme.colors.surfaceVariant,
                          borderLeftColor: desc.color,
                        },
                      ]}
                    >
                      <Card.Content>
                        <View style={styles.matrixHeaderRow}>
                          <View style={styles.matrixTitleGroup}>
                            <MaterialCommunityIcons name={desc.badgeIcon as any} size={22} color={desc.color} />
                            <Text variant="titleMedium" style={{ fontWeight: '700', marginLeft: 8, color: theme.colors.onSurface }}>
                              {desc.title}
                            </Text>
                          </View>
                          <Chip
                            compact
                            style={{ backgroundColor: `${desc.color}22` }}
                            textStyle={{ fontSize: 10, fontWeight: '700', color: desc.color }}
                          >
                            {desc.authorityLevel.toUpperCase()}
                          </Chip>
                        </View>
                        <Text variant="bodyMedium" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                          {desc.description}
                        </Text>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* ISSUE ROLE DIALOG */}
        <Portal>
          <Dialog
            visible={issueDialogOpen}
            onDismiss={() => setIssueDialogOpen(false)}
            style={{ backgroundColor: theme.colors.surfaceVariant }}
          >
            <Dialog.Title style={{ color: theme.colors.onSurface }}>
              Issue Role Certificate
            </Dialog.Title>
            <Dialog.Content>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Signs a cryptographic RoleCertificate linking the target Person ID to an EN 17141 authority level.
              </Text>

              <TextInput
                label="Target Person ID or Name"
                value={targetPersonName ? `${targetPersonName} (${targetPersonInput.slice(0, 10)}…)` : targetPersonInput}
                onChangeText={text => {
                  setTargetPersonInput(text);
                  setTargetPersonName('');
                }}
                mode="outlined"
                placeholder="Paste SHA256 Person ID"
                style={{ marginBottom: 12 }}
              />

              <Menu
                visible={roleMenuOpen}
                onDismiss={() => setRoleMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setRoleMenuOpen(true)}
                    icon="chevron-down"
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    style={{ marginBottom: 8 }}
                  >
                    Role: {getRoleDesc(selectedRoleToGrant).title}
                  </Button>
                }
              >
                {availableRolesList.map(r => (
                  <Menu.Item
                    key={r}
                    onPress={() => {
                      setSelectedRoleToGrant(r);
                      setRoleMenuOpen(false);
                    }}
                    title={getRoleDesc(r).title}
                    leadingIcon={getRoleDesc(r).badgeIcon}
                  />
                ))}
              </Menu>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setIssueDialogOpen(false)} textColor={theme.colors.onSurfaceVariant}>
                Cancel
              </Button>
              <Button
                mode="contained"
                loading={submittingRole}
                disabled={submittingRole}
                onPress={handleIssueRole}
              >
                Sign & Certify
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  identityCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityTextCol: {
    flex: 1,
    marginLeft: 14,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  authorityChip: {
    height: 24,
  },
  cardDivider: {
    marginVertical: 12,
  },
  activeRolesContainer: {
    marginTop: 2,
  },
  sectionLabel: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  roleBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    borderWidth: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#33415533',
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTabButton: {
    borderBottomWidth: 2,
  },
  tabLabel: {
    fontSize: 13,
  },
  tabContent: {
    gap: 12,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  grantButton: {
    borderRadius: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  noticeCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  noticeText: {
    flex: 1,
    lineHeight: 18,
  },
  emptyCard: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
  },
  contactCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#33415533',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactRolesSection: {
    marginTop: 2,
  },
  matrixCard: {
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matrixTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
});
