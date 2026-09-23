import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLaneHost } from '../hostSwitch.ts';
import type { LaneHost, SpawnedLaneWorker } from '../hostSwitch.ts';
import { LaneApiClient } from '../portIpc.ts';

jest.setTimeout(300_000);

type Key = 'sender' | 'recipient' | 'third';
type ChatUpdate = { kind: 'chat-updated'; peer: string; message: { id: string; incoming: boolean } };
type ChatMessage = { id: string; text: string; sender: string; sentAt: number };

let root = '';
let host: LaneHost<Key> | undefined;
const workers = new Map<Key, Worker>();
let probeSequence = 0;

function spawnWorker(key: Key): SpawnedLaneWorker {
  const worker = new Worker(path.join(__dirname, '..', 'chatTestWorker.mjs'));
  workers.set(key, worker);
  const port = {
    postMessage: (message: unknown, transfer?: unknown[]) => worker.postMessage(message, transfer as []),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
      worker.on('message', data => listener({ data } as MessageEvent));
    },
    start() {},
  };
  worker.postMessage({
    kind: 'lab-key',
    key,
    lane: 'chat-test-lane',
    email: `${key}@lab.local`,
    secret: `chat-test-${key}`,
    directory: path.join(root, key),
  });
  return {
    port,
    terminate: () => worker.terminate(),
    onError: callback => worker.on('error', callback),
  };
}

function clients(): Record<Key, LaneApiClient> {
  if (!host) throw new Error('chat test host is not running');
  return host.clients;
}

async function pair(from: Key, to: Key): Promise<void> {
  const invite = await clients()[from].call<{
    url: string;
    publicKey: string;
    token: string;
    pairingMode?: string;
  }>('connection', 'createInvite', { mode: 'primed' });
  await clients()[to].call('connection', 'connectWithInvite', invite);
}

function waitForIncoming(client: LaneApiClient, peer: string, count: number): Promise<ChatUpdate[]> {
  return new Promise((resolve, reject) => {
    const updates: ChatUpdate[] = [];
    const timeout = setTimeout(() => {
      off();
      reject(new Error(`did not receive ${count} chat updates from ${peer}`));
    }, 90_000);
    const off = client.onControl(message => {
      const update = message as Partial<ChatUpdate>;
      if (update.kind !== 'chat-updated' || update.peer !== peer || update.message?.incoming !== true) return;
      updates.push(update as ChatUpdate);
      if (updates.length < count) return;
      clearTimeout(timeout);
      off();
      resolve(updates);
    });
  });
}

function topicVisible(key: Key, topicId: string): Promise<boolean> {
  const worker = workers.get(key);
  if (!worker) throw new Error(`missing ${key} worker`);
  const id = ++probeSequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.off('message', receive);
      reject(new Error(`topic visibility probe ${id} timed out`));
    }, 10_000);
    const receive = (message: unknown) => {
      const result = message as { kind?: string; id?: number; visible?: boolean; error?: string };
      if (result.kind !== 'chat-test-has-topic-result' || result.id !== id) return;
      clearTimeout(timeout);
      worker.off('message', receive);
      if (result.error) reject(new Error(result.error));
      else resolve(result.visible === true);
    };
    worker.on('message', receive);
    worker.postMessage({ kind: 'chat-test-has-topic', id, topicId });
  });
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'uvc-private-chat-'));
  host = await startLaneHost<Key>({ keys: ['sender', 'recipient', 'third'], spawn: spawnWorker });
  await pair('sender', 'recipient');
  await pair('sender', 'third');
  await pair('recipient', 'third');
  const persons = host.persons;
  await Promise.all((Object.keys(clients()) as Key[]).map(key => clients()[key].call('chat', 'watchPeers', {
    peers: (Object.keys(persons) as Key[]).filter(other => other !== key).map(other => persons[other]),
  })));
});

afterAll(async () => {
  await host?.stop();
  host = undefined;
  workers.clear();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('private native topic chat', () => {
  it('delivers repeated text bidirectionally and withholds the source topic from a connected third worker', async () => {
    if (!host) throw new Error('chat test host is not running');
    const { sender, recipient, third } = clients();
    const persons = host.persons;
    const { topicId } = await sender.call<{ topicId: string }>('chat', 'openChat', { peer: persons.recipient });
    const recipientUpdates = waitForIncoming(recipient, persons.sender, 2);
    const thirdUpdates: ChatUpdate[] = [];
    const stopThird = third.onControl(message => {
      if ((message as Partial<ChatUpdate>).kind === 'chat-updated') thirdUpdates.push(message as ChatUpdate);
    });

    await sender.call('chat', 'sendChat', { peer: persons.recipient, text: 'same text' });
    await sender.call('chat', 'sendChat', { peer: persons.recipient, text: 'same text' });
    const updates = await recipientUpdates;
    expect(new Set(updates.map(update => update.message.id)).size).toBe(2);

    const received = await recipient.call<{ messages: ChatMessage[] }>('chat', 'readChat', { peer: persons.sender });
    expect(received.messages.map(message => message.text)).toEqual(['same text', 'same text']);
    expect(received.messages.every(message => message.sender === persons.sender)).toBe(true);
    expect(new Set(received.messages.map(message => message.id)).size).toBe(2);

    const senderReply = waitForIncoming(sender, persons.recipient, 1);
    await recipient.call('chat', 'sendChat', { peer: persons.sender, text: 'reply' });
    await senderReply;
    const roundTrip = await sender.call<{ messages: ChatMessage[] }>('chat', 'readChat', { peer: persons.recipient });
    expect(roundTrip.messages.map(message => message.text)).toEqual(['same text', 'same text', 'reply']);

    // Direct storage evidence: even though `third` is paired with both people,
    // CHUM did not disclose the sender/recipient Topic identity to it.
    expect(await topicVisible('sender', topicId)).toBe(true);
    expect(await topicVisible('recipient', topicId)).toBe(true);
    expect(await topicVisible('third', topicId)).toBe(false);
    expect(thirdUpdates).toEqual([]);
    stopThird();
  });
});

