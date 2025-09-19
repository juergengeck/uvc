/**
 * Debug utility to trace connection message flow and identify ping/pong filtering issues
 */

import Connection from '@refinio/one.models/lib/misc/Connection/Connection';

class DebugConnectionLogs {
    private static instance: DebugConnectionLogs;
    private logEnabled = true;
    private messageCounter = 0;

    private constructor() {}

    public static getInstance(): DebugConnectionLogs {
        if (!DebugConnectionLogs.instance) {
            DebugConnectionLogs.instance = new DebugConnectionLogs();
        }
        return DebugConnectionLogs.instance;
    }

    public log(message: string, ...args: any[]) {
        if (this.logEnabled) {
            console.log(`[CONNECTION_DEBUG] ${message}`, ...args);
        }
    }

    public logConnection(
        context: string,
        connection: Connection | null | undefined,
        message: string
    ) {
        if (!this.logEnabled) return;

        if (connection) {
            this.log(
                `${context}: ${message} - Connection ID: ${connection.id}`
            );
        } else {
            this.log(`${context}: ${message} - Connection is null or undefined.`);
        }
    }

    public logMessage(location: string, data: any, extra?: any): void {
        if (!this.logEnabled) return;
        const id = ++this.messageCounter;

        if (typeof data === 'string') {
            const isPingPong =
                data.trim().toLowerCase() === 'ping' ||
                data.trim().toLowerCase() === 'pong';

            if (isPingPong || data.length < 100) {
                console.log(`[DEBUG-${id}] ${location}:`, {
                    content: JSON.stringify(data),
                    length: data.length,
                    isPingPong,
                    bytes: Array.from(new TextEncoder().encode(data)),
                    ...extra,
                });
            } else {
                console.log(
                    `[DEBUG-${id}] ${location}: Long message (${data.length} chars):`,
                    JSON.stringify(data.substring(0, 50)) + '...'
                );
            }
        } else {
            console.log(`[DEBUG-${id}] ${location}:`, {
                type: typeof data,
                isArray: Array.isArray(data),
                constructor: data?.constructor?.name,
                ...extra,
            });
        }
    }

    public logFiltered(location: string, data: any, reason: string): void {
        if (!this.logEnabled) return;
        const id = ++this.messageCounter;
        console.log(`[DEBUG-${id}] 🚫 ${location} FILTERED: ${reason}`, {
            content: typeof data === 'string' ? JSON.stringify(data) : data,
            type: typeof data,
        });
    }

    public logError(location: string, data: any, error: Error): void {
        if (!this.logEnabled) return;
        const id = ++this.messageCounter;
        console.log(`[DEBUG-${id}] ❌ ${location} ERROR:`, {
            content: typeof data === 'string' ? JSON.stringify(data) : data,
            error: error.message,
            stack: error.stack?.split('\n')[0],
        });
    }
}

export const connectionLogger = DebugConnectionLogs.getInstance();