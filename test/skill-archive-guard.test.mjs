import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { unrepresentableSkillPaths } from '../scripts/create-skill-archive.mjs';

const execFile = promisify(execFileCallback);
const builder = fileURLToPath(new URL('../scripts/create-skill-archive.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The pure guard is what the builder fails closed on. It exists as its own function
// precisely so this can be asserted without a build: the original defect was that a
// second skill directory was FILTERED OUT silently, so "returns it as a stray" is the
// property that makes the difference.
test('the guard names everything under skill/ the single-skill archive cannot represent', () => {
  const clean = ['skill/tcrn-workflow-helper/SKILL.md', 'skill/tcrn-workflow-helper/references/x.md', 'scripts/create-skill-archive.mjs', 'README.md'];
  assert.deepEqual(unrepresentableSkillPaths(clean), [], 'the sole skill subtree and anything outside skill/ are representable');

  // A second skill directory — the exact shape the original fail-open dropped.
  assert.deepEqual(
    unrepresentableSkillPaths([...clean, 'skill/other-skill/SKILL.md', 'skill/other-skill/refs/y.md']),
    ['skill/other-skill/SKILL.md', 'skill/other-skill/refs/y.md'],
  );
  // A stray file directly under skill/.
  assert.deepEqual(unrepresentableSkillPaths([...clean, 'skill/README.md']), ['skill/README.md']);
  // A look-alike prefix must not slip past: skill/tcrn-workflow-helperX/ is not the
  // subtree, so its contents are unrepresentable rather than silently included.
  assert.deepEqual(unrepresentableSkillPaths([...clean, 'skill/tcrn-workflow-helperX/SKILL.md']), ['skill/tcrn-workflow-helperX/SKILL.md']);
  // Paths outside skill/ are never the archive's concern.
  assert.deepEqual(unrepresentableSkillPaths(['scripts/x.mjs', 'docs/a.md', 'skilling/z.md']), []);
});

// The end-to-end proof that would have caught the original defect: run the real
// builder against a repository whose tracked set contains a second skill directory,
// and assert it EXITS NON-ZERO rather than producing a green archive that omits it.
// A pure-function test alone does not prove the builder is wired to the guard.
test('the builder exits non-zero when a second skill directory is tracked', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'tcrn-archive-guard-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));

  // A minimal tree with the real single skill plus an intruding second skill.
  await mkdir(join(scratch, 'skill/tcrn-workflow-helper'), { recursive: true });
  await writeFile(join(scratch, 'skill/tcrn-workflow-helper/SKILL.md'), '---\nname: x\ndescription: y\n---\nbody\n');
  await mkdir(join(scratch, 'skill/other-skill'), { recursive: true });
  await writeFile(join(scratch, 'skill/other-skill/SKILL.md'), 'unpinned prose that used to ship green\n');

  const git = (...args) => execFile('git', args, { cwd: scratch });
  await git('init', '-q');
  await git('config', 'user.email', 'x@example.invalid');
  await git('config', 'user.name', 'x');
  await git('add', '-A');
  await git('commit', '-q', '-m', 'scratch');

  await assert.rejects(
    execFile('node', [builder, '--output', join(scratch, 'out.json')], { cwd: scratch }),
    (error) => {
      assert.notEqual(error.code, 0, 'builder must exit non-zero on an unrepresentable tree');
      assert.match(String(error.stderr), /ARCHIVE_UNREPRESENTABLE/u);
      assert.match(String(error.stderr), /skill\/other-skill\/SKILL\.md/u, 'the offending path must be named');
      return true;
    },
  );
});

// Guard against a silent regression of the module boundary: importing the builder
// must not run a build (that would make the pure-function test above build the real
// repo as a side effect). Running it as the entry point still works.
test('importing the builder does not build; running it as entry point does', async () => {
  // Import already happened at the top of this file with no output/side effect, which
  // is the assertion. Confirm the entry-point path still produces a digest.
  const { stdout } = await execFile('node', [builder, '--output', join(await mkdtemp(join(tmpdir(), 'tcrn-archive-ok-')), 'a.json')], { cwd: repoRoot });
  assert.match(stdout.trim(), /^[a-f0-9]{64}$/u, 'entry-point build prints the archive digest');
});
