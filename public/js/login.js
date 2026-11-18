import { api, showMsg, showEnvBanner } from './common.js';
showEnvBanner();
const msg = document.getElementById('login_msg');
document.getElementById('toggle_pw').addEventListener('click', (e) => {
  const pw = document.getElementById('password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
  e.target.textContent = pw.type === 'password' ? 'Show' : 'Hide';
});
document.getElementById('login_form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/auth/login', { method: 'POST', auth: false, body: { username: document.getElementById('username').value, password: document.getElementById('password').value } });
    location.href = '/dashboard.html';
  } catch (err) { showMsg(msg, err.message); }
});
