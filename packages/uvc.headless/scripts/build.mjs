import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const vger = fileURLToPath(new URL('../../../../vger', import.meta.url));
// Prepare canonical shared packages through the peer-aware host build.
execFileSync('pnpm', ['build:feature', '--platform', 'nodejs', '--', '@vger/vger.headless...', '@refinio/uvc.core...'], {cwd: vger, stdio: 'inherit'});
execFileSync('npm', ['run', 'build'], {cwd: fileURLToPath(new URL('../../uvc.groov', import.meta.url)), stdio: 'inherit'});
execFileSync('pnpm', ['build:app'], {cwd: root, stdio: 'inherit'});
