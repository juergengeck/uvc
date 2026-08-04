#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${token}`);
    result[token.slice(2)] = value;
    index += 1;
  }
  return result;
}

async function isFile(filePath) {
  return (await stat(filePath).catch(() => null))?.isFile() === true;
}

async function findPackageRoot(inputPath) {
  let current = path.dirname(inputPath);
  while (current !== path.dirname(current)) {
    if (await isFile(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  return null;
}

function declaredLicense(packageJson) {
  if (typeof packageJson.license === 'string') return packageJson.license.trim();
  if (packageJson.license && typeof packageJson.license.type === 'string') {
    return packageJson.license.type.trim();
  }
  if (Array.isArray(packageJson.licenses)) {
    return packageJson.licenses
      .map(value => typeof value === 'string' ? value : value?.type)
      .filter(Boolean)
      .join(' OR ');
  }
  return '';
}

function spdxLicense(value) {
  if (!value || /SEE LICENSE|UNLICENSED|PROPRIETARY/i.test(value)) return 'NOASSERTION';
  return /^[A-Za-z0-9.+()\- ]+(?:AND|OR|WITH)?[A-Za-z0-9.+()\- ]*$/.test(value)
    ? value
    : 'NOASSERTION';
}

function spdxId(value) {
  return value.replace(/[^A-Za-z0-9.-]/g, '-');
}

const args = parseArgs(process.argv.slice(2));
const metafilePath = path.resolve(args.metafile || fail('--metafile is required'));
const bundleCwd = path.resolve(args['bundle-cwd'] || fail('--bundle-cwd is required'));
const outputDirectory = path.resolve(args['output-dir'] || fail('--output-dir is required'));
const version = String(args.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail('--version must be a semantic version');

const metafileBytes = await readFile(metafilePath);
const metafile = JSON.parse(metafileBytes);
const bundleOutput = Object.entries(metafile.outputs || {}).find(([name]) => name.endsWith('/bundle.mjs') || name === 'bundle.mjs');
if (!bundleOutput) fail('The esbuild metafile does not describe bundle.mjs');
const emittedInputs = Object.entries(bundleOutput[1].inputs || {})
  .filter(([, detail]) => Number(detail.bytesInOutput) > 0)
  .map(([name]) => name)
  .filter(name => !name.startsWith('<'));
if (emittedInputs.length === 0) fail('The esbuild metafile contains no emitted bundle inputs');

const packageRoots = new Set();
for (const input of emittedInputs) {
  const packageRoot = await findPackageRoot(path.resolve(bundleCwd, input));
  if (packageRoot) packageRoots.add(packageRoot);
}

const packages = [];
for (const packageRoot of [...packageRoots].sort()) {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (!packageJson.name || !packageJson.version) continue;
  const license = declaredLicense(packageJson);
  const licenseFiles = (await readdir(packageRoot, {withFileTypes: true}))
    .filter(entry => entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(entry.name))
    .map(entry => entry.name)
    .sort();
  packages.push({
    name: packageJson.name,
    version: String(packageJson.version),
    license,
    root: packageRoot,
    licenseFiles,
    homepage: typeof packageJson.homepage === 'string' ? packageJson.homepage : undefined,
  });
}
packages.sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
if (packages.length === 0) fail('No package metadata was resolved from the exact bundle closure');

const digest = createHash('sha256').update(metafileBytes).digest('hex');
const created = args.created || new Date().toISOString();
const spdxPackages = packages.map((entry, index) => ({
  SPDXID: `SPDXRef-Package-${spdxId(entry.name)}-${spdxId(entry.version)}-${index + 1}`,
  name: entry.name,
  versionInfo: entry.version,
  downloadLocation: 'NOASSERTION',
  filesAnalyzed: false,
  licenseConcluded: 'NOASSERTION',
  licenseDeclared: spdxLicense(entry.license),
  copyrightText: 'NOASSERTION',
  ...(entry.homepage ? {homepage: entry.homepage} : {}),
}));
const documentId = 'SPDXRef-DOCUMENT';
const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: documentId,
  name: `uvc-rio-${version}`,
  documentNamespace: `https://refinio.one/spdx/uvc-rio/${version}/${digest}`,
  creationInfo: {created, creators: ['Organization: Refinio']},
  packages: spdxPackages,
  relationships: spdxPackages.map(entry => ({
    spdxElementId: documentId,
    relationshipType: 'DESCRIBES',
    relatedSpdxElement: entry.SPDXID,
  })),
};

const noticeParts = [
  `UVC for groov RIO ${version}`,
  'Third-party and bundled-component notices generated from the exact esbuild bundle closure.',
  `Bundle closure SHA-256: ${digest}`,
  '',
];
for (const entry of packages) {
  noticeParts.push('='.repeat(78));
  noticeParts.push(`${entry.name}@${entry.version}`);
  noticeParts.push(`Declared license: ${entry.license || 'NOASSERTION'}`);
  noticeParts.push('');
  if (entry.licenseFiles.length === 0) {
    noticeParts.push('No standalone license or notice file was distributed with this package.');
    noticeParts.push('');
    continue;
  }
  for (const file of entry.licenseFiles) {
    noticeParts.push(`--- ${file} ---`);
    noticeParts.push((await readFile(path.join(entry.root, file), 'utf8')).trim());
    noticeParts.push('');
  }
}

await mkdir(outputDirectory, {recursive: true});
const sbomPath = path.join(outputDirectory, `uvc-rio-${version}.sbom.spdx.json`);
const noticesPath = path.join(outputDirectory, `uvc-rio-${version}.THIRD_PARTY_NOTICES`);
await writeFile(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
await writeFile(noticesPath, `${noticeParts.join('\n').trim()}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({sbomPath, noticesPath, packageCount: packages.length, bundleClosureSha256: digest}, null, 2)}\n`);
