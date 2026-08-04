#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  realpath,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEPLOYMENT_ROOT = path.join(PACKAGE_ROOT, 'deployment');

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {public: false};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--public') {
      result.public = true;
      continue;
    }
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${token}`);
    result[token.slice(2)] = value;
    index += 1;
  }
  return result;
}

async function sha256File(filePath) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on('data', chunk => digest.update(chunk));
    input.on('end', resolve);
    input.on('error', reject);
  });
  return digest.digest('hex');
}

async function collectFiles(root, relative = '') {
  const result = [];
  const entries = await readdir(path.join(root, relative), {withFileTypes: true});
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(root, child));
    else if (entry.isFile()) {
      const filePath = path.join(root, child);
      result.push({
        path: child.split(path.sep).join('/'),
        sizeBytes: (await stat(filePath)).size,
        sha256: await sha256File(filePath),
      });
    }
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', ...options});
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || result.stderr).trim();
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const version = String(args.version || packageJson.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail(`Invalid release version: ${version}`);

const requestedBundlePath = path.resolve(args.bundle || '/tmp/vger-deploy/bundle.mjs');
const outputDir = path.resolve(args['output-dir'] || '/tmp/uvc-rio-release');
const archiveBase = `uvc-rio-${version}`;
const releaseRoot = path.join(outputDir, archiveBase);
const archivePath = path.join(outputDir, `${archiveBase}.tar.gz`);
const publicationPath = path.join(outputDir, `${archiveBase}.publication.json`);
const minimumFirmware = String(args['minimum-firmware'] || '4.1.2');
const models = String(args.models || 'GRV-R7-MM1001-10').split(',').map(value => value.trim()).filter(Boolean);
const stableUrl = String(args['stable-url'] || `https://refinio.one/installers/uvc/${archiveBase}.tar.gz`);

await stat(requestedBundlePath).catch(() => fail(`Headless bundle does not exist: ${requestedBundlePath}`));
// Node resolves an ESM main module to its physical path. Use that same path for
// argv[1], otherwise bundles with an entrypoint guard can silently skip main()
// when the input traverses a symlink (for example /tmp on macOS).
const bundlePath = await realpath(requestedBundlePath);
if ((await stat(outputDir).catch(() => null)) === null) await mkdir(outputDir, {recursive: true});
if (await stat(releaseRoot).catch(() => null)) fail(`Release staging path already exists: ${releaseRoot}`);
if (await stat(archivePath).catch(() => null)) fail(`Archive already exists: ${archivePath}`);

run(process.execPath, ['--check', bundlePath]);
const helpOutput = run(process.execPath, [bundlePath, '--help'], {cwd: outputDir});
if (!/VGER Headless Server/.test(helpOutput)) {
  fail('Headless bundle did not execute its CLI entrypoint during the --help smoke test');
}
await mkdir(path.join(releaseRoot, 'app'), {recursive: true});
await copyFile(bundlePath, path.join(releaseRoot, 'app', 'uvc-headless.mjs'));
await cp(path.join(DEPLOYMENT_ROOT, 'bin'), path.join(releaseRoot, 'bin'), {recursive: true});
await cp(path.join(DEPLOYMENT_ROOT, 'config'), path.join(releaseRoot, 'config'), {recursive: true});
await cp(path.join(DEPLOYMENT_ROOT, 'systemd'), path.join(releaseRoot, 'systemd'), {recursive: true});

const noticesSource = path.resolve(args.notices || path.join(DEPLOYMENT_ROOT, 'THIRD_PARTY_NOTICES'));
const notices = await readFile(noticesSource, 'utf8');
if (args.public && notices.includes('Public releases must replace this file')) {
  fail('--public requires complete --notices generated from the exact bundle closure');
}
await copyFile(noticesSource, path.join(releaseRoot, 'THIRD_PARTY_NOTICES'));

const sourceCommit = process.env.GIT_COMMIT || run('git', ['rev-parse', 'HEAD'], {cwd: path.resolve(PACKAGE_ROOT, '../..')});
const builtAt = args['built-at'] || new Date().toISOString();
const buildInfo = {
  schemaVersion: 1,
  product: 'uvc-rio',
  version,
  builtAt,
  sourceCommit,
  supportOwner: 'Refinio',
  installationSurface: 'Opto 22 GROOV-LIC-SHELL',
  compatibility: {
    models,
    architecture: 'armv7l',
    minimumFirmware,
    firmwareLine: '4.1',
    nodeMajors: [20, 22],
    serviceManager: 'systemd',
  },
};
await writeJson(path.join(releaseRoot, 'build-info.json'), buildInfo);

if (args.sbom) {
  await copyFile(path.resolve(args.sbom), path.join(releaseRoot, 'sbom.spdx.json'));
} else {
  if (args.public) fail('--public requires --sbom generated from the exact bundle closure');
  const bundleSha = await sha256File(bundlePath);
  await writeJson(path.join(releaseRoot, 'sbom.spdx.json'), {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: archiveBase,
    documentNamespace: `https://refinio.one/spdx/uvc-rio/${version}/${bundleSha}`,
    creationInfo: {created: builtAt, creators: ['Organization: Refinio']},
    packages: [{
      SPDXID: 'SPDXRef-Package-uvc-rio',
      name: 'uvc-rio',
      versionInfo: version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      comment: 'Development-only SBOM. Public builds require a complete supplied SPDX document.',
    }],
  });
}

for (const name of await readdir(path.join(releaseRoot, 'bin'))) {
  await chmod(path.join(releaseRoot, 'bin', name), 0o755);
}

const files = await collectFiles(releaseRoot);
const release = {
  schemaVersion: 1,
  product: 'uvc-rio',
  version,
  compatibility: buildInfo.compatibility,
  stateSchemaVersion: 1,
  files,
};
await writeJson(path.join(releaseRoot, 'release.json'), release);

run('tar', ['-czf', archivePath, '-C', outputDir, archiveBase]);
const archiveStats = await stat(archivePath);
const archiveSha256 = await sha256File(archivePath);
await writeJson(publicationPath, {
  schemaVersion: 1,
  packageName: 'uvc-rio',
  version,
  channel: 'stable',
  platform: 'groov-rio',
  arch: 'armv7',
  label: 'UVC for Opto 22 groov RIO',
  description: 'Refinio UVC authority installed through the official Opto 22 Shell surface.',
  sourceFilename: path.basename(archivePath),
  filePath: archivePath,
  stableUrl,
  sizeBytes: archiveStats.size,
  sha256: archiveSha256,
  compatibility: buildInfo.compatibility,
});

process.stdout.write(`${JSON.stringify({archivePath, publicationPath, sha256: archiveSha256}, null, 2)}\n`);
