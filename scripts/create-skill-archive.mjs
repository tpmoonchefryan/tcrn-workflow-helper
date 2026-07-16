import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = process.cwd(); const skillPrefix = 'skill/tcrn-workflow-helper/';
function parse(argv) {
  if (argv.length === 2 && argv[0] === '--check' && argv[1] && !argv[1].startsWith('--')) return { check:true, output:resolve(repositoryRoot, argv[1]) };
  if (argv.length === 2 && argv[0] === '--output' && argv[1] && !argv[1].startsWith('--')) return { output:resolve(repositoryRoot, argv[1]) };
  throw new Error('ARCHIVE_CLI_INVALID');
}
const sha = value => createHash('sha256').update(value).digest('hex');
async function trackedSkillFiles() {
  const listed = (await execFile('git', ['ls-files', '-z', '--full-name'], { cwd:repositoryRoot, maxBuffer:8 * 1024 * 1024 })).stdout.split('\u0000').filter(Boolean);
  const files = [...new Set(listed)].filter(path => path.startsWith(skillPrefix)).sort();
  if (files.length === 0) throw new Error('tracked Skill set is empty');
  for (const path of files) { if (path.includes('\\')) throw new Error('non-portable Skill path'); const info = await lstat(resolve(repositoryRoot, path)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('non-regular Skill entry'); }
  return files;
}
const options = parse(process.argv.slice(2));
const entries = [];
for (const file of await trackedSkillFiles()) { const content = await readFile(resolve(repositoryRoot, file)); entries.push({ contentBase64:content.toString('base64'), path:file.slice(skillPrefix.length), sha256:sha(content), type:'file' }); } entries.sort((one, two) => one.path < two.path ? -1 : one.path > two.path ? 1 : 0);
if (!entries.some(entry => entry.path === 'SKILL.md')) throw new Error('SKILL.md missing');
const archive = canonicalJson({ entries, schemaVersion:'tcrn.workflow.helper.archive.v1' });
if (options.check) { if (!(await readFile(options.output)).equals(Buffer.from(archive))) throw new Error('skill archive does not match fresh canonical reconstruction'); } else { await mkdir(dirname(options.output), { recursive:true }); await writeFile(options.output, archive, { mode:0o600 }); }
console.log(sha(archive));
