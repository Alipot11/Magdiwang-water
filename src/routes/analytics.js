import { Hono } from 'hono';
import { ALL_STAFF } from '../middleware.js';
import { BARANGAYS } from '../lib/constants.js';
import { todayPH, lastPeriods, scopeBarangay } from '../lib/util.js';

const analytics = new Hono();
analytics.use('*', ALL_STAFF);

const BY = '(? IS NULL OR c.barangay = ?)';      // scope on customers c
const PD = '(? IS NULL OR pd.barangay = ?)';     // scope on payment_details pd

function fillMonths(periods, rows) {
  const m = new Map(rows.map((r) => [r.p, r.v]));
  return periods.map((p) => m.get(p) || 0);
}

// Admin: all barangays (or one). Treasurer/staff: their own barangay only.
analytics.get('/', async (c) => {
  const db = c.env.DB;
  const scope = scopeBarangay(c.get('user'), c.req.query('barangay'));
  const S = [scope, scope];
  const today = todayPH();
  const period = today.slice(0, 7);
  const periods = lastPeriods(12);
  const startDate = `${periods[0]}-01`;

  const out = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(b.bill_amount),0) v, COUNT(*) n FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.billing_period = ? AND ${BY}`).bind(period, ...S),
    db.prepare(`SELECT COALESCE(SUM(pd.amount_paid),0) v, COUNT(*) n FROM payment_details pd WHERE pd.voided_at IS NULL AND substr(pd.payment_date,1,7) = ? AND ${PD}`).bind(period, ...S),
    db.prepare(`SELECT COALESCE(SUM(bb.balance),0) v, COUNT(DISTINCT bb.meter_id) n FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id WHERE bb.balance > 0 AND ${BY}`).bind(...S),
    db.prepare(`SELECT COALESCE(SUM(bb.balance),0) v, COUNT(DISTINCT bb.meter_id) n FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id WHERE bb.balance > 0 AND bb.duedate < ? AND ${BY}`).bind(today, ...S),
    db.prepare(`SELECT COUNT(*) n FROM customers c WHERE c.is_active = 1 AND ${BY}`).bind(...S),
    db.prepare(`SELECT b.billing_period p, SUM(b.bill_amount) v FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.billing_period >= ? AND ${BY} GROUP BY b.billing_period`).bind(periods[0], ...S),
    db.prepare(`SELECT substr(pd.payment_date,1,7) p, SUM(pd.amount_paid) v FROM payment_details pd WHERE pd.voided_at IS NULL AND pd.payment_date >= ? AND ${PD} GROUP BY p`).bind(startDate, ...S),
    db.prepare(`SELECT b.billing_period p, SUM(b.tcmeter) v FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.billing_period >= ? AND ${BY} GROUP BY b.billing_period`).bind(periods[0], ...S),
    db.prepare(`SELECT pd.payment_date d, SUM(pd.amount_paid) v FROM payment_details pd WHERE pd.voided_at IS NULL AND substr(pd.payment_date,1,7) = ? AND ${PD} GROUP BY pd.payment_date`).bind(period, ...S),
    db.prepare(`SELECT c.meter_id, c.first_name, c.last_name, c.barangay, SUM(bb.balance) balance, COUNT(*) bills, MIN(bb.duedate) oldest_due
                FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id
                WHERE bb.balance > 0 AND bb.duedate < ? AND ${BY} GROUP BY c.meter_id ORDER BY balance DESC LIMIT 10`).bind(today, ...S),
  ]);
  const r = out.map((x) => x.results);

  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dailyMap = new Map(r[8].map((x) => [x.d, x.v]));
  const daily = Array.from({ length: Math.min(daysInMonth, Number(today.slice(8))) }, (_, i) => dailyMap.get(`${period}-${String(i + 1).padStart(2, '0')}`) || 0);

  let barangays = null;
  if (!scope) {
    const b = await db.batch([
      db.prepare('SELECT barangay, COUNT(*) n FROM customers WHERE is_active = 1 GROUP BY barangay'),
      db.prepare('SELECT c.barangay, SUM(b.bill_amount) v FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.billing_period = ? GROUP BY c.barangay').bind(period),
      db.prepare(`SELECT pd.barangay, SUM(pd.amount_paid) v FROM payment_details pd WHERE pd.voided_at IS NULL AND substr(pd.payment_date,1,7) = ? GROUP BY pd.barangay`).bind(period),
      db.prepare('SELECT c.barangay, SUM(bb.balance) v FROM bill_balances bb JOIN customers c ON c.meter_id = bb.meter_id WHERE bb.balance > 0 GROUP BY c.barangay'),
    ]).then((x) => x.map((y2) => new Map(y2.results.map((row) => [row.barangay, row.n ?? row.v]))));
    barangays = BARANGAYS.map((name) => ({
      barangay: name, customers: b[0].get(name) || 0, billed: b[1].get(name) || 0, collected: b[2].get(name) || 0, outstanding: b[3].get(name) || 0,
    }));
  }

  const billed = r[0][0].v;
  const collected = r[1][0].v;
  return c.json({
    success: true, scope, period, today,
    cards: {
      billed, billed_count: r[0][0].n, collected, collected_count: r[1][0].n,
      collection_rate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      outstanding: r[2][0].v, outstanding_accounts: r[2][0].n,
      overdue: r[3][0].v, overdue_accounts: r[3][0].n, active_customers: r[4][0].n,
    },
    months: { labels: periods, billed: fillMonths(periods, r[5]), collected: fillMonths(periods, r[6]), consumption: fillMonths(periods, r[7]) },
    daily,
    top_overdue: r[9],
    barangays,
  });
});

// "My activity": what the signed-in user did themselves.
analytics.get('/me', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const today = todayPH();
  const period = today.slice(0, 7);
  const since = new Date(Date.now() - 29 * 864e5);
  const sinceDate = todayPH(since);
  const out = await db.batch([
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount_paid),0) v FROM payments WHERE created_by = ? AND voided_at IS NULL AND substr(payment_date,1,7) = ?`).bind(user.user_id, period),
    db.prepare(`SELECT COUNT(*) n FROM payments WHERE voided_by = ? AND substr(voided_at,1,7) = ?`).bind(user.user_id, period),
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(bill_amount),0) v FROM bills WHERE posted_by = ? AND billing_period = ?`).bind(user.user_id, period),
    db.prepare(`SELECT payment_date d, SUM(amount_paid) v FROM payments WHERE created_by = ? AND voided_at IS NULL AND payment_date >= ? GROUP BY payment_date`).bind(user.user_id, sinceDate),
  ]);
  const r = out.map((x) => x.results);
  const map = new Map(r[3].map((x) => [x.d, x.v]));
  const days = Array.from({ length: 30 }, (_, i) => todayPH(new Date(since.getTime() + i * 864e5)));
  return c.json({
    success: true, period,
    payments: { count: r[0][0].n, total: r[0][0].v }, voids: r[1][0].n,
    bills: user.role === 'admin' ? { count: r[2][0].n, total: r[2][0].v } : null,
    daily: { labels: days, values: days.map((d) => map.get(d) || 0) },
  });
});

export default analytics;
