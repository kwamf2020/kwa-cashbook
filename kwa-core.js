// kwa-core.js - shared config + helpers. Load AFTER the supabase-js CDN script on every page.
const SUPABASE_URL = 'https://nayvftqylbjwspmjxbjc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qGT19bz8IOnF4-vWCbk4aQ_UCcaBc9U';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.KWA = (function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const formatINR = n => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // "dd-mm-yyyy" or "dd/mm/yyyy" -> sortable number yyyymmdd (0 if invalid)
  function dateKey(d) {
    const p = String(d || '').trim().replace(/\//g, '-').split('-');
    return p.length === 3 ? (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]) : 0;
  }
  // "dd-mm-yyyy" -> "October-2026" ('' if invalid)
  function monthYearOf(d) {
    const p = String(d || '').trim().replace(/\//g, '-').split('-');
    const m = parseInt(p[1], 10) - 1;
    return p.length === 3 && m >= 0 && m < 12 ? `${MONTHS[m]}-${p[2]}` : '';
  }
  // "October-2026" -> 202610 (0 if invalid), for comparing / sorting months
  function monthKey(my) {
    const p = String(my || '').split('-');
    const m = MONTHS.findIndex(x => x.toLowerCase() === (p[0] || '').trim().toLowerCase());
    const y = parseInt(p[1], 10);
    return m < 0 || isNaN(y) ? 0 : y * 100 + m + 1;
  }
  function shiftMonth(my, delta) {
    const k = monthKey(my);
    if (!k) throw new Error('Invalid month: ' + my);
    let y = Math.floor(k / 100), m = (k % 100) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return `${MONTHS[m]}-${y}`;
  }
  const nextMonth = my => shiftMonth(my, 1);
  const prevMonth = my => shiftMonth(my, -1);

  // The single source of truth for bank-account money movement.
  // Payments (CBV) are netted against their linked recovery receipts (CBR);
  // if recoveries exceed the payment, the excess is a credit.
  function netFlow(txns) {
    const pay = {}, rec = {};
    let credits = 0, debits = 0;
    (txns || []).forEach(t => {
      const type = String(t.type || '').trim().toLowerCase();
      const amt = Number(t.amount) || 0;
      if (type === 'payment') {
        const k = String(t.serial_no || '').trim();
        pay[k] = (pay[k] || 0) + amt;
      } else if (type === 'receipt') {
        const l = String(t.linked_cbv || '').trim();
        if (l) rec[l] = (rec[l] || 0) + amt; else credits += amt;
      }
    });
    Object.keys(pay).forEach(k => {
      const net = pay[k] - (rec[k] || 0);
      if (net > 0) debits += net; else credits -= net;
    });
    // recoveries whose CBV is not in this set are plain credits
    Object.keys(rec).forEach(k => { if (!(k in pay)) credits += rec[k]; });
    return { credits, debits };
  }

  async function requireSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return null; }
    return session;
  }

  return { MONTHS, esc, formatINR, dateKey, monthYearOf, monthKey, shiftMonth, nextMonth, prevMonth, netFlow, requireSession };
})();
