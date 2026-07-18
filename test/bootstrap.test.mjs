import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { chmod, copyFile, link, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { IDENTITY, canonicalJson, installArchive as installArchiveImplementation, resolveWorkflowRoot, uninstallArchive, validateArchive, validateTrust, verifyInstalledCopy } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback); const sha = value => createHash('sha256').update(value).digest('hex');
const acceptedProvenancePath = join(process.cwd(), 'manifests/complete-skill-archive.provenance.json');
const installArchive = options => installArchiveImplementation({ ...options, provenancePath:options.provenancePath ?? acceptedProvenancePath });
// The fixture pins its OWN synthetic single-entry archive through the same defaulted
// parameter production uses (the pattern resolveWorkflowRoot already established for
// `identity`), so these tests exercise the real pin comparison without weakening the
// production default compiled into the bootstrap.
//
// CLI tests cannot pass that pin as a flag -- there is deliberately no such flag, because an
// attacker-supplied expected digest would defeat the only trust stop the bootstrap has left.
// They instead run a COPY of the runtime whose compiled-in pin is rewritten, which is exactly
// how a real new release is published: a new bootstrap with a new published digest.
async function fixture() {
  const root = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-test-')); const archive = { schemaVersion:'tcrn.workflow.helper.archive.v1', entries:[{ path:'skill/SKILL.md', type:'file', contentBase64:Buffer.from('skill').toString('base64'), sha256:sha('skill') }] };
  const archivePath = join(root, 'archive.json'); await writeFile(archivePath, canonicalJson(archive)); const expectedArchiveSha256 = sha(canonicalJson(archive));
  const provenancePath = join(process.cwd(), 'manifests/complete-skill-archive.provenance.json'); const statePath = join(root, 'state.json');
  const runtime = join(root, 'runtime dir with spaces'); await mkdir(runtime, { mode:0o700 });
  const source = await readFile(join(process.cwd(), 'bootstrap/trusted-bootstrap.mjs'), 'utf8');
  const repinned = source.replace(/^export const EXPECTED_ARCHIVE_SHA256 = '[a-f0-9]{64}';$/m, `export const EXPECTED_ARCHIVE_SHA256 = '${expectedArchiveSha256}';`);
  assert.notEqual(repinned, source, 'the bootstrap archive pin must be a single rewritable compiled-in constant');
  const bootstrapPath = join(runtime, 'trusted-bootstrap.mjs'); await writeFile(bootstrapPath, repinned, { mode:0o600 });
  await copyFile(join(process.cwd(), 'bootstrap', 'test-root-openat.py'), join(runtime, 'test-root-openat.py'));
  return { root, archive, archivePath, bootstrapPath, expectedArchiveSha256, provenancePath, statePath };
}
async function absent(path) { await assert.rejects(() => lstat(path)); }
test('live host Skill locations are rejected fail-closed before the test-root gate on both hosts', async () => {
  const root = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-live-location-'));
  try {
    const cases = [
      join(root, '.claude', 'skills', 'tcrn-helper-test-target'),
      join(root, 'project', '.claude', 'skills', 'tcrn-helper-test-target'),
      join(root, '.codex', 'skills', 'tcrn-helper-test-target'),
      join(root, '.claude', 'tcrn-helper-test-target'),
      join(root, '.Claude', 'skills', 'tcrn-helper-test-target'),
      join(root, '.CODEX', 'tcrn-helper-test-target'),
      join(root, '.cLaUdE', 'tcrn-helper-test-target'),
    ];
    for (const target of cases) {
      await assert.rejects(() => uninstallArchive({ testRoot:target, approved:true }), error => error.reasonCode === 'LIVE_LOCATION_FORBIDDEN');
      await assert.rejects(() => installArchiveImplementation({ testRoot:target, approved:true }), error => error.reasonCode === 'LIVE_LOCATION_FORBIDDEN');
      await absent(join(target, 'state.json'));
    }
    await assert.rejects(() => uninstallArchive({ testRoot:join(root, 'no-marker-and-no-live-component'), approved:true }), error => error.reasonCode === 'TEST_ROOT_REQUIRED');
  } finally { await rm(root, { recursive:true, force:true }); }
});

test('a tampered archive entry fails closed with the digest-mismatch reason before trust evaluation', async () => {
  const value = await fixture();
  try {
    const tampered = structuredClone(value.archive);
    tampered.entries[0].contentBase64 = Buffer.from('tampered').toString('base64');
    await writeFile(value.archivePath, canonicalJson(tampered));
    const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true };
    await assert.rejects(() => installArchive(basis), error => error.reasonCode === 'ARCHIVE_DIGEST_MISMATCH');
    await absent(value.statePath);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});

test('provenance is mandatory and tamper-resistant before mutation', async () => {
  const value = await fixture();
  try {
    const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true };
    await assert.rejects(() => installArchiveImplementation(basis), error => error.reasonCode === 'PROVENANCE_REQUIRED');
    await absent(value.statePath); await assertLifecycleClean(value.root);
    const cli = [value.bootstrapPath, 'install', '--test-root', value.root, '--archive', value.archivePath, '--state', value.statePath, '--approved', 'true'];
    await assert.rejects(() => execFile(process.execPath, cli, { cwd:process.cwd() }), error => JSON.parse(error.stderr).reasonCode === 'INVOCATION_INVALID');
    await absent(value.statePath); await assertLifecycleClean(value.root);
    const tampered = join(value.root, 'provenance.json');
    const bytes = await readFile(value.provenancePath); await writeFile(tampered, Buffer.concat([bytes, Buffer.from(' ')]), { mode:0o600 });
    await assert.rejects(() => installArchiveImplementation({ ...basis, provenancePath:tampered }), error => error.reasonCode === 'PROVENANCE_INVALID');
    await absent(value.statePath); await assertLifecycleClean(value.root);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('a symlinked test-root ancestor is rejected before it creates a foreign descendant', async () => {
  const value = await fixture();
  try {
    const foreign = join(value.root, 'foreign'); const link = join(value.root, 'link'); const escaped = join(link, 'tcrn-helper-test-nested');
    await mkdir(foreign, { mode:0o700 }); await symlink(foreign, link);
    await assert.rejects(() => installArchive({ testRoot:escaped, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:join(escaped, 'state.json'), expectedArchiveSha256:value.expectedArchiveSha256, approved:true }), error => error.reasonCode === 'TEST_ROOT_REQUIRED');
    await absent(join(foreign, 'tcrn-helper-test-nested'));
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('a strict ancestor replacement between stat and open is revalidated from its descriptor', async () => {
  const value = await fixture();
  try {
    const anchor = join(value.root, 'anchor'); const parent = join(anchor, 'tcrn-helper-test-parent'); const held = join(anchor, 'held'); const terminal = join(parent, 'terminal'); const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py');
    await mkdir(anchor, { mode:0o700 }); await mkdir(parent, { mode:0o700 }); await mkdir(terminal, { mode:0o700 }); const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test-open', '3', '4', terminal], { stdio:['ignore', 'pipe', 'ignore', 'pipe', 'pipe'] });
    const result = new Promise((resolvePromise, rejectPromise) => { let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error('strict-open injection timed out')); }, 5000); child.stdout.on('data', chunk => { output += chunk; }); child.once('error', error => { clearTimeout(timer); rejectPromise(error); }); child.once('close', code => { clearTimeout(timer); resolvePromise({ code, output }); }); });
    await new Promise((resolvePromise, rejectPromise) => { const timer = setTimeout(() => rejectPromise(new Error('strict-open boundary not reached')), 5000); child.stdio[3].once('data', chunk => { clearTimeout(timer); try { assert.equal(chunk.toString('utf8'), 'R'); resolvePromise(); } catch (error) { rejectPromise(error); } }); child.stdio[3].once('error', rejectPromise); });
    await rename(parent, held); await mkdir(parent, { mode:0o700 }); await chmod(parent, 0o777); await mkdir(terminal, { mode:0o700 }); const replacementBefore = await lstat(parent); child.stdio[4].end('G'); assert.deepEqual(await result, { code:1, output:'TEST_ROOT_REQUIRED\n' }); const replacementAfter = await lstat(parent); assert.equal(replacementAfter.dev, replacementBefore.dev); assert.equal(replacementAfter.ino, replacementBefore.ino); assert.ok((await lstat(terminal)).isDirectory());
    await chmod(parent, 0o700); const retry = await new Promise((resolvePromise, rejectPromise) => { const retried = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, terminal], { stdio:['ignore', 'pipe', 'ignore'] }); let output = ''; retried.stdout.on('data', chunk => { output += chunk; }); retried.once('error', rejectPromise); retried.once('close', code => resolvePromise({ code, output })); }); const privateAfter = await lstat(parent); assert.deepEqual(retry, { code:0, output:'TEST_ROOT_OK\n' }); assert.equal(privateAfter.dev, replacementBefore.dev); assert.equal(privateAfter.ino, replacementBefore.ino);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('a created strict component replacement between stat and open is revalidated from its descriptor', async () => {
  const value = await fixture();
  try {
    const anchor = join(value.root, 'anchor'); const created = join(anchor, 'tcrn-helper-test-created'); const held = join(anchor, 'attempt-owned-renamed-aside'); const terminal = join(created, 'terminal'); const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py');
    await mkdir(anchor, { mode:0o700 }); const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test-created-open', '3', '4', terminal], { stdio:['ignore', 'pipe', 'ignore', 'pipe', 'pipe'] });
    const result = new Promise((resolvePromise, rejectPromise) => { let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error('created-strict-open injection timed out')); }, 5000); child.stdout.on('data', chunk => { output += chunk; }); child.once('error', error => { clearTimeout(timer); rejectPromise(error); }); child.once('close', code => { clearTimeout(timer); resolvePromise({ code, output }); }); });
    await new Promise((resolvePromise, rejectPromise) => { const timer = setTimeout(() => rejectPromise(new Error('created-strict-open boundary not reached')), 5000); child.stdio[3].once('data', chunk => { clearTimeout(timer); try { assert.equal(chunk.toString('utf8'), 'R'); resolvePromise(); } catch (error) { rejectPromise(error); } }); child.stdio[3].once('error', rejectPromise); });
    await rename(created, held); await mkdir(created, { mode:0o700 }); await chmod(created, 0o777); await mkdir(terminal, { mode:0o700 }); const replacementBefore = await lstat(created); child.stdio[4].end('G'); assert.deepEqual(await result, { code:1, output:'TEST_ROOT_REQUIRED\n' }); const replacementAfter = await lstat(created); assert.equal(replacementAfter.dev, replacementBefore.dev); assert.equal(replacementAfter.ino, replacementBefore.ino); assert.ok((await lstat(terminal)).isDirectory()); assert.ok((await lstat(held)).isDirectory()); await absent(join(created, 'state.json'));
    await chmod(created, 0o700); const retry = await new Promise((resolvePromise, rejectPromise) => { const retried = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, terminal], { stdio:['ignore', 'pipe', 'ignore'] }); let output = ''; retried.stdout.on('data', chunk => { output += chunk; }); retried.once('error', rejectPromise); retried.once('close', code => resolvePromise({ code, output })); }); const privateAfter = await lstat(created); assert.deepEqual(retry, { code:0, output:'TEST_ROOT_OK\n' }); assert.equal(privateAfter.dev, replacementBefore.dev); assert.equal(privateAfter.ino, replacementBefore.ino);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('test-only inherited-FD ancestor swaps cannot redirect descriptor-relative root creation', async () => {
  for (const kind of ['symlink', 'directory']) { const value = await fixture();
  try {
    const anchor = join(value.root, 'anchor'); const held = join(value.root, 'held'); const foreign = join(value.root, 'foreign'); const root = join(anchor, 'tcrn-helper-test-child');
    await mkdir(anchor, { mode:0o700 }); await mkdir(foreign, { mode:0o700 });
    const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py');
    const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test', '3', '4', root], { stdio:['ignore', 'pipe', 'ignore', 'pipe', 'pipe'] });
    const terminal = new Promise((resolvePromise, rejectPromise) => { let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error('test-root helper handshake timed out')); }, 5000); child.stdout.on('data', chunk => { output += chunk; }); child.once('error', error => { clearTimeout(timer); rejectPromise(error); }); child.once('close', code => { clearTimeout(timer); resolvePromise({ code, output }); }); });
    await new Promise((resolvePromise, rejectPromise) => { const timer = setTimeout(() => rejectPromise(new Error('test-root helper did not reach handshake')), 5000); child.stdio[3].once('data', chunk => { clearTimeout(timer); try { assert.equal(chunk.toString('utf8'), 'R'); resolvePromise(); } catch (error) { rejectPromise(error); } }); child.stdio[3].once('error', rejectPromise); });
    await rename(anchor, held); if (kind === 'symlink') await symlink(foreign, anchor); else await mkdir(anchor, { mode:0o700 }); child.stdio[4].end('G');
    assert.deepEqual(await terminal, { code:1, output:'TEST_ROOT_REQUIRED\n' });
    await absent(join(foreign, 'tcrn-helper-test-child')); assert.ok((await lstat(join(held, 'tcrn-helper-test-child'))).isDirectory()); await absent(join(anchor, 'tcrn-helper-test-child'));
  } finally { await rm(value.root, { recursive:true, force:true }); } }
});
test('a renamed created child cannot make reverse cleanup delete its empty replacement', async () => {
  const value = await fixture();
  try {
    const anchor = join(value.root, 'anchor'); const first = join(anchor, 'tcrn-helper-test-created'); const held = join(anchor, 'attempt-owned-renamed-aside'); const root = join(first, 'second'); const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py');
    await mkdir(anchor, { mode:0o700 }); const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test', '3', '4', root], { stdio:['ignore', 'pipe', 'ignore', 'pipe', 'pipe'] });
    const terminal = new Promise((resolvePromise, rejectPromise) => { let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error('created-child regression timed out')); }, 5000); child.stdout.on('data', chunk => { output += chunk; }); child.once('error', error => { clearTimeout(timer); rejectPromise(error); }); child.once('close', code => { clearTimeout(timer); resolvePromise({ code, output }); }); });
    const ready = () => new Promise((resolvePromise, rejectPromise) => { const timer = setTimeout(() => rejectPromise(new Error('helper did not reach expected component boundary')), 5000); child.stdio[3].once('data', chunk => { clearTimeout(timer); try { assert.equal(chunk.toString('utf8'), 'R'); resolvePromise(); } catch (error) { rejectPromise(error); } }); child.stdio[3].once('error', rejectPromise); });
    await ready(); child.stdio[4].write('G'); await ready(); await rename(first, held); await mkdir(first, { mode:0o700 }); child.stdio[4].end('G');
    assert.deepEqual(await terminal, { code:1, output:'TEST_ROOT_REQUIRED\n' }); assert.ok((await lstat(first)).isDirectory()); await absent(join(first, 'second')); assert.ok((await lstat(held)).isDirectory()); assert.ok((await lstat(join(held, 'second'))).isDirectory());
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('post-rebind cleanup injection preserves a foreign replacement without pathname removal', async () => {
  const value = await fixture();
  try {
    const anchor = join(value.root, 'anchor'); const first = join(anchor, 'tcrn-helper-test-created'); const held = join(anchor, 'held'); const second = join(first, 'second'); const heldSecond = join(held, 'second'); const aside = join(held, 'attempt-second-aside'); const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py');
    await mkdir(anchor, { mode:0o700 }); const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test-cleanup', '3', '4', '5', '6', second], { stdio:['ignore', 'pipe', 'ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
    const terminal = new Promise((resolvePromise, rejectPromise) => { let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error('post-rebind cleanup injection timed out')); }, 5000); child.stdout.on('data', chunk => { output += chunk; }); child.once('error', error => { clearTimeout(timer); rejectPromise(error); }); child.once('close', code => { clearTimeout(timer); resolvePromise({ code, output }); }); });
    const ready = fd => new Promise((resolvePromise, rejectPromise) => { const timer = setTimeout(() => rejectPromise(new Error('helper did not reach deterministic boundary')), 5000); child.stdio[fd].once('data', chunk => { clearTimeout(timer); try { assert.equal(chunk.toString('utf8'), 'R'); resolvePromise(); } catch (error) { rejectPromise(error); } }); child.stdio[fd].once('error', rejectPromise); });
    await ready(3); child.stdio[4].write('G'); await ready(3); await rename(first, held); await mkdir(first, { mode:0o700 }); child.stdio[4].end('G'); await ready(5); await rename(heldSecond, aside); await mkdir(heldSecond, { mode:0o700 }); child.stdio[6].end('G');
    assert.deepEqual(await terminal, { code:1, output:'TEST_ROOT_REQUIRED\n' }); const replacementBefore = await lstat(first); assert.ok(replacementBefore.isDirectory()); await absent(join(first, 'second')); assert.ok((await lstat(heldSecond)).isDirectory()); assert.ok((await lstat(aside)).isDirectory());
    const retry = await new Promise((resolvePromise, rejectPromise) => { const retried = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, second], { stdio:['ignore', 'pipe', 'ignore'] }); let output = ''; retried.stdout.on('data', chunk => { output += chunk; }); retried.once('error', rejectPromise); retried.once('close', code => resolvePromise({ code, output })); }); const replacementAfter = await lstat(first);
    assert.deepEqual(retry, { code:0, output:'TEST_ROOT_OK\n' }); assert.equal(replacementAfter.dev, replacementBefore.dev); assert.equal(replacementAfter.ino, replacementBefore.ino); assert.ok((await lstat(second)).isDirectory());
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('test-only test-root helper handshake rejects malformed inherited descriptors', async () => {
  const value = await fixture();
  try {
    const helper = join(process.cwd(), 'bootstrap', 'test-root-openat.py'); const root = join(value.root, 'tcrn-helper-test-child');
    const result = await new Promise((resolvePromise, rejectPromise) => { const child = spawn('/usr/bin/python3', ['-I', '-S', '-B', helper, '--test', 'bad', '4', root], { stdio:['ignore', 'pipe', 'ignore'] }); let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.once('error', rejectPromise); child.once('close', code => resolvePromise({ code, output })); });
    assert.deepEqual(result, { code:1, output:'TEST_ROOT_REQUIRED\n' }); await absent(root);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('production test-root wrapper fails closed on missing, hung, malformed, and oversized helpers', async () => {
  const value = await fixture();
  try {
    const runner = join(value.root, 'runner'); await mkdir(runner, { mode:0o700 }); const source = join(process.cwd(), 'bootstrap', 'trusted-bootstrap.mjs'); const helper = join(runner, 'test-root-openat.py');
    for (const [name, bytes] of [['normal', null], ['missing', null], ['hung', 'import time\ntime.sleep(10)\n'], ['malformed', 'print("wrong")\n'], ['oversized', 'print("X" * 65)\n']]) {
      await copyFile(source, join(runner, 'trusted-bootstrap.mjs')); await copyFile(join(process.cwd(), 'bootstrap', 'test-root-openat.py'), helper); if (name === 'missing') await rm(helper);
      else if (bytes !== null) await writeFile(helper, bytes, { mode:0o600 });
      const module = await import(`${pathToFileURL(join(runner, 'trusted-bootstrap.mjs')).href}?${name}-${Date.now()}`); const root = join(value.root, `tcrn-helper-test-wrapper-${name}`); const options = { testRoot:root, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:join(root, 'state.json'), expectedArchiveSha256:value.expectedArchiveSha256, approved:true };
      if (name === 'normal') assert.equal((await module.installArchive(options)).reasonCode, 'INSTALL_COMPLETED');
      else { await assert.rejects(() => module.installArchive(options), error => error.reasonCode === 'TEST_ROOT_REQUIRED'); await absent(join(root, 'state.json')); await absent(root); }
    }
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('a missing nested disposable test root is created component-by-component', async () => {
  const value = await fixture();
  try {
    const nested = join(value.root, 'tcrn-helper-test-nested', 'deep'); const statePath = join(nested, 'state.json');
    assert.equal((await installArchive({ testRoot:nested, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true })).reasonCode, 'INSTALL_COMPLETED');
    assert.ok((await lstat(nested)).isDirectory()); assert.ok(await readFile(statePath));
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('pre-existing private roots and concurrent nested-root creation remain bounded to their requested roots', async () => {
  const value = await fixture();
  try {
    const existing = join(value.root, 'tcrn-helper-test-existing', 'deep');
    await mkdir(existing, { recursive:true, mode:0o700 }); await chmod(join(value.root, 'tcrn-helper-test-existing'), 0o700); await chmod(existing, 0o700);
    assert.equal((await installArchive({ testRoot:existing, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:join(existing, 'state.json'), expectedArchiveSha256:value.expectedArchiveSha256, approved:true })).reasonCode, 'INSTALL_COMPLETED');
    const roots = ['one', 'two'].map(name => join(value.root, `tcrn-helper-test-concurrent-${name}`, 'deep'));
    const results = await Promise.all(roots.map(async root => installArchive({ testRoot:root, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:join(root, 'state.json'), expectedArchiveSha256:value.expectedArchiveSha256, approved:true })));
    assert.deepEqual(results.map(result => result.reasonCode), ['INSTALL_COMPLETED', 'INSTALL_COMPLETED']);
    for (const root of roots) { assert.ok((await lstat(join(root, 'install'))).isDirectory()); assert.ok(await readFile(join(root, 'state.json'))); }
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('file, FIFO, socket, hard-link, and mode-invalid test-root ancestors are preserved and rejected', async () => {
  const value = await fixture(); const socketServer = createServer();
  try {
    const file = join(value.root, 'tcrn-helper-test-file'); const hardSource = join(value.root, 'foreign-bytes'); const hard = join(value.root, 'tcrn-helper-test-hard-link'); const fifo = join(value.root, 'tcrn-helper-test-fifo'); const socket = join(value.root, 'tcrn-helper-test-socket'); const mode = join(value.root, 'tcrn-helper-test-mode');
    await writeFile(file, 'file'); await writeFile(hardSource, 'hard'); await link(hardSource, hard); await execFile('mkfifo', [fifo]); await new Promise((resolvePromise, reject) => socketServer.once('error', reject).listen(socket, resolvePromise)); await mkdir(mode, { mode:0o700 }); await chmod(mode, 0o755);
    const guarded = [file, hard, fifo, socket, mode].map(path => ({ before:null, path }));
    for (const item of guarded) item.before = await lstat(item.path);
    for (const item of guarded) {
      const root = join(item.path, 'child');
      await assert.rejects(() => installArchive({ testRoot:root, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:join(root, 'state.json'), expectedArchiveSha256:value.expectedArchiveSha256, approved:true }), error => error.reasonCode === 'TEST_ROOT_REQUIRED');
      const after = await lstat(item.path); assert.equal(after.dev, item.before.dev); assert.equal(after.ino, item.before.ino); assert.equal(after.mode, item.before.mode); await absent(join(item.path, 'child'));
    }
    assert.equal(await readFile(file, 'utf8'), 'file'); assert.equal(await readFile(hard, 'utf8'), 'hard'); assert.equal((await lstat(hard)).nlink, 2);
  } finally { await new Promise(resolvePromise => socketServer.close(() => resolvePromise())); await rm(value.root, { recursive:true, force:true }); }
});
async function installationSnapshot(root) { const install = join(root, 'install'); const info = await lstat(install).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)); if (!info) return null; const entries = []; async function walk(directory, prefix = '') { for (const entry of (await readdir(directory, { withFileTypes:true })).sort((one, two) => one.name.localeCompare(two.name))) { const path = join(directory, entry.name); const name = `${prefix}${entry.name}`; if (entry.isDirectory()) { entries.push({ name, type:'directory' }); await walk(path, `${name}/`); } else if (entry.isFile()) entries.push({ content:(await readFile(path)).toString('base64'), name, type:'file' }); else assert.fail(`unexpected installation entry: ${name}`); } } await walk(install); return entries; }
async function lifecycleSnapshot(root, statePath) { return { install:await installationSnapshot(root), state:await readFile(statePath).then(bytes => bytes.toString('utf8')).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error)) }; }
async function assertLifecycleClean(root, label = 'lifecycle residue') { const reserved = (await readdir(root)).filter(name => name === '.tcrn-helper-lock' || name === '.tcrn-helper-transaction' || name === '.tcrn-helper-transaction-attempt' || name === '.tcrn-helper-transaction-terminal' || name.endsWith('.tcrn-next') || name.startsWith('.tcrn-helper-lock-stage-') || name.startsWith('.tcrn-helper-transaction-attempt-stage-') || name.startsWith('.tcrn-helper-transaction-stage-') || name.startsWith('.tcrn-helper-transaction-claim-stage-') || name.startsWith('.tcrn-helper-transaction-terminal-stage-')); assert.deepEqual(reserved, [], label); }
async function rejected(change, code) { const value = await fixture(); try { await change(value); await assert.fail('expected rejection'); } catch (error) { assert.equal(error.reasonCode, code); } finally { await rm(value.root, { recursive:true, force:true }); } }
async function killedInstall(value, fault, operation = 'install') { const args = [value.bootstrapPath, operation, '--test-root', value.root, '--archive', value.archivePath, '--provenance', value.provenancePath, '--state', value.statePath, '--approved', 'true', '--fault', `sigkill-${fault}`]; await assert.rejects(() => execFile(process.execPath, args, { cwd:process.cwd() }), error => error.signal === 'SIGKILL'); }
async function invokeOperation(value, operation, faultAt = null) {
  if (operation === 'uninstall') return uninstallArchive({ testRoot:value.root, statePath:value.statePath, approved:true, faultAt });
  return installArchive({ testRoot:value.root, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true, operation, faultAt });
}
async function prepareOperation(value, operation) { if (operation !== 'install') await invokeOperation(value, 'install'); }
async function killedOperation(value, operation, point) {
  if (operation !== 'uninstall') return killedInstall(value, point, operation);
  const args = [value.bootstrapPath, 'uninstall', '--test-root', value.root, '--state', value.statePath, '--approved', 'true', '--fault', `sigkill-${point}`];
  await assert.rejects(() => execFile(process.execPath, args, { cwd:process.cwd() }), error => error.signal === 'SIGKILL');
}
async function discoverLifecycleInventories() {
  const inventories = {};
  for (const operation of ['install', 'update', 'reinstall', 'uninstall']) {
    const value = await fixture();
    try {
      await prepareOperation(value, operation);
      const collectFaultPoints = new Set();
      await invokeOperation(value, operation, { collectFaultPoints });
      inventories[operation] = [...collectFaultPoints].sort();
      assert.ok(collectFaultPoints.size >= 70, `${operation} exposed only ${collectFaultPoints.size} injection points`);
      await assertLifecycleClean(value.root, `${operation}/inventory`);
    } finally { await rm(value.root, { recursive:true, force:true }); }
  }
  return inventories;
}
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function waitForEntries(directory, prefix, count, timeoutMs = 10000) { const deadline = Date.now() + timeoutMs; for (;;) { if ((await readdir(directory)).filter(name => name.startsWith(prefix)).length === count) return true; if (Date.now() >= deadline) return false; await pause(5); } }
async function contenders(value, count, { forceTimeout = false } = {}) { const barrier = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-barrier-')); const input = JSON.stringify({ testRoot:value.root, archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }); const handles = []; const start = () => { const child = spawn(process.execPath, [join(process.cwd(), 'test/lock-contender.mjs')], { cwd:process.cwd(), env:{ ...process.env, TCRN_LOCK_CONTENDER_BARRIER:barrier, TCRN_LOCK_CONTENDER_INPUT:input, TCRN_LOCK_CONTENDER_TIMEOUT_MS:forceTimeout ? '100' : '10000', TCRN_LOCK_TEST_BARRIER:barrier }, stdio:['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; const done = new Promise(resolvePromise => { child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; }); child.on('close', (code, signal) => resolvePromise({ code, pid:child.pid, signal, stderr, stdout })); }); handles.push({ child, done }); return done; }; const callers = Array.from({ length:count }, start); try { const ready = await waitForEntries(barrier, 'ready-', count); if (!forceTimeout) await writeFile(join(barrier, 'start'), ready ? 'start' : 'abort', { flag:'wx', mode:0o600 }); const linked = !forceTimeout && ready && await waitForEntries(barrier, 'link-ready-', count); if (!forceTimeout) await writeFile(join(barrier, 'link-start'), linked ? 'start' : 'abort', { flag:'wx', mode:0o600 }); const results = await Promise.all(callers); if (!forceTimeout) assert.equal(ready && linked, true, JSON.stringify(results)); return results; } finally { for (const { child } of handles) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await Promise.all(handles.map(({ done }) => done)); await rm(barrier, { recursive:true, force:true }); } }
async function gitFixture(root) {
  const repository = join(root, 'checkout'); await mkdir(repository); const run = args => execFile('git', args, { cwd:repository, env:{ ...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null' } });
  await run(['init']); await run(['config', 'user.name', 'test']); await run(['config', 'user.email', 'test@example.invalid']); await writeFile(join(repository, 'tracked.txt'), 'tracked'); await run(['add', 'tracked.txt']); await run(['commit', '-m', 'fixture']); const head = (await run(['rev-parse', 'HEAD'])).stdout.trim(); const tree = (await run(['rev-parse', 'HEAD^{tree}'])).stdout.trim(); await run(['tag', '-a', 'v-test', '-m', 'fixture']); const tagObject = (await run(['rev-parse', 'refs/tags/v-test^{tag}'])).stdout.trim(); await run(['remote', 'add', 'origin', 'https://example.invalid/tcrn-workflow.git']); return { repository, identity:{ ...IDENTITY, commit:head, tree, tagObject, version:'v-test' }, remote:'https://example.invalid/tcrn-workflow.git', run };
}

test('trust validation is deterministic, writes no state, and rejects malformed persisted state', async () => { const value = await fixture(); try { const first = await validateTrust({ ...value }); const second = await validateTrust({ ...value }); assert.deepEqual(first, second); await absent(value.statePath); await writeFile(value.statePath, canonicalJson({ schemaVersion:'tcrn.workflow.helper.state.v1', verifiedArchiveSha256:'not-a-digest' }), { mode:0o600 }); await assert.rejects(() => validateTrust({ ...value }), error => error.reasonCode === 'STATE_INVALID'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('trust rejects stale provenance and a substituted archive before lifecycle mutation', async () => {
  const value = await fixture();
  try {
    const basis = { archivePath:value.archivePath, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 };
    const staleProvenance = JSON.parse(await readFile(value.provenancePath, 'utf8'));
    staleProvenance.predicate.buildDefinition.externalParameters.tag = 'v0.1.0-rc.1';
    staleProvenance.predicate.buildDefinition.externalParameters.version = '0.1.0-rc.1';
    const staleProvenancePath = join(value.root, 'stale-provenance.json');
    await writeFile(staleProvenancePath, canonicalJson(staleProvenance), { mode:0o600 });
    await assert.rejects(() => installArchive({ testRoot:value.root, ...basis, provenancePath:staleProvenancePath, approved:true }), error => error.reasonCode === 'PROVENANCE_INVALID');
    await absent(value.statePath); await assertLifecycleClean(value.root);
    const substituted = join(value.root, 'substituted-archive.json');
    const other = structuredClone(value.archive); other.entries[0].contentBase64 = Buffer.from('other').toString('base64'); other.entries[0].sha256 = sha('other');
    await writeFile(substituted, canonicalJson(other), { mode:0o600 });
    await assert.rejects(() => installArchive({ testRoot:value.root, ...basis, archivePath:substituted, approved:true }), error => error.reasonCode === 'IDENTITY_MISMATCH');
    await absent(value.statePath); await assertLifecycleClean(value.root);
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('bounded canonical inputs fail closed', async () => { await rejected(async value => { await writeFile(value.archivePath, Buffer.concat([Buffer.from(' ' .repeat(3 * 1024 * 1024)), Buffer.from(canonicalJson(value.archive))])); await validateTrust({ ...value }); }, 'INPUT_TOO_LARGE'); await rejected(async value => { const bad = join(value.root, 'invalid-utf8-provenance.json'); await writeFile(bad, Buffer.from([0xff, 0xfe]), { mode:0o600 }); await validateTrust({ ...value, provenancePath:bad }); }, 'PROVENANCE_INVALID'); await rejected(async value => { const bad = join(value.root, 'duplicate-key-provenance.json'); await writeFile(bad, '{"schemaVersion":"x","schemaVersion":"x"}\n', { mode:0o600 }); await validateTrust({ ...value, provenancePath:bad }); }, 'PROVENANCE_INVALID'); for (const surrogate of ['\\ud800', '\\udc00']) await rejected(async value => { await writeFile(value.archivePath, `{"entries":[],"schemaVersion":"${surrogate}"}\n`); await validateTrust({ ...value }); }, 'ARCHIVE_ENTRY_INVALID'); await rejected(async value => { value.archive.entries[0].contentBase64 = 'A'.repeat(4 * Math.ceil((2 * 1024 * 1024) / 3) + 4); await writeFile(value.archivePath, canonicalJson(value.archive)); await validateTrust({ ...value }); }, 'ARCHIVE_ENTRY_INVALID'); });
test('portable archive paths are canonical', async () => { for (const path of ['skill/a\u0000b', 'skill/a\nb', 'skill/\u0001b', 'skill/e\u0301.txt']) await rejected(async value => { value.archive.entries[0].path = path; await writeFile(value.archivePath, canonicalJson(value.archive)); await validateTrust({ ...value }); }, 'ARCHIVE_PATH_INVALID'); for (const paths of [['z', 'a'], ['a', 'a/b'], ['A', 'a/b']]) await rejected(async value => { const entry = value.archive.entries[0]; value.archive.entries = paths.map(path => ({ ...entry, path })); await writeFile(value.archivePath, canonicalJson(value.archive)); await validateTrust({ ...value }); }, 'ARCHIVE_PATH_INVALID'); });
test('root resolution verifies a real clean Git checkout only', async () => { const root = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-test-')); try { const fixtureRoot = await gitFixture(root); assert.equal((await resolveWorkflowRoot({ explicitPath:fixtureRoot.repository, expectedRemote:fixtureRoot.remote, identity:fixtureRoot.identity })).reasonCode, 'ROOT_RESOLVED'); const forged = join(root, 'forged'); await mkdir(forged); await writeFile(join(forged, 'repository.json'), canonicalJson({ remote:fixtureRoot.remote, dirty:false })); await assert.rejects(() => resolveWorkflowRoot({ explicitPath:forged, expectedRemote:fixtureRoot.remote, identity:fixtureRoot.identity }), error => error.reasonCode === 'ROOT_IDENTITY_MISMATCH'); await writeFile(join(fixtureRoot.repository, 'untracked.txt'), 'x'); await assert.rejects(() => resolveWorkflowRoot({ explicitPath:fixtureRoot.repository, expectedRemote:fixtureRoot.remote, identity:fixtureRoot.identity }), error => error.reasonCode === 'ROOT_DIRTY'); await rm(join(fixtureRoot.repository, 'untracked.txt')); const fakeBin = join(root, 'fake-bin'); const marker = join(root, 'fake-git-ran'); await mkdir(fakeBin); const fakeGit = join(fakeBin, 'git'); await writeFile(fakeGit, `#!/bin/sh\nprintf executed > '${marker}'\nexit 1\n`); await chmod(fakeGit, 0o700); const savedPath = process.env.PATH; process.env.PATH = `${fakeBin}:${savedPath}`; try { assert.equal((await resolveWorkflowRoot({ explicitPath:fixtureRoot.repository, expectedRemote:fixtureRoot.remote, identity:fixtureRoot.identity })).reasonCode, 'ROOT_RESOLVED'); await absent(marker); } finally { process.env.PATH = savedPath; } const alias = join(root, 'alias'); await symlink(fixtureRoot.repository, alias); await assert.rejects(() => resolveWorkflowRoot({ explicitPath:alias, expectedRemote:fixtureRoot.remote, identity:fixtureRoot.identity }), error => error.reasonCode === 'ROOT_SYMLINK'); } finally { await rm(root, { recursive:true, force:true }); } });
test('the real bootstrap CLI path containing spaces emits one terminal receipt', async () => { const value = await fixture(); try { const args = [value.bootstrapPath, 'install', '--test-root', value.root, '--archive', value.archivePath, '--provenance', value.provenancePath, '--state', value.statePath, '--approved', 'true']; const result = await execFile(process.execPath, args, { cwd:process.cwd() }); const lines = result.stdout.trim().split('\n').filter(Boolean); assert.equal(lines.length, 1); assert.equal(JSON.parse(lines[0]).reasonCode, 'INSTALL_COMPLETED'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('the external trusted bootstrap accepts the complete archive before Skill extraction', async () => {
  const root = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-external-bootstrap-'));
  const installed = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-skill-install-'));
  try {
    const archivePath = join(root, 'complete-skill-archive.json');
    const repeatedPath = join(root, 'complete-skill-archive-repeat.json');
    const provenancePath = join(process.cwd(), 'manifests/complete-skill-archive.provenance.json');
    await execFile(process.execPath, [join(process.cwd(), 'scripts/create-skill-archive.mjs'), '--output', archivePath], { cwd:process.cwd() });
    await execFile(process.execPath, [join(process.cwd(), 'scripts/create-skill-archive.mjs'), '--output', repeatedPath], { cwd:process.cwd() });
    const acceptedBytes = await readFile(archivePath);
    assert.deepEqual(await readFile(repeatedPath), acceptedBytes);
    // No expectedArchiveSha256 override: this asserts the PRODUCTION pin compiled into
    // bootstrap/trusted-bootstrap.mjs equals the archive this repository actually builds.
    const receipt = await validateTrust({ archivePath, provenancePath, statePath:join(root, 'state.json') });
    assert.equal(receipt.reasonCode, 'TRUST_VALIDATED');
    const archive = JSON.parse(acceptedBytes);
    for (const entry of archive.entries) {
      const output = join(installed, ...entry.path.split('/'));
      await mkdir(join(output, '..'), { recursive:true, mode:0o700 });
      await writeFile(output, Buffer.from(entry.contentBase64, 'base64'), { flag:'wx', mode:0o600 });
    }
    assert.ok(await readFile(join(installed, 'SKILL.md'), 'utf8'));
    // Internally consistent tamper (per-entry digest recomputed) is caught by the pin.
    const changed = structuredClone(archive);
    changed.entries[0].contentBase64 = changed.entries[0].contentBase64.replace(/^./, 'A');
    changed.entries[0].sha256 = sha(Buffer.from(changed.entries[0].contentBase64, 'base64'));
    await writeFile(repeatedPath, canonicalJson(changed));
    await assert.rejects(() => validateTrust({ archivePath:repeatedPath, provenancePath, statePath:join(root, 'state-invalid.json') }), error => error.reasonCode === 'IDENTITY_MISMATCH');
    // Inconsistent tamper (per-entry digest left stale) is caught earlier, by archive safety.
    const stale = structuredClone(archive);
    stale.entries[0].contentBase64 = stale.entries[0].contentBase64.replace(/^./, 'A');
    await writeFile(repeatedPath, canonicalJson(stale));
    await assert.rejects(() => validateTrust({ archivePath:repeatedPath, provenancePath, statePath:join(root, 'state-invalid.json') }), error => error.reasonCode === 'ARCHIVE_DIGEST_MISMATCH');
  } finally { await rm(installed, { recursive:true, force:true }); await rm(root, { recursive:true, force:true }); }
});
test('explicit CLI time accepts only governed UTC timestamps and stamps the marker', async () => {
  const value = await fixture();
  try {
    // Driven against the REAL Skill directory and the REAL compiled-in pin: --now is the one
    // surviving caller-supplied time, and it is read for the marker's verifiedAt.
    const base = [join(process.cwd(), 'bootstrap/trusted-bootstrap.mjs'), 'verify-installed-copy', '--installed-dir', join(process.cwd(), 'skill/tcrn-workflow-helper'), '--provenance', value.provenancePath, '--state', value.statePath];
    for (const malformed of ['0', '2026-07-14', '2026-07-14T14:00:00+00:00', '2026-02-30T14:00:00Z']) await assert.rejects(() => execFile(process.execPath, [...base, '--now', malformed], { cwd:process.cwd() }), error => JSON.parse(error.stderr).reasonCode === 'TIME_INVALID');
    const marker = join(value.root, 'marker.json');
    const result = await execFile(process.execPath, [...base, '--marker', marker, '--now', '2026-07-14T14:00:00Z'], { cwd:process.cwd() });
    assert.equal(JSON.parse(result.stdout).reasonCode, 'INSTALLED_COPY_VALIDATED');
    assert.equal(JSON.parse(await readFile(marker, 'utf8')).verifiedAt, '2026-07-14T14:00:00.000Z');
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('the CLI rejects a malformed invocation as an argument fault, not a trust finding', async () => {
  const value = await fixture();
  try {
    const bootstrap = value.bootstrapPath;
    for (const args of [
      [bootstrap, 'validate', '--archive', value.archivePath, '--provenance', value.provenancePath],
      [bootstrap, 'validate', '--archive', value.archivePath, '--provenance', value.provenancePath, '--state', value.statePath, '--trusted-key', value.archivePath],
      [bootstrap, 'validate', '--archive', value.archivePath, '--archive', value.archivePath, '--provenance', value.provenancePath, '--state', value.statePath],
      [bootstrap, 'not-a-command'],
    ]) await assert.rejects(() => execFile(process.execPath, args, { cwd:process.cwd() }), error => JSON.parse(error.stderr).reasonCode === 'INVOCATION_INVALID');
  } finally { await rm(value.root, { recursive:true, force:true }); }
});
test('lifecycle commits installation before anti-rollback state and preserves full Workspace', async () => { const value = await fixture(); try { const workspace = join(value.root, 'workspace'); await mkdir(join(workspace, 'nested'), { recursive:true }); await writeFile(join(workspace, 'private.bin'), 'private bytes'); await writeFile(join(workspace, 'nested', 'more.bin'), 'more private bytes'); const basis = { archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 }; await assert.rejects(() => installArchiveImplementation({ testRoot:value.root, archivePath:value.archivePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }), error => error.reasonCode === 'PROVENANCE_REQUIRED'); await absent(value.statePath); for (const operation of ['install', 'update', 'reinstall']) assert.equal((await installArchive({ testRoot:value.root, ...basis, approved:true, operation })).reasonCode, 'INSTALL_COMPLETED'); assert.equal(await readFile(join(workspace, 'private.bin'), 'utf8'), 'private bytes'); assert.equal(await readFile(join(workspace, 'nested', 'more.bin'), 'utf8'), 'more private bytes'); assert.equal((await uninstallArchive({ testRoot:value.root, statePath:value.statePath, approved:true })).reasonCode, 'UNINSTALL_COMPLETED'); assert.equal(await readFile(join(workspace, 'nested', 'more.bin'), 'utf8'), 'more private bytes'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('interrupted lifecycle recovers to a committed result with zero residue', async () => { for (const faultAt of ['after-extract', 'after-new-rename', 'after-state-write', 'after-state-rename', 'before-cleanup', 'after-transaction-directory-cleanup', 'after-transaction-claim-cleanup']) { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await assert.rejects(() => installArchive({ ...basis, faultAt }), error => error.reasonCode === 'TRANSACTION_INTERRUPTED'); assert.equal((await installArchive(basis)).reasonCode, 'INSTALL_COMPLETED'); await absent(join(value.root, '.tcrn-helper-transaction')); await absent(join(value.root, '.tcrn-helper-lock')); await lstat(join(value.root, 'install')); await lstat(value.statePath); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('catchable lifecycle interruptions converge to an exact pair and CLEAN before returning', async () => { const installPoints = ['before-stage-create', 'after-stage-create', 'after-extract', 'before-old-rename', 'after-old-rename', 'before-new-rename', 'after-new-rename', 'before-state-write', 'after-state-write', 'after-state-fsync', 'before-state-rename', 'after-state-rename', 'before-cleanup', 'after-cleanup']; const stateWritePoints = new Set(['before-state-write', 'after-state-write', 'after-state-fsync', 'before-state-rename', 'after-state-rename']); for (const operation of ['install', 'update', 'reinstall']) for (const faultAt of (operation === 'install' ? installPoints.filter(point => !point.includes('old-rename')) : installPoints.filter(point => !stateWritePoints.has(point)))) { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true, operation }; if (operation !== 'install') await installArchive({ ...basis, operation:'install' }); const prior = await lifecycleSnapshot(value.root, value.statePath); const terminal = { install:[{ name:'skill', type:'directory' }, { content:Buffer.from('skill').toString('base64'), name:'skill/SKILL.md', type:'file' }], state:canonicalJson({ schemaVersion:'tcrn.workflow.helper.state.v1', verifiedArchiveSha256:value.expectedArchiveSha256 }) }; await assert.rejects(() => installArchive({ ...basis, faultAt }), error => error.reasonCode === 'TRANSACTION_INTERRUPTED'); const after = await lifecycleSnapshot(value.root, value.statePath); assert.ok(JSON.stringify(after) === JSON.stringify(prior) || JSON.stringify(after) === JSON.stringify(terminal), `${operation}/${faultAt} left neither prior nor terminal state`); await assertLifecycleClean(value.root); } finally { await rm(value.root, { recursive:true, force:true }); } } for (const faultAt of ['before-uninstall-rename', 'after-uninstall-rename']) { const value = await fixture(); try { const basis = { testRoot:value.root, statePath:value.statePath, approved:true }; const installBasis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await installArchive(installBasis); const prior = await lifecycleSnapshot(value.root, value.statePath); const terminal = { install:null, state:prior.state }; await assert.rejects(() => uninstallArchive({ ...basis, faultAt }), error => error.reasonCode === 'TRANSACTION_INTERRUPTED'); const after = await lifecycleSnapshot(value.root, value.statePath); assert.ok(JSON.stringify(after) === JSON.stringify(prior) || JSON.stringify(after) === JSON.stringify(terminal), `uninstall/${faultAt} left neither prior nor terminal state`); await assertLifecycleClean(value.root); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('catchable prepublication transaction faults clean only their active attempt before retry', async () => { const points = ['after-transaction-stage-create', 'before-transaction-owner-write', 'after-transaction-owner-write', 'after-transaction-owner-file-fsync', 'after-transaction-owner-dir-fsync', 'before-journal-write', 'after-journal-write', 'after-journal-file-fsync', 'after-journal-dir-fsync', 'before-transaction-claim-create', 'after-transaction-claim-write', 'after-transaction-claim-file-fsync', 'after-transaction-claim-dir-fsync', 'before-transaction-claim-link', 'after-transaction-claim-link']; for (const faultAt of points.filter(point => !process.env.TCRN_FAULT_POINT || point === process.env.TCRN_FAULT_POINT)) { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await assert.rejects(() => installArchive({ ...basis, faultAt }), error => error.reasonCode === 'TRANSACTION_INTERRUPTED'); assert.equal((await installArchive(basis)).reasonCode, 'INSTALL_COMPLETED'); await absent(join(value.root, '.tcrn-helper-transaction')); assert.equal((await readdir(value.root)).filter(name => name.startsWith('.tcrn-helper-transaction-stage-') || name.startsWith('.tcrn-helper-transaction-claim-stage-') || name.endsWith('.tcrn-next')).length, 0); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('transaction-attempt authority survives every catchable and SIGKILL publication boundary', async () => {
  const points = [
    'after-transaction-attempt-stage-create',
    'after-transaction-attempt-stage-write',
    'after-transaction-attempt-stage-file-fsync',
    'after-transaction-attempt-stage-dir-fsync',
    'after-transaction-attempt-link',
    'after-transaction-attempt-fixed-dir-fsync',
    'after-transaction-attempt-stage-unlink',
    'after-transaction-attempt-stage-unlink-dir-fsync',
  ];
  for (const point of points) {
    for (const terminated of [false, true]) {
      const value = await fixture();
      try {
        const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true };
        if (terminated) await killedInstall(value, point);
        else await assert.rejects(() => installArchive({ ...basis, faultAt:point }), error => error.reasonCode === 'TRANSACTION_INTERRUPTED');
        assert.equal((await installArchive(basis)).reasonCode, 'INSTALL_COMPLETED');
        await assertLifecycleClean(value.root);
      } finally { await rm(value.root, { recursive:true, force:true }); }
    }
  }
});
test('effective lifecycle injection inventory is discovered from all four real operations', async () => {
  const inventories = await discoverLifecycleInventories();
  if (process.env.TCRN_REPORT_FAULT_POINTS === '1') process.stdout.write(`${canonicalJson(inventories)}`);
  for (const operation of ['install', 'update', 'reinstall', 'uninstall']) {
    const points = new Set(inventories[operation]);
    for (const point of points) if (point.startsWith('before-')) assert.ok(points.has(`after-${point.slice('before-'.length)}`), `${operation} lacks after pair for ${point}`);
  }
  for (const operation of ['install', 'update', 'reinstall', 'uninstall'].filter(value => !process.env.TCRN_MATRIX_OPERATION || value === process.env.TCRN_MATRIX_OPERATION)) for (const point of inventories[operation].filter(value => !process.env.TCRN_FAULT_POINT || value === process.env.TCRN_FAULT_POINT)) {
    const value = await fixture();
    try {
      await prepareOperation(value, operation);
      await assert.rejects(() => invokeOperation(value, operation, point), error => error.reasonCode === 'TRANSACTION_INTERRUPTED', `${operation}/${point}`);
      await assertLifecycleClean(value.root, `${operation}/${point}/after-fault`);
      await invokeOperation(value, operation);
      await assertLifecycleClean(value.root, `${operation}/${point}/after-retry`);
    } finally { await rm(value.root, { recursive:true, force:true }); }
  }
});
test('real SIGKILL at every effective lifecycle and recovery-only injection point restarts CLEAN', async () => {
  const inventories = await discoverLifecycleInventories();
  const operations = ['install', 'update', 'reinstall', 'uninstall'].filter(value => !process.env.TCRN_MATRIX_OPERATION || value === process.env.TCRN_MATRIX_OPERATION);
  for (const operation of operations) {
    const recoverySeeds = new Map();
    for (const point of inventories[operation].filter(value => !process.env.TCRN_FAULT_POINT || value === process.env.TCRN_FAULT_POINT)) {
      const value = await fixture();
      try {
        await prepareOperation(value, operation);
        await killedOperation(value, operation, point);
        const collectFaultPoints = new Set();
        await invokeOperation(value, operation, { collectFaultPoints });
        for (const recoveryPoint of collectFaultPoints) if (!inventories[operation].includes(recoveryPoint) && !recoverySeeds.has(recoveryPoint)) recoverySeeds.set(recoveryPoint, point);
        await assertLifecycleClean(value.root, `${operation}/${point}/sigkill-retry`);
      } finally { await rm(value.root, { recursive:true, force:true }); }
    }
    for (const [recoveryPoint, seedPoint] of recoverySeeds) {
      const catchable = await fixture();
      try {
        await prepareOperation(catchable, operation);
        await killedOperation(catchable, operation, seedPoint);
        await assert.rejects(() => invokeOperation(catchable, operation, recoveryPoint), error => error.reasonCode === 'TRANSACTION_INTERRUPTED', `${operation}/${seedPoint}/recovery-throw/${recoveryPoint}`);
        await assertLifecycleClean(catchable.root, `${operation}/${seedPoint}/recovery-throw/${recoveryPoint}`);
        await invokeOperation(catchable, operation);
        await assertLifecycleClean(catchable.root, `${operation}/${seedPoint}/recovery-throw-retry/${recoveryPoint}`);
      } finally { await rm(catchable.root, { recursive:true, force:true }); }

      const terminated = await fixture();
      try {
        await prepareOperation(terminated, operation);
        await killedOperation(terminated, operation, seedPoint);
        await killedOperation(terminated, operation, recoveryPoint);
        await invokeOperation(terminated, operation);
        await assertLifecycleClean(terminated.root, `${operation}/${seedPoint}/recovery-sigkill/${recoveryPoint}`);
      } finally { await rm(terminated.root, { recursive:true, force:true }); }
    }
  }
});
test('real SIGKILL at every staged-lock publication boundary recovers with no residue', async () => { for (const point of ['after-lock-stage-create', 'after-lock-stage-write', 'after-lock-stage-file-fsync', 'after-lock-stage-dir-fsync', 'after-lock-link', 'after-lock-link-dir-fsync', 'after-lock-stage-unlink', 'before-lock-release', 'after-lock-release']) { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await killedInstall(value, point); assert.equal((await installArchive(basis)).reasonCode, 'INSTALL_COMPLETED'); await absent(join(value.root, '.tcrn-helper-lock')); assert.equal((await readdir(value.root)).filter(name => name.startsWith('.tcrn-helper-lock-stage-')).length, 0); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('real SIGKILL at transaction publication boundaries recovers with no temporary transaction', async () => { for (const point of ['after-transaction-stage-create', 'after-transaction-owner-write', 'after-transaction-owner-file-fsync', 'after-transaction-owner-dir-fsync', 'after-journal-write', 'after-journal-file-fsync', 'after-journal-dir-fsync', 'after-transaction-claim-write', 'after-transaction-claim-file-fsync', 'after-transaction-claim-dir-fsync', 'after-transaction-claim-link', 'after-transaction-claim-base-fsync', 'after-transaction-publish', 'after-transaction-claim-stage-unlink', 'after-transaction-claim-stage-base-fsync', 'after-transaction-receipt-create', 'after-transaction-receipt-write', 'after-transaction-receipt-file-fsync', 'after-transaction-receipt-dir-fsync', 'after-transaction-receipt-link', 'after-transaction-receipt-base-fsync', 'after-transaction-receipt-stage-unlink', 'after-transaction-receipt-stage-base-fsync', 'after-transaction-directory-cleanup', 'after-transaction-claim-cleanup', 'after-transaction-receipt-cleanup']) { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await killedInstall(value, point); assert.equal((await installArchive(basis)).reasonCode, 'INSTALL_COMPLETED'); await absent(join(value.root, '.tcrn-helper-transaction')); assert.equal((await readdir(value.root)).filter(name => name.startsWith('.tcrn-helper-transaction-stage-') || name.startsWith('.tcrn-helper-transaction-claim-stage-') || name.startsWith('.tcrn-helper-transaction-terminal-stage-') || name === '.tcrn-helper-transaction-terminal' || name === 'state.json.tcrn-next').length, 0); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('distinct-PID contenders have one winner and immediate clean state', async () => { for (let repeat = 0; repeat < Number(process.env.TCRN_LOCK_STRESS_REPEATS ?? 1); repeat += 1) for (const count of [2, 3]) { const value = await fixture(); try { const results = await contenders(value, count); assert.equal(new Set(results.map(result => result.pid)).size, count); const terminals = results.map(result => result.code === 0 ? `success:${JSON.parse(result.stdout).reasonCode}` : `failure:${JSON.parse(result.stderr).reasonCode}:${JSON.parse(result.stderr).code}`).sort(); assert.deepEqual(terminals, [...Array(count - 1).fill('failure:TRANSACTION_CONFLICT:null'), 'success:INSTALL_COMPLETED'].sort()); await absent(join(value.root, '.tcrn-helper-lock')); assert.equal((await readdir(value.root)).filter(name => name.startsWith('.tcrn-helper-lock-stage-')).length, 0); } finally { await rm(value.root, { recursive:true, force:true }); } } });
test('barrier timeout reaps every contender without lock or stage residue', async () => { const value = await fixture(); try { const results = await contenders(value, 2, { forceTimeout:true }); assert.deepEqual(results.map(result => `${result.code}:${JSON.parse(result.stderr).reasonCode}`).sort(), ['1:TEST_BARRIER_TIMEOUT', '1:TEST_BARRIER_TIMEOUT']); await absent(join(value.root, '.tcrn-helper-lock')); assert.equal((await readdir(value.root)).filter(name => name.startsWith('.tcrn-helper-lock-stage-')).length, 0); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('foreign reserved paths are preserved and concurrent attempts fail closed', async () => { const value = await fixture(); try { const foreign = join(value.root, '.tcrn-helper-transaction'); await mkdir(foreign, { mode:0o755 }); await writeFile(join(foreign, 'foreign'), 'keep'); const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await assert.rejects(() => installArchive(basis), error => error.reasonCode === 'TRANSACTION_CONFLICT'); assert.equal(await readFile(join(foreign, 'foreign'), 'utf8'), 'keep'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('a byte-identical replacement backup tree is preserved after a killed update', async () => { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await installArchive(basis); await killedInstall(value, 'after-new-rename', 'update'); const txnName = (await readdir(value.root)).find(name => name.startsWith('.tcrn-helper-transaction-stage-')); assert.ok(txnName); const backup = join(value.root, txnName, 'backup'); await rm(backup, { recursive:true, force:true }); await mkdir(join(backup, 'skill'), { recursive:true, mode:0o700 }); await writeFile(join(backup, 'skill', 'SKILL.md'), 'skill', { mode:0o600 }); await assert.rejects(() => installArchive({ ...basis, operation:'update' }), error => error.reasonCode === 'TRANSACTION_CONFLICT'); assert.equal(await readFile(join(backup, 'skill', 'SKILL.md'), 'utf8'), 'skill'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('a byte-identical terminal install replacement is preserved after transaction-directory cleanup', async () => { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await killedInstall(value, 'after-transaction-directory-cleanup'); const install = join(value.root, 'install'); await rm(install, { recursive:true, force:true }); await mkdir(join(install, 'skill'), { recursive:true, mode:0o700 }); await writeFile(join(install, 'skill', 'SKILL.md'), 'skill', { mode:0o600 }); await assert.rejects(() => installArchive(basis), error => error.reasonCode === 'TRANSACTION_CONFLICT'); assert.equal(await readFile(join(install, 'skill', 'SKILL.md'), 'utf8'), 'skill'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('a byte-identical extracted stage replacement is preserved after a killed install', async () => { const value = await fixture(); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await killedInstall(value, 'after-extract'); const txnName = (await readdir(value.root)).find(name => name.startsWith('.tcrn-helper-transaction-stage-')); assert.ok(txnName); const stage = join(value.root, txnName, 'stage'); await rm(stage, { recursive:true, force:true }); await mkdir(join(stage, 'skill'), { recursive:true, mode:0o700 }); await writeFile(join(stage, 'skill', 'SKILL.md'), 'skill', { mode:0o600 }); await assert.rejects(() => installArchive(basis), error => error.reasonCode === 'TRANSACTION_CONFLICT'); assert.equal(await readFile(join(stage, 'skill', 'SKILL.md'), 'utf8'), 'skill'); } finally { await rm(value.root, { recursive:true, force:true }); } });
test('state cannot escape the authorized disposable root', async () => { const value = await fixture(); const outside = join(os.tmpdir(), `tcrn-helper-outside-${Date.now()}.json`); try { const basis = { testRoot:value.root, archivePath:value.archivePath, statePath:outside, expectedArchiveSha256:value.expectedArchiveSha256, approved:true }; await assert.rejects(() => installArchive(basis), error => error.reasonCode === 'STATE_PATH_INVALID'); await absent(outside); } finally { await rm(value.root, { recursive:true, force:true }); await rm(outside, { force:true }); } });

test('validateArchive rejects traversal, absolute, non-file, and over-limit archives', () => {
  const entry = (path, over = {}) => ({ contentBase64:Buffer.from('x').toString('base64'), path, sha256:sha('x'), type:'file', ...over });
  assert.throws(() => validateArchive({ schemaVersion:'tcrn.workflow.helper.archive.v1', entries:[entry('../escape')] }), error => error.reasonCode === 'ARCHIVE_PATH_INVALID');
  assert.throws(() => validateArchive({ schemaVersion:'tcrn.workflow.helper.archive.v1', entries:[entry('/abs')] }), error => error.reasonCode === 'ARCHIVE_PATH_INVALID');
  assert.throws(() => validateArchive({ schemaVersion:'tcrn.workflow.helper.archive.v1', entries:[entry('link', { type:'symlink' })] }), error => error.reasonCode === 'ARCHIVE_ENTRY_INVALID');
  const many = Array.from({ length:257 }, (_, index) => entry(`file-${String(index).padStart(4, '0')}`)).sort((one, two) => one.path < two.path ? -1 : 1);
  assert.throws(() => validateArchive({ schemaVersion:'tcrn.workflow.helper.archive.v1', entries:many }), error => error.reasonCode === 'ARCHIVE_LIMIT_EXCEEDED');
});

test('resolveWorkflowRoot rejects more than one candidate as ambiguous', async () => {
  await assert.rejects(() => resolveWorkflowRoot({ candidates:['/one', '/two'] }), error => error.reasonCode === 'ROOT_AMBIGUOUS');
  await assert.rejects(() => resolveWorkflowRoot({ candidates:[] }), error => error.reasonCode === 'ROOT_MISSING');
});


async function installedCopyDir() {
  const root = await mkdtemp(join(await realpath(os.tmpdir()), 'tcrn-helper-test-installed-'));
  const dir = join(root, 'installed'); await mkdir(join(dir, 'skill'), { recursive:true });
  await writeFile(join(dir, 'skill', 'SKILL.md'), 'skill');
  return { root, dir };
}
test('verify-installed-copy validates a faithful on-disk skill copy and reconstructs the pinned archive', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const receipt = await verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 });
    assert.equal(receipt.reasonCode, 'INSTALLED_COPY_VALIDATED');
    assert.equal(receipt.archiveSha256, value.archive ? sha(canonicalJson(value.archive)) : receipt.archiveSha256);
    assert.equal(receipt.version, IDENTITY.version);
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('verify-installed-copy fails closed on a tampered on-disk copy', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    await writeFile(join(copy.dir, 'skill', 'SKILL.md'), 'tampered');
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'IDENTITY_MISMATCH');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('verify-installed-copy rejects a symlinked installed directory and archive-level links', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const alias = join(copy.root, 'alias'); await symlink(copy.dir, alias);
    await assert.rejects(() => verifyInstalledCopy({ installedDir:alias, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'ROOT_SYMLINK');
    const linked = join(copy.dir, 'skill', 'evil'); await symlink('/etc/hosts', linked);
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'ARCHIVE_ENTRY_INVALID');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('verify-installed-copy accepts exactly one archive: any other release fails the pin', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    // An on-disk copy that is a perfectly well-formed archive, just not THIS one. There is no
    // epoch to lie about any more -- the accepted digest lives in the runtime, so a downgrade,
    // an upgrade, and a substitution all land on the same stop.
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:'0'.repeat(64) }), error => error.reasonCode === 'IDENTITY_MISMATCH');
    await absent(value.statePath);
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});

test('verify-installed-copy records the verified archive digest and is idempotent', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const first = await verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 });
    assert.equal(first.reasonCode, 'INSTALLED_COPY_VALIDATED');
    assert.equal(first.version, IDENTITY.version);
    assert.deepEqual(JSON.parse(await readFile(value.statePath, 'utf8')), { schemaVersion:'tcrn.workflow.helper.state.v1', verifiedArchiveSha256:value.expectedArchiveSha256 });
    const second = await verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 });
    assert.deepEqual(second, first);
    // malformed persisted state is a stop, not something to overwrite silently
    await writeFile(value.statePath, canonicalJson({ schemaVersion:'tcrn.workflow.helper.state.v1', verifiedArchiveSha256:7 }), { mode:0o600 });
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:value.statePath, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'STATE_INVALID');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('verify-installed-copy refuses a state or marker path inside a live host location', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const liveState = join(copy.root, '.claude', 'state.json'); await mkdir(join(copy.root, '.claude'), { recursive:true });
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:liveState, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'LIVE_LOCATION_FORBIDDEN');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('verify-installed-copy refuses a state path whose ancestor symlinks into a live host location', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const live = join(copy.root, '.claude'); await mkdir(live, { recursive:true });
    const alias = join(copy.root, 'managed'); await symlink(live, alias); // lexically clean, physically inside .claude
    const sneaky = join(alias, 'state.json');
    await assert.rejects(() => verifyInstalledCopy({ installedDir:copy.dir, provenancePath:value.provenancePath, statePath:sneaky, expectedArchiveSha256:value.expectedArchiveSha256 }), error => error.reasonCode === 'LIVE_LOCATION_FORBIDDEN');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
test('the CLI verify-installed-copy refuses a marker path whose ancestor symlinks into a live host location', async () => {
  const value = await fixture(); const copy = await installedCopyDir();
  try {
    const live = join(copy.root, '.codex'); await mkdir(live, { recursive:true });
    const alias = join(copy.root, 'managed'); await symlink(live, alias);
    const sneakyMarker = join(alias, 'marker.json');
    const args = [value.bootstrapPath, 'verify-installed-copy', '--installed-dir', copy.dir, '--provenance', value.provenancePath, '--state', value.statePath, '--marker', sneakyMarker, '--now', '2026-07-14T14:00:00Z'];
    await assert.rejects(() => execFile(process.execPath, args, { cwd:process.cwd() }), error => JSON.parse(error.stderr).reasonCode === 'LIVE_LOCATION_FORBIDDEN');
  } finally { await rm(value.root, { recursive:true, force:true }); await rm(copy.root, { recursive:true, force:true }); }
});
