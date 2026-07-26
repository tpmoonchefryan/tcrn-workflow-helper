import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const archivePath = fileURLToPath(new URL('../artifacts/skill-archive.json', import.meta.url));

// Positive allowlist: the pinned skill archive must contain EXACTLY this fixed
// file set — no more. Absence of embedded work/knowledge data (constraint: the
// Skill teaches querying, it never carries data) is proven by this closed
// manifest + the archive digest pinned into the bootstrap, not by grepping for a negative.
const ALLOWED = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/backup-elicitation.md',
  'references/driver-capability-profile.md',
  'references/first-run-wizard.md',
  'references/on-demand-context.md',
  'references/reason-codes.md',
  'references/settings-elicitation.md',
  'references/trust-contract.md',
  'references/workflow-operations.md',
  'scripts/create-skill-archive.mjs',
].sort();

test('the pinned skill archive contains exactly the allowlisted guidance/instruction files and no data payload', async () => {
  const archive = JSON.parse(await readFile(archivePath, 'utf8'));
  const paths = archive.entries.map(entry => entry.path).sort();
  assert.deepEqual(paths, ALLOWED, 'skill archive must equal the fixed guidance/instruction file manifest');
  // every entry is a prose/instruction or generator file — none may be a data
  // dump; assert by extension allowlist (md / yaml / mjs only).
  for (const p of paths) {
    assert.ok(/\.(md|yaml|mjs)$/.test(p), `unexpected non-instruction file in skill archive: ${p}`);
  }
});

// The frontmatter's only consumer is the live host's YAML parser: push-gate
// greps lines and the rest of this suite compares archive bytes, so a
// spec-invalid frontmatter ships green and the Skill silently fails to load.
// YAML 1.2 §7.3.3 forbids ": " and " #" inside plain scalars — a candidate.8
// description contained "workspace: when" and js-yaml refused the whole block.
// This repository carries no runtime dependencies, so the guard is the two
// forbidden sequences, not a parser.
test('the pinned SKILL.md frontmatter stays parseable as plain-scalar YAML', async () => {
  const archive = JSON.parse(await readFile(archivePath, 'utf8'));
  const skill = archive.entries.find(entry => entry.path === 'SKILL.md');
  assert.ok(skill, 'SKILL.md entry missing from archive');
  const text = Buffer.from(skill.contentBase64, 'base64').toString('utf8');
  const lines = text.split('\n');
  assert.equal(lines[0], '---', 'frontmatter must open the document');
  const close = lines.indexOf('---', 1);
  assert.ok(close > 1, 'frontmatter must be closed');
  const fields = new Map();
  for (const line of lines.slice(1, close)) {
    const match = /^([a-z][a-z0-9-]*): (\S.*)$/.exec(line);
    assert.ok(match, `frontmatter line is not a single-line plain-scalar mapping: ${line}`);
    const [, key, value] = match;
    assert.ok(!value.includes(': '), `frontmatter ${key} contains ": " — invalid inside a YAML plain scalar`);
    assert.ok(!value.includes(' #'), `frontmatter ${key} contains " #" — invalid inside a YAML plain scalar`);
    fields.set(key, value);
  }
  assert.ok(fields.has('name') && fields.has('description'), 'frontmatter must carry name and description');
  assert.ok(fields.get('description').length <= 1024, 'description exceeds the host description budget');
});
