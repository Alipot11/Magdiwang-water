import { Hono } from 'hono';
import { ALL_STAFF } from '../middleware.js';
import { fail, isDate, todayPH, scopeBarangay } from '../lib/util.js';

const reports = new Hono();
reports.use('*', ALL_STAFF);

// Daily collection report / cash close-out.
reports.get('/daily', async (c) => {
  const date = c.req.query('date') || todayPH();
  if (!isDate(date)) return fail(c, 400, 'Enter a valid date.');
  const scope = scopeBarangay(c.get('user'), c.req.query('barangay'));
  const { results } = await c.env.DB.prepare(
    `SELECT payment_id, receipt_no, meter_id, first_name, last_name, barangay, billing_period, amount_paid, received_by, voided_at, void_reason
     FROM payment_details WHERE payment_date = ? AND (? IS NULL OR barangay = ?) ORDER BY payment_id`
  ).bind(date, scope, scope).all();

  const valid = results.filter((p) => !p.voided_at);
  const byUser = {};
  for (const p of valid) {
    byUser[p.received_by] ??= { received_by: p.received_by, count: 0, total: 0 };
    byUser[p.received_by].count++;
    byUser[p.received_by].total += p.amount_paid;
  }
  return c.json({
    success: true, date, scope, payments: valid, voided: results.filter((p) => p.voided_at),
    total: valid.reduce((s, p) => s + p.amount_paid, 0), by_user: Object.values(byUser),
  });
});

export default reports;
