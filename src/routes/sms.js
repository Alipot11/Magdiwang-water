import { Hono } from 'hono';
import { ADMIN_ONLY } from '../middleware.js';
import { fail, parseId } from '../lib/util.js';
import { getSmsState, sendQueued } from '../lib/sms.js';

const sms = new Hono();
sms.use('*', ADMIN_ONLY);
const STATUSES = ['pending', 'submitted', 'delivered', 'failed', 'error'];

// The SMS log. Phone numbers are masked in the list.
sms.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1);
  const limit = 25;
  if (!Number.isInteger(page) || page < 1) return fail(c, 400, 'Invalid page.');
  const status = STATUSES.includes(c.req.query('status')) ? c.req.query('status') : null;
  const db = c.env.DB;
  const [rows, total] = await db.batch([
    db.prepare(`SELECT s.sms_id, s.kind, s.status, s.gateway_state, s.attempts, s.error, s.body, s.created_at, s.meter_id,
                       substr(s.phone, 1, 6) || '***' || substr(s.phone, -4) AS phone_masked, c.first_name, c.last_name
                FROM sms_outbox s JOIN customers c ON c.meter_id = s.meter_id
                WHERE (?1 IS NULL OR s.status = ?1) ORDER BY s.sms_id DESC LIMIT ?2 OFFSET ?3`).bind(status, limit, (page - 1) * limit),
    db.prepare('SELECT COUNT(*) n FROM sms_outbox WHERE (?1 IS NULL OR status = ?1)').bind(status),
  ]);
  const n = total.results[0].n;
  return c.json({ success: true, messages: rows.results, pagination: { page, limit, total: n, totalPages: Math.ceil(n / limit) } });
});

// Ask the gateway what happened to a submitted message.
sms.post('/:id/refresh', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid message.');
  const db = c.env.DB;
  const row = await db.prepare('SELECT status, gateway_message_id FROM sms_outbox WHERE sms_id = ?').bind(id).first();
  if (!row) return fail(c, 404, 'Message not found.');
  if (row.status !== 'submitted' || !row.gateway_message_id) return fail(c, 400, 'Only submitted messages can be refreshed.');
  const r = await getSmsState(c.env, row.gateway_message_id);
  if (!r.ok) return fail(c, 502, r.error);
  const status = r.state === 'Delivered' ? 'delivered' : r.state === 'Failed' ? 'failed' : 'submitted';
  await db.prepare(`UPDATE sms_outbox SET status = ?, gateway_state = ?, error = ?, updated_at = datetime('now') WHERE sms_id = ?`)
    .bind(status, r.state, status === 'failed' ? 'The phone or carrier reported a failure.' : null, id).run();
  return c.json({ success: true, status, state: r.state });
});

// Retry a failed message with its saved text.
sms.post('/:id/retry', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid message.');
  const db = c.env.DB;
  const s = await db.prepare(
    `SELECT s.kind, s.status, s.bill_id, s.payment_id, s.body, c.meter_id, c.first_name, c.last_name, c.phone, c.sms_opt_in, p.voided_at
     FROM sms_outbox s JOIN customers c ON c.meter_id = s.meter_id LEFT JOIN payments p ON p.payment_id = s.payment_id
     WHERE s.sms_id = ?`
  ).bind(id).first();
  if (!s) return fail(c, 404, 'Message not found.');
  if (!['failed', 'error'].includes(s.status)) return fail(c, 400, 'Only failed messages can be retried.');
  if (!s.phone || !s.sms_opt_in) return fail(c, 400, 'This customer has no mobile number or has not agreed to SMS.');
  if (s.voided_at) return fail(c, 400, 'That receipt was voided, so it cannot be texted.');
  const out = await sendQueued(db, c.env, c.get('user'), {
    kind: s.kind, refId: s.kind === 'bill' ? s.bill_id : s.payment_id, meterId: s.meter_id, first: s.first_name, last: s.last_name,
    phone: s.phone, body: s.body, what: s.kind === 'bill' ? `Bill #${s.bill_id}` : `Payment #${s.payment_id}`,
  });
  return out.ok ? c.json({ success: true }) : fail(c, out.code, out.error);
});

export default sms;