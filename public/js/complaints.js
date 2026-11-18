import { h, api, initPage, showMsg, brgy, fmtDateTime } from './common.js';

const me = await initPage(['admin']);
if (me) {
  const f = (id) => document.getElementById(id);
  const CAT = { no_water: 'No water', leak: 'Leak / damaged pipe', billing: 'Billing concern', meter: 'Meter problem', other: 'Other' };
  f('status').addEventListener('change', load);

  async function load() {
    showMsg(f('msg'), '');
    try {
      const d = await api(`/complaints?status=${f('status').value}`);
      f('list').replaceChildren(...(d.complaints.length ? d.complaints.map(card) : [h('div', { class: 'card empty', text: 'No complaints.' })]));
    } catch (err) { showMsg(f('msg'), err.message); }
  }

  function card(c) {
    const status = h('select', {}, ['new', 'in_progress', 'resolved'].map((s) => h('option', { value: s, text: { new: 'New', in_progress: 'In progress', resolved: 'Resolved' }[s], selected: s === c.status })));
    const notes = h('textarea', { maxlength: '1000', 'aria-label': 'Internal notes' }); notes.value = c.admin_notes || '';
    const out = h('div', { role: 'alert', hidden: true });
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('strong', { text: `${c.first_name} ${c.last_name}` }), h('span', { class: 'muted', text: `Meter ${c.meter_id} · ${brgy(c.barangay)}` }),
        h('span', { class: `badge ${c.matched ? 'active' : 'warn'}`, text: c.matched ? 'Matches a customer' : 'No matching customer' }),
        h('span', { class: 'badge', text: CAT[c.category] }), h('span', { class: 'muted small', text: fmtDateTime(c.created_at) })),
      h('p', { text: c.message }),
      h('div', { class: 'row' }, h('div', {}, h('label', { text: 'Status' }), status), h('div', { class: 'grow' }, h('label', { text: 'Internal notes' }), notes),
        h('button', { class: 'btn', type: 'button', text: 'Save', onclick: async () => {
          try { await api(`/complaints/${c.complaint_id}`, { method: 'PATCH', body: { status: status.value, admin_notes: notes.value } }); showMsg(out, 'Saved.', 'ok'); }
          catch (err) { showMsg(out, err.message); }
        } })), out);
  }
  load();
}
