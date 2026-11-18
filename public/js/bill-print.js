import { h, api, initPage, showMsg, brgy, peso, fmtDate, fmtPeriod } from './common.js';

const me = await initPage(['admin', 'treasurer', 'staff']);
if (me) {
  document.getElementById('print_btn').addEventListener('click', () => window.print());
  const q = new URLSearchParams(location.search);
  const qs = q.get('bill_id') ? `bill_id=${encodeURIComponent(q.get('bill_id'))}` : `period=${encodeURIComponent(q.get('period') || '')}&barangay=${encodeURIComponent(q.get('barangay') || '')}`;
  try {
    const { bills } = await api(`/bills/print?${qs}`);
    if (!bills.length) showMsg(document.getElementById('msg'), 'No bills found.', 'warn');
    const line = (k, v, cls = '') => h('div', { class: `line ${cls}` }, h('span', { text: k }), h('b', { text: v }));
    document.getElementById('sheets').replaceChildren(...bills.map((b) => h('div', { class: 'paper a4 bill-sheet' },
      h('h1', { text: 'Magdiwang Water Supply System' }), h('p', { class: 'center', text: 'Magdiwang, Romblon · WATER BILL' }), h('hr'),
      line('Customer', `${b.first_name} ${b.last_name}`), line('Meter no.', String(b.meter_id)), line('Address', `${brgy(b.barangay)}, ${b.sitio}`),
      line('Billing month', fmtPeriod(b.billing_period)), line('Bill no.', String(b.bill_id)), h('hr'),
      line('Previous reading', String(b.pre_reading)), line('Current reading', String(b.curr_reading)), line('Consumption (m³)', String(b.tcmeter)), h('hr'),
      line('Water charge', peso(b.amount)), line('Surcharge', peso(b.surcharge)), line('Total bill', peso(b.bill_amount)),
      line('Paid so far', peso(b.total_paid)), line('BALANCE DUE', peso(b.balance), 'total'), line('Due date', fmtDate(b.duedate)), h('hr'),
      h('p', { class: 'center small', text: 'Pay at your barangay treasurer. Bring this bill or your meter number.' }))));
  } catch (err) { showMsg(document.getElementById('msg'), err.message); }
}
