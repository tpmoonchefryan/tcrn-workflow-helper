#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowRoot = resolve(root, '..', 'tcrn-workflow');
const workflowRepository = 'https://github.com/tpmoonchefryan/tcrn-workflow.git';
const anchorDocuments = ['README.md', 'README.zh-CN.md', 'README.ja.md', 'README.ko.md', 'README.fr.md', 'SECURITY.md'];
const readmeDocuments = anchorDocuments.filter(path => path.startsWith('README.'));
const skillPrefix = 'skill/tcrn-workflow-helper/';
const sourceArchiveSchema = 'tcrn.workflow.helper.source-archive.v2';
const skillArchiveSchema = 'tcrn.workflow.helper.archive.v1';
const sha256 = value => createHash('sha256').update(value).digest('hex');

class RepinError extends Error {
  constructor(reasonCode, message = reasonCode) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

function fail(reasonCode, message = reasonCode) {
  throw new RepinError(reasonCode, message);
}

async function git(args, cwd = workflowRoot) {
  try {
    const result = await execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return result.stdout;
  } catch (error) {
    fail('REPIN_GIT_COMMAND_FAILED', `${cwd}:${args.join(' ')}:${String(error?.stderr ?? error?.message ?? '')}`.slice(0, 1000));
  }
}

async function gitTrim(args, cwd = workflowRoot) {
  return (await git(args, cwd)).trim();
}

async function trackedFiles() {
  const listed = (await git(['ls-files', '-z', '--full-name'], root)).split('\u0000').filter(Boolean);
  if (listed.length === 0) fail('REPIN_SOURCE_SET_EMPTY');
  return [...new Set(listed)].sort();
}

async function regularBytes(path) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    fail('REPIN_INPUT_MISSING', path);
  }
  if (!info.isFile() || info.isSymbolicLink()) fail('REPIN_INPUT_NOT_REGULAR', path);
  return readFile(path);
}

function replaceOnce(text, pattern, replacement, label) {
  const matches = text.match(pattern);
  if (matches === null || matches.length !== 1) fail('REPIN_SOURCE_SHAPE_INVALID', label);
  return text.replace(pattern, replacement);
}

function fullSha(value, label) {
  if (!/^[0-9a-f]{40}$/u.test(value)) fail('REPIN_IDENTITY_INVALID', `${label}:${value}`);
  return value;
}

function readIdentity(bootstrapText) {
  const repository = bootstrapText.match(/repository: '([^']+)'/u)?.[1];
  const version = bootstrapText.match(/version: '(v[^']+)'/u)?.[1];
  const commit = bootstrapText.match(/commit: '([0-9a-f]{40})'/u)?.[1];
  const tree = bootstrapText.match(/tree: '([0-9a-f]{40})'/u)?.[1];
  const tagObject = bootstrapText.match(/tagObject: '([0-9a-f]{40})'/u)?.[1];
  if (!repository || !version || !commit || !tree || !tagObject) fail('REPIN_IDENTITY_UNREADABLE');
  return { repository, version, commit: fullSha(commit, 'commit'), tree: fullSha(tree, 'tree'), tagObject: fullSha(tagObject, 'tagObject') };
}

function provenanceMatches(bytes, tag) {
  try {
    const document = JSON.parse(bytes.toString('utf8'));
    const parameters = document?.predicate?.buildDefinition?.externalParameters;
    return parameters?.tag === tag && parameters?.version === tag.slice(1);
  } catch {
    return false;
  }
}

async function provenanceForTag(tag, commit) {
  const localPath = resolve(workflowRoot, 'dist/release/provenance.json');
  let localHead = null;
  try { localHead = await gitTrim(['rev-parse', 'HEAD']); } catch { /* tag resolution below owns the failure */ }
  if (localHead === commit) {
    try {
      const bytes = await regularBytes(localPath);
      if (provenanceMatches(bytes, tag)) return bytes;
    } catch { /* generate from the tag checkout below */ }
  }

  let temporary;
  try {
    temporary = await mkdtemp(join(tmpdir(), 'tcrn-workflow-repin-'));
    await git(['clone', '--quiet', '--no-local', '--no-hardlinks', workflowRoot, temporary], root);
    await git(['remote', 'set-url', 'origin', workflowRepository], temporary);
    await git(['checkout', '--quiet', '--detach', tag], temporary);
    const dependencies = resolve(workflowRoot, 'node_modules');
    try { await lstat(dependencies); await cp(dependencies, resolve(temporary, 'node_modules'), { recursive: true, force: true }); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      fail('REPIN_ENGINE_DEPENDENCIES_UNAVAILABLE', dependencies);
    }
    await execFile('pnpm', ['verify:p8'], {
      cwd: temporary,
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', npm_config_offline: 'true' },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const bytes = await regularBytes(resolve(temporary, 'dist/release/provenance.json'));
    if (!provenanceMatches(bytes, tag)) fail('REPIN_PROVENANCE_IDENTITY_MISMATCH', tag);
    return bytes;
  } catch (error) {
    if (error instanceof RepinError) throw error;
    fail('REPIN_PROVENANCE_BUILD_FAILED', String(error?.stderr ?? error?.message ?? error).slice(0, 1000));
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

async function archiveBytes(files, prefix, schema, planned) {
  const entries = [];
  for (const path of files) {
    const bytes = planned.get(path) ?? await regularBytes(resolve(root, path));
    entries.push({ contentBase64: bytes.toString('base64'), path: prefix === null ? path : path.slice(prefix.length), sha256: sha256(bytes), type: 'file' });
  }
  entries.sort((one, two) => one.path < two.path ? -1 : one.path > two.path ? 1 : 0);
  return Buffer.from(canonicalJson({ entries, schemaVersion: schema }));
}

function replaceReadmeVersions(bytes, oldTag, newTag, oldHelperVersion, newHelperVersion, path) {
  const lines = bytes.toString('utf8').split('\n');
  let pinnedLines = 0;
  let statusLines = 0;
  const output = lines.map(line => {
    if (!line.includes(`TCRN Workflow \`${oldTag}\``)) return line;
    pinnedLines += 1;
    let next = line.replaceAll(`TCRN Workflow \`${oldTag}\``, `TCRN Workflow \`${newTag}\``);
    if (/`\d+\.\d+\.\d+[^`]*`/u.test(line) && /`v\d+\.\d+[^`]*`/u.test(line)) {
      statusLines += 1;
      next = next.replace(`\`${oldHelperVersion}\``, `\`${newHelperVersion}\``);
    }
    return next;
  }).join('\n');
  if (pinnedLines !== 2 || statusLines !== 1) fail('REPIN_README_VERSION_SHAPE_INVALID', `${path}:${pinnedLines}:${statusLines}`);
  return Buffer.from(output);
}

function replaceAnchor(bytes, oldDigest, newDigest, path) {
  const text = bytes.toString('utf8');
  const count = text.split(oldDigest).length - 1;
  if (count !== 1) fail('REPIN_ANCHOR_SHAPE_INVALID', `${path}:${count}`);
  return Buffer.from(text.replace(oldDigest, newDigest));
}

async function buildPlan(tag) {
  if (!/^v\d+\.\d+\.\d+$/u.test(tag)) fail('REPIN_TAG_INVALID', tag);
  const tagType = await gitTrim(['cat-file', '-t', tag]);
  if (tagType !== 'tag') fail('REPIN_TAG_NOT_ANNOTATED', tag);
  const commit = fullSha(await gitTrim(['rev-parse', '--verify', `${tag}^{commit}`]), 'commit');
  const tree = fullSha(await gitTrim(['rev-parse', '--verify', `${tag}^{tree}`]), 'tree');
  const tagObject = fullSha(await gitTrim(['rev-parse', '--verify', `${tag}^{tag}`]), 'tagObject');
  const packageDocument = JSON.parse((await git(['show', `${tag}:package.json`])).trim());
  const helperVersion = packageDocument.version;
  if (helperVersion !== tag.slice(1)) fail('REPIN_ENGINE_VERSION_MISMATCH', `${tag}:${helperVersion}`);

  const bootstrapPath = resolve(root, 'bootstrap/trusted-bootstrap.mjs');
  const bootstrapBytes = await regularBytes(bootstrapPath);
  const oldBootstrapDigest = sha256(bootstrapBytes);
  const oldIdentity = readIdentity(bootstrapBytes.toString('utf8'));
  const oldHelperPackage = JSON.parse((await regularBytes(resolve(root, 'package.json'))).toString('utf8'));
  if (typeof oldHelperPackage.version !== 'string') fail('REPIN_HELPER_VERSION_UNREADABLE');
  const provenanceBytes = await provenanceForTag(tag, commit);
  const planned = new Map();
  const bootstrapText = bootstrapBytes.toString('utf8');
  const identityBlock = `export const IDENTITY = Object.freeze({\n  repository: '${workflowRepository}', version: '${tag}',\n  commit: '${commit}', tree: '${tree}',\n  tagObject: '${tagObject}',\n});`;
  let nextBootstrap = replaceOnce(bootstrapText, /export const IDENTITY = Object\.freeze\(\{[\s\S]*?\n\}\);/u, identityBlock, 'bootstrap IDENTITY');
  nextBootstrap = replaceOnce(nextBootstrap, /export const EXPECTED_ARCHIVE_SHA256 = '[0-9a-f]{64}';/u, "export const EXPECTED_ARCHIVE_SHA256 = '__ARCHIVE__';", 'bootstrap archive digest');
  nextBootstrap = replaceOnce(nextBootstrap, /export const EXPECTED_PROVENANCE_SHA256 = '[0-9a-f]{64}';/u, `export const EXPECTED_PROVENANCE_SHA256 = '${sha256(provenanceBytes)}';`, 'bootstrap provenance digest');

  const packagePath = resolve(root, 'package.json');
  const packageText = await regularBytes(packagePath).then(bytes => bytes.toString('utf8'));
  const nextPackage = replaceOnce(packageText, /"version":\s*"[^"]+"/u, `"version": "${helperVersion}"`, 'helper package version');
  planned.set('package.json', Buffer.from(nextPackage));
  const skillPath = 'skill/tcrn-workflow-helper/SKILL.md';
  const skillText = (await regularBytes(resolve(root, skillPath))).toString('utf8');
  planned.set(skillPath, Buffer.from(replaceOnce(skillText, /Supports TCRN Workflow `v[^`]+`/u, `Supports TCRN Workflow \`${tag}\``, 'Skill support version')));
  const contractPath = 'skill/tcrn-workflow-helper/references/trust-contract.md';
  const contractText = (await regularBytes(resolve(root, contractPath))).toString('utf8');
  const contractIdentity = `The accepted Workflow release is repository\n\`${workflowRepository}\`, version \`${tag}\`,\ncommit \`${commit}\`, tree\n\`${tree}\`, and tag object\n\`${tagObject}\`.`;
  planned.set(contractPath, Buffer.from(replaceOnce(contractText, /The accepted Workflow release is repository\n`[^`]+`, version `[^`]+`,\ncommit `[0-9a-f]{40}`, tree\n`[0-9a-f]{40}`, and tag object\n`[0-9a-f]{40}`\./u, contractIdentity, 'trust contract identity')));
  planned.set('manifests/complete-skill-archive.provenance.json', provenanceBytes);

  for (const path of readmeDocuments) planned.set(path, replaceReadmeVersions(await regularBytes(resolve(root, path)), oldIdentity.version, tag, oldHelperPackage.version, helperVersion, path));

  const skillFiles = (await trackedFiles()).filter(path => path.startsWith(skillPrefix));
  if (skillFiles.length === 0) fail('REPIN_SKILL_SET_EMPTY');
  const skillArchive = await archiveBytes(skillFiles, skillPrefix, skillArchiveSchema, planned);
  nextBootstrap = nextBootstrap.replace('__ARCHIVE__', sha256(skillArchive));
  const finalBootstrap = Buffer.from(nextBootstrap);
  const finalAnchor = sha256(finalBootstrap);
  for (const path of anchorDocuments) {
    const current = planned.get(path) ?? await regularBytes(resolve(root, path));
    const anchored = replaceAnchor(current, oldBootstrapDigest, finalAnchor, path);
    planned.set(path, anchored);
  }
  planned.set('bootstrap/trusted-bootstrap.mjs', finalBootstrap);
  planned.set('artifacts/skill-archive.json', skillArchive);
  const sourceFiles = (await trackedFiles()).filter(path => path !== 'artifacts' && !path.startsWith('artifacts/'));
  const sourceArchive = await archiveBytes(sourceFiles, null, sourceArchiveSchema, planned);
  planned.set('artifacts/source-archive.json', sourceArchive);
  const candidate = Buffer.from(canonicalJson({
    schemaVersion: 'tcrn.workflow.helper.candidate-manifest.v2',
    skillArchiveSha256: sha256(skillArchive),
    sourceArchiveSha256: sha256(sourceArchive),
    workflow: { commit, repository: workflowRepository, tagObject, tree, version: tag },
  }));
  planned.set('artifacts/candidate-manifest.json', candidate);
  const sbom = await regularBytes(resolve(root, 'artifacts/sbom.json'));
  const checksums = Buffer.from(`${sha256(sbom)}  sbom.json\n${sha256(skillArchive)}  skill-archive.json\n${sha256(sourceArchive)}  source-archive.json\n`);
  planned.set('artifacts/checksums.txt', checksums);
  return { commit, tree, tagObject, tag, planned, finalAnchor };
}

async function applyPlan(plan) {
  const paths = [...plan.planned.keys()].sort();
  for (const path of paths) await writeFile(resolve(root, path), plan.planned.get(path));
  return paths;
}

async function main() {
  if (process.argv.length !== 3) fail('REPIN_CLI_INVALID', 'use exactly one engine tag');
  const plan = await buildPlan(process.argv[2]);
  const changed = await applyPlan(plan);
  process.stdout.write(canonicalJson({ ok: true, reasonCode: 'REPIN_APPLIED', tag: plan.tag, commit: plan.commit, tree: plan.tree, tagObject: plan.tagObject, bootstrapSha256: plan.finalAnchor, files: changed }));
}

try {
  await main();
} catch (error) {
  process.stderr.write(canonicalJson({ ok: false, reasonCode: error?.reasonCode ?? 'REPIN_FAILED', detail: String(error?.message ?? error) }));
  process.exitCode = 1;
}
