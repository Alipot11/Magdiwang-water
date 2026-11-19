import { h, api, initPage, showMsg, table, fmtDateTime } from './common.js';

const me = await initPage(['admin']);
if (me) {
  const f = (id) => document.getElementById(id);
  let page = 1;
  f('status').addEventListener('change', () => { page = 1; load(); });
  f('prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  f('next').addEventListener('click', () => { page++; load(); });

  const LABEL = { pending: 'Pending', submitted: 'Submitted', delivered: 'Delivered', failed: 'Failed', error: 'Error' };
  const BADGE = { delivered: 'paid', submitted: 'warn', pending: 'warn', failed: 'void', error: 'void' };

  async function act(path, btn) {
    btn.disabled = true;
    try { await api(path, { method: 'POST' }); await load(); }
    catch (err) { showMsg(f('msg'), err.message); btn.disabled = false; }
  }

  async function load() {
    showMsg(f('msg'), '');
    try {
      const d = await api(`/sms?page=${page}&status=${f('status').value}`);
      f('list').replaceChildren(table([
        { label: 'When', render: (s) => fmtDateTime(s.created_at) },
        { label: 'Type', render: (s) => (s.kind === 'bill' ? 'Bill' : 'Receipt') },
        { label: 'Meter', key: 'meter_id' },
        { label: 'Name', render: (s) => `${s.first_name} ${s.last_name}` },
        { label: 'Phone', key: 'phone_masked' },
        { label: 'Status', render: (s) => h('span', { class: `badge ${BADGE[s.status]}`, text: s.status === 'submitted' && s.gateway_state ? `Submitted · ${s.gateway_state}` : LABEL[s.status] }) },
        { label: 'Details', render: (s) => h('span', { class: 'small', text: s.error || `Tries: ${s.attempts}` }) },
        { label: 'Message', render: (s) => h('span', { class: 'small', text: s.body }) },
        { label: '', render: (s) => (s.status === 'submitted'
          ? h('button', { class: 'btn small secondary', type: 'button', text: 'Refresh', onclick: (e) => act(`/sms/${s.sms_id}/refresh`, e.target) })
          : ['failed', 'error'].includes(s.status)
            ? h('button', { class: 'btn small', type: 'button', text: 'Retry', onclick: (e) => act(`/sms/${s.sms_id}/retry`, e.target) }) : '') }],
        d.messages, 'No messages yet.'));
      f('page_info').textContent = `Page ${d.pagination.page} of ${d.pagination.totalPages || 1}`;
      f('prev').disabled = page <= 1; f('next').disabled = page >= d.pagination.totalPages;
    } catch (err) { showMsg(f('msg'), err.message); }
  }

  f('refresh_all').addEventListener('click', async () => {
    f('refresh_all').disabled = true;
    showMsg(f('msg'), '');
    let done = 0, bad = 0;
    try {
      const d = await api('/sms?status=submitted&page=1');
      for (const s of d.messages) {
        try { await api(`/sms/${s.sms_id}/refresh`, { method: 'POST' }); done++; } catch { bad++; }
      }
      await load();
      showMsg(f('msg'), `${done} refreshed.${bad ? ` ${bad} could not be checked.` : ''}`, bad ? 'warn' : 'ok');
    } catch (err) { showMsg(f('msg'), err.message); }
    f('refresh_all').disabled = false;
  });
  load();
}