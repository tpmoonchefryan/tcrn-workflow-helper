import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assertArtifactParity, assertArtifactSet, atomicWrite, runCommand } from '../scripts/prove-ci-replay.mjs';

const command = { args:['run', 'format'], command:'npm run format', expectedTerminal:'format ok' };

test('replay records one command and preserves a nonzero-stderr policy failure', async () => {
  const commands = [];
  await assert.rejects(() => runCommand({
    checkout:'/unused',
    command,
    commands,
    exec:async () => ({ stderr:'warning\n', stdout:'format ok\n' }),
  }), error => error.reasonCode === 'CI_REPLAY_STDERR_NONZERO');
  assert.equal(commands.length, 1);
  assert.equal(commands[0].exitStatus, 0);
  assert.equal(commands[0].stderrBytes, Buffer.byteLength('warning\n'));
});

test('replay records one command and preserves a terminal-marker policy failure', async () => {
  const commands = [];
  await assert.rejects(() => runCommand({
    checkout:'/unused',
    command,
    commands,
    exec:async () => ({ stderr:'', stdout:'different terminal\n' }),
  }), error => error.reasonCode === 'CI_REPLAY_TERMINAL_INVALID');
  assert.equal(commands.length, 1);
  assert.equal(commands[0].exitStatus, 0);
  assert.equal(commands[0].terminalReason, 'different terminal');
});

test('failed replay receipt publication removes its exact stage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tcrn-helper-ci-replay-stage-'));
  const output = join(directory, 'receipt.json');
  try {
    await mkdir(output, { mode:0o700 });
    await assert.rejects(() => atomicWrite(output, Buffer.from('receipt\n')));
    assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('receipt.json.stage-')), []);
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
});

test('replay fails closed when a rebuilt artifact digest departs from the committed digest', () => {
  const hashes = { 'checksums.txt':'a'.repeat(64), 'sbom.json':'b'.repeat(64) };
  assertArtifactParity(hashes, { ...hashes });
  assert.throws(() => assertArtifactParity(hashes, { ...hashes, 'sbom.json':'c'.repeat(64) }), error => error.reasonCode === 'CI_REPLAY_ARTIFACT_DIGEST_MISMATCH');
  assert.throws(() => assertArtifactParity(hashes, { 'checksums.txt':hashes['checksums.txt'] }), error => error.reasonCode === 'CI_REPLAY_ARTIFACT_DIGEST_MISMATCH');
});

test('replay fails closed when the checkout artifact set is not exactly the committed set', () => {
  const committed = ['candidate-manifest.json', 'checksums.txt', 'sbom.json', 'skill-archive.json', 'source-archive.json'];
  assertArtifactSet([...committed].reverse());
  assert.throws(() => assertArtifactSet([...committed, 'hidden-extra.json']), error => error.reasonCode === 'CI_REPLAY_ARTIFACT_SET_INVALID');
  assert.throws(() => assertArtifactSet(committed.slice(1)), error => error.reasonCode === 'CI_REPLAY_ARTIFACT_SET_INVALID');
});
