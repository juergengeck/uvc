import React from 'react';

/**
 * A hook that returns a memoized callback that always has the latest version of its dependencies,
 * without changing its reference. This is useful for callbacks that need to be passed to child
 * components but should always have access to the latest values from their closure.
 */
function useLatestCallback(callback) {
  const callbackRef = React.useRef(callback);

  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return React.useCallback((...args) => {
    return callbackRef.current(...args);
  }, []);
}

// Support both ESM and CommonJS exports
export default useLatestCallback;

// For CommonJS compatibility
if (typeof module !== 'undefined') {
  module.exports = useLatestCallback;
  module.exports.default = useLatestCallback;
} 