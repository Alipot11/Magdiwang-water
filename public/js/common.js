// Shared helpers for every page. All user text goes through textContent (never innerHTML).
export const BARANGAYS = ['agutay', 'agsao', 'ipil', 'ambulong', 'poblacion', 'jao-asan', 'dulangan', 'tampayan', 'silum'];
export const brgy = (v) => (v ? v.replace(/(^|-)(\w)/g, (m, a, c) => a + c.toUpperCase()) : '');
export const address = (barangay, sitio, paren = false) => {
  const b = brgy(barangay);
  return sitio ? (paren ? `${b} (${sitio})` : `${b}, ${sitio}`) : b;
};
export const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtPeriod = (p) => (p ? new Date(p + '-01T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long' }) : '—');
export const fmtDateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const todayPH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const thisMonthPH = () => todayPH().slice(0, 7);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

let csrf = null;
let me = null;

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (auth && method !== 'GET') {
    if (!csrf) await loadMe();
    opts.headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch('/api' + path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && auth) { location.href = '/login.html'; throw new ApiError('Please log in.', 401, data); }
  if (!res.ok || !data || data.success === false) throw new ApiError(data?.message || 'Something went wrong. Please try again.', res.status, data);
  return data;
}
export const api = (path, opts) => request(path, opts);
export const apiPublic = (path, body) => request(path, { method: 'POST', body, auth: false });

async function loadMe() {
  const data = await request('/auth/me');
  me = data.user; csrf = data.csrfToken;
  return me;
}

const NAV = [
  ['Dashboard', '/dashboard.html', ['admin', 'treasurer', 'staff']],
  ['Customers', '/customers.html', ['admin']],
  ['Bills', '/bills.html', ['admin']],
  ['Payments', '/payments.html', ['admin', 'treasurer', 'staff']],
  ['Reports', '/reports.html', ['admin', 'treasurer', 'staff']],
  ['Complaints', '/complaints.html', ['admin']],
  ['SMS', '/sms.html', ['admin']],
  ['Accounts', '/users.html', ['admin']],
  ['Audit log', '/audit.html', ['admin']],
  ['Backup', '/backup.html', ['admin']],
];

export async function showEnvBanner() {
  try {
    const { environment } = await (await fetch('/api/env')).json();
    if (environment && environment !== 'production') {
      document.head.append(h('meta', { name: 'robots', content: 'noindex,nofollow' }));
      document.body.prepend(h('div', { class: 'env-banner', text: `${environment.toUpperCase()} SYSTEM — test data only. Do not record real payments here.` }));
    }
  } catch { /* banner is optional */ }
}

export async function initPage(roles) {
  showEnvBanner();
  try { await loadMe(); } catch { return null; }
  if (roles && !roles.includes(me.role)) { location.href = '/dashboard.html'; return null; }
  const links = NAV.filter(([, , r]) => r.includes(me.role)).map(([label, href]) =>
    h('a', { href, text: label, 'aria-current': location.pathname === href ? 'page' : null }));
  const scope = me.role === 'admin' ? 'Administrator' : `${me.role === 'treasurer' ? 'Treasurer' : 'Staff'} · ${brgy(me.barangay)}`;
  document.getElementById('topbar').replaceChildren(h('div', { class: 'topbar-inner' },
    h('span', { class: 'brand' },
      h('img', { class: 'logo', src: '/img/logo-1.webp', alt: '', width: '36', height: '36' }),
      h('img', { class: 'logo', src: '/img/logo-2.webp', alt: '', width: '36', height: '36' }),
      'Magdiwang Water Supply System'),
    h('nav', { class: 'topbar-nav', 'aria-label': 'Main' }, links),
    h('div', { class: 'topbar-user' }, h('span', { text: `${me.full_name} (${scope})` }),
      h('button', { class: 'btn', type: 'button', text: 'Log out', onclick: async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
        location.href = '/login.html';
      } }))));
  return me;
}

export function showMsg(el, text, type = 'error') {
  el.replaceChildren();
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `msg ${type}`;
  el.textContent = text;
}

export function statusBadge(status) {
  return h('span', { class: `badge ${String(status).toLowerCase().replace(/ /g, '-')}`, text: status });
}

export function table(columns, rows, emptyText = 'Nothing to show.') {
  if (!rows.length) return h('div', { class: 'empty', text: emptyText });
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: c.num ? 'num' : '', text: c.label })))),
    h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => {
      const v = c.render ? c.render(r) : r[c.key];
      return h('td', { class: c.num ? 'num' : '' }, v);
    }))))));
}

export function barChart(el, labels, series) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  el.replaceChildren(
    h('div', { class: 'chart' }, labels.map((lab, i) => h('div', { class: 'chart-col' },
      h('div', { class: 'chart-bars' }, series.map((s) => {
        const bar = h('div', { class: `bar ${s.cls || ''}`, title: `${lab} — ${s.name}: ${s.fmt ? s.fmt(s.values[i]) : s.values[i]}` });
        bar.style.height = `${(s.values[i] / max) * 100}%`;
        return bar;
      })),
      h('div', { class: 'chart-label', text: lab })))),
    series.length > 1 ? h('div', { class: 'legend' }, series.map((s) => h('span', {}, h('i', { class: `bar ${s.cls || ''}` }), s.name))) : null);
}

export function barangayOptions(select, firstLabel) {
  select.replaceChildren(h('option', { value: '', text: firstLabel }), ...BARANGAYS.map((b) => h('option', { value: b, text: brgy(b) })));
}
