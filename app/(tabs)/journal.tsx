import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, useTheme, IconButton, Button, Card } from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { useRouter, Stack } from 'expo-router';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import type { JournalEntry } from '@src/recipes/JournalRecipes';
import ErrorView from '@src/components/ErrorView';
import CalendarScreen from '../(screens)/calendar';
import { LoadingSpinner } from '@src/components/LoadingSpinner';
import { Namespaces } from '@src/i18n/namespaces';
import { routes } from '@src/config/routes';
import { ActionButton } from '@src/components/common/ActionButton';

export default function JournalScreen() {
    const { instance, isAuthenticated } = useInstance();
    const { t: tJournal } = useTranslation(Namespaces.JOURNAL);
    const { t: tNav } = useTranslation(Namespaces.NAVIGATION);
    const theme = useTheme();
    const { styles: themedStyles } = useAppTheme();
    const router = useRouter();

    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [modelState, setModelState] = useState<'initializing' | 'ready' | 'error'>('initializing');
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);

    // Handle errors
    const handleError = useCallback((error: Error) => {
        console.error('[JournalScreen] Error:', error);
        setError(error);
        setModelState('error');
    }, []);

    // Single function to load journal data
    const loadJournalData = useCallback(async () => {
        try {
            if (!instance?.journalModel?.retrieveLatestDayEvents) {
                console.log('[JournalScreen] Journal model or retrieveLatestDayEvents not available');
                return;
            }

            console.log('[JournalScreen] Loading journal data');
            setIsLoadingEntries(true);
            
            // Fetch the latest journal entries from JournalModel (includes all registered inputs)
            const latestEvents = await instance.journalModel.retrieveLatestDayEvents();
            console.log('[JournalScreen] Retrieved latest journal events:', latestEvents?.length || 0);
            
            // Handle empty case gracefully
            if (!latestEvents || !latestEvents.length) {
                console.log('[JournalScreen] No journal entries found');
                setEntries([]);
                setIsLoadingEntries(false);
                return;
            }
            
            // Convert to the expected format and update state
            const journalEntries = latestEvents.map(event => {
                // Safely handle the timestamp using creationTime
                let timestamp: number;
                try {
                    // Access the timestamp via event.data.creationTime
                    const eventCreationTime = (event as any)?.data?.creationTime;
                    
                    if (eventCreationTime) {
                        // Handle string or Date objects for creationTime
                        timestamp = typeof eventCreationTime === 'string' 
                            ? new Date(eventCreationTime).getTime() 
                            : eventCreationTime instanceof Date 
                                ? eventCreationTime.getTime() 
                                : typeof eventCreationTime === 'number' // Also handle if it's already a number
                                    ? eventCreationTime
                                    : Date.now(); // Fallback if type is unexpected
                    } else {
                        // Fallback if creationTime is missing
                        console.warn('[JournalScreen] Missing creationTime in event data, using current time.');
                        timestamp = Date.now();
                    }
                } catch (err) {
                    console.warn('[JournalScreen] Error processing creationTime:', err);
                    timestamp = Date.now(); // Fallback on error
                }

                const entry: JournalEntry = {
                    id: (event as any).id || `entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    timestamp, // Keep the processed numeric timestamp
                    data: (event as any).data || event, // Keep the original data object
                    $type$: 'JournalEntry',
                    type: (event as any).type || 'unknown' // Use the type from the event itself
                };
                return entry;
            });
            
            setEntries(journalEntries);
        } catch (error) {
            console.error('[JournalScreen] Error loading journal data:', error);
            handleError(error instanceof Error ? error : new Error(String(error)));
        } finally {
            setIsLoadingEntries(false);
        }
    }, [instance?.journalModel, handleError]);

    // Set up event handlers when model is available
    useEffect(() => {
        if (!instance?.journalModel) {
            console.log('[JournalScreen] No journalModel available');
            return;
        }

        console.log('[JournalScreen] Setting up journal subscriptions');
        
        // Track event listener for cleanup
        let unsubscribeFunction: any = null;
        
        // Check if journal model is already initialized
        const modelStateValue = instance.journalModel.state?.currentState;
        
        if (modelStateValue === 'Initialised') {
            // Model already initialized - set up listener and load data
            console.log('[JournalScreen] Journal model already initialized');
            setModelState('ready');
            
            try {
                // Set up event listener for updates
                unsubscribeFunction = instance.journalModel.onUpdated.listen(function() {
                    console.log('[JournalScreen] Journal update event received');
                    loadJournalData();
                });
                
                // Load initial data
                loadJournalData();
            } catch (error) {
                console.error('[JournalScreen] Error setting up initialized model:', error);
                handleError(error instanceof Error ? error : new Error(String(error)));
            }
        } else {
            // Wait for model to be initialized
            console.log('[JournalScreen] Waiting for journal model to be initialized');
            
            // Check for state changes
            const checkIntervalId = setInterval(() => {
                try {
                    const currentState = instance.journalModel.state?.currentState;
                    if (currentState === 'Initialised') {
                        console.log('[JournalScreen] Journal model became ready');
                        clearInterval(checkIntervalId);
                        setModelState('ready');
                        
                        // Set up event listener
                        try {
                            unsubscribeFunction = instance.journalModel.onUpdated.listen(function() {
                                console.log('[JournalScreen] Journal update event received');
                                loadJournalData();
                            });
                        } catch (listenerError) {
                            console.error('[JournalScreen] Error setting up event listener:', listenerError);
                        }
                        
                        // Load initial data
                        loadJournalData();
                    }
                } catch (checkError) {
                    console.error('[JournalScreen] Error checking model state:', checkError);
                    clearInterval(checkIntervalId);
                    handleError(checkError instanceof Error ? checkError : new Error(String(checkError)));
                }
            }, 500);
            
            // Clean up interval on unmount
            return () => {
                clearInterval(checkIntervalId);
                // Also clean up event listener if it exists
                if (unsubscribeFunction && typeof unsubscribeFunction === 'function') {
                    try {
                        unsubscribeFunction();
                    } catch (error) {
                        console.error('[JournalScreen] Error unsubscribing:', error);
                    }
                }
            };
        }
        
        // Clean up event listener on unmount
        return () => {
            console.log('[JournalScreen] Cleaning up subscriptions');
            if (unsubscribeFunction && typeof unsubscribeFunction === 'function') {
                try {
                    unsubscribeFunction();
                } catch (error) {
                    console.error('[JournalScreen] Error unsubscribing:', error);
                }
            }
        };
    }, [instance?.journalModel, loadJournalData, handleError]);

    const renderItem = useCallback(({ item }: { item: JournalEntry }) => {
        // Extract text or create a summary from the data object
        let titleText = 'Journal Entry';
        let dataObj = item.data;

        // Check if data is a string or object
        if (typeof dataObj === 'string') {
            titleText = dataObj;
        } else if (typeof dataObj === 'object' && dataObj !== null) {
            // If it's an object, look for common text properties or stringify
            if ('text' in dataObj && typeof dataObj.text === 'string') {
                titleText = dataObj.text;
            } else if ('title' in dataObj && typeof dataObj.title === 'string') {
                titleText = dataObj.title;
            } else if ('summary' in dataObj && typeof dataObj.summary === 'string') {
                titleText = dataObj.summary;
            } else {
                // Fallback to stringifying the object, but keep it concise
                try {
                    titleText = JSON.stringify(dataObj);
                    // Limit length to avoid huge strings
                    if (titleText.length > 100) {
                        titleText = titleText.substring(0, 97) + '...';
                    }
                } catch {
                    titleText = '[Complex Object]';
                }
            }
        } else {
            // Fallback for other types (null, undefined, etc.)
            titleText = `Entry Type: ${item.type || 'Unknown'}`;
        }
        
        // Ensure titleText is never empty
        if (!titleText) {
          titleText = `Entry ID: ${item.id.substring(0, 8)}...`;
        }

        return (
            <Card style={styles.card}>
                <Card.Title 
                    title={titleText}
                    titleNumberOfLines={2} // Allow title to wrap
                    subtitle={new Date(item.timestamp).toLocaleString()}
                />
            </Card>
        );
    }, []);

    const handleAddEntry = useCallback(() => {
        const newEntry = {
            id: `entry-${Date.now()}`,
            timestamp: Date.now(),
            data: { text: `Entry at ${new Date().toLocaleString()}` },
            $type$: 'JournalEntry',
            type: 'note'
        } as JournalEntry;
        
        setEntries(current => [...current, newEntry].sort((a, b) => b.timestamp - a.timestamp));
    }, []);

    // Check if we can access the model
    if (!isAuthenticated || !instance) {
        console.log('[JournalScreen] Not authenticated or no instance available, redirecting to login');
        
        // Use effect to redirect to login
        useEffect(() => {
            router.replace(routes.auth.login);
        }, [router]);
        
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <Stack.Screen options={{ 
                    title: tNav('tabs.journal', { defaultValue: 'Journal' })
                }} />
                <View style={styles.centerContent}>
                    <LoadingSpinner
                        message={tJournal('loading.title', { defaultValue: 'Loading' })}
                        subtitle={tJournal('loading.description', { defaultValue: 'Please wait...' })}
                        size="large"
                    />
                </View>
            </View>
        );
    }

    if (modelState === 'error' && error) {
        return <ErrorView error={error} />;
    }

    if (modelState === 'initializing') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <Stack.Screen options={{ 
                    title: tNav('tabs.journal', { defaultValue: 'Journal' }),
                }} />
                <View style={styles.centerContent}>
                    <LoadingSpinner
                        message={tJournal('loading.title', { defaultValue: 'Loading Journal' })}
                        subtitle={tJournal('loading.description', { defaultValue: 'Getting your entries...' })}
                        size="large"
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Stack.Screen 
              options={{ 
                title: tNav('tabs.journal', { defaultValue: 'Journal' })
              }} 
            />
            
            {viewMode === 'list' ? (
                <>
                    <ActionButton
                        title={tJournal('addEntry', { defaultValue: 'Add Entry' })}
                        onPress={handleAddEntry}
                        style={styles.addButton}
                    />
                    {isLoadingEntries ? (
                        <View style={styles.centerContent}>
                            <LoadingSpinner
                                message={tJournal('loading.entries', { defaultValue: 'Loading entries' })}
                                subtitle={tJournal('loading.please_wait', { defaultValue: 'Please wait...' })}
                                size="large"
                            />
                        </View>
                    ) : entries.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text>{tJournal('no_entries')}</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={entries}
                            keyExtractor={item => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={styles.list}
                        />
                    )}
                </>
            ) : (
                <CalendarScreen />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 16,
    },
    list: {
        padding: 16,
    },
    card: {
        marginBottom: 16,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        marginHorizontal: 16,
        marginTop: 16,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
}); 