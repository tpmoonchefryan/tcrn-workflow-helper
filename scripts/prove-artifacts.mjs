import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), 'tcrn-helper-artifacts-'));
const perturbations = [
  { environment:{ LANG:'C', LC_ALL:'C', TZ:'UTC' }, umask:0o022 },
  { environment:{ LANG:'en_US.UTF-8', LC_ALL:'en_US.UTF-8', TZ:'Pacific/Kiritimati' }, umask:0o077 },
];
async function run(script, output, perturbation) {
  const previousUmask = process.umask(perturbation.umask);
  try {
    await execFile(process.execPath, [join(root, script), '--output', output], { cwd:root, env:{ ...process.env, ...perturbation.environment } });
  } finally {
    process.umask(previousUmask);
  }
}

try {
  const pairs = [
    ['scripts/create-skill-archive.mjs', 'skill-one.json', 'skill-two.json', 'artifacts/skill-archive.json'],
    ['scripts/create-source-archive.mjs', 'source-one.json', 'source-two.json', 'artifacts/source-archive.json'],
    ['scripts/sbom.mjs', 'sbom-one.json', 'sbom-two.json', 'artifacts/sbom.json'],
  ];
  for (const [script, one, two, committed] of pairs) {
    const first = join(temporary, one); const second = join(temporary, two);
    await run(script, first, perturbations[0]); await run(script, second, perturbations[1]);
    const bytes = await readFile(first);
    assert.deepEqual(bytes, await readFile(second), `environment-sensitive ${script}`);
    assert.deepEqual(bytes, await readFile(join(root, committed)), `stale release artifact for ${script}`);
  }
  console.log('ARTIFACTS_REPRODUCIBLE');
} finally { await rm(temporary, { recursive:true, force:true }); }
