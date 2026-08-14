import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const documentPath = fileURLToPath(new URL('../skill/tcrn-workflow-helper/references/install-surface-wizard.md', import.meta.url));

test('candidate.42 installation surface has all five languages and both fixed operations', async () => {
  const text = await readFile(documentPath, 'utf8');
  const phrases = [
    ['en', 'Help me install TCRN Workflow', 'Help me update TCRN Workflow'],
    ['zh-CN', '帮我安装 TCRN Workflow', '帮我更新 TCRN Workflow'],
    ['ja', 'TCRN Workflow をインストールして', 'TCRN Workflow を更新して'],
    ['ko', 'TCRN Workflow 설치해 줘', 'TCRN Workflow 업데이트해 줘'],
    ['fr', 'Aide-moi à installer TCRN Workflow', 'Aide-moi à mettre à jour TCRN Workflow'],
  ];
  for (const [language, install, update] of phrases) {
    assert.ok(text.includes('| ' + language + ' | ' + install + ' | ' + update + ' |'));
  }
  assert.match(text, /matching-language confirmation/u);
  assert.match(text, /ambiguous reply, stop with no write/u);
  assert.match(text, /both Claude and Codex adapters/u);
});

test('candidate.42 similar requests are examples only and cover two per language', async () => {
  const text = await readFile(documentPath, 'utf8');
  const rows = [
    ['en', 'install the workflow', 'can you set up TCRN Workflow'],
    ['zh-CN', '帮我安装 workflow', '升级 workflow'],
    ['ja', 'workflow をインストールして', 'TCRN Workflow を更新して'],
    ['ko', 'workflow 설치해 줘', 'TCRN Workflow 업그레이드해 줘'],
    ['fr', 'installe le workflow', 'peux-tu mettre à jour TCRN Workflow'],
  ];
  for (const [language, first, second] of rows) {
    assert.ok(text.includes('| ' + language + ' | ' + first + '；' + second + ' |'));
  }
  assert.match(text, /Similar requests are intent signals, not commands/u);
  assert.match(text, /does not write a control tree/u);
});

test('candidate.42 preflights engine capability before the install manifest', async () => {
  const text = await readFile(documentPath, 'utf8');
  assert.match(text, /before reading[\s\S]*`install-manifest`/u);
  assert.match(text, /`v0\.11\.16` or newer/u);
  assert.match(text, /ENGINE_CAPABILITY_PREFLIGHT_REQUIRED/u);
  assert.match(text, /CLI_UNKNOWN/u);
  assert.match(text, /do not write a receipt/u);
});
