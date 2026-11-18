import { BARANGAYS } from './constants.js';

export const MAX_INT = 2147483647;

// Lowercase, accent-free, single-spaced. Used to match names ("Niño" = "nino").
export function normName(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim();
}

export function cleanText(v, { min = 1, max = 100, multiline = false } = {}) {
  if (typeof v !== 'string') return null;
  let s = multiline ? v.replace(/\r\n/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) return null;
  return s;
}

export function parsePhone(v) {
  if (typeof v !== 'string') return null;
  const m = v.replace(/[\s-]/g, '').match(/^(?:\+?63|0)(9\d{9})$/);
  return m ? `+63${m[1]}` : null;
}

export function parseMeterId(v) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string' || !/^\d{1,10}$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return n >= 1 && n <= MAX_INT ? n : null;
}

export function parseId(v) {
  if (typeof v !== 'string' || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_INT ? n : null;
}

export function parseWholePesos(v, { min = 0, max = 100000000 } = {}) {
  if (typeof v === 'string') {
    if (!/^\d{1,9}$/.test(v.trim())) return null;
    v = Number(v.trim());
  }
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isPeriod(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false;
  const m = Number(s.slice(5));
  return m >= 1 && m <= 12;
}

// All "today" logic uses Philippine time (UTC+8), not the server's UTC clock.
export function todayPH(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function lastPeriods(n, from = todayPH().slice(0, 7)) {
  let [y, m] = from.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

export const fail = (c, status, message, extra = {}) => c.json({ success: false, message, ...extra }, status);

export async function readJson(c) {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch { return null; }
}

export const getIP = (c) => c.req.header('CF-Connecting-IP') || 'local';

// Admins may filter by barangay; treasurers/staff are always locked to their own.
export function scopeBarangay(user, requested) {
  if (user.role === 'admin') return BARANGAYS.includes(requested) ? requested : null;
  return user.barangay;
}

// Fixed-window counter stored in D1. Returns true while under the limit.
export async function rateLimit(db, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset_at < ?3 THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING count`
  ).bind(key, now + windowSec, now).first();
  return row.count <= max;
}

export function auditStmt(db, { userId, meterId = null, first = null, last = null, action, table, recordId = null, description }) {
  return db.prepare(
    `INSERT INTO audit_logs (user_id, meter_id, owner_first_name, owner_last_name, action, table_name, record_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(userId, meterId, first, last, action, table, recordId, String(description).slice(0, 500));
}
