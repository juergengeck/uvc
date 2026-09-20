/**
 * Builds the lab lane worker bundle.
 *
 * Metro cannot bundle Web Workers, so the `/lab` route spawns the lane
 * worker by URL instead. This script bundles `src/lab/laneWorker.ts` (plus
 * the whole lane realm: laneInstance, models, one.core browser platform)
 * into `public/lane.worker.js`, which the Expo web export serves as a static
 * asset next to the route. The bundle is a build artifact, not source: it
 * is git-ignored and rebuilt by this script.
 *
 * Usage: `node scripts/build-lane-worker.mjs [--no-minify]`
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const minify = !process.argv.includes('--no-minify');

const args = [
  '-y',
  'esbuild',
  'src/lab/laneWorker.ts',
  '--bundle',
  '--platform=browser',
  '--target=es2020',
  '--format=iife',
  '--outfile=public/lane.worker.js',
  '--sourcemap',
  '--log-level=warning',
];
if (minify) args.push('--minify');

console.log(`building lane worker bundle (${minify ? 'minified' : 'unminified'})…`);
execFileSync('npx', args, { cwd: root, stdio: 'inherit' });
console.log('lane worker bundle ready: public/lane.worker.js');
