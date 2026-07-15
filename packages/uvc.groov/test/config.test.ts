import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGroovAuthorityEnvironment } from '../src/config.js';

test('parses explicit hardware targeting without inventing module or channel defaults', () => {
  const config = parseGroovAuthorityEnvironment({
    GROOV_AUTHORITY_ID: 'groov-lab',
    GROOV_MANAGE_BASE_URL: 'https://opto-05-bd-39.local',
    GROOV_MANAGE_API_KEY: 'secret',
    GROOV_MODULE_INDEX: '3',
    GROOV_CHANNEL_INDEX: '7',
    GROOV_OUTPUT_KIND: 'digital',
  });

  assert.equal(config.controller.ioDevice, 'local');
  assert.equal(config.controller.moduleIndex, 3);
  assert.equal(config.controller.channelIndex, 7);
  assert.equal(config.controller.rejectUnauthorized, true);
});

test('requires module and channel configuration before runtime composition', () => {
  const base = {
    GROOV_AUTHORITY_ID: 'groov-lab',
    GROOV_MANAGE_BASE_URL: 'https://groov.example',
    GROOV_MANAGE_API_KEY: 'secret',
    GROOV_OUTPUT_KIND: 'digital',
  };

  assert.throws(
    () => parseGroovAuthorityEnvironment(base),
    /GROOV_MODULE_INDEX is required/,
  );
  assert.throws(
    () => parseGroovAuthorityEnvironment({ ...base, GROOV_MODULE_INDEX: '0' }),
    /GROOV_CHANNEL_INDEX is required/,
  );
});
