// Local backup: exports the whole D1 database to a .sql file on THIS computer.
//   npm run backup            (production)
//   npm run backup:staging    (staging)
// Keeps the newest 12 files. Store a second copy on a USB drive or another computer.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const staging = process.argv.includes('--staging');
const envArgs = staging ? ['--env', 'staging'] : [];
const name = staging ? 'staging' : 'production';
const dir = process.env.BACKUP_DIR || 'backups';
const keep = Number(process.env.BACKUP_KEEP || 12);
const shell = process.platform === 'win32';

mkdirSync(dir, { recursive: true });
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).replace(' ', '_').replace(/:/g, '-');
const out = path.join(dir, `magdiwang-${name}-${stamp}.sql`);

const run = (args) => spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell });
console.log(`Exporting ${name} database to ${out} ...`);
if (run(['d1', 'export', 'DB', '--remote', '--output', out, ...envArgs]).status !== 0) {
  console.error('Backup FAILED. Nothing was saved.');
  process.exit(1);
}

// let the admin dashboard know a backup was taken
const mark = path.join(dir, '.mark.sql');
writeFileSync(mark, "INSERT INTO app_meta (key, value) VALUES ('last_backup_at', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value;\n");
run(['d1', 'execute', 'DB', '--remote', '--file', mark, ...envArgs]);
unlinkSync(mark);

const old = readdirSync(dir).filter((f) => f.startsWith(`magdiwang-${name}-`) && f.endsWith('.sql')).sort().reverse().slice(keep);
for (const f of old) unlinkSync(path.join(dir, f));
console.log(`Done. ${old.length ? `Removed ${old.length} old backup(s). ` : ''}Copy the file to a second location (USB drive / another computer).`);
