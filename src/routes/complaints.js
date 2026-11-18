import { Hono } from 'hono';
import { ADMIN_ONLY } from '../middleware.js';
import { BARANGAYS, COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from '../lib/constants.js';
import { fail, readJson, cleanText, parseId, parseMeterId, normName, rateLimit, getIP, auditStmt } from '../lib/util.js';

const complaints = new Hono();

// Public: anyone can submit. Unmatched submissions are kept and flagged.
complaints.post('/', async (c) => {
  const db = c.env.DB;
  const body = await readJson(c);
  if (!body) return fail(c, 400, 'Invalid request.', { code: 'invalid' });
  if (!(await rateLimit(db, `complaint:ip:${getIP(c)}`, 5, 3600))) return fail(c, 429, 'Too many submissions.', { code: 'rate_limited' });

  const first = cleanText(body.first_name);
  const last = cleanText(body.last_name);
  const meter = parseMeterId(body.meter_id);
  const message = cleanText(body.message, { min: 10, max: 1000, multiline: true });
  if (!first || !last || !meter || !BARANGAYS.includes(body.barangay) || !COMPLAINT_CATEGORIES.includes(body.category) || !message) {
    return fail(c, 400, 'Please complete every field. The details must be at least 10 characters.', { code: 'invalid' });
  }

  const match = await db.prepare('SELECT 1 AS ok FROM customers WHERE meter_id = ? AND first_name_norm = ? AND last_name_norm = ?')
    .bind(meter, normName(first), normName(last)).first();
  await db.prepare(
    `INSERT INTO complaints (first_name, last_name, barangay, meter_id, category, message, matched) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(first, last, body.barangay, meter, body.category, message, match ? 1 : 0).run();
  return c.json({ success: true }, 201);
});

// Admin only below.
complaints.get('/', ADMIN_ONLY, async (c) => {
  const status = COMPLAINT_STATUSES.includes(c.req.query('status')) ? c.req.query('status') : null;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM complaints WHERE (?1 IS NULL OR status = ?1) ORDER BY (status = 'resolved'), created_at DESC LIMIT 200`
  ).bind(status).all();
  return c.json({ success: true, complaints: results });
});

complaints.patch('/:id', ADMIN_ONLY, async (c) => {
  const id = parseId(c.req.param('id'));
  const body = await readJson(c);
  if (!id || !body || !COMPLAINT_STATUSES.includes(body.status)) return fail(c, 400, 'Choose a status.');
  const notes = body.admin_notes ? cleanText(body.admin_notes, { min: 1, max: 1000, multiline: true }) : null;
  if (body.admin_notes && !notes) return fail(c, 400, 'Notes can be up to 1000 characters.');
  const db = c.env.DB;
  const userId = c.get('user').user_id;
  const res = await db.batch([
    db.prepare(`UPDATE complaints SET status = ?, admin_notes = ?, updated_at = datetime('now'), updated_by = ? WHERE complaint_id = ?`)
      .bind(body.status, notes, userId, id),
  ]);
  if (res[0].meta.changes === 0) return fail(c, 404, 'Complaint not found.');
  await db.batch([auditStmt(db, { userId, action: 'UPDATE', table: 'complaints', recordId: id, description: `Complaint #${id} set to ${body.status}` })]);
  return c.json({ success: true });
});

export default complaints;
