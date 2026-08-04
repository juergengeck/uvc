import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, '..');
const DEPLOYMENT_ROOT = path.join(PACKAGE_ROOT, 'deployment');
const SCRIPTS_ROOT = path.join(PACKAGE_ROOT, 'scripts');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', ...options});
  if (result.status !== 0) {
    assert.fail(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function runFailure(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', ...options});
  assert.notEqual(result.status, 0, `${command} unexpectedly succeeded`);
  return `${result.stderr}${result.stdout}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function publicKeyHex(publicKey) {
  return publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('hex');
}

function signHex(payload, privateKey) {
  return sign(null, Buffer.from(payload), privateKey).toString('hex');
}

function makeChain(root, publisher, dataHash) {
  const now = Date.now();
  const rootPublicKey = publicKeyHex(root.publicKey);
  const subjectPublicKey = publicKeyHex(publisher.publicKey);
  const claims = {canSign: true, purposes: ['signing']};
  const cert = {
    subject: 'uvc-rio-test',
    subjectPublicKey,
    issuerPublicKey: rootPublicKey,
    validFrom: now - 60_000,
    validUntil: now + 60_000,
    claims,
  };
  cert.signature = signHex([
    cert.subject,
    cert.subjectPublicKey,
    cert.issuerPublicKey,
    String(cert.validFrom),
    String(cert.validUntil),
    JSON.stringify(cert.claims),
  ].join('|'), root.privateKey);
  const packageSignature = {
    dataHash,
    publisherPublicKey: subjectPublicKey,
    signedAt: now,
  };
  packageSignature.signature = signHex([
    packageSignature.dataHash,
    packageSignature.publisherPublicKey,
    String(packageSignature.signedAt),
  ].join('|'), publisher.privateKey);
  return {rootPublicKey, publisherCert: cert, packageSignature};
}

function canonicalArtifactInput(artifact) {
  return {
    platform: artifact.platform,
    arch: artifact.arch,
    label: artifact.label,
    stableUrl: artifact.stableUrl,
    sourceFilename: artifact.sourceFilename,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256,
    packageMetadataHash: artifact.packageMetadataHash,
    signatureChain: artifact.signatureChain ?? '',
  };
}

function canonicalManifest(manifest) {
  return JSON.stringify({
    schemaVersion: 1,
    channel: manifest.channel,
    releaseVersion: manifest.releaseVersion,
    publishedAt: manifest.publishedAt,
    releaseRootPublicKey: manifest.releaseRootPublicKey,
    releaseRootFingerprint: manifest.releaseRootFingerprint,
    merkleRoot: manifest.merkleRoot,
    artifacts: manifest.artifacts.map(artifact => ({
      ...canonicalArtifactInput(artifact),
      leafHash: artifact.leafHash,
      merkleProof: artifact.merkleProof,
    })),
  });
}

test('deployment shell scripts are syntactically valid and keep secrets out of the unit', async () => {
  const shellScripts = [
    'bin/backup',
    'bin/doctor',
    'bin/install',
    'bin/restore',
    'bin/rio-common',
    'bin/rollback',
    'bin/run',
  ];
  for (const relativePath of shellScripts) {
    run('sh', ['-n', path.join(DEPLOYMENT_ROOT, relativePath)]);
  }
  run('sh', ['-n', path.join(SCRIPTS_ROOT, 'install-rio.sh')]);
  run('bash', ['-n', path.join(SCRIPTS_ROOT, 'deploy-headless-bundle.sh')]);

  const unit = await readFile(path.join(DEPLOYMENT_ROOT, 'systemd/uvc-headless.service'), 'utf8');
  assert.match(unit, /User=@UVC_USER@/);
  assert.match(unit, /EnvironmentFile=-@UVC_ROOT@\/shared\/uvc\.env/);
  assert.match(unit, /NoNewPrivileges=true/);
  assert.doesNotMatch(unit, /GROOV_MANAGE_API_KEY=/);

  const runner = await readFile(path.join(DEPLOYMENT_ROOT, 'bin/run'), 'utf8');
  assert.match(runner, /--host 127\.0\.0\.1/);
  assert.match(runner, /--device-type groov/);
  assert.match(runner, /--no-mcp/);
  assert.match(runner, /pwd -P/);
  assert.doesNotMatch(runner, /--name/);
});

test('release builder creates the declared archive and publication descriptor', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'uvc-rio-package-test-'));
  const bundle = path.join(temporary, 'bundle.mjs');
  const output = path.join(temporary, 'output');
  const extracted = path.join(temporary, 'extracted');
  await writeFile(bundle, [
    'if (process.argv.includes("--help")) {',
    '  console.log("VGER Headless Server");',
    '} else {',
    '  console.log("fixture");',
    '}',
    '',
  ].join('\n'), 'utf8');

  run(process.execPath, [
    path.join(SCRIPTS_ROOT, 'build-rio-release.mjs'),
    '--bundle', bundle,
    '--version', '1.2.3',
    '--output-dir', output,
    '--built-at', '2026-07-20T00:00:00.000Z',
  ], {env: {...process.env, GIT_COMMIT: 'a'.repeat(40)}});

  const archive = path.join(output, 'uvc-rio-1.2.3.tar.gz');
  const publication = JSON.parse(await readFile(path.join(output, 'uvc-rio-1.2.3.publication.json'), 'utf8'));
  assert.equal(publication.platform, 'groov-rio');
  assert.equal(publication.arch, 'armv7');
  assert.deepEqual(publication.compatibility.models, ['GRV-R7-MM1001-10']);
  assert.match(publication.sha256, /^[a-f0-9]{64}$/);

  await mkdir(extracted);
  run('tar', ['-xzf', archive, '-C', extracted]);
  const releaseRoot = path.join(extracted, 'uvc-rio-1.2.3');
  const buildInfo = JSON.parse(await readFile(path.join(releaseRoot, 'build-info.json'), 'utf8'));
  const release = JSON.parse(await readFile(path.join(releaseRoot, 'release.json'), 'utf8'));
  assert.equal(buildInfo.compatibility.minimumFirmware, '4.1.2');
  assert.deepEqual(buildInfo.compatibility.nodeMajors, [20, 22]);
  assert.ok(release.files.some(entry => entry.path === 'app/uvc-headless.mjs'));
  assert.ok(release.files.some(entry => entry.path === 'bin/install'));

  const publicFailure = runFailure(process.execPath, [
    path.join(SCRIPTS_ROOT, 'build-rio-release.mjs'),
    '--bundle', bundle,
    '--version', '1.2.4',
    '--output-dir', path.join(temporary, 'public-output'),
    '--public',
  ], {env: {...process.env, GIT_COMMIT: 'b'.repeat(40)}});
  assert.match(publicFailure, /complete --notices/);
});

test('encrypted recovery payload round-trips and rejects the wrong password', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'uvc-rio-recovery-test-'));
  const input = path.join(temporary, 'state.tar.gz');
  const encrypted = path.join(temporary, 'state.uvc-rio-backup');
  const restored = path.join(temporary, 'restored.tar.gz');
  await writeFile(input, Buffer.from('private identity and state fixture'));

  const cryptoScript = path.join(DEPLOYMENT_ROOT, 'bin/recovery-crypto.mjs');
  run(process.execPath, [cryptoScript, 'encrypt', input, encrypted], {
    env: {...process.env, UVC_BACKUP_PASSWORD: 'correct horse battery staple'},
  });
  run(process.execPath, [cryptoScript, 'decrypt', encrypted, restored], {
    env: {...process.env, UVC_BACKUP_PASSWORD: 'correct horse battery staple'},
  });
  assert.deepEqual(await readFile(restored), await readFile(input));

  const failure = runFailure(process.execPath, [cryptoScript, 'decrypt', encrypted, path.join(temporary, 'wrong')], {
    env: {...process.env, UVC_BACKUP_PASSWORD: 'this password is incorrect'},
  });
  assert.match(failure, /authenticate data|unable to authenticate/i);
});

test('release verifier checks the signed manifest and downloaded archive', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'uvc-rio-verifier-test-'));
  const archive = path.join(temporary, 'uvc-rio-1.2.3.tar.gz');
  const manifestPath = path.join(temporary, 'current-release.json');
  await writeFile(archive, Buffer.from('signed archive fixture'));

  const archiveBytes = await readFile(archive);
  const archiveHash = sha256(archiveBytes);
  const root = generateKeyPairSync('ed25519');
  const publisher = generateKeyPairSync('ed25519');
  const rootHex = publicKeyHex(root.publicKey);
  const artifact = {
    platform: 'groov-rio',
    arch: 'armv7',
    label: 'UVC for Opto 22 groov RIO',
    stableUrl: 'https://refinio.one/installers/uvc/uvc-rio-1.2.3.tar.gz',
    sourceFilename: 'uvc-rio-1.2.3.tar.gz',
    sizeBytes: archiveBytes.length,
    sha256: archiveHash,
    packageMetadataHash: 'ab'.repeat(32),
  };
  artifact.signatureChain = JSON.stringify(makeChain(root, publisher, archiveHash));
  const secondaryHash = sha256(Buffer.from('secondary signed artifact'));
  const secondaryArtifact = {
    platform: 'darwin',
    arch: 'arm64',
    label: 'Secondary test artifact',
    stableUrl: 'https://refinio.one/installers/test-secondary.pkg',
    sourceFilename: 'test-secondary.pkg',
    sizeBytes: 25,
    sha256: secondaryHash,
    packageMetadataHash: 'cd'.repeat(32),
  };
  secondaryArtifact.signatureChain = JSON.stringify(makeChain(root, publisher, secondaryHash));

  const manifest = {
    schemaVersion: 1,
    channel: 'stable',
    releaseVersion: '1.2.3',
    publishedAt: '2026-07-20T00:00:00.000Z',
    releaseRootPublicKey: rootHex,
    releaseRootFingerprint: sha256(Buffer.from(rootHex, 'hex')).slice(0, 16),
  };
  artifact.leafHash = sha256(JSON.stringify({
    channel: manifest.channel,
    releaseVersion: manifest.releaseVersion,
    ...canonicalArtifactInput(artifact),
  }));
  secondaryArtifact.leafHash = sha256(JSON.stringify({
    channel: manifest.channel,
    releaseVersion: manifest.releaseVersion,
    ...canonicalArtifactInput(secondaryArtifact),
  }));
  artifact.merkleProof = [{siblingHash: secondaryArtifact.leafHash, position: 'right'}];
  secondaryArtifact.merkleProof = [{siblingHash: artifact.leafHash, position: 'left'}];
  manifest.merkleRoot = sha256(Buffer.concat([
    Buffer.from(artifact.leafHash, 'hex'),
    Buffer.from(secondaryArtifact.leafHash, 'hex'),
  ]));
  // Keep linux first deliberately: canonicalization must preserve signed order,
  // not sort the secondary darwin artifact ahead of it.
  manifest.artifacts = [artifact, secondaryArtifact];
  manifest.manifestSignatureChain = makeChain(root, publisher, sha256(canonicalManifest(manifest)));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const verifier = path.join(SCRIPTS_ROOT, 'verify-refinio-release.mjs');
  const url = run(process.execPath, [
    verifier,
    '--manifest', manifestPath,
    '--archive', archive,
    '--root', rootHex,
    '--print-url',
  ]);
  assert.equal(url, artifact.stableUrl);

  await writeFile(archive, Buffer.from('tampered archive fixture'));
  const failure = runFailure(process.execPath, [
    verifier,
    '--manifest', manifestPath,
    '--archive', archive,
    '--root', rootHex,
  ]);
  assert.match(failure, /archive hash/);
});
