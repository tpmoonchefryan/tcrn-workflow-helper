import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Recursive, and rooted at 'skill' too: the create-skill-archive twin shipped inside the
// Skill used to sit outside lint and typecheck entirely, so a defect in it would be
// signed into the archive unexamined.
const roots=['bootstrap','scripts','skill','test'];
async function lintTree(root){ for (const entry of await readdir(root,{withFileTypes:true})) { const path=`${root}/${entry.name}`; if(entry.isDirectory()){ await lintTree(path); continue; } if(!entry.isFile()||!entry.name.endsWith('.mjs')) continue; const text=await readFile(resolve(path),'utf8'); if(text.includes('\t')||text.includes('TO' + 'DO')) throw new Error(`lint failure: ${path}`); } }
for (const root of roots) await lintTree(root);
console.log('lint ok');
