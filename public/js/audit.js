import { api, initPage, showMsg, table, fmtDateTime } from './common.js';

const me = await initPage(['admin']);
if (me) {
  const f = (id) => document.getElementById(id);
  let page = 1;
  f('filter_form').addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  f('prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  f('next').addEventListener('click', () => { page++; load(); });

  async function load() {
    showMsg(f('msg'), '');
    try {
      const d = await api(`/audit?page=${page}&limit=25&meter_id=${encodeURIComponent(f('meter').value)}&action=${f('action').value}`);
      f('list').replaceChildren(table([
        { label: 'When', render: (l) => fmtDateTime(l.created_at) }, { label: 'User', render: (l) => l.full_name || l.username }, { label: 'Action', key: 'action' },
        { label: 'Record', key: 'table_name' }, { label: 'Meter', render: (l) => l.meter_id ?? '—' },
        { label: 'Owner', render: (l) => `${l.owner_first_name || ''} ${l.owner_last_name || ''}`.trim() || '—' }, { label: 'Details', key: 'description' }], d.logs, 'No matching entries.'));
      f('page_info').textContent = `Page ${d.pagination.page} of ${d.pagination.totalPages || 1}`;
      f('prev').disabled = page <= 1; f('next').disabled = page >= d.pagination.totalPages;
    } catch (err) { showMsg(f('msg'), err.message); }
  }
  load();
}
