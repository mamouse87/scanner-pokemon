// Card Scanner → Cardmarket "Inserisci carte bulk"
// Compila le righe della pagina con la lista dell'app, controlla nome e rarità,
// e imposta il prezzo = offerta più bassa (lingua della lista, Near Mint o migliore,
// escluse le tue offerte) + i centesimi scelti. Non invia nulla da solo.
(() => {
  // revisione prezzi chiesta dal gestionale (funziona su qualunque pagina di Cardmarket)
  // fuori dalla pagina "Inserisci carte bulk" il pulsante fa la revisione prezzi chiesta dal gestionale
  if (/#csrev=/.test(location.hash) || /^csrev=/.test(window.name || '') || window.__csRev || !document.getElementById('BulkListingForm')) {
    priceReview(); return;
  }
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
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    <div id="csProg" style="margin:0 0 8px;padding:8px;border-radius:8px;background:#0d1014;font-size:12.5px;display:none;max-height:38vh;overflow:auto"></div>
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
      const num = n => { const v = parseFloat((tr.querySelector(`input[name="${n}"]`) || {}).value || ''); return isNaN(v) ? null : v; };
      if (cards.some(c => c.p === pid.value)) return; // righe duplicate
      cards.push({ p: pid.value, n: m ? m[1].trim() : full, c: m ? m[2] : '', u: m ? m[3] : '', ur: a.getAttribute('href') || '', r: rar ? (rar.getAttribute('title') || rar.getAttribute('data-bs-original-title') || '') : '',
        i: img, h: revEl && !revEl.disabled ? 1 : 0, m: myP > 0 ? myP : null, t: num('trendPrice'), l: num('lowPrice'), a30: num('avg30Price') });
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
  const curPage = () => parseInt(new URLSearchParams(location.search).get('site') || '1', 10) || 1;
  function pageUrl(n) { const u = new URL(location.href); if (n > 1) u.searchParams.set('site', n); else u.searchParams.delete('site'); return u.href; }
  function lastPage() {
    // numero di pagine del set, dai link di paginazione della pagina
    let max = curPage();
    document.querySelectorAll('a[href*="site="]').forEach(a => { const m = a.getAttribute('href').match(/[?&]site=(\d+)/); if (m) max = Math.max(max, +m[1]); });
    return max;
  }
  function showProgress() {
    const box = $('csProg');
    const list = parseInput($('csInput').value).items;
    if (!list.length) { box.style.display = 'none'; return; }
    const done = Object.assign({}, doneGet()), here = pageRows();
    let tot = 0, sent = 0, hereLeft = 0, otherLeft = 0;
    const rowsHtml = list.map(it => {
      const k = vkey(it.num, it.rev);
      const d = Math.min(done[k] || 0, it.qty);
      done[k] = (done[k] || 0) - d;
      tot += it.qty; sent += d;
      const left = it.qty - d;
      const isHere = here.has(norm(it.num));
      if (left) { if (isHere) hereLeft += left; else otherLeft += left; }
      const st = !left ? '<span style="color:#3ecf6e">✔ inviata</span>'
        : isHere ? '<span style="color:#ffcb05">da compilare qui</span>' : '<span style="color:#ff9f43">in un\'altra pagina</span>';
      return `<tr style="${left ? '' : 'opacity:.5'}"><td>${esc(it.num)}</td><td>${esc(it.name || '')}${it.rev ? ' <b style="color:#cc5de8">R</b>' : ''}</td>` +
        `<td style="text-align:right">${left ? '×' + left : '×' + it.qty}</td><td>${st}</td></tr>`;
    }).join('');
    box.style.display = 'block';
    box.innerHTML = `<b style="color:${sent >= tot ? '#3ecf6e' : '#ffcb05'}">📦 Lista: ${sent}/${tot} copie inviate al gestionale</b>` +
      `<div style="color:#9aa3ad">Da compilare: ${hereLeft} in questa pagina · ${otherLeft} in altre pagine</div>` +
      `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px">${rowsHtml}</table>` +
      `<div style="text-align:right"><a href="#" id="csReset" style="color:#9aa3ad;font-size:11px">azzera avanzamento</a></div>`;
    $('csReset').onclick = e => { e.preventDefault(); if (confirm('Azzerare l\'avanzamento di questa lista?')) { doneSet({}); showProgress(); } };
  }
  $('csInput').addEventListener('input', showProgress);
  $('csFile').addEventListener('change', () => setTimeout(showProgress, 300));

  function showGest(state) {
    const b = $('csGest');
    const n = snapshot().reduce((a, r) => a + r.q, 0);
    if (state === 'sent') { b.style.display = 'block'; b.disabled = true; b.style.opacity = '.6'; b.textContent = '✔ Inviate al gestionale'; return; }
    b.disabled = false; b.style.opacity = '1';
    b.style.display = n ? 'block' : 'none';
    b.textContent = `📤 Invia al gestionale le carte compilate (${n})`;
  }
  function sendCompiled() {
    const rows = snapshot();
    if (!rows.length) { log('Nessuna carta compilata in questa pagina.', '#ff6b6b'); return; }
    const exp = expansion();
    const entry = { exp: exp.id, name: exp.name, at: new Date().toISOString(), rows, cards: catalog() };
    // segno nella lista le carte inviate
    const w = wanted(), done = doneGet();
    rows.forEach(r => { const k = vkey(r.u, r.rev); if (w.has(k)) done[k] = (done[k] || 0) + r.q; });
    doneSet(done);
    sendToGest([entry]);
    showProgress();
    showGest('sent');
    const left = [...w.entries()].reduce((a, [k, x]) => a + Math.max(0, x.qty - (done[k] || 0)), 0);
    log(`Inviate al gestionale ${rows.reduce((a, r) => a + r.q, 0)} copie. Ora puoi metterle in vendita su Cardmarket.` +
      (left ? ` Restano ${left} copie della lista da compilare in altre pagine.` : ' Tutta la lista è stata inviata ✔'), left ? '#ff9f43' : '#3ecf6e');
  }
  function sendToGest(listed) {
    const exp = expansion();
    const exps = document.querySelector('select[name="idExpansion"]');
    const data = {
      v: 2, exp: { id: exp.id, name: exp.name, cards: catalog() },
      exps: exps ? [...exps.options].map(o => [o.value, o.textContent.trim()]).filter(x => x[0]) : [],
      listed: listed || []
    };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open(GEST_URL + '#cm2=' + encodeURIComponent(enc), 'gestionaleCarte');
  }
  $('csGest').onclick = sendCompiled;
  $('csCat').onclick = e => { e.preventDefault(); sendToGest([]); };
  form.addEventListener('input', () => { if (!$('csGest').disabled) showGest(); });
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
    showGest();
    if (filled.length) log('Controlla la pagina, poi premi il pulsante verde "Invia al gestionale". La messa in vendita su Cardmarket la fai tu.', '#3ecf6e');
    if (blocked) log('Cardmarket ha bloccato le ricerche prezzi: per le carte restanti è stata usata la tendenza. Riprova tra qualche minuto.', '#ff9f43');
  }

  // ================= REVISIONE PREZZI =================
  // Il gestionale apre Cardmarket con #csrev=<elenco delle carte in vendita>.
  // Per ogni carta leggo: "Da" = offerta più bassa nella lingua della carta, Near Mint o migliore,
  // escluse le tue; "Tendenza di prezzo" dal riquadro informazioni. Poi rimando tutto al gestionale.
  // Legge soltanto: non modifica le tue offerte.
  async function priceReview() {
    const GEST = 'https://mamouse87.github.io/scanner-pokemon/gestionale/';
    const WAIT = 1300;
    const LID = { it: 5, en: 1, fr: 2, de: 3, es: 4, pt: 8 };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const H = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const S = {
      get: (k, d) => { try { const v = localStorage.getItem('cs_' + k); return v == null ? d : v; } catch (e) { return d; } },
      set: (k, v) => { try { localStorage.setItem('cs_' + k, v); } catch (e) {} },
      json: (k, d) => { try { return JSON.parse(S.get(k, '')) || d; } catch (e) { return d; } }
    };
    const eu = v => v == null ? '—' : v.toFixed(2).replace('.', ',') + ' €';

    let job = null;
    // l'elenco arriva nel nome della scheda (Cardmarket cancella la parte dopo # dell'indirizzo); il # resta come ripiego
    let hm = (window.name || '').match(/^csrev=(.+)$/) || location.hash.match(/#csrev=([^&]+)/);
    if (!hm) {
      // terzo modo: il gestionale copia l'elenco negli appunti (Chrome può chiedere il permesso di leggerli)
      try { const t = (await navigator.clipboard.readText()).trim(); hm = t.match(/^csrev=(.+)$/); if (hm) navigator.clipboard.writeText('').catch(() => {}); } catch (e) {}
    }
    if (window.__csRev) {
      if (!hm) { window.__csRev.style.display = 'block'; return; }
      window.__csRevStop && window.__csRevStop(); window.__csRev.remove(); window.__csRev = null; // arriva un elenco nuovo
    }
    if (hm) {
      try { window.name = ''; } catch (e) {}
      try {
        job = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(hm[1])))));
        S.set('revlist', JSON.stringify(job)); S.set('revres', '{}');
      } catch (e) { alert('Elenco dal gestionale non leggibile: riprova dal gestionale.'); }
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!job) job = S.json('revlist', null);
    if (!job || !job.items || !job.items.length) { alert('Questo pulsante si usa sulla pagina "Inserisci carte bulk" di un\'espansione.\n\nPer la revisione prezzi parti dal gestionale: "Revisione prezzi" → "Controlla su Cardmarket", poi premi qui il pulsante (se Chrome chiede di leggere gli appunti, consenti).'); return; }
    const res = S.json('revres', {});

    const P = document.createElement('div');
    window.__csRev = P;
    P.style.cssText = 'position:fixed;top:12px;right:12px;width:470px;max-height:92vh;overflow:auto;z-index:99999;background:#1c2128;color:#e8eaed;' +
      'font:14px/1.4 system-ui,sans-serif;border-radius:12px;padding:14px;box-shadow:0 8px 30px rgba(0,0,0,.4)';
    const ip = 'background:#0d1014;color:#e8eaed;border:1px solid #333a44;border-radius:6px;padding:5px';
    const bt = c => `width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:${c};color:#111;font-weight:700;cursor:pointer`;
    P.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b style="color:#ffcb05">💶 Revisione prezzi</b>
        <button id="rvX" style="background:none;border:0;color:#e8eaed;font-size:18px;cursor:pointer">✕</button></div>
      <div id="rvInfo" style="font-size:13px;color:#9aa3ad"></div>
      <div style="margin:8px 0">Tuo utente <input id="rvMe" style="${ip};width:60%" placeholder="per escludere le tue offerte"></div>
      <div style="height:10px;background:#0d1014;border-radius:5px;overflow:hidden"><i id="rvBar" style="display:block;height:100%;width:0;background:#ffcb05"></i></div>
      <button id="rvGo" style="${bt('#ffcb05')}">▶ Avvia controllo</button>
      <button id="rvSend" style="${bt('#3ecf6e')};display:none"></button>
      <div id="rvLog" style="margin-top:10px;font:12px/1.45 monospace;white-space:pre-wrap"></div>
      <div style="margin-top:8px;text-align:right"><a href="#" id="rvDrop" style="color:#9aa3ad;font-size:11px">chiudi e dimentica questo elenco</a></div>`;
    document.body.appendChild(P);
    const q = id => P.querySelector('#' + id);
    const log = (t, c) => { const d = document.createElement('div'); if (c) d.style.color = c; d.textContent = t; q('rvLog').appendChild(d); P.scrollTop = P.scrollHeight; };
    q('rvMe').value = S.get('me', '');
    q('rvMe').oninput = () => S.set('me', q('rvMe').value);
    q('rvX').onclick = () => { stop = true; P.style.display = 'none'; };
    q('rvDrop').onclick = e => {
      e.preventDefault();
      if (!confirm('Chiudere la revisione e dimenticare questo elenco? (i prezzi già inviati al gestionale restano lì)')) return;
      stop = true; try { localStorage.removeItem('cs_revlist'); localStorage.removeItem('cs_revres'); } catch (er) {}
      P.remove(); window.__csRev = null;
    };

    const items = job.items;
    function status() {
      const done = items.filter(it => res[it.k] && !res[it.k].err).length;
      const left = items.length - done;
      q('rvBar').style.width = (done / items.length * 100) + '%';
      q('rvInfo').innerHTML = `Elenco dal gestionale: <b>${items.length}</b> carte · controllate <b>${done}</b>` +
        (left ? ` · mancano ${left} (circa ${Math.max(1, Math.ceil(left * WAIT * 1.15 / 60000))} min)` : ' ✔');
      q('rvGo').textContent = running ? '⏸ Ferma' : done && left ? '▶ Riprendi controllo' : done ? '↻ Ricontrolla tutto' : '▶ Avvia controllo';
      const b = q('rvSend');
      b.style.display = done ? 'block' : 'none';
      b.textContent = `📤 Invia prezzi al gestionale (${done} carte)`;
    }

    let blockedR = false;
    async function getDoc(url) {
      const r = await fetch(url, { credentials: 'include' });
      if (r.status === 429 || r.status === 403) { blockedR = true; throw new Error('Cardmarket ha rallentato le richieste (' + r.status + ')'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      if (/just a moment|attention required/i.test(d.title)) { blockedR = true; throw new Error('controllo anti-bot di Cardmarket'); }
      return d;
    }

    // indirizzo della pagina di ogni carta: se il gestionale non lo conosce lo cerco nella pagina "Inserisci carte bulk" del set
    const hrefs = S.json('href', {});
    items.forEach(it => { if (it.h) hrefs[it.p] = it.h; }); // indirizzi già noti al gestionale
    const bulkTrend = {};
    const numKey = n => { const x = String(n || '').toUpperCase().replace(/^[A-Z]*?(?=\d)/, ''); return /^\d+$/.test(x) ? String(parseInt(x, 10)) : x; };
    // 1° modo: l'elenco del set in modalità lista (Prodotti → Singole → espansione), una pagina alla volta
    async function fromSinglesList(exp, todo) {
      const known = list0 => list0.map(it => hrefs[it.p]).find(Boolean);
      let slug = (known(items.filter(it => it.e === exp)) || '').match(/\/Products\/Singles\/([^/?#]+)\//);
      slug = slug ? slug[1] : '';
      const code = (todo.find(it => it.c) || {}).c || '';
      for (let site = 1; site <= 15 && todo.some(it => !hrefs[it.p]) && !stop; site++) {
        const base = slug ? `/it/Pokemon/Products/Singles/${slug}?` : `/it/Pokemon/Products/Singles?idExpansion=${encodeURIComponent(exp)}&`;
        const d = await getDoc(base + `mode=list&idRarity=0&sortBy=collectorsnumber_asc&perSite=50&site=${site}`);
        const links = [...d.querySelectorAll('a[href*="/Products/Singles/"]')].map(a => a.getAttribute('href').split(/[?#]/)[0])
          .map(h => ({ h, m: h.match(/\/Products\/Singles\/([^/]+)\/[^/]*?-([A-Z][A-Z0-9]{1,5}?)(\d{1,3}[a-z]?)(?:-V\d+)?$/) })).filter(x => x.m);
        // se conosco la sigla del set (es. DLR) tengo solo quelle carte: evita di prendere carte di altri set
        let good = links.filter(x => !code || x.m[2].toUpperCase() === code.toUpperCase());
        if (!code && !slug && good.length) {
          // senza sigla tengo il set più presente nella pagina (scarto i "visualizzati di recente" di altri set)
          const cnt = {}; good.forEach(x => { cnt[x.m[1]] = (cnt[x.m[1]] || 0) + 1; });
          slug = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        }
        if (slug) good = good.filter(x => x.m[1] === slug);
        if (!good.length) { log(`Elenco del set (pagina ${site}): nessuna carta trovata — "${d.title.trim().slice(0, 60)}"`, '#9aa3ad'); await wait(WAIT); break; }
        if (!slug) slug = good[0].m[1];
        let added = 0;
        good.forEach(x => todo.forEach(it => {
          if (!hrefs[it.p] && numKey(it.u) === numKey(x.m[3])) { hrefs[it.p] = x.h; added++; }
        }));
        S.set('href', JSON.stringify(hrefs));
        log(`Elenco del set ${slug} pagina ${site}: ${good.length} carte lette, ${added} abbinate`, '#9aa3ad');
        await wait(WAIT);
        if (good.length < 20) break; // ultima pagina
      }
    }
    async function findHrefs(list) {
      list.forEach(it => { if (it.h) hrefs[it.p] = it.h; });
      const byExp = {};
      list.forEach(it => { if (!hrefs[it.p] && it.e) (byExp[it.e] = byExp[it.e] || []).push(it); });
      for (const [exp, todo] of Object.entries(byExp)) {
        try { await fromSinglesList(exp, todo); } catch (e) { log('Elenco del set: ' + e.message, '#ff9f43'); if (blockedR) throw e; }
      }
      // 2° modo (ripiego): la pagina "Inserisci carte bulk" del set
      const need = {};
      list.forEach(it => { if (!hrefs[it.p] && it.e) (need[it.e] = need[it.e] || new Set()).add(String(it.p)); });
      for (const [exp, set] of Object.entries(need)) {
        for (let site = 1; site <= 12 && set.size && !stop; site++) {
          const d = await getDoc(`/it/Pokemon/Stock/ListingMethods/BulkListing?sortBy=number&idExpansion=${encodeURIComponent(exp)}` + (site > 1 ? '&site=' + site : ''));
          let found = 0;
          d.querySelectorAll('input[name^="idProduct"]').forEach(inp => {
            const tr = inp.closest('tr'), a = tr && tr.querySelector('.col-product a');
            if (!inp.value || !a) return;
            found++;
            hrefs[inp.value] = a.getAttribute('href');
            set.delete(inp.value);
            const t = parseFloat((tr.querySelector('input[name="trendPrice"]') || {}).value || '');
            if (!isNaN(t)) bulkTrend[inp.value] = t;
          });
          S.set('href', JSON.stringify(hrefs));
          if (!found) log(`Pagina "Inserisci carte bulk" (${site}): nessuna carta — "${d.title.trim().slice(0, 60)}"`, '#9aa3ad');
          await wait(WAIT);
          if (!found) break;
        }
      }
    }

    async function check(it, me) {
      const u = new URL(hrefs[it.p], location.origin);
      u.searchParams.set('language', String(LID[it.l] || 5));
      u.searchParams.set('minCondition', '2');
      u.searchParams.set('isReverseHolo', it.r ? 'Y' : 'N');
      const d = await getDoc(u.href);
      const meL = (me || '').trim().toLowerCase();
      const prices = [];
      let mine = 0;
      [...new Set([...d.querySelectorAll('[id^="articleRow"], .article-row')])].forEach(ar => {
        const s = ar.querySelector('a[href*="/Users/"]');
        if (meL && s && s.textContent.trim().toLowerCase() === meL) { mine++; return; }
        const p = parsePrice((ar.querySelector('.price-container') || ar.querySelector('.col-offer') || ar).textContent);
        if (p != null) prices.push(p);
      });
      // riquadro informazioni: "Da", "Tendenza di prezzo"… (per le Reverse cerco la voce Reverse se c'è)
      const info = [];
      d.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') info.push([dt.textContent.trim().toLowerCase(), parsePrice(dd.textContent)]);
      });
      const isTrend = l => /tendenza|trend/.test(l);
      let t = null, tn = 0;
      if (it.r) { const x = info.find(([l, v]) => isTrend(l) && /reverse/.test(l) && v != null); if (x) t = x[1]; }
      if (t == null) {
        const x = info.find(([l, v]) => isTrend(l) && !/reverse/.test(l) && v != null);
        if (x) { t = x[1]; tn = it.r ? 1 : 0; }
        else if (bulkTrend[it.p] != null) { t = bulkTrend[it.p]; tn = it.r ? 1 : 0; }
      }
      const da = info.find(([l, v]) => /^(da|from|disponibile da)$/.test(l) && v != null);
      return { d: prices.length ? Math.min(...prices) : null, o: prices.length, mine, t, tn, a: da ? da[1] : null, at: new Date().toISOString() };
    }

    let running = false, stop = false;
    window.__csRevStop = () => { stop = true; };
    async function go() {
      if (running) { stop = true; return; }
      const me = q('rvMe').value.trim();
      if (!me && !confirm('Non hai scritto il tuo nome utente: le tue offerte verranno contate come concorrenti. Continuare?')) return;
      if (items.every(it => res[it.k] && !res[it.k].err)) { Object.keys(res).forEach(k => delete res[k]); S.set('revres', '{}'); q('rvLog').textContent = ''; }
      running = true; stop = false; blockedR = false; status();
      try {
        const todo = items.filter(it => !res[it.k] || res[it.k].err); // riprovo anche quelle non trovate prima
        if (todo.some(it => !it.h && !hrefs[it.p])) { log('Cerco le pagine delle carte nei set…', '#9aa3ad'); await findHrefs(todo); }
        for (const it of todo) {
          if (stop) break;
          const name = `${it.u} ${it.n || ''}${it.r ? ' (Reverse)' : ''} ${String(it.l || '').toUpperCase()}`;
          if (!hrefs[it.p]) { log(`${name}: pagina della carta non trovata, saltata`, '#ff9f43'); res[it.k] = { err: 'pagina non trovata', at: new Date().toISOString() }; continue; }
          try {
            const r = await check(it, me);
            res[it.k] = r;
            const tuo = it.m != null ? it.m : null;
            const diff = r.d != null && tuo != null ? tuo - r.d : null;
            log(`${name}: tuo ${eu(tuo)} · Da ${eu(r.d)}${r.o ? ` (${r.o} off.)` : ' (nessun altro)'} · Tendenza ${eu(r.t)}`,
              diff == null ? '#9aa3ad' : diff > 0.004 ? '#ff6b6b' : diff < -0.004 ? '#3ecf6e' : null);
          } catch (e) {
            log(`${name}: ${e.message}`, '#ff6b6b');
            if (blockedR) { log('Cardmarket ha bloccato le richieste: aspetta qualche minuto e premi "Riprendi". Quelle già controllate restano salvate.', '#ff9f43'); break; }
          }
          S.set('revres', JSON.stringify(res));
          status();
          await wait(WAIT);
        }
      } catch (e) { log('Errore: ' + e.message, '#ff6b6b'); }
      running = false; status();
      if (items.every(it => res[it.k])) log('Controllo finito ✔ Premi il pulsante verde per mandare i prezzi al gestionale.', '#3ecf6e');
    }
    q('rvGo').onclick = go;
    q('rvSend').onclick = () => {
      const out = {};
      items.forEach(it => { if (res[it.k]) out[it.k] = res[it.k]; });
      const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, at: new Date().toISOString(), res: out }))));
      window.open(GEST + '#cmprices=' + encodeURIComponent(enc), 'gestionaleCarte');
      log(`Inviati al gestionale i prezzi di ${Object.keys(out).length} carte.`, '#3ecf6e');
    };
    status();
  }
})();
