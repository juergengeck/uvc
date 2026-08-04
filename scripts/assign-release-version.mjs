#!/usr/bin/env node

import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const UVC_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_PACKAGE_JSON_PATHS = [
  path.join(UVC_ROOT, 'packages', 'uvc.cube', 'package.json'),
  path.join(UVC_ROOT, 'packages', 'uvc.groov', 'package.json'),
];
const DEFAULT_MANIFEST_URL = 'https://refinio.one/downloads/uvc/current-release.json';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {
    allowSameVersion: false,
    channel: 'latest',
    json: false,
    packageJsons: [...DEFAULT_PACKAGE_JSON_PATHS],
    write: false,
  };
  let customPackageJsons = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write') {
      result.write = true;
      continue;
    }
    if (token === '--json') {
      result.json = true;
      continue;
    }
    if (token === '--allow-same-version') {
      result.allowSameVersion = true;
      continue;
    }
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${token}`);
    const key = token.slice(2);
    if (key === 'package-json') {
      if (!customPackageJsons) {
        result.packageJsons = [];
        customPackageJsons = true;
      }
      result.packageJsons.push(path.resolve(value));
    } else if (key === 'manifest-url') {
      result.manifestUrl = value;
    } else if (key === 'manifest-file') {
      result.manifestFile = path.resolve(value);
    } else if (key === 'assert-version') {
      result.assertVersion = value;
    } else if (key === 'channel') {
      result.channel = value;
    } else {
      fail(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  if (result.manifestUrl && result.manifestFile) {
    fail('--manifest-url and --manifest-file are mutually exclusive');
  }
  if (!['latest', 'preview'].includes(result.channel)) {
    fail(`Unsupported channel: ${result.channel}`);
  }
  return result;
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) fail(`Unsupported semantic version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return left[index].localeCompare(right[index]);
  }
  return 0;
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function bumpPatch(version) {
  const parsed = parseSemver(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

async function readPackage(packageJsonPath) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (typeof packageJson.name !== 'string' || packageJson.name.trim() === '') {
    fail(`Missing string name in ${packageJsonPath}`);
  }
  if (typeof packageJson.version !== 'string' || packageJson.version.trim() === '') {
    fail(`Missing string version in ${packageJsonPath}`);
  }
  parseSemver(packageJson.version);
  return {packageJson, path: packageJsonPath, version: packageJson.version.trim()};
}

async function assertLockfileVersion(lockfilePath, packageName, version) {
  let lockfile;
  try {
    lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  const versions = [];
  if (lockfile.name === packageName && typeof lockfile.version === 'string') {
    versions.push(lockfile.version);
  }
  for (const entry of Object.values(lockfile.packages || {})) {
    if (entry?.name === packageName && typeof entry.version === 'string') {
      versions.push(entry.version);
    }
  }
  const staleVersion = versions.find(lockVersion => lockVersion !== version);
  if (staleVersion) {
    fail(
      `Release version ${version} does not match ${path.relative(UVC_ROOT, lockfilePath)} ` +
      `entry for ${packageName} (${staleVersion})`,
    );
  }
}

async function updateLockfile(lockfilePath, packageName, version) {
  let lockfile;
  try {
    lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }

  let changed = false;
  if (lockfile.name === packageName && lockfile.version !== version) {
    lockfile.version = version;
    changed = true;
  }
  for (const entry of Object.values(lockfile.packages || {})) {
    if (entry?.name === packageName && entry.version !== version) {
      entry.version = version;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
  }
  return changed;
}

function readManifestVersion(manifest, source) {
  if (typeof manifest?.releaseVersion !== 'string' || manifest.releaseVersion.trim() === '') {
    fail(`Release manifest at ${source} is missing releaseVersion`);
  }
  const version = manifest.releaseVersion.trim();
  parseSemver(version);
  return version;
}

async function readLiveVersion(args) {
  if (args.manifestFile) {
    const manifest = JSON.parse(await readFile(args.manifestFile, 'utf8'));
    return readManifestVersion(manifest, args.manifestFile);
  }

  const manifestUrl = args.manifestUrl || DEFAULT_MANIFEST_URL;
  let response;
  try {
    response = await fetch(manifestUrl, {headers: {accept: 'application/json'}});
  } catch (error) {
    fail(`Could not read live UVC release manifest at ${manifestUrl}: ${String(error)}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    fail(`Live UVC release manifest request failed: ${response.status} ${response.statusText}`);
  }
  return readManifestVersion(await response.json(), manifestUrl);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = await Promise.all(args.packageJsons.map(readPackage));
  if (packages.length === 0) fail('At least one --package-json is required');

  const localVersion = packages[0].version;
  const liveVersion = await readLiveVersion(args);
  let assignedVersion = localVersion;
  if (liveVersion && compareSemver(localVersion, liveVersion) <= 0) {
    assignedVersion = bumpPatch(liveVersion);
  }

  if (args.assertVersion) {
    parseSemver(args.assertVersion);
    for (const packageInfo of packages) {
      if (packageInfo.version !== args.assertVersion) {
        fail(
          `Release version ${args.assertVersion} does not match ${path.relative(UVC_ROOT, packageInfo.path)} ` +
          `(${packageInfo.version})`,
        );
      }
      await assertLockfileVersion(
        path.join(path.dirname(packageInfo.path), 'package-lock.json'),
        packageInfo.packageJson.name,
        args.assertVersion,
      );
      const relativePackagePath = path.relative(UVC_ROOT, packageInfo.path);
      if (!relativePackagePath.startsWith('..') && !path.isAbsolute(relativePackagePath)) {
        await assertLockfileVersion(
          path.join(UVC_ROOT, 'package-lock.json'),
          packageInfo.packageJson.name,
          args.assertVersion,
        );
      }
    }
    if (args.channel === 'latest' && liveVersion) {
      const comparison = compareSemver(args.assertVersion, liveVersion);
      if (comparison < 0) {
        fail(`Refusing to replace latest ${liveVersion} with older version ${args.assertVersion}`);
      }
      if (comparison === 0 && !args.allowSameVersion) {
        fail(
          `Refusing to publish latest with unchanged version ${args.assertVersion}; ` +
          'bump both package versions or pass --allow-same-version',
        );
      }
    }
  }

  let wrote = false;
  const updatedLockfiles = new Set();
  if (args.write) {
    for (const packageInfo of packages) {
      if (packageInfo.version !== assignedVersion) {
        packageInfo.packageJson.version = assignedVersion;
        await writeFile(packageInfo.path, `${JSON.stringify(packageInfo.packageJson, null, 2)}\n`, 'utf8');
        wrote = true;
      }

      const adjacentLockfile = path.join(path.dirname(packageInfo.path), 'package-lock.json');
      if (await updateLockfile(adjacentLockfile, packageInfo.packageJson.name, assignedVersion)) {
        updatedLockfiles.add(adjacentLockfile);
        wrote = true;
      }
      const relativePackagePath = path.relative(UVC_ROOT, packageInfo.path);
      if (!relativePackagePath.startsWith('..') && !path.isAbsolute(relativePackagePath)) {
        const rootLockfile = path.join(UVC_ROOT, 'package-lock.json');
        if (await updateLockfile(rootLockfile, packageInfo.packageJson.name, assignedVersion)) {
          updatedLockfiles.add(rootLockfile);
          wrote = true;
        }
      }
    }
  }

  const result = {
    localVersion,
    liveVersion,
    assignedVersion,
    wrote,
    updatedLockfiles: [...updatedLockfiles].map(lockfilePath => path.relative(UVC_ROOT, lockfilePath)),
    packageVersions: packages.map(packageInfo => ({
      path: path.relative(UVC_ROOT, packageInfo.path),
      version: packageInfo.version,
    })),
  };
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${assignedVersion}\n`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
