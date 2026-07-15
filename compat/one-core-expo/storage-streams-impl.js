import * as base64 from 'base64-js';
import RNFSImport from 'react-native-fs';
import { createError } from '@refinio/one.core/lib/errors.js';
import { createTempFileName, CREATION_STATUS, STORAGE } from '@refinio/one.core/lib/storage-base-common.js';
import { createSHA256Digest } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { createEventSource } from '@refinio/one.core/lib/util/one-event-source.js';
import { createTrackingPromise } from '@refinio/one.core/lib/util/promise.js';
import { isString } from '@refinio/one.core/lib/util/type-checks-basic.js';
import { getArrayBuffer, getUint8Array } from '@refinio/one.core/lib/util/buffer.js';
import { uint8arrayToHexString } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import { deleteFile } from './storage-base-delete-file.js';
import { getStorageDir } from './storage-base.js';

const RNFS = RNFSImport?.default ?? RNFSImport;
const UTF8_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';

export const type = 'StorageStreams';

function joinPath(...parts) {
  const normalized = parts
    .filter(part => part !== undefined && part !== null && part !== '')
    .map(part => String(part).replace(/\/+$/g, '').replace(/^\/+/g, ''));
  const first = String(parts.find(part => part !== undefined && part !== null && part !== '') ?? '');
  return `${first.startsWith('/') ? '/' : ''}${normalized.join('/')}`;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(getUint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return output;
}

export function createFileReadStream(hash, encoding) {
  if (hash === undefined) {
    throw createError('SST-CR1');
  }

  const eventSource = createEventSource();
  const streamTracker = createTrackingPromise();
  let paused = false;
  let started = false;

  async function readFile() {
    if (started || paused) {
      return;
    }

    started = true;

    try {
      const filePath = joinPath(getStorageDir(STORAGE.OBJECTS), hash);

      if (!(await RNFS.exists(filePath))) {
        throw createError('SST-CR3', {
          name: 'FileNotFoundError',
          filename: hash,
          type: STORAGE.OBJECTS,
        });
      }

      if (encoding === 'utf8') {
        eventSource.dispatch(await RNFS.readFile(filePath, UTF8_ENCODING));
      } else {
        const content = await RNFS.readFile(filePath, BASE64_ENCODING);
        if (encoding === 'base64') {
          eventSource.dispatch(content);
        } else {
          eventSource.dispatch(getArrayBuffer(base64.toByteArray(content)));
        }
      }

      streamTracker.resolve();
    } catch (error) {
      streamTracker.reject(error);
    }
  }

  eventSource.onListenerChange = (_oldSize, newSize) => {
    if (newSize > 1) {
      throw createError('SST-CR2');
    }

    if (newSize === 1) {
      paused = false;
      void readFile();
    }
  };

  return {
    encoding,
    onData: eventSource.consumer,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      void readFile();
    },
    cancel: () => {
      paused = true;
      streamTracker.reject(createError('SST-CR6'));
    },
    promise: streamTracker.promise,
  };
}

export function createFileWriteStream(encoding, filename, storageType = STORAGE.OBJECTS) {
  if (isString(filename) && storageType === STORAGE.OBJECTS) {
    throw createError('SST-PARA1', { filename });
  }

  const tmpFileName = createTempFileName();
  const writeDir = getStorageDir(STORAGE.TMP);
  const tmpFilePath = joinPath(writeDir, tmpFileName);
  const chunks = [];
  const streamTracker = createTrackingPromise();
  let closed = false;

  return {
    encoding,
    promise: streamTracker.promise,
    write(data) {
      if (closed) {
        throw createError('SST-CW5');
      }

      if (encoding === 'base64' || encoding === 'utf8') {
        if (!isString(data)) {
          throw createError('SST-CW2');
        }
        chunks.push(data);
        return;
      }

      if (isString(data)) {
        throw createError('SST-CW3', { encoding });
      }
      chunks.push(getUint8Array(data));
    },
    async cancel() {
      closed = true;
      streamTracker.reject(createError('SST-CAN'));
      await deleteFile(tmpFileName, STORAGE.TMP).catch(() => {});
    },
    async end() {
      if (closed) {
        throw createError('SST-WEND', new Error('Stream already closed'));
      }

      closed = true;

      try {
        let bytes;
        let textContent;

        if (encoding === 'utf8') {
          textContent = chunks.join('');
          bytes = new TextEncoder().encode(textContent);
        } else if (encoding === 'base64') {
          bytes = base64.toByteArray(chunks.join(''));
        } else {
          bytes = concatUint8Arrays(chunks);
        }

        const hash = filename ?? uint8arrayToHexString(await createSHA256Digest(bytes));
        const targetType = storageType ?? STORAGE.OBJECTS;
        const targetPath = joinPath(getStorageDir(targetType), hash);
        const result = {
          hash,
          status: CREATION_STATUS.NEW,
        };

        if (await RNFS.exists(targetPath)) {
          result.status = CREATION_STATUS.EXISTS;
          streamTracker.resolve(result);
          return result;
        }

        if (encoding === 'utf8') {
          await RNFS.writeFile(tmpFilePath, textContent, UTF8_ENCODING);
        } else {
          await RNFS.writeFile(tmpFilePath, base64.fromByteArray(bytes), BASE64_ENCODING);
        }

        await RNFS.moveFile(tmpFilePath, targetPath);
        streamTracker.resolve(result);
        return result;
      } catch (error) {
        streamTracker.reject(createError('SST-WEND', error));
        throw error;
      }
    },
  };
}

export async function init() {}

export async function cleanup() {}
