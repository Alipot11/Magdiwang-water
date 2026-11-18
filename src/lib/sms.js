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