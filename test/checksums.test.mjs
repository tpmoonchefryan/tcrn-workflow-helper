import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { link, lstat, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { once } from 'node:events';
import test from 'node:test';
import { generateChecksums } from '../scripts/generate-checksums.mjs';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const node = process.execPath;
const python = '/usr/bin/python3';
const helper = join(root, 'scripts/generate-checksums.py');
const checksums = 'artifacts/checksums.txt';
const archive = ['scripts/create-skill-archive.mjs', '--output', 'artifacts/skill-archive.json'];
const source = ['scripts/create-source-archive.mjs', '--output', 'artifacts/source-archive.json'];
const sbom = ['scripts/sbom.mjs', '--output', 'artifacts/sbom.json'];
const verify = ['scripts/verify-release.mjs', '--checksums', checksums, '--license', 'LICENSE', '--sbom', 'artifacts/sbom.json', '--source', 'artifacts/source-archive.json'];
const run = args => execFile(node, args, { cwd:root });
const names = ['sbom.json', 'skill-archive.json', 'source-archive.json'];

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tcrn-helper-checksums-')));
  const artifacts = join(directory, 'artifacts');
  await (await import('node:fs/promises')).mkdir(artifacts, { mode:0o755 });
  for (const name of names) await writeFile(join(artifacts, name), `bytes:${name}\n`, { mode:0o644 });
  return { directory, artifacts };
}

async function assertNoStage(artifacts) {
  const entries = await readdir(artifacts);
  assert.deepEqual(entries.filter(name => name.startsWith('checksums.txt.stage-')), []);
}

function paused(rootDirectory, boundary) {
  const child = spawn(python, ['-I', '-S', '-B', helper, '--test-pause', boundary, '3', '4', rootDirectory], {
    stdio:['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', value => stderr.push(value));
  const exit = once(child, 'close').then(([code]) => ({ code, stderr:Buffer.concat(stderr).toString('utf8') }));
  return {
    child,
    stderr,
    async ready() {
      let timer;
      try {
        const value = await Promise.race([
          once(child.stdio[3], 'data').then(([chunk]) => chunk),
          exit.then(result => { throw new Error(`checksum helper exited before ready: ${result.code}:${result.stderr}`); }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('checksum helper readiness timeout')), 5000); }),
        ]);
        assert.deepEqual(value, Buffer.from('R'));
      } finally {
        clearTimeout(timer);
      }
    },
    async release() {
      child.stdio[4].end('G');
      return exit;
    },
  };
}

test('explicit governed checksum generation is deterministic and independent from test side effects', async () => {
  await run(archive);
  await run(source);
  await run(sbom);
  await rm(checksums, { force:true });
  await assert.rejects(() => run(verify), error => `${error.stderr}\n${error.message}`.includes('artifact is not a bounded regular file'));
  const first = await run(['scripts/generate-checksums.mjs']);
  assert.equal(first.stdout, '{"reasonCode":"CHECKSUMS_GENERATED"}\n');
  const firstBytes = await readFile(checksums);
  const second = await run(['scripts/generate-checksums.mjs']);
  assert.equal(second.stdout, '{"reasonCode":"CHECKSUMS_GENERATED"}\n');
  assert.deepEqual(await readFile(checksums), firstBytes);
  await run(verify);
});

test('direct final publication leaves a single-link output and no reserved-stage residue', async () => {
  const value = await fixture();
  try {
    await generateChecksums({ root:value.directory });
    assert.equal((await lstat(join(value.artifacts, 'checksums.txt'))).nlink, 1);
    await assertNoStage(value.artifacts);
  } finally {
    await rm(value.directory, { recursive:true, force:true });
  }
});

test('checksum generator rejects invalid input shapes and leaves no stage residue', async () => {
  for (const kind of ['missing', 'symlink', 'hardlink', 'oversize']) {
    const value = await fixture();
    const target = join(value.artifacts, 'sbom.json');
    try {
      if (kind === 'missing') await rm(target);
      if (kind === 'symlink') {
        const foreign = join(value.directory, 'foreign');
        await writeFile(foreign, 'foreign', { mode:0o600 });
        await rm(target);
        await symlink(foreign, target);
      }
      if (kind === 'hardlink') {
        const foreign = join(value.directory, 'foreign');
        await writeFile(foreign, 'foreign', { mode:0o600 });
        await rm(target);
        await link(foreign, target);
      }
      if (kind === 'oversize') await truncate(target, 16 * 1024 * 1024 + 1);
      await assert.rejects(() => generateChecksums({ root:value.directory }), error => error.reasonCode === 'CHECKSUM_INPUT_INVALID');
      await assert.rejects(() => lstat(join(value.artifacts, 'checksums.txt')));
      await assertNoStage(value.artifacts);
    } finally {
      await rm(value.directory, { recursive:true, force:true });
    }
  }
});

test('checksum generator rejects an artifacts symlink before input consumption and preserves foreign bytes', async () => {
  const value = await fixture();
  const foreign = join(value.directory, 'foreign-artifacts');
  try {
    await rename(value.artifacts, foreign);
    await writeFile(join(foreign, 'checksums.txt'), 'foreign sentinel\n', { mode:0o644 });
    await symlink(foreign, value.artifacts);
    await assert.rejects(() => generateChecksums({ root:value.directory }), error => error.reasonCode === 'CHECKSUM_ARTIFACTS_INVALID');
    assert.equal(await readFile(join(foreign, 'checksums.txt'), 'utf8'), 'foreign sentinel\n');
    await assertNoStage(foreign);
  } finally {
    await rm(value.directory, { recursive:true, force:true });
  }
});

test('descriptor-bound artifacts reads and output creation reject a later checkout-name symlink without foreign writes', async () => {
  const value = await fixture();
  const held = join(value.directory, 'held-artifacts');
  const foreign = join(value.directory, 'foreign-artifacts');
  try {
    await (await import('node:fs/promises')).mkdir(foreign, { mode:0o755 });
    await writeFile(join(foreign, 'checksums.txt'), 'foreign sentinel\n', { mode:0o644 });
    const run = paused(value.directory, 'after-directory-open');
    await run.ready();
    await rename(value.artifacts, held);
    await symlink(foreign, value.artifacts);
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_ARTIFACTS_REPLACED/);
    assert.equal(await readFile(join(foreign, 'checksums.txt'), 'utf8'), 'foreign sentinel\n');
    await assertNoStage(held);
    await assert.rejects(() => lstat(join(held, 'checksums.txt')));
  } finally {
    await rm(value.directory, { recursive:true, force:true });
  }
});

test('direct final creation preserves a replacement before content write', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'after-output-created');
    await run.ready();
    const attempt = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(attempt.mode & 0o777, 0o000);
    await rm(join(value.artifacts, 'checksums.txt'));
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign replacement\n', { mode:0o600 });
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_REPLACED/);
    const foreign = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.notEqual(foreign.ino, attempt.ino);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign replacement\n');
    await assertNoStage(value.artifacts);
  } finally {
    await rm(value.directory, { recursive:true, force:true });
  }
});

test('created-final ancestor swap preserves the foreign sentinel without a stage attempt', async () => {
  const value = await fixture();
  const held = join(value.directory, 'held-artifacts');
  const foreign = join(value.directory, 'foreign-artifacts');
  try {
    await (await import('node:fs/promises')).mkdir(foreign, { mode:0o755 });
    await writeFile(join(foreign, 'checksums.txt'), 'foreign sentinel\n', { mode:0o644 });
    const run = paused(value.directory, 'after-output-created');
    await run.ready();
    await rename(value.artifacts, held);
    await symlink(foreign, value.artifacts);
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_ARTIFACTS_REPLACED/);
    assert.equal(await readFile(join(foreign, 'checksums.txt'), 'utf8'), 'foreign sentinel\n');
    await assertNoStage(held);
    assert.ok((await lstat(join(held, 'checksums.txt'))).isFile());
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('final-name revalidation rejects an ancestor swap without writing the foreign directory', async () => {
  const value = await fixture();
  const held = join(value.directory, 'held-artifacts');
  const foreign = join(value.directory, 'foreign-artifacts');
  try {
    await (await import('node:fs/promises')).mkdir(foreign, { mode:0o755 });
    await writeFile(join(foreign, 'checksums.txt'), 'foreign sentinel\n', { mode:0o644 });
    const run = paused(value.directory, 'after-output-created');
    await run.ready();
    await rename(value.artifacts, held);
    await symlink(foreign, value.artifacts);
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_ARTIFACTS_REPLACED/);
    assert.equal(await readFile(join(foreign, 'checksums.txt'), 'utf8'), 'foreign sentinel\n');
    await assertNoStage(held);
  } finally {
    await rm(value.directory, { recursive:true, force:true });
  }
});

test('final output replacement is preserved without a stage cleanup path', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'after-output-created');
    await run.ready();
    await rm(join(value.artifacts, 'checksums.txt'));
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign replacement\n', { mode:0o600 });
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_REPLACED/);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign replacement\n');
    await assertNoStage(value.artifacts);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('pre-fchmod publication replacement preserves the foreign inode and never publishes it', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'before-output-publish');
    await run.ready();
    const attempt = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(attempt.mode & 0o777, 0o000);
    await rm(join(value.artifacts, 'checksums.txt'));
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign prepublish replacement\n', { mode:0o600 });
    const foreign = await lstat(join(value.artifacts, 'checksums.txt'));
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_REPLACED/);
    const after = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(after.ino, foreign.ino);
    assert.notEqual(after.ino, attempt.ino);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign prepublish replacement\n');
    await assertNoStage(value.artifacts);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('post-fchmod replacement preserves the foreign inode, mode, and bytes', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'after-output-publish');
    await run.ready();
    const attempt = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(attempt.mode & 0o777, 0o600);
    await rm(join(value.artifacts, 'checksums.txt'));
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign postpublish replacement\n', { mode:0o600 });
    const foreign = await lstat(join(value.artifacts, 'checksums.txt'));
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_REPLACED/);
    const after = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(after.ino, foreign.ino);
    assert.equal(after.mode & 0o777, 0o600);
    assert.notEqual(after.ino, attempt.ino);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign postpublish replacement\n');
    await assertNoStage(value.artifacts);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('pre-fchmod input mutation retains a mode-000 attempt and retry classifies it truthfully', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'before-output-publish');
    await run.ready();
    await writeFile(join(value.artifacts, 'sbom.json'), 'changed input\n', { mode:0o644 });
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_INPUT_REPLACED/);
    const retained = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(retained.mode & 0o777, 0o000);
    await assert.rejects(() => generateChecksums({ root:value.directory }), error => error.reasonCode === 'CHECKSUM_OUTPUT_RETAINED');
    const retry = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(retry.ino, retained.ino);
    assert.equal(retry.mode & 0o777, 0o000);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('pre-fchmod artifacts replacement rejects before publication and retains only the mode-000 attempt', async () => {
  const value = await fixture();
  const held = join(value.directory, 'held-artifacts');
  const foreign = join(value.directory, 'foreign-artifacts');
  try {
    await (await import('node:fs/promises')).mkdir(foreign, { mode:0o755 });
    await writeFile(join(foreign, 'checksums.txt'), 'foreign prepublish sentinel\n', { mode:0o644 });
    const run = paused(value.directory, 'before-output-publish');
    await run.ready();
    const attempt = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(attempt.mode & 0o777, 0o000);
    await rename(value.artifacts, held);
    await symlink(foreign, value.artifacts);
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_ARTIFACTS_REPLACED/);
    assert.equal(await readFile(join(foreign, 'checksums.txt'), 'utf8'), 'foreign prepublish sentinel\n');
    const retained = await lstat(join(held, 'checksums.txt'));
    assert.equal(retained.ino, attempt.ino);
    assert.equal(retained.mode & 0o777, 0o000);
    await assertNoStage(held);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('a competing final name is preserved and retry truthfully fails closed', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'after-output-created');
    await run.ready();
    await rm(join(value.artifacts, 'checksums.txt'));
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign cleanup replacement\n', { mode:0o600 });
    const before = await lstat(join(value.artifacts, 'checksums.txt'));
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_REPLACED/);
    const after = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(after.ino, before.ino);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign cleanup replacement\n');
    await assert.rejects(() => generateChecksums({ root:value.directory }), error => error.reasonCode === 'CHECKSUM_OUTPUT_CONFLICT');
    const retry = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(retry.ino, before.ino);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});

test('O_EXCL preserves a competing final name at the actual no-replace boundary', async () => {
  const value = await fixture();
  try {
    const run = paused(value.directory, 'before-output-create');
    await run.ready();
    await writeFile(join(value.artifacts, 'checksums.txt'), 'foreign O_EXCL winner\n', { mode:0o600 });
    const foreign = await lstat(join(value.artifacts, 'checksums.txt'));
    const result = await run.release();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CHECKSUM_OUTPUT_CONFLICT/);
    const after = await lstat(join(value.artifacts, 'checksums.txt'));
    assert.equal(after.ino, foreign.ino);
    assert.equal(after.mode & 0o777, 0o600);
    assert.equal(await readFile(join(value.artifacts, 'checksums.txt'), 'utf8'), 'foreign O_EXCL winner\n');
    await assertNoStage(value.artifacts);
    await assert.rejects(() => generateChecksums({ root:value.directory }), error => error.reasonCode === 'CHECKSUM_OUTPUT_CONFLICT');
    assert.equal((await lstat(join(value.artifacts, 'checksums.txt'))).ino, foreign.ino);
  } finally { await rm(value.directory, { recursive:true, force:true }); }
});
