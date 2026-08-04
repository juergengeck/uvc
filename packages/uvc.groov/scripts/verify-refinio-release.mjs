#!/usr/bin/env node

import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';

const PINNED_RELEASE_ROOT = '5e76f9484830a557134fe10abb240f066838cd20461a7fe4fc892a612cf84a20';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function fail(message) {
  process.stderr.write(`uvc-rio verification failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {platform: 'groov-rio', arch: 'armv7', root: PINNED_RELEASE_ROOT, 'print-url': false};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--print-url') {
      result['print-url'] = true;
      continue;
    }
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for ${token}`);
    result[token.slice(2)] = value;
    index += 1;
  }
  return result;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function sha256File(filePath) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', chunk => digest.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return digest.digest('hex');
}

function rawEd25519PublicKey(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) fail('invalid Ed25519 public key');
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

function verifyDetached(payload, signatureHex, publicKeyHex) {
  if (!/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  return verifySignature(
    null,
    Buffer.from(payload),
    rawEd25519PublicKey(publicKeyHex),
    Buffer.from(signatureHex, 'hex'),
  );
}

function parseChain(value) {
  const chain = typeof value === 'string' ? JSON.parse(value) : value;
  if (!chain?.rootPublicKey || !chain?.publisherCert || !chain?.packageSignature) {
    fail('signature chain is incomplete');
  }
  return chain;
}

function verifyChain(value, dataHash, pinnedRoot) {
  const chain = parseChain(value);
  const cert = chain.publisherCert;
  const signature = chain.packageSignature;
  if (chain.rootPublicKey !== pinnedRoot || cert.issuerPublicKey !== pinnedRoot) fail('signature root mismatch');
  if (Date.now() < cert.validFrom || Date.now() > cert.validUntil) fail('publisher certificate is outside its validity window');
  const certPayload = [
    cert.subject,
    cert.subjectPublicKey,
    cert.issuerPublicKey,
    String(cert.validFrom),
    String(cert.validUntil),
    JSON.stringify(cert.claims),
  ].join('|');
  if (!verifyDetached(certPayload, cert.signature, pinnedRoot)) fail('publisher certificate signature is invalid');
  if (signature.dataHash !== dataHash) fail('package signature hash mismatch');
  if (signature.publisherPublicKey !== cert.subjectPublicKey) fail('publisher key chain mismatch');
  const signaturePayload = [signature.dataHash, signature.publisherPublicKey, String(signature.signedAt)].join('|');
  if (!verifyDetached(signaturePayload, signature.signature, cert.subjectPublicKey)) fail('package signature is invalid');
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
  const artifacts = manifest.artifacts.map(artifact => ({
    ...canonicalArtifactInput(artifact),
    leafHash: artifact.leafHash,
    merkleProof: artifact.merkleProof.map(step => ({siblingHash: step.siblingHash, position: step.position})),
  }));
  return JSON.stringify({
    schemaVersion: 1,
    channel: manifest.channel,
    releaseVersion: manifest.releaseVersion,
    publishedAt: manifest.publishedAt,
    releaseRootPublicKey: manifest.releaseRootPublicKey,
    releaseRootFingerprint: manifest.releaseRootFingerprint,
    merkleRoot: manifest.merkleRoot,
    artifacts,
  });
}

function artifactLeaf(manifest, artifact) {
  return sha256(JSON.stringify({
    channel: manifest.channel,
    releaseVersion: manifest.releaseVersion,
    ...canonicalArtifactInput(artifact),
  }));
}

function verifyMerkle(leafHash, proof, expectedRoot) {
  let current = leafHash;
  for (const step of proof) {
    const sibling = step.siblingHash;
    current = step.position === 'left'
      ? sha256(Buffer.concat([Buffer.from(sibling, 'hex'), Buffer.from(current, 'hex')]))
      : sha256(Buffer.concat([Buffer.from(current, 'hex'), Buffer.from(sibling, 'hex')]));
  }
  return current === expectedRoot;
}

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) fail('--manifest is required');
const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
if (manifest.schemaVersion !== 1) fail(`unsupported manifest schema ${manifest.schemaVersion}`);
if (manifest.releaseRootPublicKey !== args.root) fail('manifest does not use the pinned release root');
const expectedFingerprint = sha256(Buffer.from(args.root, 'hex')).slice(0, 16);
if (manifest.releaseRootFingerprint !== expectedFingerprint) fail('release root fingerprint mismatch');
if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) fail('manifest has no artifacts');

for (const artifact of manifest.artifacts) {
  const leaf = artifactLeaf(manifest, artifact);
  if (leaf !== artifact.leafHash) fail(`release binding is invalid for ${artifact.stableUrl}`);
  if (!verifyMerkle(leaf, artifact.merkleProof, manifest.merkleRoot)) fail(`Merkle proof is invalid for ${artifact.stableUrl}`);
  verifyChain(artifact.signatureChain, artifact.sha256, args.root);
}

const manifestHash = sha256(canonicalManifest(manifest));
verifyChain(manifest.manifestSignatureChain, manifestHash, args.root);

const artifact = manifest.artifacts.find(entry => entry.platform === args.platform && entry.arch === args.arch);
if (!artifact) fail(`no ${args.platform}/${args.arch} artifact is present`);
const artifactUrl = new URL(artifact.stableUrl);
if (artifactUrl.protocol !== 'https:' || artifactUrl.hostname !== 'refinio.one') fail('artifact URL is outside https://refinio.one');

if (args.archive) {
  const actualSha = await sha256File(args.archive);
  if (actualSha !== artifact.sha256) fail('downloaded archive hash does not match signed manifest');
}
if (args['print-url']) process.stdout.write(`${artifact.stableUrl}\n`);
else process.stdout.write(`${JSON.stringify({valid: true, version: manifest.releaseVersion, artifact: artifact.stableUrl})}\n`);
