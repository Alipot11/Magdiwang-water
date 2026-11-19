import { Hono } from 'hono';
import { ALL_STAFF } from '../middleware.js';
import { fail, readJson, parseId, parseWholePesos, isDate, todayPH, scopeBarangay, cleanText } from '../lib/util.js';
import { sendQueued, paymentMessage } from '../lib/sms.js';

const payments = new Hono();
payments.use('*', ALL_STAFF);

// Record a payment. One atomic batch:
//  1) make sure this year's receipt counter exists
//  2) insert the payment ONLY IF the bill is in scope and the amount fits the remaining balance
//     (receipt number = counter + 1)
//  3) bump the counter ONLY IF step 2 inserted a row -> receipt numbers have no gaps
// The audit row is written by a database trigger.
payments.post('/', async (c) => {
  const body = await readJson(c);
  const billId = parseId(String(body?.bill_id ?? ''));
  const amount = parseWholePesos(body?.amount_paid, { min: 1 });
  if (!body || !billId) return fail(c, 400, 'Choose a bill.');
  if (amount === null) return fail(c, 400, 'Amount must be a whole number of pesos, greater than zero.');
  if (!isDate(body.payment_date)) return fail(c, 400, 'Enter a valid payment date.');
  const today = todayPH();
  if (body.payment_date > today) return fail(c, 400, 'The payment date cannot be in the future.');

  const db = c.env.DB;
  const user = c.get('user');
  const scope = scopeBarangay(user, null);
  const year = Number(today.slice(0, 4));

  const res = await db.batch([
    db.prepare('INSERT OR IGNORE INTO receipt_counters (year, last_no) VALUES (?, 0)').bind(year),
    db.prepare(
      `INSERT INTO payments (receipt_no, bill_id, payment_date, amount_paid, created_by)
       SELECT 'OR-' || CAST(?1 AS INTEGER) || '-' || printf('%06d', rc.last_no + 1), b.bill_id, ?2, ?3, ?4
       FROM bills b
       JOIN customers c ON c.meter_id = b.meter_id
       JOIN receipt_counters rc ON rc.year = ?1
       WHERE b.bill_id = ?5 AND c.is_active = 1 AND (?6 IS NULL OR c.barangay = ?6)
         AND ?3 <= b.bill_amount - COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.bill_id = b.bill_id AND p.voided_at IS NULL), 0)`
    ).bind(year, body.payment_date, amount, user.user_id, billId, scope),
    db.prepare(
      `UPDATE receipt_counters SET last_no = last_no + 1
       WHERE year = ?1 AND EXISTS (
       SELECT 1 FROM payments WHERE receipt_no = 'OR-' || CAST(?1 AS INTEGER) || '-' || printf('%06d', receipt_counters.last_no + 1))`
    ).bind(year),
  ]);

  if (res[1].meta.changes === 0) {
    const bill = await db.prepare(
      `SELECT bb.balance, c.is_active FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id
       WHERE bb.bill_id = ? AND (? IS NULL OR c.barangay = ?)`
    ).bind(billId, scope, scope).first();
    if (!bill) return fail(c, 404, 'Bill not found.');
    if (!bill.is_active) return fail(c, 409, 'This account is inactive. Ask an administrator to reactivate it before recording payments.');
    return fail(c, 400, bill.balance === 0 ? 'This bill is already fully paid.' : `The payment is more than the remaining balance of ₱${bill.balance}.`);
  }

  const row = await db.prepare('SELECT receipt_no FROM payments WHERE payment_id = ?').bind(res[1].meta.last_row_id).first();
  return c.json({ success: true, payment_id: res[1].meta.last_row_id, receipt_no: row.receipt_no }, 201);
});

// Void any payment in your scope (barangay for treasurer/staff, everything for admin). Reason required.
payments.post('/:id/void', async (c) => {
  const id = parseId(c.req.param('id'));
  const body = await readJson(c);
  const reason = cleanText(body?.reason, { min: 3, max: 300 });
  if (!id) return fail(c, 400, 'Invalid payment.');
  if (!reason) return fail(c, 400, 'Give a reason for voiding (3 to 300 characters).');
  const user = c.get('user');
  const scope = scopeBarangay(user, null);
  const res = await c.env.DB.prepare(
    `UPDATE payments SET voided_at = datetime('now'), voided_by = ?1, void_reason = ?2
     WHERE payment_id = ?3 AND voided_at IS NULL
       AND (?4 IS NULL OR bill_id IN (SELECT b.bill_id FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE c.barangay = ?4))`
  ).bind(user.user_id, reason, id, scope).run();
  if (res.meta.changes === 0) return fail(c, 404, 'Payment not found, or it is already voided.');
  return c.json({ success: true });
});

// Manual SMS for a receipt. One SMS row per payment; failed attempts can be retried.
payments.post('/:id/sms', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid payment.');
  const db = c.env.DB;
  const user = c.get('user');
  const scope = scopeBarangay(user, null);

  const p = await db.prepare(
    `SELECT pd.payment_id, pd.receipt_no, pd.amount_paid, pd.billing_period, pd.meter_id, pd.voided_at,
            bb.balance AS bill_balance, c.first_name, c.last_name, c.phone, c.sms_opt_in
     FROM payment_details pd
     JOIN bill_balances bb ON bb.bill_id = pd.bill_id
     JOIN customers c ON c.meter_id = pd.meter_id
     WHERE pd.payment_id = ? AND (? IS NULL OR pd.barangay = ?)`
  ).bind(id, scope, scope).first();
  if (!p) return fail(c, 404, 'Receipt not found.');
  if (p.voided_at) return fail(c, 400, 'A voided receipt cannot be texted.');
  if (!p.phone) return fail(c, 400, 'This customer has no mobile number on file.');
  if (!p.sms_opt_in) return fail(c, 400, 'This customer has not agreed to receive SMS.');

    const out = await sendQueued(db, c.env, user, {
    kind: 'payment', refId: id, meterId: p.meter_id, first: p.first_name, last: p.last_name,
    phone: p.phone, body: paymentMessage(p), what: `Receipt ${p.receipt_no}`,
  });
  return out.ok ? c.json({ success: true, status: 'submitted' }) : fail(c, out.code, out.error);
});

// Data for the printable receipt.
payments.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid payment.');
  const scope = scopeBarangay(c.get('user'), null);
  const row = await c.env.DB.prepare(
    `SELECT pd.*, bb.balance AS bill_balance, bb.status AS bill_status
     FROM payment_details pd JOIN bill_balances bb ON bb.bill_id = pd.bill_id
     WHERE pd.payment_id = ? AND (? IS NULL OR pd.barangay = ?)`
  ).bind(id, scope, scope).first();
  if (!row) return fail(c, 404, 'Receipt not found.');
  return c.json({ success: true, payment: row });
});

export default payments;
