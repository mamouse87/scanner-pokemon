// Card Scanner → Cardmarket "Inserisci carte bulk"
// Compila le righe della pagina con la lista dell'app, controlla nome e rarità,
// e imposta il prezzo = "Da" (prezzo minimo) oppure "Tendenza" ± i centesimi scelti.
// I due valori li legge dalla pagina stessa (campi nascosti di ogni riga): nessuna richiesta a Cardmarket.
// Non invia nulla da solo.
(async () => {
  // varianti speciali dei "Supplementi" (Reverse Energia / Poké Ball / Master Ball): Cardmarket le distingue solo
  // dall'indirizzo del prodotto (…-V1-xASC001, …-V2-xASC001)
  const slugOf = u => { const t = String(u || '').split(/[?#]/)[0].replace(/\/+$/, ''); return t.slice(t.lastIndexOf('/') + 1); };
  const VXL = { E: 'Reverse Energia', P: 'Reverse Poké Ball', M: 'Reverse Master Ball', C: 'Cosmo Holo', S: 'Timbrata' };
  const VXB = { E: 'EN', P: 'PB', M: 'MB', C: 'CH', S: 'TB' };
  const isVx = v => !!(v && VXL[v]);
  // ---------- grafica comune dei riquadri (isolata dalla grafica di Cardmarket con lo Shadow DOM) ----------
  const CS_CSS = `
    :host{all:initial}
    *{box-sizing:border-box}
    .pn{position:fixed;top:14px;right:14px;width:440px;max-height:calc(100vh - 28px);display:flex;flex-direction:column;z-index:2147483000;
      background:#fff;color:#1d2433;font:14px/1.45 "Segoe UI",system-ui,-apple-system,sans-serif;border-radius:14px;overflow:hidden;
      box-shadow:0 18px 50px rgba(18,40,76,.28),0 0 0 1px rgba(18,40,76,.12)}
    .hd{background:#12284c;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px}
    .hd .t{font-weight:700;font-size:15px}.hd .m{color:#ffcb05;font-weight:600;font-size:13px}
    .hd .x{margin-left:auto;background:none;border:0;color:#c8d3e6;font-size:20px;cursor:pointer;line-height:1;padding:2px 4px}
    .hd .x:hover{color:#fff}
    .steps{display:flex;border-bottom:1px solid #e3e8f0;background:#f6f8fb}
    .st{flex:1;padding:9px 6px 8px;text-align:center;font-size:12px;color:#7a8599;border-bottom:3px solid transparent}
    .st b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#dfe5ee;color:#5b6678;font-size:11px;margin-right:5px}
    .st.on{color:#12284c;font-weight:700;border-bottom-color:#ffcb05}.st.on b{background:#12284c;color:#fff}
    .st.ok{color:#1c7c47}.st.ok b{background:#1f9d57;color:#fff}
    .bd{padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
    .card{border:1px solid #e3e8f0;border-radius:10px;padding:10px 12px;background:#fbfcfe}
    .card.info{background:#eef4ff;border-color:#cfdcf5}
    .card.warn{background:#fff7e6;border-color:#f3d79a}
    .card.okc{background:#ecf8f1;border-color:#bfe5cf}
    .nm{font-weight:700;color:#12284c;word-break:break-all}
    .mut{color:#6b7587;font-size:12.5px}
    .big{width:100%;border:0;border-radius:10px;padding:12px 14px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;background:#ffcb05;color:#1d2433}
    .big:hover{filter:brightness(.96)}.big:disabled{opacity:.5;cursor:default}
    .big.go{background:#1f9d57;color:#fff}.big.navy{background:#12284c;color:#fff}
    .big.ghost{background:#fff;color:#12284c;border:1px solid #cdd5e1;font-size:14px;padding:9px 14px}
    .msg div{margin-top:2px}.msg .err{color:#b42318}.msg .warn{color:#b4541c}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .sec{border:1px solid #cdd5e1;background:#fff;color:#12284c;border-radius:8px;padding:6px 11px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .sec:hover{background:#f1f4f9}
    a{color:#1f5fbf}
    input[type=text],input:not([type]){border:1px solid #cdd5e1;border-radius:8px;padding:7px 9px;font:inherit;width:100%;color:#1d2433;background:#fff}
    label.sw{display:flex;gap:10px;align-items:flex-start;cursor:pointer;color:#1d2433;font-size:13px}
    label.sw input{margin-top:3px;width:16px;height:16px;accent-color:#12284c}
    .bar{height:8px;background:#e6ebf2;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#1f9d57;border-radius:6px;transition:width .3s}
    .stat{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}
    .tabs{display:flex;gap:4px;border-bottom:1px solid #e3e8f0}
    .tab{border:0;background:none;padding:7px 10px;font:inherit;font-size:13px;color:#6b7587;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
    .tab.on{color:#12284c;font-weight:700;border-bottom-color:#12284c}
    .list{max-height:34vh;overflow:auto;margin-top:4px}
    .li{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center;padding:6px 2px;border-bottom:1px solid #f0f2f6;font-size:13px}
    .li .c{color:#6b7587;font-variant-numeric:tabular-nums}.li .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .li .p{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
    .li .why{grid-column:2/4;color:#b4541c;font-size:12px;margin-top:-4px}
    .rv{color:#8b3fc4;font-weight:700}
    .pill{display:inline-block;border-radius:99px;padding:1px 8px;font-size:11.5px;font-weight:600;background:#eef1f6;color:#5b6678}
    .pill.ok{background:#e3f5ea;color:#1c7c47}.pill.todo{background:#fff4cc;color:#7a5b00}.pill.err{background:#fde8e8;color:#b42318}.pill.oth{background:#ffeedd;color:#b4541c}
    .msg{font-size:13px;color:#12284c;font-weight:600}
    .log{font-size:12.5px;line-height:1.5;max-height:26vh;overflow:auto}
    .log div{padding:1px 0}.log .warn{color:#b4541c}.log .err{color:#b42318;font-weight:600}.log .ok{color:#1c7c47;font-weight:600}.log .mutd{color:#6b7587}
    .ft{padding:9px 16px;border-top:1px solid #e3e8f0;background:#f6f8fb;font-size:12px;display:flex;gap:14px;justify-content:flex-end;white-space:nowrap;align-items:center}
    .ft a{color:#5b6678;text-decoration:none}.ft a:hover{color:#12284c;text-decoration:underline}
    .hide{display:none!important}
    .ag{padding:6px 14px;font-size:12px;color:#5b6577;background:#f4f6fa;border-bottom:1px solid #e3e7ee}.ag.old{background:#fff4e5;color:#8a4b00}
  `;
  /** crea un riquadro isolato: restituisce l'elemento ospite e la radice in cui cercare gli elementi */
  function csPanel(mode) {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CS_CSS}</style><div class="pn"><div class="hd"><span class="t">Card Scanner</span><span class="m">${mode}</span><button class="x" id="pnX" title="Chiudi (per riaprirlo premi il pulsante o l'icona di Card Scanner)">✕</button></div>${inAgo()}<div id="pnIn" style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`;
    document.body.appendChild(host);
    root.getElementById('pnX').onclick = () => {
      host.style.display = 'none';
      // chiudendo il pannello tolgo riquadri ed evidenziazioni lasciate dallo script
      document.querySelectorAll('iframe.csQty').forEach(f => f.remove());
      document.querySelectorAll('[id^="stockRow"] .amount-input, [id^="stockRow"] .btn, input[name="price"]').forEach(e => { e.style.outline = ''; e.style.background = ''; });
    };
    return { host, root };
  }
  /** riga sotto il titolo: a che ora è arrivata dal gestionale l'operazione che lo script sta usando */
  function inAgo() {
    const e = t => String(t ?? '').replace(/[^0-9a-z.]/gi, '');
    const up = EXT && EXT.upd ? `<div class="ag old">↑ C'è la versione nuova dell'estensione (${e(EXT.upd)}; tu hai la ${e(EXT.ver || '?')}). <a href="https://mamouse87.github.io/scanner-pokemon/cardmarket/" target="_blank" rel="noopener" style="color:inherit;font-weight:700">Scaricala e aggiornala</a></div>` : '';
    return up + inAgo0();
  }
  function inAgo0() {
    let at = 0; try { at = +localStorage.getItem('cs_in_at') || 0; } catch (e) {}
    if (!at) return '';
    const old = Date.now() - at > 30 * 60e3, d = new Date(at);
    const when = d.toDateString() === new Date().toDateString() ? 'alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'il ' + d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="ag${old ? ' old' : ''}">Operazione ricevuta dal gestionale ${when}.${old ? ' Non è quella giusta? Ripremi il pulsante nel gestionale: arriva in questa scheda.' : ''}</div>`;
  }
  const stepsHtml = (names, cur, okUpTo) => `<div class="steps">${names.map((n, i) =>
    `<div class="st ${i < okUpTo ? 'ok' : i === cur ? 'on' : ''}"><b>${i < okUpTo ? '✓' : i + 1}</b>${n}</div>`).join('')}</div>`;

  // ---------- elenco preparato dal gestionale ("Apri su Cardmarket") ----------
  // arriva nell'indirizzo dopo il # (o nel nome della scheda) e resta salvato in cardmarket.com finché non è tutto inviato
  const JKEY = 'cs_job';
  const jobGet = () => { try { return JSON.parse(localStorage.getItem(JKEY)) || null; } catch (e) { return null; } };
  /** elenco del gestionale: csjob= (carte da mettere in vendita) o csedit= (prezzi da cambiare) */
  function intakeAny(txt) {
    // cscheck= : il gestionale chiede il controllo del magazzino (leggo le offerte e gliele mando)
    const ck = String(txt || '').trim().match(/^cscheck=[\d]*(?:\.(.+))?$/);
    if (ck) {
      // il gestionale manda anche i set che ha (id dell'espansione su Cardmarket): servono se le offerte sono più di 300
      let sets = [];
      let fixL = null;
      try { if (ck[1]) { const P = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(ck[1]))))); sets = (P.e || []).filter(x => /^\d+$/.test(x[0])); fixL = Array.isArray(P.L) ? P.L : null; } } catch (e) {}
      // "correggi subito": copie giuste di ogni carta del gestionale (abbasso solo quelle in più su Cardmarket)
      localStorage.setItem('cs_check_fix', JSON.stringify(fixL));
      localStorage.setItem('cs_check_sets', JSON.stringify(sets));
      localStorage.setItem('cs_check', String(Date.now())); return true;
    }
    const m = String(txt || '').trim().match(/^csedit=(.+)$/);
    if (!m) return intake(txt);
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (!j || !Array.isArray(j.items)) return false;
      localStorage.setItem('cs_edit', JSON.stringify(j));
      localStorage.setItem('cs_check', '0');   // elenco di prezzi nuovo: esco dal controllo del magazzino
      return true;
    } catch (e) { return false; }
  }
  // estensione di Chrome: l'avvio arriva con { auto, p } (auto = aperto da solo, p = operazione dal gestionale)
  const EXT = typeof csExt !== 'undefined' && csExt ? csExt : null;
  // risultati al gestionale: con l'estensione li porta lei nella finestra del gestionale già aperta, altrimenti apro l'indirizzo
  function toGest(h) {
    if (window.__csExtOn) { window.postMessage({ csx: 'res', h }, location.origin); return; }
    window.open('https://mamouse87.github.io/scanner-pokemon/gestionale/' + h, 'gestionaleCarte');
  }
  const AGAIN = EXT ? 'il riquadro di Card Scanner si apre da solo' : 'premi di nuovo il pulsante Card Scanner';
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
  // ---------- operazione nuova dal gestionale ----------
  // Il gestionale apre sempre la stessa scheda (nome "cardscanner") e mette l'operazione nell'indirizzo, dopo il #.
  // Se manca (Cardmarket ha chiesto il login e l'indirizzo è cambiato): nome della scheda (vecchio modo), poi la chiedo
  // al gestionale che ha aperto questa scheda (rispondo/accetto solo tra cardmarket.com e il gestionale).
  const CS_RX = /^cs(job|edit|check)=/, CS_TAB = 'cardscanner';
  let inP = '';
  const hm = String(location.hash || '').match(/^#(cs(?:job|edit|check)=.+)$/);
  if (EXT && EXT.p && CS_RX.test(EXT.p)) inP = EXT.p;
  else if (hm) { inP = hm[1]; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  else if (CS_RX.test(String(window.name || '').trim())) inP = String(window.name).trim();
  else if (window.opener) {
    inP = await new Promise(res => {
      const t = setTimeout(() => { removeEventListener('message', on); res(''); }, 1200);
      function on(e) {
        if (e.origin !== 'https://mamouse87.github.io' || !e.data || e.data.cs !== 'job' || typeof e.data.p !== 'string') return;
        clearTimeout(t); removeEventListener('message', on); res(e.data.p);
      }
      addEventListener('message', on);
      try { window.opener.postMessage({ cs: 'want' }, 'https://mamouse87.github.io'); } catch (e) { clearTimeout(t); removeEventListener('message', on); res(''); }
    }) || '';
  }
  // la stessa operazione già ricevuta non la riprendo (non ricomincio un lavoro già iniziato)
  let lastIn = ''; try { lastIn = localStorage.getItem('cs_last_in') || ''; } catch (e) {}
  const sigIn = inP ? inP.slice(0, 200) + inP.length : '';
  let tookNew = false;
  if (inP && CS_RX.test(inP) && sigIn !== lastIn && intakeAny(inP)) {
    tookNew = true;
    try { localStorage.setItem('cs_last_in', sigIn); localStorage.setItem('cs_in_at', String(Date.now())); } catch (e) {}
    const wasEdit = /^cs(edit|check)=/.test(inP);
    if (!wasEdit && window.__csPanel) { window.__csPanel.remove(); window.__csPanel = null; } // elenco nuovo: rifaccio il pannello
    if (wasEdit && window.__csOffers) { window.__csOffers.remove(); window.__csOffers = null; }
  }
  // la scheda tiene il suo nome: la prossima volta il gestionale riapre questa invece di una nuova
  try { if (window.name !== CS_TAB) window.name = CS_TAB; } catch (e) {}
  // operazione nuova mentre lo script è aperto in questa pagina: ricarico, così non continua quella vecchia.
  // Poi premi di nuovo il pulsante e lo script prende quella nuova.
  if (!window.__csHashOn) {
    window.__csHashOn = true;
    addEventListener('hashchange', () => { if (/^#cs(job|edit|check)=/.test(location.hash)) location.reload(); });
  }
  // estensione: dico che l'operazione è arrivata (toglie il numerino sull'icona)
  if (EXT && EXT.p && inP === EXT.p && (tookNew || sigIn === lastIn)) window.postMessage({ csx: 'taken', sig: sigIn }, location.origin);
  // estensione, apertura automatica: il riquadro compare da solo solo se c'è un'operazione nuova dal gestionale,
  // oppure sulla pagina "Inserisci carte bulk" del set di un elenco non ancora finito (pagina 2, 3… del set)
  if (EXT && EXT.auto && !tookNew) {
    const j = jobGet(), qid = new URLSearchParams(location.search).get('idExpansion');
    const onBulk = /\/Stock\/ListingMethods\/BulkListing/i.test(location.pathname) && !!document.getElementById('BulkListingForm');
    const xs = document.querySelector('select[name="idExpansion"]'), xo = xs && ([...xs.options].find(o => o.value === qid) || xs.options[xs.selectedIndex]);
    const selName = xo ? xo.textContent : '';
    const onSup = onBulk && /supplementi|additionals?/i.test(selName);
    if (!onSup && !(onBulk && j && !j.done && (!j.cm || !qid || String(j.cm) === qid || (j.cmx && String(j.cmx) === qid)))) return;
  }
  // ================= LE MIE OFFERTE: cambio prezzi =================
  // Sulla pagina "Le mie offerte" (Stock/Offers/Singles) lo script legge tutte le pagine delle offerte
  // (Reverse Sì e No separati, con il filtro di Cardmarket), le abbina all'elenco preparato dal gestionale
  // ("Cambia prezzi su Cardmarket") e apre una carta alla volta il riquadro "Modifica", scrivendo il nuovo prezzo.
  // "MODIFICA ARTICOLO" lo premi tu, a meno di scegliere la conferma automatica (lenta).
  function offersMode() {
    if (window.__csOffers) { window.__csOffers.style.display = ''; return; }
    const EKEY = 'cs_edit', DKEY = 'cs_edit_done', OKEY = 'cs_offers';
    const GEST = 'https://mamouse87.github.io/scanner-pokemon/gestionale/';
    const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
    const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const eur = v => v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + ' €';
    const nrm = n => { n = String(n || '').trim().toUpperCase(); return /^\d+$/.test(n) ? String(parseInt(n, 10)) : n; };
    const smp = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const LANGS = { Italiano: 'it', Inglese: 'en', English: 'en', Francese: 'fr', Tedesco: 'de', Spagnolo: 'es', Portoghese: 'pt', Giapponese: 'ja', Coreano: 'ko', 'Cinese semplificato': 'zh', 'Cinese tradizionale': 'zt' };
    let job = ls.get(EKEY, null);
    let done = ls.get(DKEY, {});
    if (job && done.__job !== job.name) { done = { __job: job.name }; ls.set(DKEY, done); }
    let offers = ls.get(OKEY, null);           // {at, list:[…]} ultima lettura delle offerte
    // elenco nuovo dal gestionale: rileggo le offerte, quelle salvate possono essere vecchie
    if (job && !done.__read) { offers = null; done.__read = 1; ls.set(DKEY, done); }
    let check = +ls.get('cs_check', 0) || 0;   // controllo del magazzino chiesto dal gestionale (ora della richiesta)
    let running = false, stopReq = false;

    const { host: P, root: R } = csPanel('Cambia prezzi');
    window.__csOffers = P;
    const $o = id => R.getElementById(id);
    let tab = 'todo', msg = '';
    const ruleTxt = j => `${j.base === 'gest' ? 'quello del gestionale (un solo prezzo per carta)' : j.base === 'trend' ? 'Tendenza' : j.base === 'cons' ? 'Consigliato' : '"Da" (prezzo minimo)'}${j.plus ? ` ${j.plus > 0 ? '+' : '−'} ${eur(Math.abs(j.plus) / 100)}` : ''}`;

    // ---- controllo del magazzino: leggo tutte le offerte e le mando al gestionale (qui non cambio nulla) ----
    function renderCheck() {
      const fresh = offers && new Date(offers.at).getTime() >= check - 1000;
      R.querySelector('.hd .m').textContent = 'Controllo magazzino';
      const sent = ls.get('cs_check_sent', 0) === check;
      R.getElementById('pnIn').innerHTML = stepsHtml(['Leggi le offerte', 'Invia al gestionale'], fresh ? 1 : 0, sent ? 2 : fresh ? 1 : 0) + `<div class="bd">
        <div class="card info"><div class="nm">Controllo del magazzino</div>
          <div>Leggo tutte le tue offerte di carte singole (tutte le pagine, Normali e Reverse; oltre le 300 che Cardmarket mostra, set per set) e le mando al gestionale, che ti mostra le differenze.</div>
          <div class="mut">Su Cardmarket non cambio nulla. · versione 22/11 e</div></div>
        <div class="msg" id="oProg">${escH(msg)}</div>
        ${fresh ? `<button class="big go" id="kSend">📤 Invia al gestionale (${offers.list.length} offerte)</button>` : `<button class="big navy" id="oRead">🔎 Leggi le mie offerte</button>`}
        ${fresh ? `<div class="stat"><span><b>${offers.list.length}</b> offerte · ${offers.list.reduce((a, o) => a + (o.qty || 1), 0)} copie</span><span class="mut">${offers.list.filter(o => o.rev).length} Reverse</span></div>` : ''}
      </div><div class="ft">${fresh ? '<a href="#" id="oRead">Rileggi le offerte</a>' : ''}<a href="#" id="kExit">Esci dal controllo</a></div>`;
      R.querySelectorAll('#oRead').forEach(b => b.onclick = e => { e.preventDefault(); readAll(); });
      if ($o('kSend')) $o('kSend').onclick = sendCheck;
      $o('kExit').onclick = e => { e.preventDefault(); check = 0; ls.set('cs_check', 0); msg = ''; render(); };
    }
    // controllo + correzione: dopo la lettura preparo l'elenco delle carte con copie in più su Cardmarket
    function prepareFix() {
      let L = null; try { L = JSON.parse(localStorage.getItem('cs_check_fix')); } catch (e) {}
      if (!Array.isArray(L) || !L.length || ls.get('cs_check_fixfor', 0) === check) return;
      ls.set('cs_check_fixfor', check);
      const items = L.map(([k, code, exp, u, n, rev, lang, q]) => ({ k, code, exp, u, n, rev: !!rev, lang: lang || 'it', q, qt: q, old: null, price: null }));
      const keep = job, keepDone = done;
      job = { items }; done = {};
      const m = matchAll();
      job = keep; done = keepDone;
      const more = {};
      m.forEach(x => { if (x.o) (more[x.it.k] = more[x.it.k] || { it: x.it, cm: 0 }).cm += (x.o.qty || 0); });
      const fix = Object.values(more).filter(v => v.cm > v.it.qt).map(v => Object.assign({}, v.it, { from: v.cm }));
      if (!fix.length) { prog(msg + ' Nessuna carta con copie in più su Cardmarket: premi "Invia al gestionale".'); return; }
      const d = new Date(), z = n => String(n).padStart(2, '0');
      job = { v: 1, type: 'qty', at: d.toISOString(), name: `CONTROLLO-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`, items: fix, fromCheck: check };
      ls.set(EKEY, job);
      done = { __job: job.name, __read: 1 }; ls.set(DKEY, done);
      check = 0; ls.set('cs_check', 0);
      tab = 'todo';
      render();
      prog(`Lette ${offers.list.length} offerte. ${fix.length} ${fix.length === 1 ? 'carta ha' : 'carte hanno'} più copie su Cardmarket che nel gestionale: premi ▶ Correggi le quantità. Alla fine "Invia al gestionale" manda anche il controllo.`);
    }
    function sendCheck(fixed) {
      const ex = [], o = offers.list.map(x => { let i = ex.indexOf(x.exp); if (i < 0) i = ex.push(x.exp) - 1; const r = [x.code, x.num, x.rev ? 1 : 0, x.lang, x.qty || 1, x.price, x.name, i]; if (x.sl) r.push(x.sl); return r; });
      const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, at: offers.at, ex, o, full: offers.full === false ? 0 : 1, rx: offers.rx || [], warn: offers.warn || [], fixed: fixed || [] }))));
      toGest('#cmchk=' + encodeURIComponent(enc));
      ls.set('cs_check_sent', check);
      prog(`Inviate ${o.length} offerte al gestionale ✓ Guarda il risultato nella scheda "Controllo".`);
      renderCheck();
    }
    function render() {
      if (check) return renderCheck();
      R.querySelector('.hd .m').textContent = 'Cambia prezzi';
      const m = matchAll();
      const found = m.filter(x => x.o), miss = m.filter(x => !x.o);
      const isQ = job && job.type === 'qty';
      const fatte = m.filter(x => x.o && (x.st === 'ok' || x.st === 'same' || x.st === 'zero'));
      const todo = m.filter(x => x.o && x.st !== 'ok' && x.st !== 'same' && x.st !== 'zero');
      const step = !job ? 0 : !offers ? 0 : todo.length ? 1 : 2;
      const sentOk = job && done.__sent;
      const pct = found.length ? Math.round(fatte.length / found.length * 100) : 0;
      const listOf = tab === 'todo' ? todo : tab === 'done' ? fatte : miss;
      const auto = ls.get('cs_edit_auto', false);
      let primary = '';
      if (job && !offers) primary = `<button class="big navy" id="oRead">🔎 Leggi le mie offerte</button>`;
      else if (job && todo.length) primary = `<button class="big" id="oGo">${running ? '⏸ Metti in pausa' : isQ ? `▶ Correggi le quantità (${todo.length})` : `▶ Cambia i prezzi (${todo.length})`}</button>`;
      else if (job) primary = `<button class="big go" id="oSend">📤 Invia al gestionale (${fatte.length})</button>`;
      R.getElementById('pnIn').innerHTML = (job ? stepsHtml(['Leggi le offerte', isQ ? 'Correggi le quantità' : 'Cambia i prezzi', 'Invia al gestionale'], step, sentOk ? 3 : step) : '') + `<div class="bd">
        ${job ? `<div class="card info"><div class="nm">${escH(job.name)}</div>
            ${isQ ? `<div>${job.items.length} carte · porto le <b>copie</b> su Cardmarket a quelle del gestionale</div>
            <div class="mut">Il prezzo non cambia. Le offerte che devono scendere a 0 copie le togli tu da Cardmarket (lo script non cancella offerte).</div>`
            : `<div>${job.items.length} offerte da cambiare · nuovo prezzo <b>${ruleTxt(job)}</b></div>
            <div class="mut">Il gestionale ha calcolato il prezzo di ogni carta, Normali e Reverse separate.</div>`}</div>`
          : `<div class="card warn"><b>Nessun elenco di prezzi.</b><br>Nel gestionale premi <b>✏️ Cambia prezzi su Cardmarket</b>, scegli il prezzo e premi "Apri le mie offerte": poi premi di nuovo questo pulsante.</div>
             <button class="big navy" id="kStart">🔎 Controlla il magazzino con il gestionale</button>`}
        ${msg ? `<div class="msg" id="oProg">${escH(msg)}</div>` : '<div class="msg" id="oProg"></div>'}
        ${primary}
        ${job && offers ? `
          <div><div class="stat"><span>Cambiate <b>${fatte.length}</b> di ${found.length}</span><span class="mut">${miss.length ? `${miss.length} non trovate su Cardmarket` : 'tutte trovate'}</span></div>
            <div class="bar"><i style="width:${pct}%"></i></div></div>
          ${todo.length ? `<label class="sw"><input type="checkbox" id="oAuto" ${auto ? 'checked' : ''}><span><b>Conferma automatica</b><br><span class="mut">${isQ ? 'Lo script preme da solo il pulsante − o + della riga' : 'Lo script preme da solo "MODIFICA ARTICOLO"'}, una carta ogni 3 secondi. Senza spunta lo premi tu, carta per carta.</span></span></label>` : ''}
          <div><div class="tabs"><button class="tab ${tab === 'todo' ? 'on' : ''}" data-t="todo">Da fare (${todo.length})</button><button class="tab ${tab === 'done' ? 'on' : ''}" data-t="done">Fatte (${fatte.length})</button><button class="tab ${tab === 'miss' ? 'on' : ''}" data-t="miss">Non trovate (${miss.length})</button></div>
            <div class="list">${listOf.length ? listOf.map(x => `<div class="li"><span class="c">${escH((x.it.code || '') + ' ' + x.it.u)}${isVx(x.it.v) ? ' <span class="rv" style="background:#e0a100">' + VXB[x.it.v] + '</span>' : x.it.rev ? ' <span class="rv">R</span>' : ''}</span>
              <span class="n">${escH(x.it.n || x.o?.name || '')}</span>
              <span class="p">${x.it.qt != null ? `${x.o ? x.o.qty : '—'} → <b>${x.tq ?? x.it.qt} copie</b>` : `${x.o ? eur(x.o.price) : eur(x.it.old)} → <b>${eur(x.it.price)}</b>`} ${!x.o ? '' : x.st === 'zero' ? '<span class="pill err">togli a mano</span>' : x.st === 'ok' ? '<span class="pill ok">fatto</span>' : x.st === 'same' ? '<span class="pill ok">già così</span>' : x.st === 'skip' ? '<span class="pill oth">saltata</span>' : x.st === 'err' ? '<span class="pill err">errore</span>' : ''}</span>
              ${!x.o || (x.st === 'err' && x.why) ? `<span class="why">${escH(x.why || '')}</span>` : ''}</div>`).join('')
              : `<div class="mut" style="padding:10px 2px">${tab === 'todo' ? 'Nessuna offerta da cambiare.' : tab === 'done' ? 'Ancora nessuna.' : 'Tutte le carte dell\'elenco sono su Cardmarket.'}</div>`}</div></div>
          ${todo.length && fatte.length ? `<div class="row"><button class="sec" id="oSend">📤 Invia al gestionale le ${fatte.length} già cambiate</button></div>` : ''}`
          : !job ? '' : ''}
      </div><div class="ft">${offers ? `<span class="mut" style="margin-right:auto">${offers.list.length} offerte lette alle ${new Date(offers.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}${job && offers ? '<a href="#" id="oVer" title="Rilegge le offerte e controlla che i prezzi su Cardmarket siano davvero cambiati">Verifica i prezzi</a><a href="#" id="oRead">Rileggi le offerte</a>' : ''}${job && job.fromCheck ? '<a href="#" id="oSendChk" title="Manda il controllo al gestionale con le correzioni fatte finora">Invia il controllo</a>' : ''}<a href="#" id="oClip">Incolla elenco</a><span class="mut" style="margin-left:8px">v. 22/11 e</span></div>`;
      $o('oClip').onclick = async e => {
        e.preventDefault();
        let t = ''; try { t = await navigator.clipboard.readText(); } catch (er) { t = prompt('Incolla qui il testo copiato dal gestionale (inizia con csedit=)') || ''; }
        if (intakeAny(t)) { try { localStorage.setItem('cs_in_at', String(Date.now())); } catch (er) {} job = ls.get(EKEY, null); done = { __job: job.name, __read: 1 }; ls.set(DKEY, done); offers = null; render(); readAll(); } else alert('Negli appunti non c\'è un elenco di prezzi del gestionale.');
      };
      R.querySelectorAll('#oRead').forEach(b => b.onclick = e => { e.preventDefault(); readAll(); });
      R.querySelectorAll('#oSend').forEach(b => b.onclick = () => send());
      if ($o('oSendChk')) $o('oSendChk').onclick = e => { e.preventDefault(); send(); };
      if ($o('oGo')) $o('oGo').onclick = () => { if (running) { stopReq = true; prog('Mi fermo dopo questa carta…'); } else run(); };
      if ($o('oAuto')) $o('oAuto').onchange = () => ls.set('cs_edit_auto', $o('oAuto').checked);
      if ($o('oVer')) $o('oVer').onclick = e => { e.preventDefault(); verify(); };
      R.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
      if ($o('kStart')) $o('kStart').onclick = () => { check = Date.now(); ls.set('cs_check', check); msg = ''; render(); };
    }
    const prog = t => { msg = t; const e = $o('oProg'); if (e) e.textContent = t; };

    // ---- lettura di tutte le pagine delle offerte ----
    function parseRows(doc, rev) {
      return [...doc.querySelectorAll('[id^="stockRow"]')].map(row => {
        const id = row.id.replace('stockRow', '');
        const a = row.querySelector('.col-seller a');
        const name = (a ? a.textContent : '').replace(/\s+/g, ' ').trim();
        const mm = name.match(/^(.*?)\s*\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
        const expEl = row.querySelector('.expansion-symbol');
        const exp = expEl ? (expEl.getAttribute('aria-label') || expEl.getAttribute('data-bs-original-title') || expEl.getAttribute('title') || '') : '';
        let lang = '';
        row.querySelectorAll('.product-attributes [aria-label], .product-attributes [data-bs-original-title]').forEach(e => { const l = e.getAttribute('aria-label') || e.getAttribute('data-bs-original-title'); if (LANGS[l]) lang = LANGS[l]; });
        const pt = row.querySelector('.price-container .fw-bold') || row.querySelector('.fw-bold');
        const price = pt ? parseFloat(pt.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
        const qt = row.querySelector('.amount-container .item-count') || row.querySelector('.item-count');
        const sl = a ? slugOf(a.getAttribute('href')) : '';
        const o = { id, name: mm ? mm[1].trim() : name, code: mm ? mm[2].toUpperCase() : '', num: mm ? mm[3] : '', exp, lang: lang || 'it', rev, price, qty: qt ? +qt.textContent.trim() : null };
        if (sl && (/-V\d+-[A-Za-z]*\d+[a-z]?$/.test(sl) || /supplementi|additionals?/i.test(exp))) o.sl = sl;
        return o;
      }).filter(x => x.id);
    }
    // indirizzo come quello del pulsante CERCA del filtro (modulo GET): tutti i campi del filtro con i loro valori, più i miei
    let filterForm = null;
    function filterQs(over) {
      const p = new URLSearchParams();
      if (filterForm) filterForm.querySelectorAll('select[name], input[name]').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) p.append(el.name, el.value); return; }
        if (el.type === 'submit' || el.type === 'button') return;
        const v = el.tagName === 'SELECT' ? (el.querySelector('option[selected]') ? el.value : el.getAttribute('data-default-value') ?? el.value) : el.value;
        p.set(el.name, v ?? '');
      });
      Object.entries(over).forEach(([k, v]) => p.set(k, v));
      return p.toString();
    }
    // legge le pagine di un elenco di offerte; Cardmarket ne mostra al massimo 300 ("300+ Risultati", 15 pagine):
    // capped = c'erano altre offerte non mostrate. probe = mi fermo alla prima pagina se è così
    async function readPages(over, label, probe) {
      const list = []; let page = 1, pages = 1, capped = false, doc0 = null;
      do {
        prog(`Leggo ${label}: pagina ${page} di ${pages}${capped ? '+' : ''}…`);
        const r = await fetch(`/it/Pokemon/Stock/Offers/Singles?${filterQs(Object.assign({}, over, { site: page }))}`, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        if (!doc0) doc0 = doc;
        if (!filterForm) { const se = doc.querySelector('select[name="idExpansion"]'); filterForm = se && (se.closest('form') || se.form); }
        const rows = parseRows(doc, over.isReverseHolo === 'Y');
        // dove si trova l'offerta: serve per aprirne il riquadro "Modifica" (Edizione + Reverse + pagina, come con CERCA)
        rows.forEach(o => { o.fx = { e: over.idExpansion || '0', r: over.isReverseHolo || '0', s: page }; });
        const tx = doc.body.textContent;
        const pm = tx.match(/Pagina\s+\d+\s+di\s+(\d+)\s*(\+?)/i);
        if (pm) { pages = +pm[1]; capped = capped || !!pm[2]; }
        if (/300\s*\+\s*Risultati/i.test(tx) || /pi[uù] di 300/i.test(tx)) capped = true;
        list.push(...rows);
        if (probe && capped) return { list, capped, doc: doc0 };
        page++;
        await sleep(700);
        if (!rows.length) break;
      } while (page <= pages && page < 200);
      return { list, capped, doc: doc0 };
    }
    async function readAll() {
      if (running) return;
      running = true;
      const list = [], warn = [], okRev = {};   // okRev[rev] = null (lette tutte) oppure Set dei set letti per intero
      let full = true;
      try {
        for (const rev of ['N', 'Y']) {
          const RV = rev === 'Y' ? 'Reverse' : 'normali';
          // prima pagina: se c'è scritto "300+ Risultati" lavoro subito per Edizione
          const a = await readPages({ isReverseHolo: rev }, `le offerte ${RV}`, true);
          if (!a.capped) { list.push(...a.list); okRev[rev] = null; continue; }
          okRev[rev] = new Set();
          // più di 300: leggo set per set (filtro Edizione), i set del gestionale più quelli visti nelle prime pagine
          full = false;
          const sel = [...a.doc.querySelectorAll('select')].find(x => /expansion/i.test(x.name || x.id || '')) ||
            [...a.doc.querySelectorAll('select')].find(x => x.options.length > 30);
          const param = sel && sel.name ? sel.name : 'idExpansion';
          // le voci del filtro sono "Nome del set (n. offerte)": leggo i set con almeno un'offerta
          const opts = sel ? [...sel.options].filter(o => /^\d+$/.test(o.value) && +o.value > 0).map(o => {
            const t = o.textContent.trim(), m = t.match(/^(.*?)\s*\((\d+)\)\s*$/);
            return [o.value, m ? m[1] : t, m ? +m[2] : null];
          }) : [];
          const want = new Map();
          opts.forEach(o => { if (o[2]) want.set(o[0], o[1]); else if (o[2] === 0) okRev[rev].add(o[0]); });   // 0 offerte: niente da leggere
          // set del gestionale (se il filtro non dice quante offerte ha)
          (ls.get('cs_check_sets', []) || []).forEach(([id, nm]) => { const op = opts.find(o => o[0] === String(id)); if (!op ? true : op[2] == null) want.set(String(id), op ? op[1] : nm || id); });
          const addName = n => { const op = n && opts.find(x => smp(x[1]) === smp(n)); if (op) want.set(op[0], op[1]); };
          if (!opts.some(o => o[2] != null)) { a.list.forEach(o => addName(o.exp)); if (job) job.items.forEach(it => addName(it.exp)); }
          if (!want.size) throw new Error('le offerte sono più di 300 e non trovo il filtro Edizione');
          let i = 0;
          for (const [id, nm] of want) {
            i++;
            const b = await readPages({ isReverseHolo: rev, [param]: id }, `${nm} (${RV}, set ${i} di ${want.size})`);
            // il filtro deve aver funzionato: le offerte lette sono tutte di quel set
            const other = b.list.filter(o => o.exp && smp(o.exp) !== smp(nm));
            if (other.length && other.length === b.list.length) throw new Error(`il filtro Edizione non funziona (${nm})`);
            list.push(...b.list.filter(o => !o.exp || smp(o.exp) === smp(nm)));
            if (b.capped) warn.push(`${nm} ${RV}: più di 300 offerte, lette solo le prime 300`);
            if (!b.capped) okRev[rev].add(id);
          }
        }
        // la stessa offerta non deve comparire due volte
        const seen = new Set();
        // set controllati per intero: letti completi sia nelle Normali sia nelle Reverse
        const rx = full ? [] : [...new Set([...(okRev.N || []), ...(okRev.Y || [])])].filter(id => (!okRev.N || okRev.N.has(id)) && (!okRev.Y || okRev.Y.has(id)));
        offers = { at: new Date().toISOString(), list: list.filter(o => !seen.has(o.id) && seen.add(o.id)), full, rx, warn };
        ls.set(OKEY, offers);
      } catch (e) {
        prog('Errore nella lettura delle offerte: ' + (e.message || e) + '. Riprova tra poco.');
        running = false; render();
        prog('Errore nella lettura delle offerte: ' + (e.message || e) + '. Riprova tra poco.');
        return;
      }
      running = false;
      render();
      prog(`Lette ${offers.list.length} offerte (${offers.list.filter(o => o.rev).length} Reverse)` + (offers.full === false ? `, set per set (${offers.rx.length} set).` : '.') + (warn.length ? ' ⚠ ' + warn.join(' · ') : ''));
      if (check) prepareFix();
    }

    // ---- abbinamento elenco ↔ offerte ----
    function matchAll() {
      if (!job || !offers) return (job ? job.items : []).map(it => ({ it, o: null, st: '' }));
      const byCode = {}, byExp = {};
      offers.list.forEach(o => {
        const tail = `|${nrm(o.num)}|${o.rev ? 'R' : 'N'}|${o.lang}`;
        if (o.code) (byCode[o.code + tail] = byCode[o.code + tail] || []).push(o);
        (byExp[smp(o.exp) + tail] = byExp[smp(o.exp) + tail] || []).push(o);
      });
      const out = [];
      job.items.forEach(it => {
        const tail = `|${nrm(it.u)}|${it.rev ? 'R' : 'N'}|${it.lang || 'it'}`;
        let os = (it.code && byCode[it.code.toUpperCase() + tail]) || byExp[smp(it.exp) + tail] || [];
        // variante speciale: solo le offerte di quel prodotto (V1 o V2)
        if (it.sl) os = os.filter(o => o.sl === it.sl);
        if (!os.length) {
          // perché non c'è? cerco la stessa carta con un'altra variante o lingua
          const same = offers.list.filter(o => nrm(o.num) === nrm(it.u) && ((it.code && o.code === it.code.toUpperCase()) || smp(o.exp) === smp(it.exp)));
          const LN = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [v, k]));
          const why = !same.length ? 'Su Cardmarket non è in vendita (nel gestionale sì: controlla la quantità o toglila dal gestionale).'
            : 'Su Cardmarket c\'è come ' + [...new Set(same.map(o => `${o.rev ? 'Reverse' : 'Normale'}${o.lang !== (it.lang || 'it') ? ' in ' + (LN[o.lang] || o.lang) : ''}`))].join(' e ') +
              `, nel gestionale come ${it.rev ? 'Reverse' : 'Normale'}${(it.lang || 'it') !== 'it' ? ' in ' + (LN[it.lang] || it.lang) : ''}.`;
          out.push({ it, o: null, st: '', why }); return;
        }
        // quantità: le copie giuste (it.qt) si distribuiscono sulle offerte di quella carta, nell'ordine;
        // se su Cardmarket ce ne sono meno, le aggiungo alla prima offerta
        let tqs = null;
        if (it.qt != null) {
          let rem = Math.max(0, it.qt);
          tqs = os.map(o => { const t = Math.min(o.qty ?? 0, rem); rem -= t; return t; });
          if (rem > 0) tqs[0] += rem;
        }
        os.forEach((o, i) => {
          const d = done[it.k + '#' + o.id] || {};
          const tq = tqs ? tqs[i] : null;
          const same = tqs ? o.qty === tq : (o.price != null && Math.abs(o.price - it.price) < 0.005);
          out.push({ it, o, tq, st: d.st || (same ? 'same' : ''), ver: d.ver, why: d.why });
        });
      });
      return out;
    }

    function setVal(el, v) {
      const proto = Object.getPrototypeOf(el);
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && d.set) d.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    let stopHard = false;
    let lastErr = '';
    const fail = t => { lastErr = t.replace(/^⚠\s*/, ''); prog(t); return 'err'; };
    // le copie si cambiano dentro una copia vera della pagina dell'Edizione (come dopo CERCA), caricata in un riquadro:
    // i pulsanti − / + funzionano solo nella pagina in cui Cardmarket li ha creati
    function frameLoad(url, visible) {
      return new Promise(res => {
        document.querySelectorAll('iframe.csQty').forEach(f => f.remove());
        const f = document.createElement('iframe');
        f.className = 'csQty';
        f.style.cssText = visible
          ? 'position:fixed;left:2%;top:8%;width:62%;height:84%;z-index:2147483000;border:4px solid #ffcb05;border-radius:10px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4)'
          : 'position:fixed;left:-3000px;top:0;width:1400px;height:900px;opacity:0;pointer-events:none';
        let done = false;
        const end = v => { if (!done) { done = true; res(v); } };
        f.onload = () => end(f);
        setTimeout(() => end(f), 25000);
        f.src = url;
        document.body.appendChild(f);
      });
    }
    /** apre in un riquadro la vera pagina dell'Edizione dell'offerta (come scegliere l'Edizione e premere CERCA) e ne trova la riga */
    async function frameRow(x, visible) {
      const fx = x.o.fx || { e: '0', r: x.o.rev ? 'Y' : 'N', s: 1 };
      const url = s => `/it/Pokemon/Stock/Offers/Singles?${filterQs({ idExpansion: fx.e, isReverseHolo: fx.r, site: s })}`;
      let f = null, doc = null, row = null;
      // pagina in cui l'ho letta, poi le altre pagine dello stesso set
      const order = [fx.s || 1, ...Array.from({ length: 15 }, (_, i) => i + 1).filter(s => s !== (fx.s || 1))];
      for (const s of order) {
        prog(`Apro ${x.o.name} nella sua Edizione (pagina ${s})…`);
        f = await frameLoad(url(s), visible);
        try { doc = f.contentDocument; } catch (e) { doc = null; }
        if (!doc || !doc.body) { f.remove(); return { err: `⚠ Cardmarket non mi lascia aprire la pagina dell'Edizione dentro lo script. Correggi a mano ${x.o.name}.` }; }
        row = doc.getElementById('stockRow' + x.o.id);
        if (row) return { f, doc, row, page: s, url: url(s) };
        const pm = doc.body.textContent.match(/Pagina\s+\d+\s+di\s+(\d+)/i);
        if (pm && s >= +pm[1] && s !== (fx.s || 1)) break;
        await sleep(500);
      }
      if (f) f.remove();
      return { err: `⚠ Non trovo la riga di ${x.o.name} su Cardmarket: forse è stata venduta o cambiata. Rileggi le offerte. Mi fermo.` };
    }
    async function qtyStep(x, auto) {
      const fr = await frameRow(x, !auto);
      if (fr.err) return fail(fr.err);
      const { f, doc, row } = fr;
      const W = doc.defaultView;
      const cnt = () => { const c = doc.querySelector(`#stockRow${x.o.id} .item-count`); return c ? +c.textContent.trim() : null; };
      const cur = cnt();
      if (cur === x.tq) { f.remove(); return 'ok'; }
      if (cur == null) { f.remove(); return fail(`⚠ Non leggo le copie di ${x.o.name} nella riga. Mi fermo.`); }
      const diff = x.tq - cur;
      const grp = row.querySelector('.inc-dec-group');
      const amt = grp && grp.querySelector('.amount-input');
      const btn = grp && grp.querySelector(diff < 0 ? '.btn-danger' : '.btn-success');
      if (!amt || !btn) { f.remove(); return fail(`⚠ Nella riga di ${x.o.name} non trovo i pulsanti − / +. Mandami una foto della riga. Mi fermo.`); }
      try { row.scrollIntoView({ block: 'center' }); } catch (e) {}
      const d = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value');
      d.set.call(amt, String(Math.abs(diff)));
      amt.dispatchEvent(new W.Event('input', { bubbles: true })); amt.dispatchEvent(new W.Event('change', { bubbles: true }));
      amt.style.outline = '3px solid #ffcb05'; btn.style.outline = '3px solid #ffcb05';
      const what = `${x.o.name}${isVx(x.it.v) ? ' ' + VXL[x.it.v] : x.it.rev ? ' Reverse' : ''}: copie ${cur} → ${x.tq} (${diff < 0 ? 'tolgo ' + -diff : 'aggiungo ' + diff})`;
      if (auto) { prog(`${what} · confermo…`); await sleep(700); btn.click(); }
      else prog(`👉 ${what} — nel riquadro con il bordo giallo premi il pulsante ${diff < 0 ? 'rosso −' : 'verde +'} evidenziato (premi ⏸ per saltarla).`);
      let res = null;
      for (let t = 0; t < (auto ? 20000 : 30 * 60 * 1000); t += 300) {
        await sleep(300);
        const n = cnt();
        if (n === x.tq) { res = 'ok'; break; }
        if (n != null && n !== cur) { res = fail(`⚠ ${x.o.name}: ora le copie sono ${n}, non ${x.tq}. Controlla la riga. Mi fermo.`); break; }
        if (stopReq || stopHard) { res = 'skip'; break; }
      }
      f.remove();
      if (res === 'ok') {
        // aggiorno anche la riga mostrata nella pagina, se c'è
        const c = document.querySelector(`#stockRow${x.o.id} .item-count`); if (c) c.textContent = String(x.tq);
        return 'ok';
      }
      if (res) return res;
      return fail(`⚠ ${x.o.name}: Cardmarket non ha aggiornato le copie entro 20 secondi (restano ${cur}). Premi ▶ per riprovare, oppure togli la spunta "Conferma automatica" e premi tu il pulsante.`);
    }
    // prezzo: riquadro "Modifica" aperto dalla riga vera, dentro la pagina dell'Edizione; dopo il salvataggio rileggo il prezzo
    // Cardmarket unisce due offerte della stessa carta quando hanno lo stesso prezzo: l'offerta cambiata sparisce
    // (o cambia numero) e resta una sola riga con il prezzo nuovo. Questo per me vuol dire "fatto".
    async function mergedOk(x, target, doc) {
      const fx = x.o.fx || { e: '0', r: x.o.rev ? 'Y' : 'N', s: 1 };
      const same = o => o.rev === !!x.it.rev && (o.lang || 'it') === (x.it.lang || 'it') && nrm(o.num) === nrm(x.o.num) && (!x.it.sl || o.sl === x.it.sl) &&
        (o.code && x.o.code ? o.code === x.o.code : smp(o.name) === smp(x.o.name)) && o.price != null && Math.abs(o.price - target) < 0.005;
      if (doc && parseRows(doc, fx.r === 'Y' ? true : !!x.it.rev).some(same)) return true;
      try { const r = await readPages({ idExpansion: fx.e, isReverseHolo: fx.r === '0' ? (x.it.rev ? 'Y' : 'N') : fx.r }, x.o.name, false); return r.list.some(same); } catch (e) { return false; }
    }
    async function priceStep(x, auto) {
      const fr = await frameRow(x, !auto);
      if (fr.err) {
        // riga sparita: se c'è già una sola offerta della carta al prezzo giusto, Cardmarket le ha unite → fatto
        if (/Non trovo la riga/.test(fr.err) && await mergedOk(x, Math.round(x.it.price * 100) / 100, null)) { prog(`${x.o.name}: su Cardmarket le offerte sono già unite al prezzo giusto ✓`); return 'ok'; }
        return fail(fr.err);
      }
      const { f, doc, row } = fr, W = doc.defaultView;
      const priceOf = r => { const pt = r && (r.querySelector('.price-container .fw-bold') || r.querySelector('.fw-bold')); return pt ? parseFloat(pt.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null; };
      const target = Math.round(x.it.price * 100) / 100;
      if (Math.abs((priceOf(row) ?? -1) - target) < 0.005) { f.remove(); return 'ok'; }
      const link = row.querySelector('a[data-modal*="EditArticleModal"]');
      if (!link) { f.remove(); return fail(`⚠ Nella riga di ${x.o.name} non trovo il pulsante Modifica. Mi fermo.`); }
      try { row.scrollIntoView({ block: 'center' }); } catch (e) {}
      const M = () => doc.getElementById('modal');
      const isOpen = () => { const m = M(); return !!m && m.classList.contains('show') && W.getComputedStyle(m).display !== 'none'; };
      link.click();
      let inp = null;
      for (let t = 0; t < 12000 && !inp; t += 200) { await sleep(200); if (isOpen()) inp = M().querySelector('input[name="price"]'); }
      if (!inp) { f.remove(); return fail(`⚠ Il riquadro "Modifica" di ${x.o.name} non si è aperto. Premi ▶ per riprovare.`); }
      const m = M();
      // controlli di sicurezza: carta giusta e variante giusta
      const title = (m.querySelector('.modal-title, h1, h2, h3, h4, h5') || {}).textContent || '';
      if (title && x.o.name && !smp(title).includes(smp(x.o.name).slice(0, 6))) { f.remove(); return fail(`⚠ Il riquadro aperto ("${title.trim()}") non sembra quello di ${x.o.name}: mi fermo per sicurezza.`); }
      const revBox = m.querySelector('input[name="isReverseHolo"], input[name*="everse"]');
      if (revBox && revBox.type === 'checkbox' && revBox.checked !== !!x.it.rev) { f.remove(); return fail(`⚠ Il riquadro di ${x.o.name} non è ${x.it.rev ? 'Reverse' : 'normale'} come previsto: mi fermo per sicurezza.`); }
      Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set.call(inp, target.toFixed(2));
      inp.dispatchEvent(new W.Event('input', { bubbles: true })); inp.dispatchEvent(new W.Event('change', { bubbles: true }));
      inp.style.outline = '3px solid #ffcb05'; inp.style.background = '#fff7cc';
      const sb = [...m.querySelectorAll('button, input[type="submit"]')].find(b => /modifica\s+articolo/i.test(b.textContent || b.value || '')) || m.querySelector('form [type="submit"]');
      let submitted = false;
      const onSub = () => { submitted = true; };
      if (sb) sb.addEventListener('click', onSub, true);
      if (inp.form) inp.form.addEventListener('submit', onSub, true);
      const what = `${x.o.name}${isVx(x.it.v) ? ' ' + VXL[x.it.v] : x.it.rev ? ' Reverse' : ''}: ${eur(x.o.price)} → ${eur(target)}`;
      if (auto && sb) { prog(`${what} · confermo…`); await sleep(700); sb.click(); }
      else prog(`👉 ${what} — nel riquadro con il bordo giallo controlla e premi "MODIFICA ARTICOLO" (chiudi il riquadro di Modifica per saltarla).`);
      for (let t = 0; t < (auto ? 20000 : 30 * 60 * 1000) && isOpen(); t += 250) { await sleep(250); if (stopHard) break; }
      if (isOpen()) { f.remove(); return fail(`⚠ ${x.o.name}: Cardmarket non ha chiuso il riquadro (errore?). Controlla e premi ▶ per continuare.`); }
      f.remove();
      if (!submitted) return 'skip';
      // verifica: rileggo la pagina e controllo il prezzo dell'offerta
      await sleep(800);
      try {
        const r = await fetch(fr.url, { credentials: 'include' });
        const d2 = new DOMParser().parseFromString(await r.text(), 'text/html');
        const now = priceOf(d2.getElementById('stockRow' + x.o.id));
        if (now != null && Math.abs(now - target) < 0.005) return 'ok';
        if (now == null && await mergedOk(x, target, d2)) { prog(`${x.o.name}: prezzo cambiato, Cardmarket ha unito le offerte della carta ✓`); return 'ok'; }
        if (now != null) return fail(`⚠ ${x.o.name}: dopo "MODIFICA ARTICOLO" su Cardmarket il prezzo è ancora ${eur(now)} (doveva essere ${eur(target)}). Mi fermo.`);
      } catch (e) {}
      return fail(`⚠ ${x.o.name}: non riesco a ricontrollare il prezzo su Cardmarket. Premi "Verifica i prezzi".`);
    }
    // a fine lavoro tolgo riquadri ed evidenziazioni lasciate nella pagina
    function cleanPage() {
      document.querySelectorAll('iframe.csQty').forEach(f => f.remove());
      document.querySelectorAll('[id^="stockRow"] .amount-input, [id^="stockRow"] .btn, input[name="price"]').forEach(e => { e.style.outline = ''; e.style.background = ''; });
    }

    async function run() {
      if (!job || !offers) return;
      // offerte lette con la versione vecchia: non so in che Edizione/pagina sono, le rileggo
      if (offers.list.some(o => !o.fx)) { await readAll(); if (!offers) return; }
      running = true; stopReq = false; stopHard = false; render();
      const auto = !!$o('oAuto')?.checked;
      for (const x of matchAll()) {
        if (stopReq) break;
        if (!x.o || x.st === 'ok' || x.st === 'same' || x.st === 'zero') continue;
        const key = x.it.k + '#' + x.o.id;
        if (x.tq === 0) { done[key] = { st: 'zero', tq: 0 }; ls.set(DKEY, done); render(); continue; }   // a 0 copie: la togli tu
        // copie: il riquadro "Modifica" non le cambia (la sua Quantità dice a quante copie applicare le modifiche);
        // si usano i pulsanti − / + della riga ("Rimuovi/Aggiungi articolo/i") con il numero di copie accanto
        if (x.tq != null && x.it.price == null) {
          lastErr = '';
          const r = await qtyStep(x, auto);
          done[key] = { st: r, at: new Date().toISOString(), tq: x.tq, ver: r === 'ok' ? 1 : 0, why: r === 'err' ? lastErr : '' }; ls.set(DKEY, done);
          if (r === 'ok') x.o.qty = x.tq;
          render();
          if (r === 'err') break;
          await sleep(auto ? 3000 : 600);
          continue;
        }
        lastErr = '';
        const r = await priceStep(x, auto);
        done[key] = { st: r, at: new Date().toISOString(), ver: r === 'ok' ? 1 : 0, why: r === 'err' ? lastErr : '' }; ls.set(DKEY, done);
        if (r === 'ok') x.o.price = x.it.price;
        render();
        if (r === 'err') break;
        await sleep(auto ? 3000 : 600);
      }
      ls.set(OKEY, offers);
      cleanPage();
      running = false; render();
      const left = matchAll().filter(x => x.o && x.st !== 'ok' && x.st !== 'same' && x.st !== 'zero').length;
      const zero = matchAll().filter(x => x.st === 'zero');
      prog(left ? (lastErr ? `⚠ ${lastErr}` : `Fermo. Mancano ${left} offerte: premi ▶ per continuare.`) : `Finito ✓${zero.length ? ` Togli tu da Cardmarket ${zero.length === 1 ? "l'offerta che va" : 'le ' + zero.length + ' offerte che vanno'} a 0 copie (${zero.map(x => x.o.name).join(', ')}).` : ''} Ogni carta è stata ricontrollata su Cardmarket: premi "📤 Invia al gestionale".`);
    }

    // ---- verifica: rilegge le offerte e controlla i prezzi ----
    async function verify() {
      await readAll();
      if (!offers) return;
      const byId = Object.fromEntries(offers.list.map(o => [o.id, o]));
      let ok = 0, bad = 0;
      Object.keys(done).forEach(key => {
        if (key === '__job') return;
        const [k, id] = key.split('#');
        const it = job.items.find(i => i.k === k), o = byId[id];
        if (!it || !o) return;
        const good = done[key].tq != null ? o.qty === done[key].tq : Math.abs(o.price - it.price) < 0.005;
        if (done[key].st === 'zero') return;
        if (good) { done[key] = Object.assign(done[key], { st: 'ok', ver: 1 }); ok++; }
        else if (done[key].st === 'ok') { done[key] = { st: '', ver: 0 }; bad++; }
      });
      ls.set(DKEY, done); render();
      prog(`Verifica: ${ok} ${job.type === 'qty' ? 'quantità giuste' : 'prezzi giusti'} su Cardmarket${bad ? `, ${bad} NON cambiati (di nuovo "da fare")` : ''}.`);
    }

    // ---- invio al gestionale ----
    function send() {
      const res = [];
      const seen = new Set();
      matchAll().forEach(x => {
        if (!x.o || (x.st !== 'ok' && x.st !== 'same' && x.st !== 'zero') || seen.has(x.it.k)) return;
        seen.add(x.it.k);
        res.push({ k: x.it.k, qt: x.it.qt ?? null, zero: matchAll().some(y => y.it.k === x.it.k && y.st === 'zero') ? 1 : 0, price: x.it.price, b: x.it.b, o: x.it.o, ref: x.it.ref, at: (done[x.it.k + '#' + x.o.id] || {}).at || new Date().toISOString() });
      });
      if (job.fromCheck) {
        // controllo + correzione: mando il controllo (offerte già con le copie corrette) e l'elenco delle correzioni
        ls.set(OKEY, offers);
        check = job.fromCheck;
        const fixed = res.filter(r => r.qt != null).map(r => ({ k: r.k, qt: r.qt, from: (job.items.find(i => i.k === r.k) || {}).from, zero: r.zero }));
        sendCheck(fixed);
        done.__sent = 1; ls.set(DKEY, done);
        job.done = 1; ls.set(EKEY, null); job = null;
        check = 0; ls.set('cs_check', 0);
        render();
        prog(`Inviato il controllo al gestionale ✓ (${fixed.filter(r => !r.zero).length} carte corrette su Cardmarket). Guarda la scheda "Controllo".`);
        return;
      }
      if (!res.length) { alert(job.type === 'qty' ? 'Nessuna quantità corretta da inviare.' : 'Nessun prezzo cambiato da inviare.'); return; }
      const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, type: job.type || 'edit', name: job.name, res }))));
      toGest('#cmedit=' + encodeURIComponent(enc));
      done.__sent = 1; ls.set(DKEY, done);
      prog(`Inviati ${res.length} ${job.type === 'qty' ? 'risultati' : 'prezzi'} al gestionale ✓`);
      render();
    }

    render();
    if (job && !offers) readAll();
  }

  // pagina "Le mie offerte": cambio prezzi
  if (/\/Stock\/Offers\//i.test(location.pathname)) { offersMode(); return; }
  if (window.__csPanel) { window.__csPanel.style.display = ''; return; }

  const form = document.getElementById('BulkListingForm');
  if (!form) {
    const j = jobGet();
    const sel = document.querySelector('select[name="idExpansion"]');
    const simp0 = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (j && !j.done) {
      const opt = sel && [...sel.options].find(o => simp0(o.textContent) === simp0(j.set));
      const id = j.cm || (opt ? opt.value : '');
      if (confirm(`Il gestionale ha preparato ${j.items.reduce((a, it) => a + it.q, 0)} copie di "${j.set}".\n\nVado alla pagina "Inserisci carte bulk"${id ? ' del set' : ''}? Quando si apre, ${AGAIN}.`))
        location.href = '/it/Pokemon/Stock/ListingMethods/BulkListing' + (id ? '?idExpansion=' + encodeURIComponent(id) : '');
      return;
    }
    let ej = null; try { ej = JSON.parse(localStorage.getItem('cs_edit')); } catch (e) {}
    if (ej && confirm(`Il gestionale ha preparato "${ej.name}" (${ej.items.length} prezzi da cambiare).\n\nVado alla pagina delle tue offerte? Quando si apre, ${EXT ? 'premi l\'icona di Card Scanner in alto in Chrome' : 'premi di nuovo il pulsante Card Scanner'}.`)) { location.href = '/it/Pokemon/Stock/Offers/Singles'; return; }
    alert('Apri prima la pagina "Inserisci carte bulk" di Cardmarket per un\'espansione, poi premi di nuovo il pulsante (o l\'icona di Card Scanner).\n\nSe hai preparato le carte nel gestionale ("Metti in vendita su Cardmarket"), apri Cardmarket da lì.');
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
  const { host: panel, root: PR } = csPanel('Metti in vendita');
  window.__csPanel = panel;
  PR.getElementById('pnIn').innerHTML = `
    <div id="csSteps"></div>
    <div class="bd" id="csBody">
      <div id="csSup" class="card okc hide"></div>
      <div id="csJob" class="card info"></div>
      <!-- la lista e il prezzo arrivano dal gestionale ("Apri su Cardmarket"): qui non si scelgono più -->
      <div class="hide"><input type="file" id="csFile"><input type="checkbox" id="csPrice" checked>
        <select id="csBase"><option value="low">Da</option><option value="trend">Tendenza</option><option value="cons">Consigliato</option></select>
        <select id="csSign"><option value="1">+</option><option value="-1">−</option></select><input id="csPlus" type="number">
        <textarea id="csInput" readonly></textarea></div>
      <div class="msg" id="csMsg"></div>
      <button class="big go hide" id="csGest"></button>
      <button class="big" id="csGo">Compila la pagina</button>
      ${EXT ? '<label class="mut" style="display:flex;gap:8px;align-items:flex-start;margin:2px 0 8px;cursor:pointer"><input type="checkbox" id="csAuto" style="margin-top:3px"><span><b style="color:#1d2433">Avanti da solo</b>: compila la pagina, dopo "Mettere in vendita le carte" la invia al gestionale e passa alla pagina dopo. "Mettere in vendita" lo premi sempre tu.</span></label>' : ''}
      <div id="csProg" class="hide"></div>
      <div><label class="mut" for="csComment">Commento sulle offerte</label><input id="csComment" placeholder="es. Collezione privata"></div>
      <details id="csDet" class="hide"><summary class="mut" style="cursor:pointer">Dettagli della compilazione</summary><div id="csLog" class="log"></div></details>
    </div>
    <div class="ft"><a href="#" id="csClip">Incolla elenco dal gestionale</a><a href="#" id="csCat" title="Manda al gestionale l'elenco delle carte e delle sigle di questo set (senza metterle in vendita)">Aggiorna i dati del set nel gestionale</a></div>`;
  const $ = id => PR.getElementById(id);
  const LOGC = { '#ff9f43': 'warn', '#ff3b3b': 'err', '#ff6b6b': 'err', '#3ecf6e': 'ok', '#9aa3ad': 'mutd' };
  const log = (t, color) => {
    const d = document.createElement('div');
    if (color) d.className = LOGC[color] || '';
    d.textContent = t;
    $('csLog').appendChild(d);
    $('csDet').classList.remove('hide');
    // i messaggi importanti (esito, errori) anche in evidenza sopra
    if (/^\s*(Compilate|⚠|Inviate|Nessuna|Errore|⏳|➡|✓)/.test(t)) { const m = document.createElement('div'); m.className = d.className; m.textContent = t.trim(); $('csMsg').appendChild(m); }
  };
  function steps() {
    const j = jobGet(), act = activeJob();
    const compiled = snapshot().length > 0, sent = $('csGest').dataset.sent === '1';
    const st = !act ? 0 : sent ? 3 : compiled ? 2 : 1;
    $('csSteps').innerHTML = j ? stepsHtml(['Elenco dal gestionale', 'Compila la pagina', 'Metti in vendita e invia'], Math.min(st, 2), st) : '';
    $('csGo').classList.toggle('hide', !act);
  }


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
    map.byP = new Map();
    form.querySelectorAll('tbody tr').forEach(tr => {
      const a = tr.querySelector('.col-product a');
      if (!a) return;
      const full = a.textContent.trim();
      const m = full.match(/^(.*?)\s*\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
      if (!m) return;
      const k = norm(m[3]);
      const rar = tr.querySelector('.rarity-symbol');
      const pid = String((field(tr, 'idProduct') || {}).value || '');
      const row = {
        tr, name: m[1].trim(), code: m[2], num: m[3], label: full.replace(/\s+/g, ' '), href: a.getAttribute('href'), pid,
        rarity: rar ? (rar.getAttribute('title') || rar.getAttribute('data-bs-original-title') || '') : ''
      };
      if (!map.has(k)) map.set(k, row);
      if (pid && !map.byP.has(pid)) map.byP.set(pid, row);
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
    if (isVx(o.v)) tr.dataset.csV = o.v; else delete tr.dataset.csV;
    tr.style.outline = '3px solid ' + (o.err ? '#ff3b3b' : o.warn ? '#ff9f43' : isVx(o.v) ? '#e0a100' : o.rev ? '#cc5de8' : '#3ecf6e');
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
  const BASE_NAME = { low: 'Da', trend: 'Tendenza', cons: 'Consigliato' };
  const BASE_ALT = { low: ['trend'], trend: ['low'], cons: ['low', 'trend'] };
  const normBase = b => (b === 'trend' || b === 'cons') ? b : 'low';
  /** valore dall'elenco del gestionale (Da e Tendenza della variante giusta, Normale o Reverse); null = non c'è */
  function jobValue(ji, rev, base) {
    const val = { low: ji.lo, trend: ji.t, cons: ji.c };
    const tag = rev ? ' Reverse' : '';
    const used = [base, ...(BASE_ALT[base] || [])].find(x => val[x] != null);
    if (ji.mp != null) return { fixed: +ji.mp, v: used ? +val[used] : null, used: used || base, src: 'prezzo fissato nel gestionale (scritto da te o carta già in vendita)' };
    if (used === base) return { v: +val[base], used: base, src: `${BASE_NAME[base]}${tag} (gestionale)` };
    if (used) return { v: +val[used], used, src: `${BASE_NAME[used]}${tag} (gestionale, manca ${BASE_NAME[base]})`, warn: true };
    return null;
  }
  /** valore base per la riga: {v, src, warn} */
  function baseValue(tr, rev, base) {
    if (base === 'cons') base = 'low'; // senza elenco del gestionale il Consigliato non c'è: uso Da
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
      m = l.match(/^([A-Z]*\d+[a-z]?)\s*\|\s*x\s*(\d+)\s*\|\s*([NREPMCS])\s*(?:\|\s*([^|]*?))?\s*(?:\|\s*([^|#]*?))?\s*(?:\|\s*#([\w-]+))?\s*$/i);
      if (m) {
        const L = m[3].toUpperCase(), it = { num: m[1], qty: +m[2], rev: L === 'R', name: m[4] || '', rarity: m[5] || '' };
        if (isVx(L)) { it.v = L; if (m[6]) it.p = m[6]; }
        items.push(it); return;
      }
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
  function catalog(root) {
    const cards = [];
    (root || form).querySelectorAll('tbody tr').forEach(tr => {
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
  /** variante speciale di una riga compilata: dalla compilazione o dall'elenco del gestionale (per prodotto) */
  function vxOfRow(tr, pid) {
    let v = tr.dataset.csV;
    if (!isVx(v)) { const j = jobGet(), it = j && j.items && j.items.find(x => isVx(x.v) && String(x.p) === String(pid)); v = it ? it.v : ''; }
    if (!isVx(v)) return {};
    const a = tr.querySelector('.col-product a');
    return { v, sl: a ? slugOf(a.getAttribute('href')) : '' };
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
        com: (field(tr, 'comments') || {}).value || '', ...vxOfRow(tr, pid.value),
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
  // ogni elenco del gestionale ha un nome unico (es. DLR-Dominio_Delta_20261115-030612) scritto nella lista:
  // un elenco nuovo è sempre una lista nuova, con l'avanzamento da zero
  const listId = () => hashStr($('csInput').value.replace(/\s+/g, ' ').trim());
  const vkey = (num, rev, v) => norm(num) + '|' + (isVx(v) ? v : rev ? 'R' : 'N');
  const vTagH = it => isVx(it.v) ? ` <span class="rv" style="background:#e0a100">${VXB[it.v]}</span>` : it.rev ? ' <span class="rv">R</span>' : '';
  const vTagT = it => isVx(it.v) ? ' ' + VXB[it.v] : it.rev ? ' R' : '';
  /** la riga di questa carta è in questa pagina? le speciali si cercano per prodotto */
  // nella pagina dei Supplementi i numeri sono quelli delle carte speciali (xASC 001): le normali e le Reverse del set sono altrove
  const onSupPage = () => { const j = jobGet(); return !!(j && j.cmx && String(j.cmx) === expansion().id); };
  const rowHere = (here, it) => isVx(it.v) ? (it.p ? here.byP.has(String(it.p)) : false) : !onSupPage() && here.has(norm(it.num));
  const doneGet = () => { try { return JSON.parse(store.get('done_' + listId(), '{}')); } catch (e) { return {}; } };
  const doneSet = o => store.set('done_' + listId(), JSON.stringify(o));
  function wanted() {
    const w = new Map();
    parseInput($('csInput').value).items.forEach(it => {
      const k = vkey(it.num, it.rev, it.v);
      const x = w.get(k) || { num: it.num, rev: it.rev, v: it.v, qty: 0 };
      x.qty += it.qty; w.set(k, x);
    });
    return w;
  }
  let lastCounts = { tot: 0, sent: 0, hereLeft: 0, otherLeft: 0 };
  function showProgress() {
    const box = $('csProg');
    const list = parseInput($('csInput').value).items;
    if (!list.length) { lastCounts = { tot: 0, sent: 0, hereLeft: 0, otherLeft: 0 }; box.classList.add('hide'); steps(); return; }
    const done = Object.assign({}, doneGet()), here = pageRows();
    let tot = 0, sent = 0, hereLeft = 0, otherLeft = 0, leftVx = 0, leftMain = 0;
    const rowsHtml = list.map(it => {
      const k = vkey(it.num, it.rev, it.v);
      const d = Math.min(done[k] || 0, it.qty);
      done[k] = (done[k] || 0) - d;
      tot += it.qty; sent += d;
      const left = it.qty - d;
      const isHere = rowHere(here, it);
      if (left) { if (isHere) hereLeft += left; else otherLeft += left; if (isVx(it.v)) leftVx += left; else leftMain += left; }
      const st = !left ? '<span class="pill ok">inviata</span>'
        : isHere ? '<span class="pill todo">da compilare qui</span>' : '<span class="pill oth">altra pagina</span>';
      return `<div class="li" style="${left ? '' : 'opacity:.55'}"><span class="c">${esc(it.num)}${vTagH(it)}</span><span class="n">${esc(it.name || '')}</span><span class="p">×${left || it.qty} ${st}</span></div>`;
    }).join('');
    lastCounts = { tot, sent, hereLeft, otherLeft, leftVx, leftMain };
    box.classList.remove('hide');
    box.innerHTML = `<div class="stat"><span>Inviate al gestionale <b>${sent}</b> di ${tot} copie</span><span class="mut">${hereLeft} da compilare qui · ${otherLeft} in altre pagine</span></div>
      <div class="bar"><i style="width:${tot ? Math.round(sent / tot * 100) : 0}%"></i></div>
      <details style="margin-top:8px"><summary class="mut" style="cursor:pointer">Elenco delle carte (${list.length})</summary><div class="list">${rowsHtml}</div></details>
      <div style="text-align:right;margin-top:4px"><a href="#" id="csReset" class="mut">Azzera l'avanzamento</a></div>`;
    $('csReset').onclick = e => { e.preventDefault(); if (confirm('Azzerare l\'avanzamento di questa lista?')) { doneSet({}); showProgress(); } };
    steps();
  }
  $('csInput').addEventListener('input', showProgress);
  $('csFile').addEventListener('change', () => setTimeout(showProgress, 300));

  // Cardmarket, dopo "Mettere in vendita le carte", svuota i campi senza ricaricare la pagina:
  // tengo l'ultima compilazione (presa anche al momento dell'invio del modulo) per mandarla al gestionale
  let lastSnap = [];
  const keepSnap = () => { const r = snapshot(); if (r.length) lastSnap = r; return r; };
  form.addEventListener('submit', keepSnap, true);
  form.addEventListener('click', e => { if (e.target.closest('button[type="submit"],input[type="submit"],button:not([type])')) keepSnap(); }, true);
  function showGest(state) {
    const b = $('csGest');
    if (state === 'sent') { b.classList.remove('hide'); b.disabled = true; b.dataset.sent = '1'; b.textContent = '✓ Inviate al gestionale'; steps(); return; }
    const live = keepSnap();
    const n = (live.length ? live : lastSnap).reduce((a, r) => a + r.q, 0);
    b.disabled = false; b.dataset.sent = '';
    b.classList.toggle('hide', !n);
    b.textContent = `📤 Le ho messe in vendita: invia al gestionale (${n} copie)`;
    steps();
  }
  // ---------- controllo della messa in vendita: copie del set su Cardmarket prima e dopo ----------
  const OFF_LANGS = { Italiano: 'it', Inglese: 'en', English: 'en', Francese: 'fr', Tedesco: 'de', Spagnolo: 'es', Portoghese: 'pt', Giapponese: 'ja', Coreano: 'ko' };
  /** copie in vendita di un set su Cardmarket, per numero|variante|lingua (pagina "Le mie offerte" filtrata per Edizione) */
  async function expQty(idExp, onProg) {
    const map = {}; let capped = false;
    for (const rev of ['N', 'Y']) {
      let page = 1, pages = 1;
      do {
        const r = await fetch(`/it/Pokemon/Stock/Offers/Singles?idExpansion=${encodeURIComponent(idExp)}&isReverseHolo=${rev}&site=${page}`, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const rows = [...doc.querySelectorAll('[id^="stockRow"]')];
        rows.forEach(row => {
          const nm = ((row.querySelector('.col-seller a') || {}).textContent || '').replace(/\s+/g, ' ').trim().match(/\(([A-Z0-9-]+)\s+([A-Z]*\d+[a-z]?)\)\s*$/i);
          if (!nm) return;
          let lang = 'it';
          row.querySelectorAll('.product-attributes [aria-label], .product-attributes [data-bs-original-title]').forEach(e => { const l = OFF_LANGS[e.getAttribute('aria-label') || e.getAttribute('data-bs-original-title')]; if (l) lang = l; });
          const qt = row.querySelector('.amount-container .item-count') || row.querySelector('.item-count');
          const k = `${norm(nm[2])}|${rev === 'Y' ? 'R' : 'N'}|${lang}`, n = qt ? +qt.textContent.trim() || 0 : 0;
          map[k] = (map[k] || 0) + n;
          const sa = row.querySelector('.col-seller a'), sl = sa ? slugOf(sa.getAttribute('href')) : '';
          if (sl) { const ks = `${sl}|${rev === 'Y' ? 'R' : 'N'}|${lang}`; map[ks] = (map[ks] || 0) + n; }
        });
        const tx = doc.body.textContent, pm = tx.match(/Pagina\s+\d+\s+di\s+(\d+)\s*(\+?)/i);
        if (pm) { pages = +pm[1]; if (pm[2]) capped = true; }
        if (/300\s*\+\s*Risultati/i.test(tx)) capped = true;
        if (onProg) onProg(`${rev === 'Y' ? 'Reverse' : 'normali'}, pagina ${page} di ${pages}`);
        page++;
        if (!rows.length) break;
        await sleep(400);
      } while (page <= pages && page <= 15);
    }
    return { map, capped };
  }
  // dopo "Compila la pagina" leggo le copie del set già in vendita (prima che tu prema "Mettere in vendita le carte")
  let before = null;
  function takeBefore() {
    const id = expansion().id;
    if (!id) { before = null; return; }
    const b = { exp: id, at: Date.now(), done: false, p: null };
    b.p = expQty(id, t => { b.prog = t; }).then(x => { b.done = true; b.val = x; if (!b.late) log('✓ Pronto: ora puoi premere "Mettere in vendita le carte" su Cardmarket.', '#3ecf6e'); return x; }).catch(() => { b.done = true; return null; });
    before = b;
  }
  form.addEventListener('submit', () => { if (before && !before.done) before.late = true; }, true);
  // Se premi "Mettere in vendita le carte" mentre sto ancora leggendo le carte già in vendita, le ultime pagine lette
  // conterrebbero già le carte nuove e poi non le troverei "aggiunte". Fermo quel clic e ti chiedo di ripremere tra poco.
  // (Lo script non preme mai il pulsante al posto tuo.)
  addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[type="submit"],input[type="submit"],button:not([type])');
    if (!b || !form.contains(b) || !/vendita|vendere|mettere/i.test(b.textContent || b.value || '') || !before || before.done || before.late) return;
    e.preventDefault(); e.stopImmediatePropagation();
    log(`⏳ Un attimo: sto ancora leggendo le carte del set già in vendita${before.prog ? ' (' + before.prog + ')' : ''}. Ripremi "Mettere in vendita le carte" quando qui compare "Pronto".`, '#ff9f43');
  }, true);
  const offKey = r => `${r.sl ? r.sl : norm(r.u)}|${r.rev ? 'R' : 'N'}|${r.lang || 'it'}`;
  let sending = false;
  // opt.auto (estensione, "Avanti da solo"): niente domande; 'retry' = non vedo ancora tutte le carte, 'stop' = non posso controllare
  async function sendCompiled(opt) {
    const auto = !!(opt && opt.auto === true);
    if (sending) return 'retry';
    let rows = keepSnap();
    if (!rows.length) rows = lastSnap;
    if (!rows.length) { if (!auto) log('Nessuna carta compilata in questa pagina.', '#ff6b6b'); return 'stop'; }
    const exp = expansion();
    // controllo su Cardmarket: invio al gestionale solo le copie che risultano davvero in vendita
    sending = true; $('csGest').disabled = true;
    const tot = rows.reduce((a, r) => a + r.q, 0);
    if (!auto) log('Controllo su Cardmarket che le carte siano davvero in vendita…');
    let checked = false;
    try {
      const B = before && before.exp === exp.id && !before.late ? await before.p : null;
      if (B && !B.capped) {
        const A = await expQty(exp.id);
        if (!A.capped) {
          const added = {};
          Object.keys(A.map).forEach(k => { added[k] = A.map[k] - (B.map[k] || 0); });
          const ok = [], miss = [];
          rows.forEach(r => { const k = offKey(r), take = Math.max(0, Math.min(added[k] || 0, r.q)); if (take) { ok.push(Object.assign({}, r, { q: take })); added[k] -= take; } if (take < r.q) miss.push(Object.assign({}, r, { q: r.q - take })); });
          checked = true;
          if (miss.length && auto) { lastSnap = rows; return 'retry'; }
          if (miss.length) {
            // copie che ci sono su Cardmarket ma c'erano già quando ho letto "prima": o erano in vendita da prima,
            // o le hai messe in vendita mentre leggevo (o dopo un nuovo "Compila"). Decidi tu.
            const there = miss.filter(r => (A.map[offKey(r)] || 0) >= r.q);
            if (there.length) {
              const tq = there.reduce((a, r) => a + r.q, 0), tt = there.slice(0, 12).map(r => `${r.u}${vTagT(r)} ×${r.q}`).join(', ') + (there.length > 12 ? '…' : '');
              if (confirm(`Queste carte ora sono in vendita su Cardmarket, ma c'erano già quando ho controllato dopo "Compila": ${tt} (${tq} copie).\n\nSuccede se le hai messe in vendita mentre leggevo o se hai premuto di nuovo "Compila" dopo averle messe in vendita.\n\nLe hai messe in vendita adesso tu? OK = le invio al gestionale. Annulla = no, erano già in vendita da prima.`)) {
                there.forEach(r => { ok.push(r); miss.splice(miss.indexOf(r), 1); });
              }
            }
            const mq = miss.reduce((a, r) => a + r.q, 0), txt = miss.slice(0, 12).map(r => `${r.u}${vTagT(r)} ×${r.q}`).join(', ') + (miss.length > 12 ? '…' : '');
            if (!miss.length) { /* tutte confermate */ }
            else if (!ok.length) {
              log(`⚠ Su Cardmarket non risulta in vendita nessuna delle ${tot} copie compilate: non ho inviato nulla. Premi "Mettere in vendita le carte" (o controlla gli errori di Cardmarket) e poi di nuovo il pulsante verde.`, '#ff6b6b');
              lastSnap = rows; return;
            }
            else if (!confirm(`Su Cardmarket risultano in vendita ${tot - mq} copie su ${tot}.\n\nNon risultano: ${txt} (${mq} copie). Forse Cardmarket le ha rifiutate.\n\nInvio al gestionale solo le ${tot - mq} copie che risultano in vendita?`)) { lastSnap = rows; log('Invio annullato: niente è cambiato nel gestionale.'); return; }
            rows = ok;
          }
        }
      }
    } catch (e) { checked = false; }
    finally { sending = false; $('csGest').disabled = false; }
    if (!checked && auto) { lastSnap = rows; return 'stop'; }
    if (!checked && !confirm(`Non riesco a controllare su Cardmarket che le ${tot} copie siano davvero in vendita.\n\nLe hai messe in vendita con "Mettere in vendita le carte"? Se sì, premi OK e le invio al gestionale.`)) { lastSnap = rows; return; }
    lastSnap = []; before = null;
    const entry = { exp: exp.id, name: exp.name, at: new Date().toISOString(), rows, cards: catalog() };
    // segno nella lista le carte inviate
    const w = wanted(), done = doneGet();
    rows.forEach(r => { const k = vkey(r.u, r.rev, r.v); if (w.has(k)) done[k] = (done[k] || 0) + r.q; });
    doneSet(done);
    sendToGest([entry]);
    showProgress();
    showGest('sent');
    const left = [...w.entries()].reduce((a, [k, x]) => a + Math.max(0, x.qty - (done[k] || 0)), 0);
    const aj = activeJob();
    if (aj && !left) { aj.done = true; try { localStorage.setItem(JKEY, JSON.stringify(aj)); } catch (e) {} }
    log(`Inviate al gestionale ${rows.reduce((a, r) => a + r.q, 0)} copie: ora nel gestionale risultano In vendita.` +
      (left ? ` Restano ${left} copie della lista da mettere in vendita (in questa o in altre pagine).` : ' Tutta la lista è stata inviata ✔'), left ? '#ff9f43' : '#3ecf6e');
    return 'sent';
  }
  function sendToGest(listed, cards) {
    const exp = expansion();
    const exps = document.querySelector('select[name="idExpansion"]');
    const data = {
      v: 2, exp: { id: exp.id, name: exp.name, cards: cards || catalog() },
      exps: exps ? [...exps.options].map(o => [o.value, o.textContent.trim()]).filter(x => x[0]) : [],
      listed: listed || []
    };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    toGest('#cm2=' + encodeURIComponent(enc));
  }
  $('csGest').onclick = sendCompiled;
  $('csCat').onclick = e => { e.preventDefault(); sendToGest([]); };
  form.addEventListener('input', () => { if (!$('csGest').disabled) showGest(); });
  // ---------- elenco dal gestionale ----------
  function jobText(j) {
    return ['CARDSCANNER 2', '# ELENCO ' + (j.name || j.at), `SET ${j.set} | ${j.lang || 'it'}${j.sid ? ' | ' + j.sid : ''}`, j.com ? 'COMMENTO ' + j.com : '',
      ...j.items.map(it => `${it.u} | x${it.q} | ${isVx(it.v) ? it.v : it.rev ? 'R' : 'N'} | ${String(it.n || '').replace(/[|#]/g, ' ')} | ${String(it.r || '').replace(/[|#]/g, ' ')}${isVx(it.v) && it.p ? ' | #' + it.p : ''}`)].filter(Boolean).join('\n');
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
    box.className = 'card info';
    // pagina dei Supplementi senza elenco: c'è solo il riquadro delle carte speciali
    if (!j && isSupExp()) { box.className = 'hide'; $('csGo').classList.add('hide'); steps(); return; }
    if (!j) {
      box.className = 'card warn';
      box.innerHTML = '<b>Nessun elenco dal gestionale.</b><br>Nel gestionale apri il set, premi <b>Metti in vendita su Cardmarket</b> e scegli il prezzo: poi torna qui e premi di nuovo questo pulsante.';
      steps(); return;
    }
    if (j.done) {
      box.className = 'card okc';
      box.innerHTML = `<b>✓ Elenco completato</b><div class="nm">${esc(j.name || j.set)}</div><div class="mut">Tutte le carte sono state inviate al gestionale. Per caricarne altre premi di nuovo <b>Metti in vendita su Cardmarket</b> nel gestionale.</div>`;
      steps(); return;
    }
    const copies = j.items.reduce((a, it) => a + it.q, 0);
    const eurS = v => Math.abs(v / 100).toFixed(2).replace('.', ',') + ' €';
    const rule = `${BASE_NAME[j.base] || j.base}${j.plus ? ` ${j.plus > 0 ? '+' : '−'} ${eurS(j.plus)}` : ''}`;
    box.style.display = 'block';
    const exp = expansion();
    if (!sameSet(j.set, exp.name) && !(j.cmx && String(j.cmx) === exp.id)) {
      const sel = document.querySelector('select[name="idExpansion"]');
      const opt = sel && [...sel.options].find(o => sameSet(o.textContent, j.set));
      const id = (j.cmx && j.items.every(it => isVx(it.v)) ? j.cmx : '') || j.cm || (opt ? opt.value : '');
      box.className = 'card warn';
      box.innerHTML = `<div class="nm">${esc(j.name || j.set)}</div><div>Il gestionale ha preparato <b>${esc(j.set)}</b> (${copies} copie), ma questa pagina è <b>${esc(exp.name || '?')}</b>.</div>` +
        (id ? `<button class="big navy" id="csJobGo" style="margin-top:10px">Vai a ${esc(j.set)}</button><div class="mut" style="margin-top:6px">Quando la pagina si apre, ${AGAIN}.</div>` : '<div class="mut">Scegli il set giusto in "Edizione" e premi di nuovo il pulsante.</div>');
      if (id) $('csJobGo').onclick = e => { e.preventDefault(); location.href = location.pathname + '?idExpansion=' + encodeURIComponent(id); };
      $('csGo').classList.add('hide'); $('csSteps').innerHTML = stepsHtml(['Elenco dal gestionale', 'Compila la pagina', 'Metti in vendita e invia'], 0, 0);
      return;
    }
    if (!activeJob()) {
      $('csInput').value = jobText(j); store.set('list', $('csInput').value);
      $('csComment').value = j.com || ''; store.set('comment', $('csComment').value);
    }
    $('csBase').value = normBase(j.base); store.set('base', $('csBase').value);
    $('csSign').value = j.plus < 0 ? '-1' : '1'; store.set('sign', $('csSign').value);
    $('csPlus').value = String(Math.abs(j.plus || 0)); store.set('plus', $('csPlus').value);
    $('csPrice').checked = true;
    const nM = j.items.filter(it => it.mp != null).length, nMiss = j.items.filter(it => it.mp == null && it.lo == null && it.t == null).length;
    box.innerHTML = `<div class="nm">${esc(j.name || 'Elenco dal gestionale')}</div>
      <div>${esc(j.set)} · ${copies} copie (${j.items.length} righe) · prezzo <b>${rule}</b></div>` +
      (j.cmx && j.items.some(it => isVx(it.v)) ? `<div class="mut">${j.items.filter(it => isVx(it.v)).reduce((a, it) => a + it.q, 0)} copie sono varianti speciali: si mettono in vendita nella pagina <b>${esc(j.setx || 'Supplementi')}</b>${String(j.cmx) === exp.id ? ' (questa)' : ''}.</div>` : '') + `
      <div class="mut">Prezzi calcolati dal gestionale, Normali e Reverse separate${nM ? ` · ${nM} con il prezzo fissato nel gestionale (scritto da te o già in vendita)` : ''}.</div>` +
      (nMiss ? `<div style="color:#b42318;font-size:12.5px;margin-top:4px">${nMiss} carte senza prezzo di mercato: dopo la compilazione hanno il bordo rosso, scrivi tu il prezzo.</div>` : '');
    steps();
  }
  // ---------- Supplementi: elenco delle carte speciali al gestionale (tutte le pagine, solo lettura) ----------
  function isSupExp() { return /supplementi|additionals?/i.test(expansion().name); }
  async function supCards(onProg) {
    const cards = catalog(), seen = new Set(cards.map(c => c.p));
    const m = document.body.textContent.match(/Pagina\s+(\d+)\s+di\s+(\d+)/i), cur = m ? +m[1] : 1, tot = m ? +m[2] : 1;
    let read = 1, stuck = false;
    for (let pg = 1; pg <= tot && pg <= 30; pg++) {
      if (pg === cur) continue;
      onProg(`leggo la pagina ${pg} di ${tot}…`);
      const u = new URL(location.href); u.hash = ''; u.searchParams.set('site', String(pg));
      const r = await fetch(u.toString(), { credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const f = new DOMParser().parseFromString(await r.text(), 'text/html').getElementById('BulkListingForm');
      const more = f ? catalog(f).filter(c => !seen.has(c.p)) : [];
      if (!more.length) { stuck = true; break; }   // la pagina non cambia: le altre pagine le fai tu
      more.forEach(c => { seen.add(c.p); cards.push(c); }); read++;
      await sleep(400);
    }
    return { cards, tot, read, stuck };
  }
  function showSup() {
    const box = $('csSup');
    if (!isSupExp()) return;
    const exp = expansion();
    box.classList.remove('hide');
    box.innerHTML = `<div class="nm">Carte speciali · ${esc(exp.name)}</div>
      <div class="mut">Per riconoscere le varianti (Reverse Energia, Poké Ball, Master Ball, Cosmo Holo, timbrate) il gestionale ha bisogno dell'elenco di queste carte. Lo leggo da Cardmarket e lo mando al gestionale: <b>non metto in vendita niente</b>.</div>
      <button class="big navy" id="csSupGo" style="margin-top:10px">📤 Manda le carte speciali al gestionale</button><div class="mut" id="csSupMsg" style="margin-top:6px"></div>`;
    $('csSupGo').onclick = async () => {
      const b = $('csSupGo'), msg = t => { $('csSupMsg').textContent = t; };
      b.disabled = true; b.textContent = 'Leggo le carte…';
      try {
        const r = await supCards(msg);
        sendToGest([], r.cards);
        b.textContent = '✓ Mandate al gestionale';
        $('csSupMsg').innerHTML = `${r.cards.length} carte speciali${r.tot > 1 ? ` (${r.read} di ${r.tot} pagine)` : ''}. Ora nel gestionale apri il set e premi <b>🎨 Varianti</b>.` +
          (r.stuck ? `<br><span style="color:#b42318">Non riesco a leggere da qui le altre pagine: vai alle pagine successive dei Supplementi e premi di nuovo questo pulsante su ognuna.</span>` : '');
      } catch (e) { b.disabled = false; b.textContent = '📤 Riprova'; msg('Errore: ' + (e.message || e)); }
    };
  }
  showSup();
  $('csClip').onclick = async e => {
    e.preventDefault();
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch (er) { t = prompt('Incolla qui il testo copiato dal gestionale (inizia con csjob=)') || ''; }
    if (intake(t)) { try { localStorage.setItem('cs_in_at', String(Date.now())); } catch (er) {} showJob(); showProgress(); showGest(); log('Elenco dal gestionale caricato ✔', '#3ecf6e'); }
    else alert('Negli appunti non c\'è un elenco del gestionale. Nel gestionale premi "Metti in vendita su Cardmarket".');
  };
  showJob();
  showGest();
  showProgress();

  // ---------- "Avanti da solo" (solo con l'estensione) ----------
  // compila da solo, dopo il TUO clic su "Mettere in vendita le carte" controlla e invia al gestionale da solo,
  // poi passa alla pagina dopo del set. Lo script non preme mai il pulsante di Cardmarket.
  if ($('csAuto')) { $('csAuto').checked = store.get('auto', '1') === '1'; $('csAuto').onchange = () => { store.set('auto', $('csAuto').checked ? '1' : '0'); if (!$('csAuto').checked) stayHere = true; }; }
  const autoOn = () => !!($('csAuto') && $('csAuto').checked);
  let stayHere = false, autoBusy = false;
  const pageNo = () => { const m = document.body.textContent.match(/Pagina\s+(\d+)\s+di\s+(\d+)/i); return m ? { cur: +m[1], tot: +m[2] } : { cur: 1, tot: 1 }; };
  function goNext() {
    if (!autoOn() || stayHere) return;
    const c = lastCounts;
    if (!c.otherLeft || c.hereLeft) return;
    const { cur, tot } = pageNo();
    const j = activeJob(), eid = expansion().id, onSup = !!(j && j.cmx && String(j.cmx) === String(eid));
    // in questo set restano carte? (nel principale le normali/Reverse, nei Supplementi le speciali)
    const mine = onSup ? c.leftVx : c.leftMain, other = onSup ? c.leftMain : c.leftVx;
    let u = null, what = '';
    if (mine && cur < tot) { u = new URL(location.href); u.searchParams.set('site', String(cur + 1)); what = `alla pagina ${cur + 1} di ${tot}`; }
    else {
      if (mine) log(`⚠ Restano ${mine} copie della lista che non trovo da questa pagina in poi: controlla le pagine prima di questa o il set su Cardmarket.`, '#ff9f43');
      const to = !j ? '' : onSup ? j.cm : j.cmx;
      if (other && to) { u = new URL(location.origin + location.pathname); u.searchParams.set('idExpansion', String(to)); what = onSup ? `al set ${j.set}` : `a ${j.setx || 'Supplementi'} (varianti speciali)`; }
    }
    if (!u) { if (!mine) log(`⚠ Restano ${c.otherLeft} copie della lista che non trovo da questa pagina in poi: controlla le pagine prima di questa o il set su Cardmarket.`, '#ff9f43'); return; }
    log(`➡ Tra 3 secondi vado ${what}…`, '#3ecf6e');
    const b = document.createElement('button'); b.className = 'big'; b.textContent = 'Resta qui'; b.style.marginTop = '6px';
    b.onclick = () => { stayHere = true; b.remove(); log('Resto su questa pagina.'); };
    $('csMsg').appendChild(b);
    setTimeout(() => { if (!stayHere && autoOn()) location.href = u.toString(); }, 3000);
  }
  // se Cardmarket ricarica la pagina dopo "Mettere in vendita", riprendo da qui (lo salvo subito, al clic)
  function savePend(rows0) {
    if (!before || !before.done || !before.val || before.val.capped || !rows0.length) return;
    try { sessionStorage.setItem('cs_pend', JSON.stringify({ lid: listId(), exp: before.exp, rows: rows0, B: before.val, at: Date.now() })); } catch (e) {}
  }
  async function autoVerify() {
    if (!autoOn() || autoBusy) return;
    autoBusy = true;
    try {
      const rows0 = lastSnap.length ? lastSnap : keepSnap();
      if (!rows0.length) return;
      const B = before && before.done && !before.late ? await before.p : null;
      if (!B || B.capped) { log('⚠ Non posso controllare da solo questa pagina: quando Cardmarket ha finito premi il pulsante verde.', '#ff9f43'); return; }
      savePend(rows0);
      log('⏳ Aspetto che Cardmarket metta in vendita le carte, poi le invio al gestionale da solo…', '#3ecf6e');
      for (let i = 0; i < 8; i++) {
        await sleep(i ? 4000 : 2500);
        const r = await sendCompiled({ auto: true });
        if (r === 'sent') { try { sessionStorage.removeItem('cs_pend'); } catch (e) {} goNext(); return; }
        if (r === 'stop') break;
      }
      try { sessionStorage.removeItem('cs_pend'); } catch (e) {}
      log('⚠ Non vedo ancora tutte le carte in vendita su Cardmarket: quando ha finito premi il pulsante verde (ti chiederò cosa fare con quelle che mancano).', '#ff9f43');
    } finally { autoBusy = false; }
  }
  // il tuo clic su "Mettere in vendita le carte" (se non l'ho fermato perché stavo ancora leggendo)
  form.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[type="submit"],input[type="submit"],button:not([type])');
    if (!b || !/vendita|vendere|mettere/i.test(b.textContent || b.value || '') || !autoOn()) return;
    savePend(keepSnap()); setTimeout(autoVerify, 0);
  }, true);
  if (EXT && form) {
    let pend = null; try { pend = JSON.parse(sessionStorage.getItem('cs_pend') || 'null'); } catch (e) {}
    if (pend && (Date.now() - pend.at > 10 * 60e3 || pend.lid !== listId())) { try { sessionStorage.removeItem('cs_pend'); } catch (e) {} pend = null; }
    if (pend && autoOn()) {
      // pagina ricaricata dopo "Mettere in vendita": riprendo il controllo e l'invio
      lastSnap = pend.rows; before = { exp: pend.exp, done: true, p: Promise.resolve(pend.B) };
      autoVerify();
    } else if (autoOn() && activeJob() && !snapshot().length) {
      if (lastCounts.hereLeft) setTimeout(() => $('csGo').onclick(), 300);
      else goNext();
    }
  }

  $('csGo').onclick = async () => {
    $('csGo').disabled = true; $('csGo').textContent = 'Compilo…';
    $('csLog').textContent = ''; $('csMsg').textContent = '';
    try { await run(); } catch (e) { log('Errore: ' + e.message, '#ff6b6b'); }
    if (snapshot().length) takeBefore();
    $('csGo').disabled = false; $('csGo').textContent = 'Compila di nuovo';
    $('csGo').classList.toggle('ghost', snapshot().length > 0);
    steps();
  };

  async function run() {
    const { lang, langCode, setName, setId, items } = parseInput($('csInput').value);
    const filled = [];
    if (!items.length) { log('Nessuna carta nella lista.', '#ff6b6b'); return; }
    const rows = pageRows();
    const wantPrice = $('csPrice').checked;
    const base = normBase($('csBase').value);
    const plus = (+$('csSign').value || 1) * Math.abs(parseInt($('csPlus').value || '0', 10) || 0) / 100;
    const comment = $('csComment').value.trim();
    const fmtPlus = plus ? ` ${plus > 0 ? '+' : '−'} ${Math.abs(plus).toFixed(2).replace('.', ',')} €` : '';
    log(`${setName ? setName + ' · ' : ''}${LANG_NAME[lang]} · ${items.length} righe` +
        (wantPrice ? ` · prezzo = ${BASE_NAME[base]}${fmtPlus}` : '') + (comment ? ` · commento "${comment}"` : ''));

    const byNum = new Map();
    const missing = [];
    const done = Object.assign({}, doneGet());
    let skipped = 0;
    const supHere = onSupPage();
    for (const it0 of items) {
      // tolgo le copie già inviate a Cardmarket in precedenza (anche da un'altra pagina)
      const k0 = vkey(it0.num, it0.rev, it0.v);
      const already = Math.min(done[k0] || 0, it0.qty);
      done[k0] = (done[k0] || 0) - already;
      skipped += already;
      if (it0.qty - already <= 0) continue;
      const it = Object.assign({}, it0, { qty: it0.qty - already });
      if (isVx(it.v)) {
        // variante speciale (Supplementi): riga del suo prodotto Cardmarket, mai Reverse
        const row = it.p && rows.byP.get(String(it.p));
        if (!row) { missing.push(it.num + vTagT(it)); continue; }
        const gk = 'p' + it.p;
        const g = byNum.get(gk) || { row, normal: 0, rev: 0, vx: it.v, pid: String(it.p), name: it.name, rarity: it.rarity };
        g.normal += it.qty; byNum.set(gk, g);
        continue;
      }
      const k = norm(it.num);
      if (!rows.has(k) || supHere) { missing.push(it.num + (it.rev ? 'R' : '')); continue; }
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
    const jobMap = job ? new Map(job.items.map(it => [isVx(it.v) ? 'p' + it.p + '|N' : norm(it.u) + '|' + (it.rev ? 'R' : 'N'), it])) : null;
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
      if (g.normal) variants.push({ rev: false, qty: g.normal, v: g.vx });
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
        fillRow(tr, { lang, rev: v.rev, v: v.v, qty: v.qty, price, comment, rule, err: wantPrice && price == null, warn: warn || (wantPrice && (price == null || pwarn)) });
        filled.push({ num: g.row.num.replace(/^0+(?=\d)/, ''), rev: v.rev, v: v.v, qty: v.qty, price, name: g.name || g.row.name, rarity: g.rarity || '' });
        total += v.qty;
        if (!warn && wantPrice && (price == null || pwarn)) warnings++;
        log(`${g.row.label} [${isVx(v.v) ? VXL[v.v].toUpperCase() : v.rev ? 'REVERSE' : 'normale'}] · ${g.row.rarity || '?'} ×${v.qty} → ${price != null ? price.toFixed(2) + ' €' : 'prezzo vuoto'}` +
            (src ? `  (${src})` : ''), wantPrice && (price == null || pwarn) ? '#ff9f43' : null);
      }
      checks.forEach(c => log('   ⚠ ' + c, '#ff9f43'));
    }
    if (noPrice) log(`\n⚠ ${noPrice} righe SENZA PREZZO (bordo rosso): scrivi tu il prezzo prima di metterle in vendita.`, '#ff3b3b');
    log(`\nCompilate ${total} copie. Verde = normali, viola = Reverse${filled.some(f => isVx(f.v)) ? ', oro = varianti speciali' : ''}, arancione = da controllare (${warnings}).`, '#3ecf6e');
    showGest();
    if (filled.length) log(autoOn() ? 'Controlla la pagina e premi tu "Mettere in vendita le carte" (quando qui compare "Pronto"): poi la invio io al gestionale e passo alla pagina dopo.' : 'Controlla la pagina e metti in vendita su Cardmarket (lo fai tu). Poi premi il pulsante verde "Invia al gestionale".', '#3ecf6e');
  }
})();
