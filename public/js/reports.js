import { h, api, initPage, showMsg, brgy, barangayOptions, peso, fmtDate, todayPH, table } from './common.js';

const me = await initPage(['admin', 'treasurer', 'staff']);
if (me) {
  const f = (id) => document.getElementById(id);
  f('date').value = todayPH();
  if (me.role === 'admin') { f('brgy_wrap').hidden = false; barangayOptions(f('brgy'), 'All barangays'); }
  f('print_btn').addEventListener('click', () => window.print());
  f('rep_form').addEventListener('submit', async (e) => { e.preventDefault(); await load(); });

  async function load() {
    showMsg(f('msg'), '');
    try {
      const d = await api(`/reports/daily?date=${f('date').value}&barangay=${encodeURIComponent(f('brgy').value)}`);
      f('report').replaceChildren(
        h('div', { class: 'card' }, h('h2', { text: `Collections on ${fmtDate(d.date)} · ${d.scope ? brgy(d.scope) : me.role === 'admin' ? 'All barangays' : brgy(me.barangay)}` }),
          h('p', {}, `${d.payments.length} receipts, total `, h('strong', { text: peso(d.total) }))),
        h('div', { class: 'card' }, h('h3', { text: 'Payments' }), table([
          { label: 'Receipt', key: 'receipt_no' }, { label: 'Meter', key: 'meter_id' }, { label: 'Client', render: (r) => `${r.first_name} ${r.last_name}` },
          { label: 'Barangay', render: (r) => brgy(r.barangay) }, { label: 'Amount', num: true, render: (r) => peso(r.amount_paid) }, { label: 'Received by', key: 'received_by' }],
          d.payments, 'No payments on this day.')),
        h('div', { class: 'card' }, h('h3', { text: 'Totals by cashier' }), table([
          { label: 'Received by', key: 'received_by' }, { label: 'Receipts', num: true, key: 'count' }, { label: 'Total', num: true, render: (r) => peso(r.total) }], d.by_user, 'None.')),
        d.voided.length ? h('div', { class: 'card' }, h('h3', { text: 'Voided receipts (not counted)' }), table([
          { label: 'Receipt', key: 'receipt_no' }, { label: 'Client', render: (r) => `${r.first_name} ${r.last_name}` },
          { label: 'Amount', num: true, render: (r) => peso(r.amount_paid) }, { label: 'Reason', key: 'void_reason' }], d.voided)) : null);
    } catch (err) { showMsg(f('msg'), err.message); }
  }
  load();
}
