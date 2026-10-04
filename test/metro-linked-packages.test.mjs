import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {loadConfig} = require('metro-config');
const DependencyGraph = require('metro/src/node-haste/DependencyGraph');
const projectRoot = path.resolve(import.meta.dirname, '..');
const dependency = name => ({name, data: {isESMImport: true, locs: []}});

test('Metro indexes linked ESP32 sources and resolves their app-installed dependencies', async () => {
  const config = await loadConfig({cwd: projectRoot});
  const graph = await DependencyGraph.load({
    ...config,
    maxWorkers: 1,
    reporter: {update() {}},
    // Use a fresh deterministic crawl without changing the developer's cache.
    resolver: {...config.resolver, useWatchman: false, platforms: ['ios', 'android', 'web']},
    unstable_fileMapCacheManagerFactory: () => ({
      async read() { return null; },
      async write() {},
      async end() {},
    }),
  }, {watch: false});

  try {
    for (const platform of ['web', 'ios']) {
      const entry = graph.resolveDependency(
        path.join(projectRoot, 'index.js'), dependency('@refinio/esp32.host'), platform, {},
      );
      assert.equal(entry.type, 'sourceFile');
      assert.equal(entry.filePath, realpathSync(path.join(
        projectRoot, 'node_modules/@refinio/esp32.host/dist/index.js',
      )));
      const hash = await graph.getOrComputeSha1(entry.filePath);
      assert.equal(hash.sha1, createHash('sha1').update(readFileSync(entry.filePath)).digest('hex'));

      const manager = graph.resolveDependency(
        entry.filePath, dependency('./net/QuicConnectionManager.js'), platform, {},
      );
      await graph.getOrComputeSha1(manager.filePath);
      const debug = graph.resolveDependency(manager.filePath, dependency('debug'), platform, {});
      assert.equal(debug.type, 'sourceFile');
      assert.ok(debug.filePath.startsWith(path.join(projectRoot, 'node_modules/debug/')));
      await graph.getOrComputeSha1(debug.filePath);
    }
  } finally {
    await graph.end();
  }
});
