import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const script = fileURLToPath(new URL('../scripts/create-source-archive.mjs', import.meta.url));
const git = (directory, ...args) => execFile('git', args, { cwd:directory });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tcrn-helper-source-archive-'));
  await git(directory, 'init', '--quiet');
  await git(directory, 'config', 'user.name', 'helper-test');
  await git(directory, 'config', 'user.email', 'helper-test@users.noreply.github.com');
  await writeFile(join(directory, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(directory, 'module.mjs'), 'export {};\n');
  await git(directory, 'add', 'package.json', 'module.mjs');
  await git(directory, 'commit', '--quiet', '-m', 'fixture');
  return directory;
}
async function archive(directory) {
  await execFile(process.execPath, [script, '--output', 'artifacts/source-archive.json'], { cwd:directory });
  return readFile(join(directory, 'artifacts', 'source-archive.json'));
}

test('source archive binds exactly the tracked source set and ignores untracked pollution', async () => {
  const directory = await fixture();
  try {
    const clean = await archive(directory);
    const entries = JSON.parse(clean.toString('utf8')).entries.map(entry => entry.path);
    assert.deepEqual(entries, ['module.mjs', 'package.json']);
    await writeFile(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    await writeFile(join(directory, 'stray.txt'), 'stray\n');
    assert.deepEqual(await archive(directory), clean);
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('source archive refuses a tracked non-regular entry', async () => {
  const directory = await fixture();
  try {
    await symlink('package.json', join(directory, 'alias'));
    await git(directory, 'add', 'alias');
    await assert.rejects(() => archive(directory), error => String(error.stderr ?? error).includes('non-regular source entry'));
  } finally { await rm(directory, { recursive:true, force:true }); }
});
