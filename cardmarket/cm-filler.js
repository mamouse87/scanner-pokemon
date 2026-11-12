// Card Scanner → Cardmarket "Inserisci carte bulk"
// Compila le righe della pagina con la lista copiata dall'app e imposta come prezzo
// l'offerta più bassa su Cardmarket nella lingua scelta, condizione Near Mint o migliore.
// Non invia nulla: l'invio lo fa l'utente con il pulsante di Cardmarket.
(() => {
  if (window.__csPanel) { window.__csPanel.style.display = 'block'; return; }

  const form = document.getElementById('BulkListingForm');
  if (!form) {
    alert('Apri prima la pagina "Inserisci carte bulk" di Cardmarket per un\'espansione, poi premi di nuovo il pulsante.');
    return;
  }

  const LANG = { it: 5, en: 1, fr: 2, de: 3, es: 4, pt: 8 };
  const LANG_NAME = { 1: 'Inglese', 2: 'Francese', 3: 'Tedesco', 4: 'Spagnolo', 5: 'Italiano', 8: 'Portoghese' };
  const DELAY_MS = 1300;   // pausa tra una ricerca prezzo e l'altra, per non sovraccaricare Cardmarket
  const MIN_PRICE = 0.02;  // minimo accettato da Cardmarket
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = n => /^\d+$/.test(n) ? String(parseInt(n, 10)) : n.toUpperCase();

  // ---------- pannello ----------
  const panel = document.createElement('div');
  window.__csPanel = panel;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;width:420px;max-height:90vh;overflow:auto;z-index:99999;' +
    'background:#1c2128;color:#e8eaed;font:14px/1.4 system-ui,sans-serif;border-radius:12px;padding:14px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.4)';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="color:#ffcb05">Card Scanner → Cardmarket</b>
      <button id="csClose" style="background:none;border:0;color:#e8eaed;font-size:18px;cursor:pointer">✕</button>
    </div>
    <textarea id="csInput" placeholder="Incolla qui la lista copiata dall'app (Lista → tocca il nome del set → Copia per Cardmarket)"
      style="width:100%;height:130px;box-sizing:border-box;background:#0d1014;color:#e8eaed;border:1px solid #333a44;border-radius:8px;padding:8px;font:12px monospace"></textarea>
    <label style="display:block;margin:8px 0"><input type="checkbox" id="csPrice" checked>
      Prezzo = offerta più bassa Near Mint nella lingua della lista</label>
    <button id="csGo" style="width:100%;padding:10px;border:0;border-radius:8px;background:#ffcb05;color:#111;font-weight:700;cursor:pointer">Compila la pagina</button>
    <div id="csLog" style="margin-top:10px;font:12px/1.45 monospace;white-space:pre-wrap"></div>`;
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
  // la lista resta salvata nel browser: serve per la seconda pagina del set
  try { $('csInput').value = localStorage.getItem('cardScannerList') || ''; } catch (e) {}
  $('csInput').addEventListener('input', () => { try { localStorage.setItem('cardScannerList', $('csInput').value); } catch (e) {} });

  // ---------- righe della pagina ----------
  function pageRows() {
    const map = new Map();
    form.querySelectorAll('tbody tr').forEach(tr => {
      const a = tr.querySelector('.col-product a');
      if (!a) return;
      const m = a.textContent.trim().match(/\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
      if (!m) return;
      const k = norm(m[2]);
      if (!map.has(k)) map.set(k, { tr, code: m[1], num: m[2], name: a.textContent.trim(), href: a.getAttribute('href') });
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
  function setCheck(el, v) {
    if (!el) return false;
    if (el.disabled) return !v;
    el.checked = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function fillRow(tr, o) {
    const revEl = field(tr, 'isReverseHolo');
    if (o.rev && (!revEl || revEl.disabled)) return false; // non esiste in Reverse: non compilo
    setVal(field(tr, 'idLanguage'), String(o.lang));
    setVal(field(tr, 'idCondition'), '2'); // Near Mint
    setCheck(revEl, o.rev);
    setVal(field(tr, 'amount'), String(o.qty));
    if (o.price != null) setVal(field(tr, 'price'), o.price.toFixed(2));
    tr.style.outline = '3px solid ' + (o.rev ? '#cc5de8' : '#3ecf6e');
    return true;
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

  // ---------- prezzo più basso ----------
  function trendOf(tr) {
    const el = tr.querySelector('input[name="trendPrice"]');
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? null : v;
  }
  function parsePrice(t) {
    const m = t.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/);
    return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null;
  }
  let blocked = false;
  async function lowest(row, rev, langId) {
    const u = new URL(row.href, location.origin);
    u.searchParams.set('language', String(langId));
    u.searchParams.set('minCondition', '2');
    u.searchParams.set('isReverseHolo', rev ? 'Y' : 'N');
    const r = await fetch(u.href, { credentials: 'include' });
    if (r.status === 429 || r.status === 403) { blocked = true; throw new Error('Cardmarket ha rallentato le richieste (' + r.status + ')'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const rows = doc.querySelectorAll('[id^="articleRow"]');
    const prices = [];
    rows.forEach(ar => {
      const pc = ar.querySelector('.price-container') || ar.querySelector('.col-offer') || ar;
      const p = parsePrice(pc.textContent);
      if (p != null) prices.push(p);
    });
    return { price: prices.length ? Math.min(...prices) : null, offers: rows.length, url: u.href };
  }

  // ---------- lista dall'app ----------
  function parseInput(text) {
    let lang = 5, setName = '';
    const items = [];
    text.split(/\r?\n/).forEach(line => {
      const l = line.trim();
      if (!l || l.startsWith('#') || /^CARDSCANNER/i.test(l)) return;
      const s = l.match(/^SET\s+(.*?)\s*\|\s*([a-z]{2})\s*$/i);
      if (s) { setName = s[1]; lang = LANG[s[2].toLowerCase()] || 5; return; }
      const m = l.match(/^([A-Z]*\d+)(R?)\s*x\s*(\d+)/i);
      if (m) items.push({ num: m[1], rev: m[2].toUpperCase() === 'R', qty: parseInt(m[3], 10) });
    });
    return { lang, setName, items };
  }

  $('csGo').onclick = async () => {
    $('csGo').disabled = true;
    $('csLog').textContent = '';
    try { await run(); } catch (e) { log('Errore: ' + e.message, '#ff6b6b'); }
    $('csGo').disabled = false;
  };

  async function run() {
    const { lang, setName, items } = parseInput($('csInput').value);
    if (!items.length) { log('Nessuna carta nella lista incollata.', '#ff6b6b'); return; }
    const rows = pageRows();
    const wantPrice = $('csPrice').checked;
    log(`${setName ? setName + ' · ' : ''}${LANG_NAME[lang]} · ${items.length} righe da inserire`);

    // raggruppa per numero: copie normali e Reverse
    const byNum = new Map();
    const missing = [];
    for (const it of items) {
      const k = norm(it.num);
      if (!rows.has(k)) { missing.push(it.num + (it.rev ? 'R' : '')); continue; }
      const g = byNum.get(k) || { row: rows.get(k), normal: 0, rev: 0 };
      if (it.rev) g.rev += it.qty; else g.normal += it.qty;
      byNum.set(k, g);
    }
    if (missing.length) log('Non presenti in questa pagina (sono nell\'altra pagina del set o il set è sbagliato): ' + missing.join(', '), '#ff9f43');
    if (byNum.size > 100) log('Attenzione: più di 100 carte diverse, Cardmarket potrebbe non inserirle tutte in un solo invio.', '#ff9f43');

    let done = 0, total = 0;
    for (const [, g] of byNum) {
      const variants = [];
      if (g.normal) variants.push({ rev: false, qty: g.normal });
      if (g.rev) variants.push({ rev: true, qty: g.rev });
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const revEl0 = field(g.row.tr, 'isReverseHolo');
        if (v.rev && (!revEl0 || revEl0.disabled)) {
          log(`${g.row.name}: non esiste in versione Reverse su Cardmarket, saltata (controlla la carta).`, '#ff6b6b');
          continue;
        }
        let price = null, src = '';
        if (wantPrice && !blocked) {
          try {
            const res = await lowest(g.row, v.rev, lang);
            if (res.price != null) { price = Math.max(MIN_PRICE, res.price); src = `più bassa (${res.offers} offerte)`; }
            else src = 'nessuna offerta NM in questa lingua';
          } catch (e) { src = e.message; }
          await sleep(DELAY_MS);
        }
        if (price == null) {
          const t = trendOf(g.row.tr);
          if (t != null) { price = Math.max(MIN_PRICE, t); src += (src ? ' → ' : '') + 'uso il prezzo di tendenza'; }
        }
        // seconda variante della stessa carta: duplica la riga
        let tr = g.row.tr;
        if (i > 0) {
          tr = await duplicate(g.row.tr);
          if (!tr) { log(`${g.row.num}: non riesco a duplicare la riga per la Reverse, inseriscila a mano.`, '#ff6b6b'); continue; }
        }
        const ok = fillRow(tr, { lang, rev: v.rev, qty: v.qty, price });
        if (!ok) { log(`${g.row.name}: non esiste in versione Reverse su Cardmarket, saltata (controlla la carta).`, '#ff6b6b'); continue; }
        total += v.qty;
        log(`${g.row.name}${v.rev ? ' [REVERSE]' : ''} ×${v.qty} → ${price != null ? price.toFixed(2) + ' €' : 'prezzo vuoto'}  (${src || 'manuale'})`,
            price == null ? '#ff6b6b' : null);
      }
      done++;
    }
    log(`\nFatto: ${done} carte diverse, ${total} copie compilate (righe evidenziate in verde, Reverse in viola).`, '#3ecf6e');
    log('Controlla prezzi e righe, poi premi il pulsante di invio di Cardmarket in fondo alla pagina.', '#3ecf6e');
    if (blocked) log('Cardmarket ha bloccato le ricerche prezzi: per le carte restanti è stato usato il prezzo di tendenza. Riprova tra qualche minuto.', '#ff9f43');
  }
})();
