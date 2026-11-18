import { Hono } from 'hono';
import { ADMIN_ONLY } from '../middleware.js';
import { fail, parseMeterId } from '../lib/util.js';

const audit = new Hono();
audit.use('*', ADMIN_ONLY);

audit.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1);
  const limit = Number(c.req.query('limit') || 25);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return fail(c, 400, 'Invalid page.');
  const meter = c.req.query('meter_id') ? parseMeterId(c.req.query('meter_id')) : null;
  if (c.req.query('meter_id') && !meter) return fail(c, 400, 'Invalid meter number.');
  const action = (c.req.query('action') || '').toUpperCase().replace(/[^A-Z]/g, '') || null;
  const db = c.env.DB;
  const where = '(?1 IS NULL OR a.meter_id = ?1) AND (?2 IS NULL OR a.action = ?2)';
  const [logs, total] = await db.batch([
    db.prepare(`SELECT a.audit_id, u.username, u.full_name, a.meter_id, a.owner_first_name, a.owner_last_name, a.action, a.table_name,
                       a.record_id, a.description, a.created_at
                FROM audit_logs a JOIN admin_users u ON u.user_id = a.user_id WHERE ${where}
                ORDER BY a.audit_id DESC LIMIT ?3 OFFSET ?4`).bind(meter, action, limit, (page - 1) * limit),
    db.prepare(`SELECT COUNT(*) n FROM audit_logs a WHERE ${where}`).bind(meter, action),
  ]);
  const n = total.results[0].n;
  return c.json({ success: true, logs: logs.results, pagination: { page, limit, total: n, totalPages: Math.ceil(n / limit) } });
});

export default audit;
