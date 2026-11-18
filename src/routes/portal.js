import { Hono } from 'hono';
import { fail, readJson, cleanText, parseMeterId, normName, rateLimit, getIP } from '../lib/util.js';

const portal = new Hono();

// Resident lookup: meter number + first name + last name must all match one registered customer.
// Wrong meter and wrong name return the SAME answer so nobody can probe which meters exist.
portal.post('/lookup', async (c) => {
  const db = c.env.DB;
  const body = await readJson(c);
  if (!body) return fail(c, 400, 'Invalid request.', { code: 'invalid' });

  const meter = parseMeterId(body.meter_id);
  const first = cleanText(body.first_name);
  const last = cleanText(body.last_name);

  const okIp = await rateLimit(db, `portal:ip:${getIP(c)}`, 20, 900);
  const okMeter = meter ? await rateLimit(db, `portal:meter:${meter}`, 10, 900) : true;
  if (!okIp || !okMeter) return fail(c, 429, 'Too many attempts.', { code: 'rate_limited' });

  const customer = meter && first && last
    ? await db.prepare(
        `SELECT meter_id, first_name, last_name, is_active FROM customers
         WHERE meter_id = ? AND first_name_norm = ? AND last_name_norm = ?`
      ).bind(meter, normName(first), normName(last)).first()
    : null;
  if (!customer) return fail(c, 404, 'No matching account.', { code: 'not_found' });

  const [bills, pays] = await db.batch([
    db.prepare(`SELECT bill_id, billing_period, pre_reading, curr_reading, tcmeter, amount, surcharge, bill_amount,
                       duedate, total_paid, balance, status
                FROM bill_balances WHERE meter_id = ? ORDER BY billing_period DESC LIMIT 24`).bind(meter),
    db.prepare(`SELECT receipt_no, payment_date, amount_paid, billing_period
                FROM payment_details WHERE meter_id = ? AND voided_at IS NULL ORDER BY payment_id DESC LIMIT 50`).bind(meter),
  ]);
  return c.json({ success: true, customer, bills: bills.results, payments: pays.results });
});

export default portal;
