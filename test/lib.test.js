import test from 'node:test';
import assert from 'node:assert/strict';
import { normName, cleanText, parseMeterId, parseWholePesos, isDate, isPeriod, todayPH, lastPeriods } from '../src/lib/util.js';
import { hashPassword, verifyPassword, passwordProblem, DUMMY_HASH } from '../src/lib/password.js';

test('normName ignores case, accents and extra spaces', () => {
  assert.equal(normName('  María   DELA  Cruz '), 'maria dela cruz');
  assert.equal(normName('Niño'), 'nino');
  assert.equal(normName("D'Souza-Reyes"), "d'souza-reyes");
});

test('meter numbers', () => {
  assert.equal(parseMeterId('1001'), 1001);
  assert.equal(parseMeterId(' 7 '), 7);
  for (const bad of ['0', '-5', '1.5', '1e3', 'abc', '', null, undefined, '2147483648', '99999999999']) assert.equal(parseMeterId(bad), null, String(bad));
});

test('whole pesos only', () => {
  assert.equal(parseWholePesos('250'), 250);
  assert.equal(parseWholePesos(250), 250);
  for (const bad of ['12.5', 12.5, '-1', -1, 'abc', '', null]) assert.equal(parseWholePesos(bad), null, String(bad));
  assert.equal(parseWholePesos(0, { min: 1 }), null);
});

test('dates and periods', () => {
  assert.ok(isDate('2028-02-29')); assert.ok(!isDate('2027-02-29')); assert.ok(!isDate('2026-13-01')); assert.ok(!isDate('2026-1-1'));
  assert.ok(isPeriod('2026-03')); assert.ok(!isPeriod('2026-13')); assert.ok(!isPeriod('2026-3'));
});

test('Philippine date is UTC+8', () => {
  assert.equal(todayPH(new Date('2026-12-31T17:00:00Z')), '2027-01-01');
  assert.equal(todayPH(new Date('2026-12-31T15:59:00Z')), '2026-12-31');
  assert.deepEqual(lastPeriods(3, '2027-01'), ['2026-11', '2026-12', '2027-01']);
});

test('cleanText rejects control characters and bad lengths', () => {
  assert.equal(cleanText('  Ana   Maria '), 'Ana Maria');
  assert.equal(cleanText('a\u0000b'), null);
  assert.equal(cleanText('x'.repeat(101)), null);
  assert.equal(cleanText('hello\nworld', { multiline: true, max: 50 }), 'hello\nworld');
});

test('password hashing', async () => {
  const hash = await hashPassword('Correct-Horse-9!');
  assert.ok(hash.startsWith('pbkdf2$100000$'));
  assert.equal(await verifyPassword('Correct-Horse-9!', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.notEqual(hash, await hashPassword('Correct-Horse-9!'));   // salted
});

test('password strength rules', () => {
  assert.equal(passwordProblem('Correct-Horse-9!'), null);
  for (const bad of ['short1!A', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoNumbersHere!!', 'NoSymbolsHere123']) assert.ok(passwordProblem(bad), bad);
});
