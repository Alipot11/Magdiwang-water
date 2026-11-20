// English / Filipino labels for the resident pages. Please have a Filipino speaker review the wording.
const DICT = {
  en: {
    site: 'Magdiwang Water Supply System',
    lookup_title: 'Check your water account',
    lookup_help: 'Enter your meter number and your name exactly as registered with the water office. Use the information sent in your text message or paper bills.',
    meter: 'Meter number', first_name: 'First name', last_name: 'Last name',
    view: 'View account', searching: 'Searching…',
    not_found: "We couldn't find a matching account. Check the meter number and the spelling of your name.",
    rate_limited: 'Too many attempts. Please try again in a few minutes.',
    network: 'Could not connect. Check your internet and try again.',
    invalid: 'Please complete every field.',
    balance_due: 'Balance due', total_unpaid: 'Total unpaid', account_of: 'Account of', meter_no: 'Meter No.',
    inactive: 'This account is inactive. Please contact the municipal water office.',
    all_paid: 'You have no unpaid bills.',
    bills: 'Bills', billing_month: 'Billing month', due_date: 'Due date', water_charge: 'Amount', surcharge: 'Surcharge',
    total: 'Total Bill', paid: 'Paid', balance: 'Balance', prev_reading: 'Previous Reading', curr_reading: 'Current Reading',
    consumption: 'Total Cubic Meter (m³)', no_bills: 'No bills yet.',
    payments: 'Payment history', receipt_no: 'Receipt no.', date_paid: 'Date paid', amount_paid: 'Amount paid', for_month: 'For', no_payments: 'No payments yet.',
    PAID: 'Paid', 'PARTIALLY PAID': 'Partially paid', UNPAID: 'Unpaid',
    complaint_link: 'Report a problem or concern', staff_login: 'Staff login', other_lang: 'Filipino',
    c_title: 'Submit a complaint', c_help: 'Tell us about the problem. Only the water office administrators can read this.',
    barangay: 'Barangay', select_barangay: 'Select barangay', category: 'Type of concern', details: 'Details',
    cat_no_water: 'No water supply', cat_leak: 'Leak or damaged pipe', cat_billing: 'Billing concern', cat_meter: 'Meter problem', cat_other: 'Other',
    send: 'Send complaint', sent: 'Thank you. Your complaint was received.', back: 'Back to account lookup',
    details_help: 'At least 10 characters. Include the sitio or landmark if it is a leak or outage.',
    statement: 'Statement of Account', name: 'Name', address: 'Address'
  },
  fil: {
    site: 'Magdiwang Water Supply System',
    lookup_title: 'Tingnan ang iyong water account',
    lookup_help: 'Ilagay ang iyong meter number at pangalan ayon sa pagkakarehistro sa water office. Gamitin ang inpormasyon mula sa text message o nakaraang bills.',
    meter: 'Meter number', first_name: 'Pangalan (first name)', last_name: 'Apelyido',
    view: 'Tingnan ang account', searching: 'Hinahanap…',
    not_found: 'Walang nakitang tugmang account. Suriin ang meter number at ang baybay ng iyong pangalan.',
    rate_limited: 'Masyadong maraming pagsubok. Pakisubukan muli pagkalipas ng ilang minuto.',
    network: 'Hindi makakonekta. Suriin ang iyong internet at subukan muli.',
    invalid: 'Pakikumpleto ang lahat ng patlang.',
    balance_due: 'Halagang dapat bayaran', total_unpaid: 'Kabuuang hindi pa bayad', account_of: 'Account ni/ng', meter_no: 'Meter blg.',
    inactive: 'Hindi aktibo ang account na ito. Makipag-ugnayan sa water office ng munisipyo.',
    all_paid: 'Wala kang hindi pa nababayarang bill.',
    bills: 'Mga bill', billing_month: 'Buwan ng singil', due_date: 'Takdang petsa', water_charge: 'Singil sa tubig', surcharge: 'Surcharge',
    total: 'Kabuuan', paid: 'Nabayaran na', balance: 'Natitirang balanse', prev_reading: 'Nakaraang reading', curr_reading: 'Kasalukuyang reading',
    consumption: 'Konsumo (m³)', no_bills: 'Wala pang bill.',
    payments: 'Kasaysayan ng bayad', receipt_no: 'Resibo blg.', date_paid: 'Petsa ng bayad', amount_paid: 'Halagang binayaran', for_month: 'Para sa', no_payments: 'Wala pang bayad.',
    PAID: 'Bayad na', 'PARTIALLY PAID': 'Bahagyang bayad', UNPAID: 'Hindi pa bayad',
    complaint_link: 'Mag-ulat ng problema o hinaing', staff_login: 'Pag-login ng staff', other_lang: 'English',
    c_title: 'Magsumite ng reklamo', c_help: 'Sabihin sa amin ang problema. Ang mga administrator lamang ng water office ang makakabasa nito.',
    barangay: 'Barangay', select_barangay: 'Piliin ang barangay', category: 'Uri ng hinaing', details: 'Detalye',
    cat_no_water: 'Walang tubig', cat_leak: 'Tagas o sirang tubo', cat_billing: 'Tungkol sa singil', cat_meter: 'Problema sa metro', cat_other: 'Iba pa',
    send: 'Ipadala ang reklamo', sent: 'Salamat. Natanggap na ang iyong reklamo.', back: 'Bumalik sa pag-check ng account',
    details_help: 'Hindi bababa sa 10 karakter. Isama ang sitio o palatandaan kung tagas o walang tubig.',
    statement: 'Statement of Account', name: 'Pangalan', address: 'Tirahan',
  },
};

let lang = localStorage.getItem('lang') === 'fil' ? 'fil' : 'en';
export const getLang = () => lang;
export const t = (key) => DICT[lang][key] ?? DICT.en[key] ?? key;

export function applyI18n(root = document) {
  document.documentElement.lang = lang === 'fil' ? 'fil' : 'en';
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

export function initI18n(onChange) {
  applyI18n();
  const btn = document.getElementById('lang_toggle');
  if (btn) {
    btn.textContent = t('other_lang');
    btn.addEventListener('click', () => {
      lang = lang === 'en' ? 'fil' : 'en';
      localStorage.setItem('lang', lang);
      btn.textContent = t('other_lang');
      applyI18n();
      onChange?.();
    });
  }
}
