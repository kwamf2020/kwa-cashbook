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

// Turns the raw cash-book rows of ONE bank account into settlement units = what the bank actually sees:
//  - a CBV (all its line rows) becomes ONE payment of  Gross - sum(linked CBRs)
//  - linked CBRs are absorbed into their CBV and never appear on their own
//  - unlinked CBVs and direct CBRs stay as they are
//  - if recoveries exceed the CBV, the excess becomes a receipt unit
  // A CBR links to a CBV of the same month first, otherwise the latest earlier CBV with that serial.
  function buildSettlements(txns) {
    const s = v => String(v == null ? '' : v).trim();
    const rows = (txns || []).slice().sort((a, b) => monthKey(a.month_year) - monthKey(b.month_year) || dateKey(a.date) - dateKey(b.date));
    const units = [], byKey = {}, bySerial = {};
    rows.filter(t => s(t.type).toLowerCase() === 'payment').forEach(t => {
      const serial = s(t.serial_no), key = s(t.month_year).toLowerCase() + '|' + serial;
      let u = byKey[key];
      if (!u) {
        u = byKey[key] = { kind: 'Payment', month_year: t.month_year, serial_no: serial, date: t.date, cheque_no: '', party: '', gross: 0, recovery: 0, rows: [], cbrRows: [] };
        units.push(u);
        (bySerial[serial] = bySerial[serial] || []).push(u);
      }
      u.gross += Number(t.amount) || 0;
      u.rows.push(t);
      if (!u.cheque_no && t.cheque_no) u.cheque_no = t.cheque_no;
      if (!u.party) u.party = t.party_name || t.particulars || t.description || '';
    });
    rows.filter(t => s(t.type).toLowerCase() === 'receipt').forEach(t => {
      const amt = Number(t.amount) || 0, link = s(t.linked_cbv);
      let target = null;
      if (link && bySerial[link]) {
        const cands = bySerial[link], mk = monthKey(t.month_year);
        target = cands.find(x => monthKey(x.month_year) === mk) || cands.filter(x => monthKey(x.month_year) <= mk).pop() || null;
      }
      if (target) { target.recovery += amt; target.cbrRows.push(t); }
      else units.push({ kind: 'Receipt', month_year: t.month_year, serial_no: s(t.serial_no), date: t.date, cheque_no: t.cheque_no || '',
        party: t.party_name || t.particulars || t.description || '', gross: amt, recovery: 0, rows: [t], cbrRows: [] });
    });
    const out = [];
    units.forEach(u => {
      let amount = u.kind === 'Payment' ? u.gross - u.recovery : u.gross;
      if (u.kind === 'Payment' && amount < 0) { u.kind = 'Receipt'; amount = -amount; u.netCredit = true; }
      if (Math.abs(amount) < 0.005) return;      // fully recovered: nothing for the bank to clear
      u.amount = amount;
      u.allRows = u.rows.concat(u.cbrRows);
      out.push(u);
    });
    return out.sort((a, b) => monthKey(a.month_year) - monthKey(b.month_year) || dateKey(a.date) - dateKey(b.date) || (parseInt(a.serial_no, 10) || 0) - (parseInt(b.serial_no, 10) || 0));
  }

  // Bank-account money movement, derived from the same settlement units.
  function netFlow(txns) {
    let credits = 0, debits = 0;
    buildSettlements(txns).forEach(u => { if (u.kind === 'Receipt') credits += u.amount; else debits += u.amount; });
    return { credits, debits };
  }


  // ---- Opening balances (manual restarts) ----
  function overridesFor(rows, account) {
    const a = String(account || '').trim().toLowerCase();
    return (rows || []).filter(o => String(o.account_type || '').trim().toLowerCase() === a);
  }
  // Where an account's balance starts: the latest manual opening balance on/before upToMonth
  // (any, if upToMonth is omitted), otherwise the base balance from the beginning.
  function startPoint(base, overrides, upToMonth) {
    const cutoff = upToMonth ? monthKey(upToMonth) : Infinity;
    const best = (overrides || []).filter(o => monthKey(o.month_year) <= cutoff).sort((a, b) => monthKey(b.month_year) - monthKey(a.month_year))[0];
    return best ? { amount: Number(best.amount) || 0, fromKey: monthKey(best.month_year), manual: true }
                : { amount: Number(base) || 0, fromKey: 0, manual: false };
  }
  // Balance at the START of beforeMonth (or live, if omitted). o = { base, overrides, txns, isCash, beforeMonth }
  function accountBalance(o) {
    const sp = startPoint(o.base, o.overrides, o.beforeMonth);
    const cutoff = o.beforeMonth ? monthKey(o.beforeMonth) : Infinity;
    const rel = (o.txns || []).filter(t => { const k = monthKey(t.month_year); return k >= sp.fromKey && k < cutoff; });
    let credits = 0, debits = 0;
    if (o.isCash) rel.forEach(t => { const a = Number(t.amount) || 0; if (String(t.type || '').trim().toLowerCase() === 'receipt') credits += a; else debits += a; });
    else ({ credits, debits } = netFlow(rel));
    return sp.amount + credits - debits;
  }

  async function requireSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return null; }
    return session;
  }

  return { MONTHS, esc, formatINR, dateKey, monthYearOf, monthKey, shiftMonth, nextMonth, prevMonth, buildSettlements, netFlow, overridesFor, startPoint, accountBalance, requireSession };
})();
