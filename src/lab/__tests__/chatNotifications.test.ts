import { createChatNotifications } from '../chatNotifications.ts';
import type { ChatNotification } from '../chatNotifications.ts';
import type { ChatChannelEntry } from '../chatNotifications.ts';

const entry = (id: string, dataHash = id): ChatChannelEntry => ({
  channelInfoIdHash: 'channel',
  channelEntryHash: id,
  dataHash,
});

describe('chat channel notifications', () => {
  it('deduplicates channel entries while counting identical message text separately', async () => {
    const received: ChatNotification[] = [];
    const update = createChatNotifications({
      self: () => 'me',
      readObject: async hash => hash === 'metadata'
        ? { $type$: 'Profile' }
        : { $type$: 'ChatMessage', sender: hash === 'own' ? 'me' : 'peer', text: `text ${hash}` },
      notify: (_peer, message) => received.push(message),
    });

    await update('peer', []);
    await Promise.all([
      update('peer', [entry('one')]),
      update('peer', [entry('one')]),
    ]);
    await update('peer', [
      entry('one'),
      entry('two', 'one'),
      entry('three'),
      entry('metadata'),
      entry('own'),
    ]);

    expect(received).toEqual([
      { id: 'channel_one', incoming: true, text: 'text one' },
      { id: 'channel_two', incoming: true, text: 'text one' },
      { id: 'channel_three', incoming: true, text: 'text three' },
      { id: 'channel_own', incoming: false, text: 'text own' },
    ]);

    await update('peer', [entry('one'), entry('two', 'one'), entry('three')]);
    expect(received).toHaveLength(4);
  });

  it('retries a failed read without blocking later entries', async () => {
    const received: string[] = [];
    let fail = true;
    const update = createChatNotifications({
      self: () => 'me',
      readObject: async () => {
        if (fail) {
          fail = false;
          throw new Error('read failed');
        }
        return { $type$: 'ChatMessage', sender: 'peer' };
      },
      notify: (_peer, message) => received.push(message.id),
    });

    await expect(update('peer', [entry('one')])).rejects.toThrow('read failed');
    await update('peer', [entry('one'), entry('two')]);
    expect(received).toEqual(['channel_one', 'channel_two']);
  });
});
