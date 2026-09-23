import type { ChatNotification } from './chatNotifications.ts';

/** The whole chat vocabulary of a lamp or sensor worker. */
export const DEVICE_CHAT_COMMANDS = ['on', 'off', 'status'] as const;
export type DeviceChatCommand = typeof DEVICE_CHAT_COMMANDS[number];
/** Sent by the Doctor app's room-cleaning button; only a device with a `clean` runner accepts it. */
export const CLEAN_COMMAND = 'clean';

const HASH = /^[0-9a-f]{64}$/;

export function parseDeviceChatCommand(text: string): DeviceChatCommand | null {
  const command = text.trim().toLowerCase();
  return (DEVICE_CHAT_COMMANDS as readonly string[]).includes(command) ? command as DeviceChatCommand : null;
}

interface DeviceState {
  on: boolean;
  reason: string;
  updatedAt: number;
}

/**
 * Answers `on`, `off` and `status` chat messages on a device worker.
 *
 * Only the instance the host enabled answers, so a second device joined to
 * the same identity does not switch or reply twice. Anything that is not a
 * command is ignored: device replies are not commands, so two devices
 * chatting with each other cannot ping-pong.
 */
export function createDeviceChatCommands({
  device,
  readState,
  setState,
  reply,
  clean,
}: {
  device: string;
  readState: () => Promise<DeviceState | null>;
  setState: (on: boolean, reason: string, audience: string[]) => Promise<unknown>;
  reply: (peer: string, text: string) => Promise<unknown>;
  /** Runs one cleaning cycle and returns the summary sent back to the requester. */
  clean?: (audience: string[]) => Promise<string>;
}) {
  let audience: string[] | null = null;
  let pending = Promise.resolve();
  let cleaning: Promise<void> | null = null;
  const failure = (command: string, error: unknown) =>
    `${device} could not run "${command}": ${error instanceof Error ? error.message : String(error)}`;

  const describe = (state: DeviceState | null): string => state
    ? `${device} is ${state.on ? 'on' : 'off'} · since ${new Date(state.updatedAt).toLocaleTimeString()} · ${state.reason}`
    : `${device} has no recorded state.`;

  async function run(peer: string, command: DeviceChatCommand, recipients: string[]): Promise<void> {
    let answer: string;
    try {
      if (command !== 'status' && cleaning) {
        throw new Error('a cleaning cycle is running; it switches the lamp off when it finishes.');
      }
      if (command !== 'status') {
        await setState(command === 'on', `Chat command from ${peer.slice(0, 8)}…`, recipients);
      }
      answer = describe(await readState());
    } catch (error) {
      answer = failure(command, error);
    }
    await reply(peer, answer);
  }

  async function runCleaning(peer: string, runner: (audience: string[]) => Promise<string>, recipients: string[]): Promise<void> {
    let answer: string;
    try {
      answer = await runner(recipients);
    } catch (error) {
      answer = failure(CLEAN_COMMAND, error);
    }
    await reply(peer, answer);
  }

  return {
    enable({ audience: recipients }: { audience: string[] }): { enabled: true } {
      if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some(person => !HASH.test(person))) {
        throw new Error('UVC lab: device chat commands need a non-empty Person-hash audience.');
      }
      audience = [...new Set(recipients)];
      return { enabled: true };
    },

    /** The enabled audience, or null on an instance that does not act for the device. */
    audience(): string[] | null {
      return audience;
    },

    /** Resolves once queued commands and a running cleaning cycle have finished. */
    async idle(): Promise<void> {
      await pending;
      await cleaning;
    },

    receive(peer: string, message: ChatNotification): Promise<void> {
      if (!audience || !message.incoming) return pending;
      const recipients = audience;
      if (clean && message.text.trim().toLowerCase() === CLEAN_COMMAND) {
        if (cleaning) {
          const busy = reply(peer, failure(CLEAN_COMMAND, new Error('a cleaning cycle is already running.')));
          return busy.then(() => undefined);
        }
        // The cycle runs beside the command queue so status stays answerable while it runs.
        const cycle = runCleaning(peer, clean, recipients)
          .catch(error => console.error(`UVC lab: ${device} cleaning reply failed.`, error))
          .finally(() => { if (cleaning === cycle) cleaning = null; });
        cleaning = cycle;
        return cycle;
      }
      const command = parseDeviceChatCommand(message.text);
      if (!command) return pending;
      // Commands apply in arrival order; one failed reply must not block the next.
      const next = pending.then(() => run(peer, command, recipients));
      pending = next.catch(error => console.error(`UVC lab: ${device} chat reply failed.`, error));
      return next;
    },
  };
}

export type DeviceChatCommands = ReturnType<typeof createDeviceChatCommands>;
