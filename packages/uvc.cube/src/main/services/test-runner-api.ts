import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http';

import {invokeUvcPlan, listUvcPlans} from '../registry/uvc-plan-registry.js';

const DEFAULT_PORT = 8788;
const MAX_BODY_BYTES = 1024 * 1024;
let server: Server | undefined;

export async function startTestRunnerApi(): Promise<void> {
  const secret = process.env.UVC_E2E_SECRET;
  if (!secret) {
    console.log('[UvcTestRunnerApi] disabled; set UVC_E2E_SECRET to enable the loopback API');
    return;
  }
  if (server) return;
  const port = parsePort(process.env.UVC_E2E_API_PORT);
  server = createServer((request, response) => {
    void handleRequest(request, response, secret);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(port, '127.0.0.1', () => {
      server!.off('error', reject);
      console.log(`[UvcTestRunnerApi] listening on http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

export async function stopTestRunnerApi(): Promise<void> {
  const active = server;
  server = undefined;
  if (!active) return;
  await new Promise<void>((resolve, reject) => {
    active.close(error => error ? reject(error) : resolve());
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, secret: string): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {status: 'ok', running: true, operations: listUvcPlans()});
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 404, {error: 'Not found'});
      return;
    }
    if (request.headers['x-uvc-e2e-secret'] !== secret) {
      sendJson(response, 401, {error: 'Invalid UVC test secret'});
      return;
    }
    const match = url.pathname.match(/^\/api\/([^/]+)\/([^/]+)$/u);
    if (!match) {
      sendJson(response, 404, {error: 'Not found'});
      return;
    }
    const body = await readJsonBody(request);
    const product = await invokeUvcPlan(decodeURIComponent(match[1]), decodeURIComponent(match[2]), body);
    sendJson(response, 200, product);
  } catch (error) {
    sendJson(response, 500, {error: error instanceof Error ? error.message : String(error)});
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body exceeds 1 MiB');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Request body must be a JSON object');
  }
  return parsed;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  response.end(json);
}

function parsePort(value?: string): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid UVC_E2E_API_PORT: ${value}`);
  }
  return port;
}
