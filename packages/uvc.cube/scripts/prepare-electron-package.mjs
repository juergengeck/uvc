#!/usr/bin/env node

import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const stagingRoot = path.join(packageRoot, 'electron-package');

await rm(stagingRoot, {recursive: true, force: true});
await mkdir(stagingRoot, {recursive: true});
await cp(path.join(packageRoot, 'out'), path.join(stagingRoot, 'out'), {recursive: true});
await cp(path.join(packageRoot, 'resources'), path.join(stagingRoot, 'resources'), {recursive: true});
await writeFile(path.join(stagingRoot, 'package.json'), `${JSON.stringify({
  // electron-builder uses this value as the Linux executable name. npm's
  // scoped package syntax is not a valid executable/file-system name.
  name: 'uvc-cube',
  productName: packageJson.productName,
  desktopName: packageJson.productName,
  version: packageJson.version,
  description: packageJson.description,
  author: 'Refinio',
  private: true,
  type: 'module',
  main: 'out/main/index.js',
}, null, 2)}\n`, 'utf8');
