#!/usr/bin/env node

import {stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

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

const args = parseArgs(process.argv.slice(2));
const version = String(args.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error('--version must be a semantic version');
const outputPath = path.resolve(args.output || `uvc-release-${version}.json`);
const outputDirectory = path.dirname(outputPath);

const definitions = [
  ['windows', 'x64', 'windows', 'UVC Cube for Windows'],
  ['linux', 'x64', 'linux', 'UVC Cube for Linux'],
  ['groov-rio', 'armv7', 'rio', 'UVC for Opto 22 groov RIO'],
  ['esp32', 'esp32c6', 'esp32', 'UVC firmware for ESP32-C6'],
];

const artifacts = [];
for (const [platform, arch, argument, label] of definitions) {
  if (!args[argument]) throw new Error(`--${argument} is required`);
  const absoluteFile = path.resolve(args[argument]);
  await stat(absoluteFile).catch(() => { throw new Error(`Artifact does not exist: ${absoluteFile}`); });
  const sourceFilename = path.basename(absoluteFile);
  artifacts.push({
    platform,
    arch,
    label,
    file: path.relative(outputDirectory, absoluteFile) || sourceFilename,
    sourceFilename,
    stableUrl: `https://refinio.one/installers/uvc/${sourceFilename}`,
  });
}

await writeFile(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  product: 'uvc',
  version,
  artifacts,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({outputPath, artifactCount: artifacts.length}, null, 2)}\n`);
