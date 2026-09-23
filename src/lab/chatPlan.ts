import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { createChatNotifications } from './chatNotifications.ts';
import type { ChatNotification } from './chatNotifications.ts';

interface ChatEntry {
  channelParticipants: string;
  channelEntryHash: string;
  creationTime: Date;
  author?: string;
  data: unknown;
}

interface ChatRoomLike {
  sendMessage(message: string, author: string): Promise<void>;
  retrieveMessagesIterator(count?: number): AsyncGenerator<ChatEntry[]>;
}

interface TopicModelLike {
  computeP2PTopicIdHash(from: string, to: string): Promise<string>;
  findTopic(topicId: string): Promise<{ participants: string } | undefined>;
  createOneToOneTopic(from: string, to: string, source?: string): Promise<{ participants: string }>;
  enterTopicRoom(topicId: string): Promise<ChatRoomLike>;
}

interface ChannelManagerLike {
  onUpdated: {
    listen(callback: (
      channel: string,
      channelParticipants: string,
      owner: string | null,
      time: Date,
      entries: Array<{
        channelInfoIdHash: string;
        channelEntryHash: string;
        dataHash: string;
      }>,
    ) => void): () => void;
  };
}

const HASH = /^[0-9a-f]{64}$/;

export interface ChatMessageView {
  id: string;
  text: string;
  sender: string;
  sentAt: number;
}

export function createChatPlan({
  topicModel,
  channelManager,
  self,
  notify,
}: {
  topicModel: TopicModelLike;
  channelManager: ChannelManagerLike;
  self: () => string;
  notify: (peer: string, message: ChatNotification) => void;
}) {
  const rooms = new Map<string, ChatRoomLike>();
  const opening = new Map<string, Promise<ChatRoomLike>>();
  const peerByParticipants = new Map<string, string>();
  let unsubscribeChannel: (() => void) | undefined;
  let disposed = false;

  const me = (): string => {
    const owner = self();
    if (!owner) throw new Error('UVC lab: instance has no owner.');
    return owner;
  };

  const checkPeer = (peer: string): string => {
    if (typeof peer !== 'string' || !HASH.test(peer)) {
      throw new Error('UVC lab: chat peer must be a SHA-256 hash.');
    }
    if (peer === self()) throw new Error('UVC lab: cannot chat with yourself.');
    return peer;
  };

  const checkText = (text: string): string => {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('UVC lab: message text is required.');
    }
    if (text.length > 2000) throw new Error('UVC lab: message text must be at most 2000 characters.');
    return text;
  };

  const notifyMessages = createChatNotifications({
    self,
    readObject: async hash => getObject(hash as never) as unknown as Promise<{ $type$: string; sender?: unknown; text?: unknown }>,
    notify,
  });

  function ensureSubscription(): void {
    if (unsubscribeChannel || disposed) return;
    // TopicRoom's live event is not consistently armed in this stack. Observe
    // channel entries directly and filter them to participant sets we watch.
    unsubscribeChannel = channelManager.onUpdated.listen(
      (_channel, channelParticipants, _owner, _time, entries) => {
        const peer = peerByParticipants.get(channelParticipants);
        if (!peer) return;
        void notifyMessages(peer, entries).catch(error => {
          console.error('UVC lab: chat notification failed.', error);
        });
      },
    );
  }

  async function openRoom(peer: string): Promise<ChatRoomLike> {
    const other = checkPeer(peer);
    if (disposed) throw new Error('UVC lab: chat plan is shut down.');
    const topicId = await topicModel.computeP2PTopicIdHash(me(), other);
    const topic = (await topicModel.findTopic(topicId))
      ?? (await topicModel.createOneToOneTopic(me(), other, 'uvc-lab-chat'));
    const room = await topicModel.enterTopicRoom(topicId);
    rooms.set(peer, room);
    peerByParticipants.set(topic.participants, peer);
    ensureSubscription();
    return room;
  }

  function roomFor(peer: string): Promise<ChatRoomLike> {
    checkPeer(peer);
    const room = rooms.get(peer);
    if (room) return Promise.resolve(room);
    const inFlight = opening.get(peer);
    if (inFlight) return inFlight;
    const promise = openRoom(peer).finally(() => {
      if (opening.get(peer) === promise) opening.delete(peer);
    });
    opening.set(peer, promise);
    return promise;
  }

  return {
    async watchPeers({ peers }: { peers: string[] }): Promise<{ watched: string[] }> {
      if (!Array.isArray(peers)) throw new Error('UVC lab: chat peers must be an array.');
      const watched = [...new Set(peers)];
      await Promise.all(watched.map(peer => roomFor(peer)));
      return { watched };
    },

    async openChat({ peer }: { peer: string }): Promise<{ topicId: string }> {
      const other = checkPeer(peer);
      const topicId = await topicModel.computeP2PTopicIdHash(me(), other);
      await roomFor(peer);
      return { topicId };
    },

    async sendChat({ peer, text }: { peer: string; text: string }): Promise<{ sent: true }> {
      const body = checkText(text);
      const room = await roomFor(peer);
      await room.sendMessage(body, me());
      return { sent: true };
    },

    async readChat({ peer, count }: { peer: string; count?: number }): Promise<{ messages: ChatMessageView[] }> {
      const room = await roomFor(peer);
      const views: ChatMessageView[] = [];
      for await (const batch of room.retrieveMessagesIterator(count ?? 200)) {
        for (const entry of batch) {
          const data = entry.data as { text?: unknown; sender?: unknown } | undefined;
          if (typeof data?.text !== 'string') continue;
          views.push({
            id: `${entry.channelParticipants}_${entry.channelEntryHash}`,
            text: data.text,
            sender: typeof data.sender === 'string' ? data.sender : String(entry.author ?? ''),
            sentAt: entry.creationTime instanceof Date ? entry.creationTime.getTime() : 0,
          });
        }
      }
      views.sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
      return { messages: views };
    },

    async shutdown(): Promise<void> {
      disposed = true;
      unsubscribeChannel?.();
      unsubscribeChannel = undefined;
      await Promise.allSettled(opening.values());
      opening.clear();
      rooms.clear();
      peerByParticipants.clear();
    },
  };
}

export type ChatPlan = ReturnType<typeof createChatPlan>;
