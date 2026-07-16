import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const execFile = promisify(execFileCallback);
const helper = fileURLToPath(new URL('./generate-checksums.py', import.meta.url));
const maximumReceiptBytes = 4096;

function fail(reasonCode) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  throw error;
}

function receipt(value) {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 1 || value.reasonCode !== 'CHECKSUMS_GENERATED') fail('CHECKSUM_GENERATION_FAILED');
  return value;
}

function failure(stderr) {
  try {
    const value = JSON.parse(stderr);
    if (typeof value?.reasonCode === 'string' && /^[A-Z0-9_]+$/.test(value.reasonCode)) fail(value.reasonCode);
  } catch (error) {
    if (error?.reasonCode) throw error;
  }
  fail('CHECKSUM_GENERATION_FAILED');
}

export async function generateChecksums({ root = process.cwd() } = {}) {
  const resolvedRoot = resolve(root);
  let result;
  try {
    result = await execFile('/usr/bin/python3', ['-I', '-S', '-B', helper, resolvedRoot], {
      encoding:'utf8',
      maxBuffer:maximumReceiptBytes,
      windowsHide:true,
    });
  } catch (error) {
    failure(String(error?.stderr ?? ''));
  }
  if (result.stderr !== '') fail('CHECKSUM_GENERATION_FAILED');
  if (Buffer.byteLength(result.stdout, 'utf8') > maximumReceiptBytes || !result.stdout.endsWith('\n')) fail('CHECKSUM_GENERATION_FAILED');
  let value;
  try { value = JSON.parse(result.stdout); } catch { fail('CHECKSUM_GENERATION_FAILED'); }
  if (canonicalJson(value) !== result.stdout) fail('CHECKSUM_GENERATION_FAILED');
  return receipt(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) fail('CHECKSUM_CLI_INVALID');
    process.stdout.write(canonicalJson(await generateChecksums()));
  } catch (error) {
    process.stderr.write(canonicalJson({ reasonCode:error?.reasonCode ?? 'CHECKSUM_GENERATION_FAILED' }));
    process.exitCode = 1;
  }
}
