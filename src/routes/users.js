import { Hono } from 'hono';
import { ADMIN_ONLY } from '../middleware.js';
import { hashPassword, passwordProblem } from '../lib/password.js';
import { destroyUserSessions } from '../lib/session.js';
import { BARANGAYS, ROLES } from '../lib/constants.js';
import { fail, readJson, cleanText, parseId, auditStmt } from '../lib/util.js';

const users = new Hono();
users.use('*', ADMIN_ONLY);

function validate(body, { creating }) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) return { error: 'Username must be 3 to 50 letters, numbers, dots, dashes or underscores.' };
  const full_name = cleanText(body.full_name, { min: 2, max: 100 });
  if (!full_name) return { error: 'Enter the full name (2 to 100 characters).' };
  if (!ROLES.includes(body.role)) return { error: 'Choose a role.' };
  let barangay = null;
  if (body.role !== 'admin') {
    if (!BARANGAYS.includes(body.barangay)) return { error: 'Choose the barangay this account belongs to.' };
    barangay = body.barangay;
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (creating || password) {
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
  }
  return { value: { username, full_name, role: body.role, barangay, password } };
}

function dbError(c, err) {
  const msg = String(err?.message || '');
  if (msg.includes('admin_users.username')) return fail(c, 409, 'That username is already taken.');
  if (msg.includes('admin_users.barangay')) return fail(c, 409, 'That barangay already has an active treasurer. Deactivate the current treasurer first, or make this account Staff.');
  throw err;
}

const otherActiveAdmins = async (db, id) =>
  (await db.prepare("SELECT COUNT(*) n FROM admin_users WHERE role = 'admin' AND is_active = 1 AND user_id != ?").bind(id).first()).n;

users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT user_id, username, full_name, role, barangay, is_active, created_at
     FROM admin_users ORDER BY is_active DESC, role, barangay, username`
  ).all();
  return c.json({ success: true, users: results });
});

users.post('/', async (c) => {
  const body = await readJson(c);
  if (!body) return fail(c, 400, 'Invalid request.');
  const v = validate(body, { creating: true });
  if (v.error) return fail(c, 400, v.error);
  const { username, full_name, role, barangay, password } = v.value;
  const db = c.env.DB;
  try {
    const res = await db.batch([
      db.prepare('INSERT INTO admin_users (username, password_hash, full_name, role, barangay) VALUES (?, ?, ?, ?, ?)')
        .bind(username, await hashPassword(password), full_name, role, barangay),
      db.prepare(`INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
                  VALUES (?, 'CREATE', 'admin_users', last_insert_rowid(), ?)`)
        .bind(c.get('user').user_id, `Created ${role} account "${username}"${barangay ? ` for ${barangay}` : ''}`),
    ]);
    return c.json({ success: true, user_id: res[0].meta.last_row_id }, 201);
  } catch (err) { return dbError(c, err); }
});

users.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  const body = await readJson(c);
  if (!id || !body) return fail(c, 400, 'Invalid request.');
  const v = validate(body, { creating: false });
  if (v.error) return fail(c, 400, v.error);
  const { username, full_name, role, barangay, password } = v.value;
  const db = c.env.DB;
  const me = c.get('user');

  const existing = await db.prepare('SELECT username, full_name, role, barangay, is_active FROM admin_users WHERE user_id = ?').bind(id).first();
  if (!existing) return fail(c, 404, 'Account not found.');
  if (id === me.user_id && role !== existing.role) return fail(c, 400, 'You cannot change your own role.');
  if (existing.role === 'admin' && existing.is_active && role !== 'admin' && (await otherActiveAdmins(db, id)) === 0) {
    return fail(c, 400, 'This is the last active administrator.');
  }

  const changed = [];
  if (username !== existing.username) changed.push('username');
  if (full_name !== existing.full_name) changed.push('full name');
  if (role !== existing.role) changed.push('role');
  if (barangay !== existing.barangay) changed.push('barangay');
  if (password) changed.push('password');
  if (!changed.length) return fail(c, 400, 'Nothing was changed.');

  const hash = password ? await hashPassword(password) : null;
  try {
    await db.batch([
      db.prepare(`UPDATE admin_users SET username = ?, full_name = ?, role = ?, barangay = ?,
                  password_hash = COALESCE(?, password_hash) WHERE user_id = ?`)
        .bind(username, full_name, role, barangay, hash, id),
      auditStmt(db, { userId: me.user_id, action: 'UPDATE', table: 'admin_users', recordId: id,
        description: `Updated account "${existing.username}": changed ${changed.join(', ')}` }),
    ]);
  } catch (err) { return dbError(c, err); }
  if (password) await destroyUserSessions(db, id);
  return c.json({ success: true });
});

users.post('/:id/active', async (c) => {
  const id = parseId(c.req.param('id'));
  const body = await readJson(c);
  if (!id || typeof body?.active !== 'boolean') return fail(c, 400, 'Invalid request.');
  const db = c.env.DB;
  const me = c.get('user');
  if (!body.active && id === me.user_id) return fail(c, 400, 'You cannot deactivate your own account.');

  const target = await db.prepare('SELECT username FROM admin_users WHERE user_id = ?').bind(id).first();
  if (!target) return fail(c, 404, 'Account not found.');

  try {
    const res = await db.batch([
      db.prepare(
        `UPDATE admin_users SET is_active = ?1 WHERE user_id = ?2 AND is_active != ?1
         AND (?1 = 1 OR NOT (role = 'admin' AND (SELECT COUNT(*) FROM admin_users WHERE role = 'admin' AND is_active = 1) <= 1))`
      ).bind(body.active ? 1 : 0, id),
    ]);
    if (res[0].meta.changes === 0) return fail(c, 400, body.active ? 'The account is already active.' : 'The account is already inactive, or it is the last active administrator.');
    await db.batch([
      auditStmt(db, { userId: me.user_id, action: body.active ? 'ACTIVATE' : 'DEACTIVATE', table: 'admin_users', recordId: id,
        description: `${body.active ? 'Reactivated' : 'Deactivated'} account "${target.username}"` }),
    ]);
  } catch (err) { return dbError(c, err); }
  if (!body.active) await destroyUserSessions(db, id);
  return c.json({ success: true });
});

export default users;
