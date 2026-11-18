import { api, initPage, showMsg, fmtDateTime } from './common.js';

const me = await initPage(['admin']);
if (me) {
  const f = (id) => document.getElementById(id);
  async function status() {
    const s = await api('/backup/status');
    const old = s.days_since === null || s.days_since >= 7;
    f('status').className = `card msg ${old ? 'warn' : 'ok'}`;
    f('status').textContent = s.last_backup_at ? `Last backup: ${fmtDateTime(s.last_backup_at)} (${s.days_since} day(s) ago).${old ? ' Back up now.' : ''}` : 'No backup has been taken yet. Back up now.';
  }
  status().catch(() => {});

  f('dl_btn').addEventListener('click', async () => {
    f('dl_btn').disabled = true;
    try {
      const csrf = (await api('/auth/me')).csrfToken;
      const res = await fetch('/api/backup/download', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } });
      if (!res.ok) throw new Error('The backup could not be created.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `magdiwang-backup-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.json`;
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showMsg(f('dl_msg'), 'Backup downloaded. Move it to a safe folder or USB drive.', 'ok'); status();
    } catch (err) { showMsg(f('dl_msg'), err.message); }
    f('dl_btn').disabled = false;
  });
}
