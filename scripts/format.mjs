import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const roots = ['.github', 'bootstrap', 'manifests', 'scripts', 'skill', 'test'];
const extensions = new Set(['.json', '.md', '.mjs', '.yaml']);

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (entry.isFile() && [...extensions].some(extension => entry.name.endsWith(extension))) output.push(path);
  }
  return output;
}

for (const root of roots) for (const path of await files(root)) {
  const text = await readFile(path, 'utf8');
  if (!text.endsWith('\n') || text.includes('\r') || text.includes('\t') || text.split('\n').some(line => /[ \t]+$/.test(line))) throw new Error(`FORMAT_INVALID:${path}`);
}
console.log('format ok');
