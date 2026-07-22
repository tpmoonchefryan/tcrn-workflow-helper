import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = process.cwd();
export const SKILL_ROOT = 'skill/';
export const SKILL_PREFIX = 'skill/tcrn-workflow-helper/';
const skillPrefix = SKILL_PREFIX;

// This archive represents exactly one skill subtree. Anything else tracked under
// skill/ it cannot represent, and the original builder simply filtered such paths
// away. That is a fail-open in trust machinery: a second skill directory left the
// archive digest — and so the pinned anchor — unchanged, verify-installed-copy
// passed over content it never saw, and prose that "looked like a trusted skill"
// shipped green having never been pinned. This returns those unrepresentable paths
// so the builder can fail closed on them. Pure over its input, so the guard is
// tested directly without a build.
export function unrepresentableSkillPaths(listed) {
  return [...new Set(listed)].filter(path => path.startsWith(SKILL_ROOT) && !path.startsWith(SKILL_PREFIX)).sort();
}
function parse(argv) {
  if (argv.length === 2 && argv[0] === '--check' && argv[1] && !argv[1].startsWith('--')) return { check:true, output:resolve(repositoryRoot, argv[1]) };
  if (argv.length === 2 && argv[0] === '--output' && argv[1] && !argv[1].startsWith('--')) return { output:resolve(repositoryRoot, argv[1]) };
  throw new Error('ARCHIVE_CLI_INVALID');
}
const sha = value => createHash('sha256').update(value).digest('hex');
async function trackedSkillFiles() {
  const listed = (await execFile('git', ['ls-files', '-z', '--full-name'], { cwd:repositoryRoot, maxBuffer:8 * 1024 * 1024 })).stdout.split('\u0000').filter(Boolean);
  const strays = unrepresentableSkillPaths(listed);
  if (strays.length > 0) throw new Error(`ARCHIVE_UNREPRESENTABLE: this single-skill archive is ${SKILL_PREFIX} only; refusing to silently drop tracked skill/ paths: ${strays.join(', ')}`);
  const files = [...new Set(listed)].filter(path => path.startsWith(skillPrefix)).sort();
  if (files.length === 0) throw new Error('tracked Skill set is empty');
  for (const path of files) { if (path.includes('\\')) throw new Error('non-portable Skill path'); const info = await lstat(resolve(repositoryRoot, path)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('non-regular Skill entry'); }
  return files;
}
async function build() {
  const options = parse(process.argv.slice(2));
  const entries = [];
  for (const file of await trackedSkillFiles()) { const content = await readFile(resolve(repositoryRoot, file)); entries.push({ contentBase64:content.toString('base64'), path:file.slice(skillPrefix.length), sha256:sha(content), type:'file' }); } entries.sort((one, two) => one.path < two.path ? -1 : one.path > two.path ? 1 : 0);
  if (!entries.some(entry => entry.path === 'SKILL.md')) throw new Error('SKILL.md missing');
  const archive = canonicalJson({ entries, schemaVersion:'tcrn.workflow.helper.archive.v1' });
  if (options.check) { if (!(await readFile(options.output)).equals(Buffer.from(archive))) throw new Error('skill archive does not match fresh canonical reconstruction'); } else { await mkdir(dirname(options.output), { recursive:true }); await writeFile(options.output, archive, { mode:0o600 }); }
  console.log(sha(archive));
}

// Build only as the entry point; importing this module (the guard test does) must
// not trigger a build or read argv.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
