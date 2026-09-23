/**
 * refinio.api over a MessagePort for the UVC lab lane.
 *
 * The worker side is an `ipcMain`-shaped object for the existing IpcTransport;
 * the host side is a thin client for its `handler:*` channels. Feed-forward
 * rows and control messages share the port but never the request/response path.
 *
 * Runtime-import-free so both the browser worker entry and the Node test
 * worker load this exact module.
 */

export interface LanePort {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, transfer?: unknown[]): void;
  start?(): void;
}

export type IpcHandler = (event: { sender: string }, ...args: unknown[]) => unknown;

export interface FeedRow {
  type: string;
  id: string;
  kind?: string;
  hash: string;
  obj?: Record<string, unknown>;
  [key: string]: unknown;
}

interface InvokeMessage {
  kind: 'ipc-invoke';
  id: number;
  channel: string;
  args: unknown[];
}

interface ResultMessage {
  kind: 'ipc-result';
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function createLaneIpcMain(port: LanePort): {
  handle(channel: string, fn: IpcHandler): void;
} {
  const handlers = new Map<string, IpcHandler>();
  port.addEventListener('message', async event => {
    const message = event.data as Partial<InvokeMessage> & { kind?: string };
    if (message?.kind !== 'ipc-invoke') return;
    const handler = handlers.get((message as InvokeMessage).channel);
    if (!handler) {
      port.postMessage({
        kind: 'ipc-result',
        id: message.id,
        ok: false,
        error: `No IPC handler for ${(message as InvokeMessage).channel}`,
      });
      return;
    }
    try {
      const value = await handler({ sender: 'lane-host' }, ...((message as InvokeMessage).args ?? []));
      port.postMessage({ kind: 'ipc-result', id: message.id, ok: true, value });
    } catch (error) {
      port.postMessage({
        kind: 'ipc-result',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  port.start?.();
  return {
    handle(channel: string, fn: IpcHandler) {
      if (handlers.has(channel)) throw new Error(`Lane IPC handler ${channel} is already registered.`);
      handlers.set(channel, fn);
    },
  };
}

export function postFeed(port: LanePort, row: FeedRow): void {
  port.postMessage({ kind: 'feed', row });
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class LaneApiClient {
  #port: LanePort;
  #seq = 0;
  #pending = new Map<number, PendingCall>();
  #feed = new Set<(row: FeedRow) => void>();
  #control = new Set<(message: unknown) => void>();
  #failure?: Error;

  constructor(port: LanePort) {
    this.#port = port;
    port.addEventListener('message', event => this.#route(event.data));
    port.start?.();
  }

  #route(message: unknown): void {
    const msg = message as Partial<ResultMessage> & { kind?: string; row?: FeedRow };
    if (msg?.kind === 'ipc-result') {
      const task = this.#pending.get(msg.id as number);
      // A worker can answer after the host has failed or stopped it. The
      // response is no longer actionable; do not turn that expected race
      // into an uncaught exception on the message event loop.
      if (!task) return;
      this.#pending.delete(msg.id as number);
      if (msg.ok) task.resolve(msg.value);
      else task.reject(new Error(msg.error));
      return;
    }
    if (msg?.kind === 'feed') {
      for (const callback of this.#feed) callback(msg.row as FeedRow);
      return;
    }
    for (const callback of this.#control) callback(message);
  }

  #invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (this.#failure) return Promise.reject(this.#failure);
    const id = (this.#seq += 1);
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try {
        this.#port.postMessage({ kind: 'ipc-invoke', id, channel, args });
      } catch (error) {
        this.#pending.delete(id);
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async call<T = unknown>(handler: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = (await this.#invoke('handler:call', { handler, method, params })) as {
      success: boolean;
      data: T;
      error: string;
    };
    if (!response.success) throw new Error(`${handler}.${method}: ${response.error}`);
    return response.data;
  }

  list(): Promise<unknown> {
    return this.#invoke('handler:list');
  }

  onFeed(callback: (row: FeedRow) => void): () => void {
    this.#feed.add(callback);
    return () => {
      this.#feed.delete(callback);
    };
  }

  onControl(callback: (message: unknown) => void): () => void {
    this.#control.add(callback);
    return () => {
      this.#control.delete(callback);
    };
  }

  fail(error: Error): void {
    if (!this.#failure) this.#failure = error;
    const failure = this.#failure;
    for (const task of this.#pending.values()) task.reject(failure);
    this.#pending.clear();
  }
}
