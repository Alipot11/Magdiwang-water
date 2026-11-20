import { h, api, initPage, showMsg, brgy, address, peso, fmtDate, fmtPeriod, fmtDateTime } from './common.js';

const me = await initPage(['admin', 'treasurer', 'staff']);
if (me) {
  const id = new URLSearchParams(location.search).get('id');
  const pp80 = document.getElementById('pp80'), ppa4 = document.getElementById('ppa4');
  let a4 = false;
  document.getElementById('print_btn').addEventListener('click', () => window.print());
  document.getElementById('size_btn').addEventListener('click', (e) => {
    a4 = !a4; pp80.disabled = a4; ppa4.disabled = !a4;
    document.getElementById('paper').firstChild?.classList.toggle('a4', a4);
    e.target.textContent = a4 ? 'Paper: A4 sheet' : 'Paper: 80 mm roll';
  });
  try {
    const { payment: p } = await api(`/payments/${encodeURIComponent(id)}`);
    const line = (k, v, cls = '') => h('div', { class: `line ${cls}` }, h('span', { text: k }), h('b', { text: v }));
    document.getElementById('paper').replaceChildren(h('div', { class: 'paper' },
      p.voided_at ? h('div', { class: 'void-mark', text: 'VOID' }) : null,
      h('h1', { text: 'Magdiwang Water Supply System' }), h('p', { class: 'center', text: 'Magdiwang, Romblon' }),
      h('p', { class: 'center', text: 'OFFICIAL RECEIPT' }), h('hr'),
      line('Receipt no.', p.receipt_no), line('Date paid', fmtDate(p.payment_date)), line('Recorded', fmtDateTime(p.created_at)), h('hr'),
      line('Customer', `${p.first_name} ${p.last_name}`), line('Meter no.', String(p.meter_id)), line('Address', address(p.barangay, p.sitio)), h('hr'),
      line('Billing month', fmtPeriod(p.billing_period)), line('Previous reading', String(p.pre_reading)), line('Current reading', String(p.curr_reading)),
      line('Consumption (m³)', String(p.tcmeter)), line('Water charge', peso(p.amount)), line('Surcharge', peso(p.surcharge)), line('Bill total', peso(p.bill_amount)), h('hr'),
      line('AMOUNT PAID', peso(p.amount_paid), 'total'),
      p.voided_at ? null : line('Balance on this bill', peso(p.bill_balance)),
      h('hr'), line('Received by', p.received_by),
      p.voided_at ? h('p', { class: 'center', text: `VOIDED ${fmtDateTime(p.voided_at)}: ${p.void_reason}` }) : null,
      h('p', { class: 'center', text: 'Thank you for your payment.' })));
  } catch (err) { showMsg(document.getElementById('msg'), err.message); }
}
