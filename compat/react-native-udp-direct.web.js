export const UDP_EVENTS = {
  MESSAGE: 'onMessage',
  ERROR: 'onError',
  CLOSE: 'onClose',
};

export function isJSIAvailable() {
  return false;
}

export function createUDPSocket() {
  throw new Error('Native UDP sockets are unavailable in the browser');
}

export class UDPSocketJSI {
  constructor() {
    throw new Error('Native UDP sockets are unavailable in the browser');
  }
}

export default null;
