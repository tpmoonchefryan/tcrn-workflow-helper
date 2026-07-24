import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, link, mkdir, open, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IDENTITY = Object.freeze({
  repository: 'https://github.com/tpmoonchefryan/tcrn-workflow.git', version: 'v0.4.0',
  commit: '59be99e0871640fe74d619133db0d619aca76d97', tree: 'fbc1bba7dfa4d1404b907cb4e3975dc8fbc0751f',
  tagObject: '68b1e9fc98ff8d61b2d6dcdc8174de5281709e55',
});
// The accepted release bytes are pinned HERE, in the runtime the user verifies
// out-of-band against its published SHA-256 -- not in a document that ships beside
// the download and could be rewritten by whoever rewrote the download.
export const EXPECTED_ARCHIVE_SHA256 = 'e6ad64caa9456b33844dd5fdded005c3de3a82e8a4592627ca5aeab467a2c2cf';
export const EXPECTED_PROVENANCE_SHA256 = '0ccda9d8ccd6ecc52187f32f7e724f7ed3d52b6d5d84c71d28416c1fe2267586';
const ARCHIVE_SCHEMA = 'tcrn.workflow.helper.archive.v1';
const STATE_SCHEMA = 'tcrn.workflow.helper.state.v1';
const TXN_SCHEMA = 'tcrn.workflow.helper.transaction.v2';
const MAX_ENTRIES = 256; const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_STATE_DOCUMENT_BYTES = 16 * 1024;
const MAX_BASE64_BYTES = 4 * Math.ceil(MAX_BYTES / 3);
const TXN_DIR = '.tcrn-helper-transaction'; const TXN_ATTEMPT = '.tcrn-helper-transaction-attempt'; const TXN_ATTEMPT_STAGE_PREFIX = '.tcrn-helper-transaction-attempt-stage-'; const TXN_RECEIPT = '.tcrn-helper-transaction-terminal'; const TXN_RECEIPT_STAGE_PREFIX = '.tcrn-helper-transaction-terminal-stage-'; const TXN_STAGE_PREFIX = '.tcrn-helper-transaction-stage-'; const TXN_CLAIM_STAGE_PREFIX = '.tcrn-helper-transaction-claim-stage-'; const LOCK_DIR = '.tcrn-helper-lock'; const LOCK_STAGE_PREFIX = '.tcrn-helper-lock-stage-';
const ACTIVE_TRANSACTION_IDS = new Set(); const ACTIVE_RECEIPT_STAGES = new Map();

export class BootstrapError extends Error { constructor(reasonCode, message = reasonCode) { super(message); this.reasonCode = reasonCode; } }
const fail = (code, message = code) => { throw new BootstrapError(code, message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
// Any ordering that feeds a digest, a journal, or a delete sequence compares by code unit
// here, never with localeCompare. localeCompare answers whatever the host's ICU says: this
// Skill ships `SKILL.md` beside `agents/`, and the default collation puts `SKILL.md` LAST
// while code-unit order puts it FIRST. The tree digest that ordering produces is written
// into the transaction journal and re-derived on resume, so a Node built with small-icu --
// or merely a different ICU version, or a different LANG -- re-derives a different digest
// for bytes that never changed and fails the recovery as TRANSACTION_CONFLICT. That is an
// install bricked by a locale. It is also why validateArchive already pins entries in
// strict code-unit ascending order: this comparator is the same rule, applied to the paths
// that reach the hash instead of only the ones that reach the archive.
const byteOrder = (one, two) => one < two ? -1 : one > two ? 1 : 0;
export const canonicalJson = value => `${JSON.stringify(sort(value))}\n`;
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code); }
function sameStat(one, two) { return one.dev === two.dev && one.ino === two.ino && one.mode === two.mode && one.nlink === two.nlink && one.size === two.size && one.uid === two.uid && one.gid === two.gid && one.mtimeMs === two.mtimeMs && one.ctimeMs === two.ctimeMs && one.birthtimeMs === two.birthtimeMs; }
function statFingerprint(info) { return { birthtimeMicros:Math.trunc(info.birthtimeMs * 1000), ctimeMicros:Math.trunc(info.ctimeMs * 1000), dev:info.dev, gid:info.gid, ino:info.ino, mode:info.mode, mtimeMicros:Math.trunc(info.mtimeMs * 1000), nlink:info.nlink, size:info.size, uid:info.uid }; }
function sameFingerprint(one, two) { return canonicalJson(one) === canonicalJson(two); }
function validStatFingerprint(value) { exact(value, ['birthtimeMicros', 'ctimeMicros', 'dev', 'gid', 'ino', 'mode', 'mtimeMicros', 'nlink', 'size', 'uid'], 'TRANSACTION_CONFLICT'); if (!Object.values(value).every(Number.isSafeInteger)) fail('TRANSACTION_CONFLICT'); return value; }
function directoryIdentity(info) { return { dev:info.dev, gid:info.gid, ino:info.ino, mode:info.mode, uid:info.uid }; }
function sameDirectoryIdentity(one, two) { return canonicalJson(one) === canonicalJson(two); }
function contentBinding(present, digest) { return { present, sha256:digest }; }
function sameContentBinding(one, two) { return one?.present === two?.present && one?.sha256 === two?.sha256; }
function validTreeNode(value) { exact(value, ['identity', 'kind', 'path', 'sha256'], 'TRANSACTION_CONFLICT'); if (!['directory', 'file'].includes(value.kind) || typeof value.path !== 'string' || !value.path || isAbsolute(value.path) || value.path.split('/').some(part => !part || part === '.' || part === '..') || !validStatFingerprint(value.identity) || value.kind === 'file' && !/^[a-f0-9]{64}$/.test(value.sha256) || value.kind === 'directory' && value.sha256 !== null) fail('TRANSACTION_CONFLICT'); return value; }
function validContentBinding(value) { if (!value || typeof value !== 'object' || Array.isArray(value) || ![['present', 'sha256'], ['identity', 'present', 'sha256'], ['identity', 'present', 'sha256', 'tree']].some(keys => Object.keys(value).sort().join(',') === keys.sort().join(','))) fail('TRANSACTION_CONFLICT'); if (typeof value.present !== 'boolean' || value.present !== (typeof value.sha256 === 'string') || value.sha256 !== null && !/^[a-f0-9]{64}$/.test(value.sha256) || value.identity !== undefined && value.identity !== null && !validStatFingerprint(value.identity)) fail('TRANSACTION_CONFLICT'); if (!value.present && value.identity !== null && value.identity !== undefined) fail('TRANSACTION_CONFLICT'); if (value.tree !== undefined && (!value.present || !Array.isArray(value.tree) || value.tree.length > MAX_ENTRIES * 2 || new Set(value.tree.map(node => node?.path)).size !== value.tree.length || !value.tree.every(validTreeNode))) fail('TRANSACTION_CONFLICT'); return value; }
function validDirectoryIdentity(value) { exact(value, ['dev', 'gid', 'ino', 'mode', 'uid'], 'TRANSACTION_CONFLICT'); if (!Object.values(value).every(Number.isSafeInteger)) fail('TRANSACTION_CONFLICT'); return value; }
function safeScalars(value) { if (typeof value === 'string') return value.isWellFormed(); if (Array.isArray(value)) return value.every(safeScalars); if (value && typeof value === 'object') return Object.values(value).every(safeScalars); return typeof value !== 'number' || (Number.isFinite(value) && Number.isSafeInteger(value)); }
function safePath(path) {
  if (typeof path !== 'string' || !path || path !== path.normalize('NFC') || /[\u0000-\u001f\u007f-\u009f]/.test(path) || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) fail('ARCHIVE_PATH_INVALID', String(path));
  return path;
}
function privateRegular(info, maximumLinks = 1) { return info.isFile() && !info.isSymbolicLink() && info.nlink >= 1 && info.nlink <= maximumLinks && (typeof process.getuid !== 'function' || info.uid === process.getuid()) && (info.mode & 0o077) === 0; }
async function boundedBytes(path, maximumBytes, code, { privateFile = false, maximumLinks = 1 } = {}) {
  if (typeof path !== 'string' || !path) fail(code);
  let before;
  try { before = await lstat(path); } catch { fail(code, basename(path)); }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink > maximumLinks || (privateFile && !privateRegular(before, maximumLinks))) fail(code, basename(path));
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptorBefore = await handle.stat();
    if (!sameStat(before, descriptorBefore)) fail('INPUT_REPLACED');
    const data = Buffer.allocUnsafe(maximumBytes + 1); let length = 0;
    while (length < data.length) { const { bytesRead } = await handle.read(data, length, data.length - length, length); if (bytesRead === 0) break; length += bytesRead; }
    if (length > maximumBytes) fail('INPUT_TOO_LARGE');
    const descriptorAfter = await handle.stat(); const after = await lstat(path);
    if (!sameStat(before, descriptorAfter) || !sameStat(before, after)) fail('INPUT_REPLACED');
    return data.subarray(0, length);
  } catch (error) { if (error instanceof BootstrapError) throw error; fail(code, basename(path)); } finally { await handle?.close(); }
}
function canonicalDocument(bytes, code) {
  let text; let value;
  try { text = new TextDecoder('utf-8', { fatal:true }).decode(bytes); value = JSON.parse(text); } catch { fail(code); }
  if (!safeScalars(value) || !Buffer.from(canonicalJson(value), 'utf8').equals(bytes)) fail(code);
  return value;
}
async function document(path, maximumBytes, code, options) { return canonicalDocument(await boundedBytes(path, maximumBytes, code, options), code); }
function decodedBase64(entry, remaining) {
  if (typeof entry.contentBase64 !== 'string' || entry.contentBase64.length > MAX_BASE64_BYTES || entry.contentBase64.length > 4 * Math.ceil(remaining / 3) || entry.contentBase64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.contentBase64)) fail('ARCHIVE_ENTRY_INVALID');
  const padding = entry.contentBase64.endsWith('==') ? 2 : entry.contentBase64.endsWith('=') ? 1 : 0;
  const decodedLength = (entry.contentBase64.length / 4) * 3 - padding;
  if (decodedLength > remaining) fail('ARCHIVE_LIMIT_EXCEEDED');
  const output = Buffer.from(entry.contentBase64, 'base64');
  if (output.length !== decodedLength || output.toString('base64') !== entry.contentBase64) fail('ARCHIVE_ENTRY_INVALID');
  return output;
}
export function validateArchive(documentValue) {
  exact(documentValue, ['entries', 'schemaVersion'], 'ARCHIVE_ENTRY_INVALID');
  if (documentValue.schemaVersion !== ARCHIVE_SCHEMA || !Array.isArray(documentValue.entries) || documentValue.entries.length > MAX_ENTRIES) fail('ARCHIVE_LIMIT_EXCEEDED');
  let total = 0; let previous = null; const seen = new Set(); const folded = new Set();
  for (const entry of documentValue.entries) {
    exact(entry, ['contentBase64', 'path', 'sha256', 'type'], 'ARCHIVE_ENTRY_INVALID');
    const path = safePath(entry.path); if (entry.type !== 'file') fail('ARCHIVE_ENTRY_INVALID');
    const foldedPath = path.toLocaleLowerCase('en-US'); if (previous !== null && previous >= path) fail('ARCHIVE_PATH_INVALID'); previous = path;
    if (seen.has(path) || folded.has(foldedPath) || [...folded].some(existing => existing.startsWith(`${foldedPath}/`) || foldedPath.startsWith(`${existing}/`))) fail('ARCHIVE_PATH_INVALID'); seen.add(path); folded.add(foldedPath);
    const content = decodedBase64(entry, MAX_BYTES - total); total += content.length;
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || sha256(content) !== entry.sha256) fail('ARCHIVE_DIGEST_MISMATCH');
  }
  return { archiveSha256:sha256(canonicalJson(documentValue)), entries:documentValue.entries, totalBytes:total };
}
async function readState(statePath) {
  try { await lstat(statePath); } catch (error) { if (error?.code === 'ENOENT') return { value:{ schemaVersion:STATE_SCHEMA, verifiedArchiveSha256:null }, fingerprint:null }; throw error; }
  const value = await document(statePath, MAX_STATE_DOCUMENT_BYTES, 'STATE_INVALID', { privateFile:true }); exact(value, ['schemaVersion', 'verifiedArchiveSha256'], 'STATE_INVALID'); if (value.schemaVersion !== STATE_SCHEMA || value.verifiedArchiveSha256 !== null && !/^[a-f0-9]{64}$/.test(value.verifiedArchiveSha256)) fail('STATE_INVALID'); return { value, fingerprint:sha256(canonicalJson(value)) };
}
async function validateProvenance(provenancePath, expectedSha256) { if (typeof provenancePath !== 'string' || !provenancePath) fail('PROVENANCE_REQUIRED'); const provenance = await document(provenancePath, MAX_ARCHIVE_DOCUMENT_BYTES, 'PROVENANCE_INVALID'); exact(provenance, ['_type', 'predicate', 'predicateType', 'subject'], 'PROVENANCE_INVALID'); if (sha256(canonicalJson(provenance)) !== expectedSha256 || provenance._type !== 'https://in-toto.io/Statement/v1' || provenance.predicateType !== 'https://slsa.dev/provenance/v1' || !Array.isArray(provenance.subject) || provenance.subject.length !== 1 || provenance.predicate?.buildDefinition?.externalParameters?.tag !== IDENTITY.version || provenance.predicate?.buildDefinition?.externalParameters?.version !== IDENTITY.version.slice(1)) fail('PROVENANCE_INVALID'); return provenance; }
// The expected digests default to the compiled-in pins; they are parameters only so
// tests can pin a synthetic archive, the same pattern resolveWorkflowRoot uses for
// `identity`. Production callers never pass them.
async function prepareTrust({ archivePath, provenancePath, statePath, expectedArchiveSha256 = EXPECTED_ARCHIVE_SHA256, expectedProvenanceSha256 = EXPECTED_PROVENANCE_SHA256 }) {
  const archive = await document(archivePath, MAX_ARCHIVE_DOCUMENT_BYTES, 'ARCHIVE_ENTRY_INVALID'); const validated = validateArchive(archive);
  if (validated.archiveSha256 !== expectedArchiveSha256) fail('IDENTITY_MISMATCH');
  await validateProvenance(provenancePath, expectedProvenanceSha256);
  const state = await readState(statePath);
  const receipt = { reasonCode:'TRUST_VALIDATED', archiveSha256:validated.archiveSha256, version:IDENTITY.version };
  return { archive, validated, receipt, state, nextState:{ schemaVersion:STATE_SCHEMA, verifiedArchiveSha256:validated.archiveSha256 } };
}
export async function validateTrust(options) { return (await prepareTrust(options)).receipt; }
const INSTALLED_COPY_MARKER_SCHEMA = 'tcrn.workflow.helper.installed-copy-marker.v1';
async function reconstructArchiveFromDirectory(installedDir) {
  if (typeof installedDir !== 'string' || !installedDir) fail('ARCHIVE_PATH_INVALID');
  const before = await lstat(installedDir).catch(() => fail('ROOT_MISSING'));
  if (!before.isDirectory() || before.isSymbolicLink()) fail('ROOT_SYMLINK');
  const entries = []; let total = 0;
  async function walk(directory, prefix) {
    const listing = await readdir(directory, { withFileTypes:true });
    for (const entry of listing.sort((one, two) => byteOrder(one.name, two.name))) {
      const full = resolve(directory, entry.name); const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) fail('ARCHIVE_ENTRY_INVALID');
      if (entry.isDirectory()) { await walk(full, rel); continue; }
      const content = await boundedBytes(full, MAX_BYTES - total, 'ARCHIVE_LIMIT_EXCEEDED'); total += content.length;
      if (entries.length + 1 > MAX_ENTRIES) fail('ARCHIVE_LIMIT_EXCEEDED');
      entries.push({ contentBase64:content.toString('base64'), path:safePath(rel), sha256:sha256(content), type:'file' });
    }
  }
  await walk(installedDir, '');
  entries.sort((one, two) => one.path < two.path ? -1 : one.path > two.path ? 1 : 0);
  return { schemaVersion:ARCHIVE_SCHEMA, entries };
}
// Walks EVERY component of an already-physical (realpath'd) directory path and proves
// each one is a real directory, not a symlink. O_NOFOLLOW on the final component says
// nothing about ancestors, so this is what actually rules out an ancestor swap; it
// returns the leaf's inode identity so the write point can prove it is the same inode
// the check ran against, not merely the same path string.
async function physicalDirectoryChainIdentity(physicalDirectory) {
  let current = sep;
  let info = await lstat(current).catch(() => fail('STATE_PATH_INVALID'));
  for (const component of physicalDirectory.split(sep).filter(Boolean)) {
    if (liveHostLocationComponent(component)) fail('LIVE_LOCATION_FORBIDDEN');
    current = resolve(current, component);
    info = await lstat(current).catch(() => fail('STATE_PATH_INVALID'));
    if (!info.isDirectory() || info.isSymbolicLink()) fail('STATE_PATH_INVALID');
  }
  if (current !== physicalDirectory) fail('STATE_PATH_INVALID');
  return { dev:info.dev, ino:info.ino };
}
// Returns a BINDING, not just a verdict. The binding pins the physical parent directory
// and its inode identity so `atomicPrivateOverwrite` can re-verify at the write point
// that it is writing into the very directory this check validated. Callers must thread
// the binding through to the write; validating a path and later writing to that same
// path is precisely the TOCTOU this closes.
// Exported so the TOCTOU regression test can hold the check and the write apart and
// mutate the tree in between -- the exact window an attacker races. Production callers
// always pair them; nothing else consumes these.
export async function assertManagedStatePath(path) {
  if (typeof path !== 'string' || !path) fail('STATE_PATH_INVALID');
  const resolved = resolve(path);
  // Lexical guard catches a literal .claude/.codex component in the requested path...
  if (resolved.split(sep).filter(Boolean).some(liveHostLocationComponent)) fail('LIVE_LOCATION_FORBIDDEN');
  // ...and realpath'ing the parent (as testRoot/authorizedStatePath do) closes a symlinked-ancestor
  // bypass that would otherwise let the floor/marker write land physically inside a live host tree.
  const physicalParent = await realpath(dirname(resolved)).catch(() => fail('STATE_PATH_INVALID'));
  if (physicalParent.split(sep).filter(Boolean).some(liveHostLocationComponent)) fail('LIVE_LOCATION_FORBIDDEN');
  const parentIdentity = await physicalDirectoryChainIdentity(physicalParent);
  return { name:basename(resolved), parentIdentity, physicalParent, physicalPath:resolve(physicalParent, basename(resolved)), requestedPath:resolved };
}
// Re-runs the managed-state check AT THE WRITE POINT against the pinned binding, then
// writes to the PHYSICAL path (which by construction contains no symlinked component).
// Without the binding a caller could only re-check the same path string, which an
// attacker is free to re-point; the dev/ino comparison is what makes the check and the
// write reference the same file.
async function assertBoundManagedStatePath(path, binding) {
  const resolved = resolve(path);
  if (binding.requestedPath !== resolved) fail('STATE_PATH_INVALID');
  if (resolved.split(sep).filter(Boolean).some(liveHostLocationComponent)) fail('LIVE_LOCATION_FORBIDDEN');
  const physicalParent = await realpath(dirname(resolved)).catch(() => fail('STATE_PATH_INVALID'));
  if (physicalParent !== binding.physicalParent) fail('STATE_PATH_INVALID');
  const identity = await physicalDirectoryChainIdentity(physicalParent);
  if (identity.dev !== binding.parentIdentity.dev || identity.ino !== binding.parentIdentity.ino) fail('STATE_PATH_INVALID');
}
export async function atomicPrivateOverwrite(path, bytes, binding = null) {
  const managed = binding ?? await assertManagedStatePath(path);
  await assertBoundManagedStatePath(path, managed);
  const stage = `${managed.physicalPath}.stage-${process.pid}`;
  const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    // The stage file must have materialised on the pinned device, inside the pinned
    // parent inode -- proof the create landed where the check ran, not in a tree that
    // was swapped underneath us between the check and the open.
    const staged = await handle.stat();
    if (staged.dev !== managed.parentIdentity.dev) fail('STATE_PATH_INVALID');
    await handle.writeFile(bytes); await handle.sync();
  } catch (error) { await unlink(stage).catch(() => {}); throw error; } finally { await handle.close(); }
  try {
    await assertBoundManagedStatePath(path, managed);
    await rename(stage, managed.physicalPath);
    // handle.sync() above made the CONTENT durable; it says nothing about the directory
    // entry the rename created. Without this the rename can be lost by a crash while the
    // caller has already been told the write succeeded -- a floor advance that survives
    // the process but not the power, which is the one failure mode a monotonic floor must
    // not have. Every other rename in this file goes through renameDurable for exactly
    // this reason; this one was the exception.
    await syncPath(managed.physicalParent);
  } catch (error) { await unlink(stage).catch(() => {}); throw error; }
}
// Attests exactly this: the bytes on disk at installedDir reconstruct, under this
// bootstrap's canonicalization rules, to precisely the archive whose SHA-256 is
// compiled into this bootstrap. It claims nothing about a key, a validity window,
// a revocation list, or a downgrade history.
export async function verifyInstalledCopy({ installedDir, provenancePath, statePath, expectedArchiveSha256 = EXPECTED_ARCHIVE_SHA256, expectedProvenanceSha256 = EXPECTED_PROVENANCE_SHA256 }) {
  // State and any marker are written to the managed state root, never inside a
  // skill/live directory (verify never mutates the copied skill dir, which stays
  // read-only).
  const managedState = await assertManagedStatePath(statePath);
  const archive = await reconstructArchiveFromDirectory(installedDir);
  const validated = validateArchive(archive);
  if (validated.archiveSha256 !== expectedArchiveSha256) fail('IDENTITY_MISMATCH');
  await validateProvenance(provenancePath, expectedProvenanceSha256);
  const state = await readState(statePath);
  if (state.value.verifiedArchiveSha256 !== validated.archiveSha256) {
    await atomicPrivateOverwrite(statePath, canonicalJson({ schemaVersion:STATE_SCHEMA, verifiedArchiveSha256:validated.archiveSha256 }), managedState);
  }
  return { reasonCode:'INSTALLED_COPY_VALIDATED', archiveSha256:validated.archiveSha256, version:IDENTITY.version };
}
function git(args, root) { return new Promise((resolvePromise, rejectPromise) => { const maximumBytes = 64 * 1024; let settled = false; const finish = callback => value => { if (!settled) { settled = true; callback(value); } }; const child = spawn('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '--no-optional-locks', '-C', root, ...args], { shell:false, env:{ PATH:'/usr/bin:/bin', HOME:'/dev/null', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_SYSTEM:'/dev/null', GIT_ATTR_NOSYSTEM:'1', GIT_TERMINAL_PROMPT:'0', LC_ALL:'C' } }); let out = Buffer.alloc(0); let err = Buffer.alloc(0); const append = (current, chunk) => Buffer.concat([current, Buffer.from(chunk)]); const overflow = () => { child.kill('SIGKILL'); finish(rejectPromise)(new Error('git output exceeds budget')); }; child.stdout.on('data', chunk => { out = append(out, chunk); if (out.length + err.length > maximumBytes) overflow(); }); child.stderr.on('data', chunk => { err = append(err, chunk); if (out.length + err.length > maximumBytes) overflow(); }); child.on('error', finish(rejectPromise)); child.on('close', code => { if (settled) return; if (code === 0) finish(resolvePromise)(out.toString('utf8').trim()); else finish(rejectPromise)(new Error(err.toString('utf8'))); }); }); }
async function rootControl(path) { try { const requested = resolve(path); const root = await lstat(requested); const control = await lstat(resolve(requested, '.git')); const physical = await realpath(requested); const controlPhysical = await realpath(resolve(requested, '.git')); if (physical !== requested || controlPhysical !== resolve(requested, '.git') || !root.isDirectory() || root.isSymbolicLink() || !control.isDirectory() || control.isSymbolicLink()) fail('ROOT_SYMLINK'); return { root, control, physical, controlPhysical }; } catch (error) { if (error instanceof BootstrapError) throw error; fail('ROOT_IDENTITY_MISMATCH'); } }
async function checkedRoot(path, expectedRemote, identity) {
  const before = await rootControl(path); let top; let remote; let head; let tree; let tag; let status;
  try { top = await git(['rev-parse', '--show-toplevel'], before.physical); remote = await git(['config', '--get', 'remote.origin.url'], before.physical); head = await git(['rev-parse', 'HEAD'], before.physical); tree = await git(['rev-parse', 'HEAD^{tree}'], before.physical); tag = await git(['rev-parse', `refs/tags/${identity.version}^{tag}`], before.physical); status = await git(['status', '--porcelain=v1', '--untracked-files=all'], before.physical); } catch { fail('ROOT_IDENTITY_MISMATCH'); }
  const after = await rootControl(path);
  if (top !== before.physical || before.physical !== after.physical || before.controlPhysical !== after.controlPhysical || !sameStat(before.root, after.root) || !sameStat(before.control, after.control)) fail('ROOT_REPLACED');
  if (remote !== expectedRemote || head !== identity.commit || tree !== identity.tree || tag !== identity.tagObject) fail('ROOT_IDENTITY_MISMATCH'); if (status) fail('ROOT_DIRTY');
  return { physical:before.physical, rootDigest:sha256(canonicalJson({ head, remote, tag, tree })) };
}
export async function resolveWorkflowRoot({ explicitPath = null, candidates = [], expectedRemote = IDENTITY.repository, identity = IDENTITY }) { const choices = explicitPath ? [explicitPath] : [...new Set(candidates)]; if (choices.length === 0) fail('ROOT_MISSING'); if (choices.length !== 1) fail('ROOT_AMBIGUOUS'); const root = await checkedRoot(choices[0], expectedRemote, identity); return { reasonCode:'ROOT_RESOLVED', rootDigest:root.rootDigest, repository:expectedRemote }; }
function approved(value) { if (value !== true) fail('APPROVAL_REQUIRED'); }
function testRootMarker(component) { return component === 'tcrn-helper-test' || component.startsWith('tcrn-helper-test-'); }
function liveHostLocationComponent(component) { const folded = component.toLocaleLowerCase('en-US'); return folded === '.claude' || folded === '.codex'; }
function ownedPrivateDirectory(info) { return info.isDirectory() && !info.isSymbolicLink() && (typeof process.getuid !== 'function' || info.uid === process.getuid()) && (info.mode & 0o077) === 0; }
async function openatTestRoot(requested) {
  const helper = fileURLToPath(new URL('./test-root-openat.py', import.meta.url));
  const result = await new Promise(resolvePromise => {
    const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, requested], { stdio:['ignore', 'pipe', 'ignore'] }); let output = Buffer.alloc(0); let stopping = false; let killTimer = null;
    let settled = false; const finish = value => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); resolvePromise(value); } };
    const stop = () => { if (stopping) return; stopping = true; child.kill('SIGKILL'); killTimer = setTimeout(() => finish(null), 500); };
    const timer = setTimeout(stop, 2000);
    child.stdout.on('data', chunk => { output = Buffer.concat([output, Buffer.from(chunk)]); if (output.length > 64) stop(); });
    child.on('error', () => finish(null)); child.on('close', code => finish({ code, output:output.toString('utf8') }));
  });
  if (!result || result.code !== 0 || result.output !== 'TEST_ROOT_OK\n') fail('TEST_ROOT_REQUIRED');
}
async function testRoot(root) {
  if (typeof root !== 'string' || !root) fail('TEST_ROOT_REQUIRED');
  const requested = resolve(root); const components = requested.split(sep).filter(Boolean);
  if (components.some(liveHostLocationComponent)) fail('LIVE_LOCATION_FORBIDDEN');
  if (components.findIndex(testRootMarker) < 0) fail('TEST_ROOT_REQUIRED');
  await openatTestRoot(requested);
  const physical = await realpath(requested).catch(() => fail('TEST_ROOT_REQUIRED')); const info = await lstat(requested).catch(() => fail('TEST_ROOT_REQUIRED'));
  if (physical !== requested || !ownedPrivateDirectory(info)) fail('TEST_ROOT_REQUIRED'); return requested;
}
async function authorizedStatePath(base, requested) { if (typeof requested !== 'string') fail('STATE_PATH_INVALID'); const physicalParent = await realpath(dirname(resolve(requested))).catch(() => fail('STATE_PATH_INVALID')); const physical = resolve(physicalParent, basename(requested)); if (physical !== resolve(base, 'state.json')) fail('STATE_PATH_INVALID'); const root = await lstat(base); if (!root.isDirectory() || root.isSymbolicLink()) fail('TEST_ROOT_REQUIRED'); return physical; }
async function treeDigest(root) { const hash = createHash('sha256'); async function walk(directory, prefix = '') { let entries; try { entries = await readdir(directory, { withFileTypes:true }); } catch (error) { if (error?.code === 'ENOENT') return; throw error; } for (const entry of entries.sort((a, b) => byteOrder(a.name, b.name))) { const path = resolve(directory, entry.name); const name = `${prefix}${entry.name}`; if (entry.isSymbolicLink()) fail('WORKSPACE_INVALID'); if (entry.isDirectory()) { hash.update(`D\0${name}\0`); await walk(path, `${name}/`); } else if (entry.isFile()) { const bytes = await boundedBytes(path, MAX_BYTES, 'WORKSPACE_INVALID'); hash.update(`F\0${name}\0${bytes.length}\0`); hash.update(bytes); } else fail('WORKSPACE_INVALID'); } } await walk(root); return hash.digest('hex'); }
async function boundTree(root) { const hash = createHash('sha256'); const nodes = []; let total = 0; async function walk(directory, prefix = '') { const directoryInfo = await lstat(directory).catch(() => fail('TRANSACTION_CONFLICT')); if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (typeof process.getuid === 'function' && directoryInfo.uid !== process.getuid()) || (directoryInfo.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT'); nodes.push({ fingerprint:statFingerprint(directoryInfo), kind:'directory', path:directory }); const entries = await readdir(directory, { withFileTypes:true }).catch(() => fail('TRANSACTION_CONFLICT')); for (const entry of entries.sort((a, b) => byteOrder(a.name, b.name))) { const path = resolve(directory, entry.name); const name = `${prefix}${entry.name}`; if (entry.isDirectory()) { hash.update(`D\0${name}\0`); await walk(path, `${name}/`); continue; } if (!entry.isFile() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(path, MAX_BYTES - total, 'TRANSACTION_CONFLICT'); total += bytes.length; const info = await lstat(path).catch(() => fail('TRANSACTION_CONFLICT')); hash.update(`F\0${name}\0${bytes.length}\0`); hash.update(bytes); nodes.push({ bytes, fingerprint:statFingerprint(info), kind:'file', path }); } } await walk(root); return { digest:hash.digest('hex'), nodes }; }
function durableTreeNodes(root, manifest) { return manifest.nodes.filter(node => node.path !== root).map(node => ({ identity:node.fingerprint, kind:node.kind, path:relative(root, node.path).split(sep).join('/'), sha256:node.kind === 'file' ? sha256(node.bytes) : null })).sort((one, two) => byteOrder(one.path, two.path)); }
function sameMovedRootIdentity(before, after) { return before?.dev === after?.dev && before?.ino === after?.ino && before?.gid === after?.gid && before?.uid === after?.uid && before?.mode === after?.mode && before?.nlink === after?.nlink; }
function sameStableObjectIdentity(before, after) { return before?.dev === after?.dev && before?.ino === after?.ino && before?.gid === after?.gid && before?.uid === after?.uid && before?.mode === after?.mode; }
function sameMovedTreeBinding(expected, actual) { return expected?.present === true && actual?.present === true && expected.sha256 === actual.sha256 && sameMovedRootIdentity(expected.identity, actual.identity) && canonicalJson(expected.tree) === canonicalJson(actual.tree); }
function sameRelocatedStateBinding(expected, actual) { return expected?.present === true && actual?.present === true && expected.sha256 === actual.sha256 && sameMovedRootIdentity(expected.identity, actual.identity) && expected.identity?.size === actual.identity?.size; }
async function removeBoundTree(root, expectedBinding, { allowEmpty = false, faultAt = null, movedRoot = false, point = 'tree-cleanup' } = {}) {
  const rootInfo = await lstat(root).catch(() => fail('TRANSACTION_CONFLICT'));
  if (expectedBinding?.identity && !sameStableObjectIdentity(expectedBinding.identity, statFingerprint(rootInfo))) fail('TRANSACTION_CONFLICT');
  const manifest = await boundTree(root);
  const expectedDigest = typeof expectedBinding === 'string' || expectedBinding === null ? expectedBinding : expectedBinding?.sha256;
  const actualTree = durableTreeNodes(root, manifest);
  const complete = expectedDigest !== null && manifest.digest === expectedDigest && (!expectedBinding?.tree || canonicalJson(actualTree) === canonicalJson(expectedBinding.tree));
  if (!(allowEmpty && manifest.nodes.length === 1) && !complete) {
    if (!expectedBinding?.tree) fail('TRANSACTION_CONFLICT');
    const expectedByPath = new Map(expectedBinding.tree.map(node => [node.path, node]));
    for (const actual of actualTree) {
      const expected = expectedByPath.get(actual.path);
      if (!expected || expected.kind !== actual.kind || expected.sha256 !== actual.sha256 || !sameStableObjectIdentity(expected.identity, actual.identity)) fail('TRANSACTION_CONFLICT');
    }
    const fileOrder = expectedBinding.tree.filter(node => node.kind === 'file').map(node => node.path).sort().reverse();
    const directoryOrder = expectedBinding.tree.filter(node => node.kind === 'directory').map(node => node.path).sort((one, two) => two.split('/').length - one.split('/').length || byteOrder(two, one));
    const deletionOrder = [...fileOrder, ...directoryOrder, '.'];
    const remaining = new Set(actualTree.map(node => node.path).concat('.'));
    const firstRemaining = deletionOrder.findIndex(path => remaining.has(path));
    if (firstRemaining < 0 || canonicalJson(deletionOrder.slice(firstRemaining)) !== canonicalJson(deletionOrder.filter(path => remaining.has(path)))) fail('TRANSACTION_CONFLICT');
  }
  const files = manifest.nodes.filter(node => node.kind === 'file').sort((one, two) => byteOrder(relative(root, two.path), relative(root, one.path)));
  for (const node of files) {
    const info = await lstat(node.path).catch(() => fail('TRANSACTION_CONFLICT'));
    if (!sameFingerprint(node.fingerprint, statFingerprint(info)) || !(await boundedBytes(node.path, MAX_BYTES, 'TRANSACTION_CONFLICT')).equals(node.bytes)) fail('TRANSACTION_CONFLICT');
    inject(faultAt, `before-${point}-file-unlink`); await unlink(node.path); inject(faultAt, `after-${point}-file-unlink`);
    inject(faultAt, `before-${point}-file-parent-fsync`); await syncPath(dirname(node.path)); inject(faultAt, `after-${point}-file-parent-fsync`);
  }
  const directories = manifest.nodes.filter(node => node.kind === 'directory').sort((one, two) => relative(root, two.path).split(sep).length - relative(root, one.path).split(sep).length || byteOrder(relative(root, two.path), relative(root, one.path)));
  for (const node of directories) {
    const info = await lstat(node.path).catch(() => fail('TRANSACTION_CONFLICT'));
    if (!sameDirectoryIdentity(directoryIdentity(info), directoryIdentity(node.fingerprint)) || (await readdir(node.path)).length !== 0) fail('TRANSACTION_CONFLICT');
    inject(faultAt, `before-${point}-directory-rmdir`); await rmdir(node.path); inject(faultAt, `after-${point}-directory-rmdir`);
    inject(faultAt, `before-${point}-directory-parent-fsync`); await syncPath(dirname(node.path)); inject(faultAt, `after-${point}-directory-parent-fsync`);
  }
}
function archiveTreeDigest(documentValue) { const hash = createHash('sha256'); const entries = validateArchive(documentValue).entries; const directories = new Set(); for (const entry of entries) { const parts = entry.path.split('/'); for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join('/')); } const nodes = [...directories].map(path => ({ path, type:'directory' })).concat(entries.map(entry => ({ ...entry, type:'file' }))).sort((one, two) => byteOrder(one.path, two.path)); for (const node of nodes) { if (node.type === 'directory') hash.update(`D\0${node.path}\0`); else { const bytes = decodedBase64(node, MAX_BYTES); hash.update(`F\0${node.path}\0${bytes.length}\0`); hash.update(bytes); } } return hash.digest('hex'); }
async function installedBinding(path) { const info = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) return contentBinding(false, null); if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT'); const manifest = await boundTree(path); return { identity:statFingerprint(info), present:true, sha256:manifest.digest, tree:durableTreeNodes(path, manifest) }; }
async function stateBinding(path) { const state = await readState(path); const identity = state.fingerprint === null ? null : statFingerprint(await lstat(path)); return { ...contentBinding(state.fingerprint !== null, state.fingerprint), identity }; }
async function removeBoundState(path, binding, faultAt = null, point = 'state-stage-cleanup') { const actual = await stateBinding(path); if (!sameFingerprint(actual, binding)) fail('TRANSACTION_CONFLICT'); inject(faultAt, `before-${point}`); await unlink(path); inject(faultAt, `after-${point}`); await syncPath(dirname(path)); }
function validTransactionIntent(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TRANSACTION_CONFLICT'); validContentBinding(value.priorInstall); validContentBinding(value.priorState); validContentBinding(value.terminalInstall); validContentBinding(value.terminalState); return value; }
async function ensureExtractionDirectory(root, parent, faultAt) { const relativeParent = relative(root, parent); if (relativeParent === '' || relativeParent === '.') return; if (relativeParent.startsWith(`..${sep}`) || relativeParent === '..' || isAbsolute(relativeParent)) fail('ARCHIVE_PATH_INVALID'); let current = root; for (const component of relativeParent.split(sep)) { current = resolve(current, component); const existing = await lstat(current).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (existing) { if (!existing.isDirectory() || existing.isSymbolicLink() || (typeof process.getuid === 'function' && existing.uid !== process.getuid()) || (existing.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT'); continue; } inject(faultAt, 'before-extract-directory-create'); await mkdir(current, { mode:0o700 }); inject(faultAt, 'after-extract-directory-create'); inject(faultAt, 'before-extract-directory-fsync'); await syncPath(dirname(current)); inject(faultAt, 'after-extract-directory-fsync'); } }
async function extract(documentValue, destination, faultAt) { for (const entry of validateArchive(documentValue).entries) { const output = resolve(destination, entry.path); const parent = dirname(output); if (relative(destination, output).startsWith('..') || isAbsolute(relative(destination, output))) fail('ARCHIVE_PATH_INVALID'); await ensureExtractionDirectory(destination, parent, faultAt); const content = decodedBase64(entry, MAX_BYTES); inject(faultAt, 'before-extract-file-create'); const handle = await open(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { inject(faultAt, 'after-extract-file-create'); inject(faultAt, 'before-extract-file-create-parent-fsync'); await syncPath(parent); inject(faultAt, 'after-extract-file-create-parent-fsync'); inject(faultAt, 'before-extract-file-write'); await handle.writeFile(content); inject(faultAt, 'after-extract-file-write'); inject(faultAt, 'before-extract-file-fsync'); await handle.sync(); inject(faultAt, 'after-extract-file-fsync'); } finally { await handle.close(); } inject(faultAt, 'before-extract-file-directory-fsync'); await syncPath(parent); inject(faultAt, 'after-extract-file-directory-fsync'); } }
function inject(faultAt, point) { if (faultAt?.collectFaultPoints instanceof Set) faultAt.collectFaultPoints.add(point); if (faultAt === `sigkill-${point}`) process.kill(process.pid, 'SIGKILL'); if (faultAt === point || (faultAt === 'interrupt' && point === 'after-extract')) fail('TRANSACTION_INTERRUPTED'); }
async function holdLockLinkBarrier(faultAt) { if (faultAt !== 'hold-before-lock-link') return; const barrier = process.env.TCRN_LOCK_TEST_BARRIER; if (!barrier) { await new Promise(done => setTimeout(done, 1000)); return; } const deadline = Date.now() + Number(process.env.TCRN_LOCK_CONTENDER_TIMEOUT_MS ?? 10000); await writeFile(resolve(barrier, `link-ready-${process.pid}`), String(process.pid), { flag:'wx', mode:0o600 }); for (;;) { try { await access(resolve(barrier, 'link-start')); return; } catch { if (Date.now() >= deadline) fail('TRANSACTION_CONFLICT'); await new Promise(done => setTimeout(done, 5)); } } }
async function syncPath(path) { const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
async function renameDurable(source, destination, faultAt, point) { inject(faultAt, `before-${point}-rename`); await rename(source, destination); inject(faultAt, `after-${point}-rename`); for (const directory of [...new Set([dirname(source), dirname(destination)])]) { inject(faultAt, `before-${point}-directory-fsync`); await syncPath(directory); inject(faultAt, `after-${point}-directory-fsync`); } }
async function writeJournal(txn, value, faultAt, point, attempt = null) { const path = resolve(txn, 'journal.json'); const bytes = Buffer.from(canonicalJson(value)); inject(faultAt, `before-${point}-create`); const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { if (attempt) attempt.journal = { bytes, identity:directoryIdentity(await lstat(path)), path, sealed:false }; inject(faultAt, `after-${point}-create`); inject(faultAt, `before-${point}-write`); await handle.writeFile(bytes); inject(faultAt, `after-${point}-write`); if (attempt) attempt.journal.sealed = true; inject(faultAt, `before-${point}-file-fsync`); await handle.sync(); inject(faultAt, `after-${point}-file-fsync`); } finally { await handle.close(); } inject(faultAt, `before-${point}-dir-fsync`); await syncPath(txn); inject(faultAt, `after-${point}-dir-fsync`); }
function transactionAttemptStageName(value) { return `${TXN_ATTEMPT_STAGE_PREFIX}${value.pid}-${value.id}`; }
function validTransactionAttempt(value) {
  exact(value, ['baseIdentity', 'directory', 'id', 'lockFingerprint', 'lockOwnerSha256', 'operation', 'pid', 'schemaVersion'], 'TRANSACTION_CONFLICT');
  if (value.schemaVersion !== 'tcrn.workflow.helper.transaction-attempt.v1' || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) || !Number.isSafeInteger(value.pid) || value.pid <= 0 || value.directory !== `${TXN_STAGE_PREFIX}${value.pid}-${value.id}` || !['install', 'update', 'reinstall', 'uninstall'].includes(value.operation) || !/^[a-f0-9]{64}$/.test(value.lockOwnerSha256)) fail('TRANSACTION_CONFLICT');
  validDirectoryIdentity(value.baseIdentity); validStatFingerprint(value.lockFingerprint); return value;
}
async function readTransactionAttempt(base) {
  const path = resolve(base, TXN_ATTEMPT); const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!before) return null; if (!privateRegular(before, 2)) fail('TRANSACTION_CONFLICT');
  const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const value = validTransactionAttempt(canonicalDocument(bytes, 'TRANSACTION_CONFLICT'));
  const after = await lstat(path).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameStat(before, after)) fail('TRANSACTION_CONFLICT');
  return { bytes, fingerprint:statFingerprint(before), path, value };
}
async function bindTransactionOwnerToAttempt(txn, authority) {
  const directory = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT')); if (!directory.isDirectory() || directory.isSymbolicLink()) fail('TRANSACTION_CONFLICT');
  const ownerPath = resolve(txn, 'owner.json'); const owner = await document(ownerPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true });
  exact(owner, ['attemptFingerprint', 'attemptSha256', 'directoryIdentity', 'id', 'pid', 'schemaVersion'], 'TRANSACTION_CONFLICT');
  if (owner.schemaVersion !== 'tcrn.workflow.helper.transaction-owner.v3' || owner.id !== authority.value.id || owner.pid !== authority.value.pid || owner.attemptSha256 !== sha256(authority.bytes) || !sameFingerprint(owner.attemptFingerprint, authority.fingerprint) || !sameDirectoryIdentity(owner.directoryIdentity, directoryIdentity(directory))) fail('TRANSACTION_CONFLICT');
  return owner;
}
async function publishTransactionAttempt(base, heldLock, value, faultAt) {
  if (!heldLock?.owner?.bytes || !heldLock?.owner?.fingerprint || heldLock.lock !== resolve(base, LOCK_DIR)) fail('TRANSACTION_CONFLICT');
  const currentLock = await lockOwner(heldLock.lock); if (!currentLock.bytes.equals(heldLock.owner.bytes) || !sameFingerprint(currentLock.fingerprint, heldLock.owner.fingerprint)) fail('TRANSACTION_CONFLICT');
  const bytes = Buffer.from(canonicalJson(validTransactionAttempt(value))); const stage = resolve(base, transactionAttemptStageName(value)); const fixed = resolve(base, TXN_ATTEMPT); let state = 'none'; let stageIdentity = null;
  try {
    inject(faultAt, 'before-transaction-attempt-stage-create'); const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); state = 'stage'; stageIdentity = directoryIdentity(await lstat(stage));
    try { inject(faultAt, 'after-transaction-attempt-stage-create'); inject(faultAt, 'before-transaction-attempt-stage-write'); await handle.writeFile(bytes); inject(faultAt, 'after-transaction-attempt-stage-write'); inject(faultAt, 'before-transaction-attempt-stage-file-fsync'); await handle.sync(); inject(faultAt, 'after-transaction-attempt-stage-file-fsync'); } finally { await handle.close(); }
    inject(faultAt, 'before-transaction-attempt-stage-dir-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-attempt-stage-dir-fsync');
    inject(faultAt, 'before-transaction-attempt-link'); try { await link(stage, fixed); state = 'published_2link'; } catch (error) { if (error?.code === 'EEXIST') fail('TRANSACTION_CONFLICT'); throw error; } inject(faultAt, 'after-transaction-attempt-link');
    inject(faultAt, 'before-transaction-attempt-fixed-dir-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-attempt-fixed-dir-fsync');
    const fixedBefore = await lstat(fixed); const stageBefore = await lstat(stage); if (!privateRegular(fixedBefore, 2) || !sameStat(fixedBefore, stageBefore) || fixedBefore.nlink !== 2 || !(await boundedBytes(fixed, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 })).equals(bytes)) fail('TRANSACTION_CONFLICT');
    inject(faultAt, 'before-transaction-attempt-stage-unlink'); await unlink(stage); state = 'fixed_1link'; inject(faultAt, 'after-transaction-attempt-stage-unlink');
    inject(faultAt, 'before-transaction-attempt-stage-unlink-dir-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-attempt-stage-unlink-dir-fsync');
    const attempt = await readTransactionAttempt(base); if (!attempt || attempt.value.id !== value.id || attempt.bytes.compare(bytes) !== 0 || (await lstat(fixed)).nlink !== 1) fail('TRANSACTION_CONFLICT'); return attempt;
  } catch (error) {
    try {
      const stageInfo = await lstat(stage).catch(found => found?.code === 'ENOENT' ? null : Promise.reject(found)); const fixedInfo = await lstat(fixed).catch(found => found?.code === 'ENOENT' ? null : Promise.reject(found));
      if (state === 'published_2link' && stageInfo && fixedInfo && sameStat(stageInfo, fixedInfo)) { await removeLockPath(fixed, statFingerprint(fixedInfo), null, 'transaction-attempt-fixed-attempt-cleanup'); const remaining = await lstat(stage); await removeLockPath(stage, statFingerprint(remaining), null, 'transaction-attempt-stage-attempt-cleanup'); }
      else if (state === 'fixed_1link' && fixedInfo) await removeLockPath(fixed, statFingerprint(fixedInfo), null, 'transaction-attempt-fixed-attempt-cleanup');
      else if (stageInfo && stageIdentity && sameDirectoryIdentity(stageIdentity, directoryIdentity(stageInfo))) await removeLockPath(stage, statFingerprint(stageInfo), null, 'transaction-attempt-stage-attempt-cleanup');
    } catch { fail('TRANSACTION_CONFLICT'); }
    throw error;
  }
}
async function clearTransactionAttempt(base, expected, faultAt = null) {
  const current = await readTransactionAttempt(base); if (!current || current.value.id !== expected.value.id || !current.bytes.equals(expected.bytes) || !sameFingerprint(current.fingerprint, expected.fingerprint)) fail('TRANSACTION_CONFLICT');
  await removeLockPath(current.path, current.fingerprint, faultAt, 'transaction-attempt-cleanup');
}
async function reapTransactionAttemptStages(base) {
  const entries = await readdir(base, { withFileTypes:true });
  for (const entry of entries) {
    if (!entry.name.startsWith(TXN_ATTEMPT_STAGE_PREFIX)) continue;
    const match = new RegExp(`^${TXN_ATTEMPT_STAGE_PREFIX}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name); if (!match || !entry.isFile() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT');
    const pid = Number(match[1]); if (!(await deadOwner({ pid }))) fail('TRANSACTION_CONFLICT'); const path = resolve(base, entry.name); const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!before) continue; if (!privateRegular(before, 2)) fail('TRANSACTION_CONFLICT');
    const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const fixed = await readTransactionAttempt(base);
    if (before.nlink === 2) { if (!fixed || !sameStat(before, await lstat(fixed.path)) || !fixed.bytes.equals(bytes)) fail('TRANSACTION_CONFLICT'); await removeLockPath(path, statFingerprint(before), null, 'transaction-attempt-stage-cleanup'); continue; }
    if (before.nlink !== 1) fail('TRANSACTION_CONFLICT');
    if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) { await removeLockPath(path, statFingerprint(before), null, 'transaction-attempt-stage-cleanup'); continue; }
    let expected; try { expected = validTransactionAttempt(canonicalDocument(bytes, 'TRANSACTION_CONFLICT')); } catch { fail('TRANSACTION_CONFLICT'); }
    if (expected.pid !== pid || expected.id !== match[2] || transactionAttemptStageName(expected) !== entry.name) fail('TRANSACTION_CONFLICT'); await removeLockPath(path, statFingerprint(before), null, 'transaction-attempt-stage-cleanup');
  }
}
async function reapTransactionClaimStages(base) { const entries = await readdir(base, { withFileTypes:true }); for (const entry of entries) { if (!entry.name.startsWith(TXN_CLAIM_STAGE_PREFIX)) continue; const match = new RegExp(`^${TXN_CLAIM_STAGE_PREFIX}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name); if (!match || !entry.isFile() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const pid = Number(match[1]); const id = match[2]; if (!(await deadOwner({ pid }))) fail('TRANSACTION_CONFLICT'); const path = resolve(base, entry.name); const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!before) continue; if (!privateRegular(before, 2)) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); if (bytes.length === 0 && before.nlink === 1) { await removeLockPath(path, statFingerprint(before), null, 'transaction-claim-stage-cleanup'); continue; } let value; try { value = canonicalDocument(bytes, 'TRANSACTION_CONFLICT'); } catch { fail('TRANSACTION_CONFLICT'); } exact(value, ['baseIdentity', 'directory', 'directoryIdentity', 'id', 'journalSha256', 'operation', 'pid', 'priorInstall', 'priorState', 'schemaVersion', 'terminalInstall', 'terminalState'], 'TRANSACTION_CONFLICT'); if (value.schemaVersion !== 'tcrn.workflow.helper.transaction-claim.v2' || value.id !== id || value.pid !== pid || value.directory !== `${TXN_STAGE_PREFIX}${pid}-${id}` || !/^[a-f0-9]{64}$/.test(value.journalSha256)) fail('TRANSACTION_CONFLICT'); validDirectoryIdentity(value.baseIdentity); validDirectoryIdentity(value.directoryIdentity); validTransactionIntent(value); const txn = resolve(base, value.directory); const journal = await readJournal(txn); if (sha256(canonicalJson(journal)) !== value.journalSha256) fail('TRANSACTION_CONFLICT'); const fixed = resolve(base, TXN_DIR); if (before.nlink === 2) { const fixedInfo = await lstat(fixed).catch(() => fail('TRANSACTION_CONFLICT')); const fixedBytes = await boundedBytes(fixed, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); if (!sameStat(before, fixedInfo) || !fixedBytes.equals(bytes)) fail('TRANSACTION_CONFLICT'); await removeLockPath(path, statFingerprint(before), null, 'transaction-claim-stage-cleanup'); } else if (before.nlink === 1) await removeLockPath(path, statFingerprint(before), null, 'transaction-claim-stage-cleanup'); else fail('TRANSACTION_CONFLICT'); } }
async function reapTransactionStages(base) { const claim = await readTransactionClaim(base); const entries = await readdir(base, { withFileTypes:true }); for (const entry of entries) { if (!entry.name.startsWith(TXN_STAGE_PREFIX)) continue; const match = new RegExp(`^${TXN_STAGE_PREFIX}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name); if (!match || !entry.isDirectory() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); if (claim?.value.directory === entry.name) continue; const pid = Number(match[1]); const id = match[2]; if (!(await deadOwner({ pid }))) fail('TRANSACTION_CONFLICT'); const path = resolve(base, entry.name); const info = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) continue; if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT'); const children = await readdir(path, { withFileTypes:true }).catch(() => fail('TRANSACTION_CONFLICT')); if (children.length === 0) { const after = await lstat(path).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameFingerprint(statFingerprint(info), statFingerprint(after)) || (await readdir(path)).length !== 0) fail('TRANSACTION_CONFLICT'); await rmdir(path); await syncPath(base); continue; } if (children.length === 1 && children[0].name === 'owner.json') { await removeOwnerOnlyTransactionDirectory(base, path, id, pid); continue; } const names = children.map(child => child.name).sort(); if (names.length === 2 && names.join(',') === 'journal.json,owner.json') { if (!children.every(child => child.isFile() && !child.isSymbolicLink())) fail('TRANSACTION_CONFLICT'); const journal = await readJournal(path); if (journal.id !== id || journal.directory !== entry.name) fail('TRANSACTION_CONFLICT'); await removeClosedTransactionDirectory(base, path, journal, journal.directoryIdentity); continue; } if (names.length === 4 && names.join(',') === 'journal.json,owner.json,stage,state-next.json') { const stageEntry = children.find(child => child.name === 'stage'); const stateEntry = children.find(child => child.name === 'state-next.json'); if (!stageEntry?.isDirectory() || stageEntry.isSymbolicLink() || !stateEntry?.isFile() || stateEntry.isSymbolicLink() || !children.filter(child => child.name === 'owner.json' || child.name === 'journal.json').every(child => child.isFile() && !child.isSymbolicLink())) fail('TRANSACTION_CONFLICT'); const journal = await readJournal(path); if (journal.id !== id || journal.directory !== entry.name || !journal.terminalInstall.present || !journal.terminalState.present) fail('TRANSACTION_CONFLICT'); await removeBoundTree(resolve(path, 'stage'), journal.terminalInstall, { point:'reap-preclaim-stage-cleanup' }); await removeBoundState(resolve(path, 'state-next.json'), journal.terminalState, null, 'reap-preclaim-state-cleanup'); await removeClosedTransactionDirectory(base, path, journal, journal.directoryIdentity); continue; } fail('TRANSACTION_CONFLICT'); } }
async function removeAttemptBoundTransactionDirectory(base, txn, authority) {
  const directory = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT'));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (typeof process.getuid === 'function' && directory.uid !== process.getuid()) || (directory.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT');
  const entries = await readdir(txn, { withFileTypes:true }).catch(() => fail('TRANSACTION_CONFLICT'));
  const ownerEntry = entries.find(entry => entry.name === 'owner.json');
  if (!ownerEntry) {
    if (entries.length !== 0) fail('TRANSACTION_CONFLICT');
  } else {
    if (!ownerEntry.isFile() || ownerEntry.isSymbolicLink()) fail('TRANSACTION_CONFLICT');
    const ownerPath = resolve(txn, 'owner.json');
    const ownerInfo = await lstat(ownerPath).catch(() => fail('TRANSACTION_CONFLICT'));
    if (!privateRegular(ownerInfo, 1)) fail('TRANSACTION_CONFLICT');
    const expectedOwner = Buffer.from(canonicalJson({
      attemptFingerprint:authority.fingerprint,
      attemptSha256:sha256(authority.bytes),
      directoryIdentity:directoryIdentity(directory),
      id:authority.value.id,
      pid:authority.value.pid,
      schemaVersion:'tcrn.workflow.helper.transaction-owner.v3',
    }));
    const ownerBytes = await boundedBytes(ownerPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true });
    if (ownerBytes.length > expectedOwner.length || !expectedOwner.subarray(0, ownerBytes.length).equals(ownerBytes)) fail('TRANSACTION_CONFLICT');
    if (ownerBytes.length !== expectedOwner.length && entries.length !== 1) fail('TRANSACTION_CONFLICT');
    if (ownerBytes.length === expectedOwner.length) await bindTransactionOwnerToAttempt(txn, authority);
  }
  const manifest = await boundTree(txn);
  const binding = { identity:statFingerprint(directory), present:true, sha256:manifest.digest, tree:durableTreeNodes(txn, manifest) };
  await removeBoundTree(txn, binding, { point:'transaction-authority-recovery' });
  await syncPath(base);
}
async function reapAuthorizedTransactionStages(base, authority, claim) {
  const entries = await readdir(base, { withFileTypes:true });
  let matched = false;
  for (const entry of entries) {
    if (!entry.name.startsWith(TXN_STAGE_PREFIX)) continue;
    const match = new RegExp(`^${TXN_STAGE_PREFIX}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name);
    if (!match || !entry.isDirectory() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT');
    if (claim?.value.directory === entry.name) continue;
    if (!authority || authority.value.directory !== entry.name || authority.value.pid !== Number(match[1]) || authority.value.id !== match[2] || matched) fail('TRANSACTION_CONFLICT');
    if (!(await deadOwner(authority.value))) fail('TRANSACTION_CONFLICT');
    if (!sameDirectoryIdentity(authority.value.baseIdentity, directoryIdentity(await lstat(base)))) fail('TRANSACTION_CONFLICT');
    await removeAttemptBoundTransactionDirectory(base, resolve(base, entry.name), authority);
    matched = true;
  }
  return matched;
}
async function readTransactionClaim(base) { const claim = resolve(base, TXN_DIR); const info = await lstat(claim).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) return null; if (!privateRegular(info, 2)) fail('TRANSACTION_CONFLICT'); const value = await document(claim, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); exact(value, ['baseIdentity', 'directory', 'directoryIdentity', 'id', 'journalSha256', 'operation', 'pid', 'priorInstall', 'priorState', 'schemaVersion', 'terminalInstall', 'terminalState'], 'TRANSACTION_CONFLICT'); if (value.schemaVersion !== 'tcrn.workflow.helper.transaction-claim.v2' || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.directory !== 'string' || value.directory !== `${TXN_STAGE_PREFIX}${value.pid}-${value.id}` || !['install', 'update', 'reinstall', 'uninstall'].includes(value.operation) || !/^[a-f0-9]{64}$/.test(value.journalSha256)) fail('TRANSACTION_CONFLICT'); validDirectoryIdentity(value.baseIdentity); validDirectoryIdentity(value.directoryIdentity); validTransactionIntent(value); const after = await lstat(claim); if (!sameStat(info, after)) fail('TRANSACTION_CONFLICT'); return { claim, fingerprint:statFingerprint(info), value, txn:resolve(base, value.directory) }; }
function receiptStageName(id) { return `${TXN_RECEIPT_STAGE_PREFIX}${process.pid}-${id}`; }
function validReceipt(value) { exact(value, ['baseIdentity', 'id', 'journalSha256', 'schemaVersion', 'terminalInstall', 'terminalState'], 'TRANSACTION_CONFLICT'); if (value.schemaVersion !== 'tcrn.workflow.helper.transaction-terminal.v1' || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) || !/^[a-f0-9]{64}$/.test(value.journalSha256)) fail('TRANSACTION_CONFLICT'); validDirectoryIdentity(value.baseIdentity); validContentBinding(value.terminalInstall); validContentBinding(value.terminalState); if (value.terminalInstall.present && (!value.terminalInstall.identity || !value.terminalInstall.tree) || !value.terminalState.identity) fail('TRANSACTION_CONFLICT'); return value; }
async function terminalReceiptValue(base, statePath, id, journal) { const install = await installedBinding(resolve(base, 'install')); const state = await stateBinding(statePath); if (install.present && (!install.identity || !install.tree) || !state.identity) fail('TRANSACTION_CONFLICT'); return { baseIdentity:directoryIdentity(await lstat(base)), id, journalSha256:sha256(canonicalJson(journal)), schemaVersion:'tcrn.workflow.helper.transaction-terminal.v1', terminalInstall:install, terminalState:state }; }
async function readTerminalReceipt(base) { const path = resolve(base, TXN_RECEIPT); const info = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) return null; if (!privateRegular(info, 2)) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const value = canonicalDocument(bytes, 'TRANSACTION_CONFLICT'); validReceipt(value); const after = await lstat(path); if (!sameStat(info, after)) fail('TRANSACTION_CONFLICT'); return { bytes, fingerprint:statFingerprint(info), path, value }; }
async function reapTerminalReceiptStages(base, statePath) { const entries = await readdir(base, { withFileTypes:true }); for (const entry of entries) { if (!entry.name.startsWith(TXN_RECEIPT_STAGE_PREFIX)) continue; const match = new RegExp(`^${TXN_RECEIPT_STAGE_PREFIX}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name); if (!match || !entry.isFile() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const pid = Number(match[1]); const id = match[2]; const path = resolve(base, entry.name); const info = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) continue; if (!privateRegular(info, 2)) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const active = ACTIVE_RECEIPT_STAGES.get(path); const locallyOwned = active && sameDirectoryIdentity(active.identity, directoryIdentity(info)) && bytes.length <= active.bytes.length && active.bytes.subarray(0, bytes.length).equals(bytes); if (!locallyOwned && !(await deadOwner({ pid }))) fail('TRANSACTION_CONFLICT'); const claim = await readTransactionClaim(base); const journal = claim?.value.id === id ? await readJournal(claim.txn) : null; const expectedBytes = journal ? Buffer.from(canonicalJson(await terminalReceiptValue(base, statePath, id, journal))) : null; if (info.nlink === 1 && expectedBytes && bytes.length < expectedBytes.length && expectedBytes.subarray(0, bytes.length).equals(bytes)) { await removeLockPath(path, statFingerprint(info), null, 'transaction-receipt-stage-cleanup'); ACTIVE_RECEIPT_STAGES.delete(path); continue; } const value = canonicalDocument(bytes, 'TRANSACTION_CONFLICT'); validReceipt(value); if (value.id !== id) fail('TRANSACTION_CONFLICT'); const staged = { bytes, fingerprint:statFingerprint(info), path, value }; const fixed = await readTerminalReceipt(base); if (fixed) { if (!fixed.bytes.equals(bytes) || !sameStat(await lstat(fixed.path), info) || info.nlink !== 2) fail('TRANSACTION_CONFLICT'); await removeLockPath(path, staged.fingerprint, null, 'transaction-receipt-stage-cleanup'); ACTIVE_RECEIPT_STAGES.delete(path); continue; } if (!claim || claim.value.id !== id || claim.value.journalSha256 !== value.journalSha256 || info.nlink !== 1 || !(await receiptMatches(base, statePath, staged))) fail('TRANSACTION_CONFLICT'); await removeLockPath(path, staged.fingerprint, null, 'transaction-receipt-stage-cleanup'); ACTIVE_RECEIPT_STAGES.delete(path); } }
async function receiptMatches(base, statePath, receipt) { const root = await lstat(base).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameDirectoryIdentity(receipt.value.baseIdentity, directoryIdentity(root))) return false; const install = await installedBinding(resolve(base, 'install')); const state = await stateBinding(statePath); return sameFingerprint(install, receipt.value.terminalInstall) && sameFingerprint(state, receipt.value.terminalState); }
async function publishTerminalReceipt(base, statePath, transaction, faultAt) { const install = await installedBinding(resolve(base, 'install')); const state = await stateBinding(statePath); if (install.present && (!install.identity || !install.tree) || !state.identity) fail('TRANSACTION_CONFLICT'); const value = { baseIdentity:directoryIdentity(await lstat(base)), id:transaction.id, journalSha256:sha256(canonicalJson(transaction.journal)), schemaVersion:'tcrn.workflow.helper.transaction-terminal.v1', terminalInstall:install, terminalState:state }; const bytes = Buffer.from(canonicalJson(value)); const fixed = resolve(base, TXN_RECEIPT); const stage = resolve(base, receiptStageName(transaction.id)); inject(faultAt, 'before-transaction-receipt-create'); const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { ACTIVE_RECEIPT_STAGES.set(stage, { bytes, identity:directoryIdentity(await lstat(stage)) }); inject(faultAt, 'after-transaction-receipt-create'); inject(faultAt, 'before-transaction-receipt-write'); await handle.writeFile(bytes); inject(faultAt, 'after-transaction-receipt-write'); inject(faultAt, 'before-transaction-receipt-file-fsync'); await handle.sync(); inject(faultAt, 'after-transaction-receipt-file-fsync'); } finally { await handle.close(); } inject(faultAt, 'before-transaction-receipt-dir-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-receipt-dir-fsync'); inject(faultAt, 'before-transaction-receipt-link'); try { await link(stage, fixed); } catch (error) { if (error?.code === 'EEXIST') fail('TRANSACTION_CONFLICT'); throw error; } inject(faultAt, 'after-transaction-receipt-link'); inject(faultAt, 'before-transaction-receipt-base-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-receipt-base-fsync'); const fixedReceipt = await readTerminalReceipt(base); const staged = await lstat(stage); if (!fixedReceipt || !fixedReceipt.bytes.equals(bytes) || !sameStat(await lstat(fixed), staged) || staged.nlink !== 2) fail('TRANSACTION_CONFLICT'); inject(faultAt, 'before-transaction-receipt-stage-unlink'); await unlink(stage); ACTIVE_RECEIPT_STAGES.delete(stage); inject(faultAt, 'after-transaction-receipt-stage-unlink'); await syncPath(base); inject(faultAt, 'after-transaction-receipt-stage-base-fsync'); return await readTerminalReceipt(base); }
async function clearTerminalReceipt(base, statePath, receipt, faultAt) { if (!(await receiptMatches(base, statePath, receipt))) fail('TRANSACTION_CONFLICT'); inject(faultAt, 'before-transaction-receipt-cleanup'); await removeLockPath(receipt.path, receipt.fingerprint, null, 'transaction-receipt-cleanup'); inject(faultAt, 'after-transaction-receipt-cleanup'); }
async function removeClosedTransactionDirectory(base, txn, journal, expectedIdentity) { const directory = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT')); if (!directory.isDirectory() || directory.isSymbolicLink() || !sameDirectoryIdentity(directoryIdentity(directory), expectedIdentity)) fail('TRANSACTION_CONFLICT'); const entries = await readdir(txn, { withFileTypes:true }).catch(() => fail('TRANSACTION_CONFLICT')); if (entries.length !== 2 || !entries.every(entry => entry.isFile() && !entry.isSymbolicLink() && (entry.name === 'journal.json' || entry.name === 'owner.json'))) fail('TRANSACTION_CONFLICT'); const journalPath = resolve(txn, 'journal.json'); const ownerPath = resolve(txn, 'owner.json'); const journalFingerprint = await exactOwnedFile(journalPath, Buffer.from(canonicalJson(journal)), 1); const owner = await document(ownerPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true }); const ownerFingerprint = await exactOwnedFile(ownerPath, Buffer.from(canonicalJson(owner)), 1); if (!journalFingerprint || !ownerFingerprint || !sameFingerprint(journal.ownerFingerprint, ownerFingerprint)) fail('TRANSACTION_CONFLICT'); await removeLockPath(journalPath, journalFingerprint, null, 'transaction-journal-cleanup'); await removeLockPath(ownerPath, ownerFingerprint, null, 'transaction-owner-cleanup'); const after = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameDirectoryIdentity(directoryIdentity(after), expectedIdentity) || (await readdir(txn)).length !== 0) fail('TRANSACTION_CONFLICT'); await rmdir(txn); await syncPath(base); }
async function removeOwnerOnlyTransactionDirectory(base, txn, id, pid, authority = null) { const directory = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT')); if (!directory.isDirectory() || directory.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const entries = await readdir(txn, { withFileTypes:true }).catch(() => fail('TRANSACTION_CONFLICT')); if (entries.length !== 1 || !entries[0].isFile() || entries[0].isSymbolicLink() || entries[0].name !== 'owner.json') fail('TRANSACTION_CONFLICT'); const ownerPath = resolve(txn, 'owner.json'); const owner = await document(ownerPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true }); exact(owner, ['attemptFingerprint', 'attemptSha256', 'directoryIdentity', 'id', 'pid', 'schemaVersion'], 'TRANSACTION_CONFLICT'); if (owner.id !== id || owner.pid !== pid || owner.schemaVersion !== 'tcrn.workflow.helper.transaction-owner.v3' || !authority || owner.attemptSha256 !== sha256(authority.bytes) || !sameFingerprint(owner.attemptFingerprint, authority.fingerprint) || !sameDirectoryIdentity(owner.directoryIdentity, directoryIdentity(directory))) fail('TRANSACTION_CONFLICT'); const ownerFingerprint = await exactOwnedFile(ownerPath, Buffer.from(canonicalJson(owner)), 1); if (!ownerFingerprint) fail('TRANSACTION_CONFLICT'); await removeLockPath(ownerPath, ownerFingerprint, null, 'transaction-owner-cleanup'); const after = await lstat(txn).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameDirectoryIdentity(directoryIdentity(after), directoryIdentity(directory)) || (await readdir(txn)).length !== 0) fail('TRANSACTION_CONFLICT'); await rmdir(txn); await syncPath(base); }
async function clearTransaction(base, transaction, faultAt = null, result = 'terminal') { const expectedClaim = transaction.claimFingerprint ?? transaction.fingerprint; const current = await readTransactionClaim(base); if (!current || current.value.id !== transaction.id || current.txn !== transaction.txn || !sameFingerprint(current.fingerprint, expectedClaim)) fail('TRANSACTION_CONFLICT'); const journal = await readJournal(transaction.txn); await bindTransaction(base, current, journal); if (!(await claimedResultMatches(base, resolve(base, 'state.json'), current, result))) fail('TRANSACTION_CONFLICT'); const receipt = result === 'terminal' ? await readTerminalReceipt(base) : null; if (receipt && (receipt.value.id !== journal.id || receipt.value.journalSha256 !== current.value.journalSha256 || !(await receiptMatches(base, resolve(base, 'state.json'), receipt)))) fail('TRANSACTION_CONFLICT'); if (result === 'terminal' && !receipt) fail('TRANSACTION_CONFLICT'); inject(faultAt, 'before-transaction-directory-cleanup'); await removeClosedTransactionDirectory(base, transaction.txn, journal, current.value.directoryIdentity); inject(faultAt, 'after-transaction-directory-cleanup'); const terminalClaim = await readTransactionClaim(base); if (!terminalClaim || !sameFingerprint(terminalClaim.fingerprint, current.fingerprint)) fail('TRANSACTION_CONFLICT'); inject(faultAt, 'before-transaction-claim-cleanup'); await removeLockPath(terminalClaim.claim, terminalClaim.fingerprint, null, 'transaction-claim-cleanup'); ACTIVE_TRANSACTION_IDS.delete(transaction.id); inject(faultAt, 'after-transaction-claim-cleanup'); if (receipt) await clearTerminalReceipt(base, resolve(base, 'state.json'), receipt, faultAt); }
async function removeAttemptFile(file, point) {
  if (!file) return;
  const info = await lstat(file.path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info || !privateRegular(info, 1) || !sameDirectoryIdentity(file.identity, directoryIdentity(info))) fail('TRANSACTION_CONFLICT');
  const bytes = await boundedBytes(file.path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true });
  if ((file.sealed && !bytes.equals(file.bytes)) || (!file.sealed && (bytes.length > file.bytes.length || !file.bytes.subarray(0, bytes.length).equals(bytes)))) fail('TRANSACTION_CONFLICT');
  const after = await lstat(file.path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!after || !sameStat(info, after)) fail('TRANSACTION_CONFLICT');
  await removeLockPath(file.path, statFingerprint(after), null, point);
}
async function removePublishedAttemptClaim(base, fixedPath, stage) {
  const fixed = await lstat(fixedPath).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!fixed || !privateRegular(fixed, 2) || !sameDirectoryIdentity(stage.identity, directoryIdentity(fixed))) fail('TRANSACTION_CONFLICT');
  const fixedBytes = await boundedBytes(fixedPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 });
  if (!fixedBytes.equals(stage.bytes)) fail('TRANSACTION_CONFLICT');
  const staged = await lstat(stage.path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (staged) {
    if (!privateRegular(staged, 2) || !sameDirectoryIdentity(stage.identity, directoryIdentity(staged)) || staged.dev !== fixed.dev || staged.ino !== fixed.ino || staged.nlink !== 2 || fixed.nlink !== 2) fail('TRANSACTION_CONFLICT');
    await removeLockPath(fixedPath, statFingerprint(fixed), null, 'transaction-claim-attempt-cleanup');
    await removeAttemptFile(stage, 'transaction-claim-stage-attempt-cleanup');
  } else {
    if (fixed.nlink !== 1) fail('TRANSACTION_CONFLICT');
    await removeLockPath(fixedPath, statFingerprint(fixed), null, 'transaction-claim-attempt-cleanup');
  }
  await syncPath(base);
}
async function removeUnpublishedTransaction(base, attempt) {
  if (attempt.claimState === 'stage_only') await removeAttemptFile(attempt.claim, 'transaction-claim-stage-attempt-cleanup');
  const directory = await lstat(attempt.txn).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!directory) return;
  if (!directory.isDirectory() || directory.isSymbolicLink() || !sameDirectoryIdentity(attempt.directoryIdentity, directoryIdentity(directory))) fail('TRANSACTION_CONFLICT');
  if (attempt.stateFile) await removeAttemptFile(attempt.stateFile, 'transaction-state-stage-attempt-cleanup');
  if (attempt.stage) await removeBoundTree(attempt.stagePath, attempt.stage, { point:'transaction-stage-attempt-cleanup' });
  else if (attempt.emptyStageFingerprint) { const stage = await lstat(attempt.stagePath).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameFingerprint(attempt.emptyStageFingerprint, statFingerprint(stage)) || !stage.isDirectory() || (await readdir(attempt.stagePath)).length !== 0) fail('TRANSACTION_CONFLICT'); await rmdir(attempt.stagePath); await syncPath(attempt.txn); }
  const children = await readdir(attempt.txn, { withFileTypes:true });
  const allowed = new Map();
  if (attempt.owner) allowed.set('owner.json', attempt.owner);
  if (attempt.journal) allowed.set('journal.json', attempt.journal);
  if (children.length !== allowed.size || children.some(child => !child.isFile() || child.isSymbolicLink() || !allowed.has(child.name))) fail('TRANSACTION_CONFLICT');
  for (const [name, file] of allowed) await removeAttemptFile({ ...file, path:resolve(attempt.txn, name) }, 'transaction-attempt-child-cleanup');
  await rmdir(attempt.txn);
  await syncPath(base);
}
async function createTransaction(base, operation, nextState, faultAt, intent, heldLock = null) {
  const id = randomUUID(); const pid = process.pid; const directory = `${TXN_STAGE_PREFIX}${pid}-${id}`;
  const txn = resolve(base, directory);
  validTransactionIntent(intent); const baseIdentity = directoryIdentity(await lstat(base));
  if (!heldLock?.owner?.bytes || !heldLock?.owner?.fingerprint) fail('TRANSACTION_CONFLICT');
  const authorityValue = { baseIdentity, directory, id, lockFingerprint:heldLock.owner.fingerprint, lockOwnerSha256:sha256(heldLock.owner.bytes), operation, pid, schemaVersion:'tcrn.workflow.helper.transaction-attempt.v1' };
  const authority = await publishTransactionAttempt(base, heldLock, authorityValue, faultAt);
  const attempt = { authority, baseIdentity, claimStage:resolve(base, `${TXN_CLAIM_STAGE_PREFIX}${pid}-${id}`), claimState:'none', directory, directoryIdentity:null, id, nextState, operation, owner:null, journal:null, claim:null, pid, txn };
  try {
    inject(faultAt, 'before-transaction-stage-create'); await mkdir(txn, { mode:0o700 });
    attempt.directoryIdentity = directoryIdentity(await lstat(txn)); ACTIVE_TRANSACTION_IDS.add(id); inject(faultAt, 'after-transaction-stage-create'); inject(faultAt, 'before-transaction-stage-base-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-stage-base-fsync');
    const ownerPath = resolve(txn, 'owner.json'); const owner = { attemptFingerprint:authority.fingerprint, attemptSha256:sha256(authority.bytes), directoryIdentity:attempt.directoryIdentity, id, pid, schemaVersion:'tcrn.workflow.helper.transaction-owner.v3' }; const ownerBytes = Buffer.from(canonicalJson(owner));
    inject(faultAt, 'before-transaction-owner-create'); const handle = await open(ownerPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { attempt.owner = { bytes:ownerBytes, identity:directoryIdentity(await lstat(ownerPath)), path:ownerPath, sealed:false }; inject(faultAt, 'after-transaction-owner-create'); inject(faultAt, 'before-transaction-owner-write'); await handle.writeFile(ownerBytes); inject(faultAt, 'after-transaction-owner-write'); attempt.owner.sealed = true; inject(faultAt, 'before-transaction-owner-file-fsync'); await handle.sync(); inject(faultAt, 'after-transaction-owner-file-fsync'); } finally { await handle.close(); }
    inject(faultAt, 'before-transaction-owner-dir-fsync'); await syncPath(txn); inject(faultAt, 'after-transaction-owner-dir-fsync');
    return attempt;
  } catch (error) {
    try {
      await removeUnpublishedTransaction(base, attempt);
      await clearTransactionAttempt(base, authority);
      ACTIVE_TRANSACTION_IDS.delete(id);
    } catch { fail('TRANSACTION_CONFLICT'); }
    throw error;
  }
}
async function publishTransaction(base, attempt, intent, faultAt) {
  const claim = resolve(base, TXN_DIR); const ownerPath = resolve(attempt.txn, 'owner.json');
  try {
    const terminalInstall = attempt.operation === 'uninstall' ? intent.terminalInstall : await installedBinding(attempt.stagePath);
    const terminalState = attempt.operation === 'uninstall' ? intent.terminalState : await stateBinding(attempt.statePath);
    if (!sameContentBinding(terminalInstall, intent.terminalInstall) || !sameContentBinding(terminalState, intent.terminalState) || attempt.operation !== 'uninstall' && (!terminalInstall.identity || !terminalInstall.tree || !terminalState.identity)) fail('TRANSACTION_CONFLICT');
    if (attempt.operation !== 'uninstall') attempt.stage = terminalInstall;
    attempt.state = terminalState;
    const journal = { baseIdentity:attempt.baseIdentity, directory:attempt.directory, directoryIdentity:attempt.directoryIdentity, id:attempt.id, nextState:attempt.nextState, operation:attempt.operation, ownerFingerprint:statFingerprint(await lstat(ownerPath)), phase:'prepared', priorInstall:intent.priorInstall, priorState:intent.priorState, schemaVersion:TXN_SCHEMA, terminalInstall, terminalState };
    await writeJournal(attempt.txn, journal, faultAt, 'journal', attempt);
    const claimValue = { baseIdentity:attempt.baseIdentity, directory:attempt.directory, directoryIdentity:attempt.directoryIdentity, id:attempt.id, journalSha256:sha256(canonicalJson(journal)), operation:attempt.operation, pid:attempt.pid, priorInstall:intent.priorInstall, priorState:intent.priorState, schemaVersion:'tcrn.workflow.helper.transaction-claim.v2', terminalInstall, terminalState }; const claimBytes = Buffer.from(canonicalJson(claimValue));
    inject(faultAt, 'before-transaction-claim-create'); const claimHandle = await open(attempt.claimStage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { attempt.claim = { bytes:claimBytes, identity:directoryIdentity(await lstat(attempt.claimStage)), path:attempt.claimStage, sealed:false }; attempt.claimState = 'stage_only'; inject(faultAt, 'after-transaction-claim-create'); inject(faultAt, 'before-transaction-claim-write'); await claimHandle.writeFile(claimBytes); inject(faultAt, 'after-transaction-claim-write'); attempt.claim.sealed = true; inject(faultAt, 'before-transaction-claim-file-fsync'); await claimHandle.sync(); inject(faultAt, 'after-transaction-claim-file-fsync'); } finally { await claimHandle.close(); }
    inject(faultAt, 'before-transaction-claim-dir-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-claim-dir-fsync'); inject(faultAt, 'before-transaction-claim-link');
    try { await link(attempt.claimStage, claim); attempt.claimState = 'published_2link'; } catch (error) { if (error?.code === 'EEXIST') fail('TRANSACTION_CONFLICT'); throw error; }
    inject(faultAt, 'after-transaction-claim-link'); inject(faultAt, 'before-transaction-claim-base-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-claim-base-fsync'); inject(faultAt, 'after-transaction-publish');
    inject(faultAt, 'before-transaction-claim-stage-unlink'); await unlink(attempt.claimStage); const fixedClaimFingerprint = await exactOwnedFile(claim, claimBytes, 1); if (!fixedClaimFingerprint) fail('TRANSACTION_CONFLICT'); attempt.claim = { bytes:claimBytes, fixed:true, fingerprint:fixedClaimFingerprint, path:claim }; attempt.claimState = 'fixed_1link'; inject(faultAt, 'after-transaction-claim-stage-unlink'); inject(faultAt, 'before-transaction-claim-stage-base-fsync'); await syncPath(base); inject(faultAt, 'after-transaction-claim-stage-base-fsync');
    await clearTransactionAttempt(base, attempt.authority, faultAt);
    const claimFingerprint = statFingerprint(await lstat(claim)); return { txn:attempt.txn, id:attempt.id, journal, claimFingerprint, directoryFingerprint:statFingerprint(await lstat(attempt.txn)) };
  } catch (error) {
    try {
      if (attempt.claimState === 'fixed_1link') await removeLockPath(claim, attempt.claim.fingerprint, null, 'transaction-claim-attempt-cleanup');
      else if (attempt.claimState === 'published_2link') await removePublishedAttemptClaim(base, claim, attempt.claim);
      await removeUnpublishedTransaction(base, attempt);
      const authority = await readTransactionAttempt(base); if (authority?.value.id === attempt.id) await clearTransactionAttempt(base, authority);
      ACTIVE_TRANSACTION_IDS.delete(attempt.id);
      attempt.cleaned = true;
    } catch { fail('TRANSACTION_CONFLICT'); }
    throw error;
  }
}
async function readJournal(txn) { const value = await document(resolve(txn, 'journal.json'), MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true }); exact(value, ['baseIdentity', 'directory', 'directoryIdentity', 'id', 'nextState', 'operation', 'ownerFingerprint', 'phase', 'priorInstall', 'priorState', 'schemaVersion', 'terminalInstall', 'terminalState'], 'TRANSACTION_CONFLICT'); if (value.schemaVersion !== TXN_SCHEMA || typeof value.id !== 'string' || !['install', 'update', 'reinstall', 'uninstall'].includes(value.operation) || value.nextState !== null && !/^[a-f0-9]{64}$/.test(value.nextState) || value.phase !== 'prepared') fail('TRANSACTION_CONFLICT'); validDirectoryIdentity(value.baseIdentity); validDirectoryIdentity(value.directoryIdentity); validTransactionIntent(value); const ownerPath = resolve(txn, 'owner.json'); const owner = await document(ownerPath, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true }); exact(owner, ['attemptFingerprint', 'attemptSha256', 'directoryIdentity', 'id', 'pid', 'schemaVersion'], 'TRANSACTION_CONFLICT'); if (owner.schemaVersion !== 'tcrn.workflow.helper.transaction-owner.v3' || owner.id !== value.id || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^[a-f0-9]{64}$/.test(owner.attemptSha256) || !validStatFingerprint(owner.attemptFingerprint) || !validDirectoryIdentity(owner.directoryIdentity) || !sameDirectoryIdentity(owner.directoryIdentity, value.directoryIdentity) || !sameFingerprint(value.ownerFingerprint, statFingerprint(await lstat(ownerPath)))) fail('TRANSACTION_CONFLICT'); return value; }
async function bindTransaction(base, transaction, journal) { const claim = transaction.value; const directory = await lstat(transaction.txn).catch(() => fail('TRANSACTION_CONFLICT')); const root = await lstat(base).catch(() => fail('TRANSACTION_CONFLICT')); if (!sameDirectoryIdentity(claim.baseIdentity, directoryIdentity(root)) || !sameDirectoryIdentity(claim.directoryIdentity, directoryIdentity(directory)) || claim.id !== journal.id || claim.directory !== journal.directory || claim.operation !== journal.operation || claim.journalSha256 !== sha256(canonicalJson(journal)) || !sameFingerprint(claim.priorInstall, journal.priorInstall) || !sameFingerprint(claim.priorState, journal.priorState) || !sameFingerprint(claim.terminalInstall, journal.terminalInstall) || !sameFingerprint(claim.terminalState, journal.terminalState)) fail('TRANSACTION_CONFLICT'); }
async function claimedResultMatches(base, statePath, transaction, result = 'terminal') { const install = await installedBinding(resolve(base, 'install')); const state = await stateBinding(statePath); const expectedInstall = result === 'terminal' ? transaction.value.terminalInstall : transaction.value.priorInstall; const expectedState = result === 'terminal' ? transaction.value.terminalState : transaction.value.priorState; const installMatches = expectedInstall.present ? sameMovedTreeBinding(expectedInstall, install) : sameFingerprint(install, expectedInstall); const stateMatches = result === 'terminal' ? sameRelocatedStateBinding(expectedState, state) : sameFingerprint(state, expectedState); return installMatches && stateMatches; }
async function prepareTransactionState(txn, nextState, attempt, faultAt) { const path = resolve(txn, 'state-next.json'); const bytes = Buffer.from(canonicalJson(nextState)); inject(faultAt, 'before-state-temp-create'); const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { attempt.stateFile = { bytes, identity:directoryIdentity(await lstat(path)), path, sealed:false }; inject(faultAt, 'after-state-temp-create'); inject(faultAt, 'before-state-write'); await handle.writeFile(bytes); inject(faultAt, 'after-state-write'); attempt.stateFile.sealed = true; inject(faultAt, 'before-state-fsync'); await handle.sync(); inject(faultAt, 'after-state-fsync'); } finally { await handle.close(); } inject(faultAt, 'before-state-temp-directory-fsync'); await syncPath(txn); inject(faultAt, 'after-state-temp-directory-fsync'); attempt.statePath = path; return await stateBinding(path); }
async function commitTransactionState(txn, statePath, journal, faultAt) { const staged = resolve(txn, 'state-next.json'); const existing = await stateBinding(statePath); const stagedBinding = await stateBinding(staged); if (!sameFingerprint(existing, journal.priorState) || !sameFingerprint(stagedBinding, journal.terminalState)) fail('STATE_REPLACED'); await renameDurable(staged, statePath, faultAt, 'state'); const published = await stateBinding(statePath); if (!sameRelocatedStateBinding(journal.terminalState, published)) fail('STATE_REPLACED'); }
async function recoverTransactionAttempt(base) {
  await reapTransactionAttemptStages(base);
  const authority = await readTransactionAttempt(base);
  let claim = await readTransactionClaim(base);
  if (!authority) {
    await reapTransactionStages(base);
    return claim;
  }
  const locallyOwned = authority.value.pid === process.pid && ACTIVE_TRANSACTION_IDS.has(authority.value.id);
  if (!locallyOwned && !(await deadOwner(authority.value)) || !sameDirectoryIdentity(authority.value.baseIdentity, directoryIdentity(await lstat(base)))) fail('TRANSACTION_CONFLICT');
  if (claim) {
    if (claim.value.id !== authority.value.id || claim.value.pid !== authority.value.pid || claim.value.directory !== authority.value.directory || claim.value.operation !== authority.value.operation || !sameDirectoryIdentity(claim.value.baseIdentity, authority.value.baseIdentity)) fail('TRANSACTION_CONFLICT');
    await clearTransactionAttempt(base, authority);
    await reapTransactionStages(base);
    return claim;
  }
  await reapAuthorizedTransactionStages(base, authority, null);
  const transactionPath = resolve(base, authority.value.directory);
  const remaining = await lstat(transactionPath).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (remaining) fail('TRANSACTION_CONFLICT');
  await clearTransactionAttempt(base, authority);
  await reapTransactionStages(base);
  claim = await readTransactionClaim(base);
  if (claim) fail('TRANSACTION_CONFLICT');
  return null;
}
async function recover(base, statePath, faultAt) { await reapTransactionClaimStages(base); await recoverTransactionAttempt(base); await reapTerminalReceiptStages(base, statePath); const transaction = await readTransactionClaim(base); const orphanReceipt = await readTerminalReceipt(base); if (!transaction) { if (orphanReceipt) { if (!(await receiptMatches(base, statePath, orphanReceipt))) fail('TRANSACTION_CONFLICT'); await clearTerminalReceipt(base, statePath, orphanReceipt, faultAt); } return; } const txn = transaction.txn; const info = await lstat(txn).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) { if (!orphanReceipt || orphanReceipt.value.id !== transaction.value.id || orphanReceipt.value.journalSha256 !== transaction.value.journalSha256 || !(await receiptMatches(base, statePath, orphanReceipt))) fail('TRANSACTION_CONFLICT'); await removeLockPath(transaction.claim, transaction.fingerprint, faultAt, 'transaction-claim-cleanup'); await clearTerminalReceipt(base, statePath, orphanReceipt, faultAt); return; } if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0) fail('TRANSACTION_CONFLICT'); const journal = await readJournal(txn); if (journal.id !== transaction.value.id) fail('TRANSACTION_CONFLICT'); await bindTransaction(base, transaction, journal); const fullTransaction = { ...transaction, id:journal.id, journal }; const stage = resolve(txn, 'stage'); const stateStage = resolve(txn, 'state-next.json'); const backup = resolve(txn, 'backup'); const install = resolve(base, 'install'); const stagePresent = await lstat(stage).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error)); const stateStagePresent = await lstat(stateStage).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error)); const backupPresent = await lstat(backup).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error)); const installPresent = await lstat(install).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error));
  if (journal.operation === 'uninstall') { if (installPresent && !backupPresent) await renameDurable(install, backup, faultAt, 'recover-uninstall'); if (await lstat(backup).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error))) await removeBoundTree(backup, journal.priorInstall, { faultAt, movedRoot:true, point:'recover-uninstall-backup-cleanup' }); if (!orphanReceipt) await publishTerminalReceipt(base, statePath, fullTransaction, faultAt); await clearTransaction(base, fullTransaction, faultAt); return; }
  if (!installPresent && !stagePresent && !backupPresent) { if (stateStagePresent) await removeBoundState(stateStage, journal.terminalState, faultAt, 'recover-state-stage-cleanup'); await clearTransaction(base, { ...transaction, id:journal.id }, faultAt, 'prior'); return; }
  if (backupPresent && !installPresent) { if (!sameMovedTreeBinding(journal.priorInstall, await installedBinding(backup))) fail('TRANSACTION_CONFLICT'); await renameDurable(backup, install, faultAt, 'recover-rollback'); if (stagePresent) await removeBoundTree(stage, journal.terminalInstall, { faultAt, point:'recover-stage-cleanup' }); if (stateStagePresent) await removeBoundState(stateStage, journal.terminalState, faultAt, 'recover-state-stage-cleanup'); await clearTransaction(base, { ...transaction, id:journal.id }, faultAt, 'prior'); return; }
  if (installPresent && !stagePresent) {
    const installed = await installedBinding(install);
    if (sameMovedTreeBinding(journal.terminalInstall, installed)) { if (stateStagePresent) await commitTransactionState(txn, statePath, journal, faultAt); else if (!sameRelocatedStateBinding(journal.terminalState, await stateBinding(statePath))) fail('STATE_REPLACED'); if (backupPresent) await removeBoundTree(backup, journal.priorInstall, { faultAt, movedRoot:true, point:'recover-backup-cleanup' }); if (!orphanReceipt) await publishTerminalReceipt(base, statePath, fullTransaction, faultAt); await clearTransaction(base, fullTransaction, faultAt); return; }
    if (!backupPresent && sameMovedTreeBinding(journal.priorInstall, installed)) { if (stateStagePresent) await removeBoundState(stateStage, journal.terminalState, faultAt, 'recover-state-stage-cleanup'); await clearTransaction(base, { ...transaction, id:journal.id }, faultAt, 'prior'); return; }
    fail('TRANSACTION_CONFLICT');
  }
  if (stagePresent) { if (!stateStagePresent || !sameFingerprint(await stateBinding(stateStage), journal.terminalState)) fail('TRANSACTION_CONFLICT'); await removeBoundTree(stage, journal.terminalInstall, { faultAt, point:'recover-stage-cleanup' }); await removeBoundState(stateStage, journal.terminalState, faultAt, 'recover-state-stage-cleanup'); await clearTransaction(base, { ...transaction, id:journal.id }, faultAt, 'prior'); return; }
  fail('TRANSACTION_CONFLICT');
}
function lockStageName(owner) { return `${LOCK_STAGE_PREFIX}${owner.pid}-${owner.id}`; }
function validLockOwner(owner) { return owner && owner.schemaVersion === 'tcrn.workflow.helper.lock.v2' && typeof owner.id === 'string' && /^[0-9a-f-]{36}$/.test(owner.id) && Number.isSafeInteger(owner.pid) && owner.pid > 0; }
async function lockOwner(path) { const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!before || !privateRegular(before, 2)) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const value = canonicalDocument(bytes, 'TRANSACTION_CONFLICT'); exact(value, ['id', 'pid', 'schemaVersion'], 'TRANSACTION_CONFLICT'); const after = await lstat(path); if (!sameStat(before, after) || !validLockOwner(value)) fail('TRANSACTION_CONFLICT'); return { bytes, fingerprint:statFingerprint(before), value }; }
async function deadOwner(owner) { try { process.kill(owner.pid, 0); return false; } catch (error) { if (error?.code === 'ESRCH') return true; fail('TRANSACTION_CONFLICT'); } }
async function removeLockPath(path, fingerprint, faultAt = null, point = 'lock-release') { const current = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!current || !sameFingerprint(fingerprint, statFingerprint(current))) fail('TRANSACTION_CONFLICT'); inject(faultAt, `before-${point}`); inject(faultAt, `before-${point}-unlink`); await unlink(path); inject(faultAt, `after-${point}-unlink`); inject(faultAt, `before-${point}-directory-fsync`); await syncPath(dirname(path)); inject(faultAt, `after-${point}-directory-fsync`); inject(faultAt, `after-${point}`); }
async function reapLockStages(base) { const entries = await readdir(base, { withFileTypes:true }); for (const entry of entries) { if (!entry.name.startsWith(LOCK_STAGE_PREFIX)) continue; const path = resolve(base, entry.name); const match = new RegExp(`^${LOCK_STAGE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)-([0-9a-f-]{36})$`).exec(entry.name); if (!match || !entry.isFile() || entry.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const pid = Number(match[1]); const expectedOwner = { id:match[2], pid, schemaVersion:'tcrn.workflow.helper.lock.v2' }; const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : fail('TRANSACTION_CONFLICT')); if (!before) continue; if (!privateRegular(before, 2)) fail('TRANSACTION_CONFLICT'); if (!(await deadOwner(expectedOwner))) continue; const bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks:2 }); const expected = Buffer.from(canonicalJson(expectedOwner)); const after = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : fail('TRANSACTION_CONFLICT')); if (!after) continue; if (!sameStat(before, after)) fail('TRANSACTION_CONFLICT'); if (!bytes.equals(expected)) { if (bytes.length >= expected.length || !expected.subarray(0, bytes.length).equals(bytes) || before.nlink !== 1) fail('TRANSACTION_CONFLICT'); }
    await removeLockPath(path, statFingerprint(before), null, 'lock-stage-cleanup'); }
}
async function recoverStaleLock(lock) { try { const owner = await lockOwner(lock); if (!(await deadOwner(owner.value))) fail('TRANSACTION_CONFLICT'); const after = await lockOwner(lock); if (!after.bytes.equals(owner.bytes) || !sameFingerprint(after.fingerprint, owner.fingerprint)) fail('TRANSACTION_CONFLICT'); await removeLockPath(lock, owner.fingerprint); } catch { fail('TRANSACTION_CONFLICT'); } }
async function exactOwnedFile(path, expected, maximumLinks) { const before = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!before || !privateRegular(before, maximumLinks)) return null; let bytes; try { bytes = await boundedBytes(path, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true, maximumLinks }); } catch { return null; } const after = await lstat(path).catch(() => null); if (!after || !sameStat(before, after) || !bytes.equals(expected)) return null; return statFingerprint(before); }
async function cleanupAttemptLock(base, stage, lock, expected) { const stageFingerprint = await exactOwnedFile(stage, expected, 2); const fixedFingerprint = await exactOwnedFile(lock, expected, 2); if (!stageFingerprint) { if (fixedFingerprint && (await lstat(lock)).nlink === 1) await removeLockPath(lock, fixedFingerprint, null, 'lock-attempt-cleanup'); else if (!fixedFingerprint) { const partial = await lstat(stage).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (partial) { if (!privateRegular(partial, 1)) fail('TRANSACTION_CONFLICT'); const bytes = await boundedBytes(stage, MAX_STATE_DOCUMENT_BYTES, 'TRANSACTION_CONFLICT', { privateFile:true }); const after = await lstat(stage); if (!sameStat(partial, after) || bytes.length > expected.length || !expected.subarray(0, bytes.length).equals(bytes)) fail('TRANSACTION_CONFLICT'); await removeLockPath(stage, statFingerprint(after), null, 'lock-stage-attempt-cleanup'); } } return; } if (!fixedFingerprint) { if ((await lstat(stage)).nlink === 1) await removeLockPath(stage, stageFingerprint, null, 'lock-stage-attempt-cleanup'); return; } const stageInfo = await lstat(stage); const lockInfo = await lstat(lock); if (stageInfo.nlink !== 2 || lockInfo.nlink !== 2 || stageInfo.dev !== lockInfo.dev || stageInfo.ino !== lockInfo.ino) return; await removeLockPath(stage, stageFingerprint, null, 'lock-stage-attempt-cleanup'); const fixedAfter = await exactOwnedFile(lock, expected, 1); if (fixedAfter) await removeLockPath(lock, fixedAfter, null, 'lock-attempt-cleanup'); }
async function acquireLock(base, faultAt) { const lock = resolve(base, LOCK_DIR); const owner = { id:randomUUID(), pid:process.pid, schemaVersion:'tcrn.workflow.helper.lock.v2' }; const bytes = Buffer.from(canonicalJson(owner)); const stage = resolve(base, lockStageName(owner)); try { await reapLockStages(base); inject(faultAt, 'before-lock-stage-create'); const handle = await open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { inject(faultAt, 'after-lock-stage-create'); inject(faultAt, 'before-lock-stage-write'); await handle.writeFile(bytes); inject(faultAt, 'after-lock-stage-write'); inject(faultAt, 'before-lock-stage-file-fsync'); await handle.sync(); inject(faultAt, 'after-lock-stage-file-fsync'); } finally { await handle.close(); } inject(faultAt, 'before-lock-stage-dir-fsync'); await syncPath(base); inject(faultAt, 'after-lock-stage-dir-fsync'); const staged = await lockOwner(stage); if (lockStageName(staged.value) !== basename(stage)) fail('TRANSACTION_CONFLICT'); await holdLockLinkBarrier(faultAt); inject(faultAt, 'before-lock-link'); try { await link(stage, lock); } catch (error) { if (error?.code !== 'EEXIST') throw error; await recoverStaleLock(lock); try { await link(stage, lock); } catch (race) { if (race?.code === 'EEXIST') fail('TRANSACTION_CONFLICT'); throw race; } } inject(faultAt, 'after-lock-link'); inject(faultAt, 'before-lock-link-dir-fsync'); await syncPath(base); inject(faultAt, 'after-lock-link-dir-fsync'); const fixed = await lockOwner(lock); const stagedAfter = await lockOwner(stage); if (!fixed.bytes.equals(bytes) || !stagedAfter.bytes.equals(bytes)) fail('TRANSACTION_CONFLICT'); inject(faultAt, 'before-lock-stage-unlink'); await unlink(stage); inject(faultAt, 'after-lock-stage-unlink'); inject(faultAt, 'before-lock-stage-unlink-dir-fsync'); await syncPath(base); inject(faultAt, 'after-lock-stage-unlink-dir-fsync'); return { lock, owner:await lockOwner(lock) }; } catch (error) { try { await cleanupAttemptLock(base, stage, lock, bytes); } catch { fail('TRANSACTION_CONFLICT'); } if (error instanceof BootstrapError) throw error; fail('TRANSACTION_CONFLICT'); } }
async function withLock(base, statePath, faultAt, operation) {
  let held;
  try { held = await acquireLock(base, faultAt); }
  catch (error) { if (error instanceof BootstrapError) throw error; fail('TRANSACTION_CONFLICT'); }
  let outcome; let thrown = null;
  try {
    if (faultAt === 'hold-after-lock' || faultAt === 'hold-before-lock-link') await new Promise(done => setTimeout(done, 1000));
    await recover(base, statePath, faultAt);
    outcome = await operation(held);
  } catch (error) {
    thrown = error;
    if (error instanceof BootstrapError && error.reasonCode === 'TRANSACTION_INTERRUPTED') {
      try { await recover(base, statePath, null); }
      catch (convergenceError) { thrown = convergenceError; }
    }
  }
  try {
    const current = await lockOwner(held.lock);
    if (!current.bytes.equals(held.owner.bytes) || !sameFingerprint(current.fingerprint, held.owner.fingerprint)) fail('TRANSACTION_CONFLICT');
    await removeLockPath(held.lock, held.owner.fingerprint, faultAt);
  } catch (error) {
    if (error instanceof BootstrapError && error.reasonCode === 'TRANSACTION_INTERRUPTED') {
      try {
        const current = await lstat(held.lock).catch(found => found?.code === 'ENOENT' ? null : Promise.reject(found));
        if (current) {
          const owner = await lockOwner(held.lock);
          if (!owner.bytes.equals(held.owner.bytes) || !sameFingerprint(owner.fingerprint, held.owner.fingerprint)) fail('TRANSACTION_CONFLICT');
          await removeLockPath(held.lock, held.owner.fingerprint);
        } else await syncPath(base);
      } catch (convergenceError) { thrown = convergenceError; }
      thrown ??= error;
    } else thrown ??= error;
  }
  if (thrown) { if (thrown instanceof BootstrapError) throw thrown; fail('TRANSACTION_CONFLICT'); }
  return outcome;
}
export async function installArchive({ testRoot:root, archivePath, provenancePath, statePath = resolve(root, 'state.json'), expectedArchiveSha256, expectedProvenanceSha256, approved:isApproved, operation = 'install', interrupt = false, faultAt = null }) {
  approved(isApproved);
  const base = await testRoot(root);
  const authorizedState = await authorizedStatePath(base, statePath);
  const activeFault = faultAt ?? (interrupt ? 'interrupt' : null);
  return withLock(base, authorizedState, activeFault, async held => {
    const prepared = await prepareTrust({ archivePath, provenancePath, statePath:authorizedState, expectedArchiveSha256, expectedProvenanceSha256 });
    const workspace = resolve(base, 'workspace');
    const before = await treeDigest(workspace);
    const install = resolve(base, 'install');
    const intent = {
      priorInstall:await installedBinding(install),
      priorState:await stateBinding(authorizedState),
      terminalInstall:contentBinding(true, archiveTreeDigest(prepared.archive)),
      terminalState:contentBinding(true, sha256(canonicalJson(prepared.nextState))),
    };
    const attempt = await createTransaction(base, operation, prepared.nextState.verifiedArchiveSha256, activeFault, intent, held);
    const { txn } = attempt;
    const stage = resolve(txn, 'stage');
    attempt.stagePath = stage;
    let transaction = null;
    try {
      inject(activeFault, 'before-stage-create');
      await mkdir(stage, { mode:0o700 });
      attempt.emptyStageFingerprint = statFingerprint(await lstat(stage));
      inject(activeFault, 'after-stage-create');
      inject(activeFault, 'before-stage-create-directory-fsync');
      await syncPath(txn);
      inject(activeFault, 'after-stage-create-directory-fsync');
      await extract(prepared.archive, stage, activeFault);
      attempt.stage = await installedBinding(stage);
      attempt.statePath = resolve(txn, 'state-next.json');
      await prepareTransactionState(txn, prepared.nextState, attempt, activeFault);
      transaction = await publishTransaction(base, attempt, intent, activeFault);
      inject(activeFault, 'after-extract');
    } catch (error) {
      if (!transaction && !attempt.cleaned) {
        try {
          try { await removeUnpublishedTransaction(base, attempt); }
          catch {
            const authority = await readTransactionAttempt(base);
            if (!authority || authority.value.id !== attempt.id || authority.value.pid !== process.pid || !ACTIVE_TRANSACTION_IDS.has(attempt.id)) fail('TRANSACTION_CONFLICT');
            await removeAttemptBoundTransactionDirectory(base, attempt.txn, authority);
          }
          const authority = await readTransactionAttempt(base);
          if (authority?.value.id === attempt.id) await clearTransactionAttempt(base, authority);
          ACTIVE_TRANSACTION_IDS.delete(attempt.id);
        } catch { fail('TRANSACTION_CONFLICT'); }
      }
      throw error;
    }
    const backup = resolve(txn, 'backup');
    const old = await lstat(install).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (old) {
      if (!old.isDirectory() || old.isSymbolicLink() || !sameFingerprint(await installedBinding(install), transaction.journal.priorInstall)) fail('TRANSACTION_CONFLICT');
      await renameDurable(install, backup, activeFault, 'old');
    }
    if (!sameFingerprint(await installedBinding(stage), transaction.journal.terminalInstall)) fail('TRANSACTION_CONFLICT');
    await renameDurable(stage, install, activeFault, 'new');
    await commitTransactionState(txn, authorizedState, transaction.journal, activeFault);
    inject(activeFault, 'before-cleanup');
    if (old) await removeBoundTree(backup, transaction.journal.priorInstall, { faultAt:activeFault, movedRoot:true, point:'backup-cleanup' });
    await readJournal(txn);
    await publishTerminalReceipt(base, authorizedState, transaction, activeFault);
    await clearTransaction(base, transaction, activeFault);
    inject(activeFault, 'after-cleanup');
    const after = await treeDigest(workspace);
    if (before !== after) fail('TRANSACTION_INTERRUPTED');
    return { reasonCode:'INSTALL_COMPLETED', operation, trustReceiptSha256:sha256(canonicalJson(prepared.receipt)), workspaceSha256:after };
  });
}
export async function uninstallArchive({ testRoot:root, statePath = resolve(root, 'state.json'), approved:isApproved, faultAt = null }) { approved(isApproved); const base = await testRoot(root); const authorizedState = await authorizedStatePath(base, statePath); return withLock(base, authorizedState, faultAt, async held => { const workspace = resolve(base, 'workspace'); const before = await treeDigest(workspace); const install = resolve(base, 'install'); const present = await lstat(install).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (present) { if (!present.isDirectory() || present.isSymbolicLink()) fail('TRANSACTION_CONFLICT'); const priorState = await stateBinding(authorizedState); const intent = { priorInstall:await installedBinding(install), priorState, terminalInstall:contentBinding(false, null), terminalState:priorState }; const attempt = await createTransaction(base, 'uninstall', null, faultAt, intent, held); const transaction = await publishTransaction(base, attempt, intent, faultAt); const { txn } = transaction; const backup = resolve(txn, 'backup'); if (!sameFingerprint(await installedBinding(install), transaction.journal.priorInstall)) fail('TRANSACTION_CONFLICT'); await renameDurable(install, backup, faultAt, 'uninstall'); await removeBoundTree(backup, transaction.journal.priorInstall, { faultAt, movedRoot:true, point:'uninstall-backup-cleanup' }); await readJournal(txn); await publishTerminalReceipt(base, authorizedState, transaction, faultAt); await clearTransaction(base, transaction, faultAt); } const after = await treeDigest(workspace); if (before !== after) fail('TRANSACTION_INTERRUPTED'); return { reasonCode:'UNINSTALL_COMPLETED', workspaceSha256:after }; }); }
function values(argv) { const out = {}; for (let index = 0; index < argv.length; index += 2) { if (!argv[index]?.startsWith('--') || !argv[index + 1]) fail('INVOCATION_INVALID'); const key = argv[index].slice(2); if (Object.hasOwn(out, key)) fail('INVOCATION_INVALID'); out[key] = argv[index + 1]; } return out; }
// INVOCATION_INVALID, not MANIFEST_INVALID: a malformed command line is an argument
// fault. Reporting it as a trust-document fault was always a misnomer, and there is no
// manifest left to be invalid.
function exactCliOptions(command, value) { const contracts = { install:{ allowed:['approved', 'archive', 'fault', 'provenance', 'state', 'test-root'], required:['approved', 'archive', 'provenance', 'state', 'test-root'] }, 'verify-installed-copy':{ allowed:['installed-dir', 'marker', 'now', 'provenance', 'state'], required:['installed-dir', 'provenance', 'state'] }, 'plan-network':{ allowed:['approved', 'operation'], required:['approved'] }, reinstall:{ allowed:['approved', 'archive', 'fault', 'provenance', 'state', 'test-root'], required:['approved', 'archive', 'provenance', 'state', 'test-root'] }, resolve:{ allowed:['candidates', 'root'], required:[] }, uninstall:{ allowed:['approved', 'fault', 'state', 'test-root'], required:['approved', 'state', 'test-root'] }, update:{ allowed:['approved', 'archive', 'fault', 'provenance', 'state', 'test-root'], required:['approved', 'archive', 'provenance', 'state', 'test-root'] }, validate:{ allowed:['archive', 'provenance', 'state'], required:['archive', 'provenance', 'state'] } }[command]; if (!contracts || Object.keys(value).some(key => !contracts.allowed.includes(key)) || contracts.required.some(key => !Object.hasOwn(value, key))) fail('INVOCATION_INVALID'); }
// `now` survives in one place only -- the marker's verifiedAt below -- which keeps this
// helper and TIME_INVALID real rather than vestigial.
function cliNow(value) { if (value === undefined) return Date.now(); if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail('TIME_INVALID'); const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== (value.includes('.') ? value : `${value.slice(0, -1)}.000Z`)) fail('TIME_INVALID'); return parsed; }
async function main() { const [command, ...rest] = process.argv.slice(2); const value = values(rest); exactCliOptions(command, value); if (command === 'validate') console.log(canonicalJson(await validateTrust({ archivePath:value.archive, provenancePath:value.provenance, statePath:value.state }))); else if (command === 'verify-installed-copy') { const now = cliNow(value.now); const markerBinding = value.marker ? await assertManagedStatePath(value.marker) : null; const receipt = await verifyInstalledCopy({ installedDir:value['installed-dir'], provenancePath:value.provenance, statePath:value.state }); const marker = { ...receipt, schemaVersion:INSTALLED_COPY_MARKER_SCHEMA, verifiedAt:new Date(now).toISOString() }; if (markerBinding) await atomicPrivateOverwrite(value.marker, canonicalJson(marker), markerBinding); console.log(canonicalJson(receipt)); } else if (command === 'resolve') console.log(canonicalJson(await resolveWorkflowRoot({ explicitPath:value.root ?? null, candidates:value.candidates ? value.candidates.split(',') : [] }))); else if (command === 'plan-network') { approved(value.approved === 'true'); const operation = value.operation ?? 'clone'; if (!['clone', 'update'].includes(operation)) fail('INVOCATION_INVALID'); console.log(canonicalJson({ reasonCode:'NETWORK_PLAN_APPROVED', operation, networkMutationPerformed:false })); } else if (['install', 'update', 'reinstall'].includes(command)) console.log(canonicalJson(await installArchive({ testRoot:value['test-root'], archivePath:value.archive, provenancePath:value.provenance, statePath:value.state, approved:value.approved === 'true', operation:command, faultAt:value.fault ?? null }))); else if (command === 'uninstall') console.log(canonicalJson(await uninstallArchive({ testRoot:value['test-root'], statePath:value.state, approved:value.approved === 'true', faultAt:value.fault ?? null }))); else fail('INVOCATION_INVALID'); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(canonicalJson({ ok:false, reasonCode:error.reasonCode ?? 'INTERNAL_ERROR' })); process.exitCode = 1; });
