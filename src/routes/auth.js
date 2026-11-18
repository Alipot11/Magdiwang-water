import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { ALL_STAFF } from '../middleware.js';
import { verifyPassword, DUMMY_HASH } from '../lib/password.js';
import { createSession, destroySession, SESSION_TTL } from '../lib/session.js';
import { fail, readJson, rateLimit, getIP } from '../lib/util.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  const db = c.env.DB;
  const body = await readJson(c);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 255 || password.length > 200) {
    return fail(c, 400, 'Enter your username and password.');
  }

  const okIp = await rateLimit(db, `login:ip:${getIP(c)}`, 30, 900);
  const okUser = await rateLimit(db, `login:user:${username.toLowerCase()}`, 10, 900);
  if (!okIp || !okUser) return fail(c, 429, 'Too many login attempts. Wait 15 minutes and try again.');

  const user = await db.prepare(
    'SELECT user_id, username, password_hash, full_name, role, barangay, is_active FROM admin_users WHERE username = ?'
  ).bind(username).first();

  const passwordOk = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordOk) return fail(c, 401, 'Wrong username or password.');
  if (!user.is_active) return fail(c, 403, 'This account is deactivated. Ask an administrator.');

  const token = await createSession(db, user.user_id);
  setCookie(c, 'sid', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
  return c.json({ success: true, user: { full_name: user.full_name, role: user.role, barangay: user.barangay } });
});

auth.get('/me', ALL_STAFF, (c) => {
  const u = c.get('user');
  return c.json({
    success: true,
    user: { user_id: u.user_id, username: u.username, full_name: u.full_name, role: u.role, barangay: u.barangay },
    csrfToken: u.csrf,
  });
});

auth.post('/logout', ALL_STAFF, async (c) => {
  await destroySession(c.env.DB, getCookie(c, 'sid'));
  deleteCookie(c, 'sid', { path: '/' });
  return c.json({ success: true });
});

export default auth;
