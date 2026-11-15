// Card Scanner → Cardmarket "Inserisci carte bulk"
// Compila le righe della pagina con la lista dell'app, controlla nome e rarità,
// e imposta il prezzo = "Da" (prezzo minimo) oppure "Tendenza" ± i centesimi scelti.
// I due valori li legge dalla pagina stessa (campi nascosti di ogni riga): nessuna richiesta a Cardmarket.
// Non invia nulla da solo.
(() => {
  // ---------- elenco preparato dal gestionale ("Apri su Cardmarket") ----------
  // arriva nel nome della scheda (window.name = "csjob=…") e resta salvato in cardmarket.com finché non è tutto inviato
  const JKEY = 'cs_job';
  const jobGet = () => { try { return JSON.parse(localStorage.getItem(JKEY)) || null; } catch (e) { return null; } };
  function intake(txt) {
    const m = String(txt || '').trim().match(/^csjob=(.+)$/);
    if (!m) return false;
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (!j || !Array.isArray(j.items)) return false;
      localStorage.setItem(JKEY, JSON.stringify(j));
      return true;
    } catch (e) { return false; }
  }
  if (intake(window.name)) {
    try { window.name = ''; } catch (e) {}
    if (window.__csPanel) { window.__csPanel.remove(); window.__csPanel = null; } // elenco nuovo: rifaccio il pannello
  }
  if (window.__csPanel) { window.__csPanel.style.display = 'block'; return; }

  const form = document.getElementById('BulkListingForm');
  if (!form) {
    const j = jobGet();
    const sel = document.querySelector('select[name="idExpansion"]');
    const simp0 = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (j && !j.done) {
      const opt = sel && [...sel.options].find(o => simp0(o.textContent) === simp0(j.set));
      const id = j.cm || (opt ? opt.value : '');
      if (confirm(`Il gestionale ha preparato ${j.items.reduce((a, it) => a + it.q, 0)} copie di "${j.set}".\n\nVado alla pagina "Inserisci carte bulk"${id ? ' del set' : ''}? Quando si apre, premi di nuovo il pulsante Card Scanner.`))
        location.href = '/it/Pokemon/Stock/ListingMethods/BulkListing' + (id ? '?idExpansion=' + encodeURIComponent(id) : '');
      return;
    }
    alert('Apri prima la pagina "Inserisci carte bulk" di Cardmarket per un\'espansione, poi premi di nuovo il pulsante.\n\nSe hai preparato le carte nel gestionale ("Apri su Cardmarket"), apri Cardmarket da lì.');
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
    <div id="csJob" style="display:none;margin-bottom:8px;padding:8px;border-radius:8px;background:#12324a;font-size:12.5px"></div>
    <div style="margin-bottom:6px">📄 <input type="file" id="csFile" accept=".txt,.html,.htm,text/*" style="font-size:12px;width:85%"></div>
    <textarea id="csInput" placeholder="…oppure incolla qui la lista dell'app"
      style="width:100%;height:110px;box-sizing:border-box;${inp};font:12px monospace"></textarea>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin:8px 0">
      <span>Commento</span><input id="csComment" style="${inp}" placeholder="es. Collezione privata">
      <span>Prezzo</span><span><input type="checkbox" id="csPrice" checked>
        <select id="csBase" style="${inp}"><option value="low">"Da" (prezzo minimo)</option><option value="trend">Tendenza</option></select>
        <select id="csSign" style="${inp}"><option value="1">+</option><option value="-1">−</option></select>
        <input id="csPlus" type="number" min="0" step="1" style="${inp};width:60px"> cent.</span>
      <span></span><span style="font-size:11.5px;color:#9aa3ad">es. 150 cent. = 1,50 €. Prezzo minimo 0,02 €.</span>
    </div>
    <div id="csProg" style="margin:0 0 8px;padding:8px;border-radius:8px;background:#0d1014;font-size:12.5px;display:none;max-height:38vh;overflow:auto"></div>
    <button id="csGo" style="width:100%;padding:10px;border:0;border-radius:8px;background:#ffcb05;color:#111;font-weight:700;cursor:pointer">Compila la pagina</button>
    <div id="csLog" style="margin-top:10px;font:12px/1.45 monospace;white-space:pre-wrap"></div>
    <button id="csGest" style="display:none;width:100%;margin-top:10px;padding:10px;border:0;border-radius:8px;background:#3ecf6e;color:#111;font-weight:700;cursor:pointer"></button>
    <div style="margin-top:8px;text-align:right"><a href="#" id="csClip" style="color:#9aa3ad;font-size:12px">Incolla elenco dal gestionale</a> · <a href="#" id="csCat" style="color:#9aa3ad;font-size:12px">Invia solo l'elenco di questo set al gestionale</a></div>`;
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

  function syncComment(force) {
    const m = $('csInput').value.match(/^COMMENTO\s+(.*)$/mi);
    if (m && (force || !$('csComment').value)) { $('csComment').value = m[1].trim(); store.set('comment', $('csComment').value); }
  }

  // valori ricordati (servono anche per la seconda pagina del set)
  $('csInput').value = store.get('list', '');
  const plus0 = parseInt(store.get('plus', '0'), 10) || 0;
  $('csPlus').value = String(Math.abs(plus0));
  $('csSign').value = plus0 < 0 ? '-1' : store.get('sign', '1');
  $('csBase').value = store.get('base', 'low');
  $('csComment').value = store.get('comment', '');
  $('csInput').addEventListener('input', () => { store.set('list', $('csInput').value); syncComment(); });
  $('csPlus').addEventListener('input', () => store.set('plus', String(Math.abs(parseInt($('csPlus').value || '0', 10) || 0))));
  $('csSign').addEventListener('change', () => store.set('sign', $('csSign').value));
  $('csBase').addEventListener('change', () => store.set('base', $('csBase').value));
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
    else if (o.err) setVal(field(tr, 'price'), ''); // la riga duplicata per la Reverse non deve tenere il prezzo della normale
    if (o.comment) setVal(field(tr, 'comments'), o.comment);
    // regola del prezzo (per il controllo giornaliero nel gestionale)
    if (o.rule) { tr.dataset.csB = o.rule.b; tr.dataset.csO = String(o.rule.o); tr.dataset.csRef = o.rule.ref != null ? String(o.rule.ref) : ''; tr.dataset.csP = o.price != null ? o.price.toFixed(2) : ''; tr.dataset.csM = o.rule.m ? '1' : ''; }
    else { delete tr.dataset.csB; delete tr.dataset.csO; delete tr.dataset.csRef; delete tr.dataset.csP; delete tr.dataset.csM; }
    tr.style.outline = '3px solid ' + (o.err ? '#ff3b3b' : o.warn ? '#ff9f43' : o.rev ? '#cc5de8' : '#3ecf6e');
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
  // Ogni riga della pagina "Inserisci carte bulk" ha i campi nascosti lowPrice ("Da") e trendPrice (tendenza).
  function hidden(tr, n) {
    const el = tr.querySelector(`input[name="${n}"]`) || field(tr, n);
    const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
    return isNaN(v) || v <= 0 ? null : v;
  }
  // Per le Reverse la pagina dà i valori della versione normale: provo la Price Guide pubblica di Cardmarket,
  // che ha anche "Da" e tendenza delle Reverse (campi -holo). Se non si scarica, uso quelli della normale.
  const PG_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json';
  let pg = null, pgTried = false;
  async function priceGuide(pids) {
    if (pgTried) return pg;
    pgTried = true;
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(PG_URL, { signal: ctl.signal }); clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.priceGuides || d.priceguides || []);
      pg = {};
      list.forEach(x => { if (pids.has(String(x.idProduct))) pg[x.idProduct] = x; });
      log(`Price Guide di Cardmarket scaricata (${d.createdAt ? new Date(d.createdAt).toLocaleDateString('it-IT') : 'oggi'}): uso i prezzi Reverse.`, '#9aa3ad');
    } catch (e) { pg = null; log('Price Guide non scaricabile da qui (' + (e.message || e) + '): le Reverse senza prezzo restano VUOTE, da scrivere a mano.', '#ff9f43'); }
    return pg;
  }
  const BASE_NAME = { low: 'Da', trend: 'Tendenza' };
  /** valore dall'elenco del gestionale (Da e Tendenza della variante giusta, Normale o Reverse); null = non c'è */
  function jobValue(ji, rev, base) {
    const other = base === 'low' ? 'trend' : 'low';
    const val = { low: ji.lo, trend: ji.t };
    const tag = rev ? ' Reverse' : '';
    if (ji.mp != null) return { fixed: +ji.mp, v: val[base] ?? val[other] ?? null, used: val[base] != null ? base : other, src: 'prezzo scritto da te nel gestionale' };
    if (val[base] != null) return { v: +val[base], used: base, src: `${BASE_NAME[base]}${tag} (gestionale)` };
    if (val[other] != null) return { v: +val[other], used: other, src: `${BASE_NAME[other]}${tag} (gestionale, manca ${BASE_NAME[base]})`, warn: true };
    return null;
  }
  /** valore base per la riga: {v, src, warn} */
  function baseValue(tr, rev, base) {
    const pid = (field(tr, 'idProduct') || {}).value;
    const other = base === 'low' ? 'trend' : 'low';
    if (rev && pg && pg[pid]) {
      const x = pg[pid];
      const pick = k => { const v = +x[k + '-holo']; return v > 0 ? v : null; };
      const v = pick(base);
      if (v != null) return { v, used: base, src: `${BASE_NAME[base]} Reverse` };
      const w = pick(other);
      if (w != null) return { v: w, used: other, src: `${BASE_NAME[other]} Reverse (manca ${BASE_NAME[base]})`, warn: true };
    }
    // per una Reverse NON uso mai i valori della pagina (sono della versione normale)
    if (rev) return { v: null, src: 'MANCA il prezzo Reverse: scrivilo a mano', warn: true };
    const val = { low: hidden(tr, 'lowPrice'), trend: hidden(tr, 'trendPrice') };
    const tag = '';
    if (val[base] != null) return { v: val[base], used: base, src: BASE_NAME[base] + ' (pagina Cardmarket)' };
    if (val[other] != null) return { v: val[other], used: other, src: `${BASE_NAME[other]}${tag} (manca ${BASE_NAME[base]})`, warn: true };
    return { v: null, src: 'nessun prezzo sulla pagina', warn: true };
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
        com: (field(tr, 'comments') || {}).value || '',
        // regola e valore di mercato al caricamento; se hai cambiato il prezzo a mano la regola resta ma vale il tuo prezzo
        b: tr.dataset.csB || null, o: tr.dataset.csO != null ? +tr.dataset.csO : null, ref: tr.dataset.csRef ? +tr.dataset.csRef : null,
        man: tr.dataset.csM === '1' || (tr.dataset.csP != null && !isNaN(p) && tr.dataset.csP !== p.toFixed(2)) ? 1 : 0 });
    });
    return rows;
  }
  // ---------- avanzamento della lista (anche tra pagine diverse del set) ----------
  const hashStr = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return 'l' + (h >>> 0).toString(36); };
  // con l'elenco del gestionale l'avanzamento è legato a quell'elenco (ogni "Apri su Cardmarket" riparte da zero:
  // le carte in Standby nel gestionale sono per definizione ancora da caricare); altrimenti al testo della lista
  const listId = () => { const aj = activeJob(); return aj ? 'job' + hashStr(String(aj.at)) : hashStr($('csInput').value.replace(/\s+/g, ' ').trim()); };
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
    const aj = activeJob();
    if (aj && !left) { aj.done = true; try { localStorage.setItem(JKEY, JSON.stringify(aj)); } catch (e) {} }
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
  // ---------- elenco dal gestionale ----------
  function jobText(j) {
    return ['CARDSCANNER 2', `SET ${j.set} | ${j.lang || 'it'}${j.sid ? ' | ' + j.sid : ''}`, j.com ? 'COMMENTO ' + j.com : '',
      ...j.items.map(it => `${it.u} | x${it.q} | ${it.rev ? 'R' : 'N'} | ${it.n || ''} | ${it.r || ''}`)].filter(Boolean).join('\n');
  }
  const simpN = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sameSet = (a, b) => { a = simpN(a); b = simpN(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
  /** l'elenco del gestionale vale se la lista nel riquadro è proprio quella */
  function activeJob() {
    const j = jobGet();
    return j && !j.done && $('csInput').value.trim() === jobText(j).trim() ? j : null;
  }
  function showJob() {
    const j = jobGet(), box = $('csJob');
    if (!j || j.done) { box.style.display = 'none'; return; }
    const copies = j.items.reduce((a, it) => a + it.q, 0);
    const eurS = v => Math.abs(v / 100).toFixed(2).replace('.', ',') + ' €';
    const rule = `${BASE_NAME[j.base] || j.base}${j.plus ? ` ${j.plus > 0 ? '+' : '−'} ${eurS(j.plus)}` : ''}`;
    box.style.display = 'block';
    const exp = expansion();
    if (!sameSet(j.set, exp.name)) {
      const sel = document.querySelector('select[name="idExpansion"]');
      const opt = sel && [...sel.options].find(o => sameSet(o.textContent, j.set));
      const id = j.cm || (opt ? opt.value : '');
      box.innerHTML = `📋 Il gestionale ha preparato <b>${esc(j.set)}</b> (${copies} copie), ma questa pagina è <b>${esc(exp.name || '?')}</b>.` +
        (id ? ` <a href="#" id="csJobGo" style="color:#ffcb05">Vai a ${esc(j.set)} →</a>` : ' Scegli il set giusto in alto e premi di nuovo il pulsante.');
      if (id) $('csJobGo').onclick = e => { e.preventDefault(); location.href = location.pathname + '?idExpansion=' + encodeURIComponent(id); };
      return;
    }
    if (!activeJob()) {
      $('csInput').value = jobText(j); store.set('list', $('csInput').value);
      $('csComment').value = j.com || ''; store.set('comment', $('csComment').value);
    }
    $('csBase').value = j.base === 'trend' ? 'trend' : 'low'; store.set('base', $('csBase').value);
    $('csSign').value = j.plus < 0 ? '-1' : '1'; store.set('sign', $('csSign').value);
    $('csPlus').value = String(Math.abs(j.plus || 0)); store.set('plus', $('csPlus').value);
    $('csPrice').checked = true;
    const nM = j.items.filter(it => it.mp != null).length, nMiss = j.items.filter(it => it.mp == null && it.lo == null && it.t == null).length;
    box.innerHTML = `📋 <b>Elenco dal gestionale</b>: ${esc(j.set)} · ${j.items.length} righe, ${copies} copie · prezzo <b>${rule}</b>, calcolato a parte per Normali e Reverse` +
      (nM ? ` · ${nM} prezzi scritti da te` : '') + (nMiss ? ` · <span style="color:#ff6b6b">${nMiss} senza prezzo di mercato</span>` : '') +
      `<div style="color:#9aa3ad;margin-top:3px">Preparato il ${new Date(j.at).toLocaleString('it-IT')}. Premi "Compila la pagina".</div>`;
  }
  $('csClip').onclick = async e => {
    e.preventDefault();
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch (er) { t = prompt('Incolla qui il testo copiato dal gestionale (inizia con csjob=)') || ''; }
    if (intake(t)) { showJob(); showProgress(); showGest(); log('Elenco dal gestionale caricato ✔', '#3ecf6e'); }
    else alert('Negli appunti non c\'è un elenco del gestionale. Nel gestionale premi "Apri su Cardmarket".');
  };
  showJob();
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
    const base = $('csBase').value === 'trend' ? 'trend' : 'low';
    const plus = (+$('csSign').value || 1) * Math.abs(parseInt($('csPlus').value || '0', 10) || 0) / 100;
    const comment = $('csComment').value.trim();
    const fmtPlus = plus ? ` ${plus > 0 ? '+' : '−'} ${Math.abs(plus).toFixed(2).replace('.', ',')} €` : '';
    log(`${setName ? setName + ' · ' : ''}${LANG_NAME[lang]} · ${items.length} righe` +
        (wantPrice ? ` · prezzo = ${BASE_NAME[base]}${fmtPlus}` : '') + (comment ? ` · commento "${comment}"` : ''));

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
    if (skipped) log(`${skipped} copie della lista erano già state inviate al gestionale: non le compilo di nuovo.` +
      (!byNum.size ? ' Se non è vero, premi "azzera avanzamento" sotto la lista e poi di nuovo "Compila la pagina".' : ''), byNum.size ? '#9aa3ad' : '#ff9f43');
    if (missing.length) log('Non in questa pagina (altra pagina del set o set sbagliato): ' + missing.join(', '), '#ff9f43');
    if (byNum.size > 100) log('Attenzione: più di 100 carte diverse, Cardmarket potrebbe non inserirle tutte in un solo invio.', '#ff9f43');

    let total = 0, warnings = 0, noPrice = 0;
    const job = activeJob();
    const jobMap = job ? new Map(job.items.map(it => [norm(it.u) + '|' + (it.rev ? 'R' : 'N'), it])) : null;
    if (job) log(`Prezzi dall'elenco del gestionale (${job.items.length} righe, calcolati per Normali e Reverse).`, '#9aa3ad');
    // la Price Guide serve solo per le Reverse che l'elenco del gestionale non copre
    const revNoJob = [...byNum.entries()].some(([gk, g]) => g.rev && !(jobMap && (() => { const ji = jobMap.get(gk + '|R'); return ji && (ji.mp != null || ji.lo != null || ji.t != null); })()));
    if (wantPrice && revNoJob) {
      const pids = new Set([...byNum.values()].map(g => String((field(g.row.tr, 'idProduct') || {}).value)));
      await priceGuide(pids);
    }
    for (const [gk, g] of byNum) {
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
        let price = null, src = '', pwarn = false, rule = null;
        if (wantPrice) {
          const ji = jobMap && jobMap.get(gk + '|' + (v.rev ? 'R' : 'N'));
          const b = (ji && jobValue(ji, v.rev, base)) || baseValue(g.row.tr, v.rev, base);
          src = b.src; pwarn = !!b.warn;
          if (b.fixed != null) {
            price = Math.max(MIN_PRICE, Math.round(b.fixed * 100) / 100);
            rule = { b: b.used, o: Math.round(plus * 100), ref: b.v, m: 1 };
            src += `: ${price.toFixed(2)}`;
          } else if (b.v != null) {
            price = Math.max(MIN_PRICE, Math.round((b.v + plus) * 100) / 100);
            rule = { b: b.used, o: Math.round(plus * 100), ref: b.v };
            src += `: ${b.v.toFixed(2)}${fmtPlus}`;
          } else noPrice++;
        }
        let tr = g.row.tr;
        if (!first) {
          tr = await duplicate(g.row.tr);
          if (!tr) { log(`${g.row.label}: non riesco a duplicare la riga per la Reverse, inseriscila a mano.`, '#ff6b6b'); continue; }
        }
        first = false;
        fillRow(tr, { lang, rev: v.rev, qty: v.qty, price, comment, rule, err: wantPrice && price == null, warn: warn || (wantPrice && (price == null || pwarn)) });
        filled.push({ num: g.row.num.replace(/^0+(?=\d)/, ''), rev: v.rev, qty: v.qty, price, name: g.name || g.row.name, rarity: g.rarity || '' });
        total += v.qty;
        if (!warn && wantPrice && (price == null || pwarn)) warnings++;
        log(`${g.row.label} [${v.rev ? 'REVERSE' : 'normale'}] · ${g.row.rarity || '?'} ×${v.qty} → ${price != null ? price.toFixed(2) + ' €' : 'prezzo vuoto'}` +
            (src ? `  (${src})` : ''), wantPrice && (price == null || pwarn) ? '#ff9f43' : null);
      }
      checks.forEach(c => log('   ⚠ ' + c, '#ff9f43'));
    }
    if (noPrice) log(`\n⚠ ${noPrice} righe SENZA PREZZO (bordo rosso): scrivi tu il prezzo prima di metterle in vendita.`, '#ff3b3b');
    log(`\nCompilate ${total} copie. Verde = normali, viola = Reverse, arancione = da controllare (${warnings}).`, '#3ecf6e');
    showGest();
    if (filled.length) log('Controlla la pagina, poi premi il pulsante verde "Invia al gestionale". La messa in vendita su Cardmarket la fai tu.', '#3ecf6e');
  }
})();
