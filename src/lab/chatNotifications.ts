export interface ChatChannelEntry {
  channelInfoIdHash: string;
  channelEntryHash: string;
  dataHash: string;
}

export interface ChatNotification {
  id: string;
  incoming: boolean;
  text: string;
}

/**
 * Turn ChannelManager updates into one notification per chat entry.
 *
 * Channel updates may be empty, batched, or replay entries already reported.
 * The channel-entry identity, rather than message text, is therefore the
 * notification key: sending identical text twice still produces two updates.
 */
export function createChatNotifications({
  self,
  readObject,
  notify,
}: {
  self: () => string;
  readObject: (hash: ChatChannelEntry['dataHash']) => Promise<{ $type$: string; sender?: unknown; text?: unknown }>;
  notify: (peer: string, message: ChatNotification) => void;
}) {
  const seen = new Set<string>();
  let pending = Promise.resolve();

  return (peer: string, entries: ChatChannelEntry[]): Promise<void> => {
    const next = pending.then(async () => {
      for (const entry of entries) {
        const id = `${entry.channelInfoIdHash}_${entry.channelEntryHash}`;
        if (seen.has(id)) continue;
        const data = await readObject(entry.dataHash);
        if (data.$type$ !== 'ChatMessage') continue;
        seen.add(id);
        notify(peer, { id, incoming: data.sender !== self(), text: typeof data.text === 'string' ? data.text : '' });
      }
    });
    // One unreadable entry must not permanently block subsequent updates.
    pending = next.catch(() => undefined);
    return next;
  };
}
