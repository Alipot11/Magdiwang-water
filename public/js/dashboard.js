import { h, api, initPage, peso, fmtPeriod, fmtDate, brgy, barChart, barangayOptions, table } from './common.js';

const me = await initPage(['admin', 'treasurer', 'staff']);
if (me) start();

async function start() {
  const sel = document.getElementById('brgy_filter');
  if (me.role === 'admin') {
    document.getElementById('brgy_filter_wrap').hidden = false;
    barangayOptions(sel, 'All barangays');
    sel.addEventListener('change', load);
    try {
      const s = await api('/backup/status');
      if (s.days_since === null || s.days_since >= 7) {
        const w = document.getElementById('backup_warn');
        w.hidden = false; w.className = 'msg warn';
        w.replaceChildren(s.days_since === null ? 'No backup has been taken yet. ' : `The last backup was ${s.days_since} days ago. `, h('a', { href: '/backup.html', text: 'Back up now' }));
      }
    } catch { /* ignore */ }
  }
  load();
  loadMine();

  async function load() {
    const d = await api(`/analytics?barangay=${encodeURIComponent(sel.value || '')}`);
    document.getElementById('scope_text').textContent =
      `${d.scope ? brgy(d.scope) : 'All barangays'} · ${fmtPeriod(d.period)} · as of ${fmtDate(d.today)}`;
    const c = d.cards;
    const stat = (label, value, sub, hot) => h('div', { class: `stat${hot ? ' hot' : ''}` }, h('div', { class: 'label', text: label }), h('div', { class: 'value', text: value }), h('div', { class: 'sub', text: sub }));
    document.getElementById('cards').replaceChildren(
      stat('Billed this month', peso(c.billed), `${c.billed_count} bills`),
      stat('Collected this month', peso(c.collected), `${c.collected_count} payments`),
      stat('Collection rate', c.collection_rate === null ? '—' : `${c.collection_rate}%`, 'collected ÷ billed this month'),
      stat('Outstanding', peso(c.outstanding), `${c.outstanding_accounts} accounts`),
      stat('Overdue', peso(c.overdue), `${c.overdue_accounts} accounts past due date`, c.overdue > 0),
      stat('Active customers', String(c.active_customers), ''));
    const short = d.months.labels.map((p) => p.slice(2).replace('-', '/'));
    barChart(document.getElementById('chart_months'), short, [
      { name: 'Billed', values: d.months.billed, cls: 'b2', fmt: peso }, { name: 'Collected', values: d.months.collected, cls: '', fmt: peso }]);
    barChart(document.getElementById('chart_daily'), d.daily.map((_, i) => String(i + 1)), [{ name: 'Collected', values: d.daily, fmt: peso }]);
    barChart(document.getElementById('chart_use'), short, [{ name: 'Cubic meters', values: d.months.consumption, cls: 'b3' }]);

    const bc = document.getElementById('barangay_card');
    bc.hidden = !d.barangays;
    if (d.barangays) document.getElementById('barangay_table').replaceChildren(table([
      { label: 'Barangay', render: (r) => brgy(r.barangay) }, { label: 'Customers', num: true, key: 'customers' },
      { label: 'Billed', num: true, render: (r) => peso(r.billed) }, { label: 'Collected', num: true, render: (r) => peso(r.collected) },
      { label: 'Outstanding', num: true, render: (r) => peso(r.outstanding) }], d.barangays));
    document.getElementById('overdue_table').replaceChildren(table([
      { label: 'Meter', key: 'meter_id' }, { label: 'Name', render: (r) => `${r.first_name} ${r.last_name}` }, { label: 'Barangay', render: (r) => brgy(r.barangay) },
      { label: 'Unpaid bills', num: true, key: 'bills' }, { label: 'Oldest due', render: (r) => fmtDate(r.oldest_due) }, { label: 'Balance', num: true, render: (r) => peso(r.balance) }],
      d.top_overdue, 'No overdue accounts.'));
  }

  async function loadMine() {
    const m = await api('/analytics/me');
    const el = document.getElementById('mine');
    el.replaceChildren(h('p', {}, `You recorded ${m.payments.count} payments totaling ${peso(m.payments.total)} this month.`,
      m.voids ? ` You voided ${m.voids}.` : '', m.bills ? ` You posted ${m.bills.count} bills (${peso(m.bills.total)}).` : ''));
    barChart(document.getElementById('chart_mine'), m.daily.labels.map((d) => d.slice(8)), [{ name: 'Collected', values: m.daily.values, fmt: peso }]);
  }
}
