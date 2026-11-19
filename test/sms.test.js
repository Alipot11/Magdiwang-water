import test from 'node:test';
import assert from 'node:assert/strict';
import { billMessage, paymentMessage, sendSms } from '../src/lib/sms.js';

const asciiAnd160 = (t) => t.length <= 160 && /^[\x20-\x7e]+$/.test(t);

const asciiAnd306 = (t) => t.length <= 306 && /^[\x20-\x7e]+$/.test(t);   // 2 SMS parts

test('bill SMS text', () => {
  const portal = 'https://magdiwang-water-system.pages.dev';
  const b = { first_name: 'Juan', last_name: 'Dela Cruz', meter_id: 123456789, billing_period: '2026-11', bill_amount: 460, duedate: '2026-12-15' };
  const t = billMessage(b, portal);
  assert.equal(t, 'Magdiwang Water Supply System: Good day, Juan Dela Cruz! Your Nov 2026 water bill (Meter 123456789) is PHP 460, due 12-15-2026. Kindly pay on or before the due date. From Magdiwang Municipal Treasurer Office. Thank you! Details: https://magdiwang-water-system.pages.dev');
  assert.ok(asciiAnd306(t));
  assert.ok(asciiAnd306(billMessage({ ...b, first_name: 'A'.repeat(20), last_name: 'B'.repeat(20), meter_id: 2147483647, bill_amount: 100000000 }, portal)), 'long names still fit 2 parts');
  assert.ok(!billMessage({ ...b, first_name: 'Niño José' }, portal).match(/[^\x20-\x7e]/), 'accents removed');
  assert.ok(!billMessage(b).includes('Details:'), 'no link when none is configured');
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