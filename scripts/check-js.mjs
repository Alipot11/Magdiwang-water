// Syntax-checks every .js/.mjs file in src, public and scripts.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(f) && files.push(p); } };
['src', 'public', 'scripts', 'test'].forEach(walk);
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(`FAIL ${f}\n${r.stderr}`); }
}
console.log(bad ? `${bad} file(s) failed.` : `OK: ${files.length} files passed the syntax check.`);
process.exit(bad ? 1 : 0);
