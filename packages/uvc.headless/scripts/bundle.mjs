import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
execFileSync('pnpm', ['build'], {cwd: root, stdio: 'inherit'});
const outdir = path.join(root, 'bundle');
await mkdir(outdir, {recursive: true});
await build({
  absWorkingDir: root,
  entryPoints: ['dist/cli.js'],
  outfile: path.join(outdir, 'uvc-headless.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: [
    '@refinio/one.models/lib/recipes/GroupAccess.js',
    '@refinio/one.core/lib/access-control.js',
    'canvas', 'jimp', 'link-preview-js', 'node-llama-cpp', '@node-llama-cpp/*',
    '@vger/vger.core/modules/BaileysModule.js', '@refinio/chat.baileys',
    '@refinio/chat.baileys/*', '@whiskeysockets/baileys', '@whiskeysockets/baileys/*',
  ],
  banner: {js: 'import {createRequire as __cr} from "node:module"; import {fileURLToPath as __fu} from "node:url"; import {dirname as __dn} from "node:path"; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);'},
});
execFileSync(process.execPath, [path.join(outdir, 'uvc-headless.mjs'), '--help'], {stdio: 'inherit'});
