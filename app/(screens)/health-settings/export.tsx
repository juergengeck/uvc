/**
 * Export Health Data Screen
 * 
 * Allows users to export their health data in FHIR format
 * Supports various export options and data filtering
 */

import React, { useState, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  Alert,
  Share,
  Platform
} from 'react-native';
import { 
  Text, 
  List, 
  Button, 
  Card,
  Chip,
  Portal,
  Dialog,
  RadioButton,
  Checkbox,
  Divider,
  useTheme,
  ProgressBar,
  IconButton,
  SegmentedButtons
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { createThemedStyles } from '@src/constants/ThemeStyles';
import DateTimePicker from '@react-native-community/datetimepicker';

// Mock data types - replace with actual FHIR types
interface ExportOptions {
  format: 'fhir-json' | 'fhir-xml' | 'csv';
  dateRange: 'all' | 'year' | 'month' | 'week' | 'custom';
  startDate?: Date;
  endDate?: Date;
  dataTypes: string[];
  includeDeviceInfo: boolean;
  anonymize: boolean;
}

interface DataTypeOption {
  id: string;
  name: string;
  description: string;
  recordCount: number;
}

export default function ExportHealthDataScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  
  // State
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [previewDialogVisible, setPreviewDialogVisible] = useState(false);
  const [exportData, setExportData] = useState<string>('');
  
  const [options, setOptions] = useState<ExportOptions>({
    format: 'fhir-json',
    dateRange: 'month',
    dataTypes: ['heart-rate', 'steps', 'sleep'],
    includeDeviceInfo: true,
    anonymize: false
  });

  // Mock data types with counts
  const dataTypes: DataTypeOption[] = [
    { 
      id: 'heart-rate', 
      name: t('settings.health.dataTypes.heartRate', { defaultValue: 'Heart Rate' }), 
      description: 'Heart rate measurements',
      recordCount: 1543 
    },
    { 
      id: 'steps', 
      name: t('settings.health.dataTypes.steps', { defaultValue: 'Steps' }), 
      description: 'Daily step counts',
      recordCount: 365 
    },
    { 
      id: 'sleep', 
      name: t('settings.health.dataTypes.sleep', { defaultValue: 'Sleep' }), 
      description: 'Sleep analysis data',
      recordCount: 180 
    },
    { 
      id: 'spo2', 
      name: t('settings.health.dataTypes.spo2', { defaultValue: 'Blood Oxygen' }), 
      description: 'SpO2 measurements',
      recordCount: 720 
    },
    { 
      id: 'weight', 
      name: t('settings.health.dataTypes.weight', { defaultValue: 'Weight' }), 
      description: 'Body weight records',
      recordCount: 52 
    },
    { 
      id: 'blood-pressure', 
      name: t('settings.health.dataTypes.bloodPressure', { defaultValue: 'Blood Pressure' }), 
      description: 'Blood pressure readings',
      recordCount: 156 
    }
  ];

  const getDateRangeText = () => {
    switch (options.dateRange) {
      case 'all': return t('settings.health.export.allTime', { defaultValue: 'All time' });
      case 'year': return t('settings.health.export.lastYear', { defaultValue: 'Last 12 months' });
      case 'month': return t('settings.health.export.lastMonth', { defaultValue: 'Last 30 days' });
      case 'week': return t('settings.health.export.lastWeek', { defaultValue: 'Last 7 days' });
      case 'custom': 
        if (options.startDate && options.endDate) {
          return `${options.startDate.toLocaleDateString()} - ${options.endDate.toLocaleDateString()}`;
        }
        return t('settings.health.export.customRange', { defaultValue: 'Custom range' });
      default: return '';
    }
  };

  const getTotalRecords = () => {
    return dataTypes
      .filter(dt => options.dataTypes.includes(dt.id))
      .reduce((sum, dt) => sum + dt.recordCount, 0);
  };

  const handleDataTypeToggle = (typeId: string) => {
    setOptions(prev => ({
      ...prev,
      dataTypes: prev.dataTypes.includes(typeId)
        ? prev.dataTypes.filter(id => id !== typeId)
        : [...prev.dataTypes, typeId]
    }));
  };

  const handleExport = async () => {
    if (options.dataTypes.length === 0) {
      Alert.alert(
        t('common:error'),
        t('settings.health.export.selectData', { defaultValue: 'Please select at least one data type to export' })
      );
      return;
    }

    setExporting(true);
    setExportProgress(0);

    try {
      // Simulate export progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setExportProgress(i / 100);
      }

      // Generate mock FHIR bundle
      const mockFhirBundle = {
        resourceType: 'Bundle',
        type: 'collection',
        total: getTotalRecords(),
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: options.anonymize ? 'anonymous' : 'patient-123',
              name: options.anonymize ? [] : [{ given: ['John'], family: 'Doe' }]
            }
          }
          // Additional mock entries would be added here
        ]
      };

      const exportedData = options.format === 'fhir-json' 
        ? JSON.stringify(mockFhirBundle, null, 2)
        : '<Bundle>...</Bundle>'; // Mock XML

      setExportData(exportedData);
      setPreviewDialogVisible(true);
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.export.failed', { defaultValue: 'Failed to export health data' })
      );
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleShare = async () => {
    try {
      const filename = `health-export-${new Date().toISOString().split('T')[0]}.${
        options.format === 'csv' ? 'csv' : options.format === 'fhir-xml' ? 'xml' : 'json'
      }`;

      if (Platform.OS === 'web') {
        // Download file on web
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Share on mobile
        await Share.share({
          message: exportData,
          title: filename
        });
      }

      setPreviewDialogVisible(false);
      Alert.alert(
        t('common:success'),
        t('settings.health.export.success', { defaultValue: 'Health data exported successfully' })
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.export.shareFailed', { defaultValue: 'Failed to share exported data' })
      );
    }
  };

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('settings.health.exportData', { defaultValue: 'Export Health Data' }),
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Export Format */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.export.format', { defaultValue: 'EXPORT FORMAT' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <RadioButton.Group 
            onValueChange={value => setOptions(prev => ({ ...prev, format: value as any }))} 
            value={options.format}
          >
            <List.Item
              title="FHIR JSON"
              description="HL7 FHIR R4 JSON format"
              onPress={() => setOptions(prev => ({ ...prev, format: 'fhir-json' }))}
              left={() => <RadioButton value="fhir-json" />}
            />
            <Divider />
            <List.Item
              title="FHIR XML"
              description="HL7 FHIR R4 XML format"
              onPress={() => setOptions(prev => ({ ...prev, format: 'fhir-xml' }))}
              left={() => <RadioButton value="fhir-xml" />}
            />
            <Divider />
            <List.Item
              title="CSV"
              description="Comma-separated values (simplified)"
              onPress={() => setOptions(prev => ({ ...prev, format: 'csv' }))}
              left={() => <RadioButton value="csv" />}
            />
          </RadioButton.Group>
        </View>

        {/* Date Range */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.export.dateRange', { defaultValue: 'DATE RANGE' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <SegmentedButtons
            value={options.dateRange}
            onValueChange={value => setOptions(prev => ({ ...prev, dateRange: value as any }))}
            buttons={[
              { value: 'week', label: t('common:week', { defaultValue: 'Week' }) },
              { value: 'month', label: t('common:month', { defaultValue: 'Month' }) },
              { value: 'year', label: t('common:year', { defaultValue: 'Year' }) },
              { value: 'all', label: t('common:all', { defaultValue: 'All' }) }
            ]}
            style={{ marginBottom: 8 }}
          />
          
          <List.Item
            title={t('settings.health.export.customRange', { defaultValue: 'Custom Range' })}
            description={options.dateRange === 'custom' ? getDateRangeText() : 'Select specific dates'}
            onPress={() => {
              setOptions(prev => ({ ...prev, dateRange: 'custom' }));
              setShowDatePicker('start');
            }}
            left={props => <List.Icon {...props} icon="calendar-range" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Data Types */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.export.dataTypes', { defaultValue: 'DATA TYPES' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          {dataTypes.map((dataType, index) => (
            <React.Fragment key={dataType.id}>
              {index > 0 && <Divider />}
              <List.Item
                title={dataType.name}
                description={`${dataType.description} • ${dataType.recordCount} records`}
                onPress={() => handleDataTypeToggle(dataType.id)}
                left={() => (
                  <Checkbox
                    status={options.dataTypes.includes(dataType.id) ? 'checked' : 'unchecked'}
                    onPress={() => handleDataTypeToggle(dataType.id)}
                  />
                )}
              />
            </React.Fragment>
          ))}
        </View>

        {/* Export Options */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.export.options', { defaultValue: 'OPTIONS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.export.includeDevice', { defaultValue: 'Include Device Information' })}
            description={t('settings.health.export.includeDeviceDesc', { 
              defaultValue: 'Export device details with measurements' 
            })}
            onPress={() => setOptions(prev => ({ ...prev, includeDeviceInfo: !prev.includeDeviceInfo }))}
            left={() => (
              <Checkbox
                status={options.includeDeviceInfo ? 'checked' : 'unchecked'}
                onPress={() => setOptions(prev => ({ ...prev, includeDeviceInfo: !prev.includeDeviceInfo }))}
              />
            )}
          />
          <Divider />
          <List.Item
            title={t('settings.health.export.anonymize', { defaultValue: 'Anonymize Data' })}
            description={t('settings.health.export.anonymizeDesc', { 
              defaultValue: 'Remove personal identifiers from export' 
            })}
            onPress={() => setOptions(prev => ({ ...prev, anonymize: !prev.anonymize }))}
            left={() => (
              <Checkbox
                status={options.anonymize ? 'checked' : 'unchecked'}
                onPress={() => setOptions(prev => ({ ...prev, anonymize: !prev.anonymize }))}
              />
            )}
          />
        </View>

        {/* Summary Card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Card mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 8 }}>
                {t('settings.health.export.summary', { defaultValue: 'Export Summary' })}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text variant="bodyMedium">{t('common:format', { defaultValue: 'Format' })}</Text>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                  {options.format.toUpperCase()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text variant="bodyMedium">{t('common:dateRange', { defaultValue: 'Date Range' })}</Text>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                  {getDateRangeText()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text variant="bodyMedium">{t('common:dataTypes', { defaultValue: 'Data Types' })}</Text>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                  {options.dataTypes.length} selected
                </Text>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="titleSmall">{t('common:totalRecords', { defaultValue: 'Total Records' })}</Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold', color: paperTheme.colors.primary }}>
                  {getTotalRecords().toLocaleString()}
                </Text>
              </View>
            </Card.Content>
          </Card>
        </View>

        {/* Export Button */}
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <Button
            mode="contained"
            onPress={handleExport}
            loading={exporting}
            disabled={exporting || options.dataTypes.length === 0}
            icon="export"
          >
            {t('settings.health.export.exportNow', { defaultValue: 'Export Now' })}
          </Button>
        </View>

        {exporting && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <ProgressBar progress={exportProgress} color={paperTheme.colors.primary} />
            <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 8, opacity: 0.6 }}>
              {t('settings.health.export.exporting', { 
                defaultValue: `Exporting... ${Math.round(exportProgress * 100)}%` 
              })}
            </Text>
          </View>
        )}

        {/* Date Pickers */}
        {showDatePicker && Platform.OS !== 'web' && (
          <DateTimePicker
            value={showDatePicker === 'start' ? (options.startDate || new Date()) : (options.endDate || new Date())}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(null);
              if (selectedDate) {
                if (showDatePicker === 'start') {
                  setOptions(prev => ({ ...prev, startDate: selectedDate }));
                  setShowDatePicker('end');
                } else {
                  setOptions(prev => ({ ...prev, endDate: selectedDate }));
                }
              }
            }}
          />
        )}

        {/* Preview Dialog */}
        <Portal>
          <Dialog visible={previewDialogVisible} onDismiss={() => setPreviewDialogVisible(false)}>
            <Dialog.Title>
              {t('settings.health.export.preview', { defaultValue: 'Export Preview' })}
            </Dialog.Title>
            <Dialog.ScrollArea style={{ maxHeight: 300 }}>
              <ScrollView>
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 }}>
                  {exportData.substring(0, 1000)}
                  {exportData.length > 1000 && '\n...'}
                </Text>
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={() => setPreviewDialogVisible(false)}>
                {t('common:cancel')}
              </Button>
              <Button onPress={handleShare} icon="share">
                {t('common:share', { defaultValue: 'Share' })}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}