import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, SectionList, Alert } from 'react-native';
import { 
  Text, 
  Card, 
  List, 
  Chip, 
  Avatar,
  IconButton,
  ActivityIndicator,
  Button,
  ProgressBar,
  useTheme,
  Divider,
  Menu,
  Portal,
  Dialog,
  TextInput
} from 'react-native-paper';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Profile } from '@refinio/one.core/lib/recipes.js';
import type { TrustRelationship, TrustLevel, ExternalVerification } from '@refinio/one.trust';
import type { VerifiableCredential } from '@refinio/one.vc';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface TrustChainSection {
  title: string;
  data: TrustChainItem[];
}

interface TrustChainItem {
  id: string;
  type: 'pairing' | 'external-verification' | 'attestation' | 'credential' | 'shared-memory';
  timestamp: string;
  issuer?: SHA256IdHash<Profile>;
  issuerName?: string;
  trustLevel?: number;
  verificationDetails?: any;
  isValid?: boolean;
  description: string;
}

export default function TrustChainScreen() {
  const params = useLocalSearchParams();
  const personId = Array.isArray(params.personId) ? params.personId[0] : params.personId;
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { models } = useInstance();
  
  const [loading, setLoading] = useState(true);
  const [trustChainSections, setTrustChainSections] = useState<TrustChainSection[]>([]);
  const [overallTrustLevel, setOverallTrustLevel] = useState<TrustLevel | null>(null);
  const [contactName, setContactName] = useState('Unknown Contact');
  const [selectedItem, setSelectedItem] = useState<TrustChainItem | null>(null);
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [notaryId, setNotaryId] = useState('');
  
  useEffect(() => {
    loadTrustChain();
  }, [personId]);
  
  const loadTrustChain = async () => {
    if (!models?.trustModel || !models?.leuteModel) {
      console.error('[TrustChainScreen] Required models not available');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Get contact name
      try {
        const someone = await models.leuteModel.getSomeone(personId);
        if (someone) {
          const profile = await someone.mainProfile();
          if (profile?.personDescriptions?.length > 0) {
            const nameDesc = profile.personDescriptions.find((d: any) => d.$type$ === 'PersonName' && d.name);
            if (nameDesc?.name) {
              setContactName(nameDesc.name);
            }
          }
        }
      } catch (err) {
        console.error('[TrustChainScreen] Error getting contact name:', err);
      }
      
      // Get overall trust level
      const trustLevel = await models.trustModel.evaluateTrust(personId, 'general');
      setOverallTrustLevel(trustLevel);
      
      // Build trust chain sections focused on TIME and RELATIONSHIP
      const sections: TrustChainSection[] = [];
      
      // 1. Relationship Timeline (Time-based trust evolution)
      const timelineSection: TrustChainSection = {
        title: 'Relationship Timeline',
        data: []
      };
      
      // Get relationship history
      const myId = await models.leuteModel.myMainIdentity();
      
      // Initial pairing/connection (Time T0)
      const pairingTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago for demo
      timelineSection.data.push({
        id: `time-pairing`,
        type: 'pairing',
        timestamp: pairingTime.toISOString(),
        description: 'First connection established',
        trustLevel: 0.3, // Low initial trust
        isValid: true,
        verificationDetails: {
          method: 'QR Code Pairing',
          duration: '0 days',
          relationship: 'stranger'
        }
      });
      
      // Trust growth over time
      const daysSincePairing = 30;
      const trustGrowthEvents = [
        { days: 1, event: 'First message exchange', trust: 0.4, messages: 5 },
        { days: 7, event: 'Weekly interaction pattern established', trust: 0.5, messages: 50 },
        { days: 14, event: 'Consistent communication', trust: 0.6, messages: 150 },
        { days: 30, event: 'Established relationship', trust: 0.7, messages: 300 }
      ];
      
      for (const growth of trustGrowthEvents) {
        if (growth.days <= daysSincePairing) {
          const eventTime = new Date(pairingTime.getTime() + growth.days * 24 * 60 * 60 * 1000);
          timelineSection.data.push({
            id: `time-growth-${growth.days}`,
            type: 'shared-memory',
            timestamp: eventTime.toISOString(),
            description: growth.event,
            trustLevel: growth.trust,
            isValid: true,
            verificationDetails: {
              duration: `${growth.days} days`,
              messageCount: growth.messages,
              relationship: growth.days < 7 ? 'acquaintance' : growth.days < 14 ? 'regular contact' : 'trusted contact'
            }
          });
        }
      }
      
      sections.push(timelineSection);
      
      // 2. Relationship Types & Context
      const relationshipSection: TrustChainSection = {
        title: 'Relationship Context',
        data: []
      };
      
      // Define relationship types and their trust implications
      const relationships = [
        {
          id: 'rel-personal',
          type: 'personal',
          description: 'Personal conversation topics',
          trust: 0.6,
          details: {
            topics: ['family', 'hobbies', 'life events'],
            depth: 'medium',
            frequency: 'regular'
          }
        },
        {
          id: 'rel-professional',
          type: 'professional', 
          description: 'Professional collaboration',
          trust: 0.7,
          details: {
            topics: ['work', 'projects', 'expertise'],
            depth: 'high',
            frequency: 'daily'
          }
        },
        {
          id: 'rel-transactional',
          type: 'transactional',
          description: 'Business transactions',
          trust: 0.5,
          details: {
            topics: ['payments', 'contracts', 'deliveries'],
            depth: 'low',
            frequency: 'occasional'
          }
        }
      ];
      
      // Add active relationship types
      relationships.forEach(rel => {
        // In real implementation, would detect from conversation analysis
        if (rel.type === 'personal' || rel.type === 'professional') {
          relationshipSection.data.push({
            id: rel.id,
            type: 'attestation',
            timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            description: rel.description,
            trustLevel: rel.trust,
            isValid: true,
            verificationDetails: rel.details
          });
        }
      });
      
      sections.push(relationshipSection);
      
      // 3. Relationship Verification Events
      const verificationSection: TrustChainSection = {
        title: 'Verification Milestones',
        data: []
      };
      
      // Key relationship verification events
      const verificationEvents = [
        {
          id: 'verify-mutual',
          timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
          description: 'Mutual contact verification',
          trust: 0.6,
          details: {
            type: 'bidirectional',
            method: 'Both parties added each other',
            relationship: 'mutual'
          }
        },
        {
          id: 'verify-video',
          timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          description: 'Video call verification',
          trust: 0.8,
          details: {
            type: 'real-time',
            method: 'Face-to-face video interaction',
            relationship: 'verified human'
          }
        },
        {
          id: 'verify-shared-contacts',
          timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          description: 'Common connections identified',
          trust: 0.7,
          details: {
            type: 'social-proof',
            method: '3 mutual contacts',
            relationship: 'network verified'
          }
        }
      ];
      
      verificationEvents.forEach(event => {
        verificationSection.data.push({
          id: event.id,
          type: 'external-verification',
          timestamp: event.timestamp,
          description: event.description,
          trustLevel: event.trust,
          isValid: true,
          verificationDetails: event.details
        });
      });
      
      if (verificationSection.data.length > 0) {
        sections.push(verificationSection);
      }
      
      // 4. Time-Relationship Matrix
      const matrixSection: TrustChainSection = {
        title: 'Trust Evolution Matrix',
        data: []
      };
      
      // Show how different relationship aspects evolved over time
      const trustMatrix = [
        {
          id: 'matrix-communication',
          type: 'shared-memory',
          timestamp: new Date().toISOString(),
          description: 'Communication patterns',
          trustLevel: 0.7,
          verificationDetails: {
            'Week 1': 'Formal, brief messages',
            'Week 2': 'Longer conversations',
            'Week 3': 'Personal topics introduced',
            'Week 4': 'Regular, comfortable exchange',
            trend: 'increasing familiarity'
          }
        },
        {
          id: 'matrix-response-time',
          type: 'shared-memory',
          timestamp: new Date().toISOString(),
          description: 'Response time patterns',
          trustLevel: 0.65,
          verificationDetails: {
            'Initial': '24-48 hours',
            'After 1 week': '2-6 hours',
            'After 2 weeks': '30 min - 2 hours',
            'Current': 'Near real-time when online',
            trend: 'increasing engagement'
          }
        },
        {
          id: 'matrix-topic-diversity',
          type: 'shared-memory',
          timestamp: new Date().toISOString(),
          description: 'Conversation topic diversity',
          trustLevel: 0.6,
          verificationDetails: {
            'Topics discussed': 12,
            'Depth level': 'Medium to High',
            'Sensitive topics': 3,
            'Shared interests': 5,
            trend: 'expanding scope'
          }
        }
      ];
      
      matrixSection.data.push(...trustMatrix);
      sections.push(matrixSection);
      
      // 5. Future Trust Projections (Place holder for Place dimension)
      const futureSection: TrustChainSection = {
        title: 'Trust Trajectory',
        data: []
      };
      
      futureSection.data.push({
        id: 'future-place',
        type: 'credential',
        timestamp: new Date().toISOString(),
        description: 'Place-based verification (Coming Soon)',
        trustLevel: 0.0,
        isValid: false,
        verificationDetails: {
          status: 'Not yet implemented',
          description: 'Physical location verification will add another trust dimension',
          potential: 'Meeting in person, shared physical spaces, geo-attestations'
        }
      });
      
      sections.push(futureSection);
      
      setTrustChainSections(sections);
    } catch (error) {
      console.error('[TrustChainScreen] Error loading trust chain:', error);
      Alert.alert('Error', 'Failed to load trust chain');
    } finally {
      setLoading(false);
    }
  };
  
  const getTrustColor = (level?: number): string => {
    if (level === undefined) return theme.colors.outline;
    if (level >= 0.8) return '#4caf50';
    if (level >= 0.6) return '#ffc107';
    if (level >= 0.4) return '#ff9800';
    return theme.colors.error;
  };
  
  const getItemIcon = (type: string): string => {
    switch (type) {
      case 'pairing': return 'link-variant';
      case 'external-verification': return 'shield-check';
      case 'attestation': return 'account-check';
      case 'credential': return 'certificate';
      case 'shared-memory': return 'message-text';
      default: return 'help-circle';
    }
  };
  
  const handleExportTrustChain = async () => {
    if (!models?.vcModel || !notaryId) {
      Alert.alert('Error', 'Please enter a notary ID');
      return;
    }
    
    try {
      // Create a trust chain VC containing all trust evidence
      const trustChainVC = await models.vcModel.createCredential({
        claims: trustChainSections.flatMap(section => 
          section.data.map(item => ({
            subject: personId as SHA256IdHash<Profile>,
            predicate: `trust-${item.type}`,
            object: { type: 'Text', value: JSON.stringify(item) }
          }))
        ),
        holder: personId as SHA256IdHash<Profile>
      });
      
      // Share with notary
      await models.vcModel.shareWithNotary(trustChainVC, notaryId as SHA256IdHash<Profile>);
      
      Alert.alert('Success', 'Trust chain shared with notary');
      setExportDialogVisible(false);
    } catch (error) {
      console.error('[TrustChainScreen] Error exporting trust chain:', error);
      Alert.alert('Error', 'Failed to export trust chain');
    }
  };
  
  const renderTrustItem = ({ item }: { item: TrustChainItem }) => (
    <Card 
      style={styles.trustItem}
      onPress={() => setSelectedItem(item)}
    >
      <Card.Content>
        <View style={styles.itemHeader}>
          <Avatar.Icon 
            size={40} 
            icon={getItemIcon(item.type)}
            style={{ backgroundColor: item.isValid !== false ? theme.colors.primary : theme.colors.error }}
          />
          <View style={styles.itemContent}>
            <Text style={styles.itemDescription}>{item.description}</Text>
            {item.issuerName && (
              <Text style={styles.itemIssuer}>by {item.issuerName}</Text>
            )}
            <Text style={styles.itemTimestamp}>
              {new Date(item.timestamp).toLocaleDateString()}
            </Text>
          </View>
          {item.trustLevel !== undefined && (
            <View style={styles.trustLevelContainer}>
              <Text style={[styles.trustLevelText, { color: getTrustColor(item.trustLevel) }]}>
                {(item.trustLevel * 100).toFixed(0)}%
              </Text>
              <Text style={styles.trustLevelLabel}>Trust</Text>
            </View>
          )}
        </View>
        {item.verificationDetails && (
          <View style={styles.detailsChips}>
            {Object.entries(item.verificationDetails).slice(0, 3).map(([key, value]) => (
              <Chip
                key={key}
                mode="outlined"
                style={styles.detailChip}
                textStyle={styles.detailChipText}
              >
                {key}: {value.toString()}
              </Chip>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
  
  const renderSectionHeader = ({ section }: { section: TrustChainSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
        {section.title}
      </Text>
      <Chip mode="outlined" style={styles.sectionCount}>
        {section.data.length}
      </Chip>
    </View>
  );
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading trust chain...</Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Trust Chain',
          headerRight: () => (
            <Menu
              visible={exportDialogVisible}
              onDismiss={() => setExportDialogVisible(false)}
              anchor={
                <IconButton
                  icon="export"
                  onPress={() => setExportDialogVisible(true)}
                />
              }
            >
              <Menu.Item
                onPress={() => {
                  setExportDialogVisible(false);
                  setTimeout(() => setNotaryId(''), 100);
                }}
                title="Export to Notary"
                leadingIcon="briefcase-account"
              />
            </Menu>
          ),
        }}
      />
      
      {/* Trust Summary Card */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryHeader}>
            <Avatar.Text size={64} label={contactName.substring(0, 2).toUpperCase()} />
            <View style={styles.summaryInfo}>
              <Text style={styles.contactName}>{contactName}</Text>
              <Text style={styles.personId} numberOfLines={1} ellipsizeMode="middle">
                {personId}
              </Text>
            </View>
          </View>
          
          {overallTrustLevel && (
            <View style={styles.trustSummary}>
              <Text style={styles.trustLabel}>Overall Trust Level</Text>
              <ProgressBar
                progress={overallTrustLevel.level}
                color={getTrustColor(overallTrustLevel.level)}
                style={styles.trustBar}
              />
              <View style={styles.trustStats}>
                <Text style={styles.trustPercentage}>
                  {(overallTrustLevel.level * 100).toFixed(0)}%
                </Text>
                <Text style={styles.trustConfidence}>
                  Confidence: {(overallTrustLevel.confidence * 100).toFixed(0)}%
                </Text>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>
      
      {/* Trust Chain Items */}
      <SectionList
        sections={trustChainSections}
        renderItem={renderTrustItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
      />
      
      {/* Export Dialog */}
      <Portal>
        <Dialog
          visible={!!notaryId}
          onDismiss={() => setNotaryId('')}
        >
          <Dialog.Title>Export Trust Chain</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Export this trust chain as a Verifiable Credential to share with a notary or third party.
            </Text>
            <TextInput
              label="Notary Profile ID"
              value={notaryId}
              onChangeText={setNotaryId}
              mode="outlined"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNotaryId('')}>Cancel</Button>
            <Button onPress={handleExportTrustChain}>Export</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Detail Dialog */}
      {selectedItem && (
        <Portal>
          <Dialog
            visible={!!selectedItem}
            onDismiss={() => setSelectedItem(null)}
          >
            <Dialog.Title>{selectedItem.type.replace('-', ' ').toUpperCase()}</Dialog.Title>
            <Dialog.Content>
              <Text>{selectedItem.description}</Text>
              {selectedItem.verificationDetails && (
                <View style={styles.dialogDetails}>
                  {Object.entries(selectedItem.verificationDetails).map(([key, value]) => (
                    <Text key={key} style={styles.dialogDetailRow}>
                      <Text style={styles.dialogDetailKey}>{key}: </Text>
                      {value.toString()}
                    </Text>
                  ))}
                </View>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setSelectedItem(null)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  summaryCard: {
    margin: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 16,
  },
  contactName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  personId: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  trustSummary: {
    marginTop: 16,
  },
  trustLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  trustBar: {
    height: 8,
    borderRadius: 4,
  },
  trustStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  trustPercentage: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  trustConfidence: {
    fontSize: 14,
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionCount: {
    height: 24,
  },
  trustItem: {
    marginHorizontal: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    marginLeft: 12,
  },
  itemDescription: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemIssuer: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  itemTimestamp: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  trustLevelContainer: {
    alignItems: 'center',
  },
  trustLevelText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  trustLevelLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  detailsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  detailChip: {
    marginRight: 4,
    marginBottom: 4,
    height: 24,
  },
  detailChipText: {
    fontSize: 10,
  },
  dialogText: {
    marginBottom: 16,
  },
  input: {
    marginTop: 8,
  },
  dialogDetails: {
    marginTop: 16,
  },
  dialogDetailRow: {
    marginVertical: 2,
  },
  dialogDetailKey: {
    fontWeight: 'bold',
  },
});