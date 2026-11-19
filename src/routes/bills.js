import { Hono } from 'hono';
import { ADMIN_ONLY, ALL_STAFF } from '../middleware.js';
import { BARANGAYS } from '../lib/constants.js';
import { sendQueued, billMessage } from '../lib/sms.js';
import { fail, readJson, parseMeterId, parseId, parseWholePesos, isDate, isPeriod, scopeBarangay } from '../lib/util.js';

const bills = new Hono();
const MAX_ROWS = 50;   // keeps each request well inside D1's per-invocation query limits

// Active customers with no bill yet for the period, with the previous reading filled in.
bills.get('/sheet', ADMIN_ONLY, async (c) => {
  const period = c.req.query('period');
  if (!isPeriod(period)) return fail(c, 400, 'Choose a billing month.');
  const barangay = BARANGAYS.includes(c.req.query('barangay')) ? c.req.query('barangay') : null;
  const { results } = await c.env.DB.prepare(
    `SELECT c.meter_id, c.first_name, c.last_name, c.barangay, c.sitio,
            (SELECT b.curr_reading FROM bills b WHERE b.meter_id = c.meter_id AND b.billing_period < ?1
             ORDER BY b.billing_period DESC LIMIT 1) AS prev_reading,
            o.owed, o.owed_from, o.owed_to
     FROM customers c
     LEFT JOIN (SELECT meter_id, SUM(balance) AS owed, MIN(billing_period) AS owed_from, MAX(billing_period) AS owed_to
                FROM bill_balances WHERE balance > 0 AND billing_period < ?1 GROUP BY meter_id) o ON o.meter_id = c.meter_id
     WHERE c.is_active = 1 AND (?2 IS NULL OR c.barangay = ?2)
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.meter_id = c.meter_id AND b.billing_period = ?1)
     ORDER BY c.barangay, c.last_name_norm, c.first_name_norm LIMIT 500`
  ).bind(period, barangay).all();
  return c.json({ success: true, rows: results });
});

// Post up to 50 bills at once. The server computes consumption and totals itself.
bills.post('/bulk', ADMIN_ONLY, async (c) => {
  const body = await readJson(c);
  if (!body || !isPeriod(body.period) || !isDate(body.duedate) || !Array.isArray(body.rows)) {
    return fail(c, 400, 'Choose a billing month and a due date.');
  }
  if (body.rows.length < 1 || body.rows.length > MAX_ROWS) return fail(c, 400, `Send between 1 and ${MAX_ROWS} bills per request.`);
  const db = c.env.DB;
  const userId = c.get('user').user_id;

  const meters = body.rows.map((r) => parseMeterId(r?.meter_id));
  const known = meters.filter(Boolean);
  const prevMap = new Map();
  if (known.length) {
    const marks = known.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT c.meter_id,
              (SELECT b.curr_reading FROM bills b WHERE b.meter_id = c.meter_id AND b.billing_period < ?
               ORDER BY b.billing_period DESC LIMIT 1) AS prev
       FROM customers c WHERE c.meter_id IN (${marks})`
    ).bind(body.period, ...known).all();
    for (const r of results) prevMap.set(r.meter_id, r.prev);
  }

  const results = [];
  const stmts = [];
  const stmtIndex = [];
  body.rows.forEach((row, i) => {
    const meter = meters[i];
    const err = (message) => results.push({ meter_id: meter ?? row?.meter_id ?? null, ok: false, message });
    if (!meter) return err('Invalid meter number.');
    if (!prevMap.has(meter)) return err('Meter number not found.');
    const prevOnFile = prevMap.get(meter);
    const pre = prevOnFile ?? parseWholePesos(row.pre_reading);   // first bill: starting reading comes from the form
    const curr = parseWholePesos(row.curr_reading);
    const amount = parseWholePesos(row.amount);
    const surcharge = row.surcharge === '' || row.surcharge == null ? 0 : parseWholePesos(row.surcharge);
    if (pre === null) return err('Enter the previous reading (this is the first bill).');
    if (curr === null) return err('Current reading must be a whole number.');
    if (curr < pre) return err(`Current reading (${curr}) is lower than the previous reading (${pre}).`);
    if (amount === null) return err('Amount must be a whole number of pesos.');
    if (surcharge === null) return err('Surcharge must be a whole number of pesos.');
    stmtIndex.push(results.length);
    results.push({ meter_id: meter, ok: null });
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO bills (meter_id, billing_period, pre_reading, curr_reading, tcmeter, amount, surcharge, bill_amount, duedate, posted_by)
       SELECT meter_id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM customers WHERE meter_id = ? AND is_active = 1`
    ).bind(body.period, pre, curr, curr - pre, amount, surcharge, amount + surcharge, body.duedate, userId, meter));
  });

  if (stmts.length) {
    const out = await db.batch(stmts);
    out.forEach((r, k) => {
      const slot = results[stmtIndex[k]];
      slot.ok = r.meta.changes > 0;
      if (!slot.ok) slot.message = 'Not posted: already billed for this month, or the account is inactive.';
    });
  }
  return c.json({ success: true, posted: results.filter((r) => r.ok).length, results });
});

// Data for the printable bill / statement: one bill, or every bill of a period.
bills.get('/print', ALL_STAFF, async (c) => {
  const scope = scopeBarangay(c.get('user'), c.req.query('barangay'));
  const billId = c.req.query('bill_id');
  const sql = `SELECT bb.*, c.first_name, c.last_name, c.barangay, c.sitio
               FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id
               WHERE (? IS NULL OR c.barangay = ?)`;
  let stmt;
  if (billId !== undefined) {
    const id = parseId(billId);
    if (!id) return fail(c, 400, 'Invalid bill.');
    stmt = c.env.DB.prepare(`${sql} AND bb.bill_id = ?`).bind(scope, scope, id);
  } else if (isPeriod(c.req.query('period'))) {
    stmt = c.env.DB.prepare(`${sql} AND bb.billing_period = ? ORDER BY c.barangay, c.last_name_norm, c.first_name_norm LIMIT 300`)
      .bind(scope, scope, c.req.query('period'));
  } else return fail(c, 400, 'Choose a bill or a billing month.');
  const { results } = await stmt.all();
  return c.json({ success: true, bills: results });
});

// Bills of a month with each customer's SMS status (for the "Send bill SMS" panel).
bills.get('/sms', ADMIN_ONLY, async (c) => {
  const period = c.req.query('period');
  if (!isPeriod(period)) return fail(c, 400, 'Choose a billing month.');
  const barangay = BARANGAYS.includes(c.req.query('barangay')) ? c.req.query('barangay') : null;
  const { results } = await c.env.DB.prepare(
    `SELECT bb.bill_id, bb.meter_id, bb.bill_amount, bb.balance, c.first_name, c.last_name, c.barangay, c.phone, c.sms_opt_in, s.status AS sms_status
     FROM bill_balances bb
     JOIN customers c ON c.meter_id = bb.meter_id
     LEFT JOIN sms_outbox s ON s.bill_id = bb.bill_id
     WHERE bb.billing_period = ?1 AND (?2 IS NULL OR c.barangay = ?2)
     ORDER BY c.barangay, c.last_name_norm, c.first_name_norm LIMIT 300`
  ).bind(period, barangay).all();
  return c.json({ success: true, bills: results });
});

// Manual SMS for one bill.
bills.post('/:id/sms', ADMIN_ONLY, async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid bill.');
  const b = await c.env.DB.prepare(
    `SELECT bb.bill_id, bb.meter_id, bb.billing_period, bb.tcmeter, bb.bill_amount, bb.duedate, bb.balance,
            c.first_name, c.last_name, c.phone, c.sms_opt_in
     FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id WHERE bb.bill_id = ?`
  ).bind(id).first();
  if (!b) return fail(c, 404, 'Bill not found.');
  if (!b.phone) return fail(c, 400, 'This customer has no mobile number on file.');
  if (!b.sms_opt_in) return fail(c, 400, 'This customer has not agreed to receive SMS.');
  if (b.balance <= 0) return fail(c, 400, 'This bill is already paid.');
  const out = await sendQueued(c.env.DB, c.env, c.get('user'), {
    kind: 'bill', refId: id, meterId: b.meter_id, first: b.first_name, last: b.last_name,
    phone: b.phone, body: billMessage(b, c.env.PORTAL_URL), what: `Bill #${id}`,
  });
  return out.ok ? c.json({ success: true, status: 'submitted' }) : fail(c, out.code, out.error);
});

export default bills;
