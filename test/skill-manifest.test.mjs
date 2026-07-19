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
