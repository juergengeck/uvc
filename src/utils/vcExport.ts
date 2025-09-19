/**
 * VC Export utilities for chat messages
 * 
 * Enables exporting chat messages and conversations as Verifiable Credentials
 * for sharing with third parties (notaries, legal entities) via group chats.
 */

import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Profile } from '@refinio/one.core/lib/recipes.js';
import type { VCModel, VerifiableCredential } from '@refinio/one.vc';
import type { ChatModel } from '../models/chat/ChatModel';
import type { AppModel } from '../models/AppModel';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';

/**
 * Export options for VC creation
 */
export interface VCExportOptions {
    includeAttachments?: boolean;
    includePairingInfo?: boolean;
    purpose?: string; // e.g., "legal-evidence", "notarization"
}

/**
 * Notary interaction in group chat
 */
export interface NotaryRequest {
    requestId: string;
    requestor: SHA256IdHash<Profile>;
    notary: SHA256IdHash<Profile>;
    credentialHash: SHA256Hash<VerifiableCredential>;
    purpose: string;
    requestedAt: string;
}

/**
 * Export a single message as a VC and share in group chat
 */
export async function exportAndShareMessageVC(
    message: ChatMessage & { idHash: SHA256Hash<ChatMessage> },
    chatModel: ChatModel,
    vcModel: VCModel,
    notaryProfile: SHA256IdHash<Profile>,
    options: VCExportOptions = {}
): Promise<SHA256Hash<VerifiableCredential>> {
    // Get current topic context
    const topicId = chatModel.currentTopic;
    if (!topicId) {
        throw new Error('No active chat topic');
    }
    
    // Get pairing information if available
    const pairingId = await getPairingIdForTopic(topicId, chatModel);
    
    // Export message as VC
    const vc = await vcModel.exportChatMessageAsVC(message, {
        topicId,
        channelId: topicId,
        pairingId: options.includePairingInfo ? pairingId : undefined
    });
    
    // Store the VC
    const vcHash = await storeUnversionedObject(vc);
    
    // Create or join notary group chat
    const notaryGroupTopic = await createNotaryGroupChat(
        chatModel,
        notaryProfile,
        options.purpose || 'notarization'
    );
    
    // Share VC in group chat
    await shareVCInGroupChat(
        chatModel,
        notaryGroupTopic,
        vcHash as SHA256Hash<VerifiableCredential>,
        `Please notarize this message from ${new Date(message.creationTime || Date.now()).toLocaleString()}`
    );
    
    return vcHash as SHA256Hash<VerifiableCredential>;
}

/**
 * Export entire conversation and share with notary
 */
export async function exportAndShareConversationVC(
    messages: Array<ChatMessage & { idHash: SHA256Hash<ChatMessage> }>,
    chatModel: ChatModel,
    vcModel: VCModel,
    notaryProfile: SHA256IdHash<Profile>,
    options: VCExportOptions = {}
): Promise<SHA256Hash<VerifiableCredential>> {
    const topicId = chatModel.currentTopic;
    if (!topicId) {
        throw new Error('No active chat topic');
    }
    
    // Get participants
    const participants = await getTopicParticipants(topicId, chatModel);
    
    // Export conversation as VC
    const vc = await vcModel.exportConversationAsVC(messages, {
        topicId,
        participants,
        purpose: options.purpose || 'legal-evidence'
    });
    
    // Store the VC
    const vcHash = await storeUnversionedObject(vc);
    
    // Create or join notary group chat
    const notaryGroupTopic = await createNotaryGroupChat(
        chatModel,
        notaryProfile,
        options.purpose || 'conversation-notarization'
    );
    
    // Share in group chat with context
    await shareVCInGroupChat(
        chatModel,
        notaryGroupTopic,
        vcHash as SHA256Hash<VerifiableCredential>,
        `Please notarize this conversation:\n` +
        `- Topic: ${topicId}\n` +
        `- Messages: ${messages.length}\n` +
        `- Period: ${messages[0]?.creationTime} to ${messages[messages.length-1]?.creationTime}\n` +
        `- Purpose: ${options.purpose || 'legal record'}`
    );
    
    return vcHash as SHA256Hash<VerifiableCredential>;
}

/**
 * Create or get existing notary group chat
 */
async function createNotaryGroupChat(
    chatModel: ChatModel,
    notaryProfile: SHA256IdHash<Profile>,
    purpose: string
): Promise<string> {
    // Group topic format: "notary:<notary-id>:<requester-id>:<purpose>"
    const myProfile = await chatModel.getLeuteModel().getMyProfile();
    const groupTopicId = `notary:${notaryProfile}:${myProfile.idHash}:${purpose}`;
    
    // Enter the group topic (will create if doesn't exist)
    await chatModel.enterTopicRoom(groupTopicId);
    
    // Send initial message if new group
    const messages = chatModel.getMessages();
    if (messages.length === 0) {
        await chatModel.sendMessage(
            `Notarization request group created\n` +
            `Purpose: ${purpose}\n` +
            `Notary: ${notaryProfile}\n` +
            `Requester: ${myProfile.idHash}`
        );
    }
    
    return groupTopicId;
}

/**
 * Share a VC in the group chat
 */
async function shareVCInGroupChat(
    chatModel: ChatModel,
    groupTopicId: string,
    vcHash: SHA256Hash<VerifiableCredential>,
    message: string
): Promise<void> {
    // Switch to group chat
    await chatModel.setTopic(groupTopicId);
    
    // Create message with VC reference
    const vcMessage = 
        `${message}\n\n` +
        `Verifiable Credential: ${vcHash}\n` +
        `Access: one://vc/${vcHash}\n\n` +
        `To verify this credential:\n` +
        `1. Retrieve using the hash above\n` +
        `2. Verify signature and claims\n` +
        `3. Reply with your attestation`;
    
    // Send as attachment for better handling
    await chatModel.sendMessageWithAttachments(
        vcMessage,
        [vcHash] // VC hash as attachment
    );
}

/**
 * Process notary response in group chat
 */
export async function processNotaryResponse(
    message: ChatMessage,
    chatModel: ChatModel,
    appModel: AppModel
): Promise<void> {
    // Check if message contains notary attestation
    if (message.text.includes('NOTARIZED:') || message.text.includes('ATTESTED:')) {
        // Extract VC hash from message
        const vcHashMatch = message.text.match(/VC:\s*([a-f0-9]+)/i);
        if (vcHashMatch) {
            const vcHash = vcHashMatch[1] as SHA256Hash<VerifiableCredential>;
            
            // Store notary attestation
            await storeNotaryAttestation(
                vcHash,
                message.sender,
                message.text,
                appModel
            );
            
            console.log(`[VCExport] Notary attestation received for VC ${vcHash}`);
        }
    }
}

/**
 * Store notary attestation for audit
 */
async function storeNotaryAttestation(
    vcHash: SHA256Hash<VerifiableCredential>,
    notaryProfile: SHA256IdHash<Profile>,
    attestation: string,
    appModel: AppModel
): Promise<void> {
    // In real implementation, would create an attestation object
    // and link it to the original VC
    const attestationRecord = {
        $type$: 'NotaryAttestation',
        vcHash,
        notary: notaryProfile,
        attestation,
        attestedAt: new Date().toISOString()
    };
    
    await storeUnversionedObject(attestationRecord);
}

/**
 * Helper to get pairing ID for a topic
 */
async function getPairingIdForTopic(
    topicId: string,
    chatModel: ChatModel
): Promise<string | undefined> {
    // For 1:1 chats, derive pairing ID from topic
    if (topicId.includes('<->')) {
        const participants = topicId.split('<->');
        const myId = await chatModel.getLeuteModel().myMainIdentity();
        const otherId = participants.find(p => p !== myId);
        
        if (otherId) {
            // In real implementation, would look up actual pairing record
            return `pair:${myId}:${otherId}`;
        }
    }
    
    return undefined;
}

/**
 * Helper to get topic participants
 */
async function getTopicParticipants(
    topicId: string,
    chatModel: ChatModel
): Promise<SHA256IdHash<Profile>[]> {
    const participants: SHA256IdHash<Profile>[] = [];
    
    // For 1:1 chats
    if (topicId.includes('<->')) {
        const parts = topicId.split('<->');
        // Participants are Person IDs, need to get their Profiles
        // In real implementation, would look up Profile for each Person
        return parts as SHA256IdHash<Profile>[];
    }
    
    // For group chats, would query topic members
    // For now, return current user
    const myProfile = await chatModel.getLeuteModel().getMyProfile();
    return [myProfile.idHash];
}

/**
 * Example usage in UI:
 * 
 * // In message context menu
 * const handleNotarize = async (message: ChatMessage) => {
 *   const notaryProfile = await selectNotary(); // UI to choose notary
 *   
 *   const vcHash = await exportAndShareMessageVC(
 *     message,
 *     chatModel,
 *     vcModel,
 *     notaryProfile,
 *     {
 *       includePairingInfo: true,
 *       purpose: 'legal-evidence'
 *     }
 *   );
 *   
 *   // UI feedback
 *   showToast(`Message shared with notary. VC: ${vcHash}`);
 * };
 * 
 * // For entire conversation
 * const handleNotarizeConversation = async () => {
 *   const messages = chatModel.getMessages();
 *   const notaryProfile = await selectNotary();
 *   
 *   const vcHash = await exportAndShareConversationVC(
 *     messages,
 *     chatModel,
 *     vcModel,
 *     notaryProfile,
 *     {
 *       purpose: 'contract-negotiation'
 *     }
 *   );
 *   
 *   showToast(`Conversation shared with notary in group chat`);
 * };
 */