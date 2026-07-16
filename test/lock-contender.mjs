import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, installArchive } from '../bootstrap/trusted-bootstrap.mjs';

const input = JSON.parse(process.env.TCRN_LOCK_CONTENDER_INPUT ?? '{}');
const barrier = process.env.TCRN_LOCK_CONTENDER_BARRIER;
const deadline = Date.now() + Number(process.env.TCRN_LOCK_CONTENDER_TIMEOUT_MS ?? 10000);
async function waitFor(name) { for (;;) { try { await access(join(barrier, name)); return; } catch { if (Date.now() >= deadline) throw new Error('TEST_BARRIER_TIMEOUT'); await new Promise(done => setTimeout(done, 5)); } } }
try {
  if (!barrier) throw new Error('TEST_BARRIER_TIMEOUT');
  await writeFile(join(barrier, `ready-${process.pid}`), String(process.pid), { flag:'wx', mode:0o600 });
  await waitFor('start');
  console.log(canonicalJson(await installArchive({ ...input, faultAt:'hold-before-lock-link' })));
} catch (error) {
  console.error(canonicalJson({ code:error.code ?? null, ok:false, reasonCode:error.message === 'TEST_BARRIER_TIMEOUT' ? 'TEST_BARRIER_TIMEOUT' : error.reasonCode ?? 'INTERNAL_ERROR' }));
  process.exitCode = 1;
}
