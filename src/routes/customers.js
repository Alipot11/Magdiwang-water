import { Hono } from 'hono';
import { ALL_STAFF, ADMIN_ONLY } from '../middleware.js';
import { BARANGAYS } from '../lib/constants.js';
import { fail, readJson, cleanText, parseMeterId, parsePhone, normName, scopeBarangay, auditStmt } from '../lib/util.js';

const customers = new Hono();

function validate(body) {
  const first_name = cleanText(body.first_name);
  const last_name = cleanText(body.last_name);
  const sitio = cleanText(body.sitio);
  if (!first_name || !last_name) return { error: 'Enter the first and last name (up to 100 characters each).' };
  if (!BARANGAYS.includes(body.barangay)) return { error: 'Choose a barangay.' };
  if (!sitio) return { error: 'Enter the sitio (up to 100 characters).' };
    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  let phone = null;
  if (rawPhone) {
    phone = parsePhone(rawPhone);
    if (!phone) return { error: 'Enter a Philippine mobile number such as 09171234567.' };
  }
  const sms_opt_in = body.sms_opt_in === true ? 1 : 0;
  if (sms_opt_in && !phone) return { error: 'Enter a mobile number to turn on SMS, or untick the SMS box.' };
  return { value: { first_name, last_name, barangay: body.barangay, sitio, phone, sms_opt_in } };
}

customers.get('/', ALL_STAFF, async (c) => {
  const user = c.get('user');
  const scope = scopeBarangay(user, c.req.query('barangay'));
  const includeInactive = user.role === 'admin' && c.req.query('inactive') === '1';
  const q = (c.req.query('q') || '').trim().slice(0, 100);

  const where = ['(? IS NULL OR c.barangay = ?)'];
  const params = [scope, scope];
  if (!includeInactive) where.push('c.is_active = 1');
  if (q) {
    const like = `%${normName(q).replace(/[\\%_]/g, '\\$&')}%`;
    const meter = parseMeterId(q);
    where.push(`(${meter ? 'c.meter_id = ? OR ' : ''}c.first_name_norm LIKE ? ESCAPE '\\' OR c.last_name_norm LIKE ? ESCAPE '\\'
      OR (c.first_name_norm || ' ' || c.last_name_norm) LIKE ? ESCAPE '\\')`);
    if (meter) params.push(meter);
    params.push(like, like, like);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT c.meter_id, c.first_name, c.last_name, c.barangay, c.sitio, c.phone, c.sms_opt_in, c.is_active, COALESCE(bb.balance, 0) AS balance
     FROM customers c
     LEFT JOIN (SELECT meter_id, SUM(balance) AS balance FROM bill_balances GROUP BY meter_id) bb ON bb.meter_id = c.meter_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.last_name_norm, c.first_name_norm LIMIT 50`
  ).bind(...params).all();
  return c.json({ success: true, customers: results });
});

customers.get('/:id', ALL_STAFF, async (c) => {
  const id = parseMeterId(c.req.param('id'));
  if (!id) return fail(c, 400, 'Invalid meter number.');
  const db = c.env.DB;
  const scope = scopeBarangay(c.get('user'), null);
  const [cust, bills, payments] = await db.batch([
    db.prepare('SELECT meter_id, first_name, last_name, barangay, sitio,phone, sms_opt_in, is_active FROM customers WHERE meter_id = ? AND (? IS NULL OR barangay = ?)').bind(id, scope, scope),
    db.prepare('SELECT * FROM bill_balances WHERE meter_id = ? ORDER BY billing_period DESC LIMIT 36').bind(id),
    db.prepare(`SELECT payment_id, receipt_no, payment_date, amount_paid, billing_period, bill_id, received_by, voided_at, void_reason,
                   (SELECT s.status FROM sms_outbox s WHERE s.payment_id = payment_details.payment_id) AS sms_status
            FROM payment_details WHERE meter_id = ? ORDER BY payment_id DESC LIMIT 60`).bind(id),
  ]);
  if (!cust.results.length) return fail(c, 404, 'Account not found.');
  return c.json({ success: true, customer: cust.results[0], bills: bills.results, payments: payments.results });
});

customers.post('/', ADMIN_ONLY, async (c) => {
  const body = await readJson(c);
  const meter = parseMeterId(body?.meter_id);
  if (!body || !meter) return fail(c, 400, 'Enter a valid meter number.');
  const v = validate(body);
  if (v.error) return fail(c, 400, v.error);
  const { first_name, last_name, barangay, sitio, phone, sms_opt_in } = v.value;
  const db = c.env.DB;
  try {
    await db.batch([
       db.prepare(`INSERT INTO customers (meter_id, first_name, last_name, first_name_norm, last_name_norm, barangay, sitio, phone, sms_opt_in)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(meter, first_name, last_name, normName(first_name), normName(last_name), barangay, sitio, phone, sms_opt_in),
      auditStmt(db, { userId: c.get('user').user_id, meterId: meter, first: first_name, last: last_name, action: 'CREATE',
        table: 'customers', recordId: meter, description: `Customer account created for meter ${meter} (${barangay})` }),
    ]);
  } catch (err) {
    if (String(err?.message).includes('customers.meter_id')) return fail(c, 409, 'A customer with this meter number already exists.');
    throw err;
  }
  return c.json({ success: true }, 201);
});

customers.put('/:id', ADMIN_ONLY, async (c) => {
  const id = parseMeterId(c.req.param('id'));
  const body = await readJson(c);
  if (!id || !body) return fail(c, 400, 'Invalid request.');
  const v = validate(body);
  if (v.error) return fail(c, 400, v.error);
  const { first_name, last_name, barangay, sitio, phone, sms_opt_in } = v.value;
  const db = c.env.DB;
  const old = await db.prepare('SELECT first_name, last_name, barangay, sitio, phone, sms_opt_in FROM customers WHERE meter_id = ?').bind(id).first();
  if (!old) return fail(c, 404, 'Customer account not found.');

  const changes = [];
  if (old.first_name !== first_name) changes.push('first name');
  if (old.last_name !== last_name) changes.push('last name');
  if (old.barangay !== barangay) changes.push('barangay');
  if (old.sitio !== sitio) changes.push('sitio');
  if (old.phone !== phone) changes.push('phone');
  if (old.sms_opt_in !== sms_opt_in) changes.push('SMS consent');
  if (!changes.length) return fail(c, 400, 'Nothing was changed.');

  await db.batch([
    db.prepare(`UPDATE customers SET first_name = ?, last_name = ?, first_name_norm = ?, last_name_norm = ?, barangay = ?, sitio = ?, phone = ?, sms_opt_in = ? WHERE meter_id = ?`)
      .bind(first_name, last_name, normName(first_name), normName(last_name), barangay, sitio, phone, sms_opt_in, id),
    auditStmt(db, { userId: c.get('user').user_id, meterId: id, first: first_name, last: last_name, action: 'UPDATE', table: 'customers', recordId: id,
      description: `Meter ${id} updated: ${changes.join(', ')}. Was "${old.first_name} ${old.last_name}", ${old.barangay}, ${old.sitio}` }),
  ]);
  return c.json({ success: true });
});

// Accounts with history are deactivated, never deleted.
customers.post('/:id/active', ADMIN_ONLY, async (c) => {
  const id = parseMeterId(c.req.param('id'));
  const body = await readJson(c);
  if (!id || typeof body?.active !== 'boolean') return fail(c, 400, 'Invalid request.');
  const db = c.env.DB;
  const cust = await db.prepare('SELECT first_name, last_name FROM customers WHERE meter_id = ?').bind(id).first();
  if (!cust) return fail(c, 404, 'Customer account not found.');
  await db.batch([
    db.prepare('UPDATE customers SET is_active = ? WHERE meter_id = ?').bind(body.active ? 1 : 0, id),
    auditStmt(db, { userId: c.get('user').user_id, meterId: id, first: cust.first_name, last: cust.last_name,
      action: body.active ? 'ACTIVATE' : 'DEACTIVATE', table: 'customers', recordId: id,
      description: `Customer account for meter ${id} ${body.active ? 'reactivated' : 'deactivated'}` }),
  ]);
  return c.json({ success: true });
});

export default customers;
