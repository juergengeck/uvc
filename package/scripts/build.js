#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from './_build-common.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
async function run() {
    console.log('########## one.core: Build ##########');
    await build();
    console.log('########## one.core: End build ##########');
}
process.chdir(join(__dirname, '..'));
run().catch(err => {
    console.log(err.message);
    process.exit(1);
});
//# sourceMappingURL=build.js.map