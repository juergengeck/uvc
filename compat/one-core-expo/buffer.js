import { Buffer as NodeBuffer } from 'buffer';

export const type = 'Buffer';
export const Buffer = NodeBuffer;

export function ensureUint8ArrayisArrayBuffer(uint8Array) {
  if (uint8Array.buffer instanceof ArrayBuffer && uint8Array.byteOffset === 0) {
    return uint8Array;
  }
  const output = new Uint8Array(uint8Array.byteLength);
  output.set(uint8Array);
  return output;
}

export function getUint8Array(buffer) {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  return new Uint8Array(buffer);
}

export function getArrayBufferFromBuffer(buffer) {
  return toArrayBuffer(buffer);
}

export function getArrayBuffer(buffer) {
  return toArrayBuffer(buffer);
}

export function toArrayBuffer(data) {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const output = new ArrayBuffer(uint8.byteLength);
  new Uint8Array(output).set(uint8);
  return output;
}

export function ensureArrayBuffer(data) {
  return toArrayBuffer(data);
}

export function fromBinary(data) {
  if (Array.isArray(data)) {
    return NodeBuffer.from(data);
  }
  return NodeBuffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
}

export function fromText(str, encoding = 'utf8') {
  return NodeBuffer.from(str, encoding);
}

export function fromString(str) {
  return NodeBuffer.from(str, 'utf8');
}

export function allocBinary(size) {
  return NodeBuffer.alloc(size);
}

export function allocText(size) {
  return NodeBuffer.alloc(size);
}

export function toBuffer(data) {
  return fromBinary(data);
}

export function concat(buffers, totalLength) {
  return NodeBuffer.concat(buffers.map(buffer => NodeBuffer.from(buffer)), totalLength);
}

export function from(data, encoding) {
  return NodeBuffer.from(data, encoding);
}

export async function init() {}
export async function cleanup() {}
export function isDirectBufferSupported() { return false; }
export function createDirectBuffer() { return null; }
export function releaseDirectBuffer() {}
export function directBufferToBinary() { return null; }
export function copyToDirectBuffer() { return false; }
export async function validateDirectBuffer() { return false; }
export function setPlatformForBuf() {}
