import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const root = process.cwd(); const excluded = path => path === 'artifacts' || path.startsWith('artifacts/');
const outputIndex = process.argv.indexOf('--output'); const checkIndex = process.argv.indexOf('--check');
if ((outputIndex >= 0) === (checkIndex >= 0) || process.argv.length !== 4) throw new Error('use exactly one of --output <artifact> or --check <artifact>');
const artifact = resolve(root, process.argv[(outputIndex >= 0 ? outputIndex : checkIndex) + 1]);
const sha = value => createHash('sha256').update(value).digest('hex');
async function trackedFiles() {
  const listed = (await execFile('git', ['ls-files', '-z', '--full-name'], { cwd:root, maxBuffer:8 * 1024 * 1024 })).stdout.split('\u0000').filter(Boolean);
  const files = [...new Set(listed)].filter(path => !excluded(path)).sort();
  if (files.length === 0) throw new Error('tracked source set is empty');
  for (const path of files) { const info = await lstat(resolve(root, path)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('non-regular source entry'); }
  return files;
}
const entries = []; for (const file of await trackedFiles()) { if (file.includes('\\')) throw new Error('non-portable source path'); const content = await readFile(resolve(root, file)); entries.push({ contentBase64:content.toString('base64'), path:file, sha256:sha(content), type:'file' }); } entries.sort((one, two) => one.path < two.path ? -1 : one.path > two.path ? 1 : 0);
const archive = canonicalJson({ schemaVersion:'tcrn.workflow.helper.source-archive.v2', entries });
if (!entries.some(entry => entry.path === 'package.json')) throw new Error('package missing');
if (checkIndex >= 0) { if (!(await readFile(artifact)).equals(Buffer.from(archive))) throw new Error('source archive does not match fresh canonical reconstruction'); } else { await mkdir(dirname(artifact), { recursive:true }); await writeFile(artifact, archive); }
console.log(sha(archive));
