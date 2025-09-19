// @ts-check

/**
 * Fix for missing folly/coro/Coroutine.h header in React Native
 * 
 * This plugin creates a stub empty implementation of the missing header
 * to allow the build to succeed.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Stub header content - empty implementation that prevents build errors
const STUB_HEADER_CONTENT = `
// Stub implementation for folly/coro/Coroutine.h
// This file is created by the withFollyCoroutinesFix plugin
// to work around missing header issues in React Native builds

#pragma once

namespace folly {
namespace coro {
  // Empty stub implementation
}
}
`;

/**
 * Creates a stub implementation of folly/coro/Coroutine.h if it doesn't exist
 */
const withFollyCoroutinesFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        const { projectRoot } = config.modRequest;
        const follyHeaderDir = path.join(projectRoot, 'ios', 'Pods', 'Headers', 'Public', 'RCT-Folly', 'folly', 'coro');
        const follyHeaderPath = path.join(follyHeaderDir, 'Coroutine.h');
        
        console.log(`[FollyCoroutinesFix] Checking for folly/coro/Coroutine.h at ${follyHeaderPath}`);
        
        // Only create the stub if the directory exists but the file doesn't
        if (fs.existsSync(path.dirname(follyHeaderDir)) && !fs.existsSync(follyHeaderPath)) {
          // Create coro directory if it doesn't exist
          if (!fs.existsSync(follyHeaderDir)) {
            fs.mkdirSync(follyHeaderDir, { recursive: true });
            console.log(`[FollyCoroutinesFix] Created directory ${follyHeaderDir}`);
          }
          
          // Write stub header
          fs.writeFileSync(follyHeaderPath, STUB_HEADER_CONTENT);
          console.log(`[FollyCoroutinesFix] Created stub Coroutine.h at ${follyHeaderPath}`);
        } else if (fs.existsSync(follyHeaderPath)) {
          console.log(`[FollyCoroutinesFix] Header already exists at ${follyHeaderPath}`);
        } else {
          console.log(`[FollyCoroutinesFix] Parent directory does not exist yet, will need to run after pod install`);
        }
      } catch (error) {
        console.error(`[FollyCoroutinesFix] Error creating stub header: ${error}`);
      }
      
      return config;
    }
  ]);
};

module.exports = withFollyCoroutinesFix; 