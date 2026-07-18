import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalJson } from '../bootstrap/trusted-bootstrap.mjs';

const document = canonicalJson({
  SPDXID:'SPDXRef-DOCUMENT',
  creationInfo:{ created:'1970-01-01T00:00:00Z', creators:['Tool: tcrn-workflow-helper'] },
  dataLicense:'CC0-1.0',
  documentDescribes:['SPDXRef-Package-tcrn-workflow-helper'],
  documentNamespace:'https://github.com/tpmoonchefryan/tcrn-workflow-helper/spdx/tcrn-workflow-helper-0.1.0-candidate.4',
  name:'tcrn-workflow-helper-0.1.0-candidate.4',
  packages:[{ SPDXID:'SPDXRef-Package-tcrn-workflow-helper', copyrightText:'NOASSERTION', downloadLocation:'NOASSERTION', filesAnalyzed:false, licenseConcluded:'Apache-2.0', licenseDeclared:'Apache-2.0', name:'tcrn-workflow-helper', versionInfo:'0.1.0-candidate.4' }],
  relationships:[],
  spdxVersion:'SPDX-2.3',
});
if (process.argv.length === 4 && process.argv[2] === '--output') { const output = resolve(process.cwd(), process.argv[3]); await mkdir(dirname(output), { recursive:true }); await writeFile(output, document); } else if (process.argv.length === 2) process.stdout.write(document); else throw new Error('use --output <artifact> or no arguments');
