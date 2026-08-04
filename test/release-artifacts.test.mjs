import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const UVC_ROOT = path.resolve(import.meta.dirname, '..');
const ESP32_BUILDER = path.join(UVC_ROOT, 'scripts', 'build-esp32-release.mjs');
const DESCRIPTOR_BUILDER = path.join(UVC_ROOT, 'scripts', 'create-release-artifacts.mjs');
const DESCRIPTOR_VERIFIER = path.join(UVC_ROOT, 'scripts', 'verify-release-artifacts.mjs');
const RELEASE_PUBLISHER = path.join(UVC_ROOT, 'scripts', 'publish-release.sh');
const RELEASE_ORCHESTRATOR = path.join(UVC_ROOT, 'scripts', 'release-refinio-one.sh');
const RELEASE_INPUT_ASSERTION = path.join(UVC_ROOT, 'scripts', 'assert-release-inputs-clean.sh');
const RELEASE_VERSION_ASSIGNER = path.join(UVC_ROOT, 'scripts', 'assign-release-version.mjs');
const ESP32_RELEASE_DEFAULTS = path.join(UVC_ROOT, 'scripts', 'esp32-release-sdkconfig.defaults');

async function writeEsp32Fixture(root, ssid = 'your-ssid', password = 'your-password') {
  const project = path.join(root, 'esp32-project');
  const build = path.join(project, 'build');
  await mkdir(path.join(build, 'bootloader'), {recursive: true});
  await mkdir(path.join(build, 'partition_table'), {recursive: true});
  await writeFile(path.join(project, 'sdkconfig'), [
    'CONFIG_IDF_TARGET="esp32c6"',
    `CONFIG_ESP_WIFI_SSID="${ssid}"`,
    `CONFIG_ESP_WIFI_PASSWORD="${password}"`,
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(build, 'bootloader', 'bootloader.bin'), Buffer.from('bootloader'));
  await writeFile(path.join(build, 'partition_table', 'partition-table.bin'), Buffer.from('partitions'));
  await writeFile(path.join(build, 'esp32_quicvc_app.bin'), Buffer.from(`app\0${ssid}\0${password}\0`));
  await writeFile(path.join(build, 'flasher_args.json'), `${JSON.stringify({
    flash_settings: {flash_mode: 'dio', flash_size: '4MB', flash_freq: '80m'},
    flash_files: {
      '0x0': 'bootloader/bootloader.bin',
      '0x10000': 'esp32_quicvc_app.bin',
      '0x8000': 'partition_table/partition-table.bin',
    },
    extra_esptool_args: {chip: 'esp32c6'},
  })}\n`, 'utf8');
  return project;
}

test('ESP32 public bundle accepts bootstrap placeholders and emits the signed-publication shape', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uvc-esp32-release-'));
  const project = await writeEsp32Fixture(root);
  const output = path.join(root, 'output');
  const result = await execFileAsync(process.execPath, [
    ESP32_BUILDER,
    '--version', '1.2.3',
    '--project-dir', project,
    '--output-dir', output,
  ]);
  const paths = JSON.parse(result.stdout);
  const publication = JSON.parse(await readFile(paths.publicationPath, 'utf8'));
  assert.equal(publication.platform, 'esp32');
  assert.equal(publication.arch, 'esp32c6');
  assert.equal(publication.stableUrl, 'https://refinio.one/installers/uvc/uvc-esp32c6-1.2.3.tar.gz');
  assert.match(publication.sha256, /^[a-f0-9]{64}$/);
});

test('ESP32 public bundle rejects configured Wi-Fi credentials', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uvc-esp32-secret-'));
  const project = await writeEsp32Fixture(root, 'private-network', 'private-password');
  await assert.rejects(
    execFileAsync(process.execPath, [
      ESP32_BUILDER,
      '--version', '1.2.3',
      '--project-dir', project,
      '--output-dir', path.join(root, 'output'),
    ]),
    /Refusing to publish firmware built with non-placeholder Wi-Fi credentials/,
  );
});

test('ESP32 public build profile enables the BLE provisioning implementation', async () => {
  const defaults = await readFile(ESP32_RELEASE_DEFAULTS, 'utf8');
  assert.match(defaults, /^CONFIG_BT_ENABLED=y$/m);
  assert.match(defaults, /^CONFIG_BT_NIMBLE_ENABLED=y$/m);
  assert.doesNotMatch(defaults, /^CONFIG_ESP_WIFI_(?:SSID|PASSWORD)=/m);
});

test('UVC descriptor requires the exact non-macOS desktop, RIO, and ESP32 release set', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uvc-release-descriptor-'));
  const files = {};
  for (const name of ['windows', 'linux', 'rio', 'esp32']) {
    files[name] = path.join(root, `${name}.artifact`);
    await writeFile(files[name], name, 'utf8');
  }
  const output = path.join(root, 'uvc-release-artifacts.json');
  const result = await execFileAsync(process.execPath, [
    DESCRIPTOR_BUILDER,
    '--version', '1.2.3',
    '--windows', files.windows,
    '--linux', files.linux,
    '--rio', files.rio,
    '--esp32', files.esp32,
    '--output', output,
  ]);
  assert.equal(JSON.parse(result.stdout).artifactCount, 4);
  const descriptor = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(
    descriptor.artifacts.map(({platform, arch}) => `${platform}/${arch}`),
    ['windows/x64', 'linux/x64', 'groov-rio/armv7', 'esp32/esp32c6'],
  );

  const verification = await execFileAsync(process.execPath, [
    DESCRIPTOR_VERIFIER,
    '--version', '1.2.3',
    '--artifacts-file', output,
  ]);
  const verified = JSON.parse(verification.stdout);
  assert.equal(verified.version, '1.2.3');
  assert.equal(verified.artifacts.length, 4);
  assert.ok(verified.artifacts.every(artifact => /^[a-f0-9]{64}$/.test(artifact.sha256)));
});

test('release version assignment synchronizes package versions above the live UVC release', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uvc-release-version-'));
  const cubePackage = path.join(root, 'uvc.cube.package.json');
  const groovPackage = path.join(root, 'uvc.groov.package.json');
  const packageLock = path.join(root, 'package-lock.json');
  const manifest = path.join(root, 'current-release.json');
  await writeFile(cubePackage, `${JSON.stringify({name: '@uvc/uvc.cube', version: '1.2.3'})}\n`);
  await writeFile(groovPackage, `${JSON.stringify({name: '@uvc/groov-authority', version: '1.2.2'})}\n`);
  await writeFile(packageLock, `${JSON.stringify({
    name: '@uvc/uvc.cube',
    version: '1.2.3',
    lockfileVersion: 3,
    packages: {'': {name: '@uvc/uvc.cube', version: '1.2.3'}},
  })}\n`);
  await writeFile(manifest, `${JSON.stringify({releaseVersion: '1.2.3'})}\n`);

  const args = [
    RELEASE_VERSION_ASSIGNER,
    '--json',
    '--manifest-file', manifest,
    '--package-json', cubePackage,
    '--package-json', groovPackage,
  ];
  const assignment = JSON.parse((await execFileAsync(process.execPath, args)).stdout);
  assert.equal(assignment.liveVersion, '1.2.3');
  assert.equal(assignment.assignedVersion, '1.2.4');

  await execFileAsync(process.execPath, [...args.slice(0, 1), '--write', ...args.slice(2)]);
  assert.equal(JSON.parse(await readFile(cubePackage, 'utf8')).version, '1.2.4');
  assert.equal(JSON.parse(await readFile(groovPackage, 'utf8')).version, '1.2.4');
  const updatedPackageLock = JSON.parse(await readFile(packageLock, 'utf8'));
  assert.equal(updatedPackageLock.version, '1.2.4');
  assert.equal(updatedPackageLock.packages[''].version, '1.2.4');

  const assertionArgs = [
    RELEASE_VERSION_ASSIGNER,
    '--assert-version', '1.2.4',
    '--channel', 'latest',
    '--manifest-file', manifest,
    '--package-json', cubePackage,
    '--package-json', groovPackage,
  ];
  await execFileAsync(process.execPath, assertionArgs);

  await writeFile(manifest, `${JSON.stringify({releaseVersion: '1.2.4'})}\n`);
  await assert.rejects(
    execFileAsync(process.execPath, assertionArgs),
    /Refusing to publish latest with unchanged version 1\.2\.4/,
  );
  await execFileAsync(process.execPath, [...assertionArgs, '--allow-same-version']);

  updatedPackageLock.version = '1.2.3';
  updatedPackageLock.packages[''].version = '1.2.3';
  await writeFile(packageLock, `${JSON.stringify(updatedPackageLock)}\n`);
  await assert.rejects(
    execFileAsync(process.execPath, [...assertionArgs, '--allow-same-version']),
    /package-lock\.json entry for @uvc\/uvc\.cube \(1\.2\.3\)/,
  );
});

test('release orchestration preserves the signed publisher boundary and release provenance guards', async () => {
  for (const script of [RELEASE_ORCHESTRATOR, RELEASE_INPUT_ASSERTION, RELEASE_PUBLISHER]) {
    await execFileAsync('bash', ['-n', script]);
  }

  const orchestrator = await readFile(RELEASE_ORCHESTRATOR, 'utf8');
  assert.match(orchestrator, /assert-release-inputs-clean\.sh/);
  assert.match(orchestrator, /assign-release-version\.mjs/);
  assert.match(orchestrator, /create-release-artifacts\.mjs/);
  assert.match(orchestrator, /publish-release\.sh/);
  assert.match(orchestrator, /--dry-run/);
  assert.match(orchestrator, /value\.localVersion/);
  assert.match(orchestrator, /--skip-provenance-check is allowed only together with --dry-run/);
  assert.match(orchestrator, /--use-existing-descriptor/);
  assert.doesNotMatch(orchestrator, /--manifest-url/);

  const inputAssertion = await readFile(RELEASE_INPUT_ASSERTION, 'utf8');
  assert.match(inputAssertion, /status --porcelain --untracked-files=normal/);
  assert.match(inputAssertion, /ls-remote --heads origin/);
  assert.match(inputAssertion, /SOURCE_ROOT\/one/);
  assert.match(inputAssertion, /SOURCE_ROOT\/vger/);
  assert.match(inputAssertion, /SOURCE_ROOT\/refinio/);
});

test('UVC release publication is owned by the UVC workspace and delegates signing to Refinio', async () => {
  const publisher = await readFile(RELEASE_PUBLISHER, 'utf8');
  assert.match(publisher, /verify-release-artifacts\.mjs/);
  assert.match(publisher, /npm run test:release/);
  assert.match(publisher, /packages\/uvc\.cube\/package\.json/);
  assert.match(publisher, /packages\/uvc\.groov\/package\.json/);
  assert.match(publisher, /assign-release-version\.mjs/);
  assert.match(publisher, /--allow-same-version/);
  assert.doesNotMatch(publisher, /--manifest-url/);
  assert.match(publisher, /refinio\/packages\/refinio\.one/);
  assert.match(publisher, /publish-uvc-downloads\.sh/);
  assert.match(publisher, /--artifacts-file "\$ARTIFACTS_FILE"/);
});
