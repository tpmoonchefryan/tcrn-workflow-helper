import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, IDENTITY } from '../bootstrap/trusted-bootstrap.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

function sameStat(one, two) { return one.dev === two.dev && one.ino === two.ino && one.mode === two.mode && one.nlink === two.nlink && one.size === two.size && one.uid === two.uid && one.gid === two.gid && one.mtimeMs === two.mtimeMs && one.ctimeMs === two.ctimeMs && one.birthtimeMs === two.birthtimeMs; }
export async function privateKeyBytes(path, { afterParentLstat } = {}) {
  const parentPath = dirname(path);
  const parentBefore = await lstat(parentPath).catch(() => fail('SIGNING_KEY_INVALID'));
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink() || (typeof process.getuid === 'function' && parentBefore.uid !== process.getuid()) || (parentBefore.mode & 0o777) !== 0o700) fail('SIGNING_KEY_INVALID');
  if (afterParentLstat !== undefined) await afterParentLstat({ parentPath, parentBefore });
  const parent = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW).catch(() => fail('SIGNING_KEY_INVALID'));
  try {
    const parentDescriptor = await parent.stat(); const parentAfter = await lstat(parentPath).catch(() => fail('SIGNING_KEY_INVALID'));
    if (!sameStat(parentBefore, parentDescriptor) || !sameStat(parentBefore, parentAfter)) fail('SIGNING_KEY_INVALID');
    const before = await lstat(path).catch(() => fail('SIGNING_KEY_INVALID'));
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16 * 1024 || (typeof process.getuid === 'function' && before.uid !== process.getuid()) || (before.mode & 0o777) !== 0o600) fail('SIGNING_KEY_INVALID');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => fail('SIGNING_KEY_INVALID'));
    try {
      const descriptorBefore = await handle.stat();
      if (!sameStat(before, descriptorBefore)) fail('SIGNING_KEY_INVALID');
      const bytes = await handle.readFile();
      const descriptorAfter = await handle.stat(); const after = await lstat(path).catch(() => fail('SIGNING_KEY_INVALID'));
      if (!sameStat(before, descriptorAfter) || !sameStat(before, after)) fail('SIGNING_KEY_INVALID');
      const parentFinal = await lstat(parentPath).catch(() => fail('SIGNING_KEY_INVALID'));
      if (!sameStat(parentBefore, parentFinal)) fail('SIGNING_KEY_INVALID');
      return bytes;
    } finally { await handle.close(); }
  } finally { await parent.close(); }
}
async function atomicPrivateWrite(path, bytes) {
  const stage = `${path}.stage-${process.pid}`;
  const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } catch (error) { await handle.close(); await unlink(stage).catch(() => {}); throw error; }
  await handle.close();
  try { await rename(stage, path); const directory = await open(dirname(path), constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); } }
  catch (error) { await unlink(stage).catch(() => {}); throw error; }
}
function canonicalDocument(bytes, label) { let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes)); } catch { fail(`SIGN_${label}_INVALID`); } if (!Buffer.from(canonicalJson(value)).equals(bytes)) fail(`SIGN_${label}_INVALID`); return value; }

async function main(argv = process.argv.slice(2)) {
  const expected = ['--private-key', '--archive', '--provenance', '--manifest', '--policy'];
  const args = argv;
  if (args.length !== expected.length * 2 || expected.some((name, index) => args[index * 2] !== name || !args[index * 2 + 1])) fail('SIGN_RELEASE_CLI_INVALID');
  const [privateKeyPath, archivePath, provenancePath, manifestPath, policyPath] = expected.map((_, index) => resolve(args[index * 2 + 1]));
  const privateKey = createPrivateKey(await privateKeyBytes(privateKeyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') fail('SIGNING_KEY_INVALID');
  const publicKeyPem = createPublicKey(privateKey).export({ type:'spki', format:'pem' });
  if (sha256(publicKeyPem) !== 'a320188bfc64797931de408f6064e0830d431fb4ebf73322f73219cc91a2ed90') fail('SIGNING_KEY_INVALID');
  const archiveBytes = await readFile(archivePath); canonicalDocument(archiveBytes, 'ARCHIVE');
  const provenanceBytes = await readFile(provenancePath); canonicalDocument(provenanceBytes, 'PROVENANCE');
  const unsignedManifest = {
  archiveSha256:sha256(archiveBytes),
  commit:IDENTITY.commit,
  expiresAt:'2027-07-14T00:00:00Z',
  issuer:'tcrn',
  policyEpoch:5,
  provenanceSha256:sha256(provenanceBytes),
  repository:IDENTITY.repository,
  schemaVersion:'tcrn.workflow.helper.release-manifest.v1',
  signer:'tcrn-signer',
  tagObject:IDENTITY.tagObject,
  tree:IDENTITY.tree,
  version:IDENTITY.version,
  };
  const manifest = { ...unsignedManifest, signatureBase64:sign(null, Buffer.from(canonicalJson(unsignedManifest)), privateKey).toString('base64') };
  const unsignedPolicy = {
  archiveSha256:unsignedManifest.archiveSha256,
  expiresAt:'2027-07-14T00:00:00Z',
  issuer:'tcrn',
  manifestSha256:sha256(canonicalJson(manifest)),
  minimumPolicyEpoch:5,
  provenanceSha256:unsignedManifest.provenanceSha256,
  revokedVersions:[],
  schemaVersion:'tcrn.workflow.helper.policy.v1',
  signer:'tcrn-signer',
  trustedPublicKeySha256:sha256(publicKeyPem),
  };
  const policy = { ...unsignedPolicy, signatureBase64:sign(null, Buffer.from(canonicalJson(unsignedPolicy)), privateKey).toString('base64') };
  await atomicPrivateWrite(manifestPath, canonicalJson(manifest));
  await atomicPrivateWrite(policyPath, canonicalJson(policy));
  console.log(canonicalJson({ archiveSha256:unsignedManifest.archiveSha256, manifestSha256:sha256(canonicalJson(manifest)), policySha256:sha256(canonicalJson(policy)), publicKeyPem, trustedPublicKeySha256:unsignedPolicy.trustedPublicKeySha256 }));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
