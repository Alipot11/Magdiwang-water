import { h, api, initPage, showMsg, brgy, peso, fmtDate, fmtPeriod, todayPH, statusBadge, table } from './common.js';

const me = await initPage(['admin', 'treasurer', 'staff']);
if (me) start();

function start() {
  const f = (id) => document.getElementById(id);
  const msg = f('msg');
  if (me.role !== 'admin') f('scope_text').textContent = `Showing clients and payments of ${brgy(me.barangay)} only.`;

  f('search_form').addEventListener('submit', async (e) => {
    e.preventDefault(); showMsg(msg, ''); f('account').hidden = true;
    try {
      const d = await api(`/customers?q=${encodeURIComponent(f('q').value)}`);
      f('results').replaceChildren(h('div', { class: 'card' }, table([
        { label: 'Meter', key: 'meter_id' }, { label: 'Name', render: (r) => `${r.first_name} ${r.last_name}` },
        { label: 'Address', render: (r) => `${brgy(r.barangay)}, ${r.sitio}` }, { label: 'Balance', num: true, render: (r) => peso(r.balance) },
        { label: '', render: (r) => h('button', { class: 'btn small', type: 'button', text: 'Select', onclick: () => openAccount(r.meter_id) }) }],
        d.customers, 'No matching account.')));
      if (d.customers.length === 1) openAccount(d.customers[0].meter_id);
    } catch (err) { showMsg(msg, err.message); }
  });

  async function openAccount(id) {
    showMsg(msg, '');
    try {
      const d = await api(`/customers/${id}`);
      const c = d.customer;
      const owing = d.bills.reduce((s, b) => s + b.balance, 0);
      f('account').hidden = false;
      f('account').replaceChildren(
        h('div', { class: 'card' }, h('h2', { text: `${c.first_name} ${c.last_name} · Meter ${c.meter_id}` }),
          h('p', { class: 'muted', text: `${brgy(c.barangay)}, ${c.sitio} · Total balance ${peso(owing)}` }),
          c.is_active ? null : h('div', { class: 'msg warn', text: 'This account is inactive. Payments cannot be recorded until an administrator reactivates it.' })),
        h('div', { class: 'card' }, h('h3', { text: 'Bills' }), table([
          { label: 'Month', render: (b) => fmtPeriod(b.billing_period) }, { label: 'Due', render: (b) => fmtDate(b.duedate) },
          { label: 'Total', num: true, render: (b) => peso(b.bill_amount) }, { label: 'Paid', num: true, render: (b) => peso(b.total_paid) },
          { label: 'Balance', num: true, render: (b) => peso(b.balance) }, { label: 'Status', render: (b) => statusBadge(b.status) },
          { label: '', render: (b) => (b.balance > 0 && c.is_active ? h('button', { class: 'btn small', type: 'button', text: 'Record payment', onclick: () => payForm(c, b) }) : '') }],
          d.bills, 'No bills yet.')),
        h('div', { id: 'pay_slot' }),
        h('div', { class: 'card' }, h('h3', { text: 'Payments' }), table([
          { label: 'Receipt', key: 'receipt_no' }, { label: 'Date', render: (p) => fmtDate(p.payment_date) }, { label: 'For', render: (p) => fmtPeriod(p.billing_period) },
          { label: 'Amount', num: true, render: (p) => peso(p.amount_paid) }, { label: 'Received by', key: 'received_by' },
          { label: 'Status', render: (p) => (p.voided_at ? h('span', { class: 'badge void', title: p.void_reason, text: 'VOID' }) : h('span', { class: 'badge paid', text: 'Valid' })) },
          { label: '', render: (p) => h('div', { class: 'actions' }, h('a', { class: 'btn small secondary', href: `/receipt.html?id=${p.payment_id}`, text: 'Receipt' }),
            p.voided_at ? null : h('button', { class: 'btn small danger', type: 'button', text: 'Void', onclick: () => voidPayment(p, id) })) }],
          d.payments, 'No payments yet.')));
    } catch (err) { showMsg(msg, err.message); }
  }

  function payForm(c, b) {
    const amount = h('input', { type: 'number', min: '1', max: String(b.balance), step: '1', value: String(b.balance), required: true, id: 'pay_amount' });
    const date = h('input', { type: 'date', value: todayPH(), max: todayPH(), required: true, id: 'pay_date' });
    const out = h('div', { role: 'alert', hidden: true });
    const form = h('form', { class: 'card' }, h('h3', { text: `Payment for ${fmtPeriod(b.billing_period)} (balance ${peso(b.balance)})` }),
      h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', { for: 'pay_amount', text: 'Amount paid (whole pesos)' }), amount),
        h('div', { class: 'field' }, h('label', { for: 'pay_date', text: 'Payment date' }), date)),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: 'Save payment' }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Cancel', onclick: () => document.getElementById('pay_slot').replaceChildren() })), out);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!confirm(`Record ${peso(amount.value)} for ${c.first_name} ${c.last_name}?`)) return;
      try {
        const d = await api('/payments', { method: 'POST', body: { bill_id: b.bill_id, payment_date: date.value, amount_paid: Number(amount.value) } });
        await openAccount(c.meter_id);
        showMsg(msg, `Saved. Receipt ${d.receipt_no}. `, 'ok');
        msg.append(h('a', { href: `/receipt.html?id=${d.payment_id}`, text: 'Print receipt' }));
      } catch (err) { showMsg(out, err.message); }
    });
    document.getElementById('pay_slot').replaceChildren(form);
    amount.focus();
  }

  async function voidPayment(p, meterId) {
    const reason = prompt(`Void receipt ${p.receipt_no} (${peso(p.amount_paid)})?\nGive the reason (required):`);
    if (!reason || reason.trim().length < 3) return;
    try { await api(`/payments/${p.payment_id}/void`, { method: 'POST', body: { reason: reason.trim() } }); await openAccount(meterId); showMsg(msg, `Receipt ${p.receipt_no} voided.`, 'ok'); }
    catch (err) { showMsg(msg, err.message); }
  }
}
