// Card Scanner → Cardmarket "Inserisci carte bulk"
// Compila le righe della pagina con la lista dell'app, controlla nome e rarità,
// e imposta il prezzo = offerta più bassa (lingua della lista, Near Mint o migliore,
// escluse le tue offerte) + i centesimi scelti. Non invia nulla da solo.
(() => {
  if (window.__csPanel) { window.__csPanel.style.display = 'block'; return; }

  const form = document.getElementById('BulkListingForm');
  if (!form) {
    alert('Apri prima la pagina "Inserisci carte bulk" di Cardmarket per un\'espansione, poi premi di nuovo il pulsante.');
    return;
  }

  const LANG = { it: 5, en: 1, fr: 2, de: 3, es: 4, pt: 8 };
  const LANG_NAME = { 1: 'Inglese', 2: 'Francese', 3: 'Tedesco', 4: 'Spagnolo', 5: 'Italiano', 8: 'Portoghese' };
  // Rarità TCGdex (italiano) → nome usato da Cardmarket
  const RARITY = {
    'comune': 'common', 'non comune': 'uncommon', 'rara': 'rare', 'rara holo': 'holo rare',
    'doppia rara': 'double rare', 'ultra rara': 'ultra rare', 'rara illustrazione': 'illustration rare',
    'rara illustrazione speciale': 'special illustration rare', 'iper rara': 'hyper rare',
    'rara segreta': 'secret rare', 'asso tattico rara': 'ace spec rare', 'rara ace spec': 'ace spec rare',
    'promo': 'promo', 'nessuna': ''
  };
  const GEST_URL = 'https://mamouse87.github.io/scanner-pokemon/gestionale/';
  const DELAY_MS = 1300;
  const MIN_PRICE = 0.02;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = n => /^\d+$/.test(n) ? String(parseInt(n, 10)) : n.toUpperCase();
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('cs_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('cs_' + k, v); } catch (e) {} }
  };

  // ---------- pannello ----------
  const panel = document.createElement('div');
  window.__csPanel = panel;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;width:460px;max-height:92vh;overflow:auto;z-index:99999;' +
    'background:#1c2128;color:#e8eaed;font:14px/1.4 system-ui,sans-serif;border-radius:12px;padding:14px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.4)';
  const inp = 'background:#0d1014;color:#e8eaed;border:1px solid #333a44;border-radius:6px;padding:5px';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="color:#ffcb05">Card Scanner → Cardmarket</b>
      <button id="csClose" style="background:none;border:0;color:#e8eaed;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="margin-bottom:6px">📄 <input type="file" id="csFile" accept=".txt,.html,.htm,text/*" style="font-size:12px;width:85%"></div>
    <textarea id="csInput" placeholder="…oppure incolla qui la lista dell'app"
      style="width:100%;height:110px;box-sizing:border-box;${inp};font:12px monospace"></textarea>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin:8px 0">
      <span>Commento</span><input id="csComment" style="${inp}" placeholder="es. Collezione privata">
      <span>Prezzo</span><span><input type="checkbox" id="csPrice" checked> offerta più bassa NM + <input id="csPlus" type="number" min="0" step="1" style="${inp};width:60px"> cent.</span>
      <span>Tuo utente</span><input id="csMe" style="${inp}" placeholder="per escludere le tue offerte">
    </div>
    <div id="csProg" style="margin:0 0 8px;padding:8px;border-radius:8px;background:#0d1014;font-size:12.5px;display:none"></div>
    <button id="csGo" style="width:100%;padding:10px;border:0;border-radius:8px;background:#ffcb05;color:#111;font-weight:700;cursor:pointer">Compila la pagina</button>
    <div id="csLog" style="margin-top:10px;font:12px/1.45 monospace;white-space:pre-wrap"></div>
    <button id="csGest" style="display:none;width:100%;margin-top:10px;padding:10px;border:0;border-radius:8px;background:#3ecf6e;color:#111;font-weight:700;cursor:pointer"></button>
    <div style="margin-top:8px;text-align:right"><a href="#" id="csCat" style="color:#9aa3ad;font-size:12px">Invia solo l'elenco di questo set al gestionale</a></div>`;
  document.body.appendChild(panel);
  const $ = id => panel.querySelector('#' + id);
  const log = (t, color) => {
    const d = document.createElement('div');
    if (color) d.style.color = color;
    d.textContent = t;
    $('csLog').appendChild(d);
    panel.scrollTop = panel.scrollHeight;
  };
  $('csClose').onclick = () => { panel.style.display = 'none'; };

  function guessMe() {
    // il nome utente compare nel menu account in alto (es. LULU-MOUSE)
    const el = [...document.querySelectorAll('header a, header span, nav a, nav span')]
      .find(x => /^[A-Za-z0-9_-]{3,}$/.test((x.textContent || '').trim()) && x.closest('[class*="account"],[id*="account"],[class*="user"]'));
    return el ? el.textContent.trim() : '';
  }
  function syncComment(force) {
    const m = $('csInput').value.match(/^COMMENTO\s+(.*)$/mi);
    if (m && (force || !$('csComment').value)) { $('csComment').value = m[1].trim(); store.set('comment', $('csComment').value); }
  }

  // valori ricordati (servono anche per la seconda pagina del set)
  $('csInput').value = store.get('list', '');
  $('csPlus').value = store.get('plus', '0');
  $('csMe').value = store.get('me', '') || guessMe();
  $('csComment').value = store.get('comment', '');
  $('csInput').addEventListener('input', () => { store.set('list', $('csInput').value); syncComment(); });
  $('csPlus').addEventListener('input', () => store.set('plus', $('csPlus').value));
  $('csMe').addEventListener('input', () => store.set('me', $('csMe').value));
  $('csComment').addEventListener('input', () => store.set('comment', $('csComment').value));
  $('csFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    let t = await f.text();
    if (/<br|<html|<body/i.test(t)) {
      // file arrivato come pagina HTML (es. via Bluetooth): tengo solo il testo
      const d = new DOMParser().parseFromString(t.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
      t = d.body.textContent;
    }
    $('csInput').value = t.replace(/ /g, ' ');
    store.set('list', $('csInput').value);
    syncComment(true);
  });

  // ---------- confronto nomi e rarità ----------
  const simp = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function sameName(a, b) {
    const A = simp(a), B = simp(b);
    if (!A || !B) return null; // non verificabile
    if (A === B || A.includes(B) || B.includes(A)) return true;
    const key = String(a).split(/[\s-]+/).map(simp).filter(w => w.length >= 3).sort((x, y) => y.length - x.length)[0] || A;
    if (B.includes(key)) return true;
    return 1 - lev(A, B) / Math.max(A.length, B.length) >= 0.7;
  }
  function sameRarity(app, cm) {
    if (!app || !cm) return null;
    const a = app.trim().toLowerCase(), c = cm.trim().toLowerCase();
    if (a === c) return true;
    if (!(a in RARITY)) return null; // rarità che non so tradurre: da controllare a occhio
    return RARITY[a] === c;
  }

  // ---------- righe della pagina ----------
  function pageRows() {
    const map = new Map();
    form.querySelectorAll('tbody tr').forEach(tr => {
      const a = tr.querySelector('.col-product a');
      if (!a) return;
      const full = a.textContent.trim();
      const m = full.match(/^(.*?)\s*\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
      if (!m) return;
      const k = norm(m[3]);
      const rar = tr.querySelector('.rarity-symbol');
      if (!map.has(k)) map.set(k, {
        tr, name: m[1].trim(), code: m[2], num: m[3], label: full.replace(/\s+/g, ' '), href: a.getAttribute('href'),
        rarity: rar ? (rar.getAttribute('title') || rar.getAttribute('data-bs-original-title') || '') : ''
      });
    });
    return map;
  }

  function field(tr, prefix) {
    return [...tr.querySelectorAll('[name]')].find(el => el.getAttribute('name').startsWith(prefix + '[')) || null;
  }
  function setVal(el, v) {
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fillRow(tr, o) {
    setVal(field(tr, 'idLanguage'), String(o.lang));
    setVal(field(tr, 'idCondition'), '2'); // Near Mint
    const rev = field(tr, 'isReverseHolo');
    if (rev && !rev.disabled) { rev.checked = o.rev; rev.dispatchEvent(new Event('change', { bubbles: true })); }
    setVal(field(tr, 'amount'), String(o.qty));
    if (o.price != null) setVal(field(tr, 'price'), o.price.toFixed(2));
    if (o.comment) setVal(field(tr, 'comments'), o.comment);
    tr.style.outline = '3px solid ' + (o.warn ? '#ff9f43' : o.rev ? '#cc5de8' : '#3ecf6e');
  }
  async function duplicate(tr) {
    const btn = tr.querySelector('.copy-row-button');
    if (!btn) return null;
    const before = new Set(form.querySelectorAll('tbody tr'));
    btn.click();
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      const nw = [...form.querySelectorAll('tbody tr')].find(t => !before.has(t));
      if (nw) return nw;
    }
    return null;
  }

  // ---------- prezzo ----------
  function parsePrice(t) {
    const m = String(t).match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/);
    return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null;
  }
  let blocked = false;
  /** Offerta più bassa sulla pagina della carta con i filtri (= il "Da" per lingua e condizione), escluse le tue. */
  async function lowest(row, rev, langId, me) {
    const u = new URL(row.href, location.origin);
    u.searchParams.set('language', String(langId));
    u.searchParams.set('minCondition', '2');
    u.searchParams.set('isReverseHolo', rev ? 'Y' : 'N');
    const r = await fetch(u.href, { credentials: 'include' });
    if (r.status === 429 || r.status === 403) { blocked = true; throw new Error('Cardmarket ha rallentato le richieste (' + r.status + ')'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    if (/just a moment|attention required/i.test(doc.title)) { blocked = true; throw new Error('controllo anti-bot di Cardmarket'); }

    const rows = [...new Set([...doc.querySelectorAll('[id^="articleRow"], .article-row')])];
    const meL = (me || '').trim().toLowerCase();
    const prices = [];
    let mine = 0;
    for (const ar of rows) {
      const seller = ar.querySelector('a[href*="/Users/"]');
      if (meL && seller && seller.textContent.trim().toLowerCase() === meL) { mine++; continue; }
      const pc = ar.querySelector('.price-container') || ar.querySelector('.col-offer') || ar;
      const p = parsePrice(pc.textContent);
      if (p != null) prices.push(p);
    }
    if (prices.length) return { base: Math.min(...prices), src: `più bassa tra ${prices.length} offerte` + (mine ? `, ${mine} tue escluse` : '') };

    // ripiego: il valore "Da" nel riquadro informazioni della carta
    const dt = [...doc.querySelectorAll('dt')].find(d => /^(da|from|disponibile da)$/i.test(d.textContent.trim()));
    const da = dt && dt.nextElementSibling ? parsePrice(dt.nextElementSibling.textContent) : null;
    if (da != null) return { base: da, src: rows.length ? 'valore "Da" (offerte non lette)' : 'valore "Da"' };
    return { base: null, src: rows.length ? 'offerte trovate ma prezzo non leggibile' : 'nessuna offerta NM in questa lingua' };
  }
  function trendOf(tr) {
    const el = tr.querySelector('input[name="trendPrice"]');
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? null : v;
  }

  // ---------- lista dall'app ----------
  function parseInput(text) {
    let lang = 5, setName = '', setId = '', langCode = 'it';
    const items = [];
    text.split(/\r?\n/).forEach(line => {
      const l = line.replace(/ /g, ' ').trim();
      if (!l || l.startsWith('#') || /^CARDSCANNER/i.test(l) || /^COMMENTO/i.test(l)) return;
      let m = l.match(/^SET\s+(.*?)\s*\|\s*([a-z]{2})\s*(?:\|\s*([^|]*?))?\s*$/i);
      if (m) { setName = m[1]; langCode = m[2].toLowerCase(); lang = LANG[langCode] || 5; setId = (m[3] || '').trim(); return; }
      // formato 2: 006 | x1 | N | Combee | Comune
      m = l.match(/^([A-Z]*\d+)\s*\|\s*x\s*(\d+)\s*\|\s*([NR])\s*(?:\|\s*([^|]*?))?\s*(?:\|\s*([^|]*?))?\s*$/i);
      if (m) { items.push({ num: m[1], qty: +m[2], rev: m[3].toUpperCase() === 'R', name: m[4] || '', rarity: m[5] || '' }); return; }
      // formato 1: 006R x1
      m = l.match(/^([A-Z]*\d+)(R?)\s*x\s*(\d+)/i);
      if (m) items.push({ num: m[1], rev: m[2].toUpperCase() === 'R', qty: +m[3], name: '', rarity: '' });
    });
    return { lang, langCode, setName, setId, items };
  }

  // ---------- collegamento al gestionale ----------
  const LANG_CODE = { 1: 'en', 2: 'fr', 3: 'de', 4: 'es', 5: 'it', 8: 'pt' };
  function expansion() {
    const id = new URLSearchParams(location.search).get('idExpansion') ||
      (document.querySelector('select[name="idExpansion"]') || {}).value || '';
    const opt = [...document.querySelectorAll('select[name="idExpansion"] option')].find(o => o.value === String(id));
    return { id: String(id), name: opt ? opt.textContent.trim() : '' };
  }
  function catalog() {
    const cards = [];
    form.querySelectorAll('tbody tr').forEach(tr => {
      const a = tr.querySelector('.col-product a');
      const pid = field(tr, 'idProduct');
      if (!a || !pid) return;
      const full = a.textContent.trim();
      const m = full.match(/^(.*?)\s*\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
      const th = tr.querySelector('.thumbnail-icon');
      const tip = th ? (th.getAttribute('data-bs-title') || th.getAttribute('data-bs-original-title') || th.getAttribute('title') || '') : '';
      const img = (tip.match(/src="([^"]+)"/) || [])[1] ||
        (tr.innerHTML.match(/https?:\/\/product-images[^"'\s&<>]+\.(?:jpe?g|png|webp)/i) || [])[0] || '';
      const rar = tr.querySelector('.rarity-symbol');
      const revEl = field(tr, 'isReverseHolo');
      const myP = parseFloat((tr.querySelector('input[name="myPrice"]') || {}).value || '0');
      if (cards.some(c => c.p === pid.value)) return; // righe duplicate
      cards.push({ p: pid.value, n: m ? m[1].trim() : full, c: m ? m[2] : '', u: m ? m[3] : '', r: rar ? (rar.getAttribute('title') || rar.getAttribute('data-bs-original-title') || '') : '',
        i: img, h: revEl && !revEl.disabled ? 1 : 0, m: myP > 0 ? myP : null });
    });
    return cards;
  }
  function snapshot() {
    const rows = [];
    form.querySelectorAll('tbody tr').forEach(tr => {
      const amt = parseInt((field(tr, 'amount') || {}).value || '0', 10);
      const pid = field(tr, 'idProduct');
      if (!amt || !pid) return;
      const p = parseFloat(String((field(tr, 'price') || {}).value || '').replace(',', '.'));
      const lab = ((tr.querySelector('.col-product a') || {}).textContent || '').trim().match(/\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
      rows.push({ p: pid.value, u: lab ? lab[2] : '', rev: !!(field(tr, 'isReverseHolo') || {}).checked, q: amt, price: isNaN(p) ? null : p,
        lang: LANG_CODE[(field(tr, 'idLanguage') || {}).value] || 'it', cond: +((field(tr, 'idCondition') || {}).value || 2),
        com: (field(tr, 'comments') || {}).value || '' });
    });
    return rows;
  }
  // ---------- avanzamento della lista (anche tra pagine diverse del set) ----------
  const hashStr = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return 'l' + (h >>> 0).toString(36); };
  const listId = () => hashStr($('csInput').value.replace(/\s+/g, ' ').trim());
  const vkey = (num, rev) => norm(num) + '|' + (rev ? 'R' : 'N');
  const doneGet = () => { try { return JSON.parse(store.get('done_' + listId(), '{}')); } catch (e) { return {}; } };
  const doneSet = o => store.set('done_' + listId(), JSON.stringify(o));
  function wanted() {
    const w = new Map();
    parseInput($('csInput').value).items.forEach(it => {
      const k = vkey(it.num, it.rev);
      const x = w.get(k) || { num: it.num, rev: it.rev, qty: 0 };
      x.qty += it.qty; w.set(k, x);
    });
    return w;
  }
  function showProgress() {
    const w = wanted();
    const box = $('csProg');
    if (!w.size) { box.style.display = 'none'; return; }
    const done = doneGet(), here = pageRows();
    let tot = 0, sent = 0;
    const missHere = [], missOther = [];
    for (const [k, x] of w) {
      const d = Math.min(done[k] || 0, x.qty);
      tot += x.qty; sent += d;
      const left = x.qty - d;
      if (left > 0) (here.has(norm(x.num)) ? missHere : missOther).push(`${x.num}${x.rev ? 'R' : ''}${left > 1 ? '×' + left : ''}`);
    }
    box.style.display = 'block';
    box.innerHTML = `<b style="color:${sent >= tot ? '#3ecf6e' : '#ffcb05'}">📦 Lista: ${sent}/${tot} copie già inviate a Cardmarket</b>` +
      (missHere.length ? `<div>Da caricare <b>in questa pagina</b> (${missHere.length}): ${missHere.join(', ')}</div>` : '') +
      (missOther.length ? `<div style="color:#ff9f43">Da caricare <b>in altre pagine</b> o altri set (${missOther.length}): ${missOther.join(', ')}</div>` : '') +
      (sent >= tot ? '<div style="color:#3ecf6e">Tutta la lista è stata caricata ✔</div>' : '') +
      `<div style="text-align:right"><a href="#" id="csReset" style="color:#9aa3ad;font-size:11px">azzera avanzamento</a></div>`;
    $('csReset').onclick = e => { e.preventDefault(); if (confirm('Azzerare l\'avanzamento di questa lista?')) { doneSet({}); showProgress(); } };
  }
  $('csInput').addEventListener('input', showProgress);
  $('csFile').addEventListener('change', () => setTimeout(showProgress, 300));

  const pending = () => { try { return JSON.parse(store.get('pending', '[]')); } catch (e) { return []; } };
  function showGest() {
    const pd = pending();
    const n = pd.reduce((a, x) => a + x.rows.reduce((b, r) => b + r.q, 0), 0);
    $('csGest').style.display = pd.length ? 'block' : 'none';
    $('csGest').textContent = `✔ Aggiorna il gestionale (${n} carte messe in vendita)`;
  }
  // quando premi "Mettere in vendita le carte" registro esattamente quello che invii (prezzi compresi)
  let lastSnap = 0;
  function onSubmitted() {
    if (Date.now() - lastSnap < 3000) return; // clic e invio dello stesso modulo: registro una volta sola
    lastSnap = Date.now();
    const rows = snapshot();
    if (!rows.length) return;
    const pd = pending();
    const exp = expansion();
    pd.push({ exp: exp.id, name: exp.name, at: new Date().toISOString(), rows, cards: catalog() });
    store.set('pending', JSON.stringify(pd));
    const w = wanted(), done = doneGet();
    rows.forEach(r => { const k = vkey(r.u, r.rev); if (w.has(k)) done[k] = (done[k] || 0) + r.q; });
    doneSet(done);
    showProgress();
    log(`Registrate ${rows.reduce((a, r) => a + r.q, 0)} carte inviate a Cardmarket. Ora premi il pulsante verde.`, '#3ecf6e');
    showGest();
  }
  document.addEventListener('submit', e => { if (e.target === form) onSubmitted(); }, true);
  // il pulsante di Cardmarket sta fuori dal modulo (attributo form=): lo ascolto anche direttamente
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[type="submit"]');
    if (b && (b.getAttribute('form') === 'BulkListingForm' || b.form === form)) onSubmitted();
  }, true);
  function sendToGest(withListings) {
    const exp = expansion();
    const pd = withListings ? pending() : [];
    const exps = [...document.querySelectorAll('select[name="idExpansion"]')][0];
    const data = {
      v: 2, exp: { id: exp.id, name: exp.name, cards: catalog() },
      exps: exps ? [...exps.options].map(o => [o.value, o.textContent.trim()]).filter(x => x[0]) : [],
      listed: pd
    };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open(GEST_URL + '#cm2=' + encodeURIComponent(enc), 'gestionaleCarte');
    if (withListings) { store.set('pending', '[]'); showGest(); }
  }
  $('csGest').onclick = () => sendToGest(true);
  $('csCat').onclick = e => { e.preventDefault(); sendToGest(false); };
  showGest();
  showProgress();

  $('csGo').onclick = async () => {
    $('csGo').disabled = true;
    $('csLog').textContent = '';
    try { await run(); } catch (e) { log('Errore: ' + e.message, '#ff6b6b'); }
    $('csGo').disabled = false;
  };

  async function run() {
    const { lang, langCode, setName, setId, items } = parseInput($('csInput').value);
    const filled = [];
    if (!items.length) { log('Nessuna carta nella lista.', '#ff6b6b'); return; }
    const rows = pageRows();
    const wantPrice = $('csPrice').checked;
    const plus = Math.max(0, parseInt($('csPlus').value || '0', 10)) / 100;
    const comment = $('csComment').value.trim();
    const me = $('csMe').value.trim();
    if (wantPrice && !me) log('Suggerimento: scrivi il tuo nome utente, così le tue offerte non contano come "più bassa".', '#ff9f43');
    log(`${setName ? setName + ' · ' : ''}${LANG_NAME[lang]} · ${items.length} righe` +
        (wantPrice ? ` · prezzo = più bassa + ${Math.round(plus * 100)} cent.` : '') + (comment ? ` · commento "${comment}"` : ''));

    const byNum = new Map();
    const missing = [];
    const done = Object.assign({}, doneGet());
    let skipped = 0;
    for (const it0 of items) {
      // tolgo le copie già inviate a Cardmarket in precedenza (anche da un'altra pagina)
      const k0 = vkey(it0.num, it0.rev);
      const already = Math.min(done[k0] || 0, it0.qty);
      done[k0] = (done[k0] || 0) - already;
      skipped += already;
      if (it0.qty - already <= 0) continue;
      const it = Object.assign({}, it0, { qty: it0.qty - already });
      const k = norm(it.num);
      if (!rows.has(k)) { missing.push(it.num + (it.rev ? 'R' : '')); continue; }
      const g = byNum.get(k) || { row: rows.get(k), normal: 0, rev: 0, name: it.name, rarity: it.rarity };
      if (it.rev) g.rev += it.qty; else g.normal += it.qty;
      byNum.set(k, g);
    }
    if (skipped) log(`${skipped} copie della lista erano già state inviate: non le compilo di nuovo.`, '#9aa3ad');
    if (missing.length) log('Non in questa pagina (altra pagina del set o set sbagliato): ' + missing.join(', '), '#ff9f43');
    if (byNum.size > 100) log('Attenzione: più di 100 carte diverse, Cardmarket potrebbe non inserirle tutte in un solo invio.', '#ff9f43');

    let total = 0, warnings = 0;
    for (const [, g] of byNum) {
      const checks = [];
      if (sameName(g.name, g.row.name) === false) checks.push(`NOME diverso: app "${g.name}" / Cardmarket "${g.row.name}"`);
      if (sameRarity(g.rarity, g.row.rarity) === false) checks.push(`RARITÀ diversa: app "${g.rarity}" / Cardmarket "${g.row.rarity}"`);
      const warn = checks.length > 0;
      if (warn) warnings++;

      const variants = [];
      if (g.normal) variants.push({ rev: false, qty: g.normal });
      if (g.rev) variants.push({ rev: true, qty: g.rev });
      let first = true;
      for (const v of variants) {
        const revEl = field(g.row.tr, 'isReverseHolo');
        if (v.rev && (!revEl || revEl.disabled)) {
          log(`${g.row.label}: non esiste in versione Reverse su Cardmarket, saltata (controlla la carta).`, '#ff6b6b');
          continue;
        }
        let price = null, src = '';
        if (wantPrice && !blocked) {
          try {
            const res = await lowest(g.row, v.rev, lang, me);
            src = res.src;
            if (res.base != null) {
              price = Math.max(MIN_PRICE, Math.round((res.base + plus) * 100) / 100);
              src += `: ${res.base.toFixed(2)}${plus ? ' + ' + plus.toFixed(2) : ''}`;
            }
          } catch (e) { src = e.message; }
          await sleep(DELAY_MS);
        }
        if (price == null && wantPrice) {
          const t = trendOf(g.row.tr);
          if (t != null) { price = Math.max(MIN_PRICE, Math.round((t + plus) * 100) / 100); src += (src ? ' → ' : '') + 'USATA LA TENDENZA, controlla'; }
        }
        let tr = g.row.tr;
        if (!first) {
          tr = await duplicate(g.row.tr);
          if (!tr) { log(`${g.row.label}: non riesco a duplicare la riga per la Reverse, inseriscila a mano.`, '#ff6b6b'); continue; }
        }
        first = false;
        fillRow(tr, { lang, rev: v.rev, qty: v.qty, price, comment, warn });
        filled.push({ num: g.row.num.replace(/^0+(?=\d)/, ''), rev: v.rev, qty: v.qty, price, name: g.name || g.row.name, rarity: g.rarity || '' });
        total += v.qty;
        log(`${g.row.label} [${v.rev ? 'REVERSE' : 'normale'}] · ${g.row.rarity || '?'} ×${v.qty} → ${price != null ? price.toFixed(2) + ' €' : 'prezzo vuoto'}` +
            (src ? `  (${src})` : ''), (price == null && wantPrice) || /TENDENZA/.test(src) ? '#ff9f43' : null);
      }
      checks.forEach(c => log('   ⚠ ' + c, '#ff9f43'));
    }
    log(`\nCompilate ${total} copie. Verde = normali, viola = Reverse, arancione = da controllare (${warnings}).`, '#3ecf6e');
    log('Controlla e poi premi il pulsante di invio di Cardmarket in fondo alla pagina.', '#3ecf6e');
    if (filled.length) log('Dopo il controllo premi "Mettere in vendita le carte" di Cardmarket: comparirà il pulsante verde per aggiornare il gestionale.', '#3ecf6e');
    if (blocked) log('Cardmarket ha bloccato le ricerche prezzi: per le carte restanti è stata usata la tendenza. Riprova tra qualche minuto.', '#ff9f43');
  }
})();
