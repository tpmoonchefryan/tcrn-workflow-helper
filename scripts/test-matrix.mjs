// SPDX-License-Identifier: Apache-2.0

// Matrix-sharded test runner. The two lifecycle fault-matrix tests carry 93%
// of the suite's wall time and already expose TCRN_MATRIX_OPERATION as their
// sharding hook; this runner executes them once per operation across four
// concurrent processes, the rest of bootstrap.test.mjs concurrently beside
// them, and the artifact-coupled files in one strictly serial pass. Same
// tests, same points, same assertions — distributed.
//
// The serial pass is defense, not optimization: checksums.test.mjs and
// source-archive.test.mjs regenerate the repository's artifacts/ in place and
// verify-release reads them, so the runner's default file concurrency leaves a
// structural window for two writers over the same artifact paths. No failure
// has been attributed to that window; the serial pass closes it anyway,
// because artifact regeneration under concurrency is a race by construction.
// Artifact-coupled files run one at a time, in name order, always.
//
// The split is proven, not assumed: the main pass must report exactly the two
// matrix tests as skipped, and every shard must run exactly the two. A count
// that drifts fails closed, so a renamed matrix test cannot silently escape
// the shards (the skip pattern would stop matching and the main pass would
// run it serially — slower, never less covered — while the shard count check
// still flags the drift).

import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const MATRIX_TESTS = [
  'effective lifecycle injection inventory is discovered from all four real operations',
  'real SIGKILL at every effective lifecycle and recovery-only injection point restarts CLEAN',
];
const OPERATIONS = ['install', 'update', 'reinstall', 'uninstall'];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = MATRIX_TESTS.map(escape).join('|');

function summary(stdout, stderr, label) {
  const text = `${stdout}\n${stderr}`;
  const read = name => {
    const match = new RegExp(`ℹ ${name} (\\d+)`).exec(text);
    if (!match) throw new Error(`${label}: missing ${name} count in test output`);
    return Number(match[1]);
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

async function run(label, args, env = {}) {
  try {
    const { stdout, stderr } = await execFile(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    });
    // The push-gate's zero-tolerance warning scan reads THIS process's output.
    // Child output is aggregated here, so the scan must happen here too --
    // swallowing a child warning would weaken the existing check. It matches
    // Node's genuine runtime-warning prefix, not the bare word: test fixtures
    // legitimately contain the word "warning" (ci-replay's stderr-nonzero case
    // fakes exactly that), and a scan blunt enough to fire on fixture text
    // spent a debugging round masquerading as a flake before this comment.
    const warned = /\(node:\d+\)[^\n]*Warning/u.exec(`${stdout}\n${stderr}`);
    if (warned) throw new Error(`${label}: runtime warning emitted: ${warned[0].slice(0, 200)}`);
    return { label, ...summary(stdout, stderr, label) };
  } catch (error) {
    process.stderr.write(String(error.stdout ?? ''));
    process.stderr.write(String(error.stderr ?? ''));
    // A child that dies with empty output leaves the forwards above blank, so
    // the error object itself is the only witness -- say what it knows.
    throw new Error(`${label}: test process failed (${error.message}; code=${error.code ?? 'none'} signal=${error.signal ?? 'none'})`);
  }
}

const files = (await readdir('test')).filter(name => name.endsWith('.test.mjs')).sort().map(name => `test/${name}`);
const bootstrapFile = 'test/bootstrap.test.mjs';
assert(files.includes(bootstrapFile), 'bootstrap.test.mjs missing from the test set');
const serialFiles = files.filter(name => name !== bootstrapFile);

// Phase A — everything tmp-rooted, concurrently: the four matrix shards plus
// bootstrap's remaining tests (its fixtures never leave mkdtemp roots).
const bootstrapRest = run('bootstrap-rest', ['--test', '--test-skip-pattern', pattern, bootstrapFile]);
const shards = OPERATIONS.map(operation =>
  run(`shard:${operation}`, ['--test', '--test-name-pattern', pattern, bootstrapFile], { TCRN_MATRIX_OPERATION: operation }));
const phaseA = await Promise.all([bootstrapRest, ...shards]);

// Phase B — the artifact-coupled files, one at a time.
const serial = await run('serial', ['--test', '--test-concurrency=1', ...serialFiles]);

// Drift is proven by the shards, not by the skip side: --test-skip-pattern
// removes matching tests from the counts entirely (probed on this Node: a
// skipped-by-pattern test reports neither in tests nor in skipped), so the
// rest pass cannot see what it skipped. A renamed matrix test stops matching
// the shards' --test-name-pattern and their pass count drops below two —
// caught below — while the rest pass would then run it serially: slower,
// never less covered.
const failures = [];
const [restResult, ...shardResults] = phaseA;
if (restResult.fail !== 0) failures.push(`bootstrap-rest reported ${restResult.fail} failures`);
for (const shard of shardResults) {
  if (shard.fail !== 0) failures.push(`${shard.label} reported ${shard.fail} failures`);
  if (shard.pass !== MATRIX_TESTS.length) failures.push(`${shard.label} ran ${shard.pass} matrix tests, expected exactly ${MATRIX_TESTS.length}`);
}
if (serial.fail !== 0) failures.push(`serial pass reported ${serial.fail} failures`);
if (serial.skipped !== 0) failures.push(`serial pass skipped ${serial.skipped} tests, expected none`);
if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, reasonCode: 'MATRIX_TESTS_FAILED', failures })}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  reasonCode: 'MATRIX_TESTS_VERIFIED',
  bootstrap: { tests: restResult.tests, pass: restResult.pass },
  shards: shardResults.map(shard => ({ label: shard.label, pass: shard.pass })),
  serial: { tests: serial.tests, pass: serial.pass },
})}\n`);
