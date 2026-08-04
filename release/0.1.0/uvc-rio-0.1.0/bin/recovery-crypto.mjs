#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {open, stat} from 'node:fs/promises';

const MAGIC = 'UVC-RIO-BACKUP-1\n';
const TAG_BYTES = 16;

function fail(message) {
  process.stderr.write(`uvc-rio recovery: ${message}\n`);
  process.exit(1);
}

function pipelineStreams(streams) {
  return new Promise((resolve, reject) => {
    const [first, ...rest] = streams;
    let current = first;
    for (const next of rest) {
      current = current.pipe(next);
    }
    current.on('finish', resolve);
    for (const stream of streams) stream.on('error', reject);
  });
}

async function encrypt(inputPath, outputPath, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
  const cipher = createCipheriv('aes-256-gcm', key, iv, {authTagLength: TAG_BYTES});
  const output = createWriteStream(outputPath, {flags: 'wx', mode: 0o600});
  output.write(MAGIC);
  output.write(`${JSON.stringify({
    cipher: 'aes-256-gcm',
    kdf: 'scrypt',
    N: 32768,
    r: 8,
    p: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tagBytes: TAG_BYTES,
  })}\n`);

  await pipelineStreams([createReadStream(inputPath), cipher, output]);

  const handle = await open(outputPath, 'a');
  try {
    await handle.write(cipher.getAuthTag());
  } finally {
    await handle.close();
  }
}

async function readHeader(inputPath) {
  const handle = await open(inputPath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    if (!text.startsWith(MAGIC)) fail('invalid backup magic');
    const headerEnd = text.indexOf('\n', MAGIC.length);
    if (headerEnd < 0) fail('backup header is incomplete');
    return {
      header: JSON.parse(text.slice(MAGIC.length, headerEnd)),
      payloadOffset: Buffer.byteLength(text.slice(0, headerEnd + 1)),
    };
  } finally {
    await handle.close();
  }
}

async function decrypt(inputPath, outputPath, password) {
  const {header, payloadOffset} = await readHeader(inputPath);
  if (header.cipher !== 'aes-256-gcm' || header.kdf !== 'scrypt' || header.tagBytes !== TAG_BYTES) {
    fail('unsupported backup cryptography');
  }

  const inputStats = await stat(inputPath);
  const tagPosition = inputStats.size - TAG_BYTES;
  if (tagPosition <= payloadOffset) fail('encrypted payload is empty');

  const handle = await open(inputPath, 'r');
  let tag;
  try {
    tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, tagPosition);
  } finally {
    await handle.close();
  }

  const key = scryptSync(password, Buffer.from(header.salt, 'hex'), 32, {
    N: header.N,
    r: header.r,
    p: header.p,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(header.iv, 'hex'),
    {authTagLength: TAG_BYTES},
  );
  decipher.setAuthTag(tag);

  await pipelineStreams([
    createReadStream(inputPath, {start: payloadOffset, end: tagPosition - 1}),
    decipher,
    createWriteStream(outputPath, {flags: 'wx', mode: 0o600}),
  ]);
}

const [operation, inputPath, outputPath] = process.argv.slice(2);
const password = process.env.UVC_BACKUP_PASSWORD;
if (!operation || !inputPath || !outputPath) fail('usage: recovery-crypto.mjs encrypt|decrypt <input> <output>');
if (!password || password.length < 12) fail('UVC_BACKUP_PASSWORD must contain at least 12 characters');

try {
  if (operation === 'encrypt') await encrypt(inputPath, outputPath, password);
  else if (operation === 'decrypt') await decrypt(inputPath, outputPath, password);
  else fail(`unknown operation: ${operation}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
