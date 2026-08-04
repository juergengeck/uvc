#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_IDENTITIES = [
  'windows/x64',
  'linux/x64',
  'groov-rio/armv7',
  'esp32/esp32c6',
];

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    result[token.slice(2)] = value;
    index += 1;
  }
  return result;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

const args = parseArgs(process.argv.slice(2));
const descriptorPath = path.resolve(requireString(args['artifacts-file'], '--artifacts-file'));
const expectedVersion = requireString(args.version, '--version');
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(expectedVersion)) {
  throw new Error('--version must be a semantic version');
}

const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
if (descriptor.schemaVersion !== 1) throw new Error('Release descriptor schemaVersion must be 1');
if (descriptor.product !== 'uvc') throw new Error('Release descriptor product must be uvc');
if (descriptor.version !== expectedVersion) {
  throw new Error(`Release descriptor version ${descriptor.version || '<missing>'} does not match ${expectedVersion}`);
}
if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length !== REQUIRED_IDENTITIES.length) {
  throw new Error(`Release descriptor must contain exactly ${REQUIRED_IDENTITIES.length} artifacts`);
}

const identities = descriptor.artifacts.map(artifact => `${artifact?.platform}/${artifact?.arch}`);
if (new Set(identities).size !== identities.length || REQUIRED_IDENTITIES.some(identity => !identities.includes(identity))) {
  throw new Error(`Release descriptor identities must be exactly ${REQUIRED_IDENTITIES.join(', ')}; got ${identities.join(', ')}`);
}

const descriptorDirectory = path.dirname(descriptorPath);
const verifiedArtifacts = [];
for (const artifact of descriptor.artifacts) {
  const identity = `${artifact.platform}/${artifact.arch}`;
  const fileValue = requireString(artifact.file, `${identity} file`);
  const filePath = path.resolve(descriptorDirectory, fileValue);
  if (path.isAbsolute(fileValue)) throw new Error(`${identity} file must be relative to the descriptor`);

  const sourceFilename = requireString(artifact.sourceFilename, `${identity} sourceFilename`);
  if (sourceFilename !== path.basename(filePath)) {
    throw new Error(`${identity} sourceFilename must match its artifact filename`);
  }
  const expectedStableUrl = `https://refinio.one/installers/uvc/${sourceFilename}`;
  if (artifact.stableUrl !== expectedStableUrl) {
    throw new Error(`${identity} stableUrl must be ${expectedStableUrl}`);
  }

  const fileStats = await stat(filePath).catch(() => {
    throw new Error(`${identity} artifact does not exist: ${filePath}`);
  });
  if (!fileStats.isFile() || fileStats.size === 0) throw new Error(`${identity} artifact must be a non-empty file`);
  verifiedArtifacts.push({
    identity,
    sourceFilename,
    sizeBytes: fileStats.size,
    sha256: await sha256File(filePath),
  });
}

process.stdout.write(`${JSON.stringify({
  descriptorPath,
  product: descriptor.product,
  version: descriptor.version,
  artifacts: verifiedArtifacts,
}, null, 2)}\n`);
