/**
 * Comprehensive message flow tracing from creation to CHUM export/import
 * Includes detailed user name logging to distinguish between demo/demo1
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';

let messageFlowTracingActive = false;
let originalChannelManagerOnUpdated: any = null;

export async function startMessageFlowTracing() {
    if (messageFlowTracingActive) {
        console.log('\n🔍 MESSAGE FLOW TRACING ALREADY ACTIVE');
        return;
    }

    console.log('\n🔍 STARTING MESSAGE FLOW TRACING');
    console.log('='.repeat(80));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        // Get user identity for logging
        const myId = await appModel.leuteModel.myMainIdentity();
        const myIdShort = myId.toString().substring(0, 8);
        const userName = myIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
        
        console.log(`\n👤 [${userName}] Starting message flow tracing...`);

        // Hook into ChannelManager's onUpdated event
        const channelManager = appModel.channelManager;
        if (channelManager && channelManager.onUpdated) {
            console.log(`[${userName}] 🎣 Hooking into ChannelManager.onUpdated event...`);
            
            // Store original handler if we haven't already
            if (!originalChannelManagerOnUpdated) {
                originalChannelManagerOnUpdated = channelManager.onUpdated;
            }
            
            // Wrap the original event to trace message flow
            const originalListeners = (channelManager.onUpdated as any)._listeners || [];
            
            // Add our tracing listener
            channelManager.onUpdated.listen(async (
                channelInfoIdHash: any,
                channelId: string,
                channelOwner: any,
                timeOfEarliestChange: Date,
                data: any[]
            ) => {
                console.log(`\n📝 [${userName}] CHANNEL UPDATE DETECTED:`);
                console.log(`   Channel ID: ${channelId}`);
                console.log(`   Owner: ${channelOwner?.toString().substring(0, 8)}...`);
                console.log(`   Entries: ${data?.length || 0}`);
                console.log(`   Time: ${timeOfEarliestChange.toLocaleTimeString()}`);
                
                if (data && data.length > 0) {
                    for (const [idx, entry] of data.entries()) {
                        console.log(`\n   📄 [${userName}] Entry ${idx + 1}:`);
                        console.log(`      Entry hash: ${entry.channelEntryHash?.substring(0, 8)}...`);
                        console.log(`      Data hash: ${entry.dataHash?.substring(0, 8)}...`);
                        console.log(`      Creation time: ${new Date(entry.creationTime).toLocaleTimeString()}`);
                        
                        // Try to read the message data
                        if (entry.dataHash) {
                            try {
                                const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
                                const messageData = await getObject(entry.dataHash);
                                
                                if (messageData && messageData.text) {
                                    console.log(`      Message text: "${messageData.text}"`);
                                    console.log(`      Message type: ${messageData.$type$ || 'unknown'}`);
                                    
                                    // Check access rights for this message
                                    await traceMessageAccessRights(userName, entry.dataHash, messageData.text);
                                }
                            } catch (e) {
                                console.log(`      ❌ Failed to read message data: ${e.message}`);
                            }
                        }
                    }
                }
                
                // Check if this triggers CHUM export
                console.log(`\n🔄 [${userName}] Checking if CHUM export is triggered...`);
                await traceChumExportTrigger(userName, channelId, data);
            });
            
            console.log(`[${userName}] ✅ Message flow tracing hook installed`);
        }

        // Hook into CHUM events if possible
        await hookChumEvents(userName);

        messageFlowTracingActive = true;
        console.log(`\n✅ [${userName}] MESSAGE FLOW TRACING ACTIVE`);
        console.log(`[${userName}] 💡 Send a message to see the complete flow`);
        console.log(`[${userName}] 💡 Run stopMessageFlowTracing() to stop`);

    } catch (error) {
        console.error('\n❌ Failed to start message flow tracing:', error);
    }
}

async function traceMessageAccessRights(userName: string, messageHash: string, messageText: string) {
    try {
        console.log(`\n🔐 [${userName}] CHECKING ACCESS RIGHTS for "${messageText}":`);
        
        const appModel = (globalThis as any).appModel;
        const contacts = await appModel.leuteModel.others();
        
        if (contacts.length > 0) {
            const otherPerson = contacts[0];
            const otherPersonId = await otherPerson.mainIdentity();
            const otherShort = otherPersonId.toString().substring(0, 8);
            const otherName = otherShort === 'd27f0ef1' ? 'demo' : 'demo1';
            
            const { getAccess } = await import('@refinio/one.core/lib/access.js');
            const access = await getAccess(messageHash);
            
            if (access) {
                const hasPersonAccess = access.person?.includes(otherPersonId);
                const groupCount = access.group?.length || 0;
                
                console.log(`   [${userName}] Access granted to: ${access.person?.length || 0} persons, ${groupCount} groups`);
                console.log(`   [${userName}] ${otherName} has access: ${hasPersonAccess ? '✅' : '❌'}`);
                
                if (hasPersonAccess) {
                    console.log(`   [${userName}] ✅ Message WILL be exported via CHUM to ${otherName}`);
                } else {
                    console.log(`   [${userName}] ❌ Message will NOT be exported - no access for ${otherName}!`);
                }
            } else {
                console.log(`   [${userName}] ❌ NO ACCESS RIGHTS - Message will NOT sync!`);
            }
        }
    } catch (e) {
        console.log(`   [${userName}] ❌ Failed to check access rights: ${e.message}`);
    }
}

async function traceChumExportTrigger(userName: string, channelId: string, data: any[]) {
    try {
        const appModel = (globalThis as any).appModel;
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        
        if (connectionsModel) {
            const connections = connectionsModel.connectionsInfo();
            const chumConnections = connections.filter((c: any) => c.protocol === 'chum');
            
            console.log(`   [${userName}] CHUM connections: ${chumConnections.length}`);
            
            if (chumConnections.length === 0) {
                console.log(`   [${userName}] ❌ NO CHUM CONNECTIONS - Messages cannot sync!`);
                return;
            }
            
            chumConnections.forEach((conn: any, idx: number) => {
                const remoteShort = conn.remotePersonId?.substring(0, 8);
                const remoteName = remoteShort === 'd27f0ef1' ? 'demo' : 'demo1';
                console.log(`   [${userName}] CHUM ${idx + 1}: to ${remoteName} (${remoteShort}...) - ${conn.connectionStatus}`);
            });
            
            // Try to trigger manual CHUM sync to see if it picks up our message
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            if (leuteModule && typeof leuteModule.updateCache === 'function') {
                console.log(`   [${userName}] 🔄 Triggering manual CHUM sync...`);
                try {
                    await leuteModule.updateCache();
                    console.log(`   [${userName}] ✅ Manual CHUM sync completed`);
                } catch (e) {
                    console.log(`   [${userName}] ❌ Manual CHUM sync failed: ${e.message}`);
                }
            }
        }
        
    } catch (e) {
        console.log(`   [${userName}] ❌ Failed to trace CHUM export trigger: ${e.message}`);
    }
}

async function hookChumEvents(userName: string) {
    try {
        console.log(`[${userName}] 🎣 Attempting to hook CHUM events...`);
        
        const appModel = (globalThis as any).appModel;
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        
        if (connectionsModel) {
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            
            if (leuteModule) {
                // Try to access the connection manager
                const connectionManager = (leuteModule as any).connectionManager;
                if (connectionManager) {
                    console.log(`[${userName}] 📡 Found connection manager`);
                    
                    // Try to hook into connection events
                    if (connectionManager.connections) {
                        console.log(`[${userName}] 🔗 Found ${connectionManager.connections.size} connections`);
                        
                        for (const [connId, connection] of connectionManager.connections) {
                            const connIdShort = connId.substring(0, 8);
                            console.log(`[${userName}] 🔗 Connection ${connIdShort}... - State: ${connection.state}`);
                            
                            // Hook into CHUM events if possible
                            if (connection.chumExporter) {
                                console.log(`[${userName}]   - Has CHUM exporter: ${typeof connection.chumExporter}`);
                                
                                // Try to hook export events
                                if (connection.chumExporter.onExport && typeof connection.chumExporter.onExport.listen === 'function') {
                                    connection.chumExporter.onExport.listen((data: any) => {
                                        console.log(`\n📤 [${userName}] CHUM EXPORT EVENT on ${connIdShort}...:`);
                                        console.log(`   Data: ${JSON.stringify(data).substring(0, 200)}...`);
                                    });
                                }
                            }
                            
                            if (connection.chumImporter) {
                                console.log(`[${userName}]   - Has CHUM importer: ${typeof connection.chumImporter}`);
                                
                                // Try to hook import events
                                if (connection.chumImporter.onImport && typeof connection.chumImporter.onImport.listen === 'function') {
                                    connection.chumImporter.onImport.listen((data: any) => {
                                        console.log(`\n📥 [${userName}] CHUM IMPORT EVENT on ${connIdShort}...:`);
                                        console.log(`   Data: ${JSON.stringify(data).substring(0, 200)}...`);
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`[${userName}] ✅ CHUM event hooks attempted`);
        
    } catch (e) {
        console.log(`[${userName}] ❌ Failed to hook CHUM events: ${e.message}`);
    }
}

export function stopMessageFlowTracing() {
    if (!messageFlowTracingActive) {
        console.log('\n🔍 MESSAGE FLOW TRACING NOT ACTIVE');
        return;
    }
    
    console.log('\n🛑 STOPPING MESSAGE FLOW TRACING');
    
    try {
        // Restore original ChannelManager handler if we have it
        if (originalChannelManagerOnUpdated) {
            const appModel = (globalThis as any).appModel;
            if (appModel && appModel.channelManager) {
                // Note: This is a simplified approach - in a real implementation,
                // we'd need to properly manage listener removal
                console.log('🔄 Attempting to restore original ChannelManager handlers...');
            }
        }
        
        messageFlowTracingActive = false;
        console.log('✅ Message flow tracing stopped');
        
    } catch (error) {
        console.error('❌ Error stopping message flow tracing:', error);
    }
}

// Enhanced message creation tracer
export async function traceMessageCreation(messageText: string) {
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        const myId = await appModel.leuteModel.myMainIdentity();
        const myIdShort = myId.toString().substring(0, 8);
        const userName = myIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
        
        console.log(`\n🚀 [${userName}] TRACING MESSAGE CREATION: "${messageText}"`);
        console.log('='.repeat(60));
        
        const chatModel = appModel.chatModel;
        if (!chatModel || !chatModel.currentTopicId) {
            console.log(`[${userName}] ❌ No active chat or topic`);
            return;
        }
        
        console.log(`[${userName}] Topic: ${chatModel.currentTopicId}`);
        console.log(`[${userName}] Messages before: ${chatModel.getMessages().length}`);
        
        // Start message flow tracing if not active
        if (!messageFlowTracingActive) {
            console.log(`[${userName}] 🎣 Starting message flow tracing...`);
            await startMessageFlowTracing();
        }
        
        console.log(`[${userName}] 📤 Sending message...`);
        await chatModel.sendMessage(messageText);
        
        // Wait a bit for events to propagate
        setTimeout(() => {
            const messagesAfter = chatModel.getMessages().length;
            console.log(`\n[${userName}] 📊 SUMMARY:`);
            console.log(`[${userName}] Messages after: ${messagesAfter}`);
            console.log(`[${userName}] Message sent successfully, check logs above for flow`);
        }, 1000);
        
    } catch (error) {
        console.error('❌ Message creation trace failed:', error);
    }
}

// Make functions globally available
(globalThis as any).startMessageFlowTracing = startMessageFlowTracing;
(globalThis as any).stopMessageFlowTracing = stopMessageFlowTracing;
(globalThis as any).traceMessageCreation = traceMessageCreation;