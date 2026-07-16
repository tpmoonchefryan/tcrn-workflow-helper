import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workflowDirectory = resolve(process.cwd(), '.github/workflows');
const workflowPath = resolve(workflowDirectory, 'ci.yml');
const expectedCommands = [
  'npm run verify:ci-workflow',
  'npm run format',
  'npm run lint',
  'npm run typecheck',
  'npm run archive',
  'npm run build',
  'npm run checksums',
  'npm test',
  'npm run verify',
  'npm run artifacts:repro',
  'npm run ci:replay',
];
const expectedActionPins = new Set([
  'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
]);

const entries = (await readdir(workflowDirectory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
assert.deepEqual(entries.map(entry => [entry.name, entry.isFile()]), [['ci.yml', true]], 'CI_WORKFLOW_SET_INVALID');
const text = await readFile(workflowPath, 'utf8');
assert.ok(text.endsWith('\n') && !text.includes('\r') && !text.includes('\t'), 'CI_WORKFLOW_FORMAT_INVALID');
assert.match(text, /^name: helper-ci\n\non:\n  pull_request:\n  push:\n    branches:\n      - main\n  workflow_dispatch:\n/m, 'CI_TRIGGER_INVALID');
assert.match(text, /^permissions:\n  contents: read\n/m, 'CI_PERMISSIONS_INVALID');
assert.match(text, /^concurrency:\n  group: helper-ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false\n/m, 'CI_CONCURRENCY_INVALID');
assert.match(text, /^    timeout-minutes: 60\n/m, 'CI_TIMEOUT_INVALID');
assert.match(text, /fetch-depth: 0/, 'CI_FETCH_DEPTH_INVALID');
assert.match(text, /persist-credentials: false/, 'CI_CREDENTIAL_PERSISTENCE_INVALID');
assert.match(text, /node-version: 24\.16\.0/, 'CI_NODE_VERSION_INVALID');
assert.match(text, /test "\$\(node --version\)" = "v24\.16\.0"/, 'CI_NODE_ASSERTION_INVALID');
assert.ok(!text.includes('pull_request_target') && !/\bnpm\s+(?:ci|install)\b/u.test(text) && !/\b(?:pnpm|yarn)\s+(?:install|add)\b/u.test(text), 'CI_UNSAFE_STEP');
const pins = [...text.matchAll(/^\s*- uses: ([^\s]+)$/gmu)].map(match => match[1]);
assert.deepEqual(new Set(pins), expectedActionPins, 'CI_ACTION_PIN_INVALID');
assert.ok(pins.every(pin => /@[a-f0-9]{40}$/u.test(pin)), 'CI_ACTION_UNPINNED');
const commands = [...text.matchAll(/^          (npm[^\r\n]+)$/gmu)].map(match => match[1]);
assert.deepEqual(commands, expectedCommands, 'CI_COMMAND_SET_INVALID');
console.log('HELPER_CI_WORKFLOW_POLICY_VALIDATED');
