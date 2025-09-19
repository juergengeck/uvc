/**
 * Comprehensive CHUM export/import tracing to debug message sync
 * Includes user names (demo/demo1) to distinguish between devices
 */

export async function traceChumExportImport() {
    console.log('\n🔍 TRACE CHUM EXPORT/IMPORT - Why messages don\'t sync between devices');
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
        const userName = myIdShort === '3b506fa9' ? 'demo' : 'demo1'; // Distinguish users
        
        console.log(`\n👤 USER: ${userName} (${myIdShort}...)`);

        // 1. Check what messages we have locally
        console.log('\n1️⃣ LOCAL MESSAGES:');
        const chatModel = appModel.chatModel;
        if (chatModel && chatModel.currentTopicId) {
            const messages = chatModel.getMessages();
            console.log(`   [${userName}] Topic: ${chatModel.currentTopicId}`);
            console.log(`   [${userName}] Messages: ${messages.length}`);
            
            messages.forEach((msg, idx) => {
                console.log(`   [${userName}] Msg ${idx + 1}: "${msg.text}" (${msg.hash?.substring(0, 8)}..., ${new Date(msg.timestamp).toLocaleTimeString()})`);
            });
        }

        // 2. Hook into CHUM exporter to see what's being exported
        console.log('\n2️⃣ CHUM EXPORTER TRACING:');
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        if (connectionsModel) {
            // Try to access the CHUM exporter
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            if (leuteModule) {
                console.log(`   [${userName}] LeuteConnectionsModule found`);
                
                // Check for CHUM connections
                const connections = connectionsModel.connectionsInfo();
                const chumConnections = connections.filter(c => c.protocol === 'chum');
                console.log(`   [${userName}] CHUM connections: ${chumConnections.length}`);
                
                chumConnections.forEach((conn, idx) => {
                    const remoteShort = conn.remotePersonId?.substring(0, 8);
                    const remoteName = remoteShort === '3b506fa9' ? 'demo' : 'demo1';
                    console.log(`   [${userName}] CHUM ${idx + 1}: to ${remoteName} (${remoteShort}...) - ${conn.connectionStatus}`);
                });

                // Try to access the actual connections and their exporters
                if (typeof leuteModule.connectionManager === 'object') {
                    console.log(`   [${userName}] Connection manager found`);
                    
                    // Access connections map
                    const connectionsMap = (leuteModule.connectionManager as any).connections;
                    if (connectionsMap) {
                        console.log(`   [${userName}] Active connections: ${connectionsMap.size}`);
                        
                        for (const [connId, connection] of connectionsMap) {
                            console.log(`   [${userName}] Connection ${connId.substring(0, 8)}... - ${connection.state}`);
                            
                            // Check for CHUM exporter
                            if (connection.chumExporter) {
                                console.log(`   [${userName}]   - Has CHUM exporter: ${typeof connection.chumExporter}`);
                            }
                            if (connection.chumImporter) {
                                console.log(`   [${userName}]   - Has CHUM importer: ${typeof connection.chumImporter}`);
                            }
                        }
                    }
                }
            }
        }

        // 3. Check access rights for current messages
        console.log('\n3️⃣ ACCESS RIGHTS FOR MESSAGES:');
        if (chatModel && chatModel.currentTopicId) {
            const messages = chatModel.getMessages();
            const contacts = await appModel.leuteModel.others();
            
            if (contacts.length > 0) {
                const otherPerson = contacts[0];
                const otherPersonId = await otherPerson.mainIdentity();
                const otherShort = otherPersonId.toString().substring(0, 8);
                const otherName = otherShort === '3b506fa9' ? 'demo' : 'demo1';
                
                console.log(`   [${userName}] Checking access for: ${otherName} (${otherShort}...)`);
                
                for (const [idx, msg] of messages.slice(-3).entries()) {
                    console.log(`\n   [${userName}] Message ${idx + 1}: "${msg.text}"`);
                    
                    if (msg.hash) {
                        try {
                            const { getAccess } = await import('@refinio/one.core/lib/access.js');
                            const access = await getAccess(msg.hash);
                            
                            if (access) {
                                const hasPersonAccess = access.person?.includes(otherPersonId);
                                const groupCount = access.group?.length || 0;
                                
                                console.log(`   [${userName}]   Access: ${access.person?.length || 0} persons, ${groupCount} groups`);
                                console.log(`   [${userName}]   ${otherName} has access: ${hasPersonAccess ? '✅' : '❌'}`);
                                
                                if (!hasPersonAccess) {
                                    console.log(`   [${userName}]   🚨 MESSAGE WON'T BE EXPORTED - NO ACCESS FOR ${otherName}!`);
                                }
                            } else {
                                console.log(`   [${userName}]   ❌ NO ACCESS RIGHTS - WON'T SYNC!`);
                            }
                        } catch (e) {
                            console.log(`   [${userName}]   ❌ Access check failed: ${e.message}`);
                        }
                    }
                }
            }
        }

        // 4. Monitor CHUM events in real-time
        console.log('\n4️⃣ MONITORING CHUM EVENTS:');
        
        // Try to hook into CHUM events if possible
        if (connectionsModel) {
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            if (leuteModule && typeof leuteModule.on === 'function') {
                console.log(`   [${userName}] Setting up CHUM event listeners...`);
                
                // Listen for export events
                try {
                    leuteModule.on('export', (data: any) => {
                        console.log(`   [${userName}] 📤 CHUM EXPORT: ${JSON.stringify(data).substring(0, 100)}...`);
                    });
                } catch (e) {
                    console.log(`   [${userName}] Could not set export listener: ${e.message}`);
                }
                
                // Listen for import events
                try {
                    leuteModule.on('import', (data: any) => {
                        console.log(`   [${userName}] 📥 CHUM IMPORT: ${JSON.stringify(data).substring(0, 100)}...`);
                    });
                } catch (e) {
                    console.log(`   [${userName}] Could not set import listener: ${e.message}`);
                }
            }
        }

        // 5. Force manual sync to see what happens
        console.log('\n5️⃣ FORCING MANUAL SYNC:');
        if (connectionsModel) {
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            if (leuteModule && typeof leuteModule.updateCache === 'function') {
                console.log(`   [${userName}] Calling updateCache to force sync...`);
                try {
                    await leuteModule.updateCache();
                    console.log(`   [${userName}] ✅ updateCache completed`);
                } catch (e) {
                    console.log(`   [${userName}] ❌ updateCache failed: ${e.message}`);
                }
            }
        }

        // 6. Summary
        console.log(`\n6️⃣ SUMMARY FOR ${userName}:`);
        console.log(`   [${userName}] - Check if messages have access rights for other user`);
        console.log(`   [${userName}] - Verify CHUM connections are established`);
        console.log(`   [${userName}] - Monitor CHUM export/import events`);
        console.log(`   [${userName}] - Next: Send a message and watch the export process`);

    } catch (error) {
        console.error('\n❌ Trace failed:', error);
    }
}

// Enhanced message sending tracer
export async function traceSendMessage(messageText: string) {
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        const myId = await appModel.leuteModel.myMainIdentity();
        const myIdShort = myId.toString().substring(0, 8);
        const userName = myIdShort === '3b506fa9' ? 'demo' : 'demo1';
        
        console.log(`\n📤 [${userName}] SENDING MESSAGE: "${messageText}"`);
        console.log('='.repeat(50));
        
        // Send the message
        const chatModel = appModel.chatModel;
        if (chatModel) {
            console.log(`   [${userName}] Before send - Current messages: ${chatModel.getMessages().length}`);
            
            await chatModel.sendMessage(messageText);
            
            console.log(`   [${userName}] After send - Current messages: ${chatModel.getMessages().length}`);
            
            // Check if message got access rights
            setTimeout(async () => {
                const messages = chatModel.getMessages();
                const lastMessage = messages[messages.length - 1];
                
                if (lastMessage && lastMessage.text === messageText) {
                    console.log(`   [${userName}] Message sent successfully: ${lastMessage.hash?.substring(0, 8)}...`);
                    
                    // Check access rights for this message
                    if (lastMessage.hash) {
                        try {
                            const { getAccess } = await import('@refinio/one.core/lib/access.js');
                            const access = await getAccess(lastMessage.hash);
                            
                            if (access) {
                                console.log(`   [${userName}] Message access: ${access.person?.length || 0} persons, ${access.group?.length || 0} groups`);
                            } else {
                                console.log(`   [${userName}] ❌ NO ACCESS RIGHTS FOR MESSAGE!`);
                            }
                        } catch (e) {
                            console.log(`   [${userName}] Access check failed: ${e.message}`);
                        }
                    }
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Send message trace failed:', error);
    }
}

// Make functions globally available
(globalThis as any).traceChumExportImport = traceChumExportImport;
(globalThis as any).traceSendMessage = traceSendMessage;