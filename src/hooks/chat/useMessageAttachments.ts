/**
 * Hook for loading and managing message attachments
 */

import { useState, useEffect } from 'react';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { ChatAttachment } from '@src/types/attachments';
import { attachmentCache } from '@src/services/chat/AttachmentCache';

/**
 * Hook to load attachments for a message
 */
export function useMessageAttachments(attachmentHashes?: SHA256Hash[]) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachmentHashes || attachmentHashes.length === 0) {
      setAttachments([]);
      return;
    }

    loadAttachments();
  }, [attachmentHashes?.join(',')]); // Use hash string as dependency

  const loadAttachments = async () => {
    if (!attachmentHashes || attachmentHashes.length === 0) return;

    try {
      setLoading(true);
      setError(null);

      // Load all attachments in parallel
      const loadPromises = attachmentHashes.map(hash => 
        attachmentCache.getAttachment(hash)
      );

      const results = await Promise.all(loadPromises);
      
      // Filter out null results
      const validAttachments = results.filter(
        (att): att is ChatAttachment => att !== null
      );

      setAttachments(validAttachments);
    } catch (err) {
      console.error('[useMessageAttachments] Failed to load attachments:', err);
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  return {
    attachments,
    loading,
    error,
    reload: loadAttachments
  };
}

/**
 * Hook to load a single attachment
 */
export function useAttachment(hash?: SHA256Hash) {
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) {
      setAttachment(null);
      return;
    }

    loadAttachment();
  }, [hash]);

  const loadAttachment = async () => {
    if (!hash) return;

    try {
      setLoading(true);
      setError(null);

      const result = await attachmentCache.getAttachment(hash);
      setAttachment(result);
    } catch (err) {
      console.error(`[useAttachment] Failed to load attachment ${hash}:`, err);
      setError('Failed to load attachment');
      setAttachment(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    attachment,
    loading,
    error,
    reload: loadAttachment
  };
}