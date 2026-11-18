import { getCookie } from 'hono/cookie';
import { loadSession } from './lib/session.js';

export async function sessionMiddleware(c, next) {
  const token = getCookie(c, 'sid');
  c.set('user', token ? await loadSession(c.env.DB, token) : null);
  await next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Login check + role check + CSRF check (for anything that changes data) in one place.
export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ success: false, message: 'You must be logged in.' }, 401);
    if (!roles.includes(user.role)) return c.json({ success: false, message: 'You do not have permission to do that.' }, 403);
    if (!SAFE.has(c.req.method) && c.req.header('X-CSRF-Token') !== user.csrf) {
      return c.json({ success: false, message: 'Invalid CSRF token. Reload the page and try again.' }, 403);
    }
    await next();
  };
}

export const ALL_STAFF = requireRole('admin', 'treasurer', 'staff');
export const ADMIN_ONLY = requireRole('admin');
