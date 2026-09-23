jest.mock('@refinio/one.core/lib/storage-unversioned-objects.js', () => ({
  getObject: jest.fn(),
}));

import { createChatPlan } from '../chatPlan.ts';

const SELF = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

describe('chat plan room lifecycle', () => {
  it('single-flights concurrent opens and returns stable message ids', async () => {
    let releaseFind!: () => void;
    const findGate = new Promise<void>(resolve => { releaseFind = resolve; });
    const room = {
      sendMessage: jest.fn(),
      async *retrieveMessagesIterator() {
        yield [{
          channelParticipants: 'participants',
          channelEntryHash: 'entry-one',
          creationTime: new Date(1234),
          author: SELF,
          data: { text: 'hello', sender: SELF },
        }];
      },
    };
    const topicModel = {
      computeP2PTopicIdHash: jest.fn(async () => 'topic-id'),
      findTopic: jest.fn(async () => {
        await findGate;
        return undefined;
      }),
      createOneToOneTopic: jest.fn(async () => ({ participants: 'participants' })),
      enterTopicRoom: jest.fn(async () => room),
    };
    const disconnect = jest.fn();
    const channelManager = { onUpdated: { listen: jest.fn(() => disconnect) } };
    const plan = createChatPlan({
      topicModel: topicModel as never,
      channelManager: channelManager as never,
      self: () => SELF,
      notify: jest.fn(),
    });

    const first = plan.openChat({ peer: PEER });
    const second = plan.openChat({ peer: PEER });
    releaseFind();
    await Promise.all([first, second]);

    expect(topicModel.findTopic).toHaveBeenCalledTimes(1);
    expect(topicModel.createOneToOneTopic).toHaveBeenCalledTimes(1);
    expect(topicModel.enterTopicRoom).toHaveBeenCalledTimes(1);
    expect(channelManager.onUpdated.listen).toHaveBeenCalledTimes(1);

    await expect(plan.readChat({ peer: PEER })).resolves.toEqual({
      messages: [{
        id: 'participants_entry-one',
        text: 'hello',
        sender: SELF,
        sentAt: 1234,
      }],
    });

    await plan.shutdown();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('validates peers and message bodies before touching a room', async () => {
    const plan = createChatPlan({
      topicModel: {} as never,
      channelManager: {} as never,
      self: () => SELF,
      notify: jest.fn(),
    });

    await expect(plan.openChat({ peer: SELF })).rejects.toThrow('cannot chat with yourself');
    await expect(plan.openChat({ peer: 'not-a-hash' })).rejects.toThrow('SHA-256 hash');
    await expect(plan.sendChat({ peer: PEER, text: '   ' })).rejects.toThrow('message text is required');
  });
});

