#!/usr/bin/env node
import {main} from '@vger/vger.headless/dist/headless-cli.js';
import {configureUvcHeadless} from './UvcHeadlessRuntime.js';

// Consume UVC-owned arguments before invoking the shared host CLI.
let stateFile: string | undefined;
const index = process.argv.indexOf('--uvc-provisioning-state');
if (index >= 0) {
  stateFile = process.argv[index + 1];
  if (!stateFile || stateFile.startsWith('--')) throw new Error('--uvc-provisioning-state requires a file');
  process.argv.splice(index, 2);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.error('UVC Headless Server');
  console.error('  --uvc-provisioning-state <file>  Device-local first-claim state (env: UVC_PROVISIONING_STATE_FILE)');
}
main(config => configureUvcHeadless(config, stateFile)).catch(error => {
  console.error('[UVC] Failed to start:', error);
  process.exitCode = 1;
});
