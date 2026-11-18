import { h, apiPublic, BARANGAYS, brgy, ApiError } from './common.js';
import { initI18n, t } from './i18n.js';

const form = document.getElementById('complaint_form');
const msg = document.getElementById('complaint_msg');
const brgySel = document.getElementById('barangay');
const catSel = document.getElementById('category');
const CATS = ['no_water', 'leak', 'billing', 'meter', 'other'];

function fillSelects() {
  const b = brgySel.value, c = catSel.value;
  brgySel.replaceChildren(h('option', { value: '', text: t('select_barangay') }), ...BARANGAYS.map((x) => h('option', { value: x, text: brgy(x) })));
  catSel.replaceChildren(...CATS.map((x) => h('option', { value: x, text: t('cat_' + x) })));
  brgySel.value = b; if (c) catSel.value = c;
}
function say(text, type = 'error') { msg.hidden = !text; msg.className = `msg ${type}`; msg.textContent = text || ''; }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('send_btn');
  btn.disabled = true;
  try {
    await apiPublic('/complaints', {
      first_name: document.getElementById('first_name').value, last_name: document.getElementById('last_name').value,
      barangay: brgySel.value, meter_id: document.getElementById('meter_id').value.trim(),
      category: catSel.value, message: document.getElementById('message').value,
    });
    form.reset(); fillSelects(); say(t('sent'), 'ok');
  } catch (err) {
    const code = err instanceof ApiError ? err.data?.code : null;
    say(code === 'rate_limited' ? t('rate_limited') : code === 'invalid' ? t('invalid') : t('network'));
  } finally { btn.disabled = false; }
});

fillSelects();
initI18n(fillSelects);
