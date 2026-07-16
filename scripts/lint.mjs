import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const roots=['bootstrap','scripts','test'];
for (const root of roots) for (const entry of await readdir(root,{withFileTypes:true})) if(entry.isFile()&&entry.name.endsWith('.mjs')) { const text=await readFile(resolve(root,entry.name),'utf8'); if(text.includes('\t')||text.includes('TO' + 'DO')) throw new Error(`lint failure: ${root}/${entry.name}`); }
console.log('lint ok');
