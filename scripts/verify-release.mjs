import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson, IDENTITY } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const root = process.cwd(); const sha = value => createHash('sha256').update(value).digest('hex');
const APACHE_LICENSE_SHA256 = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'; const expectedArtifacts = ['sbom.json', 'skill-archive.json', 'source-archive.json'];
const fail = message => { throw new Error(message); };
const sameStat = (one, two) => one.dev === two.dev && one.ino === two.ino && one.mode === two.mode && one.nlink === two.nlink && one.size === two.size && one.uid === two.uid && one.gid === two.gid && one.mtimeMs === two.mtimeMs && one.ctimeMs === two.ctimeMs && one.birthtimeMs === two.birthtimeMs;
async function boundedBytes(path, maximumBytes) { let before; try { before = await lstat(path); } catch { fail('artifact is not a bounded regular file'); } if (!before.isFile() || before.isSymbolicLink() || before.size > maximumBytes) fail('artifact is not a bounded regular file'); let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('artifact is not a bounded regular file'); } const chunks = []; let length = 0; try { const descriptorBefore = await handle.stat(); if (!sameStat(before, descriptorBefore)) fail('artifact replaced during read'); for (;;) { const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes - length + 1)); const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (bytesRead === 0) break; length += bytesRead; if (length > maximumBytes) fail('artifact exceeds byte budget'); chunks.push(buffer.subarray(0, bytesRead)); } const descriptorAfter = await handle.stat(); let after; try { after = await lstat(path); } catch { fail('artifact replaced during read'); } if (!sameStat(before, descriptorAfter) || !sameStat(before, after)) fail('artifact replaced during read'); return Buffer.concat(chunks); } finally { await handle.close(); } }
function json(bytes, label) { try { return JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes)); } catch { fail(`invalid ${label}`); } }
function safe(path) { if (typeof path !== 'string' || !path || !path.isWellFormed() || path !== path.normalize('NFC') || /[\u0000-\u001f\u007f-\u009f]/.test(path) || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) fail('unsafe archive path'); return path; }
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('invalid closed schema'); }
async function sourceFiles() { const listed = (await execFile('git', ['ls-files', '-z', '--full-name'], { cwd:root, maxBuffer:8 * 1024 * 1024 })).stdout.split('\u0000').filter(Boolean); const files = [...new Set(listed)].filter(path => path !== 'artifacts' && !path.startsWith('artifacts/')).sort(); if (files.length === 0) fail('tracked source set is empty'); for (const file of files) { const info = await lstat(resolve(root, file)); if (!info.isFile() || info.isSymbolicLink()) fail('non-regular source entry'); } return files.map(file => resolve(root, file)); }
async function verifyLicense(path) { if (sha(await boundedBytes(path, 128 * 1024)) !== APACHE_LICENSE_SHA256) fail('Apache-2.0 license bytes do not match canonical authority'); }
async function verifySbom(path) { const bytes = await boundedBytes(path, 1024 * 1024); const document = json(bytes, 'SBOM'); if (!Buffer.from(canonicalJson(document)).equals(bytes)) fail('noncanonical SBOM'); exact(document, ['SPDXID', 'creationInfo', 'dataLicense', 'documentDescribes', 'documentNamespace', 'name', 'packages', 'relationships', 'spdxVersion']); if (document.SPDXID !== 'SPDXRef-DOCUMENT' || document.spdxVersion !== 'SPDX-2.3' || document.dataLicense !== 'CC0-1.0' || document.name !== 'tcrn-workflow-helper-0.1.0-candidate.2' || document.documentNamespace !== 'https://github.com/tpmoonchefryan/tcrn-workflow-helper/spdx/tcrn-workflow-helper-0.1.0-candidate.2' || canonicalJson(document.documentDescribes) !== canonicalJson(['SPDXRef-Package-tcrn-workflow-helper']) || canonicalJson(document.relationships) !== canonicalJson([])) fail('false SBOM identity'); exact(document.creationInfo, ['created', 'creators']); if (document.creationInfo.created !== '1970-01-01T00:00:00Z' || canonicalJson(document.creationInfo.creators) !== canonicalJson(['Tool: tcrn-workflow-helper']) || document.packages.length !== 1) fail('false SBOM creation or dependency set'); const pkg = document.packages[0]; exact(pkg, ['SPDXID', 'copyrightText', 'downloadLocation', 'filesAnalyzed', 'licenseConcluded', 'licenseDeclared', 'name', 'versionInfo']); if (canonicalJson(pkg) !== canonicalJson({ SPDXID:'SPDXRef-Package-tcrn-workflow-helper', copyrightText:'NOASSERTION', downloadLocation:'NOASSERTION', filesAnalyzed:false, licenseConcluded:'Apache-2.0', licenseDeclared:'Apache-2.0', name:'tcrn-workflow-helper', versionInfo:'0.1.0-candidate.2' })) fail('false SBOM package'); }
async function verifyChecksums(path) { const text = new TextDecoder('utf-8', { fatal:true }).decode(await boundedBytes(path, 64 * 1024)); if (!text.endsWith('\n') || text.includes('\r')) fail('noncanonical checksum bytes'); const lines = text.slice(0, -1).split('\n'); if (lines.length !== expectedArtifacts.length) fail('incomplete checksum set'); const canonical = []; for (const [index, line] of lines.entries()) { const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line); if (!match || match[2] !== expectedArtifacts[index]) fail(`unsafe checksum entry: ${line}`); const artifact = resolve(dirname(path), match[2]); if (dirname(artifact) !== dirname(path) || sha(await boundedBytes(artifact, 16 * 1024 * 1024)) !== match[1]) fail(`bad checksum: ${line}`); canonical.push(`${match[1]}  ${match[2]}`); } if (text !== `${canonical.join('\n')}\n`) fail('noncanonical checksum bytes'); }
async function verifySource(path) {
  const archiveBytes = await boundedBytes(path, 16 * 1024 * 1024); const archive = json(archiveBytes, 'source archive');
  if (!Buffer.from(canonicalJson(archive)).equals(archiveBytes)) fail('invalid source archive');
  exact(archive, ['entries', 'schemaVersion']);
  if (archive.schemaVersion !== 'tcrn.workflow.helper.source-archive.v2' || !Array.isArray(archive.entries) || archive.entries.length > 4096) fail('invalid source archive');
  const temporary = await mkdtemp(resolve(os.tmpdir(), 'tcrn-helper-reconstruct-'));
  try {
    let total = 0; let previous = null; const paths = new Set(); const foldedPaths = new Set();
    for (const entry of archive.entries) {
      exact(entry, ['contentBase64', 'path', 'sha256', 'type']);
      if (entry.type !== 'file' || typeof entry.contentBase64 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || entry.contentBase64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.contentBase64)) fail('invalid source entry');
      const padding = entry.contentBase64.endsWith('==') ? 2 : entry.contentBase64.endsWith('=') ? 1 : 0;
      const decodedLength = entry.contentBase64.length / 4 * 3 - padding;
      if (!Number.isSafeInteger(decodedLength) || decodedLength > 8 * 1024 * 1024 - total) fail('source byte budget exceeded');
      const sourcePath = safe(entry.path); const foldedPath = sourcePath.toLocaleLowerCase('en-US');
      if (previous !== null && previous >= sourcePath || paths.has(sourcePath) || foldedPaths.has(foldedPath) || [...foldedPaths].some(existing => existing.startsWith(`${foldedPath}/`) || foldedPath.startsWith(`${existing}/`))) fail('duplicate source path');
      previous = sourcePath; paths.add(sourcePath); foldedPaths.add(foldedPath);
      const bytes = Buffer.from(entry.contentBase64, 'base64'); total += decodedLength;
      if (bytes.length !== decodedLength || bytes.toString('base64') !== entry.contentBase64 || sha(bytes) !== entry.sha256) fail('invalid source content');
      const output = resolve(temporary, sourcePath); if (relative(temporary, output).startsWith('..')) fail('escaped source entry');
      await mkdir(dirname(output), { recursive:true }); await writeFile(output, bytes, { flag:'wx' });
    }
    const current = await sourceFiles(); const expected = archive.entries.map(entry => entry.path); const actual = current.map(file => relative(root, file).replaceAll('\\', '/')).sort();
    if (canonicalJson(expected) !== canonicalJson(actual)) fail('source set mismatch');
    for (const file of current) { const pathName = relative(root, file).replaceAll('\\', '/'); if (Buffer.compare(await boundedBytes(file, 8 * 1024 * 1024), await boundedBytes(resolve(temporary, pathName), 8 * 1024 * 1024)) !== 0) fail(`source reconstruction mismatch: ${basename(file)}`); }
  } finally { await rm(temporary, { recursive:true, force:true }); }
}
async function verifyCandidateManifest() {
  const skillBytes = await boundedBytes(resolve(root, 'artifacts/skill-archive.json'), 16 * 1024 * 1024);
  const sourceBytes = await boundedBytes(resolve(root, 'artifacts/source-archive.json'), 16 * 1024 * 1024);
  const bytes = await boundedBytes(resolve(root, 'artifacts/candidate-manifest.json'), 64 * 1024);
  const document = json(bytes, 'candidate manifest');
  if (!Buffer.from(canonicalJson(document)).equals(bytes)) fail('noncanonical candidate manifest');
  exact(document, ['schemaVersion', 'skillArchiveSha256', 'sourceArchiveSha256', 'workflow']);
  exact(document.workflow, ['commit', 'repository', 'tagObject', 'tree', 'version']);
  if (document.schemaVersion !== 'tcrn.workflow.helper.candidate-manifest.v2' || document.skillArchiveSha256 !== sha(skillBytes) || document.sourceArchiveSha256 !== sha(sourceBytes) || document.workflow.repository !== IDENTITY.repository || document.workflow.version !== IDENTITY.version || document.workflow.commit !== IDENTITY.commit || document.workflow.tree !== IDENTITY.tree || document.workflow.tagObject !== IDENTITY.tagObject) fail('candidate manifest does not bind the release artifacts');
}
async function verifyTrustAnchor() {
  const skillBytes = await boundedBytes(resolve(root, 'artifacts/skill-archive.json'), 16 * 1024 * 1024);
  const provenanceBytes = await boundedBytes(resolve(root, 'manifests/complete-skill-archive.provenance.json'), 1024 * 1024);
  const manifestBytes = await boundedBytes(resolve(root, 'manifests/complete-skill-archive.manifest.json'), 64 * 1024);
  const policyBytes = await boundedBytes(resolve(root, 'manifests/complete-skill-archive.policy.json'), 64 * 1024);
  const manifest = json(manifestBytes, 'release manifest'); const policy = json(policyBytes, 'release policy');
  if (!Buffer.from(canonicalJson(manifest)).equals(manifestBytes) || !Buffer.from(canonicalJson(policy)).equals(policyBytes)) fail('noncanonical trust anchor');
  if (manifest.archiveSha256 !== sha(skillBytes) || policy.archiveSha256 !== sha(skillBytes) || manifest.provenanceSha256 !== sha(provenanceBytes) || policy.provenanceSha256 !== sha(provenanceBytes) || policy.manifestSha256 !== sha(canonicalJson(manifest))) fail('trust anchor does not bind the release artifacts');
}
const expected = ['--checksums', 'artifacts/checksums.txt', '--license', 'LICENSE', '--sbom', 'artifacts/sbom.json', '--source', 'artifacts/source-archive.json']; if (canonicalJson(process.argv.slice(2)) !== canonicalJson(expected)) fail('use the exact governed verification contract'); await verifyLicense(resolve(root, 'LICENSE')); await verifySbom(resolve(root, 'artifacts/sbom.json')); await verifyChecksums(resolve(root, 'artifacts/checksums.txt')); await verifySource(resolve(root, 'artifacts/source-archive.json')); await verifyCandidateManifest(); await verifyTrustAnchor(); console.log(canonicalJson({ reasonCode:'RELEASE_ARTIFACTS_VALIDATED' }));
