import { auditStmt } from './util.js';

// SMS helper: builds the message text and sends ONE message through the SMSGate cloud API.
// Text is plain ASCII on purpose, so each message stays within one 160-character SMS.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (period) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const monthDay = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const php = (n) => `PHP ${Number(n).toLocaleString('en-US')}`;

// b: a row from bill_balances (meter_id, billing_period, tcmeter, bill_amount, duedate)
export const billMessage = (b) =>
  `Magdiwang Water: Bill for ${monthYear(b.billing_period)}, Meter ${b.meter_id}. Use ${b.tcmeter} m3. Total ${php(b.bill_amount)}. Due ${monthDay(b.duedate)}. Pay at your barangay treasurer.`;

// p: a row from payment_details plus bill_balance (meter_id, amount_paid, billing_period, receipt_no, bill_balance)
export const paymentMessage = (p) =>
  `Magdiwang Water: Received ${php(p.amount_paid)} for ${monthYear(p.billing_period)}, Meter ${p.meter_id}. ${p.receipt_no}. Balance ${php(p.bill_balance)}. Thank you.`;

// Never throws. Returns { ok: true, id, state } or { ok: false, error, disabled?, blocked? }.
export async function sendSms(env, phone, text) {
  if (env.SMS_ENABLED !== 'true') return { ok: false, disabled: true, error: 'SMS sending is turned off on this system.' };

  // Safety net: outside production, only numbers on the allow-list can ever be texted.
  const allow = (env.SMS_ALLOWED_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if ((allow.length || env.ENVIRONMENT !== 'production') && !allow.includes(phone)) {
    return { ok: false, blocked: true, error: 'This number is not on the test allow-list.' };
  }
  if (!env.SMS_GATEWAY_URL || !env.SMS_GATEWAY_USER || !env.SMS_GATEWAY_PASSWORD) {
    return { ok: false, error: 'The SMS gateway is not configured.' };
  }

  const body = { message: text, phoneNumbers: [phone] };
  if (env.SMS_DEVICE_ID) body.deviceId = env.SMS_DEVICE_ID;
  try {
    const res = await fetch(`${env.SMS_GATEWAY_URL}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${env.SMS_GATEWAY_USER}:${env.SMS_GATEWAY_PASSWORD}`) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) return { ok: false, error: `The gateway refused the message (HTTP ${res.status}).` };
    return { ok: true, id: String(data.id), state: String(data.state || 'Pending') };
  } catch {
    return { ok: false, error: 'Could not reach the SMS gateway.' };
  }
}

// Shared by receipts and bills. kind = 'payment' | 'bill'; refId = payment_id | bill_id.
// Returns { ok: true } or { ok: false, code, error }.
export async function sendQueued(db, env, user, { kind, refId, meterId, first, last, phone, body, what }) {
  const col = kind === 'bill' ? 'bill_id' : 'payment_id';   // fixed names, never user input
  // Create the row if needed, then "claim" it. The claim fails if the SMS is already sent, or if another
  // send started within the last minute, so a double click cannot text twice.
  const [, claim] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO sms_outbox (meter_id, phone, kind, ${col}, body, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(meterId, phone, kind, refId, body, user.user_id),
    db.prepare(`UPDATE sms_outbox SET phone = ?1, body = ?2, status = 'pending', attempts = attempts + 1, error = NULL, gateway_state = NULL, updated_at = datetime('now')
                WHERE ${col} = ?3 AND (status IN ('failed','error')
                      OR (status = 'pending' AND (updated_at IS NULL OR updated_at < datetime('now', '-1 minute'))))`).bind(phone, body, refId),
  ]);
  if (claim.meta.changes === 0) {
    const cur = await db.prepare(`SELECT status FROM sms_outbox WHERE ${col} = ?`).bind(refId).first();
    return { ok: false, code: 409, error: ['submitted', 'delivered'].includes(cur?.status)
      ? `${what} was already texted.` : 'A send is already in progress. Try again in a minute.' };
  }

  const r = await sendSms(env, phone, body);
  const row = await db.prepare(`SELECT sms_id FROM sms_outbox WHERE ${col} = ?`).bind(refId).first();
  await db.batch([
    r.ok
      ? db.prepare(`UPDATE sms_outbox SET status = 'submitted', gateway_message_id = ?, gateway_state = ?, error = NULL, sent_at = datetime('now'), updated_at = datetime('now') WHERE sms_id = ?`).bind(r.id, r.state, row.sms_id)
      : db.prepare(`UPDATE sms_outbox SET status = 'error', error = ?, updated_at = datetime('now') WHERE sms_id = ?`).bind(r.error, row.sms_id),
    auditStmt(db, { userId: user.user_id, meterId, first, last, action: 'SMS', table: 'sms_outbox', recordId: row.sms_id,
      description: `${what} SMS ${r.ok ? 'submitted to the gateway' : 'not sent: ' + r.error}` }),
  ]);
  return r.ok ? { ok: true } : { ok: false, code: 502, error: r.error };
}

// Asks the gateway for the current state of a message it accepted earlier.
export async function getSmsState(env, gatewayId) {
  if (!env.SMS_GATEWAY_URL || !env.SMS_GATEWAY_USER || !env.SMS_GATEWAY_PASSWORD) return { ok: false, error: 'The SMS gateway is not configured.' };
  try {
    const res = await fetch(`${env.SMS_GATEWAY_URL}/message/${encodeURIComponent(gatewayId)}`, {
      headers: { Authorization: 'Basic ' + btoa(`${env.SMS_GATEWAY_USER}:${env.SMS_GATEWAY_PASSWORD}`) },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.state) return { ok: false, error: `The gateway could not give the status (HTTP ${res.status}).` };
    return { ok: true, state: String(data.state) };
  } catch {
    return { ok: false, error: 'Could not reach the SMS gateway.' };
  }
}