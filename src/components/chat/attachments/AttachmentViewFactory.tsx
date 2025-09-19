/**
 * Factory for creating attachment view components based on attachment type
 * Following one.leute's factory pattern
 */

import React from 'react';
import type { ChatAttachment, AttachmentViewProps } from '@src/types/attachments';
import { ImageAttachmentView } from './ImageAttachmentView';
import { VideoAttachmentView } from './VideoAttachmentView';
import { AudioAttachmentView } from './AudioAttachmentView';
import { DocumentAttachmentView } from './DocumentAttachmentView';
import { ThinkingAttachmentView } from './ThinkingAttachmentView';
import { UnknownAttachmentView } from './UnknownAttachmentView';

/**
 * Factory function to create appropriate attachment view
 */
export function createAttachmentView(
  attachment: ChatAttachment,
  props?: Partial<AttachmentViewProps>
): React.ReactElement | null {
  const viewProps: AttachmentViewProps = {
    attachment,
    ...props
  };

  switch (attachment.type) {
    case 'image':
      return <ImageAttachmentView {...viewProps} />;
    
    case 'video':
      return <VideoAttachmentView {...viewProps} />;
    
    case 'audio':
      return <AudioAttachmentView {...viewProps} />;
    
    case 'document':
      return <DocumentAttachmentView {...viewProps} />;
    
    case 'thinking':
      return <ThinkingAttachmentView {...viewProps} />;
    
    case 'blob':
      // Determine specific type based on metadata or mime type
      if (attachment.metadata?.mimeType?.startsWith('image/')) {
        return <ImageAttachmentView {...viewProps} />;
      } else if (attachment.metadata?.mimeType?.startsWith('video/')) {
        return <VideoAttachmentView {...viewProps} />;
      } else if (attachment.metadata?.mimeType?.startsWith('audio/')) {
        return <AudioAttachmentView {...viewProps} />;
      } else {
        return <DocumentAttachmentView {...viewProps} />;
      }
    
    case 'clob':
      // For now, treat generic CLOBs as thinking attachments
      return <ThinkingAttachmentView {...viewProps} />;
    
    default:
      return <UnknownAttachmentView {...viewProps} />;
  }
}

/**
 * Create multiple attachment views for a message
 */
export function createAttachmentViews(
  attachments: ChatAttachment[],
  props?: Partial<AttachmentViewProps>
): React.ReactElement[] {
  return attachments
    .map((attachment, index) => {
      const view = createAttachmentView(attachment, {
        ...props,
        key: `attachment-${attachment.hash}-${index}`
      });
      return view;
    })
    .filter((view): view is React.ReactElement => view !== null);
}