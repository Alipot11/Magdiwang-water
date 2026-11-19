import { h, api, initPage, showMsg, brgy, barangayOptions, thisMonthPH, peso, table } from './common.js';

const me = await initPage(['admin']);
if (me) start();

function start() {
  const f = (id) => document.getElementById(id);
  barangayOptions(f('brgy'), 'All barangays');
  f('period').value = thisMonthPH();
  // default due date: the 10th of next month
  const [y, m] = thisMonthPH().split('-').map(Number);
  f('duedate').value = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-10`;
  let rows = [];

  f('sheet_form').addEventListener('submit', async (e) => { e.preventDefault(); await loadSheet(); });

  async function loadSheet(keepMsg = false) {
    if (!keepMsg) showMsg(f('post_msg'), '');
    try {
      const d = await api(`/bills/sheet?period=${f('period').value}&barangay=${encodeURIComponent(f('brgy').value)}`);
      rows = d.rows.map((r) => ({ ...r, el: {} }));
      f('sheet_card').hidden = false;
      f('print_link').href = `/bill-print.html?period=${f('period').value}&barangay=${encodeURIComponent(f('brgy').value)}`;
      showMsg(f('sheet_msg'), rows.length ? `${rows.length} customers have no bill for this month.` : 'Every active customer already has a bill for this month.', rows.length ? 'info' : 'ok');
      render();
    } catch (err) { showMsg(f('sheet_msg'), err.message); }
  }

  const num = (v) => (v === '' ? null : Number(v));
  function render() {
    f('sheet').replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Meter', 'Name', 'Barangay', 'Previous', 'Current', 'm³', 'Amount ₱', 'Surcharge ₱', 'Total ₱', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows.map(rowEl)))) : h('div', { class: 'empty', text: 'Nothing to post.' }));
    applyFilter();
  }

  function rowEl(r) {
    const input = (extra = {}) => h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', ...extra });
    r.el.curr = input({ 'aria-label': `Current reading for meter ${r.meter_id}` });
    r.el.amount = input({ 'aria-label': `Amount for meter ${r.meter_id}` });
    r.el.sur = input({ value: '0', 'aria-label': `Surcharge for meter ${r.meter_id}` });
    r.el.pre = r.prev_reading === null ? input({ title: 'First bill: enter the starting reading', 'aria-label': `Starting reading for meter ${r.meter_id}` }) : null;
    r.el.use = h('td', { class: 'num', text: '—' });
    r.el.total = h('td', { class: 'num', text: '—' });
    r.el.status = h('td', { class: 'small' });
    const recalc = () => {
      const pre = r.prev_reading ?? num(r.el.pre.value), curr = num(r.el.curr.value);
      r.el.use.textContent = pre !== null && curr !== null ? String(curr - pre) : '—';
      r.el.use.className = `num${pre !== null && curr !== null && curr < pre ? ' bad' : ''}`;
      r.el.total.textContent = num(r.el.amount.value) !== null ? String(num(r.el.amount.value) + (num(r.el.sur.value) || 0)) : '—';
    };
    [r.el.curr, r.el.amount, r.el.sur, r.el.pre].forEach((i) => i && i.addEventListener('input', recalc));
    r.tr = h('tr', { 'data-key': `${r.meter_id} ${r.first_name} ${r.last_name}`.toLowerCase() },
      h('td', { text: r.meter_id }), h('td', { text: `${r.first_name} ${r.last_name}` }), h('td', { text: brgy(r.barangay) }),
      h('td', { class: 'num' }, r.prev_reading ?? r.el.pre), h('td', {}, r.el.curr), r.el.use, h('td', {}, r.el.amount), h('td', {}, r.el.sur), r.el.total, r.el.status);
    return r.tr;
  }

  function applyFilter() {
    const q = f('filter').value.trim().toLowerCase();
    rows.forEach((r) => { r.tr.hidden = q && !r.tr.dataset.key.includes(q); });
  }
  f('filter').addEventListener('input', applyFilter);

  f('post_btn').addEventListener('click', async () => {
    const filled = rows.filter((r) => r.el.curr.value !== '');
    if (!filled.length) return showMsg(f('post_msg'), 'Enter at least one current reading.', 'warn');
    if (!confirm(`Post ${filled.length} bill(s) for ${f('period').value}? They cannot be edited afterwards.`)) return;
    f('post_btn').disabled = true;
    let posted = 0; const problems = [];
    try {
      for (let i = 0; i < filled.length; i += 50) {
        const chunk = filled.slice(i, i + 50);
        const d = await api('/bills/bulk', { method: 'POST', body: {
          period: f('period').value, duedate: f('duedate').value,
          rows: chunk.map((r) => ({ meter_id: r.meter_id, pre_reading: r.el.pre ? r.el.pre.value : undefined, curr_reading: r.el.curr.value, amount: r.el.amount.value, surcharge: r.el.sur.value })) } });
        posted += d.posted;
        d.results.forEach((res) => { if (!res.ok) problems.push(`Meter ${res.meter_id}: ${res.message}`); });
      }
    } catch (err) { problems.push(err.message); }
    f('post_btn').disabled = false;
    const box = f('post_msg');
    showMsg(box, `${posted} bill(s) posted.${problems.length ? ` ${problems.length} need attention:` : ''}`, problems.length ? 'warn' : 'ok');
    if (problems.length) box.append(h('ul', {}, problems.map((p) => h('li', { text: p }))));
    await loadSheet(true);
  });

    // ---- manual bill SMS ----
  let smsBills = [], stop = false;
  const texted = (b) => ['submitted', 'delivered'].includes(b.sms_status);
  const waiting = (b) => b.phone && b.sms_opt_in && b.balance > 0 && !texted(b);
  const smsCell = (b) => (!b.phone ? 'No number' : !b.sms_opt_in ? 'Not agreed' : texted(b) ? h('span', { class: 'badge paid', text: 'Sent' })
    : b.balance <= 0 ? 'Paid' : b.sms_status ? h('span', { class: 'badge warn', text: 'Retry' }) : 'Waiting');

  async function loadSms(keepMsg = false) {
    if (!keepMsg) showMsg(f('sms_msg'), '');
    try {
      const d = await api(`/bills/sms?period=${f('period').value}&barangay=${encodeURIComponent(f('brgy').value)}`);
      smsBills = d.bills;
      const n = smsBills.filter(waiting).length;
      f('sms_panel').hidden = false;
      f('sms_progress').textContent = `${smsBills.length} bills, ${n} waiting to be texted.`;
      f('sms_send_all').disabled = n === 0;
      f('sms_list').replaceChildren(table([
        { label: 'Meter', key: 'meter_id' }, { label: 'Name', render: (b) => `${b.first_name} ${b.last_name}` }, { label: 'Barangay', render: (b) => brgy(b.barangay) },
        { label: 'Total', num: true, render: (b) => peso(b.bill_amount) }, { label: 'Balance', num: true, render: (b) => peso(b.balance) },
        { label: 'SMS', render: smsCell }], smsBills, 'No bills for this month.'));
    } catch (err) { showMsg(f('sms_msg'), err.message); }
  }
  f('sms_load').addEventListener('click', () => loadSms());
  f('sms_stop').addEventListener('click', () => { stop = true; });

  f('sms_send_all').addEventListener('click', async () => {
    const todo = smsBills.filter(waiting);
    if (!todo.length) return;
    if (!confirm(`Text ${todo.length} customer(s) their bill for ${f('period').value}? Keep this page open until it finishes.`)) return;
    stop = false; f('sms_send_all').disabled = true; f('sms_stop').hidden = false;
    let ok = 0, streak = 0; const problems = [];
    for (const [i, b] of todo.entries()) {
      if (stop) break;
      f('sms_progress').textContent = `Sending ${i + 1} of ${todo.length}...`;
      try { await api(`/bills/${b.bill_id}/sms`, { method: 'POST' }); ok++; streak = 0; }
      catch (err) {
        problems.push(`Meter ${b.meter_id}: ${err.message}`);
        if (++streak >= 3) { problems.push('Stopped after 3 failures in a row.'); break; }
      }
      if (i < todo.length - 1 && !stop) await new Promise((r) => setTimeout(r, 4000));
    }
    f('sms_stop').hidden = true;
    const box = f('sms_msg');
    showMsg(box, `${ok} submitted.${stop ? ' Stopped early.' : ''}${problems.length ? ` ${problems.length} need attention:` : ''}`, problems.length ? 'warn' : 'ok');
    if (problems.length) box.append(h('ul', {}, problems.map((p) => h('li', { text: p }))));
    await loadSms(true);
  });
}
