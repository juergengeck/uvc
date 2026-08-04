#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const UVC_ROOT = path.resolve(SCRIPT_ROOT, '..');
const DEFAULT_PROJECT = path.resolve(UVC_ROOT, '../vger/packages/esp32.core/firmware/esp32-quicvc-project');

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

function sdkconfigString(config, key) {
  const match = config.match(new RegExp(`^${key}="(.*)"$`, 'm'));
  if (!match) throw new Error(`Missing ${key} in sdkconfig`);
  return match[1];
}

function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
}

const args = parseArgs(process.argv.slice(2));
const version = String(args.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('--version must be a semantic version');
}

const projectDirectory = path.resolve(args['project-dir'] || DEFAULT_PROJECT);
const buildDirectory = path.resolve(args['build-dir'] || path.join(projectDirectory, 'build'));
const sdkconfigPath = path.resolve(args.sdkconfig || path.join(projectDirectory, 'sdkconfig'));
const outputDirectory = path.resolve(args['output-dir'] || path.join(UVC_ROOT, 'release', version));
const archiveName = `uvc-esp32c6-${version}.tar.gz`;
const releaseRootName = `uvc-esp32c6-${version}`;
const releaseRoot = path.join(outputDirectory, releaseRootName);
const firmwareRoot = path.join(releaseRoot, 'firmware');
const archivePath = path.join(outputDirectory, archiveName);
const publicationPath = path.join(outputDirectory, `${releaseRootName}.publication.json`);

const sdkconfig = await readFile(sdkconfigPath, 'utf8');
if (!/^CONFIG_IDF_TARGET="esp32c6"$/m.test(sdkconfig)) {
  throw new Error('Only an ESP-IDF esp32c6 build can be published by this release builder');
}
const wifiSsid = sdkconfigString(sdkconfig, 'CONFIG_ESP_WIFI_SSID');
const wifiPassword = sdkconfigString(sdkconfig, 'CONFIG_ESP_WIFI_PASSWORD');
const safeBootstrapCredentials = (
  (wifiSsid === 'your-ssid' && wifiPassword === 'your-password')
  || (wifiSsid === '' && wifiPassword === '')
);
if (!safeBootstrapCredentials) {
  throw new Error('Refusing to publish firmware built with non-placeholder Wi-Fi credentials; rebuild with empty values or your-ssid/your-password and provision over BLE');
}

const flasherArgsPath = path.join(buildDirectory, 'flasher_args.json');
const flasherArgs = JSON.parse(await readFile(flasherArgsPath, 'utf8'));
if (flasherArgs?.extra_esptool_args?.chip !== 'esp32c6') {
  throw new Error('flasher_args.json is not for esp32c6');
}
const flashFiles = Object.entries(flasherArgs.flash_files || {});
if (flashFiles.length === 0) throw new Error('flasher_args.json contains no flash files');

const sdkconfigStats = await stat(sdkconfigPath);
const releaseFiles = [];
await mkdir(firmwareRoot, {recursive: true});
for (const [offset, relativeFile] of flashFiles) {
  if (typeof relativeFile !== 'string' || path.isAbsolute(relativeFile) || relativeFile.includes('..')) {
    throw new Error(`Unsafe flash file path: ${relativeFile}`);
  }
  const source = path.join(buildDirectory, relativeFile);
  const sourceStats = await stat(source);
  if (sourceStats.mtimeMs < sdkconfigStats.mtimeMs) {
    throw new Error(`${relativeFile} is older than sdkconfig; rebuild ESP-IDF before publishing`);
  }
  const destination = path.join(firmwareRoot, relativeFile);
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(source, destination);
  releaseFiles.push({offset, path: `firmware/${relativeFile}`, sizeBytes: sourceStats.size, sha256: await sha256File(source)});
}

const appFile = flashFiles.find(([, relativeFile]) => /(?:^|\/)esp32_quicvc_app\.bin$/.test(relativeFile))?.[1];
if (!appFile) throw new Error('ESP32 application binary is missing from flasher_args.json');
const appBytes = await readFile(path.join(buildDirectory, appFile));
for (const marker of [wifiSsid, wifiPassword].filter(Boolean)) {
  if (!appBytes.includes(Buffer.from(`${marker}\0`)) && !appBytes.includes(Buffer.from(marker))) {
    throw new Error('Application binary does not match the safe sdkconfig credentials; perform a clean ESP-IDF rebuild');
  }
}

await writeFile(path.join(releaseRoot, 'release.json'), `${JSON.stringify({
  schemaVersion: 1,
  product: 'uvc-esp32',
  version,
  target: 'esp32c6',
  bootstrap: {transport: 'BLE', wifiCredentials: 'provision-at-install'},
  flashSettings: flasherArgs.flash_settings,
  files: releaseFiles,
}, null, 2)}\n`, 'utf8');

const flashPairs = flashFiles.flatMap(([offset, relativeFile]) => [offset, `firmware/${relativeFile}`]);
await writeFile(path.join(releaseRoot, 'flash.sh'), `#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo "usage: ./flash.sh <serial-port>" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }
cd "$(dirname "$0")"
python3 -m esptool --chip esp32c6 --port "$1" --before default-reset --after hard-reset write-flash --flash-mode dio --flash-size 4MB --flash-freq 80m ${flashPairs.map(value => `'${value}'`).join(' ')}
`, {encoding: 'utf8', mode: 0o755});

await writeFile(path.join(releaseRoot, 'README.txt'), [
  'UVC ESP32-C6 firmware',
  '',
  '1. Install Espressif esptool: python3 -m pip install esptool',
  '2. Connect the ESP32-C6 over USB and run: ./flash.sh <serial-port>',
  '3. Open UVC on a phone and provision Wi-Fi over BLE.',
  '',
].join('\n'), 'utf8');

run('tar', ['-czf', archivePath, '-C', outputDirectory, releaseRootName]);
const archiveStats = await stat(archivePath);
const archiveSha256 = await sha256File(archivePath);
await writeFile(publicationPath, `${JSON.stringify({
  schemaVersion: 1,
  packageName: 'uvc-esp32',
  version,
  channel: 'latest',
  platform: 'esp32',
  arch: 'esp32c6',
  label: 'UVC firmware for ESP32-C6',
  description: 'ESP32-C6 firmware bundle flashed with Espressif esptool and provisioned over BLE.',
  sourceFilename: archiveName,
  filePath: archivePath,
  stableUrl: `https://refinio.one/installers/uvc/${archiveName}`,
  sizeBytes: archiveStats.size,
  sha256: archiveSha256,
}, null, 2)}\n`, 'utf8');

process.stdout.write(`${JSON.stringify({archivePath, publicationPath, sha256: archiveSha256}, null, 2)}\n`);
