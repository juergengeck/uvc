export interface TopicListItem {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  participants: string[];
  participantCount: number;
  isAITopic?: boolean;
  loading?: boolean;
  isSystemTopic?: boolean;
} 