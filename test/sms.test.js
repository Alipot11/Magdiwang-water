import test from 'node:test';
import assert from 'node:assert/strict';
import { billMessage, paymentMessage, sendSms } from '../src/lib/sms.js';

const asciiAnd160 = (t) => t.length <= 160 && /^[\x20-\x7e]+$/.test(t);

test('bill SMS text', () => {
  const t = billMessage({ meter_id: 1001, billing_period: '2026-11', tcmeter: 20, bill_amount: 460, duedate: '2026-12-10' });
  assert.equal(t, 'Magdiwang Water: Bill for Nov 2026, Meter 1001. Use 20 m3. Total PHP 460. Due Dec 10. Pay at your barangay treasurer.');
  assert.ok(asciiAnd160(t));
  assert.ok(asciiAnd160(billMessage({ meter_id: 2147483647, billing_period: '2026-12', tcmeter: 99999, bill_amount: 100000000, duedate: '2027-01-31' })), 'worst case fits one SMS');
});

test('payment SMS text', () => {
  const t = paymentMessage({ meter_id: 1001, amount_paid: 460, billing_period: '2026-11', receipt_no: 'OR-2026-000123', bill_balance: 0 });
  assert.equal(t, 'Magdiwang Water: Received PHP 460 for Nov 2026, Meter 1001. OR-2026-000123. Balance PHP 0. Thank you.');
  assert.ok(asciiAnd160(t));
});

test('sendSms refuses to send unless every safety check passes (no network used)', async () => {
  const phone = '+639171234567';
  assert.equal((await sendSms({ SMS_ENABLED: 'false' }, phone, 'x')).disabled, true);
  assert.equal((await sendSms({ SMS_ENABLED: 'true', ENVIRONMENT: 'staging' }, phone, 'x')).blocked, true);
  assert.equal((await sendSms({ SMS_ENABLED: 'true', ENVIRONMENT: 'staging', SMS_ALLOWED_NUMBERS: '+639999999999' }, phone, 'x')).blocked, true);
  const r = await sendSms({ SMS_ENABLED: 'true', ENVIRONMENT: 'staging', SMS_ALLOWED_NUMBERS: phone }, phone, 'x');
  assert.equal(r.ok, false);
  assert.match(r.error, /not configured/);
});