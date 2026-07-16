import { execFile as execFileCallback } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--python' || args[2] !== '--validator' || !args[1] || !args[3] || args[1].length > 4096 || args[3].length > 4096) throw new Error('SKILL_VALIDATOR_CLI_INVALID');
const python = resolve(args[1]); const validator = resolve(args[3]);
const skill = resolve(process.cwd(), 'skill/tcrn-workflow-helper');
for (const path of [python, validator]) { const info = await lstat(await realpath(path)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('SKILL_VALIDATOR_PATH_INVALID'); }
const { stderr, stdout } = await execFile(python, [validator, skill], { cwd:process.cwd() });
if (stderr) process.stderr.write(stderr);
process.stdout.write(stdout);
