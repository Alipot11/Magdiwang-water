import { h, api, initPage, showMsg, brgy, address, barangayOptions, table, peso } from './common.js';

const me = await initPage(['admin']);
if (me) start();

function start() {
  const f = (id) => document.getElementById(id);
  const msg = f('cust_msg');
  let editing = null;
  barangayOptions(f('barangay'), 'Select barangay');
  barangayOptions(f('brgy_filter'), 'All barangays');

  function reset() {
    editing = null; f('cust_form').reset(); f('meter_id').disabled = false;
    f('form_title').textContent = 'Register a client'; f('save_btn').textContent = 'Register client'; f('cancel_btn').hidden = true;
  }
  f('cancel_btn').addEventListener('click', () => { reset(); showMsg(msg, ''); });

  f('cust_form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { first_name: f('first_name').value, last_name: f('last_name').value, barangay: f('barangay').value, sitio: f('sitio').value,
      phone: f('phone').value, sms_opt_in: f('sms_opt_in').checked };
    try {
      if (editing) await api(`/customers/${editing}`, { method: 'PUT', body });
      else await api('/customers', { method: 'POST', body: { ...body, meter_id: f('meter_id').value } });
      showMsg(msg, editing ? 'Account updated.' : 'Client registered.', 'ok');
      reset(); load();
    } catch (err) { showMsg(msg, err.message); }
  });

  function edit(c) {
    editing = c.meter_id;
    f('meter_id').value = c.meter_id; f('meter_id').disabled = true;
    f('first_name').value = c.first_name; f('last_name').value = c.last_name; f('barangay').value = c.barangay; f('sitio').value = c.sitio || '';
    f('phone').value = c.phone ? '0' + c.phone.slice(3) : ''; f('sms_opt_in').checked = !!c.sms_opt_in;
    f('form_title').textContent = `Edit meter ${c.meter_id}`; f('save_btn').textContent = 'Save changes'; f('cancel_btn').hidden = false;
    f('cust_form').scrollIntoView({ behavior: 'smooth' });
  }

  async function toggle(c) {
    const next = !c.is_active;
    if (!confirm(`${next ? 'Reactivate' : 'Deactivate'} meter ${c.meter_id} (${c.first_name} ${c.last_name})?${next ? '' : '\nHistory is kept. No new bills or payments can be recorded.'}`)) return;
    try { await api(`/customers/${c.meter_id}/active`, { method: 'POST', body: { active: next } }); load(); } catch (err) { showMsg(msg, err.message); }
  }

  async function load() {
    const qs = new URLSearchParams({ q: f('q').value, barangay: f('brgy_filter').value, inactive: f('inactive').checked ? '1' : '0' });
    try {
      const d = await api(`/customers?${qs}`);
      f('list').replaceChildren(table([
        { label: 'Meter', key: 'meter_id' }, { label: 'Name', render: (r) => `${r.first_name} ${r.last_name}` },
        { label: 'Address', render: (r) => address(r.barangay, r.sitio) }, { label: 'Balance', num: true, render: (r) => peso(r.balance) },
        { label: 'SMS', render: (r) => (r.phone ? (r.sms_opt_in ? '0' + r.phone.slice(3) : 'Not agreed') : '—') },
        { label: 'Status', render: (r) => h('span', { class: `badge ${r.is_active ? 'active' : 'inactive'}`, text: r.is_active ? 'Active' : 'Inactive' }) },
        { label: '', render: (r) => h('div', { class: 'actions' }, h('button', { class: 'btn small secondary', type: 'button', text: 'Edit', onclick: () => edit(r) }),
          h('button', { class: `btn small ${r.is_active ? 'danger' : 'secondary'}`, type: 'button', text: r.is_active ? 'Deactivate' : 'Reactivate', onclick: () => toggle(r) })) }],
        d.customers, 'No matching accounts.'));
    } catch (err) { showMsg(msg, err.message); }
  }
  f('search_form').addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
}
