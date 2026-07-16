import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const node = process.execPath;
const sha = value => createHash('sha256').update(value).digest('hex');
const checksums = ['sbom.json', 'skill-archive.json', 'source-archive.json'];
const run = args => execFile(node, args, { cwd:process.cwd() });
const verify = () => run(['scripts/verify-release.mjs', '--checksums', 'artifacts/checksums.txt', '--license', 'LICENSE', '--sbom', 'artifacts/sbom.json', '--source', 'artifacts/source-archive.json']);

async function refreshChecksums() {
  const lines = await Promise.all(checksums.map(async name => `${sha(await readFile(`artifacts/${name}`))}  ${name}`));
  await writeFile('artifacts/checksums.txt', `${lines.join('\n')}\n`);
}
async function rejects(action, expected) {
  try { await action(); } catch (error) {
    const output = `${error?.stderr ?? ''}\n${error?.message ?? ''}`;
    if (output.includes(expected)) return;
    throw new Error(`unexpected rejection; expected ${expected}: ${output}`);
  }
  throw new Error(`expected rejection: ${expected}`);
}

await run(['scripts/create-skill-archive.mjs', '--output', 'artifacts/skill-archive.json']);
await run(['scripts/create-source-archive.mjs', '--output', 'artifacts/source-archive.json']);
await run(['scripts/sbom.mjs', '--output', 'artifacts/sbom.json']);
await refreshChecksums();
await verify();
const source = await readFile('artifacts/source-archive.json');
const checksum = await readFile('artifacts/checksums.txt');
const sbom = await readFile('artifacts/sbom.json');
const skill = await readFile('artifacts/skill-archive.json');
const license = await readFile('LICENSE');

async function reset() {
  await writeFile('artifacts/source-archive.json', source);
  await writeFile('artifacts/checksums.txt', checksum);
  await writeFile('artifacts/sbom.json', sbom);
  await verify();
}

try {
  await writeFile('LICENSE', license.subarray(0, license.length - 1));
  await rejects(verify, 'Apache-2.0 license bytes do not match canonical authority');
  await writeFile('LICENSE', license);
  await reset();

  await writeFile('artifacts/skill-archive.json', Buffer.concat([skill, Buffer.from(' ')]));
  await rejects(verify, 'bad checksum');
  await writeFile('artifacts/skill-archive.json', skill);
  await reset();

  await rm('artifacts/skill-archive.json');
  await rejects(verify, 'artifact is not a bounded regular file');
  await writeFile('artifacts/skill-archive.json', skill);
  await reset();

  await writeFile('artifacts/sbom.json', '{');
  await rejects(verify, 'invalid SBOM');
  await writeFile('artifacts/sbom.json', sbom);
  await reset();

  await writeFile('artifacts/sbom.json', Buffer.concat([Buffer.from(' '), sbom]));
  await rejects(verify, 'noncanonical SBOM');
  await writeFile('artifacts/sbom.json', sbom);
  await reset();

  const mutated = JSON.parse(source);
  const entry = mutated.entries[0];
  entry.contentBase64 = `${entry.contentBase64[0] === 'A' ? 'B' : 'A'}${entry.contentBase64.slice(1)}`;
  await writeFile('artifacts/source-archive.json', canonicalJson(mutated));
  await refreshChecksums();
  await rejects(verify, 'invalid source content');
  await reset();

  const unknown = JSON.parse(source); unknown.unknownRoot = 'rejected';
  await writeFile('artifacts/source-archive.json', canonicalJson(unknown));
  await refreshChecksums();
  await rejects(verify, 'invalid closed schema');
  await reset();

  const unordered = JSON.parse(source); unordered.entries.reverse();
  await writeFile('artifacts/source-archive.json', canonicalJson(unordered));
  await refreshChecksums();
  await rejects(verify, 'duplicate source path');
  await reset();

  const missingSource = JSON.parse(source); missingSource.entries.pop();
  await writeFile('artifacts/source-archive.json', canonicalJson(missingSource));
  await refreshChecksums();
  await rejects(verify, 'source set mismatch');
  await reset();

  const extraSource = JSON.parse(source); const extraBytes = Buffer.from('not part of the accepted source set\n');
  extraSource.entries.push({ contentBase64:extraBytes.toString('base64'), path:'zz-extra.txt', sha256:sha(extraBytes), type:'file' });
  await writeFile('artifacts/source-archive.json', canonicalJson(extraSource));
  await refreshChecksums();
  await rejects(verify, 'source set mismatch');
  await reset();

  const ancestor = JSON.parse(source); const sourceEntry = ancestor.entries[0];
  ancestor.entries = [{ ...sourceEntry, path:'a' }, { ...sourceEntry, path:'a/b' }];
  await writeFile('artifacts/source-archive.json', canonicalJson(ancestor));
  await refreshChecksums();
  await rejects(verify, 'duplicate source path');
  await reset();

  const traversal = checksum.toString('utf8').trimEnd().split('\n');
  traversal[0] = `${traversal[0].slice(0, 64)}  ../outside`;
  await writeFile('artifacts/checksums.txt', `${traversal.join('\n')}\n`);
  await rejects(verify, 'unsafe checksum entry');
  await reset();

  const permuted = checksum.toString('utf8').trimEnd().split('\n').reverse();
  await writeFile('artifacts/checksums.txt', `${permuted.join('\n')}\n`);
  await rejects(verify, 'unsafe checksum entry');
  await reset();

  const falseSbom = JSON.parse(sbom); falseSbom.name = 'false';
  await writeFile('artifacts/sbom.json', canonicalJson(falseSbom));
  await rejects(verify, 'false SBOM identity');
  await reset();

  await rejects(() => run(['scripts/verify-release.mjs']), 'use the exact governed verification contract');
} finally {
  await writeFile('LICENSE', license);
  await writeFile('artifacts/skill-archive.json', skill);
  await writeFile('artifacts/source-archive.json', source);
  await writeFile('artifacts/checksums.txt', checksum);
  await writeFile('artifacts/sbom.json', sbom);
}
console.log(canonicalJson({ reasonCode:'RELEASE_NEGATIVES_VALIDATED' }));
