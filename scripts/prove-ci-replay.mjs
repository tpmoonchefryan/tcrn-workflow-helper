import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, open, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sequence = [
  { args:['run', 'verify:ci-workflow'], command:'npm run verify:ci-workflow', expectedTerminal:'HELPER_CI_WORKFLOW_POLICY_VALIDATED' },
  { args:['run', 'format'], command:'npm run format', expectedTerminal:'format ok' },
  { args:['run', 'lint'], command:'npm run lint', expectedTerminal:'lint ok' },
  { args:['run', 'typecheck'], command:'npm run typecheck', expectedTerminal:null },
  { args:['run', 'archive'], command:'npm run archive', expectedTerminal:null },
  { args:['run', 'build'], command:'npm run build', expectedTerminal:null },
  { args:['run', 'checksums'], command:'npm run checksums', expectedTerminal:'CHECKSUMS_GENERATED' },
  { args:['test'], command:'npm test', expectedTerminal:'RELEASE_NEGATIVES_VALIDATED' },
  { args:['run', 'verify'], command:'npm run verify', expectedTerminal:'RELEASE_ARTIFACTS_VALIDATED' },
  { args:['run', 'artifacts:repro'], command:'npm run artifacts:repro', expectedTerminal:'ARTIFACTS_REPRODUCIBLE' },
];
const artifactNames = ['checksums.txt', 'sbom.json', 'skill-archive.json', 'source-archive.json'];
const committedArtifactSet = ['candidate-manifest.json', 'checksums.txt', 'sbom.json', 'skill-archive.json', 'source-archive.json'];
export function assertArtifactParity(artifactHashes, committedDigests) {
  for (const name of Object.keys(artifactHashes).sort()) if (committedDigests[name] !== artifactHashes[name]) fail('CI_REPLAY_ARTIFACT_DIGEST_MISMATCH');
}
export function assertArtifactSet(observed) {
  if (canonicalJson([...observed].sort()) !== canonicalJson(committedArtifactSet)) fail('CI_REPLAY_ARTIFACT_SET_INVALID');
}
const residueNames = name => name === '__pycache__' || name === '.tcrn-helper-lock' || name === '.tcrn-helper-transaction' || name === '.tcrn-helper-transaction-attempt' || name === '.tcrn-helper-transaction-terminal' || name.startsWith('.tcrn-helper-lock-stage-') || name.startsWith('.tcrn-helper-transaction-stage-') || name.startsWith('.tcrn-helper-transaction-attempt-stage-') || name.startsWith('.tcrn-helper-transaction-claim-stage-') || name.startsWith('.tcrn-helper-transaction-terminal-stage-') || name.endsWith('.tcrn-next');
const fail = reasonCode => {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  throw error;
};

export async function atomicWrite(path, bytes) {
  const stage = `${path}.stage-${process.pid}`;
  let published = false;
  try {
    await writeFile(stage, bytes, { encoding:'utf8', flag:'wx', mode:0o600 });
    const handle = await open(stage, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(stage, path);
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
      published = true;
    } finally {
      await directory.close();
    }
  } finally {
    if (!published) await unlink(stage).catch(() => {});
  }
}

async function residues(directory, prefix = '') {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const path = join(directory, entry.name);
    const name = `${prefix}${entry.name}`;
    if (residueNames(entry.name)) output.push(name);
    if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') output.push(...await residues(path, `${name}/`));
  }
  return output.sort();
}

function terminalReason(stdout) {
  const matches = [...stdout.matchAll(/\{"reasonCode":"([A-Z0-9_]+)"\}/g)];
  if (matches.length !== 0) return matches.at(-1)[1];
  const lines = stdout.trimEnd().split('\n');
  return lines.at(-1) || null;
}

const replayEnvironment = { ...process.env, LANG:'C', LC_ALL:'C', TZ:'UTC', SOURCE_DATE_EPOCH:'0' };
export async function runCommand({ checkout, command, commands, exec = execFile }) {
  const started = Date.now();
  let result;
  try {
    result = await exec('npm', command.args, { cwd:checkout, env:replayEnvironment, maxBuffer:16 * 1024 * 1024 });
  } catch (error) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    commands.push({ command:command.command, elapsedMilliseconds:Date.now() - started, exitStatus:Number.isInteger(error.code) ? error.code : 1, expectedTerminal:command.expectedTerminal, stderrBytes:Buffer.byteLength(stderr), stdoutSha256:sha256(stdout), terminalReason:terminalReason(stdout) ?? terminalReason(stderr) });
    fail('CI_REPLAY_COMMAND_FAILED');
  }
  const commandStderrBytes = Buffer.byteLength(result.stderr);
  const observedTerminal = terminalReason(result.stdout);
  commands.push({ command:command.command, elapsedMilliseconds:Date.now() - started, exitStatus:0, expectedTerminal:command.expectedTerminal, stderrBytes:commandStderrBytes, stdoutSha256:sha256(result.stdout), terminalReason:observedTerminal });
  if (commandStderrBytes !== 0) fail('CI_REPLAY_STDERR_NONZERO');
  if (command.expectedTerminal !== null && observedTerminal !== command.expectedTerminal) fail('CI_REPLAY_TERMINAL_INVALID');
  // Nothing to return: a non-zero stderr already failed above, so the only value this
  // could ever have carried was zero.
}

export async function replay({ output, replayRoot = process.cwd(), exec = execFile }) {
  const resolvedRoot = resolve(replayRoot);
  if (dirname(output) !== resolve(resolvedRoot, 'artifacts')) fail('CI_REPLAY_CLI_INVALID');
  const temporary = await mkdtemp(join(tmpdir(), 'tcrn-helper-ci-replay-'));
  const checkout = join(temporary, 'checkout');
  const commands = [];
  try {
    const sourceStatus = await exec('git', ['status', '--porcelain=v1'], { cwd:resolvedRoot, maxBuffer:64 * 1024 });
    if (sourceStatus.stdout !== '') fail('CI_REPLAY_SOURCE_DIRTY');
    const sourceCommit = (await exec('git', ['rev-parse', 'HEAD^{commit}'], { cwd:resolvedRoot, maxBuffer:64 * 1024 })).stdout.trim();
    const sourceTree = (await exec('git', ['rev-parse', 'HEAD^{tree}'], { cwd:resolvedRoot, maxBuffer:64 * 1024 })).stdout.trim();
    await exec('git', ['clone', '--no-local', '--quiet', resolvedRoot, checkout], { maxBuffer:8 * 1024 * 1024 });
    const checkoutCommit = (await exec('git', ['rev-parse', 'HEAD^{commit}'], { cwd:checkout, maxBuffer:64 * 1024 })).stdout.trim();
    const checkoutTree = (await exec('git', ['rev-parse', 'HEAD^{tree}'], { cwd:checkout, maxBuffer:64 * 1024 })).stdout.trim();
    if (checkoutCommit !== sourceCommit || checkoutTree !== sourceTree) fail('CI_REPLAY_CHECKOUT_IDENTITY_INVALID');
    for (const command of sequence) await runCommand({ checkout, command, commands, exec });
    const artifactHashes = {};
    for (const name of artifactNames) artifactHashes[name] = sha256(await readFile(join(checkout, 'artifacts', name)));
    const committedDigests = {};
    for (const name of artifactNames) committedDigests[name] = sha256((await exec('git', ['show', `HEAD:artifacts/${name}`], { cwd:checkout, maxBuffer:32 * 1024 * 1024, encoding:'buffer' })).stdout);
    assertArtifactParity(artifactHashes, committedDigests);
    assertArtifactSet(await readdir(join(checkout, 'artifacts')));
    const status = await exec('git', ['status', '--porcelain=v1'], { cwd:checkout, maxBuffer:64 * 1024 });
    const governedResidue = await residues(checkout);
    if (status.stdout !== '' || governedResidue.length !== 0 || canonicalJson(commands.map(value => value.command)) !== canonicalJson(sequence.map(value => value.command))) fail('CI_REPLAY_DIRTY_OR_RESIDUE');
    const receipt = { artifactHashes, checkoutCommit, checkoutTree, commands, committedDigests, declaredSequence:sequence.map(value => value.command), finalClean:true, governedResidue, reasonCode:'CI_REPLAY_VALIDATED', schemaVersion:'tcrn.workflow.helper.ci-replay.v2', sourceCommit, sourceTree, stderrBytes:0 };
    await atomicWrite(output, canonicalJson(receipt));
    return receipt;
  } finally {
    await rm(temporary, { recursive:true, force:true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) fail('CI_REPLAY_CLI_INVALID');
  const output = resolve(process.cwd(), args[1]);
  try {
    await replay({ output });
    process.stdout.write(canonicalJson({ reasonCode:'CI_REPLAY_VALIDATED' }));
  } catch (error) {
    process.stderr.write(canonicalJson({ reasonCode:error?.reasonCode ?? 'CI_REPLAY_FAILED' }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
