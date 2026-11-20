import { h, apiPublic, address, peso, fmtDate, fmtPeriod, ApiError } from './common.js';
import { initI18n, t } from './i18n.js';

const form = document.getElementById('lookup_form');
const msg = document.getElementById('lookup_msg');
const result = document.getElementById('result');
let last = null;

function say(text, type = 'error') { msg.hidden = !text; msg.className = `msg ${type}`; msg.textContent = text || ''; }

function render() {
  if (!last) return;
  const { customer, bills, payments } = last;
  const due = bills.reduce((s, b) => s + b.balance, 0);
  result.hidden = false;
  result.replaceChildren(
    h('div', { class: 'balance-hero' },
      h('div', { class: 'title', text: t('statement') }),
      h('div', { class: 'who strong', text: `${t('name')}: ${customer.first_name} ${customer.last_name}` }),
      h('div', { class: 'who', text: `${t('address')}: ${address(customer.barangay, customer.sitio, true)}` }),
      h('div', { class: 'who', text: `${t('meter_no')}: ${customer.meter_id}` }),
      h('div', { class: 'big', text: peso(due) }),
      h('div', { class: 'who', text: due > 0 ? t('total_unpaid') : t('all_paid') })),
    customer.is_active ? null : h('div', { class: 'msg warn', text: t('inactive') }),
    h('div', { class: 'card' }, h('h2', { text: t('bills') }),
      bills.length ? bills.map((b) => billCard(b)) : h('p', { class: 'muted', text: t('no_bills') })),
    h('div', { class: 'card' }, h('h2', { text: t('payments') }),
      payments.length ? payments.map((p) => h('div', { class: 'bill' }, h('div', { class: 'kv' },
        kv(t('receipt_no'), p.receipt_no), kv(t('date_paid'), fmtDate(p.payment_date)),
        kv(t('for_month'), fmtPeriod(p.billing_period)), kv(t('amount_paid'), peso(p.amount_paid))))) : h('p', { class: 'muted', text: t('no_payments') })));
}
const kv = (k, v) => h('div', {}, h('span', { text: k }), v);
function billCard(b) {
  return h('div', { class: 'bill' },
    h('div', { class: 'bill-head' }, h('strong', { text: fmtPeriod(b.billing_period) }),
      h('span', { class: `badge ${b.status.toLowerCase().replace(/ /g, '-')}`, text: t(b.status) })),
    h('div', { class: 'kv' },
      kv(t('curr_reading'), b.curr_reading), kv(t('prev_reading'), b.pre_reading), kv(t('consumption'), b.tcmeter),
      kv(t('water_charge'), peso(b.amount)), kv(t('surcharge'), peso(b.surcharge)), kv(t('total'), peso(b.bill_amount)),
      kv(t('due_date'), fmtDate(b.duedate)),
      kv(t('paid'), peso(b.total_paid)), kv(t('balance'), peso(b.balance))));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('lookup_btn');
  btn.disabled = true; say(t('searching'), 'info'); result.hidden = true; last = null;
  try {
    last = await apiPublic('/portal/lookup', {
      meter_id: document.getElementById('meter_id').value.trim(),
      first_name: document.getElementById('first_name').value,
      last_name: document.getElementById('last_name').value,
    });
    say('');
    render();
  } catch (err) {
    const code = err instanceof ApiError ? err.data?.code : null;
    say(code === 'rate_limited' ? t('rate_limited') : code === 'invalid' ? t('invalid') : err instanceof ApiError ? t('not_found') : t('network'));
  } finally { btn.disabled = false; }
});

initI18n(() => { render(); });
