import { Hono } from 'hono';
import { ADMIN_ONLY } from '../middleware.js';
import { auditStmt, todayPH } from '../lib/util.js';

const backup = new Hono();
backup.use('*', ADMIN_ONLY);

const TABLES = ['customers', 'admin_users', 'bills', 'receipt_counters', 'payments', 'sms_outbox', 'complaints', 'audit_logs', 'app_meta'];

backup.get('/status', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_meta WHERE key = 'last_backup_at'").first();
  const last = row ? row.value : null;
  const days = last ? Math.floor((Date.now() - new Date(last.replace(' ', 'T') + 'Z').getTime()) / 864e5) : null;
  return c.json({ success: true, last_backup_at: last, days_since: days });
});

// Convenience download (JSON). The authoritative backup is the `npm run backup` SQL export.
backup.post('/download', async (c) => {
  const db = c.env.DB;
  const out = await db.batch(TABLES.map((t) => db.prepare(`SELECT * FROM ${t}`)));
  const tables = Object.fromEntries(TABLES.map((t, i) => [t, out[i].results]));
  await db.batch([
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('last_backup_at', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    auditStmt(db, { userId: c.get('user').user_id, action: 'BACKUP', table: 'database', description: 'Downloaded a JSON backup' }),
  ]);
  const body = JSON.stringify({ app: 'magdiwang-water', format: 1, environment: c.env.ENVIRONMENT || 'production', exported_at: new Date().toISOString(), tables });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="magdiwang-backup-${todayPH()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default backup;
