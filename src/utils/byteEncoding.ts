const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const hasSecond = offset + 1 < bytes.length;
    const hasThird = offset + 2 < bytes.length;
    const second = hasSecond ? bytes[offset + 1] : 0;
    const third = hasThird ? bytes[offset + 2] : 0;
    const value = (first << 16) | (second << 8) | third;

    encoded += BASE64_ALPHABET[(value >>> 18) & 0x3f];
    encoded += BASE64_ALPHABET[(value >>> 12) & 0x3f];
    encoded += hasSecond ? BASE64_ALPHABET[(value >>> 6) & 0x3f] : '=';
    encoded += hasThird ? BASE64_ALPHABET[value & 0x3f] : '=';
  }
  return encoded;
}

export function base64ToBytes(encoded: string): Uint8Array {
  if (encoded.length === 0) return new Uint8Array(0);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid base64 data');
  }

  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((encoded.length / 4) * 3 - padding);
  let outputOffset = 0;

  for (let offset = 0; offset < encoded.length; offset += 4) {
    const first = BASE64_ALPHABET.indexOf(encoded[offset]);
    const second = BASE64_ALPHABET.indexOf(encoded[offset + 1]);
    const third = encoded[offset + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(encoded[offset + 2]);
    const fourth = encoded[offset + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(encoded[offset + 3]);
    const value = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputOffset < bytes.length) bytes[outputOffset++] = (value >>> 16) & 0xff;
    if (outputOffset < bytes.length) bytes[outputOffset++] = (value >>> 8) & 0xff;
    if (outputOffset < bytes.length) bytes[outputOffset++] = value & 0xff;
  }

  return bytes;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const combined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
