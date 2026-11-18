export const SESSION_TTL = 8 * 3600;   // absolute lifetime
export const IDLE_LIMIT = 2 * 3600;    // sign out after 2 idle hours

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const newToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const hashToken = async (t) => toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const nowSec = () => Math.floor(Date.now() / 1000);

export async function createSession(db, userId) {
  const token = newToken();
  const now = nowSec();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO sessions (session_id, user_id, csrf_token, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(await hashToken(token), userId, newToken(), now + SESSION_TTL, now),
  ]);
  return token;
}

// The user row is re-read on every request, so deactivating or re-roling an account takes effect immediately.
export async function loadSession(db, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const id = await hashToken(token);
  const now = nowSec();
  const row = await db.prepare(
    `SELECT s.csrf_token, s.last_seen, u.user_id, u.username, u.full_name, u.role, u.barangay
     FROM sessions s JOIN admin_users u ON u.user_id = s.user_id
     WHERE s.session_id = ? AND s.expires_at > ? AND s.last_seen > ? AND u.is_active = 1`
  ).bind(id, now, now - IDLE_LIMIT).first();
  if (!row) return null;
  if (now - row.last_seen > 300) {
    await db.prepare('UPDATE sessions SET last_seen = ? WHERE session_id = ?').bind(now, id).run();
  }
  return { user_id: row.user_id, username: row.username, full_name: row.full_name, role: row.role, barangay: row.barangay, csrf: row.csrf_token };
}

export async function destroySession(db, token) {
  if (typeof token === 'string') await db.prepare('DELETE FROM sessions WHERE session_id = ?').bind(await hashToken(token)).run();
}
export const destroyUserSessions = (db, userId) => db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
