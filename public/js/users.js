import { h, api, initPage, showMsg, brgy, barangayOptions, table, fmtDateTime } from './common.js';

const me = await initPage(['admin']);
if (me) {
  const f = (id) => document.getElementById(id);
  const msg = f('user_msg');
  let editing = null;
  barangayOptions(f('barangay'), 'Select barangay');
  const syncRole = () => { f('brgy_field').hidden = f('role').value === 'admin'; };
  f('role').addEventListener('change', syncRole); syncRole();
  f('toggle_pw').addEventListener('click', (e) => { const p = f('password'); p.type = p.type === 'password' ? 'text' : 'password'; e.target.textContent = p.type === 'password' ? 'Show' : 'Hide'; });

  function reset() {
    editing = null; f('user_form').reset(); syncRole();
    f('form_title').textContent = 'Create an account'; f('save_btn').textContent = 'Create account'; f('cancel_btn').hidden = true; f('password').required = true;
  }
  f('cancel_btn').addEventListener('click', () => { reset(); showMsg(msg, ''); });
  f('password').required = true;

  f('user_form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { username: f('username').value, full_name: f('full_name').value, role: f('role').value, barangay: f('barangay').value, password: f('password').value };
    try {
      if (editing) await api(`/users/${editing}`, { method: 'PATCH', body }); else await api('/users', { method: 'POST', body });
      showMsg(msg, editing ? 'Account updated.' : 'Account created.', 'ok'); reset(); load();
    } catch (err) { showMsg(msg, err.message); }
  });

  function edit(u) {
    editing = u.user_id;
    f('username').value = u.username; f('full_name').value = u.full_name; f('role').value = u.role; f('barangay').value = u.barangay || ''; f('password').value = ''; f('password').required = false;
    syncRole(); f('form_title').textContent = `Edit ${u.username}`; f('save_btn').textContent = 'Save changes'; f('cancel_btn').hidden = false;
    f('user_form').scrollIntoView({ behavior: 'smooth' });
  }

  async function load() {
    try {
      const d = await api('/users');
      f('list').replaceChildren(table([
        { label: 'Username', key: 'username' }, { label: 'Name', key: 'full_name' },
        { label: 'Role', render: (u) => ({ admin: 'Admin', treasurer: 'Treasurer', staff: 'Staff' }[u.role]) }, { label: 'Barangay', render: (u) => (u.barangay ? brgy(u.barangay) : 'All') },
        { label: 'Status', render: (u) => h('span', { class: `badge ${u.is_active ? 'active' : 'inactive'}`, text: u.is_active ? 'Active' : 'Inactive' }) },
        { label: 'Created', render: (u) => fmtDateTime(u.created_at) },
        { label: '', render: (u) => h('div', { class: 'actions' }, h('button', { class: 'btn small secondary', type: 'button', text: 'Edit', onclick: () => edit(u) }),
          h('button', { class: `btn small ${u.is_active ? 'danger' : 'secondary'}`, type: 'button', text: u.is_active ? 'Deactivate' : 'Reactivate', onclick: async () => {
            if (!confirm(`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.username}?`)) return;
            try { await api(`/users/${u.user_id}/active`, { method: 'POST', body: { active: !u.is_active } }); load(); } catch (err) { showMsg(msg, err.message); }
          } })) }], d.users));
    } catch (err) { showMsg(msg, err.message); }
  }
  load();
}
