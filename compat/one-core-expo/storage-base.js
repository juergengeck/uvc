import * as base64 from 'base64-js';
import RNFSImport from 'react-native-fs';
import { createError } from '@refinio/one.core/lib/errors.js';
import { CREATION_STATUS, STORAGE } from '@refinio/one.core/lib/storage-base-common.js';
import { getInstanceDirectory } from '@refinio/one.core/lib/instance.js';
import {
  DEFAULT_STORAGE_LOCATION,
  setBaseDirOrName,
} from '@refinio/one.core/lib/system/storage-base.js';
import { getTypeFromMicrodata } from '@refinio/one.core/lib/util/object.js';
import { isHash } from '@refinio/one.core/lib/util/type-checks.js';
import { isInteger, isString } from '@refinio/one.core/lib/util/type-checks-basic.js';
import { getArrayBuffer, getUint8Array } from '@refinio/one.core/lib/util/buffer.js';

const RNFS = RNFSImport?.default ?? RNFSImport;
const UTF8_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';

export const type = 'storage-base';

const STORAGE_DIRS = Object.values(STORAGE).reduce((dirs, storageType) => {
  dirs[storageType] = '';
  return dirs;
}, {});

let isInitialized = false;

function joinPath(...parts) {
  const normalized = parts
    .filter(part => part !== undefined && part !== null && part !== '')
    .map(part => String(part).replace(/\/+$/g, '').replace(/^\/+/g, ''));

  if (normalized.length === 0) {
    return '';
  }

  const first = String(parts.find(part => part !== undefined && part !== null && part !== '') ?? '');
  const prefix = first.startsWith('/') ? '/' : '';
  return prefix + normalized.join('/');
}

function dirname(filePath) {
  const index = filePath.lastIndexOf('/');
  if (index <= 0) {
    return index === 0 ? '/' : '.';
  }
  return filePath.slice(0, index);
}

function checkStorageInitialized() {
  if (STORAGE_DIRS[STORAGE.OBJECTS] === '') {
    throw createError('SB-NO-INIT2', {
      message: 'Storage must be initialized before performing file operations',
    });
  }
}

function getDocumentDirectoryPath() {
  if (!RNFS?.DocumentDirectoryPath) {
    throw createError('SB-NO-INIT2', {
      message: 'react-native-fs DocumentDirectoryPath is not available',
    });
  }
  return RNFS.DocumentDirectoryPath;
}

function getBaseDirectory(baseDirectoryName) {
  const dir = baseDirectoryName ?? getInstanceDirectory() ?? DEFAULT_STORAGE_LOCATION;

  if (!dir) {
    throw createError('SB-NOBASE', { message: 'Base directory not set' });
  }

  return dir;
}

function getFullBasePath(baseDirectoryName) {
  return joinPath(getDocumentDirectoryPath(), getBaseDirectory(baseDirectoryName));
}

async function ensureDirectory(dirPath) {
  if (!(await RNFS.exists(dirPath))) {
    await RNFS.mkdir(dirPath);
  }
}

async function readManifestFile(manifestPath) {
  try {
    if (!(await RNFS.exists(manifestPath))) {
      return [];
    }

    const content = await RNFS.readFile(manifestPath, UTF8_ENCODING);
    return content.split('\n').filter(line => line.trim().length > 0);
  } catch {
    return [];
  }
}

async function addToManifest(dirPath, filename) {
  const manifestPath = joinPath(dirPath, '.manifest');
  const manifest = await readManifestFile(manifestPath);

  if (!manifest.includes(filename)) {
    manifest.push(filename);
    await RNFS.writeFile(manifestPath, `${manifest.join('\n')}\n`, UTF8_ENCODING);
  }
}

async function removeFromManifest(dirPath, filename) {
  const manifestPath = joinPath(dirPath, '.manifest');
  const manifest = await readManifestFile(manifestPath);
  const index = manifest.indexOf(filename);

  if (index !== -1) {
    manifest.splice(index, 1);
    await RNFS.writeFile(manifestPath, `${manifest.join('\n')}\n`, UTF8_ENCODING);
  }
}

export function getStorageDir(storageType) {
  checkStorageInitialized();
  return STORAGE_DIRS[storageType];
}

export const getStorageDirForFileType = getStorageDir;

export function normalizeFilename(filename, storageType = STORAGE.OBJECTS) {
  checkStorageInitialized();

  if (!isString(filename)) {
    throw createError('SB-NORM1', { filename, storageType });
  }

  if (filename.startsWith(getDocumentDirectoryPath())) {
    return filename;
  }

  return joinPath(STORAGE_DIRS[storageType], filename);
}

export async function initStorage({
  instanceIdHash,
  wipeStorage = false,
  name,
} = {}) {
  if (!isHash(instanceIdHash)) {
    throw createError('SB-INIT1', { instanceIdHash });
  }

  setBaseDirOrName(name);

  try {
    const baseDir = getFullBasePath(name);
    await ensureDirectory(baseDir);

    const instanceDir = joinPath(baseDir, instanceIdHash);
    const instanceDirExists = await RNFS.exists(instanceDir);

    if (instanceDirExists && wipeStorage) {
      await RNFS.unlink(instanceDir);
      await ensureDirectory(instanceDir);
    } else if (!instanceDirExists) {
      await ensureDirectory(instanceDir);
    }

    for (const storageType of Object.values(STORAGE)) {
      const dirPath = joinPath(instanceDir, storageType);
      STORAGE_DIRS[storageType] = dirPath;
      await ensureDirectory(dirPath);

      const manifestPath = joinPath(dirPath, '.manifest');
      if (!(await RNFS.exists(manifestPath))) {
        await RNFS.writeFile(manifestPath, '\n', UTF8_ENCODING);
      }
    }
  } catch (error) {
    throw createError('SB-INIT-FAIL', {
      message: 'Failed to initialize storage',
      cause: error,
    });
  }
}

export function closeStorage() {
  for (const key of Object.keys(STORAGE_DIRS)) {
    STORAGE_DIRS[key] = '';
  }
}

export async function deleteStorage(instanceIdHash) {
  if (!isHash(instanceIdHash)) {
    throw createError('SB-DELST1', { instanceIdHash });
  }

  const instanceDir = joinPath(getFullBasePath(), instanceIdHash);

  if (await RNFS.exists(instanceDir)) {
    await RNFS.unlink(instanceDir);
  }
}

export async function doesStorageExist(instanceIdHash, name) {
  if (!isHash(instanceIdHash)) {
    throw createError('SB-DEST', { instanceIdHash });
  }

  try {
    return await RNFS.exists(joinPath(getFullBasePath(name), instanceIdHash));
  } catch {
    return false;
  }
}

export async function readUTF8TextFile(hash, storageType = STORAGE.OBJECTS) {
  const filePath = normalizeFilename(hash, storageType);

  try {
    if (!(await RNFS.exists(filePath))) {
      throw createError('SB-READ1', {
        name: 'FileNotFoundError',
        message: `File not found: ${filePath}`,
        hash,
        storageType,
      });
    }

    return await RNFS.readFile(filePath, UTF8_ENCODING);
  } catch (error) {
    if (error?.name === 'FileNotFoundError') {
      throw error;
    }
    throw createError('SB-READ2', error);
  }
}

export async function readTextFileSection(
  filename,
  offset,
  length,
  storageType = STORAGE.OBJECTS,
) {
  if (!isString(filename) || !isInteger(offset) || !isInteger(length)) {
    throw createError('SB-RASEC1', { filename, storageType, offset, length });
  }

  const content = await readUTF8TextFile(filename, storageType);
  const normalizedOffset = offset < 0 ? Math.max(content.length + offset, 0) : offset;

  if (normalizedOffset >= content.length) {
    throw createError('SB-RASEC4', { filename, storageType, offset, length });
  }

  return content.substring(normalizedOffset, normalizedOffset + length);
}

export async function writeUTF8TextFile(
  content,
  hash,
  storageType = STORAGE.OBJECTS,
) {
  if (!isString(content) || content.length === 0) {
    throw createError('SB-WRITE1', { hash, storageType });
  }

  const filePath = normalizeFilename(hash, storageType);

  try {
    if (await RNFS.exists(filePath)) {
      return CREATION_STATUS.EXISTS;
    }

    await ensureDirectory(dirname(filePath));
    await RNFS.writeFile(filePath, content, UTF8_ENCODING);
    await addToManifest(STORAGE_DIRS[storageType], hash);
    return CREATION_STATUS.NEW;
  } catch (error) {
    throw createError('SB-WRITE2', error);
  }
}

export async function writeUTF8SystemMapFile(contents, filename, storageType) {
  if (!isString(contents)) {
    throw createError('SB-WRMAP1', { filename, storageType });
  }

  if (storageType !== STORAGE.RMAPS && storageType !== STORAGE.VHEADS) {
    throw createError('SB-WRMAP3', { storageType });
  }

  const filePath = normalizeFilename(filename, storageType);

  try {
    const status = (await RNFS.exists(filePath)) ? CREATION_STATUS.EXISTS : CREATION_STATUS.NEW;
    await RNFS.writeFile(filePath, contents, UTF8_ENCODING);
    await addToManifest(STORAGE_DIRS[storageType], filename);
    return status;
  } catch (error) {
    throw createError('SB-WRMAP2', error);
  }
}

export async function appendUTF8SystemMapFile(contents, filename, storageType) {
  if (!isString(contents) || !isString(filename)) {
    throw createError('SB-APPEND1', { filename, storageType });
  }

  if (storageType !== STORAGE.RMAPS && storageType !== STORAGE.VHEADS) {
    throw createError('SB-APPEND3', { storageType });
  }

  const filePath = normalizeFilename(filename, storageType);

  try {
    const status = (await RNFS.exists(filePath)) ? CREATION_STATUS.EXISTS : CREATION_STATUS.NEW;
    await RNFS.appendFile(filePath, contents, UTF8_ENCODING);
    await addToManifest(STORAGE_DIRS[storageType], filename);
    return status;
  } catch (error) {
    throw createError('SB-APPEND4', error);
  }
}

export async function readPrivateBinaryRaw(filename) {
  const filePath = normalizeFilename(filename, STORAGE.PRIVATE);

  try {
    if (!(await RNFS.exists(filePath))) {
      throw createError('SB-READ-PRIV1', {
        name: 'FileNotFoundError',
        filename,
      });
    }

    return getArrayBuffer(base64.toByteArray(await RNFS.readFile(filePath, BASE64_ENCODING)));
  } catch (error) {
    throw createError('SB-READ-PRIV2', error);
  }
}

export async function writePrivateBinaryRaw(filename, contents) {
  try {
    const normalizedPath = normalizeFilename(filename, STORAGE.PRIVATE);
    await ensureDirectory(dirname(normalizedPath));
    await RNFS.writeFile(
      normalizedPath,
      base64.fromByteArray(getUint8Array(contents)),
      BASE64_ENCODING,
    );
  } catch (error) {
    throw createError('SB-WRITE-PRIV-BIN', {
      message: `Failed to write private binary file: ${filename}`,
      cause: error,
    });
  }
}

export async function readBinaryFile(hash) {
  return getArrayBuffer(base64.toByteArray(await RNFS.readFile(normalizeFilename(hash), BASE64_ENCODING)));
}

export async function writeBinaryFile(hash, content) {
  const filePath = normalizeFilename(hash);

  if (await RNFS.exists(filePath)) {
    return CREATION_STATUS.EXISTS;
  }

  await RNFS.writeFile(filePath, base64.fromByteArray(getUint8Array(content)), BASE64_ENCODING);
  await addToManifest(STORAGE_DIRS[STORAGE.OBJECTS], hash);
  return CREATION_STATUS.NEW;
}

export async function deleteFile(filename, storageType = STORAGE.OBJECTS) {
  if (!isString(filename)) {
    throw createError('SB-DEL1', { filename, storageType });
  }

  try {
    const filePath = normalizeFilename(filename, storageType);

    if (await RNFS.exists(filePath)) {
      await RNFS.unlink(filePath);
    }

    await removeFromManifest(STORAGE_DIRS[storageType], filename);
  } catch (error) {
    throw createError('SB-DEL', error);
  }
}

export async function exists(filename, storageType = STORAGE.OBJECTS) {
  try {
    return await RNFS.exists(normalizeFilename(filename, storageType));
  } catch {
    return false;
  }
}

export async function fileSize(filename, storageType = STORAGE.OBJECTS) {
  const filePath = normalizeFilename(filename, storageType);

  try {
    const stat = await RNFS.stat(filePath);
    return Number(stat.size);
  } catch (error) {
    throw createError('SB-FSIZE1', error);
  }
}

export async function listAllObjectHashes() {
  try {
    return await readManifestFile(joinPath(STORAGE_DIRS[STORAGE.OBJECTS], '.manifest'));
  } catch (error) {
    throw createError('SB-LIST', error);
  }
}

export async function listAllIdHashes() {
  try {
    return await readManifestFile(joinPath(STORAGE_DIRS[STORAGE.RMAPS], '.manifest'));
  } catch (error) {
    throw createError('SB-LIST-ID', error);
  }
}

export async function listAllReverseMapNames(prefix = '') {
  try {
    const allNames = await readManifestFile(joinPath(STORAGE_DIRS[STORAGE.RMAPS], '.manifest'));
    return prefix ? allNames.filter(name => name.startsWith(prefix)) : allNames;
  } catch (error) {
    throw createError('SB-LIST-RM', error);
  }
}

export async function getFileType(hash) {
  try {
    return getTypeFromMicrodata(await readUTF8TextFile(hash));
  } catch (error) {
    throw createError('SB-TYPE', error);
  }
}

export async function changeStoragePassword() {}

export async function init() {
  if (isInitialized) {
    return;
  }

  try {
    await ensureDirectory(getDocumentDirectoryPath());
    isInitialized = true;
  } catch (error) {
    throw createError('SB-INIT-FAIL', {
      message: 'Failed to initialize react-native-fs storage',
      cause: error,
    });
  }
}

export async function cleanup() {}

export async function makeDirectory(dirPath, options = {}) {
  if (!isString(dirPath)) {
    throw createError('SB-MKDIR1', { dirPath });
  }

  if (options.intermediates === false) {
    const parentDir = dirname(dirPath);
    if (!(await RNFS.exists(parentDir))) {
      throw createError('SB-MKDIR3', { dirPath, parentDir });
    }
  }

  await ensureDirectory(dirPath);
}

export async function copyFile(sourcePath, destPath) {
  await ensureDirectory(dirname(destPath));
  await RNFS.copyFile(sourcePath, destPath);
}

export function expoFileFromUri(uri) {
  return {
    uri,
    get exists() {
      return false;
    },
  };
}

export function expoDirectoryFromUri(uri) {
  return { uri };
}
