'use strict';
const KEY = 'gestionaleCarte_v3';
const API = 'https://api.tcgdex.net/v2/it';
const CMBULK = 'https://www.cardmarket.com/it/Pokemon/Stock/ListingMethods/BulkListing?sortBy=number&idExpansion=';
const LANGN = { it: 'Italiano', en: 'Inglese', fr: 'Francese', de: 'Tedesco', es: 'Spagnolo', pt: 'Portoghese' };
// rarità in italiano (se TCGdex o Cardmarket le danno in inglese)
const RAR_IT = {
  'common': 'Comune', 'uncommon': 'Non comune', 'rare': 'Rara', 'holo rare': 'Rara holo', 'rare holo': 'Rara holo',
  'double rare': 'Doppia rara', 'ultra rare': 'Ultra rara', 'illustration rare': 'Rara illustrazione',
  'special illustration rare': 'Rara illustrazione speciale', 'hyper rare': 'Iper rara', 'secret rare': 'Rara segreta',
  'ace spec rare': 'Rara ASSO TATTICO', 'shiny rare': 'Rara cromatica', 'shiny ultra rare': 'Ultra rara cromatica',
  'mega hyper rare': 'Mega iper rara', 'black white rare': 'Rara bianco nero', 'promo': 'Promo', 'none': ''
};
const rarIt = r => RAR_IT[String(r || '').trim().toLowerCase()] ?? (r || '');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = n => /^\d+$/.test(n) ? String(parseInt(n, 10)) : String(n || '').toUpperCase();
const simp = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const eur = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',') + ' €';
const today = () => new Date().toISOString();

// ---------- dati (salvati in questo browser) ----------
// cm[idExp] = {id, name, cards:{pid:{p,n,c,u,r,i,h,m}}}   dati dalla pagina "Inserisci carte bulk" di Cardmarket
// listings[pid|N/R|lang] = {p, exp, expName, u, rev, lang, q, price, date, com}
// sold = [...]
let state = load();
// (annulla) stato di partenza = quello salvato nel browser
// I dati stanno nell'archivio grande del browser (IndexedDB, letto da boot.js prima di avviare questa pagina) e, finché
// ci stanno, anche in una copia di riserva nel vecchio spazio da 5 MB (localStorage). All'apertura prendo la più recente.
const SAVED_AT = 'gestionaleSalvatoIl';
const DBOK = () => window.__gsBootOk === true && 'indexedDB' in window;
function loadRaw() {
  const db = window.__gsBoot;
  let ls = null, lsAt = '';
  try { ls = localStorage.getItem(KEY); lsAt = localStorage.getItem(SAVED_AT) || ''; } catch (e) {}
  if (db && db.js && (!ls || !lsAt || db.at >= lsAt)) return db.js;
  return ls;
}
function load() {
  try { const s = JSON.parse(loadRaw()); if (s && s.listings) return Object.assign({ cm: {}, sold: [], standby: {} }, s); } catch (e) {}
  const s = { cm: {}, listings: {}, sold: [], standby: {} };
  // dalla versione precedente tengo gli elenchi Cardmarket, le carte in vendita e le vendite
  try {
    const o = JSON.parse(localStorage.getItem('gestionaleCarte_v2'));
    if (o) {
      s.cm = o.exps || {};
      for (const [k, l] of Object.entries(o.listings || {})) {
        const c = s.cm[l.exp]?.cards?.[l.p] || {};
        s.listings[k] = Object.assign({ expName: s.cm[l.exp]?.name || '', u: c.u || '' }, l);
      }
      s.sold = o.sold || [];
    }
  } catch (e) {}
  return s;
}
/** toglie dal browser le copie temporanee dei dati TCGdex (si riscaricano da sole): all = tutte, altrimenti solo quelle inutili o vecchie */
function tcgPurge(all) {
  const del = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('tcg:')) continue;
    if (all || /^tcg:(@en)?\/cards\//.test(k)) { del.push(k); continue; }
    try { if (Date.now() - JSON.parse(localStorage.getItem(k)).t > 30 * 86400e3) del.push(k); } catch (e) { del.push(k); }
  }
  del.forEach(k => localStorage.removeItem(k));
  return del.length;
}
/** salvataggio di dati che il gestionale aggiorna da solo (prezzi di mercato, sigle): per GitHub non sono "modifiche tue" */
function softSave() { ghSoft = true; try { save(); } finally { ghSoft = false; } }
let saveFailed = false;
let lsOff = false, lsOk = true, dbFail = false, dbTold = false, dbConn = null, dbBusy = false, dbNext = null;
function save() {
  const js = JSON.stringify(state); undoRecord(js);
  const at = new Date().toISOString();
  // 1) copia nel vecchio spazio (5 MB), finché ci sta
  lsOk = false;
  if (!lsOff || dbFail) {
    try { localStorage.setItem(KEY, js); localStorage.setItem(SAVED_AT, at); lsOk = true; }
    catch (e) {
      if (DBOK() && !dbFail) {
        // vecchio spazio pieno: tolgo la copia di riserva, i dati restano nell'archivio grande
        lsOff = true; try { localStorage.removeItem(KEY); localStorage.removeItem(SAVED_AT); } catch (x) {}
      } else {
        // niente archivio grande: libero le copie temporanee di TCGdex e riprovo
        tcgPurge(true);
        try { localStorage.setItem(KEY, js); localStorage.setItem(SAVED_AT, at); lsOk = true; } catch (e2) {}
      }
    }
  }
  // 2) archivio grande
  if (DBOK()) dbPut({ at, js });
  else {
    if (js.length > 4e6 && !save.warned) { save.warned = true; setTimeout(() => toast(`Dati salvati: ${(js.length / 1024).toFixed(0)} KB su circa 5.000. Questo browser non ha l'archivio grande: avvisami.`), 500); }
    if (!lsOk) saveFail(); else saveFailed = false;
  }
  bkSchedule(); ghSchedule();
}
/** "Spazio usato": quanto occupano i dati e quanto spazio c'è ancora nell'archivio grande del browser */
async function spaceInfo(size) {
  if (!DBOK() || !navigator.storage?.estimate) return;
  let txt = `${(size / 1024).toFixed(0)} KB`;
  try {
    const e = await navigator.storage.estimate(), free = (e.quota || 0) - (e.usage || 0);
    const gb = free / 1024 ** 3;
    if (free > 0) txt += ` · liberi ancora ${gb >= 1 ? gb.toFixed(0) + ' GB' : (free / 1024 ** 2).toFixed(0) + ' MB'}`;
  } catch (e) {}
  try { if (navigator.storage.persisted && !(await navigator.storage.persisted())) txt += ' · ⚠ non protetti: Chrome potrebbe cancellarli solo se il disco si riempie (i backup restano)'; } catch (e) {}
  if (lsOff) txt += ' · la copia di riserva da 5 MB non ci sta più (restano i backup)';
  if ($('stSpace')) $('stSpace').textContent = txt;
}
function saveFail() {
  if (!saveFailed) alert('Il browser non riesce più a salvare i dati.\n\nScarica subito un backup: Impostazioni → Backup nel PC → "Scarica un backup".');
  saveFailed = true;
}
function dbOpen() {
  if (dbConn) return Promise.resolve(dbConn);
  return new Promise((res, rej) => {
    const r = indexedDB.open('gestionaleDati', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('d');
    r.onsuccess = () => { dbConn = r.result; dbConn.onversionchange = () => { dbConn.close(); dbConn = null; }; dbConn.onclose = () => { dbConn = null; }; res(dbConn); };
    r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('archivio bloccato'));
  });
}
async function dbGet() {
  const db = await dbOpen();
  return new Promise((res, rej) => { const g = db.transaction('d', 'readonly').objectStore('d').get('state'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); });
}
/** scrive nell'archivio grande; se arrivano altri salvataggi mentre scrive, tiene solo l'ultimo */
function dbPut(v) {
  dbNext = v;
  if (dbBusy) return;
  dbBusy = true;
  (async () => {
    while (dbNext) {
      const x = dbNext; dbNext = null;
      try {
        const db = await dbOpen();
        await new Promise((res, rej) => {
          const t = db.transaction('d', 'readwrite');
          t.objectStore('d').put(x, 'state');
          t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('scrittura annullata'));
        });
        dbFail = false; if (lsOk || lsOff) saveFailed = false;
      } catch (e) {
        dbConn = null; dbFail = true;
        if (!lsOk) saveFail();                       // nemmeno la copia di riserva: avviso
        else if (!dbTold) { dbTold = true; toast('Archivio grande non disponibile: i dati sono salvati solo nello spazio da 5 MB.'); }
      }
    }
    dbBusy = false;
  })();
}
const lkey = (p, rev, lang) => `${p}|${rev ? 'R' : 'N'}|${lang || 'it'}`;
// ---------- varianti speciali (dati di TCGdex, "variants_detailed") ----------
// Una variante è "speciale" quando su Cardmarket è un prodotto a parte (Reverse Poké Ball / Energia / Love Ball…,
// Master Ball, Cosmo, timbrate…): la Reverse semplice è invece lo stesso prodotto della carta normale.
// Standby e vendita: vp = idProduct Cardmarket della variante, vl = nome (da TCGdex, in italiano), vb = sigla breve.
const vcOf = x => x && x.vp ? 'X' + x.vp : x && x.rev ? 'R' : 'N';
const vLab = x => x && x.vp ? (x.vl || 'Variante speciale') : x && x.rev ? 'Reverse Holo' : 'Normale';
const vHtml = x => x && x.vp ? `<span class="vxl" title="Variante speciale: su Cardmarket è un prodotto a parte">${esc(x.vl || 'Speciale')}</span>` : x && x.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale';
const vTag = x => x && x.vp ? ' ' + (x.vl || 'speciale') : x && x.rev ? ' R' : '';
const VKEY = id => 'tcgVar:' + id;
const SUPRX = /:\s*(supplementi|additionals?)\s*$/i;
const isSupName = n => SUPRX.test(String(n || ''));
const slugOf = u => { const t = String(u || '').split(/[?#]/)[0].replace(/\/+$/, ''); return t.slice(t.lastIndexOf('/') + 1); };
/** indirizzo (slug) del prodotto di una carta speciale in vendita, dall'elenco della pagina bulk mandato dallo script */
// indirizzo del prodotto: per le speciali, e per le carte che nella pagina del set hanno più versioni con lo stesso numero (…-V1-…, …-V2-…)
const slOfL = l => { if (!l) return undefined; const sl = slugOf(state.cm[l.exp]?.cards?.[l.p]?.ur); return sl && (l.vp || /-V\d+-/.test(sl)) ? sl : undefined; };
/** slug → numero prodotto, per le offerte lette dallo script (Supplementi: V1 e V2 hanno lo stesso numero di carta) */
function pidBySlug() {
  const m = {};
  Object.values(state.cm).forEach(E => Object.values(E.cards || {}).forEach(c => { if (c.ur && (isSupName(E.name) || /-V\d+-/.test(c.ur))) m[slugOf(c.ur)] = String(c.p); }));
  return m;
}
/** nome e sigla di una variante speciale (dalle varianti TCGdex della carta) */
function vxInfoOf(setId, u, p) {
  const S = tcgCached('/sets/' + encodeURIComponent(setId)) || tcgCached('@en/sets/' + encodeURIComponent(setId));
  const c = (S?.cards || []).find(x => norm(x.localId) === norm(u));
  const v = c && (varCache(c.id)?.x || []).find(o => o.p === String(p));
  return v ? { vl: v.l, vb: v.b } : null;
}
/** varianti di una carta già lette da TCGdex: { base, rev (esiste la Reverse semplice), det (TCGdex ha l'elenco), x: [{p, l, b}] } */
function varCache(cardId) { if (!cardId) return null; try { return JSON.parse(localStorage.getItem(VKEY(cardId))); } catch (e) { return null; } }
const unacc = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// nomi dei timbri e degli effetti che TCGdex non traduce in italiano
const STAMP_IT = { 'snowflake': 'Fiocco di neve', 'player-rewards-program': 'Play! Pokémon', 'trick-or-trade': 'Trick or Trade', 'regional-championships': 'Campionati Regionali',
  'national-championships': 'Campionati Nazionali', 'state-championships': 'Campionati Statali', 'city-championships': 'Campionati Cittadini', '30th-pokeday': 'Pokémon Day 30°',
  'pokemon-day': 'Pokémon Day', '30th-anniversary': '30° anniversario', '25th-celebration': '25° anniversario', 'asia-promo': 'Promo Asia', 'fossil-museum': 'Museo dei fossili',
  'set-logo': 'logo del set', 'logo set': 'logo del set', 'pre-release': 'Pre-release', 'pokemon-center': 'Pokémon Center', 'staff': 'Staff', 'gamestop': 'GameStop', 'eb-games': 'EB Games', 'winner': 'Vincitore',
  'professor-program': 'Programma Professore', 'gym-challenge': 'Sfida Palestra', 'game-on': 'Pokémon Game On!', 'ace-trainer': 'Ace Trainer', '1st-edition': '1a Edizione' };
const FOIL_IT = { 'cracked-ice': 'Cracked Ice', 'tinsel': 'Tinsel', 'league': 'Lega', 'mirror': 'Mirror', 'player-reward': 'Play! Pokémon', 'lenticular': 'Lenticolare',
  'cosmos': 'Cosmo', 'galaxy': 'Galassia', 'gold': 'Oro', 'rainbow': 'Rainbow', 'starlight': 'Luce Stellare', 'glitter': 'Luccichio', 'metal': 'Metallo', 'energy': 'Energia',
  'pokeball': 'Poké Ball', 'masterball': 'Master Ball', 'loveball': 'Love Ball', 'duskball': 'Scuro Ball', 'friendball': 'Friend Ball', 'quickball': 'Velox Ball', 'team-rocket': 'Team Rocket' };
const capW = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const itName = (t, M) => { const k = String(t || '').trim().toLowerCase(); return M[k] || (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(k) ? k.split('-').map(capW).join(' ') : capW(String(t || '').trim())); };
const vtype = v => { const t = unacc(v && v.type).toLowerCase(); return /^rev/.test(t) ? 'reverse' : /^(holo|olograf)/.test(t) ? 'holo' : /^normal/.test(t) ? 'normal' : t; };
const vstamps = v => (Array.isArray(v.stamp) ? v.stamp : v.stamp ? [v.stamp] : []).map(s => typeof s === 'string' ? s : s && (s.name || s.id)).filter(Boolean);
const vjumbo = v => /jumbo/i.test(String(v && v.size || ''));
/** nome della variante come su Cardmarket: "Reverse Poké Ball", "Cosmo Holo", "Non Holo", "Holo Jumbo", "Holo · timbro Logo set"
 *  bt = tipo della carta base (holo / normal): una "normale" con prodotto a parte di una carta holo è la Non Holo */
function varLabel(v, bt) {
  const t = vtype(v), foil = v.foil ? itName(v.foil, FOIL_IT) : '';
  let l;
  if (t === 'reverse') l = 'Reverse' + (foil ? ' ' + foil : '');
  else if (t === 'holo') l = foil ? foil + ' Holo' : 'Holo';
  else if (t === 'normal') l = foil ? foil : bt && bt !== 'normal' ? 'Non Holo' : 'Normale';
  else l = [itName(v.type, FOIL_IT), foil].filter(Boolean).join(' ');
  if (vjumbo(v)) l += ' Jumbo';
  const st = vstamps(v).map(x => itName(x, STAMP_IT));
  return l + (st.length ? ' · timbro ' + st.join(', ') : '');
}
function varBadge(v, bt) {
  const t = vtype(v);
  if (vjumbo(v)) return 'JB';
  const w = unacc(v.foil ? itName(v.foil, FOIL_IT) : '').split(/[\s-]+/).filter(Boolean);
  if (w.length > 1) return w.map(x => x[0]).join('').toUpperCase().slice(0, 3);
  if (w.length) return w[0].slice(0, 2).toUpperCase();
  if (vstamps(v).length) return 'TIM';
  if (t === 'normal') return bt && bt !== 'normal' ? 'NH' : 'NO';
  if (t === 'holo') return 'HO';
  return unacc(v.type).slice(0, 2).toUpperCase() || 'SP';
}
const VAR_VER = 3;   // cambia quando cambiano i nomi delle varianti: le varianti salvate si rileggono
let varSaveT = null;
function varStore(cardId, d) {
  const det = Array.isArray(d && d.variants_detailed) ? d.variants_detailed : [];
  const cmId = v => v && v.thirdParty && v.thirdParty.cardmarket ? String(v.thirdParty.cardmarket) : '';
  const plain = v => !v.foil && !vstamps(v).length && !vjumbo(v);
  const isRev = v => vtype(v) === 'reverse';
  const baseV = det.find(v => plain(v) && !isRev(v) && cmId(v));
  const base = String((d && d.pricing && d.pricing.cardmarket && d.pricing.cardmarket.idProduct) || cmId(baseV) || '');
  const bt = vtype(det.find(v => plain(v) && !isRev(v) && cmId(v) === base) || baseV || {});
  const o = { at: Date.now(), vv: VAR_VER, base, rev: !det.length || det.some(v => isRev(v) && plain(v)), det: det.length > 0, x: [] };
  const seen = new Set();
  det.forEach(v => { const p = cmId(v); if (!p || p === base || seen.has(p)) return; seen.add(p); o.x.push({ p, l: varLabel(v, bt), b: varBadge(v, bt) }); });
  try { localStorage.setItem(VKEY(cardId), JSON.stringify(o)); } catch (e) {}
  return varSync(o);
}
/** copie già salvate con il nome vecchio della variante: aggiorno nome e sigla */
function varSync(o) {
  if (o && o.vv === VAR_VER && typeof state === 'object' && state) {
    const by = new Map(o.x.map(x => [x.p, x]));
    let ch = false;
    [state.standby || {}, state.listings || {}].forEach(M => Object.values(M).forEach(x => { const X = x && x.vp && by.get(String(x.vp)); if (X && (x.vl !== X.l || x.vb !== X.b)) { x.vl = X.l; x.vb = X.b; ch = true; } }));
    (state.sold || []).forEach(x => { const X = x && x.vp && by.get(String(x.vp)); if (X && x.vl !== X.l) { x.vl = X.l; ch = true; } });
    if (ch) { clearTimeout(varSaveT); varSaveT = setTimeout(() => save(), 800); }
  }
  return o;
}
/** varianti di una carta: dalla cache, altrimenti dal dettaglio TCGdex (italiano, poi inglese) */
async function cardVariants(cardId, fresh) {
  const c = varCache(cardId);
  if (c && !fresh && c.vv === VAR_VER && Date.now() - c.at < 14 * 86400e3) return varSync(c);
  for (const base of [API, API_EN]) {
    const d = await tcgJson(base + '/cards/' + encodeURIComponent(cardId));
    if (d) return varStore(cardId, d);
  }
  return c;
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 4000); }

// ---------- TCGdex: set e carte in italiano (con cache nel browser) ----------
const mem = {};
async function tcg(path, maxAgeH, noStore) {
  if (mem[path]) return mem[path];
  const ck = 'tcg:' + path;
  if (noStore) {
    try { const r = await fetch(path.startsWith('@en') ? API_EN + path.slice(3) : API + path); if (!r.ok) return null; return (mem[path] = await r.json()); } catch (e) { return null; }
  }
  try {
    const c = JSON.parse(localStorage.getItem(ck));
    if (c && Date.now() - c.t < (maxAgeH || 24) * 3600e3) return (mem[path] = c.d);
  } catch (e) {}
  try {
    const r = await fetch(path.startsWith('@en') ? API_EN + path.slice(3) : API + path);
    if (!r.ok) throw 0;
    const d = await r.json();
    mem[path] = d;
    try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
    return d;
  } catch (e) {
    try { const c = JSON.parse(localStorage.getItem(ck)); if (c) return (mem[path] = c.d); } catch (e2) {}
    return null;
  }
}
let tcgSets = [];          // elenco set TCGdex, dal più recente
// TCGdex in italiano a volte non ha nome, simbolo o logo di un set: li completo con i dati inglesi
const API_EN = 'https://api.tcgdex.net/v2/en';
let enSets = {};
async function loadSets() {
  const [list, en] = await Promise.all([tcg('/sets', 12), tcg('@en/sets', 12)]);
  enSets = {};
  (Array.isArray(en) ? en : []).forEach(x => { enSets[x.id] = x; });
  tcgSets = (Array.isArray(list) ? list.slice().reverse() : []).map(x => {
    const e = enSets[x.id] || {};
    const serie = String(x.id).replace(/[0-9.]+[a-z]?$/i, '') || x.id;
    return Object.assign({}, x, {
      name: x.name || e.name || x.id,
      symbol: x.symbol || e.symbol || `https://assets.tcgdex.net/univ/${serie}/${x.id}/symbol`,
      logo: x.logo || e.logo || ''
    });
  });
}
// ---------- sigla del set (es. DLR, ASC): scritta a mano > elenco di Cardmarket > TCGdex ----------
function tcgCached(path) {
  if (mem[path]) return mem[path];
  try { const c = JSON.parse(localStorage.getItem('tcg:' + path)); return c ? c.d : null; } catch (e) { return null; }
}
function siglaOf(setId, setName) {
  if (setId && state.codes?.[setId]) return state.codes[setId];
  const name = setName || tcgSets.find(x => x.id === setId)?.name || '';
  const E = name && cmCatalogFor(name);
  const c = E && Object.values(E.cards || {}).find(x => x.c)?.c;
  if (c) return c.toUpperCase();
  if (!setId || String(setId).startsWith('cm:')) return '';
  for (const p of ['/sets/' + setId, '@en/sets/' + setId]) {
    const S = tcgCached(p), a = S && (S.abbreviation || S.abbreviations);
    const v = (a && (typeof a === 'string' ? a : a.official || a.normal)) || (S && S.tcgOnline);
    if (v) return String(v).toUpperCase();
  }
  return '';
}
const cardCode = (setId, setName, u) => { const sg = siglaOf(setId, setName); const n = /^\d+$/.test(u || '') ? String(parseInt(u, 10)).padStart(3, '0') : (u || ''); return sg + n; };
/** scarica in sottofondo i dettagli dei miei set, per avere la sigla nella lista a sinistra */
async function loadMyCodes() {
  const ids = new Set([...Object.keys(listingsBySet()), ...Object.values(state.standby || {}).map(x => x.s)].filter(id => id && !String(id).startsWith('cm:')));
  let changed = false;
  for (const id of ids) {
    if (siglaOf(id)) continue;
    await tcg('/sets/' + encodeURIComponent(id), 24 * 7);
    await tcg('@en/sets/' + encodeURIComponent(id), 24 * 7); // in inglese a volte c'è quando in italiano manca
    if (siglaOf(id)) changed = true;
  }
  return changed;
}

/** set TCGdex corrispondente a un'espansione di Cardmarket (stesso nome italiano) */
function tcgIdFor(expName) {
  const n = simp(String(expName || '').replace(SUPRX, ''));
  if (!n) return null;
  const s = tcgSets.find(x => simp(x.name) === n) || tcgSets.find(x => simp(x.name).includes(n) || n.includes(simp(x.name)));
  return s ? s.id : null;
}
// rarità per carta (TCGdex le dà solo nel dettaglio della carta): le scarico in sottofondo e le tengo in cache
const RKEY = id => 'tcgRar:' + id;
function rarCache(setId) { try { return JSON.parse(localStorage.getItem(RKEY(setId))) || {}; } catch (e) { return {}; } }
let rarJob = null;
async function loadRarities(setId, cards) {
  const cache = rarCache(setId), tcache = typCache(setId);
  const todo = cards.filter(c => !(norm(c.localId) in cache) || !(norm(c.localId) in tcache));
  if (!todo.length) return;
  const job = rarJob = {};
  let i = 0;
  const worker = async () => {
    while (i < todo.length && rarJob === job) {
      const c = todo[i++];
      const d = await tcg('/cards/' + encodeURIComponent(c.id), 0, true);
      if (!d) continue;                                  // senza internet: riprovo la prossima volta
      cache[norm(c.localId)] = rarIt(d.rarity || '');
      tcache[norm(c.localId)] = typStr(d);
      varStore(c.id, d);
      const el = document.querySelector(`.card[data-n="${CSS.escape(norm(c.localId))}"] .rar`);
      if (el) el.textContent = cache[norm(c.localId)];
    }
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  if (rarJob === job) { cfRarOptions(); if (cf.rar) applyCardFilter(); }
  try { localStorage.setItem(RKEY(setId), JSON.stringify(cache)); } catch (e) {}
  try { localStorage.setItem(TKEY(setId), JSON.stringify(tcache)); } catch (e) {}
}
// tipo, categoria e fase della carta (per la ricerca): es. "Fuoco Pokémon Fase 1", "Allenatore Strumento"
const TKEY = id => 'tcgTyp:' + id;
function typCache(setId) { try { return JSON.parse(localStorage.getItem(TKEY(setId))) || {}; } catch (e) { return {}; } }
const typStr = d => [...(d.types || []), d.category, d.stage, d.trainerType, d.energyType, d.suffix].filter(Boolean).join(' ');

// ---------- arrivo dati dallo script di Cardmarket ----------
function mergeCatalog(exp) {
  if (!exp || !exp.id) return;
  const E = state.cm[exp.id] || (state.cm[exp.id] = { id: exp.id, name: exp.name || '', cards: {} });
  if (exp.name) E.name = exp.name;
  (exp.cards || []).forEach(c => { E.cards[c.p] = Object.assign(E.cards[c.p] || {}, c); });
  // prezzo attuale su Cardmarket per le carte in vendita senza prezzo
  Object.values(state.listings).forEach(l => { if (l.exp === exp.id && l.price == null && E.cards[l.p]?.m != null) l.price = E.cards[l.p].m; });
}
function importFromHash() {
  const m = location.hash.match(/^#cm2=(.+)$/);
  if (!m) return null;
  csPendingDone();   // il risultato è arrivato: l'elenco non va più consegnato allo script
  history.replaceState(null, '', location.pathname);
  let d;
  try { d = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { alert('Dati da Cardmarket non leggibili.'); return null; }
  mergeCatalog(d.exp);
  let n = 0, last = d.exp, fromSb = 0;
  const addedTxt = [], newly = [];
  for (const sub of d.listed || []) {
    mergeCatalog({ id: sub.exp, name: sub.name, cards: sub.cards });
    last = { id: sub.exp, name: sub.name };
    const sid0 = tcgIdFor(sub.name);
    for (const r of sub.rows) {
      // variante speciale (pagina dei Supplementi): prodotto a parte; la casella Reverse fissa di Cardmarket non conta
      const sbXk = Object.keys(state.standby || {}).find(k => { const x = state.standby[k]; return x.vp && x.vp === String(r.p) && (x.lang || 'it') === (r.lang || 'it'); })
        || Object.keys(state.standby || {}).find(k => state.standby[k].vp && state.standby[k].vp === String(r.p));
      const sbX = sbXk && state.standby[sbXk];
      const vx = r.x || r.v === 'S' || sbX || isSupName(sub.name);
      const VI = vx ? (r.vl ? { vl: r.vl, vb: r.vb } : sbX ? { vl: sbX.vl, vb: sbX.vb } : vxInfoOf(sid0, r.u, r.p) || { vl: 'Variante speciale', vb: 'SP' }) : null;
      const rv = vx ? false : !!r.rev;
      const k = lkey(r.p, rv, r.lang);
      const c = state.cm[sub.exp]?.cards?.[r.p] || {};
      const L = state.listings[k] || (state.listings[k] = Object.assign({ p: r.p, exp: sub.exp, expName: sub.name, u: r.u || c.u || '', rev: rv, lang: r.lang, q: 0, price: null, date: sub.at, com: '' }, vx ? { vp: String(r.p), vl: VI.vl, vb: VI.vb } : {}));
      // copie aggiunte a una carta già in vendita allo stesso prezzo: la regola e il riferimento restano quelli di prima
      const keep = L.q > 0 && L.price != null && r.price != null && r2(r.price) === r2(L.price);
      L.q += r.q;
      if (r.price != null) L.price = r.price;
      L.date = sub.at; L.com = r.com || L.com; L.expName = sub.name || L.expName;
      if (!L.u) L.u = r.u || c.u || '';
      // variante rara: set e numero della carta (anche se Cardmarket la tiene in un'altra Edizione, es. promo o Jumbo)
      if (vx && sbX && sbX.s) { L.vs = sbX.s; L.u = sbX.u || L.u; }
      // regola del prezzo scelta nello script e valore di mercato al caricamento: da qui parte il controllo giornaliero
      if (!keep) {
        if (r.b) { L.rb = r.b; L.ro = r.o || 0; }
        if (r.ref != null) { L.ref = r2(r.ref); L.refAt = sub.at; }
        else if (r.price != null) { L.ref = null; } // prezzo senza regola: il riferimento arriva col primo aggiornamento
        if (r.price != null) L.pAt = sub.at;
      }
      n += r.q;
      newly.push({ k, q: r.q, price: r.price != null ? r.price : L.price });
      addedTxt.push(`${L.u || r.u}${vTag(L)} ×${r.q}${r.price != null ? ' a ' + eur(r.price) : ''}`);
      // le copie caricate su Cardmarket escono dallo Standby
      // (all'avvio l'elenco dei set TCGdex può non essere ancora caricato: abbino anche per nome del set)
      const sid = tcgIdFor(sub.name), un = norm(r.u || c.u || '');
      const sk = vx && sbXk && (state.standby[sbXk].lang || 'it') === (r.lang || 'it') ? sbXk : Object.keys(state.standby || {}).find(k => { const x = state.standby[k];
        return (x.s === sid || simp(x.sn) === simp(String(sub.name).replace(SUPRX, ''))) && norm(x.u) === un && vcOf(x) === vcOf(L) && (x.lang || 'it') === (r.lang || 'it'); });
      const X = sk && state.standby[sk];
      if (X) { const m = Math.min(X.q, r.q); X.q -= m; fromSb += m; if (X.q <= 0) { delete state.standby[sk]; delete (state.sbMarket || {})[sk]; } }
    }
  }
  chkAfterListing(newly);
  if (n) logOp('vendita', last?.name, `Messe in vendita su Cardmarket (script Card Scanner)${fromSb ? `, ${fromSb} copie tolte dallo Standby` : ''}: ` + addedTxt.join(', '), n);
  save();
  if (n) setTimeout(() => updatePrices(false), 1500);
  setTimeout(() => toast(n ? `Aggiornato: ${n} carte in vendita su Cardmarket` + (fromSb ? ` (${fromSb} tolte dallo Standby)` : '') : `Dati del set "${last?.name || ''}" aggiornati (immagini e prezzi attuali)`), 300);
  return last ? last.name : null;
}

// ---------- abbinamento carte in vendita ↔ set TCGdex ----------
/** set TCGdex di una carta in vendita: per le varianti rare messe in vendita da un'altra Edizione di Cardmarket vale il set della carta (vs) */
const lSid = l => (l && l.vs) || tcgIdFor(l.expName || state.cm[l.exp]?.name);
function listingsBySet() {
  const m = {};
  for (const [k, l] of Object.entries(state.listings)) {
    const sid = lSid(l) || ('cm:' + l.exp);
    (m[sid] = m[sid] || []).push([k, l]);
  }
  return m;
}
function cmCatalogFor(setName) {
  return Object.values(state.cm).find(e => simp(e.name) === simp(setName));
}

// ---------- lista dei set a sinistra ----------
let selected = null;
function renderSets() {
  const bySet = listingsBySet();
  const cnt0 = id => (bySet[id] || []).reduce((a, [, l]) => a + l.q, 0);
  const sbBy = {}; Object.values(state.standby || {}).forEach(x => { sbBy[x.s] = (sbBy[x.s] || 0) + x.q; });
  const vBy = {}; Object.entries(bySet).forEach(([id, ls]) => { vBy[id] = ls.filter(([k, l]) => varOf(k, l)).length; });
  const cnt = id => cnt0(id) + (sbBy[id] || 0);
  // pallini a sinistra dei tuoi set: verde = Normali, viola = Reverse (pieno = in vendita, vuoto = solo in Standby)
  const kind = {};
  const mark = (id, x, how) => { const o = kind[id] || (kind[id] = {}), k = x.vp ? 'x' : x.rev ? 'r' : 'n'; if (o[k] !== 'v') o[k] = how; };
  Object.entries(bySet).forEach(([id, ls]) => ls.forEach(([, l]) => { if (l.q > 0) mark(id, l, 'v'); }));
  Object.values(state.standby || {}).forEach(x => { if (x.q > 0) mark(x.s, x, 's'); });
  const dot = (o, k) => {
    const what = k === 'n' ? 'Normali' : k === 'r' ? 'Reverse' : 'Varianti speciali';
    return o[k] ? `<i class="dt d${k}${o[k] === 's' ? ' ds' : ''}" title="${what} ${o[k] === 'v' ? 'in vendita' : 'solo in Standby'}"></i>` : '<i class="dt"></i>';
  };
  const dots = id => kind[id] ? `<span class="dts">${dot(kind[id], 'n')}${dot(kind[id], 'r')}${kind[id].x ? dot(kind[id], 'x') : ''}</span>` : '';
  const anyX = Object.values(kind).some(o => o.x);
  const q = simp($('qSet').value), only = $('onlyMine').checked;
  const all = tcgSets.map(s => ({ id: s.id, name: s.name, symbol: s.symbol }));
  // espansioni Cardmarket con carte in vendita ma senza corrispondenza in TCGdex
  Object.keys(bySet).filter(id => id.startsWith('cm:')).forEach(id => all.push({ id, name: state.cm[id.slice(3)]?.name || bySet[id][0][1].expName || id }));
  const items = all.filter(s => (!q || simp(s.name).includes(q)) && (!only || cnt(s.id)));
  const mine = items.filter(s => cnt(s.id)), rest = items.filter(s => !cnt(s.id));
  const link = s => `<a href="#" data-id="${esc(s.id)}" class="${s.id === selected ? 'sel' : ''}">${dots(s.id)}<span class="nm">${esc(s.name)}</span>${vBy[s.id] ? `<span class="n v" title="${vBy[s.id]} carte con variazione di prezzo">⚠ ${vBy[s.id]}</span>` : ''}${sbBy[s.id] ? `<span class="n sb" title="copie in Standby (non ancora su Cardmarket)">SB ${sbBy[s.id]}</span>` : ''}${cnt0(s.id) ? `<span class="n" title="copie in vendita">${cnt0(s.id)}</span>` : ''}</a>`;
  renderTabs();
  $('sets').innerHTML = ((mine.length ? `<div class="grp">I tuoi set (in vendita / Standby)<span class="dleg"><i class="dt dn"></i>Normali <i class="dt dr"></i>Reverse${anyX ? ' <i class="dt dx"></i>Speciali' : ''}</span></div>${mine.map(link).join('')}` : '') +
    (rest.length ? `<div class="grp">${mine.length ? 'Tutti gli altri set' : 'Tutti i set'} · dal più recente (${rest.length})</div>${rest.map(link).join('')}` : '')) ||
    '<p class="small" style="padding:12px">Nessun set trovato.</p>';
}
$('sets').addEventListener('click', e => {
  const a = e.target.closest('a[data-id]');
  if (!a) return;
  e.preventDefault();
  selected = a.dataset.id; lastSet = selected;
  renderSets(); renderSet();
  $('main').scrollTop = 0;
});
$('qSet').addEventListener('input', renderSets);
$('onlyMine').addEventListener('change', renderSets);

// ---------- immagini: TCGdex → TCGdex inglese → Cardmarket → Limitless TCG ----------
function imgSrcs(tcgImage, cmCard, num) {
  const u3 = /^\d+$/.test(num || '') ? String(parseInt(num, 10)).padStart(3, '0') : num;
  return [...new Set([
    tcgImage ? tcgImage + '/low.webp' : '',
    tcgImage ? tcgImage.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//, '$1en/') + '/low.webp' : '',
    cmCard?.i || '',
    cmCard?.c && u3 ? `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${cmCard.c}/${cmCard.c}_${u3}_R_EN_LG.png` : ''
  ].filter(Boolean))];
}
function imgTag(srcs, lazy) {
  if (!srcs.length) return '';
  return `<img ${lazy ? 'loading="lazy"' : ''} referrerpolicy="no-referrer" src="${esc(srcs[0])}" data-srcs="${esc(srcs.slice(1).join('|'))}" alt="">`;
}
/** pagina della carta su Cardmarket con i filtri già messi: lingua della carta e Normale / Reverse Holo.
 *  Il link viene dalla pagina "Inserisci carte bulk" (campo ur dell'elenco del set); se manca cerco per nome. */
const CM_LANG = { en: 1, fr: 2, de: 3, es: 4, it: 5, pt: 8 };
function cmCardUrl(cm, name, rev, lang) {
  let u;
  try {
    u = cm && cm.ur ? new URL(cm.ur, 'https://www.cardmarket.com') : null;
    if (u && u.origin !== 'https://www.cardmarket.com') u = null;
  } catch (e) { u = null; }
  if (!u) { u = new URL('https://www.cardmarket.com/it/Pokemon/Products/Search'); u.searchParams.set('searchString', (cm && cm.n) || name || ''); return u.href; }
  u.searchParams.set('language', String(CM_LANG[lang || 'it'] || 5));
  u.searchParams.set('isReverseHolo', rev ? 'Y' : 'N');
  return u.href;
}
/** pagina Cardmarket di una variante speciale. TCGdex dà solo il numero prodotto, non l'indirizzo:
 *  1) indirizzo vero se lo conosco (elenco della pagina bulk dei Supplementi mandato dallo script);
 *  2) ricostruito dalla carta normale: …/Ascended-Heroes/Erikas-Oddish-ASC001 → …/Ascended-Heroes-Additionals/Erikas-Oddish-V2-xASC001
 *     (V1, V2… in ordine di numero prodotto, come fa Cardmarket; senza V se la variante è una sola);
 *  3) altrimenti la ricerca per nome. */
function vxCmUrl(cm, x, cardId, name, lang) {
  const withLang = u => { u.searchParams.set('language', String(CM_LANG[lang || 'it'] || 5)); return u.href; };
  const E = Object.values(state.cm).find(e => e.cards?.[x.vp]?.ur);
  try { if (E) { const u = new URL(E.cards[x.vp].ur, 'https://www.cardmarket.com'); if (u.origin === 'https://www.cardmarket.com') return withLang(u); } } catch (e) {}
  try {
    const u = cm && cm.ur ? new URL(cm.ur, 'https://www.cardmarket.com') : null;
    const seg = u ? u.pathname.split('/').filter(Boolean) : [];
    const m = seg.length >= 2 && seg[seg.length - 1].match(/^(.*?)(?:-V\d+)?-([A-Za-z]*\d+[a-z]?)$/);
    const V = varCache(cardId), sib = (V?.x || []).map(v => v.p).sort((a, b) => a - b), i = sib.indexOf(String(x.vp));
    // solo le Reverse Ball/Energia/Team Rocket stanno (quasi) sempre nei Supplementi; Cosmo, Non Holo, timbrate, Jumbo spesso nella pagina del set: lì non indovino
    const lab = String(x.vl || ((V?.x || []).find(v => v.p === String(x.vp)) || {}).l || '');
    const supLike = /^Reverse \S/.test(lab) && !/·/.test(lab);
    if (supLike && u && u.origin === 'https://www.cardmarket.com' && m && i >= 0) {
      const exp = seg[seg.length - 2].replace(/-Additionals$/, '') + '-Additionals';
      seg[seg.length - 2] = exp; seg[seg.length - 1] = `${m[1]}${sib.length > 1 ? '-V' + (i + 1) : ''}-x${m[2]}`;
      return withLang(new URL('/' + seg.join('/'), 'https://www.cardmarket.com'));
    }
  } catch (e) {}
  const u = new URL('https://www.cardmarket.com/it/Pokemon/Products/Search'); u.searchParams.set('searchString', (cm && cm.n) || name || '');
  return u.href;
}
// immagini che non si caricano: provo la fonte successiva (niente onerror nell'HTML: la Content-Security-Policy li blocca)
document.addEventListener('error', e => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement)) return;
  if (im.dataset.logo) {
    if (!im.dataset.e) { im.dataset.e = 1; im.src = im.src.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//, '$1en/'); } else im.remove();
  } else if ('srcs' in im.dataset) nextImg(im);
}, true);
function nextImg(im) {
  const rest = (im.dataset.srcs || '').split('|').filter(Boolean);
  if (!rest.length) { im.remove(); return; }
  im.dataset.srcs = rest.slice(1).join('|');
  im.src = rest[0];
}

// ---------- set aperto: tutte le carte, fuoriserie comprese ----------
let filter = 'all', filterText = '', current = null;
// filtri in più della griglia: rarità, prezzo da/a, copie minime, ordinamento
const cf = { rar: '', pmin: '', pmax: '', q: '', sort: 'num' };
const cfOn = () => !!(cf.rar || cf.pmin !== '' || cf.pmax !== '' || cf.q || cf.sort !== 'num');
let cfOpen = false, varOpen = false;   // riga dei filtri aperta, riquadro dei prezzi cambiati aperto
// selezione di più carte nel set (per togliere dalla vendita, riportare in Standby…)
let selMode = false, selSet = null;
const sel = new Set();
async function renderSet() {
  const main = $('main');
  current = null;
  if (selected === '__dash') { renderDash(); return; }
  if (selected === '__sales') { renderSales(); return; }
  if (selected === '__log') { renderLog(); return; }
  if (selected === '__set') { renderSettings(); return; }
  if (selected === '__out') { renderOut(); return; }
  if (selected === '__chk') { renderChk(); return; }
  if (selected) lastSet = selected;
  if (!selected) {
    main.innerHTML = `<div class="empty">Scegli un set dalla lista a sinistra.<br>
      Le carte in vendita arrivano da Cardmarket con il pulsante <b>Card Scanner → CM</b>: dopo "Mettere in vendita le carte" premi il pulsante verde dello script.</div>`;
    return;
  }
  if (selSet !== selected) { selSet = selected; selMode = false; sel.clear(); }
  const bySet = listingsBySet();
  const mine = bySet[selected] || [];
  const sbList = Object.entries(state.standby || {}).filter(([, x]) => x.s === selected);
  let cards, setName, logo = '', official = 0, setId = null;
  if (selected.startsWith('cm:')) {
    // set non presente in TCGdex: uso l'elenco di Cardmarket
    const E = state.cm[selected.slice(3)];
    setName = E?.name || mine[0]?.[1].expName || '';
    cards = Object.values(E?.cards || {}).map(c => ({ localId: c.u, name: c.n, image: '', rarity: rarIt(c.r) }));
  } else {
    const mySel = selected;
    if (!mem['/sets/' + encodeURIComponent(selected)]) main.innerHTML = '<p class="empty">Carico le carte del set…</p>';
    const S = await tcg('/sets/' + encodeURIComponent(selected), 24);
    if (selected !== mySel) return;
    if (!S) { main.innerHTML = '<p class="empty">Non riesco a caricare il set da TCGdex (serve internet).</p>'; return; }
    setId = S.id; setName = S.name || enSets[S.id]?.name || S.id; logo = S.logo || enSets[S.id]?.logo || ''; official = S.cardCount?.official || 0;
    cards = (S.cards || []).map(c => ({ id: c.id, localId: c.localId, name: c.name, image: c.image || '' }));
  }
  const cmCat = cmCatalogFor(setName);
  const cmByNum = {};
  Object.values(cmCat?.cards || {}).forEach(c => { cmByNum[norm(c.u)] = c; });
  // carte in vendita o in Standby che il set TCGdex non elenca: le aggiungo comunque
  const byNum = {}, sbByNum = {};
  mine.forEach(([k, l]) => (byNum[norm(l.u)] = byNum[norm(l.u)] || []).push([k, l]));
  sbList.forEach(([k, x]) => (sbByNum[norm(x.u)] = sbByNum[norm(x.u)] || []).push([k, x]));
  const known = new Set(cards.map(c => norm(c.localId)));
  [...new Set([...Object.keys(byNum), ...Object.keys(sbByNum)])].forEach(n => {
    if (known.has(n)) return;
    const c = cmByNum[n], l0 = byNum[n]?.[0]?.[1] || sbByNum[n]?.[0]?.[1];
    cards.push({ localId: l0.u, name: c?.n || l0.n || '', image: '', rarity: rarIt(c?.r || l0.r) });
  });
  cards.sort((a, b) => (parseInt(a.localId) || 99999) - (parseInt(b.localId) || 99999) || String(a.localId).localeCompare(String(b.localId)));
  const rc = setId ? rarCache(setId) : {};
  current = { setName, cards, byNum, sbByNum, cmByNum };

  const copies = mine.reduce((a, [, l]) => a + l.q, 0);
  const value = mine.reduce((a, [, l]) => a + (l.price || 0) * l.q, 0);
  const sbQ = sbList.reduce((a, [, x]) => a + x.q, 0);
  const sbEst = b => sbList.reduce((a, [k, x]) => a + (baseOf(sbmOf(k), b) || 0) * x.q, 0);
  const vars = mine.map(([k, l]) => ({ k, l, v: varOf(k, l) })).filter(x => x.v);
  if (filter === 'var' && !vars.length) filter = 'all';
  if (filter === 'sb' && !sbList.length) filter = 'all';
  const extra = official && cards.length > official ? cards.length - official : 0;
  // conteggi per i filtri
  const cntF = { all: cards.length, yes: Object.keys(byNum).length, sb: Object.keys(sbByNum).length,
    var: new Set(vars.map(x => norm(x.l.u))).size, rev: new Set(mine.filter(([, l]) => l.rev && !l.vp).map(([, l]) => norm(l.u))).size,
    vx: new Set([...mine, ...sbList].filter(([, x]) => x.vp).map(([, x]) => norm(x.u))).size };
  // carte segnate Reverse che in questo set non hanno la Reverse semplice (es. i Pokémon di Ascesa Eroica: solo Energia o Ball)
  const vcOfCard = c => c.id ? varCache(c.id) : null;
  const wrong = cards.filter(c => { const n = norm(c.localId), V = vcOfCard(c); return V && V.det && !V.rev && [...(byNum[n] || []), ...(sbByNum[n] || [])].some(([, x]) => x.rev && !x.vp); });
  cntF.wr = wrong.length;
  const needV = cards.filter(c => c.id && !vcOfCard(c) && [...(byNum[norm(c.localId)] || []), ...(sbByNum[norm(c.localId)] || [])].some(([, x]) => x.rev && !x.vp));
  cntF.no = cards.filter(c => !byNum[norm(c.localId)] && !sbByNum[norm(c.localId)]).length;
  if (filter !== 'all' && !cntF[filter]) filter = 'all';
  const chip = (v, l) => `<button class="chip ${filter === v ? 'on' : ''}" data-f="${v}">${l}<i>${cntF[v]}</i></button>`;
  let h = `<div class="sethead"><div class="row" style="gap:16px">${logo ? `<img class="logo" src="${esc(logo)}.png" alt="" data-logo="1">` : ''}
      <div><h2>${esc(setName)}</h2><div class="sub">${cards.length} carte${extra ? `: ${official} + ${extra} fuoriserie` : ''}</div></div></div>
    <div class="row">
      ${copies || sbQ ? `<button class="ghost" id="bSel" title="Scegli più carte da togliere dalla vendita o riportare in Standby">☑ ${selMode ? 'Fine selezione' : 'Seleziona'}</button>
        <button class="ghost" id="bCl" title="PDF da stampare con le carte di questo set: il cliente segna quelle che vuole">📋 Lista per i clienti</button>` : ''}
      ${copies ? `<button id="bEditCM" title="Cambia su Cardmarket i prezzi delle carte di questo set (es. da Tendenza a prezzo minimo)">✏️ Cambia prezzi</button>` : ''}
      ${sbQ ? `<button class="pri" id="bOpenCM" title="Scegli il prezzo e prepara le carte in Standby per lo script Card Scanner">Metti in vendita (${sbQ} in Standby)</button>` : cmCat ? `<a href="${CMBULK}${encodeURIComponent(cmCat.id)}" target="cardscanner" referrerpolicy="no-referrer" class="pribtn" title="Pagina &quot;Inserisci carte bulk&quot; di questo set su Cardmarket">Apri su Cardmarket ↗</a>` : ''}
    </div></div>
    <div class="figs">
      <div class="fig f-ok"><b>${copies}</b><span>copie in vendita · ${Object.keys(byNum).length} carte</span></div>
      <div class="fig"><b>${eur(value) || '0,00 €'}</b><span>valore ai tuoi prezzi</span></div>
      ${sbQ ? `<div class="fig f-sb"><b>${sbQ}</b><span>in Standby · stima ${eur(sbEst('low'))}–${eur(sbEst('trend'))}</span></div>` : ''}
      ${vars.length ? `<button class="fig f-var figbtn" id="bVarBox" title="Mostra o nascondi il riquadro dei prezzi cambiati"><b>${vars.length}</b><span>prezzi di mercato cambiati · <u>${varOpen ? 'nascondi' : 'rivedi'}</u></span></button>` : ''}
    </div>
    ${vars.length && varOpen ? `<div class="notice var"><span><b>${vars.length} ${vars.length === 1 ? 'carta ha' : 'carte hanno'} il prezzo di mercato cambiato</b> rispetto a quando l'hai messa in vendita.</span>
      <span class="row"><button id="bPdf">📄 PDF revisione</button><button id="bConf">✔ Conferma prezzi</button></span></div>` : ''}
    ${wrong.length ? `<div class="notice var"><span><b>⚠ ${wrong.length} ${wrong.length === 1 ? 'carta è segnata' : 'carte sono segnate'} Reverse, ma in questo set ${wrong.length === 1 ? 'non ha' : 'non hanno'} la Reverse semplice.</b>
      Sono varianti speciali (per esempio Reverse Energia o Reverse con la Ball): apri la carta e indica quale.</span><span class="row"><button id="bWr">Mostrale</button></span></div>` : ''}
    ${selMode ? `<div class="selbar"><b id="selN">0 selezionate</b>
      <button id="sAll">Seleziona tutte quelle visibili</button><button id="sNone">Nessuna</button>
      <span style="flex:1"></span>
      <button id="sDel" class="danger">🗑 Togli dalla vendita</button><button id="sToSb">↩ Riporta in Standby</button><button id="sDelSb">🗑 Togli dallo Standby</button>
      <button id="sDone" class="pri">Fine</button></div>` : ''}
    <div class="toolbar"><div class="chips" id="fChips">${chip('all', 'Tutte')}${chip('yes', 'In vendita')}${cntF.sb ? chip('sb', 'Standby') : ''}${cntF.var ? chip('var', 'Variazioni') : ''}${cntF.rev ? chip('rev', 'Reverse') : ''}${cntF.vx ? chip('vx', 'Speciali') : ''}${cntF.wr ? chip('wr', '⚠ Reverse da sistemare') : ''}${chip('no', 'Mancanti')}</div>
      <input type="search" id="qCard" placeholder="Nome o numero…" style="margin-left:auto">
      <button id="cfTog" class="${cfOpen || cfOn() ? 'on' : ''}" title="Rarità, prezzo, copie e ordinamento">⚙ Filtri e ordine ${cfOpen || cfOn() ? '▴' : '▾'}${cfOn() ? ' <i class="cfdot"></i>' : ''}</button></div>
    <div class="toolbar tb2" id="cfBar" ${cfOpen || cfOn() ? '' : 'hidden'}>
      <label>Rarità <select id="cfRar"><option value="">Tutte</option></select></label>
      <label title="Il tuo prezzo; per le carte in Standby il Consigliato">Prezzo <input type="number" id="cfMin" min="0" step="0.01" placeholder="da" value="${esc(cf.pmin)}"> – <input type="number" id="cfMax" min="0" step="0.01" placeholder="a" value="${esc(cf.pmax)}"> €</label>
      <label>Copie <select id="cfQ"><option value="">Tutte</option><option value="1">1 sola</option><option value="2">2 o più</option><option value="4">4 o più</option><option value="10">10 o più</option></select></label>
      <label>Ordina per <select id="cfSort"><option value="num">Numero</option><option value="name">Nome A–Z</option><option value="pd">Prezzo più alto</option><option value="pa">Prezzo più basso</option><option value="val">Valore più alto</option><option value="q">Più copie</option><option value="days">In vendita da più tempo</option></select></label>
      <span class="small" id="cfInfo"></span><button class="lnk" id="cfReset">Azzera filtri</button></div>
    <div class="grid">`;
  for (const c of cards) {
    const n0 = norm(c.localId);
    const ls = byNum[n0] || [], sb = sbByNum[n0] || [];
    const cm = cmByNum[n0];
    const n = ls.filter(([, l]) => !l.rev && !l.vp).reduce((a, [, l]) => a + l.q, 0);
    const r = ls.filter(([, l]) => l.rev && !l.vp).reduce((a, [, l]) => a + l.q, 0);
    const sq = sb.reduce((a, [, x]) => a + x.q, 0);
    const sqN = sb.filter(([, x]) => !x.rev && !x.vp).reduce((a, [, x]) => a + x.q, 0), sqR = sb.filter(([, x]) => x.rev && !x.vp).reduce((a, [, x]) => a + x.q, 0);
    // varianti speciali: sigla e copie (es. "EN ×1")
    const xs = arr => { const m = {}; arr.filter(([, x]) => x.vp).forEach(([, x]) => { const k = x.vb || 'SP'; (m[k] = m[k] || { q: 0, l: [] }).q += x.q; if (!m[k].l.includes(x.vl)) m[k].l.push(x.vl); });
      return Object.entries(m).map(([b, o]) => ` <span class="vxl" title="${esc(o.l.join(', '))}">${esc(b)} ×${o.q}</span>`).join(''); };
    const hasX = [...ls, ...sb].some(([, x]) => x.vp);
    const isWr = wrong.includes(c);
    const vv = ls.map(([k, l]) => varOf(k, l)).filter(Boolean);
    const prices = [...new Set(ls.map(([, l]) => l.price).filter(v => v != null))].sort((a, b) => a - b);
    const sbM = sb.map(([k]) => sbmOf(k)).find(M => M && (M.lo != null || M.t != null));
    const rar = c.rarity ?? rc[n0] ?? rarIt(cm?.r) ?? '';
    const isExtra = official && /^\d+$/.test(c.localId) && +c.localId > official;
    const cls = ls.length ? 'yes' : sq ? 'sb' : 'no';
    const sbM2 = sbM;
    // valori per filtri e ordinamento
    const qAll = ls.reduce((a, [, l]) => a + l.q, 0) + sq;
    const pF = prices.length ? prices[prices.length - 1] : (sb.map(([k, x]) => { const M = sbmOf(k); return M && !(x.rev && !M.rv) ? consOf(M)?.v : null; }).filter(v => v != null).sort((a, b) => b - a)[0] ?? '');
    const valF = ls.reduce((a, [, l]) => a + (l.price || 0) * l.q, 0);
    const d0 = ls.map(([, l]) => l.date).filter(Boolean).sort()[0];
    const band = [];
    if (ls.length) band.push(`<div class="band b-ok"><span class="bl"><span>In vendita</span><span>${n ? '×' + n : ''}${r ? ` <span class="r">R ×${r}</span>` : ''}${xs(ls)}</span></span></div>`);
    if (sq) band.push(`<div class="band b-sb"><span class="bl"><span>Standby</span><span>${sqN ? 'N ×' + sqN : ''}${sqR ? ` <span class="r">R ×${sqR}</span>` : ''}${xs(sb)}</span></span></div>`);
    h += `<div class="card ${cls}${r ? ' r' : ''}${hasX ? ' x' : ''}${isWr ? ' wr' : ''}${sq ? ' hassb' : ''}${vv.length ? ' vr' : ''}${selMode && sel.has(n0) ? ' sel' : ''}" data-n="${esc(n0)}" data-p="${pF}" data-q="${qAll}" data-v="${valF}" data-d="${d0 ? daysAgo(d0) : ''}" data-nm="${esc(c.name)}" data-s="${esc(`${c.name} ${c.localId} ${n0} ${rar} ${cm?.n || ''}`.toLowerCase())}">
      <div class="im"><span>${esc(c.localId)}</span>${imgTag(imgSrcs(c.image, cm, c.localId), true)}</div>
      ${isWr ? `<span class="wtag" title="Segnata Reverse, ma questa carta non ha la Reverse semplice: apri la carta per indicare la variante">⚠ Reverse?</span>` : ''}
      ${vv.length ? `<span class="vtag" title="Prezzo di mercato cambiato">${vv.map(v => (v.d > 0 ? '▲ ' : '▼ ') + eur(Math.abs(v.d))).join(' ')}</span>` : ''}
      ${band.join('')}
      <div class="info"><span class="nr">${esc(c.localId)}${official ? '/' + official : ''}${isExtra ? '<span class="fs">FS</span>' : ''}${rar ? ' · ' : ''}<span class="rar">${esc(rar)}</span></span>
      <b title="${esc(c.name)}">${esc(c.name)}</b>
      ${prices.length ? `<span class="pr"><span class="price">${prices.map(eur).join(' / ')}</span></span>` : ''}
      ${!ls.length && sbM2 ? `<span class="est">Stima: Da ${eur(sbM2.lo) || '—'} · Tendenza ${eur(sbM2.t) || '—'}</span>` : ''}</div></div>`;
  }
  main.innerHTML = h + '</div>';
  $('qCard').value = filterText;
  $('qCard').oninput = () => { filterText = $('qCard').value; applyCardFilter(); };
  $('cfQ').value = cf.q; $('cfSort').value = cf.sort; cfRarOptions();
  $('cfRar').onfocus = cfRarOptions; $('cfRar').onmousedown = cfRarOptions;
  const cfUpd = () => { cf.rar = $('cfRar').value; cf.pmin = $('cfMin').value; cf.pmax = $('cfMax').value; cf.q = $('cfQ').value; const so = cf.sort !== $('cfSort').value; cf.sort = $('cfSort').value; if (so) cfSort(); applyCardFilter(); };
  ['cfRar', 'cfQ', 'cfSort'].forEach(id => $(id).onchange = cfUpd);
  ['cfMin', 'cfMax'].forEach(id => $(id).oninput = cfUpd);
  $('cfReset').onclick = () => { Object.assign(cf, { rar: '', pmin: '', pmax: '', q: '', sort: 'num' }); filter = 'all'; filterText = ''; renderSet(); };
  cfSort();
  $('fChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f; $('fChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); applyCardFilter(); };
  if ($('bVarBox')) $('bVarBox').onclick = () => { varOpen = !varOpen; renderSet(); };
  // con un filtro attivo la riga resta aperta (per toglierlo c'è "Azzera filtri")
  $('cfTog').onclick = () => { if (cfOn()) { $('cfBar').querySelector('select')?.focus(); return; } cfOpen = !cfOpen; renderSet(); };
  if ($('bPdf')) $('bPdf').onclick = () => pdfVariations(vars, setName);
  if ($('bOpenCM')) $('bOpenCM').onclick = () => openOnCardmarket(selected, setName, cmCat);
  if ($('bConf')) $('bConf').onclick = () => varDialog(vars, `Conferma prezzi · ${setName}`);
  if ($('bEditCM')) $('bEditCM').onclick = () => openPriceEdit(mine[0]?.[1].expName || state.cm[mine[0]?.[1].exp]?.name || '');
  if ($('bSel')) $('bSel').onclick = () => { selMode = !selMode; sel.clear(); renderSet(); };
  if ($('bCl')) $('bCl').onclick = () => pdfClients();
  if (selMode) {
    const upd = () => { $('selN').textContent = `${sel.size} carte selezionate`; document.querySelectorAll('.card').forEach(el => el.classList.toggle('sel', sel.has(el.dataset.n))); };
    $('sAll').onclick = () => { document.querySelectorAll('.card:not(.hide)').forEach(el => { if (!el.classList.contains('no')) sel.add(el.dataset.n); }); upd(); };
    $('sNone').onclick = () => { sel.clear(); upd(); };
    $('sDone').onclick = () => { selMode = false; sel.clear(); renderSet(); };
    $('sDel').onclick = () => bulkAction('del', setId || selected, setName);
    $('sToSb').onclick = () => bulkAction('toSb', setId || selected, setName);
    $('sDelSb').onclick = () => bulkAction('delSb', setId || selected, setName);
    upd();
  }
  if ($('bWr')) $('bWr').onclick = () => { filter = 'wr'; $('fChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.f === 'wr')); applyCardFilter(); };
  applyCardFilter();
  if (setId) loadRarities(setId, cards.filter(c => c.id));
  // varianti delle carte segnate Reverse non ancora lette: le leggo e, se serve, ridisegno con l'avviso
  if (needV.length) {
    const mySel = selected;
    (async () => {
      let bad = 0;
      for (const c of needV.slice(0, 120)) { const V = await cardVariants(c.id); if (V && V.det && !V.rev) bad++; if (selected !== mySel) return; }
      if (bad && selected === mySel && !document.querySelector('dialog[open]')) renderSet();
    })();
  }
}
// ---------- schede in alto e impostazioni ----------
let lastSet = null;   // ultimo set aperto nella scheda "Carte"
const TABS = [['cards', 'Carte'], ['__out', 'Fuori mercato'], ['__chk', 'Controllo'], ['__dash', 'Statistiche'], ['__sales', 'Vendite']];
// colore di ogni segnalibro (continua sul bordo della pagina sotto)
const TABC = { cards: '#1d3d7a', __out: '#d9620f', __chk: '#c8372d', __dash: '#7c4dcc', __sales: '#1f8f55', __log: '#6e7c93', __set: '#1d3d7a' };
function renderTabs() {
  const cur = selected && selected.startsWith('__') ? selected : 'cards';
  const sold = state.sold.reduce((a, x) => a + x.q, 0), nOut = outAll().length;
  // Controllo: numero di differenze dell'ultimo controllo; "!" se è passato più di un giorno (o non l'hai mai fatto) e hai carte in vendita
  const nChk = chkDiffs().length, chkOld = Object.keys(state.listings).length && (!state.chkAt || daysAgo(state.chkAt) >= 1);
  const chkBadge = nChk ? `<i class="o" title="differenze con Cardmarket">${nChk}</i>` : chkOld ? `<i class="w" title="${state.chkAt ? 'Ultimo controllo con Cardmarket: ' + daysAgo(state.chkAt) + ' giorni fa' : 'Controllo con Cardmarket mai fatto'}">!</i>` : '';
  $('tabs').innerHTML = TABS.map(([id, l]) => `<button class="tb ${cur === id ? 'on' : ''}" data-tab="${id}" style="--tc:${TABC[id]}">${l}${id === '__sales' && sold ? `<i>${sold}</i>` : ''}${id === '__chk' ? chkBadge : ''}${id === '__out' && nOut ? `<i class="o" title="carte con il prezzo lontano dal Consigliato">${nOut}</i>` : ''}${id === '__set' && (!bkOk() || (gh && ghState === 'err')) ? '<i class="w" title="Backup non attivo o in errore">!</i>' : ''}</button>`).join('');
  document.querySelector('.wrap').classList.toggle('nosets', cur !== 'cards');
  document.querySelector('.wrap').style.setProperty('--tabc', TABC[cur] || TABC.cards);
}
function goTab(id) {
  // piccolo effetto "pagina che cambia"
  const m = $('main'); m.classList.remove('pgin'); void m.offsetWidth; m.classList.add('pgin');
  if (id === 'cards') selected = lastSet && !lastSet.startsWith('__') ? lastSet : (Object.keys(listingsBySet())[0] || Object.values(state.standby || {})[0]?.s || null);
  else selected = id;
  renderSets(); renderSet();
  $('main').scrollTop = 0;
}
let setSec = 'gh';
// ---------- gestionale installabile come app (Chrome/Edge): manifest.json + sw.js ----------
let pwaPrompt = null;
const pwaStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } };
if (window.__gsPwa) pwaPrompt = window.__gsPwa;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pwaPrompt = e; if (selected === '__set') renderSettings(); });
window.addEventListener('appinstalled', () => { pwaPrompt = null; toast('Gestionale installato: lo trovi sul desktop e nel menu Start ✔'); if (selected === '__set') renderSettings(); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
function renderSettings() {
  const at = localStorage.getItem('gestionaleBackupAt');
  const up = upCfg(), ed = editCfg();
  const ruleSel = (id, c) => `<select id="${id}B"><option value="low" ${c.base === 'low' ? 'selected' : ''}>"Da" (prezzo minimo)</option><option value="trend" ${c.base === 'trend' ? 'selected' : ''}>Tendenza</option><option value="cons" ${c.base === 'cons' ? 'selected' : ''}>Consigliato</option></select>
    <select id="${id}S"><option value="1">+</option><option value="-1" ${(+c.plus || 0) < 0 ? 'selected' : ''}>−</option></select>
    <input type="number" id="${id}P" min="0" step="1" value="${Math.abs(+c.plus || 0)}" style="width:76px"> cent.`;
  const size = new Blob([JSON.stringify(state)]).size;
  const nCards = Object.values(state.cm).reduce((a, e) => a + Object.keys(e.cards || {}).length, 0);
  const bkTxt = { ok: ['Attivo', 'ok'], off: ['Non attivo', 'bad'], paused: ['In pausa', 'bad'], err: ['Errore', 'bad'], nosupport: ['Non disponibile in questo browser', 'mid'] }[bkState] || ['—', 'mid'];
  $('main').innerHTML = `<div class="sethead"><div><h2>Impostazioni</h2><div class="sub">Backup, prezzi, regole predefinite e strumenti.</div></div></div>
  <div class="setx"><nav class="setnav" id="setNav"></nav><div class="setgrid">
    <section class="sc ${bkOk() && !(gh && ghState === 'err') ? '' : 'attn'}">
      <h3>☁️ Backup su GitHub <span class="stp ${gh ? (ghState === 'ok' ? 'ok' : 'bad') : 'mid'}">${gh ? (ghState === 'ok' ? 'Attivo' : 'Errore') : 'Non collegato'}</span></h3>
      ${gh ? `<p class="small">I dati vengono salvati nel tuo repository privato circa un minuto dopo ogni modifica (al massimo ogni 10 minuti) e quando chiudi la pagina. All'apertura, su ogni PC collegato, il gestionale carica da solo l'ultimo salvataggio; ti chiede quale tenere solo se qui ci sono modifiche non ancora salvate. Ogni salvataggio resta nella cronologia di GitHub.</p>
      <dl class="kv"><dt>Repository</dt><dd><a href="https://github.com/${esc(gh.repo)}" target="_blank" rel="noreferrer">${esc(gh.repo)}</a> (privato)</dd>
        <dt>Ultimo salvataggio</dt><dd>${gh.at ? fmtDT(gh.at) : 'non ancora'}${ghDirty ? ' · modifiche in attesa' : ''}</dd>${ghState === 'err' ? `<dt>Errore</dt><dd style="color:var(--red)">${esc(ghErr)}</dd>` : ''}</dl>
      ${ghConflict ? `<div class="notice var" style="margin:8px 0"><span>Su GitHub c'è una versione salvata da un altro PC o browser. Quale vuoi tenere? (L'altra resta comunque nella cronologia di GitHub o in ↶ Annulla.)</span></div>
      <div class="row"><button class="pri" id="gUseR">⬇ Carica la versione di GitHub</button><button id="gUseL">⬆ Tieni i dati di questo browser</button></div>` : ''}
      <div class="row">${ghConflict ? '' : '<button class="pri" id="gNow">Salva adesso</button>'}<button id="gVer">🕘 Versioni salvate…</button><button id="gOff">Scollega</button></div>`
      : `<p class="small">Una copia dei dati in un tuo repository <b>privato</b> su GitHub: funziona da qualsiasi PC o browser, non chiede permessi a ogni riavvio e tiene tutte le versioni.</p>
      <div class="ghf"><label>Repository privato<input id="gRepo" placeholder="mamouse87/gestionale-backup" autocomplete="off" spellcheck="false"></label>
        <label>Chiave (token)<input id="gTok" type="password" placeholder="github_pat_…" autocomplete="off"></label><button class="pri" id="gGo">Collega</button></div>
      <p class="small" id="gMsg"></p>
      <details class="ghhelp"><summary>Come creo il repository e la chiave (una volta sola, 5 minuti)</summary><ol>
        <li>Apri <a href="https://github.com/new" target="_blank" rel="noreferrer">github.com/new</a>: nome <b>gestionale-backup</b>, scegli <b>Private</b>, premi <b>Create repository</b>.</li>
        <li>Apri <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">la pagina per creare una chiave "Fine-grained"</a>.</li>
        <li><b>Token name</b>: Gestionale carte · <b>Expiration</b>: Custom, tra un anno.</li>
        <li><b>Repository access</b>: <i>Only select repositories</i> → scegli <b>gestionale-backup</b> (solo quello).</li>
        <li><b>Permissions</b> → <i>Repository permissions</i> → <b>Contents: Read and write</b>. Nient'altro (Metadata si attiva da solo).</li>
        <li>Premi <b>Generate token</b>, copia la chiave (inizia con <code>github_pat_</code>) e incollala qui sopra, con il repository scritto come <b>mamouse87/gestionale-backup</b>.</li></ol>
        <p class="small">La chiave resta solo in questo browser e non finisce nei file di backup. Con quei permessi può toccare soltanto il repository del backup. Quando scade, il gestionale ti avvisa: ne crei una nuova e ricolleghi.</p></details>`}
    </section>
    <section class="sc ${bkState === 'ok' || bkOk() ? '' : 'attn'}">
      <h3>💾 Backup in una cartella del PC <span class="stp ${bkTxt[1]}">${bkTxt[0]}</span></h3>
      <p class="small">Tutti i dati del gestionale sono solo in questo browser. Con il backup attivo, a ogni modifica il gestionale salva una copia in una cartella del PC (più una copia al giorno, ultimi ${BK_KEEP} giorni). Consiglio: una cartella di Google Drive o OneDrive.</p>
      <dl class="kv"><dt>Cartella</dt><dd>${bkDir ? esc(bkDir.name) : '—'}</dd><dt>Ultimo salvataggio</dt><dd>${at ? new Date(at).toLocaleString('it-IT') : '—'}</dd>${bkState === 'err' ? `<dt>Errore</dt><dd>${esc(bkErr)}</dd>` : ''}</dl>
      <div class="row">${bkState === 'nosupport' ? '' : bkState === 'paused' ? '<button class="pri" id="sBkRes">Riattiva il backup</button>' : `<button class="pri" id="sBkPick">📁 ${bkDir ? 'Cambia cartella' : 'Scegli la cartella'}</button>`}
        ${bkDir && bkState === 'ok' ? '<button id="sBkNow">Salva adesso</button><button id="sBkLoad">Ripristina dall\'ultimo backup</button><button id="sBkOff">Disattiva</button>' : ''}</div>
      <div class="row sep"><button id="sBkDl">⬇ Scarica un backup</button><button id="sBkUp">↩ Ripristina da file…</button></div>
    </section>
    <section class="sc">
      <h3>📈 Prezzi di mercato</h3>
      <p class="small">I sei valori di Cardmarket (Da, Tendenza, Media, Media 1/7/30 giorni) e il Consigliato, letti da TCGdex per tutte le carte in vendita e in Standby. Si aggiornano da soli all'apertura se hanno più di ${AUTO_H} ore, poi ogni ora.</p>
      <dl class="kv"><dt>Ultimo aggiornamento</dt><dd>${state.revAt ? fmtDT(state.revAt) : 'mai'}</dd>
        <dt>Price Guide di Cardmarket</dt><dd>${state.pg ? `caricata il ${fmtDT(state.pg.at)}` : 'non caricata (facoltativa)'}${state.pgAuto ? ' · si scarica da sola' : ''}</dd></dl>
      <div class="row"><button class="pri" id="sUpd">🔄 Aggiorna adesso</button><button id="sPg">📂 Carica Price Guide…</button><a class="small" href="${PG_PAGE}" target="cardscanner" referrerpolicy="no-referrer">dove si scarica</a></div>
    </section>
    <section class="sc">
      <h3>⚖️ Regole di prezzo predefinite</h3>
      <p class="small">Le scelte proposte all'apertura dei due dialoghi; lì puoi sempre cambiarle.</p>
      <div class="rule"><b>Metti in vendita su Cardmarket</b><div class="row">${ruleSel('rU', up)}</div></div>
      <div class="rule"><b>Cambia prezzi su Cardmarket</b><div class="row">${ruleSel('rE', ed)}</div></div>
      <div class="rule"><b>Soglia per variazioni e carte fuori mercato</b>
        <div class="row" style="align-items:center">Almeno <input type="number" id="thC" min="0" step="1" value="${thrCfg().c}" style="width:64px"> cent. <span>e almeno</span> <input type="number" id="thP" min="0" step="1" value="${thrCfg().pct}" style="width:64px"> %</div>
        <p class="small">Esempio: con 2 cent. e 10%, una carta da 0,05 € viene segnalata se va sotto 0,03 € o sopra 0,07 €; una da 1 € se si sposta di almeno 0,10 €.</p></div>
    </section>
    <section class="sc">
      <h3>🧰 Strumenti</h3>
      <div class="rule" id="pwaBox"><b>Gestionale come app sul PC</b>
        ${pwaStandalone() ? '<p class="small">✔ Stai usando il gestionale installato come app.</p>'
        : pwaPrompt ? `<p class="small">Icona sul desktop e finestra tutta sua, senza barra degli indirizzi. I dati restano gli stessi e si aggiorna da solo.</p><div class="row"><button class="pri" id="pwaGo">Installa il gestionale come app</button></div>`
        : `<p class="small">Icona sul desktop e finestra tutta sua. In Chrome: menu <b>⋮</b> in alto a destra → <b>Trasmetti, salva e condividi</b> → <b>Installa pagina come app…</b> (oppure l'icona con il monitor e la freccia, a destra nella barra degli indirizzi). Se l'hai già installato, aprilo dall'icona sul desktop.</p>`}</div>
      <ul class="links">
        <li><a href="../cardmarket/" target="_blank">Card Scanner per Cardmarket</a><span class="small">${csExt() ? `estensione di Chrome installata (v. ${esc(csExt())}) · ` : ''}estensione o pulsante: installazione e istruzioni</span></li>
        <li><a href="https://github.com/mamouse87/scanner-pokemon/releases" target="_blank" rel="noreferrer">App Card Scanner per Android</a><span class="small">ultima versione da installare sul telefono</span></li>
        <li><a href="https://www.cardmarket.com/it/Pokemon/Stock/Offers/Singles" target="cardscanner" referrerpolicy="no-referrer">Le mie offerte su Cardmarket</a><span class="small">per cambiare i prezzi con lo script</span></li>
      </ul>
    </section>
    <section class="sc">
      <h3>🗂 Dati salvati</h3>
      <dl class="kv"><dt>In vendita</dt><dd>${Object.keys(state.listings).length} righe · ${Object.values(state.listings).reduce((a, l) => a + l.q, 0)} copie</dd>
        <dt>Standby</dt><dd>${Object.values(state.standby || {}).reduce((a, x) => a + x.q, 0)} copie</dd>
        <dt>Vendite</dt><dd>${state.sold.length} righe</dd><dt>Registro</dt><dd>${(state.log || []).length} operazioni</dd>
        <dt>Carte di Cardmarket conosciute</dt><dd>${nCards} (${Object.keys(state.cm).length} set) · ${tcgSets.length} set da TCGdex</dd>
        <dt>Spazio usato</dt><dd id="stSpace">${(size / 1024).toFixed(0)} KB${DBOK() ? '' : ' di circa 5.000 KB'}</dd></dl>
    </section>
    <section class="sc danger">
      <h3>⚠️ Zona pericolosa</h3>
      <p class="small">Cancella tutte le carte in vendita e lo storico delle vendite (Standby e registro restano). Prima scarica un backup.</p>
      <div class="row"><button class="danger" id="sWipe">🗑 Svuota carte in vendita e vendite</button></div>
    </section>
  </div></div>`;
  // lista a sinistra: una voce per sezione, a destra si apre solo quella scelta
  const SECS = [
    ['gh', '☁️', 'Backup su GitHub', gh ? (ghState === 'ok' ? 'Attivo · ' + (gh.at ? fmtDT(gh.at) : 'non ancora salvato') : 'Errore') : 'Non collegato', gh ? (ghState === 'ok' ? 'ok' : 'bad') : (bkOk() ? '' : 'bad')],
    ['bk', '💾', 'Backup nel PC', bkTxt[0], bkState === 'ok' ? 'ok' : bkOk() || bkState === 'nosupport' ? '' : 'bad'],
    ['mk', '📈', 'Prezzi di mercato', state.revAt ? 'Aggiornati ' + fmtDT(state.revAt) : 'Mai aggiornati', ''],
    ['rules', '⚖️', 'Regole di prezzo', `${BASEN[up.base]} · soglia ${thrCfg().c} cent. / ${thrCfg().pct}%`, ''],
    ['tools', '🧰', 'Strumenti', 'Script, app, Cardmarket', ''],
    ['log', '📜', 'Registro', `${(state.log || []).length} operazioni`, ''],
    ['data', '🗂', 'Dati salvati', `${(size / 1024).toFixed(0)} KB usati`, ''],
    ['danger', '⚠️', 'Zona pericolosa', 'Svuota carte in vendita', 'dz']];
  if (!SECS.some(x => x[0] === setSec)) setSec = 'gh';
  const secEls = [...$('main').querySelectorAll('.setgrid > section')];
  // le sezioni sono nello stesso ordine dell'elenco, senza il Registro (che apre una pagina sua)
  const SECP = SECS.filter(x => x[0] !== 'log');
  secEls.forEach((el, i) => { el.dataset.s = SECP[i] ? SECP[i][0] : ''; el.classList.toggle('on', el.dataset.s === setSec); });
  $('setNav').innerHTML = SECS.map(([id, ic, t, sub, cls]) => `<button class="${id === setSec ? 'on' : ''} ${cls}" data-s="${id}"><span class="ic">${ic}</span><span class="tx"><b>${t}</b><small>${esc(sub)}</small></span>${cls === 'bad' ? '<i>!</i>' : ''}</button>`).join('');
  spaceInfo(size);
  $('setNav').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s === 'log') { goTab('__log'); return; }   // il registro ha una pagina sua
    setSec = b.dataset.s;
    $('setNav').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); secEls.forEach(el => el.classList.toggle('on', el.dataset.s === setSec)); };
  const reload = () => { bkShow(); renderTabs(); renderSettings(); };
  if ($('gGo')) $('gGo').onclick = async () => {
    $('gGo').disabled = true; $('gGo').textContent = 'Controllo…'; $('gMsg').textContent = '';
    try {
      const sha = await ghConnect($('gRepo').value, $('gTok').value);
      const empty = !Object.keys(state.listings).length && !Object.keys(state.standby || {}).length;
      if (sha) {
        // leggo prima il backup, così ti mostro cosa c'è da una parte e dall'altra
        const remote = await ghLoad();
        const sum = st => { const ls = Object.values(st.listings || {}), sb = Object.values(st.standby || {});
          return `${ls.reduce((a, l) => a + (l.q || 0), 0)} in vendita, ${sb.reduce((a, x) => a + (x.q || 0), 0)} in Standby, ${(st.sold || []).reduce((a, x) => a + (x.q || 0), 0)} vendute`; };
        const lastLog = st => (st.log || []).slice(-1)[0]?.at;
        const useRemote = empty || confirm(`Su GitHub c'è già un backup.\n\n• GitHub: ${sum(remote)}${lastLog(remote) ? ' (ultima operazione ' + fmtDT(lastLog(remote)) + ')' : ''}\n• Questo browser: ${sum(state)}${lastLog(state) ? ' (ultima operazione ' + fmtDT(lastLog(state)) + ')' : ''}\n\nOK = usa i dati di GitHub (consigliato se arrivi da un altro PC).\nAnnulla = tieni i dati di questo browser e salvali su GitHub (la versione di GitHub resta comunque nella cronologia).`);
        if (useRemote) ghRestore(remote, '(ultima versione)'); else await ghWrite(true);
      } else await ghWrite();
      logOp('dati', '', `Backup su GitHub collegato a ${gh.repo}`); save();
      if (ghState === 'ok') toast('Backup su GitHub attivo ✔');
    } catch (e) {
      // non resto collegato a metà: il backup su GitHub non va toccato finché non scegli tu
      gh = null; ghStore(); ghState = 'off'; ghConflict = false; clearTimeout(ghTimer); ghTimer = null; ghDirty = false;
      $('gMsg').innerHTML = `<b style="color:var(--red)">Non collegato: ${esc(e.message)}</b>`; $('gGo').disabled = false; $('gGo').textContent = 'Collega'; return;
    }
    reload();
  };
  if ($('gNow')) $('gNow').onclick = async () => { $('gNow').disabled = true; $('gNow').textContent = 'Salvo…'; await ghWrite(); if (ghState === 'ok') toast('Salvato su GitHub ✔'); reload(); };
  if ($('gVer')) $('gVer').onclick = ghVersionsDlg;
  if ($('pwaGo')) $('pwaGo').onclick = async () => { const p = pwaPrompt; if (!p) return; pwaPrompt = null; p.prompt(); try { await p.userChoice; } catch (e) {} renderSettings(); };
  if ($('gUseR')) $('gUseR').onclick = async () => { $('gUseR').disabled = true; $('gUseR').textContent = 'Carico…'; await ghResolve('remote'); };
  if ($('gUseL')) $('gUseL').onclick = async () => { $('gUseL').disabled = true; $('gUseL').textContent = 'Salvo…'; await ghResolve('local'); if (ghState === 'ok') toast('Salvato su GitHub ✔'); };
  if ($('gOff')) $('gOff').onclick = () => { if (!confirm('Scollegare il backup su GitHub? Il repository e le versioni salvate restano su GitHub; da questo browser viene tolta solo la chiave.')) return; gh = null; ghStore(); ghState = 'off'; ghConflict = false; clearTimeout(ghTimer); ghTimer = null; reload(); };
  if ($('sBkPick')) $('sBkPick').onclick = async () => { await bkChoose(); reload(); };
  if ($('sBkRes')) $('sBkRes').onclick = async () => { await bkResume(); reload(); };
  if ($('sBkNow')) $('sBkNow').onclick = async () => { await bkWrite(); toast('Backup salvato'); reload(); };
  if ($('sBkOff')) $('sBkOff').onclick = async () => { if (!confirm('Disattivare il backup automatico? I file già salvati restano nella cartella.')) return; await bkDb('del'); bkDir = null; bkState = 'off'; reload(); };
  if ($('sBkLoad')) $('sBkLoad').onclick = async () => {
    try {
      const s = JSON.parse(await (await (await bkDir.getFileHandle(BK_FILE)).getFile()).text());
      if (!s.listings) throw new Error('file non valido');
      if (confirm(`Sostituire i dati attuali con il backup della cartella (${Object.keys(s.listings).length} righe in vendita, ${(s.sold || []).length} vendite)?`)) { state = Object.assign({ cm: {}, sold: [], standby: {} }, s); logOp('dati', '', 'Ripristinato l\'ultimo backup della cartella'); save(); refresh(); }
    } catch (e) { alert('Non riesco a leggere il backup: ' + e.message); }
  };
  $('sBkDl').onclick = downloadBackup;
  $('sBkUp').onclick = () => $('fRestore').click();
  $('sUpd').onclick = async () => { $('sUpd').disabled = true; $('sUpd').textContent = 'Aggiorno…'; const r = await updatePrices(true); if (r) toast(`Prezzi aggiornati: ${r.tot} carte · ${r.nNew ? r.nNew + ' con variazione' : 'nessuna variazione'}`); if (selected === '__set') renderSettings(); };
  $('sPg').onclick = () => $('fPg').click();
  const bindRule = (id, cfg) => ['B', 'S', 'P'].forEach(x => $(id + x).onchange = () => {
    cfg.base = $(id + 'B').value; cfg.plus = (+$(id + 'S').value || 1) * Math.abs(parseInt($(id + 'P').value || '0', 10) || 0); save(); toast('Regola salvata');
  });
  bindRule('rU', up); bindRule('rE', ed);
  ['thC', 'thP'].forEach(id => $(id).onchange = () => { const t = thrCfg(); t.c = Math.max(0, parseInt($('thC').value, 10) || 0); t.pct = Math.max(0, parseInt($('thP').value, 10) || 0); save(); renderTabs(); renderSets(); toast('Soglia salvata'); });
  $('sWipe').onclick = () => { if (confirm('Cancellare tutte le carte in vendita e le vendite? Fai prima un backup.')) { state = Object.assign({}, state, { listings: {}, sold: [], orders: {}, market: {} }); logOp('dati', '', 'Svuotate tutte le carte in vendita e le vendite'); save(); refresh(); } };
}

// ---------- controllo con Cardmarket: le offerte lette dallo script (tu collegato) confrontate con il magazzino ----------
// Lo script manda '#cmchk=' con tutte le offerte delle singole Pokémon. Dal 19/11 l'elenco sta nei dati (state.chk),
// così viaggia con i backup e l'altro PC vede lo stesso controllo; prima stava solo in questo browser ('gestionaleCheck').
// ---------- consegna dell'elenco allo script, sempre nella stessa scheda di Cardmarket ----------
// Tutto ciò che il gestionale apre su Cardmarket va nella scheda chiamata CM_TAB: se è già aperta la riuso.
// L'elenco per lo script viaggia nell'indirizzo, dopo il # (non arriva al server di Cardmarket): lo script lo legge
// e lo toglie. Se la scheda è già sulla stessa pagina e lo script è aperto, lo script prende subito l'elenco nuovo.
// Se Cardmarket chiede il login, l'indirizzo con il # si perde: lo script lo richiede a questa pagina
// (la scheda è stata aperta da qui; rispondo solo a cardmarket.com), altrimenti basta ripremere il pulsante.
const CS_PEND = 'gestionaleCsPending', CM_TAB = 'cardscanner';
// Con l'estensione di Chrome installata (il suo ponte segna data-cs-ext sulla pagina) l'operazione la porta lei:
// la tiene finché non arriva su Cardmarket (anche dopo il login) e riusa la scheda di Cardmarket già aperta.
const csExt = () => document.documentElement.dataset.csExt || '';
function openCm(url, payload) {
  try { localStorage.setItem(CS_PEND, JSON.stringify({ at: Date.now(), p: payload })); } catch (e) {}
  if (csExt()) { window.postMessage({ csExt: 'job', p: payload, url: url.split('#')[0] }, location.origin); return true; }
  return window.open(url.split('#')[0] + '#' + payload, CM_TAB);
}
function csPendingDone() { try { localStorage.removeItem(CS_PEND); } catch (e) {} }
window.addEventListener('message', e => {
  if (e.origin !== 'https://www.cardmarket.com' || !e.data || e.data.cs !== 'want' || !e.source) return;
  let P = null; try { P = JSON.parse(localStorage.getItem(CS_PEND)); } catch (x) {}
  if (!P || !P.p || Date.now() - P.at > 12 * 3600e3) return;          // niente in attesa (o troppo vecchio)
  try { e.source.postMessage({ cs: 'job', p: P.p }, 'https://www.cardmarket.com'); } catch (x) {}
});
const CHK_KEY = 'gestionaleCheck';
Object.defineProperty(globalThis, 'chk', { configurable: true, get: () => state.chk || null, set: v => { state.chk = v || null; } });
// vecchio controllo salvato solo in questo browser: lo sposto nei dati (se nei dati non ce n'è già uno)
try {
  const old = JSON.parse(localStorage.getItem(CHK_KEY) || 'null');
  if (old && old.list && !state.chk) state.chk = old;               // va nei dati al prossimo salvataggio
  else if (old) localStorage.removeItem(CHK_KEY);                       // già nei dati: la vecchia copia non serve più
} catch (e) {}
function importCheckFromHash() {
  const m = location.hash.match(/^#cmchk=(.+)$/);
  if (!m) return false;
  csPendingDone();   // il risultato è arrivato: l'elenco non va più consegnato allo script
  history.replaceState(null, '', location.pathname);
  let d;
  try { d = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { alert('Elenco delle offerte non leggibile.'); return true; }
  const list = (d.o || []).map(r => Object.assign({ code: String(r[0] || '').toUpperCase(), num: r[1], rev: !!r[2], lang: r[3] || 'it', q: +r[4] || 1, price: r[5], name: r[6] || '', exp: (d.ex || [])[r[7]] || '' }, r[8] ? { sl: String(r[8]) } : {}));
  if (!list.length) { alert('Lo script non ha letto nessuna offerta: controllo non fatto. Riprova da "Le mie offerte".'); return true; }
  // lettura parziale (più di 300 offerte): ho letto solo i set in rx, per gli altri non segnalo "solo nel gestionale"
  chk = { at: d.at || new Date().toISOString(), list, rx: d.full === 0 ? (d.rx || []).map(String) : null, warn: d.warn || [] };
  // copie corrette su Cardmarket durante il controllo (le offerte lette sono già quelle dopo la correzione)
  if ((d.fixed || []).length) {
    const by = {};
    d.fixed.forEach(r => { const L = state.listings[r.k]; const set = L ? (L.expName || state.cm[L.exp]?.name || '') : '';
      (by[set] = by[set] || []).push(`${L ? cardTxt(L) : r.k} ${r.from} → ${r.qt} copie${r.zero ? ' (offerta da togliere a mano)' : ''}`); });
    Object.entries(by).forEach(([set, a]) => logOp('quantita', set, `Controllo: copie corrette su Cardmarket (vale il gestionale): ${a.join(', ')}`, null));
    setTimeout(() => toast(`Copie corrette su Cardmarket durante il controllo: ${d.fixed.filter(r => !r.zero).length}`), 1500);
  }
  state.chkAt = chk.at; softSave();
  selected = '__chk';
  const n = chkDiffs().length;
  setTimeout(() => toast(n ? `Controllo con Cardmarket: ${n} differenze da guardare` : 'Controllo con Cardmarket: tutto allineato ✔'), 300);
  return true;
}
/** differenze tra magazzino e offerte lette: [{type, k?, l?, os, ...}] */
function chkDiffs() {
  if (!chk) return [];
  // varianti speciali: per numero prodotto (dall'indirizzo dell'offerta), senza guardare la casella Reverse
  // un indirizzo con -V1-/-V2- nella pagina del set può essere anche la carta base: è speciale solo se il prodotto è una variante speciale
  const vxSet = new Set([...Object.values(state.listings), ...Object.values(state.standby || {})].filter(x => x.vp).map(x => String(x.vp)));
  const bySl = pidBySlug(), ovp = o => { if (!o.sl) return null; const p = bySl[o.sl]; return p ? (vxSet.has(p) ? p : null) : isSupName(o.exp) ? 'S:' + o.sl : null; };
  const tailOf = (num, rev, lang, vp) => `|${norm(num)}|${vp ? 'X' + vp : rev ? 'R' : 'N'}|${lang || 'it'}`;
  const byCode = {}, byExp = {}, used = new Set();
  chk.list.forEach(o => {
    const t = tailOf(o.num, o.rev, o.lang, ovp(o));
    if (o.code) (byCode[o.code + t] = byCode[o.code + t] || []).push(o);
    if (o.exp) (byExp[simp(o.exp) + t] = byExp[simp(o.exp) + t] || []).push(o);
  });
  const out = [];
  for (const [k, l] of Object.entries(state.listings)) {
    const t = tailOf(l.u, l.rev, l.lang, l.vp), code = String(setCode(l) || '').toUpperCase();
    const os = (code && byCode[code + t]) || byExp[simp(l.expName || state.cm[l.exp]?.name) + t] || [];
    os.forEach(o => used.add(o));
    // messa in vendita (o aggiunte copie) dopo il controllo: quel controllo non la poteva vedere, non la segnalo
    if (l.date && /T/.test(l.date) && Date.parse(l.date) > Date.parse(chk.at)) continue;
    if (!os.length) { if (!chk.rx || chk.rx.includes(String(l.exp))) out.push({ type: 'miss', k, l, os }); continue; }
    const q = os.reduce((a, o) => a + o.q, 0), prices = [...new Set(os.map(o => r2(o.price)))];
    if (q !== l.q) out.push({ type: 'qty', k, l, os, q });
    if (prices.length > 1) out.push({ type: 'multi', k, l, os });
    else if (prices[0] != null && (l.price == null || Math.abs(prices[0] - l.price) > 0.004)) out.push({ type: 'price', k, l, os, price: prices[0] });
  }
  // offerte su Cardmarket che il gestionale non ha: raggruppate per carta
  const extra = {};
  chk.list.forEach(o => { if (used.has(o)) return; const key = (o.code || simp(o.exp)) + tailOf(o.num, o.rev, o.lang, ovp(o)); (extra[key] = extra[key] || []).push(o); });
  Object.values(extra).forEach(os => {
    const o = os[0], E = expByCode(o.code) || Object.values(state.cm).find(e => simp(e.name) === simp(o.exp));
    const card = E && ((o.sl && Object.values(E.cards || {}).find(c => c.ur && slugOf(c.ur) === o.sl)) || Object.values(E.cards || {}).find(c => norm(c.u) === norm(o.num)));
    out.push({ type: 'extra', os, o, E, card, q: os.reduce((a, x) => a + x.q, 0) });
  });
  return out;
}
/** prepara per lo script l'elenco delle quantità da correggere su Cardmarket: rows = [{k, qt}] (qt = copie giuste) */
/** carte appena messe in vendita dallo script (che ha già controllato che siano su Cardmarket):
 *  le aggiungo alle offerte dell'ultimo controllo, così non risultano "solo nel gestionale" */
function chkAfterListing(added) {
  if (!chk || !added.length) return;
  added.forEach(({ k, q, price }) => {
    const L = state.listings[k]; if (!L) return;
    const o = Object.assign({ code: String(setCode(L) || '').toUpperCase(), num: L.u, rev: !!L.rev, lang: L.lang || 'it', q, price: price != null ? r2(price) : null, name: info(L).name, exp: L.expName || state.cm[L.exp]?.name || '' }, slOfL(L) ? { sl: slOfL(L) } : {});
    // stessa carta allo stesso prezzo: Cardmarket aggiunge le copie alla stessa offerta
    const same = chk.list.find(x => x.num && norm(x.num) === norm(o.num) && (o.sl ? x.sl === o.sl : x.rev === o.rev && !x.sl) && (x.lang || 'it') === o.lang && x.price === o.price &&
      ((o.code && x.code === o.code) || simp(x.exp) === simp(o.exp)));
    if (same) same.q += q; else chk.list.push(o);
  });
  softSave();
}
/** dopo una correzione fatta (e verificata) dallo script su Cardmarket, aggiorno il controllo: la differenza sparisce.
 *  r.qt = copie giuste (correzione delle copie), r.price = nuovo prezzo (cambio prezzi) */
function chkAfterFix(res) {
  if (!chk || !res.length) return;
  const diffs = chkDiffs();
  res.forEach(r => {
    if (r.price != null) diffs.filter(x => x.k === r.k && (x.type === 'price' || x.type === 'multi')).forEach(d => d.os.forEach(o => { o.price = r2(r.price); }));
    if (r.zero || r.qt == null) return;              // offerte da togliere a mano: restano finché non rifai il controllo
    const d = diffs.find(x => x.type === 'qty' && x.k === r.k);
    if (!d) return;
    let rem = Math.max(0, r.qt);
    d.os.forEach(o => { const t = Math.min(o.q, rem); o.q = t; rem -= t; });
    if (rem > 0 && d.os[0]) d.os[0].q += rem;
  });
  chk.list = chk.list.filter(o => o.q > 0);
  softSave();
}
function openQtyEdit(rows, why, scope) {
  rows = rows.filter(r => state.listings[r.k] || r.l);
  if (!rows.length) return false;
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `QUANTITA-${scope ? SavedListsName(scope) : 'Tutti'}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  const job = { v: 1, type: 'qty', at: today(), name,
    items: rows.map(r => { const l = r.l || state.listings[r.k];
      return Object.assign({ k: r.k, code: setCode(l), exp: l.expName || state.cm[l.exp]?.name || '', u: l.u, n: info(l).name, rev: !!l.rev, lang: l.lang || 'it', q: l.q, qt: Math.max(0, r.qt), old: l.price, price: null }, l.vp ? { v: 'S', vl: l.vl, vb: l.vb, sl: slOfL(l) } : slOfL(l) ? { sl: slOfL(l) } : {}); }) };
  const enc = 'csedit=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(job)))));
  try { navigator.clipboard.writeText(enc); } catch (e) {}
  const win = openCm(OFFERS_URL, enc);
  if (!win) { alert('Il browser ha bloccato l\'apertura di Cardmarket: consenti i popup per questa pagina e riprova.'); return false; }
  logOp('quantita', scope || '', `Preparato "${name}" (${why}): ${job.items.map(i => `${i.code}${i.u}${i.rev ? ' R' : ''} → ${i.qt}`).join(', ')}`, null);
  save();
  toast(`Elenco ${name} pronto: ${csExt() ? 'su Cardmarket il riquadro di Card Scanner si apre da solo: premi' : 'su Cardmarket premi Card Scanner e poi'} ▶ Correggi le quantità`);
  return true;
}
/** stessa carta in più offerte su Cardmarket a prezzi diversi: lo script porta tutte le offerte al prezzo del gestionale */
function openPriceFix(ds, why) {
  ds = ds.filter(x => x.l && x.l.price != null);
  if (!ds.length) return false;
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `PREZZO-UNICO_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  const job = { v: 1, type: 'edit', at: today(), name, base: 'gest', plus: 0,
    items: ds.map(({ k, l }) => ({ k, code: setCode(l), exp: setOf(l), u: l.u, n: info(l).name, rev: !!l.rev, lang: l.lang || 'it', q: l.q, ...(l.vp ? { v: 'S', vl: l.vl, vb: l.vb, sl: slOfL(l) } : slOfL(l) ? { sl: slOfL(l) } : {}),
      old: null, price: r2(l.price), b: l.rb || 'low', o: l.ro ?? 0, ref: l.ref ?? null, m: 1 })) };
  const enc = 'csedit=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(job)))));
  const win = openCm(OFFERS_URL, enc);
  if (!win) { alert('Il browser ha bloccato l\'apertura di Cardmarket: consenti i popup per questa pagina e riprova.'); return false; }
  logOp('prezzo', '', `Preparato "${name}" (${why}): ${job.items.map(i => `${i.code}${i.u}${i.rev ? ' R' : ''} → ${eur(i.price)}`).join(', ')}`, null);
  save();
  toast(`Elenco ${name} pronto: ${csExt() ? 'su Cardmarket il riquadro di Card Scanner si apre da solo: premi' : 'su Cardmarket premi Card Scanner e poi'} ▶ Cambia i prezzi`);
  return true;
}
/** applica una correzione al gestionale (mai a Cardmarket). Ritorna il testo per il registro. */
function chkApply(d) {
  const nm = l => `${l.u}${l.rev ? ' R' : ''} ${info(l).name || ''}`.trim();
  if (d.type === 'qty') { const L = state.listings[d.k], q0 = L.q; L.q = d.q; return [L.expName, `${nm(L)}: copie ${q0} → ${d.q}`]; }
  if (d.type === 'price') {
    const L = state.listings[d.k], p0 = L.price; L.price = d.price; L.pAt = today();
    const cur = baseOf(mOf(d.k), L.rb || 'low'); if (cur != null && (!L.rev || mOf(d.k)?.rv)) { L.ref = cur; L.refAt = today(); }
    return [L.expName, `${nm(L)}: prezzo ${eur(p0) || '—'} → ${eur(d.price)}`];
  }
  if (d.type === 'miss') { const L = state.listings[d.k]; delete state.listings[d.k]; delete (state.market || {})[d.k]; return [L.expName, `${nm(L)} ×${L.q}: tolta dalle carte in vendita`]; }
  if (d.type === 'extra' && d.E && d.card) {
    const o = d.o, vx = !!o.sl || isSupName(d.E.name), orv = vx ? false : !!o.rev, k = lkey(d.card.p, orv, o.lang), prices = [...new Set(d.os.map(x => r2(x.price)))];
    const VI = vx ? (vxInfoOf(tcgIdFor(d.E.name), d.card.u || o.num, d.card.p) || { vl: 'Variante speciale', vb: 'SP' }) : null;
    const L = state.listings[k] || (state.listings[k] = Object.assign({ p: d.card.p, exp: d.E.id, expName: d.E.name, u: d.card.u || o.num, rev: orv, lang: o.lang, q: 0, price: null, date: today(), com: '' }, vx ? { vp: String(d.card.p), vl: VI.vl, vb: VI.vb } : {}));
    L.q += d.q; L.price = Math.max(...prices); L.pAt = today();
    // se erano in Standby, escono da lì
    const sid = tcgIdFor(d.E.name);
    const sk = Object.keys(state.standby || {}).find(x => { const X = state.standby[x]; return (X.s === sid || simp(X.sn) === simp(String(d.E.name).replace(SUPRX, ''))) && norm(X.u) === norm(o.num) && vcOf(X) === vcOf(L) && (X.lang || 'it') === (o.lang || 'it'); });
    let fromSb = 0;
    if (sk) { const X = state.standby[sk]; fromSb = Math.min(X.q, d.q); X.q -= fromSb; if (X.q <= 0) { delete state.standby[sk]; delete (state.sbMarket || {})[sk]; } }
    return [d.E.name, `${nm(L)} ×${d.q} a ${eur(L.price)}: aggiunta alle carte in vendita${fromSb ? ` (${fromSb} tolte dallo Standby)` : ''}`];
  }
  return null;
}
function chkApplyMany(list, what) {
  const bySet = {};
  list.forEach(d => { const r = chkApply(d); if (r) (bySet[r[0] || ''] = bySet[r[0] || ''] || []).push(r[1]); });
  const n = Object.values(bySet).reduce((a, x) => a + x.length, 0);
  if (!n) return;
  Object.entries(bySet).forEach(([set, a]) => logOp(what === 'miss' ? 'tolta' : what === 'extra' ? 'vendita' : what === 'price' ? 'prezzo' : 'quantita', set, `Controllo con Cardmarket: ${a.join(', ')}`, null));
  save(); refresh(); toast(`Gestionale allineato a Cardmarket: ${n} ${n === 1 ? 'riga' : 'righe'}`);
}
const chkF = { type: '' };
/** set da leggere uno per uno su Cardmarket (oltre 300 offerte Cardmarket non mostra le altre): [[idEspansione Cardmarket, nome]] */
function chkSetsParam(fix) {
  const ids = new Set(Object.values(state.listings).map(l => String(l.exp)).filter(Boolean));
  Object.values(state.standby || {}).forEach(X => { const e = Object.entries(state.cm).find(([, E]) => simp(E.name) === simp(X.sn)); if (e) ids.add(String(e[0])); });
  const e = [...ids].filter(id => /^\d+$/.test(id)).map(id => [id, state.cm[id]?.name || '']);
  // con "correggi subito": le copie giuste di ogni carta in vendita (lo script abbassa solo quelle in più su Cardmarket)
  const L = fix ? Object.entries(state.listings).map(([k, l]) => { const r = [k, setCode(l), l.expName || state.cm[l.exp]?.name || '', l.u, info(l).name, l.rev ? 1 : 0, l.lang || 'it', l.q]; const sl = slOfL(l); if (sl) r.push(sl); return r; }) : undefined;
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ e, L })))));
}
function openStockCheck() {
  openDlg(`<h3>Controlla il magazzino con Cardmarket</h3>
    <p>Lo script legge tutte le tue offerte di carte singole Pokémon (tutte le pagine, Normali e Reverse; oltre 300 offerte le legge set per set) e le manda qui. Il gestionale ti mostra le differenze. Senza la casella qui sotto <b>su Cardmarket non viene cambiato nulla</b>.</p>
    <ol><li>Premi <b>Apri le mie offerte</b>: si apre la pagina di Cardmarket (devi essere collegato).</li>
      <li>${csExt() ? 'Lì il riquadro di Card Scanner si apre da solo' : 'Lì premi <b>📋 Card Scanner → CM</b> nei preferiti'}, poi <b>🔎 Leggi le mie offerte</b>.</li>
      <li>Alla fine premi <b>📤 Invia al gestionale</b>: torni qui con il risultato.</li></ol>
    <label class="sw" style="display:flex;gap:10px;align-items:flex-start;background:#f3f7ff;border:1px solid #cddcf5;border-radius:10px;padding:10px 12px;margin:10px 0">
      <input type="checkbox" id="kFix" ${localStorage.getItem('gestionaleChkFix') === '1' ? 'checked' : ''} style="margin-top:3px">
      <span><b>Correggi subito su Cardmarket le copie in più</b><br><span class="small">Controllo e correzione in un colpo solo: dove su Cardmarket ci sono <b>più</b> copie che nel gestionale, lo script le abbassa (vale il gestionale), poi manda qui il risultato. Dove su Cardmarket ce ne sono <b>meno</b> non tocca nulla: può essere una vendita non ancora caricata, decidi tu nella scheda Controllo. Le offerte da portare a 0 copie le togli tu.</span></span></label>
    <p class="small">Non hai il pulsante Card Scanner nei preferiti, o è vecchio? <a href="../cardmarket/" target="_blank">Installalo da qui</a>: per il controllo serve la versione nuova.</p>
    <p style="text-align:right"><button id="dClose">Annulla</button> <button class="pri" id="kGo">Apri le mie offerte</button></p>`, () => {
    $('dClose').onclick = closeDlg;
    $('kGo').onclick = () => {
      const fix = $('kFix').checked; localStorage.setItem('gestionaleChkFix', fix ? '1' : '0');
      const w = openCm(OFFERS_URL, 'cscheck=' + Date.now() + '.' + chkSetsParam(fix));
      if (!w) alert('Il browser ha bloccato la nuova scheda: permetti i popup per questa pagina e riprova.');
      else if (fix) logOp('quantita', '', 'Controllo con correzione delle copie in più su Cardmarket avviato', null);
      closeDlg();
    };
  });
}
function renderChk() {
  const all = chkDiffs(), T = { qty: 'Quantità diverse', price: 'Prezzi diversi', multi: 'Più offerte a prezzi diversi', miss: 'Solo nel gestionale', extra: 'Solo su Cardmarket' };
  const cnt = t => all.filter(d => d.type === t).length;
  if (chkF.type && !cnt(chkF.type)) chkF.type = '';
  const list = all.filter(d => !chkF.type || d.type === chkF.type);
  const old = state.chkAt ? daysAgo(state.chkAt) : null;
  const nL = Object.keys(state.listings).length, qL = Object.values(state.listings).reduce((a, l) => a + l.q, 0);
  const offs = o => o.map(x => `${x.q} × ${eur(x.price)}`).join(' · ');
  const row = (d, i) => {
    const l = d.l, o = d.o || d.os[0];
    const card = l ? `<b>${esc(setCode(l))}${esc(l.u)}</b> ${esc(info(l).name || o?.name || '')}<small>${esc(l.expName || '')}</small>` : `<b>${esc(o.code)}${esc(o.num)}</b> ${esc(o.name)}<small>${esc(d.E?.name || o.exp)}</small>`;
    const rev = (l ? l.rev : o.rev) ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale';
    const g = l ? `${l.q} × ${eur(l.price) || '—'}` : '—', c = d.os.length ? offs(d.os) : '—';
    const act = d.type === 'qty' ? `<button class="sm" data-a="${i}" title="Il giusto è Cardmarket: correggo il gestionale">Usa ${d.q} copie</button> <button class="sm pri" data-cm="${i}" title="Il giusto è il gestionale: lo script corregge Cardmarket">Correggi su Cardmarket (${d.l.q})</button>`
      : d.type === 'price' ? `<button class="sm" data-a="${i}">Usa ${eur(d.price)}</button>`
      : d.type === 'miss' ? `<button class="sm" data-a="${i}">Togli dal gestionale</button>`
      : d.type === 'extra' ? (d.E && d.card ? `<button class="sm" data-a="${i}">Aggiungi al gestionale</button>` : '<span class="small" title="Sulla pagina Inserisci carte bulk del set premi Card Scanner e poi Aggiorna i dati del set nel gestionale">carta non ancora nel catalogo del gestionale</span>')
      : l && l.price != null ? `<button class="sm pri" data-pm="${i}" title="Lo script cambia su Cardmarket il prezzo delle offerte di questa carta che non sono a ${eur(l.price)} (il prezzo del gestionale)">Tutte a ${eur(l.price)} su Cardmarket</button>`
      : '<span class="small">il gestionale tiene un solo prezzo per carta</span>';
    return `<tr><td>${card}</td><td>${rev}</td><td><span class="ktag k-${d.type}">${T[d.type]}</span></td><td class="n">${g}</td><td class="n">${c}</td><td style="text-align:right">${act}</td></tr>`;
  };
  const bulkCm = () => { const t = chkF.type, n = list.filter(d => d.type === t && (t !== 'multi' || d.l?.price != null)).length;
    return n > 1 && t === 'qty' ? `<button id="kAllCm" class="pri">Correggi tutte su Cardmarket (${n})</button>`
      : n > 1 && t === 'multi' ? `<button id="kAllPm" class="pri">Un solo prezzo su Cardmarket per tutte (${n})</button>` : ''; };
  const bulk = t => { if (t === 'multi') return ''; const n = list.filter(d => d.type === t && (t !== 'extra' || (d.E && d.card))).length; return n > 1 && chkF.type === t ? `<button id="kAll" data-t="${t}">${{ qty: 'Usa le quantità di Cardmarket', price: 'Usa i prezzi di Cardmarket', miss: 'Togli tutte dal gestionale', extra: 'Aggiungi tutte al gestionale' }[t]} (${n})</button>` : ''; };
  $('main').innerHTML = `<div class="sethead"><div><h2>Controllo con Cardmarket</h2>
    <div class="sub">Confronta le carte in vendita nel gestionale con le offerte lette sul tuo negozio. "Usa…" corregge il gestionale; "Correggi su Cardmarket" fa cambiare le copie su Cardmarket dallo script.</div></div>
    <button class="pri" id="kNew">🔎 ${chk ? 'Nuovo controllo' : 'Controlla adesso'}</button></div>
    ${chk ? `<div class="figs"><div class="fig ${all.length ? 'f-hi' : 'f-ok'}"><b>${all.length}</b><span>${all.length === 1 ? 'differenza' : 'differenze'}</span></div>
      <div class="fig"><b>${chk.list.length}</b><span>offerte su Cardmarket · ${chk.list.reduce((a, o) => a + o.q, 0)} copie</span></div>
      <div class="fig"><b>${nL}</b><span>righe nel gestionale · ${qL} copie</span></div>
      <div class="fig"><b>${old === 0 ? 'oggi' : old === 1 ? 'ieri' : old + ' gg fa'}</b><span>ultimo controllo · ${fmtDT(chk.at)}</span></div></div>
    ${(chk.warn || []).length ? `<div class="notice var"><span>⚠ ${esc(chk.warn.join(' · '))}</span></div>` : ''}
    ${chk.rx ? `<div class="notice" style="background:#eef4ff;border:1px solid #cddcf5"><span>Su Cardmarket avevi più di 300 offerte: lo script le ha lette set per set (${chk.rx.length} set). Le carte "Solo nel gestionale" sono controllate solo per quei set.</span></div>` : ''}
    ${old >= 1 ? `<div class="notice var"><span>Le offerte sono state lette ${old === 1 ? 'ieri' : old + ' giorni fa'}: se nel frattempo hai venduto o messo in vendita carte, fai un nuovo controllo prima di correggere.</span></div>` : ''}
    ${all.length ? `<div class="filters"><span class="chips" id="kChips">${[['', 'Tutte', all.length], ...Object.keys(T).map(t => [t, T[t], cnt(t)]).filter(x => x[2])].map(([f, l, n]) => `<button class="chip ${chkF.type === f ? 'on' : ''}" data-f="${f}">${l}<i>${n}</i></button>`).join('')}</span>${chkF.type ? bulk(chkF.type) + ' ' + bulkCm() : ''}</div>
    <table class="rtable"><thead><tr><th>Carta</th><th>Variante</th><th>Differenza</th><th class="n">Gestionale</th><th class="n">Cardmarket</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`
      : '<p class="empty">Tutto allineato: le carte in vendita nel gestionale corrispondono alle offerte su Cardmarket ✔</p>'}`
    : `<p class="empty">Non hai ancora fatto un controllo.<br>Premi <b>Controlla adesso</b>: lo script legge le tue offerte su Cardmarket (con te collegato) e qui compaiono le differenze.</p>`}`;
  $('kNew').onclick = openStockCheck;
  if ($('kChips')) $('kChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; chkF.type = b.dataset.f; renderChk(); };
  $('main').querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const d = list[+b.dataset.a];
    if (d.type === 'miss' && !confirm(`Togliere ${d.l.u} ${info(d.l).name || ''} (×${d.l.q}) dalle carte in vendita del gestionale?\n\nFallo solo se su Cardmarket non è davvero in vendita.`)) return;
    chkApplyMany([d], d.type); });
  $('main').querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { const d = list[+b.dataset.cm]; openQtyEdit([{ k: d.k, qt: d.l.q }], 'controllo con Cardmarket', d.l.expName); });
  $('main').querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const d = list[+b.dataset.pm]; openPriceFix([d], 'controllo: più offerte a prezzi diversi'); });
  if ($('kAllPm')) $('kAllPm').onclick = () => { const sel = list.filter(d => d.type === 'multi' && d.l?.price != null);
    if (!confirm(`Lo script porterà su Cardmarket tutte le offerte di ${sel.length} carte al prezzo del gestionale (una sola cifra per carta). Confermi?`)) return;
    openPriceFix(sel, 'controllo: più offerte a prezzi diversi'); };
  if ($('kAllCm')) $('kAllCm').onclick = () => { const sel = list.filter(d => d.type === 'qty');
    if (!confirm(`Lo script porterà su Cardmarket le copie di ${sel.length} carte a quelle del gestionale. Confermi?`)) return;
    openQtyEdit(sel.map(d => ({ k: d.k, qt: d.l.q })), 'controllo con Cardmarket'); };
  if ($('kAll')) $('kAll').onclick = () => { const t = $('kAll').dataset.t, sel = list.filter(d => d.type === t);
    if (!confirm(`${$('kAll').textContent}?\n\nCambia solo il gestionale. Puoi tornare indietro con ↶ Annulla.`)) return;
    chkApplyMany(sel, t); };
}

// ---------- lista PDF per i clienti e lettura delle spunte da una foto ----------
// Il PDF ha 4 quadrati neri agli angoli (per raddrizzare la foto) e una striscia di 24 celle in alto:
// 16 bit = numero della lista (state.clists), 5 bit = pagina, 3 bit = controllo. Ogni riga ha una casella da spuntare
// e un riquadro "Prese" dove il cliente può scrivere quante ne vuole.
const CL = { M: 9, POS: [[8, 8], [193, 8], [193, 280], [8, 280]], BX: 42, BY: 10, BW: 4, BG: 1.2, Y0: 40, RH: 7.4, ROWS: 31, BOXX: 14, BOX: 5.5, PX: 178, PW: 18 };
const clCenter = i => [CL.POS[i][0] + CL.M / 2, CL.POS[i][1] + CL.M / 2];
const clRowY = r => CL.Y0 + r * CL.RH + (CL.RH - CL.BOX) / 2;
function clBits(id, page) {
  const chk = ((id & 15) + ((id >> 4) & 15) + ((id >> 8) & 15) + ((id >> 12) & 15) + page) & 7;
  const v = (id << 8) | (page << 3) | chk, b = [];
  for (let i = 23; i >= 0; i--) b.push((v >> i) & 1);
  return b;
}
function clUnbits(b) {
  const v = b.reduce((a, x) => a * 2 + x, 0), id = (v >> 8) & 0xffff, page = (v >> 3) & 31, chk = v & 7;
  return clBits(id, page).every((x, i) => x === b[i]) ? { id, page } : null;
}
const clHex = id => id.toString(16).toUpperCase().padStart(4, '0');

/** righe della lista: carte del set in vendita o in Standby, una per numero + variante + lingua */
function clRowsOfSet() {
  const rc = rarCache(selected), rows = [];
  for (const c of current.cards) {
    const n = norm(c.localId), g = {};
    (current.byNum[n] || []).forEach(([k, l]) => { const x = g[vcOf(l) + (l.lang || 'it')] = g[vcOf(l) + (l.lang || 'it')] || Object.assign({ u: l.u || c.localId, n: info(l).name || c.name, rev: !!l.rev, lang: l.lang || 'it', avail: 0, lk: '', sk: '' }, l.vp ? { vp: l.vp, vl: l.vl, vs: l.vs } : {}); x.avail += l.q; x.lk = k; });
    (current.sbByNum[n] || []).forEach(([k, s]) => { const x = g[vcOf(s) + (s.lang || 'it')] = g[vcOf(s) + (s.lang || 'it')] || Object.assign({ u: s.u || c.localId, n: c.name || s.n || '', rev: !!s.rev, lang: s.lang || 'it', avail: 0, lk: '', sk: '' }, s.vp ? { vp: s.vp, vl: s.vl } : {}); x.avail += s.q; x.sk = k; });
    Object.values(g).filter(x => x.avail > 0).sort((a, b) => !!a.vp - !!b.vp || a.rev - b.rev || a.lang.localeCompare(b.lang))
      .forEach(x => rows.push(Object.assign(x, { rar: rc[n] || c.rarity || '' })));
  }
  return rows;
}
async function pdfClients() {
  const rows = clRowsOfSet();
  if (!rows.length) { alert('In questo set non ci sono carte in vendita o in Standby.'); return; }
  let JsPDF;
  try { JsPDF = await pdfLib(); } catch (e) { alert('Non riesco a creare il PDF (serve internet): ' + e.message); return; }
  state.clists = state.clists || {};
  let id; do { id = 1 + Math.floor(Math.random() * 65534); } while (state.clists[id]);
  const pages = Math.ceil(rows.length / CL.ROWS);
  if (pages > 31) { alert('Il set ha troppe carte per una lista (massimo 31 pagine).'); return; }
  const d = new Date(), dt = d.toLocaleDateString('it-IT');
  const name = `Lista ${current.setName} del ${dt} (codice ${clHex(id)})`;
  state.clists[id] = { at: d.toISOString(), setId: selected, setName: current.setName, name, rows };
  // tengo le ultime 40 liste
  Object.keys(state.clists).sort((a, b) => new Date(state.clists[b].at) - new Date(state.clists[a].at)).slice(40).forEach(k => delete state.clists[k]);
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const ink = [24, 34, 58], mut = [104, 114, 134];
  for (let p = 0; p < pages; p++) {
    if (p) doc.addPage();
    doc.setFillColor(0, 0, 0);
    CL.POS.forEach(([x, y]) => doc.rect(x, y, CL.M, CL.M, 'F'));
    clBits(id, p).forEach((b, i) => { if (b) doc.rect(CL.BX + i * (CL.BW + CL.BG), CL.BY, CL.BW, CL.BW, 'F'); });
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(pdfT(current.setName), 24, 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...mut);
    doc.text(pdfT(`Carte disponibili al ${dt} · pagina ${p + 1} di ${pages} · codice ${clHex(id)}`), 24, 29);
    doc.text(pdfT('Segna con una X le carte che vuoi e scrivi nella colonna "Prese" quante copie.'), 24, 33.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('N°', 24, CL.Y0 - 1.5); doc.text('Carta', 38, CL.Y0 - 1.5); doc.text('Variante', 112, CL.Y0 - 1.5); doc.text(pdfT('Rarità'), 136, CL.Y0 - 1.5);
    doc.text('Disp.', 174, CL.Y0 - 1.5, { align: 'right' }); doc.text('Prese', CL.PX + CL.PW / 2, CL.Y0 - 1.5, { align: 'center' });
    rows.slice(p * CL.ROWS, (p + 1) * CL.ROWS).forEach((r, i) => {
      const yt = CL.Y0 + i * CL.RH, yb = clRowY(i), ym = yt + CL.RH / 2 + 1.2;
      doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.35); doc.rect(CL.BOXX, yb, CL.BOX, CL.BOX);
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2); doc.rect(CL.PX, yb, CL.PW, CL.BOX);
      doc.setDrawColor(225, 229, 236); doc.line(22, yt + CL.RH, CL.PX - 2, yt + CL.RH);
      doc.setTextColor(...ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text(pdfT(r.u), 24, ym);
      doc.setFont('helvetica', 'bold'); doc.text(pdfT(r.n).slice(0, 42), 38, ym);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(...(r.vp ? [150, 100, 0] : r.rev ? [124, 77, 204] : ink)); doc.text(pdfT(vLab(r) + (r.lang !== 'it' ? ' ' + r.lang.toUpperCase() : '')), 112, ym);
      doc.setTextColor(...mut); doc.text(pdfT(r.rar).slice(0, 22), 136, ym);
      doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(String(r.avail), 174, ym, { align: 'right' });
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...mut);
    doc.text(pdfT(`Lista ${clHex(id)} · pagina ${p + 1}/${pages}`), 105, 286, { align: 'center' });
  }
  logOp('dati', current.setName, `Creata la lista PDF per i clienti (codice ${clHex(id)}, ${rows.length} righe, ${rows.reduce((a, r) => a + r.avail, 0)} copie)`, null);
  softSave();
  doc.save(`${SavedListsName(current.setName)}_Lista-clienti_${clHex(id)}.pdf`);
}

// ---- lettura della foto ----
function clHomography(src, dst) {
  // src (mm sulla pagina) → dst (pixel nella foto), 4 coppie di punti
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}
async function clReadPhoto(file, forced) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    // soglia adattiva (ombre e luce non uniforme): scuro se più scuro del 18% rispetto alla media dei dintorni
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } }
    const R = Math.max(8, Math.round(Math.min(W, H) / 30)), B = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      B[y * W + x] = g[y * W + x] < m * 0.82 && g[y * W + x] < 170 ? 1 : 0;
    }
    // quadrati pieni: componenti connesse scure, quasi quadrate e piene
    const lab = new Int32Array(W * H), comps = [], st = [];
    for (let i = 0; i < W * H; i++) {
      if (!B[i] || lab[i]) continue;
      const c = { n: 0, sx: 0, sy: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1 }; lab[i] = comps.length + 1; st.push(i);
      while (st.length) {
        const j = st.pop(), x = j % W, y = (j / W) | 0;
        c.n++; c.sx += x; c.sy += y; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x > 0 && B[j - 1] && !lab[j - 1]) { lab[j - 1] = lab[i]; st.push(j - 1); }
        if (x < W - 1 && B[j + 1] && !lab[j + 1]) { lab[j + 1] = lab[i]; st.push(j + 1); }
        if (y > 0 && B[j - W] && !lab[j - W]) { lab[j - W] = lab[i]; st.push(j - W); }
        if (y < H - 1 && B[j + W] && !lab[j + W]) { lab[j + W] = lab[i]; st.push(j + W); }
      }
      comps.push(c);
    }
    const minS = Math.min(W, H) * 0.012, maxS = Math.min(W, H) * 0.12;
    let cand = comps.filter(c => { const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1; return bw >= minS && bh >= minS && bw <= maxS && bh <= maxS && bw / bh > 0.5 && bw / bh < 2 && c.n / (bw * bh) > 0.72; })
      .map(c => ({ x: c.sx / c.n, y: c.sy / c.n, a: c.n })).sort((a, b) => b.a - a.a);
    if (cand.length < 4) throw new Error('non trovo i quattro quadrati neri agli angoli del foglio: fotografa la pagina intera, dritta e ben illuminata');
    cand = cand.filter(c => c.a >= cand[0].a * 0.3);
    const pick = f => cand.reduce((a, c) => f(c) < f(a) ? c : a);
    const im = [pick(c => c.x + c.y), pick(c => -(c.x - c.y)), pick(c => -(c.x + c.y)), pick(c => c.x - c.y)];   // TL, TR, BR, BL nella foto
    if (new Set(im).size < 4) throw new Error('non trovo i quattro quadrati neri agli angoli del foglio: fotografa la pagina intera');
    const dark = (map, x, y) => { const [u, v] = map(x, y), i = Math.round(v) * W + Math.round(u); return u >= 0 && v >= 0 && u < W && v < H ? B[i] : 0; };
    const frac = (map, x, y, w, h, n) => { let s = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) s += dark(map, x + (a + 0.5) * w / n, y + (b + 0.5) * h / n); return s / (n * n); };
    // provo le 4 rotazioni del foglio: quella giusta ha il codice valido
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const map = clHomography([0, 1, 2, 3].map(clCenter), [0, 1, 2, 3].map(i => [im[(i + rot) % 4].x, im[(i + rot) % 4].y]));
      if (!map) continue;
      const bits = Array.from({ length: 24 }, (_, i) => frac(map, CL.BX + i * (CL.BW + CL.BG) + 0.8, CL.BY + 0.8, CL.BW - 1.6, CL.BW - 1.6, 5) > 0.5 ? 1 : 0);
      const code = clUnbits(bits);
      if (code && (state.clists || {})[code.id]) { best = { map, code }; break; }
      if (forced && !best && rot === 0) best = { map, code: null };
    }
    if (!best || (!best.code && !forced)) throw new Error('non riesco a leggere il codice della lista in alto: scegli tu lista e pagina');
    const code = best.code || forced, map = best.map, L = state.clists[code.id];
    if (!L) throw new Error('questa lista non è in questo gestionale (creata su un altro PC prima del backup?)');
    // per ogni riga: ritrovo la casella esatta (il foglio può essere un po' curvo) e misuro quanto è segnata
    const refine = (x, y, w, h) => {
      let bs = -1, bx = x, by = y;
      for (let dx = -1.6; dx <= 1.6; dx += 0.4) for (let dy = -1.6; dy <= 1.6; dy += 0.4) {
        let s = 0, n = 0;
        for (let t = 0; t <= 1; t += 1 / 16) { s += dark(map, x + dx + t * w, y + dy) + dark(map, x + dx + t * w, y + dy + h) + dark(map, x + dx, y + dy + t * h) + dark(map, x + dx + w, y + dy + t * h); n += 4; }
        if (s / n > bs) { bs = s / n; bx = x + dx; by = y + dy; }
      }
      return [bx, by];
    };
    const n0 = code.page * CL.ROWS, rows = L.rows.slice(n0, n0 + CL.ROWS).map((r, i) => {
      const [bx, by] = refine(CL.BOXX, clRowY(i), CL.BOX, CL.BOX), [qx, qy] = refine(CL.PX, clRowY(i), CL.PW, CL.BOX);
      return { i: n0 + i, f: frac(map, bx + 1.1, by + 1.1, CL.BOX - 2.2, CL.BOX - 2.2, 11), w: frac(map, qx + 1.2, qy + 1.1, CL.PW - 2.4, CL.BOX - 2.2, 13), box: [bx, by] };
    });
    const med = [...rows.map(r => r.f)].sort((a, b) => a - b)[rows.length >> 1] || 0;
    rows.forEach(r => { r.ticked = r.f > Math.max(0.07, med * 3 + 0.03); r.written = r.w > 0.05; });
    // anteprima: la foto con le caselle lette (verde = segnata)
    const pv = document.createElement('canvas'), ps = 520 / Math.max(W, H); pv.width = Math.round(W * ps); pv.height = Math.round(H * ps);
    const pc = pv.getContext('2d'); pc.drawImage(cv, 0, 0, pv.width, pv.height); pc.lineWidth = 2;
    rows.forEach(r => { const pts = [[0, 0], [CL.BOX, 0], [CL.BOX, CL.BOX], [0, CL.BOX]].map(([a, b]) => map(r.box[0] + a, r.box[1] + b));
      pc.strokeStyle = r.ticked || r.written ? '#1f8f55' : 'rgba(200,55,45,.5)'; pc.beginPath(); pts.forEach(([u, v], j) => j ? pc.lineTo(u * ps, v * ps) : pc.moveTo(u * ps, v * ps)); pc.closePath(); pc.stroke(); });
    return { id: code.id, page: code.page, rows, preview: pv.toDataURL('image/jpeg', 0.8) };
  } finally { URL.revokeObjectURL(url); }
}
function clPickPhotos() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = () => { if (inp.files.length) clFromPhotos([...inp.files]); };
  inp.click();
}
async function clFromPhotos(files, forced) {
  openDlg('<h3>Leggo le foto…</h3><p class="small">Cerco i quadrati agli angoli, il codice della lista e le caselle segnate.</p>');
  const res = [], errs = [];
  for (const f of files) { try { res.push(await clReadPhoto(f, forced)); } catch (e) { errs.push([f, e.message]); } }
  if (!res.length) {
    const ls = Object.entries(state.clists || {}).sort((a, b) => new Date(b[1].at) - new Date(a[1].at));
    openDlg(`<h3>Non riesco a leggere la foto</h3><p>${errs.map(([f, m]) => `<b>${esc(f.name)}</b>: ${esc(m)}`).join('<br>')}</p>
      ${ls.length && errs.some(([, m]) => /codice/.test(m)) ? `<p class="row">Lista <select id="clL">${ls.map(([id, L]) => `<option value="${id}">${esc(L.name)}</option>`).join('')}</select>
        pagina <input type="number" id="clP" min="1" value="1" style="width:64px"> <button class="pri" id="clRetry">Riprova con questa</button></p>` : ''}
      <p style="text-align:right"><button id="dClose">Chiudi</button></p>`, () => {
      $('dClose').onclick = closeDlg;
      if ($('clRetry')) $('clRetry').onclick = () => clFromPhotos(files, { id: +$('clL').value, page: Math.max(0, (+$('clP').value || 1) - 1) });
    });
    return;
  }
  clSaleDialog(res, errs);
}
function clSaleDialog(res, errs) {
  const id = res[0].id, L = state.clists[id], other = res.filter(r => r.id !== id);
  res = res.filter(r => r.id === id);
  const det = {}; res.forEach(r => r.rows.forEach(x => { if (x.ticked || x.written) det[x.i] = x; }));
  const pagesRead = [...new Set(res.map(r => r.page + 1))].sort((a, b) => a - b);
  // copie disponibili adesso (la lista può essere di qualche giorno fa)
  const nowAvail = r => (state.listings[r.lk]?.q || 0) + (state.standby?.[r.sk]?.q || 0);
  let showAll = false;
  const draw = () => {
    const idx = L.rows.map((r, i) => i).filter(i => showAll || det[i]);
    $('clBody').innerHTML = idx.map(i => { const r = L.rows[i], a = nowAvail(r);
      return `<tr data-i="${i}" class="${det[i] ? '' : 'mut'}"><td><input type="checkbox" class="clC" ${det[i] ? 'checked' : ''} ${a ? '' : 'disabled'}></td><td><b>${esc(r.u)}</b> ${esc(r.n)}</td>
        <td>${r.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale'}</td><td class="n">${a}${a !== r.avail ? ` <span class="small">(in lista ${r.avail})</span>` : ''}</td>
        <td class="n"><input type="number" class="clQ" min="1" max="${a}" placeholder="quante?" value="${det[i] && a === 1 ? 1 : ''}" style="width:72px"></td>
        <td class="small">${det[i] ? (det[i].ticked ? 'segnata' : '') + (det[i].written ? (det[i].ticked ? ' · ' : '') + 'numero scritto' : '') : ''}</td></tr>`; }).join('')
      || '<tr><td colspan="6" class="small">Nessuna casella segnata trovata. Premi "Mostra tutte le carte della lista" per sceglierle a mano.</td></tr>';
    sum();
  };
  const sel = () => [...$('clBody').querySelectorAll('tr[data-i]')].filter(tr => tr.querySelector('.clC').checked).map(tr => ({ i: +tr.dataset.i, q: parseInt(tr.querySelector('.clQ').value, 10) || 0 }));
  const sum = () => {
    const s = sel(), q = s.reduce((a, x) => a + x.q, 0), tot = parseFloat(String($('clTot').value).replace(',', '.'));
    const sw = $('clSw').checked;
    $('clTot').disabled = sw;
    $('clSum').innerHTML = `${s.length} carte · <b>${q}</b> copie` + (sw ? ' · scambio alla pari (0 €)' : !isNaN(tot) && q ? ` · <b>${eur(tot / q)}</b> a carta` : '') +
      (s.some(x => !x.q) ? ' · <b style="color:var(--var)">scrivi quante copie per ogni carta spuntata</b>' : '');
  };
  openDlg(`<h3>Vendita diretta · ${esc(L.setName)}</h3>
    <p class="small">${esc(L.name)} · pagine lette: ${pagesRead.join(', ')}${errs.length ? ` · <b style="color:var(--red)">${errs.length} foto non lette</b> (${errs.map(([f]) => esc(f.name)).join(', ')})` : ''}${other.length ? ` · <b style="color:var(--var)">${other.length} foto di un'altra lista ignorate</b>` : ''}</p>
    <div class="cl2"><div class="clPv">${res.map(r => `<img src="${r.preview}" alt="pagina ${r.page + 1}" title="pagina ${r.page + 1}: in verde le caselle lette come segnate">`).join('')}</div>
    <div><p class="small" style="margin-top:0">Controlla le carte trovate: la lettura della foto può sbagliare. Spunta o togli, e scrivi quante copie ha preso il cliente.</p>
      <div style="max-height:42vh;overflow:auto"><table class="rtable"><thead><tr><th></th><th>Carta</th><th>Variante</th><th class="n">Disp.</th><th class="n">Prese</th><th></th></tr></thead><tbody id="clBody"></tbody></table></div>
      <p><button class="lnk" id="clAll">Mostra tutte le carte della lista</button></p></div></div>
    <div class="clF"><label><input type="radio" name="clT" id="clSell" checked> Vendita · totale incassato <input type="text" id="clTot" inputmode="decimal" placeholder="es. 12,50" style="width:90px"> €</label>
      <label><input type="radio" name="clT" id="clSw"> Scambio alla pari (carte per la mia collezione)</label>
      <label>Cliente <input type="text" id="clWho" placeholder="facoltativo" style="width:160px"></label>
      <label><input type="checkbox" id="clCm" checked> Abbassa le copie anche su Cardmarket (script)</label></div>
    <p class="row" style="justify-content:space-between"><span class="small" id="clSum"></span><span><button id="dClose">Annulla</button> <button class="pri" id="clGo">Registra la vendita</button></span></p>`, () => {
    $('dClose').onclick = closeDlg;
    draw();
    $('clAll').onclick = () => { showAll = !showAll; $('clAll').textContent = showAll ? 'Mostra solo quelle segnate' : 'Mostra tutte le carte della lista'; const keep = sel(); draw();
      keep.forEach(x => { const tr = $('clBody').querySelector(`tr[data-i="${x.i}"]`); if (tr) { tr.querySelector('.clC').checked = true; tr.querySelector('.clQ').value = x.q || ''; } }); sum(); };
    $('dlgBody').addEventListener('input', sum); $('dlgBody').addEventListener('change', sum);
    $('clGo').onclick = () => {
      const s = sel(), sw = $('clSw').checked, tot = parseFloat(String($('clTot').value).replace(',', '.'));
      if (!s.length) { alert('Nessuna carta spuntata.'); return; }
      if (s.some(x => !x.q)) { alert('Scrivi quante copie ha preso il cliente per ogni carta spuntata.'); return; }
      const bad = s.find(x => x.q > nowAvail(L.rows[x.i]));
      if (bad) { alert(`${L.rows[bad.i].u} ${L.rows[bad.i].n}: ne hai solo ${nowAvail(L.rows[bad.i])}.`); return; }
      if (!sw && (isNaN(tot) || tot < 0)) { alert('Scrivi il totale incassato (oppure scegli "Scambio").'); return; }
      clRegister(L, s, sw ? null : tot, $('clWho').value.trim(), $('clCm').checked);
    };
  });
}
function clRegister(L, sel, tot, who, lowerCm) {
  const nq = sel.reduce((a, x) => a + x.q, 0), price = tot == null ? 0 : Math.round(tot / nq * 10000) / 10000;
  const d = new Date(), z = n => String(n).padStart(2, '0'), date = d.toISOString();
  const oid = `D${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}`;
  const ch = tot == null ? 'Scambio' : 'Cliente diretto', cm = [], txt = [];
  sel.forEach(({ i, q }) => {
    const r = L.rows[i];
    let left = q, sbTook = 0, took = 0, sbx = null;
    // prima dallo Standby (non è su Cardmarket), poi dalle carte in vendita
    const X = state.standby?.[r.sk];
    if (X && X.q > 0) { sbTook = Math.min(left, X.q); sbx = Object.assign({}, X, { q: 0 }); X.q -= sbTook; left -= sbTook; if (X.q <= 0) { delete state.standby[r.sk]; delete (state.sbMarket || {})[r.sk]; } }
    const Lst = state.listings[r.lk];
    let snap = null;
    if (left > 0 && Lst) { snap = Object.assign({}, Lst); took = Math.min(left, Lst.q); Lst.q -= took; left -= took; cm.push({ k: r.lk, l: snap, qt: Lst.q }); if (Lst.q <= 0) delete state.listings[r.lk]; }
    const base = Lst || snap;
    state.sold.push({ date, listed: base?.date || null, p: base?.p || null, exp: base?.exp || '', expName: base?.expName || L.setName, name: r.n, num: r.u, rev: r.rev, lang: r.lang, q,
      price, source: ch, file: L.name, order: oid, buyer: who, took, sbTook, sbk: sbTook ? r.sk : '', sbx, nolist: base ? 0 : 1, ...(r.vp ? { vp: r.vp, vl: r.vl, vs: r.vs } : {}) });
    txt.push(`${r.u}${r.rev ? ' R' : ''} ${r.n} ×${q}`);
  });
  state.orders = state.orders || {};
  state.orders[oid] = { at: today(), n: nq, date, buyer: who, ch, file: L.name, x: { tot: tot ?? 0 },
    items: sel.map(({ i, q }) => { const r = L.rows[i]; return { qty: q, name: r.n, num: r.u, lang: r.lang, cond: '', code: '', rar: r.rar, com: r.vp ? (r.vl || '') : r.rev ? 'Reverse Holo' : '', rev: r.rev, price }; }) };
  logOp('venduta', L.setName, `${ch === 'Scambio' ? 'Scambio alla pari' : 'Vendita diretta'}${who ? ' a ' + who : ''} (${L.name}): ${txt.join(', ')}${tot != null ? ` · totale ${eur(tot)} (${eur(price)} a carta)` : ''}`, nq);
  save(); closeDlg(); refresh();
  toast(`${ch === 'Scambio' ? 'Scambio' : 'Vendita'} registrato: ${nq} copie`);
  if (cm.length && lowerCm) setTimeout(() => {
    if (confirm(`${cm.length} ${cm.length === 1 ? 'carta era' : 'carte erano'} anche in vendita su Cardmarket.\n\nApro ora le tue offerte: con lo script (▶ Correggi le quantità) le copie scendono a quelle giuste. Procedo?`))
      openQtyEdit(cm, ch === 'Scambio' ? 'scambio alla pari' : 'vendita diretta', L.setName);
  }, 400);
}

// ---------- carte fuori mercato: il tuo prezzo è lontano dal Consigliato ----------
/** link ai dati della carta su TCGdex (italiano e inglese), per vedere cosa manca */
function tcgLinks(l) {
  const sid = lSid(l);
  const c = sid && ((tcgCached('/sets/' + sid)?.cards || []).find(x => norm(x.localId) === norm(l.u)) || (tcgCached('@en/sets/' + sid)?.cards || []).find(x => norm(x.localId) === norm(l.u)));
  if (!c) return '';
  return ` · <a href="${API}/cards/${encodeURIComponent(c.id)}" target="_blank" rel="noreferrer">dati TCGdex ↗</a> <a href="${API_EN}/cards/${encodeURIComponent(c.id)}" target="_blank" rel="noreferrer">(en ↗)</a>`;
}
const outF = { dir: '', set: '' };
function renderOut() {
  const setOf = l => l.expName || state.cm[l.exp]?.name || '?';
  const all = outAll(), t = thrCfg();
  const hi = all.filter(x => x.o.dir === 'hi'), lo = all.filter(x => x.o.dir === 'lo');
  const nList = Object.keys(state.listings).length;
  const noMkL = Object.entries(state.listings).map(([k, l]) => { const M = mOf(k);
    const why = !M ? 'prezzi di mercato non ancora letti: premi ⚙ → Prezzi di mercato → Aggiorna adesso' : (l.rev && !M.rv) ? 'TCGdex non ha i prezzi di mercato della Reverse (quelli della Normale non li uso)' : !consOf(M) ? 'TCGdex non ha prezzi di mercato per questa carta' : '';
    return { k, l, why }; }).filter(x => x.why), noMk = noMkL.length;
  const sets = [...new Set(all.map(x => setOf(x.l)))].sort((a, b) => a.localeCompare(b));
  if (outF.set && !sets.includes(outF.set)) outF.set = '';
  const list = all.filter(x => (!outF.dir || outF.dir === 'none' || x.o.dir === outF.dir) && (!outF.set || setOf(x.l) === outF.set))
    .sort((a, b) => Math.abs(b.o.pct) - Math.abs(a.o.pct));
  const cps = a => a.reduce((s, x) => s + x.l.q, 0);
  $('main').innerHTML = `<div class="sethead"><div><h2>Carte fuori mercato</h2>
    <div class="sub">Le tue carte in vendita il cui prezzo si allontana dal <b>Consigliato</b> di almeno ${t.c} cent. e del ${t.pct}% (soglia in Impostazioni).
    Troppo alte rischiano di restare ferme; troppo basse le stai svendendo.</div></div>
    <div class="row">${nList ? '<button id="oAll" title="Una nuova regola di prezzo per tutte le carte in vendita, di tutti i set">Cambia i prezzi di tutte le carte…</button>' : ''}${list.length ? `<button class="pri" id="oGo">Cambia questi prezzi su Cardmarket (${list.length})</button>` : ''}</div></div>
    <div class="figs"><div class="fig f-hi"><b>${hi.length}</b><span>troppo alte · ${cps(hi)} copie</span></div>
      <div class="fig f-lo"><b>${lo.length}</b><span>troppo basse · ${cps(lo)} copie</span></div>
      <div class="fig f-ok"><b>${nList - all.length - noMk}</b><span>in linea con il mercato</span></div>
      ${noMk ? `<button class="fig figbtn ${outF.dir === 'none' ? 'on' : ''}" id="oNone" title="Mostra quali carte"><b>${noMk}</b><span>senza Consigliato (manca il prezzo di mercato) · ${outF.dir === 'none' ? 'nascondi' : 'mostra quali'}</span></button>` : ''}</div>
    ${outF.dir === 'none' && noMk ? `<table class="rtable" style="margin-bottom:18px"><thead><tr><th>Carta senza Consigliato</th><th>Variante</th><th class="n">Qtà</th><th class="n">Tuo prezzo</th><th>Perché manca</th></tr></thead><tbody>
      ${noMkL.map(({ l, why }) => `<tr><td><b>${esc(setCode(l))}${esc(l.u)}</b> ${esc(info(l).name)}<small>${esc(setOf(l))}</small></td><td>${l.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale'}</td>
        <td class="n">${l.q}</td><td class="n">${eur(l.price) || '—'}</td><td class="small">${esc(why)}${tcgLinks(l)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${all.length ? `<div class="filters"><span class="chips" id="oChips">${[['', 'Tutte', all.length], ['hi', 'Troppo alte', hi.length], ['lo', 'Troppo basse', lo.length]].map(([f, l, n]) => `<button class="chip ${outF.dir === f ? 'on' : ''}" data-f="${f}">${l}<i>${n}</i></button>`).join('')}</span>
      <select id="oSet"><option value="">Tutti i set</option>${sets.map(x => `<option ${x === outF.set ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <table class="rtable"><thead><tr><th>Carta</th><th>Variante</th><th class="n">Qtà</th><th class="n">Tuo prezzo</th><th class="n">Da</th><th class="n">Tendenza</th><th class="n">Consigliato</th><th class="n">Scarto</th></tr></thead><tbody>
    ${list.map(({ l, o }) => `<tr><td><b>${esc(state.cm[l.exp]?.cards?.[l.p]?.c || '')}${esc(l.u)}</b> ${esc(info(l).name)}<small>${esc(setOf(l))}</small></td>
      <td>${l.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale'}</td><td class="n">${l.q}</td><td class="n"><b>${eur(l.price)}</b></td>
      <td class="n">${eur(o.M.lo) || '—'}</td><td class="n">${eur(o.M.t) || '—'}</td><td class="n"><b style="color:var(--ok)">${eur(o.cons)}</b></td>
      <td class="n"><span class="odir ${o.dir}">${o.dir === 'hi' ? '▲ +' : '▼ −'}${eur(Math.abs(o.d))} (${o.pct > 0 ? '+' : ''}${o.pct}%)</span></td></tr>`).join('')}
    </tbody></table>` : `<p class="empty">${nList ? (noMk === nList ? 'Mancano i prezzi di mercato: premi <b>⚙ → Prezzi di mercato → Aggiorna adesso</b>.' : 'Tutte le tue carte in vendita sono in linea con il Consigliato.') : 'Nessuna carta in vendita.'}</p>`}`;
  if ($('oChips')) $('oChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; outF.dir = b.dataset.f; renderOut(); };
  if ($('oNone')) $('oNone').onclick = () => { outF.dir = outF.dir === 'none' ? '' : 'none'; renderOut(); };
  if ($('oSet')) $('oSet').onchange = () => { outF.set = $('oSet').value; renderOut(); };
  if ($('oGo')) $('oGo').onclick = () => openPriceEdit(outF.set, { out: outF.dir || 'all' });
  if ($('oAll')) $('oAll').onclick = () => openPriceEdit('');
}

// ---------- registro delle operazioni ----------
// state.log = [{at, t: tipo, set, txt, q}] le più recenti in fondo, al massimo 3000
const LOGT = { standby: '📥 Standby', vendita: '🛒 In vendita', venduta: '💶 Venduta', prezzo: '✏️ Prezzo', quantita: '🔢 Quantità', tolta: '🗑 Tolta', riportata: '↩ In Standby', mercato: '⚠ Mercato', dati: '💾 Dati' };
/** 22/11: la prova delle varianti speciali (Supplementi) è stata tolta. Tolgo dai dati quello che aveva aggiunto:
 *  le copie speciali in Standby (questa versione le vedrebbe come normali), i riconoscimenti e l'elenco dei Supplementi. */
function cleanVariants() {
  const isSup = n => /:\s*(supplementi|additionals?)\s*$/i.test(String(n || ''));
  let changed = false;
  const gone = [];
  Object.entries(state.standby || {}).forEach(([k, x]) => { if (x && x.vx) { gone.push(`${x.u} ${x.n || ''} ×${x.q}`.trim()); delete state.standby[k]; delete (state.sbMarket || {})[k]; changed = true; } });
  Object.values(state.listings || {}).forEach(l => { if (l && 'vx' in l) { delete l.vx; changed = true; } });
  (state.sold || []).forEach(x => { if (x && 'vx' in x) { delete x.vx; changed = true; } });
  ['sup', 'cmx', 'pgTry'].forEach(f => { if (f in state) { delete state[f]; changed = true; } });
  // elenco dei Supplementi mandato per le varianti: lo tolgo se nessuna carta in vendita o venduta lo usa
  Object.entries(state.cm || {}).forEach(([id, E]) => {
    if (!isSup(E && E.name)) return;
    const used = Object.values(state.listings || {}).some(l => String(l.exp) === String(id)) || (state.sold || []).some(x => String(x.exp) === String(id));
    if (!used) { delete state.cm[id]; changed = true; }
  });
  if (!changed) return;
  logOp('dati', '', 'Tolta la prova delle varianti speciali (Supplementi)' + (gone.length ? `: tolte dallo Standby ${gone.join(', ')}` : ''), null);
  save();
  if (gone.length) setTimeout(() => toast(`Varianti speciali tolte: ${gone.length} ${gone.length === 1 ? 'carta speciale tolta' : 'carte speciali tolte'} dallo Standby (${gone.join(', ')})`), 600);
}
function logOp(t, set, txt, q) {
  const L = state.log || (state.log = []);
  L.push({ at: new Date().toISOString(), t, set: set || '', txt, q: q ?? null });
  undoNote(t, set, txt);
  if (L.length > 3000) L.splice(0, L.length - 3000);
}
const cardTxt = l => `${l.u} ${info(l).name || l.n || ''}${l.rev ? ' Reverse' : ''}`.trim();
const logF = { t: '', set: '', q: '' };
function renderLog() {
  const all = (state.log || []).slice().reverse();
  const sets = [...new Set(all.map(x => x.set).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const qq = simp(logF.q);
  const list = all.filter(x => (!logF.t || x.t === logF.t) && (!logF.set || x.set === logF.set) && (!qq || simp(x.txt + ' ' + x.set).includes(qq)));
  $('main').innerHTML = `<p style="margin:0 0 8px"><a href="#" id="logBack">← Impostazioni</a></p><div class="sethead"><div><h2>📜 Registro operazioni</h2>
    <div class="sub">Tutto quello che succede nel gestionale, con data e ora: carte in Standby, messe in vendita, vendute, tolte, prezzi e quantità cambiati, variazioni di mercato.</div></div>
    <div class="row"><button id="lgCsv">⬇ Esporta (CSV)</button></div></div>
    <div class="filters"><select id="lgT"><option value="">Tutte le operazioni</option>${Object.entries(LOGT).map(([k, v]) => `<option value="${k}" ${logF.t === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="lgS"><option value="">Tutti i set</option>${sets.map(x => `<option ${x === logF.set ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <input type="search" id="lgQ" placeholder="Cerca (carta, lista, ordine…)" value="${esc(logF.q)}"><span class="small">${list.length} operazioni</span></div>
    ${list.length ? `<table class="rtable"><thead><tr><th>Data e ora</th><th>Operazione</th><th>Set</th><th>Dettagli</th><th class="n">Copie</th></tr></thead><tbody>
    ${list.slice(0, 1500).map(x => `<tr><td style="white-space:nowrap">${fmtDT(x.at)}</td><td style="white-space:nowrap">${LOGT[x.t] || esc(x.t)}</td><td>${esc(x.set)}</td><td>${esc(x.txt)}</td><td class="n">${x.q ?? ''}</td></tr>`).join('')}
    </tbody></table>${list.length > 1500 ? '<p class="small">Mostrate le 1500 più recenti: usa i filtri o esporta il CSV.</p>' : ''}` : '<p class="empty">Nessuna operazione registrata (il registro parte da ora).</p>'}`;
  $('lgT').onchange = () => { logF.t = $('lgT').value; renderLog(); };
  $('lgS').onchange = () => { logF.set = $('lgS').value; renderLog(); };
  $('lgQ').oninput = () => { logF.q = $('lgQ').value; clearTimeout(renderLog.t); renderLog.t = setTimeout(() => { renderLog(); const q = $('lgQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); };
  $('lgCsv').onclick = () => downloadCsv(`registro-operazioni-${new Date().toISOString().slice(0, 10)}.csv`,
    [['Data e ora', 'Operazione', 'Set', 'Dettagli', 'Copie']].concat(list.map(x => [new Date(x.at).toLocaleString('it-IT'), (LOGT[x.t] || x.t).replace(/^\S+\s/, ''), x.set, x.txt, x.q ?? ''])));
  $('logBack').onclick = e => { e.preventDefault(); goTab('__set'); };
}

// ---------- annulla / ripeti: ultime 20 operazioni, anche dopo aver chiuso il gestionale ----------
// Ogni save() che segue un'operazione dell'utente (registrata con logOp) diventa un punto di annullamento:
// tengo lo stato di PRIMA. Prezzi di mercato, storico prezzi, catalogo e registro non si annullano.
const UNDO_MAX = 20, UNDO_T = new Set(['standby', 'vendita', 'venduta', 'prezzo', 'quantita', 'tolta', 'riportata', 'dati']);
const UNDO_KEEP = ['log', 'market', 'sbMarket', 'pg', 'hist', 'cm', 'revAt', 'pgAuto'];
let undoStack = [], redoStack = [], undoLast = null, undoPending = [], undoBusy = false, undoSaveT = null;
function undoNote(t, set, txt) { if (!undoBusy) undoPending.push({ t, set, txt }); }
function undoRecord(js) {
  const ops = undoPending.filter(o => UNDO_T.has(o.t)); undoPending = [];
  if (undoLast != null && js !== undoLast && ops.length && !undoBusy) {
    const sets = [...new Set(ops.map(o => o.set).filter(Boolean))];
    const label = ops.length === 1 ? ops[0].txt : `${ops.length} operazioni: ${ops[0].txt}`;
    undoStack.push({ at: new Date().toISOString(), label: label.length > 140 ? label.slice(0, 137) + '…' : label, set: sets.join(', '), types: [...new Set(ops.map(o => o.t))], before: undoSlim(undoLast) });
    if (undoStack.length > UNDO_MAX) undoStack.splice(0, undoStack.length - UNDO_MAX);
    redoStack = [];
    undoPersist();
  }
  undoLast = js;
  undoShow();
}
/** stato da tenere in un punto di annullamento: senza catalogo, storico prezzi, registro e Price Guide (restano quelli attuali) */
function undoSlim(js) {
  try { const o = JSON.parse(js); ['log', 'pg', 'hist', 'cm'].forEach(k => delete o[k]); return JSON.stringify(o); } catch (e) { return js; }
}
function undoApply(js) {
  const s = JSON.parse(js), cur = state;
  const n = Object.assign({ cm: {}, sold: [], standby: {} }, s);
  UNDO_KEEP.forEach(k => { if (cur[k] !== undefined) n[k] = cur[k]; });
  n.market = Object.assign({}, s.market || {}, cur.market || {});
  n.sbMarket = Object.assign({}, s.sbMarket || {}, cur.sbMarket || {});
  state = n;
}
/** l'operazione ha toccato anche Cardmarket? (l'annullamento cambia solo il gestionale) */
const undoCm = e => e.types.includes('vendita') || /script|Cardmarket/i.test(e.label);
function undoDo(steps = 1) {
  if (!undoStack.length) return;
  let last = null;
  undoBusy = true;
  for (let i = 0; i < steps && undoStack.length; i++) {
    const e = undoStack.pop();
    const after = undoSlim(JSON.stringify(state));
    undoApply(e.before);
    redoStack.push(Object.assign({}, e, { after, before: undefined }));
    logOp('dati', e.set, `Annullato: ${e.label}`);
    last = e;
    if (undoCm(e)) last.cm = true;
  }
  save(); undoBusy = false; undoPersist(); refresh();
  toast(`↶ Annullato: ${last.label}${steps > 1 ? ` (e altre ${steps - 1})` : ''}`);
  if (last.cm || redoStack.slice(-steps).some(undoCm)) alert('Annullato nel gestionale.\n\nAttenzione: su Cardmarket non cambia nulla. Se l\'operazione aveva messo in vendita carte o cambiato prezzi su Cardmarket, lì restano come sono: sistemale a mano o con lo script.');
}
function redoDo() {
  if (!redoStack.length) return;
  const e = redoStack.pop();
  undoBusy = true;
  const before = undoSlim(JSON.stringify(state));
  undoApply(e.after);
  undoStack.push(Object.assign({}, e, { before, after: undefined }));
  logOp('dati', e.set, `Ripetuto: ${e.label}`);
  save(); undoBusy = false; undoPersist(); refresh();
  toast(`↷ Ripetuto: ${e.label}`);
}
function undoDb(op, val) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('gestionaleUndo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const st = r.result.transaction('h', op === 'get' ? 'readonly' : 'readwrite').objectStore('h');
      const x = op === 'get' ? st.get('stack') : st.put(val, 'stack');
      x.onsuccess = () => res(x.result); x.onerror = () => rej(x.error);
    };
  });
}
function undoPersist() { clearTimeout(undoSaveT); undoSaveT = setTimeout(() => undoDb('put', { undo: undoStack, redo: redoStack }).catch(() => {}), 800); }
async function undoInit() {
  try {
    const d = await undoDb('get');
    if (d && Array.isArray(d.undo)) { undoStack = d.undo.concat(undoStack).slice(-UNDO_MAX); if (!redoStack.length) redoStack = d.redo || []; }
  } catch (e) {}
  undoShow();
}
function undoShow() {
  const m = $('undoMenu'); if (!m) return;
  const u = undoStack, r = redoStack;
  m.classList.toggle('off', !u.length && !r.length);
  $('undoSum').title = u.length ? 'Annulla: ' + u[u.length - 1].label : 'Niente da annullare';
  const when = d => new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  $('undoList').innerHTML = (u.length ? `<button data-u="1"><b>↶ Annulla l'ultima</b><small>${esc(u[u.length - 1].label)} · ${when(u[u.length - 1].at)}</small></button>` : '<div class="small" style="padding:8px 12px">Niente da annullare.</div>')
    + (r.length ? `<button data-r="1"><b>↷ Ripeti</b><small>${esc(r[r.length - 1].label)}</small></button>` : '')
    + (u.length > 1 ? `<div class="mh">Torna a prima di…</div>` + u.slice(0, -1).map((e, i) => [e, u.length - i]).reverse().map(([e, steps]) =>
      `<button data-u="${steps}"><b>${esc(e.label)}</b><small>${when(e.at)}${e.set ? ' · ' + esc(e.set) : ''} · annulla ${steps} operazioni</small></button>`).join('') : '')
    + '<div class="small" style="padding:8px 12px;border-top:1px solid var(--line)">Annulla cambia solo il gestionale, non Cardmarket. Anche Ctrl+Z / Ctrl+Y.</div>';
}
// ---------- ricerca in tutto il gestionale (barra blu in alto) ----------
const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const gsWords = t => fold(t).replace(/€/g, ' ').split(/[\s/·|()\[\]"]+/).map(w => w.replace(/^[^\w]+|[^\w,.]+$/g, '').replace(/\.$/, '')).filter(Boolean);
/** tutte le cose cercabili: carte in vendita, Standby, vendute, altre carte dei miei set, set */
function gsIndex() {
  const out = [], seen = new Set(), typ = {}, sg = {};
  const sigOf = (sid, name) => sid in sg ? sg[sid] : (sg[sid] = siglaOf(sid, name) || '');
  const typOf = (sid, u) => { if (!sid || String(sid).startsWith('cm:')) return ''; const T = typ[sid] || (typ[sid] = typCache(sid)); return T[norm(u)] || ''; };
  const numW = u => { const n = String(u || ''); return /^\d+$/.test(n) ? [n, String(parseInt(n, 10))] : [n]; };
  for (const [k, l] of Object.entries(state.listings)) {
    const sid = lSid(l) || ('cm:' + l.exp), I = info(l), code = String(setCode(l) || '');
    seen.add(sid + '|' + norm(l.u));
    out.push({ sec: 'v', sid, u: l.u, name: I.name, code, set: I.set, rev: l.rev, lang: l.lang,
      sub: [I.set, I.rar !== 'Non indicata' ? I.rar : '', LANGN[l.lang] && l.lang !== 'it' ? LANGN[l.lang] : ''].filter(Boolean).join(' · '),
      right: `${l.q} × ${eur(l.price) || '—'}`, st: ['v', 'In vendita'],
      hay: [...numW(l.u), code, code + String(l.u || '').padStart(3, '0'), I.name, I.set, I.rar, l.rev ? 'reverse holo rev' : 'normale', LANGN[l.lang], 'in vendita', eur(l.price).replace(' €', ''), l.com, typOf(sid, l.u), state.cm[l.exp]?.cards?.[l.p]?.n].join(' ') });
  }
  for (const [k, x] of Object.entries(state.standby || {})) {
    const code = sigOf(x.s, x.sn);
    seen.add(x.s + '|' + norm(x.u));
    out.push({ sec: 's', sid: x.s, u: x.u, name: x.n, code, set: x.sn, rev: x.rev, lang: x.lang,
      sub: [x.sn, rarIt(x.r), x.file ? 'da ' + x.file : ''].filter(Boolean).join(' · '), right: `${x.q} ${x.q === 1 ? "copia" : "copie"}`, st: ['s', 'Standby'],
      hay: [...numW(x.u), code, code + String(x.u || '').padStart(3, '0'), x.n, x.sn, rarIt(x.r), x.rev ? 'reverse holo rev' : 'normale', LANGN[x.lang], 'standby', x.com, x.file, typOf(x.s, x.u)].join(' ') });
  }
  state.sold.forEach(x => {
    const sn = x.expName || state.cm[x.exp]?.name || '', sid = x.vs || tcgIdFor(sn) || (x.exp ? 'cm:' + x.exp : null);
    out.push({ sec: 'x', sid, u: x.num, name: x.name, code: '', set: sn, rev: x.rev, order: x.order,
      sub: [fmtD(x.date), sn, x.buyer || '', x.order ? '#' + x.order : '', x.source || ''].filter(Boolean).join(' · '),
      right: `${x.q} × ${eur(x.price) || '—'}`, st: ['x', 'Venduta'],
      hay: [...numW(x.num), x.name, sn, x.rev ? 'reverse holo rev' : 'normale', LANGN[x.lang], 'venduta vendite venduto', x.buyer, x.order, x.source, fmtD(x.date), eur(x.price).replace(' €', ''), typOf(sid, x.num)].join(' ') });
  });
  // altre carte dei set che conosco dal catalogo di Cardmarket (non le ho)
  Object.values(state.cm).forEach(E => {
    const sid = tcgIdFor(E.name) || ('cm:' + E.id);
    Object.values(E.cards || {}).forEach(c => {
      if (!c.u || seen.has(sid + '|' + norm(c.u))) return;
      seen.add(sid + '|' + norm(c.u));
      out.push({ sec: 'k', sid, u: c.u, name: c.n, code: String(c.c || ''), set: E.name, sub: [E.name, rarIt(c.r)].filter(Boolean).join(' · '), right: '', st: ['k', 'Non ce l\'hai'],
        hay: [...numW(c.u), c.c, String(c.c || '') + String(c.u).padStart(3, '0'), c.n, E.name, rarIt(c.r), typOf(sid, c.u)].join(' ') });
    });
  });
  tcgSets.forEach(x => { const c = x.id in sg ? sg[x.id] : (state.codes?.[x.id] || ''); out.push({ sec: 'set', sid: x.id, name: x.name, code: c, sub: '', right: '', hay: [x.name, x.id, c, 'set espansione'].join(' ') }); });
  out.forEach(o => { o.w = gsWords(o.hay); });
  return out;
}
let gsCache = null, gsAt = 0, gsSel = 0, gsShown = [];
function gsMatch(o, toks) {
  return toks.every(t => {
    const tn = t.replace('.', ','), dig = /^\d+$/.test(t);
    return o.w.some(w => w.startsWith(tn) || (dig && /^\d+$/.test(w) && +w === +t));
  });
}
function gsRun() {
  const q = $('gQ').value.trim(), box = $('gRes');
  if (!q) { box.hidden = true; return; }
  if (!gsCache || Date.now() - gsAt > 4000) { gsCache = gsIndex(); gsAt = Date.now(); }
  const toks = gsWords(q);
  const hits = gsCache.filter(o => gsMatch(o, toks));
  const SEC = [['v', 'In vendita'], ['s', 'In Standby'], ['x', 'Vendute'], ['k', 'Altre carte dei tuoi set'], ['set', 'Set']];
  gsShown = []; let h = '';
  SEC.forEach(([sec, title]) => {
    let a = hits.filter(o => o.sec === sec);
    if (!a.length) return;
    // prima i nomi che iniziano con la ricerca, poi per numero
    const t0 = toks[0];
    a.sort((x, y) => (fold(y.name).startsWith(t0) - fold(x.name).startsWith(t0)) || String(x.set).localeCompare(String(y.set)) || (parseInt(x.u, 10) || 0) - (parseInt(y.u, 10) || 0));
    const max = sec === 'k' || sec === 'set' ? 6 : 12;
    h += `<h6><span>${title}</span><span>${a.length}</span></h6>`;
    a.slice(0, max).forEach(o => {
      const i = gsShown.push(o) - 1;
      const cd = o.sec === 'set' ? (o.code || '') : `${o.code ? o.code + ' ' : ''}${o.u || ''}`;
      h += `<div class="gi" data-i="${i}"><span class="c">${esc(cd)}</span><span class="n"><b>${esc(o.name || '—')}${o.rev ? ' <span class="rv">Reverse</span>' : ''}</b><small>${esc(o.sub || '')}</small></span>
        <span class="r">${esc(o.right || '')}${o.st ? `<span class="st ${o.st[0]}">${o.st[1]}</span>` : ''}</span></div>`;
    });
    if (a.length > max) h += `<div class="more">e altre ${a.length - max}: scrivi qualcosa in più per restringere (es. il set o il numero)</div>`;
  });
  box.innerHTML = (h || `<div class="none">Nessun risultato per "${esc(q)}".</div>`) +
    '<div class="tip">Puoi unire più parole: <b>pikachu 25</b>, <b>reverse rara 30c</b>, <b>fuoco standby</b>, <b>venduta mario</b>, <b>0,32</b>. Invio apre il primo risultato.</div>';
  box.hidden = false;
  gsSel = 0; gsMark();
}
function gsMark() { $('gRes').querySelectorAll('.gi').forEach(e => e.classList.toggle('on', +e.dataset.i === gsSel)); $('gRes').querySelector('.gi.on')?.scrollIntoView({ block: 'nearest' }); }
async function gsOpen(o) {
  $('gRes').hidden = true; $('gQ').blur();
  if (o.sec === 'set') { selected = o.sid; renderSets(); await renderSet(); $('main').scrollTop = 0; return; }
  if (o.sec === 'x') {
    goTab('__sales');
    const tr = o.order && document.querySelector(`tr.ord[data-o="${CSS.escape('o' + o.order)}"]`);
    if (tr) { tr.click(); tr.scrollIntoView({ block: 'center' }); tr.style.background = '#fff6d6'; setTimeout(() => { tr.style.background = ''; }, 2500); }
    return;
  }
  if (!o.sid) return;
  selected = o.sid; renderSets(); await renderSet();
  const el = document.querySelector(`.card[data-n="${CSS.escape(norm(o.u))}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
}
let gsT = null, gsTypesLoaded = false;
$('gQ').addEventListener('input', () => { clearTimeout(gsT); gsT = setTimeout(gsRun, 120); });
$('gQ').addEventListener('focus', () => { gsCache = null; if ($('gQ').value.trim()) gsRun(); if (!gsTypesLoaded) { gsTypesLoaded = true; loadOwnedTypes(); } });
$('gQ').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); gsSel = Math.min(gsShown.length - 1, gsSel + 1); gsMark(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); gsSel = Math.max(0, gsSel - 1); gsMark(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (gsShown[gsSel]) gsOpen(gsShown[gsSel]); }
  else if (e.key === 'Escape') { $('gQ').value = ''; $('gRes').hidden = true; $('gQ').blur(); }
});
$('gRes').addEventListener('mousedown', e => { const g = e.target.closest('.gi'); if (g) { e.preventDefault(); gsOpen(gsShown[+g.dataset.i]); } });
document.addEventListener('mousedown', e => { if (!e.target.closest('#gs')) $('gRes').hidden = true; });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !$('dlg').open) { e.preventDefault(); $('gQ').focus(); $('gQ').select(); }
});
/** tipo/categoria delle carte che ho (in vendita e Standby), scaricati in sottofondo per la ricerca */
async function loadOwnedTypes() {
  const want = {};
  Object.entries(listingsBySet()).forEach(([sid, a]) => a.forEach(([, l]) => (want[sid] = want[sid] || new Set()).add(l.u)));
  Object.values(state.standby || {}).forEach(x => (want[x.s] = want[x.s] || new Set()).add(x.u));
  for (const [sid, us] of Object.entries(want)) {
    if (!sid || sid.startsWith('cm:')) continue;
    const T = typCache(sid), S = await tcg('/sets/' + encodeURIComponent(sid), 24 * 7);
    const todo = [...us].filter(u => !(norm(u) in T));
    if (!todo.length || !S || !Array.isArray(S.cards)) continue;
    let i = 0;
    const worker = async () => { while (i < todo.length) { const u = todo[i++]; const c = S.cards.find(x => norm(x.localId) === norm(u)); if (!c) continue;
      const d = await tcg('/cards/' + encodeURIComponent(c.id), 0, true); if (d) T[norm(u)] = typStr(d); } };
    await Promise.all([1, 2, 3, 4].map(worker));
    try { localStorage.setItem(TKEY(sid), JSON.stringify(T)); } catch (e) {}
    gsCache = null;
  }
  if ($('gQ').value.trim() && !$('gRes').hidden) gsRun();
}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || $('dlg').open) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undoDo(1); }
  else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redoDo(); }
});

// ---------- azioni su più carte del set + annulla ----------
function showUndo(msg) {
  document.querySelectorAll('.undobar').forEach(x => x.remove());
  const b = document.createElement('div');
  b.className = 'undobar';
  b.innerHTML = `<span>${esc(msg)}</span><button>↶ Annulla</button>`;
  b.querySelector('button').onclick = () => { b.remove(); undoDo(1); };
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 60000);
}
function bulkAction(kind, sid, setName) {
  if (!sel.size) { alert('Seleziona prima le carte (tocca le carte, oppure "Seleziona tutte quelle visibili").'); return; }
  const inSet = ([, l]) => sel.has(norm(l.u));
  const ls = (listingsBySet()[selected] || []).filter(inSet);
  const sb = Object.entries(state.standby || {}).filter(([, x]) => x.s === selected).filter(inSet);
  const src = kind === 'delSb' ? sb : ls;
  const what = { del: 'Togli dalla vendita', toSb: 'Riporta in Standby', delSb: 'Togli dallo Standby' }[kind];
  if (!src.length) { alert(kind === 'delSb' ? 'Le carte selezionate non hanno copie in Standby.' : 'Le carte selezionate non hanno copie in vendita.'); return; }
  const isV = (x, v) => v === 'all' || (v === 'X' ? !!x.vp : v === 'R' ? (!x.vp && !!x.rev) : (!x.vp && !x.rev));
  const count = v => src.filter(([, x]) => isV(x, v)).reduce((a, [, x]) => a + x.q, 0);
  openDlg(`<h3>${what} · ${esc(setName)}</h3>
    <p>${sel.size} carte selezionate. Quali varianti?</p>
    <p class="row"><label><input type="radio" name="bv" value="all" checked> ${count('X') ? 'Tutte le varianti' : 'Normali e Reverse'} (${count('all')} copie)</label>
      <label><input type="radio" name="bv" value="N"> Solo Normali (${count('N')})</label>
      <label><input type="radio" name="bv" value="R"> Solo Reverse (${count('R')})</label>${count('X') ? `
      <label><input type="radio" name="bv" value="X"> Solo varianti speciali (${count('X')})</label>` : ''}</p>
    <p class="small">${kind === 'del' ? 'Le copie spariscono dal magazzino vendite del gestionale (non vengono contate come vendute). Su Cardmarket toglile tu.'
      : kind === 'toSb' ? 'Le copie tornano in Standby, pronte per essere ricaricate su Cardmarket con "Metti in vendita su Cardmarket". Su Cardmarket toglile tu.'
      : 'Le copie spariscono dallo Standby.'} Subito dopo puoi premere <b>↶ Annulla</b>.</p>
    <p class="row" style="justify-content:flex-end"><button id="dClose">Annulla</button><button class="pri danger" id="bGo">${what}</button></p>`, () => {
    $('dClose').onclick = closeDlg;
    $('bGo').onclick = () => {
      const v = document.querySelector('input[name="bv"]:checked').value;
      const pick = src.filter(([, x]) => isV(x, v));
      if (!pick.length) { alert('Nessuna copia con questa variante.'); return; }
      let n = 0;
      pick.forEach(([k, x]) => {
        n += x.q;
        if (kind === 'delSb') { delete state.standby[k]; delete (state.sbMarket || {})[k]; return; }
        if (kind === 'toSb') {
          state.standby = state.standby || {};
          const sk = sbKey(sid, x.u, x.rev, x.lang || 'it', x.vp);
          const X = state.standby[sk] || (state.standby[sk] = { s: sid, sn: setName, u: x.u, rev: !!x.rev, lang: x.lang || 'it', q: 0, n: info(x).name || '', r: info(x).rar || '', com: x.com || '', date: today(), file: 'dal magazzino vendite' });
          X.q += x.q;
          if (x.vp) Object.assign(X, { rev: false, vp: x.vp, vl: x.vl, vb: x.vb });
        }
        delete state.listings[k]; delete (state.market || {})[k];
      });
      logOp(kind === 'toSb' ? 'riportata' : 'tolta', setName, `${what}${v === 'all' ? '' : v === 'R' ? ' (solo Reverse)' : v === 'X' ? ' (solo varianti speciali)' : ' (solo Normali)'}: ` + pick.map(([, x]) => `${x.u}${vTag(x)} ×${x.q}`).join(', '), n);
      save(); closeDlg();
      sel.clear(); selMode = false;
      refresh();
      showUndo(`${what}: ${n} copie di ${setName}`);
      if (kind === 'toSb') updatePrices(false);
    };
  });
}

/** rarità presenti nella griglia (si aggiornano mentre arrivano da TCGdex) */
function cfRarOptions() {
  const sel = $('cfRar'); if (!sel) return;
  const cnt = {};
  document.querySelectorAll('.grid .card .rar').forEach(r => { const t = r.textContent.trim(); if (t) cnt[t] = (cnt[t] || 0) + 1; });
  const keys = Object.keys(cnt).sort((a, b) => a.localeCompare(b));
  if (cf.rar && !keys.includes(cf.rar)) keys.unshift(cf.rar);
  sel.innerHTML = '<option value="">Tutte</option>' + keys.map(k => `<option ${k === cf.rar ? 'selected' : ''} value="${esc(k)}">${esc(k)}${cnt[k] ? ` (${cnt[k]})` : ''}</option>`).join('');
}
/** riordina le carte della griglia */
function cfSort() {
  const g = document.querySelector('.grid'); if (!g) return;
  const els = [...g.querySelectorAll('.card')];
  const num = el => { const n = parseInt(el.dataset.n, 10); return isNaN(n) ? 99999 : n; };
  const v = (el, k) => el.dataset[k] === '' ? null : +el.dataset[k];
  const desc = k => (a, b) => (v(b, k) ?? -1) - (v(a, k) ?? -1) || num(a) - num(b);
  const cmp = { num: (a, b) => num(a) - num(b) || a.dataset.n.localeCompare(b.dataset.n), name: (a, b) => a.dataset.nm.localeCompare(b.dataset.nm, 'it') || num(a) - num(b),
    pd: desc('p'), pa: (a, b) => (v(a, 'p') ?? 1e9) - (v(b, 'p') ?? 1e9) || num(a) - num(b), val: desc('v'), q: desc('q'), days: desc('d') }[cf.sort] || ((a, b) => num(a) - num(b));
  els.sort(cmp).forEach(el => g.appendChild(el));
}
function applyCardFilter() {
  const t = filterText.trim().toLowerCase();
  document.querySelectorAll('.card').forEach(el => {
    let ok = !t || el.dataset.s.includes(t);
    if (filter === 'yes') ok = ok && el.classList.contains('yes');
    if (filter === 'sb') ok = ok && el.classList.contains('hassb');
    if (filter === 'var') ok = ok && el.classList.contains('vr');
    if (filter === 'no') ok = ok && el.classList.contains('no');
    if (filter === 'rev') ok = ok && el.classList.contains('r');
    if (filter === 'vx') ok = ok && el.classList.contains('x');
    if (filter === 'wr') ok = ok && el.classList.contains('wr');
    if (cf.rar) ok = ok && (el.querySelector('.rar')?.textContent.trim() || '') === cf.rar;
    const pr = el.dataset.p === '' || el.dataset.p == null ? null : +el.dataset.p;
    const mn = parseFloat(String(cf.pmin).replace(',', '.')), mx = parseFloat(String(cf.pmax).replace(',', '.'));
    if (!isNaN(mn)) ok = ok && pr != null && pr >= mn - 1e-9;
    if (!isNaN(mx)) ok = ok && pr != null && pr <= mx + 1e-9;
    if (cf.q) ok = ok && (cf.q === '1' ? +el.dataset.q === 1 : +el.dataset.q >= +cf.q);
    el.classList.toggle('hide', !ok);
  });
  const all = document.querySelectorAll('.grid .card'), vis = document.querySelectorAll('.grid .card:not(.hide)');
  const active = cf.rar || cf.pmin !== '' || cf.pmax !== '' || cf.q || cf.sort !== 'num';
  if ($('cfInfo')) { $('cfInfo').textContent = vis.length < all.length ? `${vis.length} di ${all.length} carte` : ''; $('cfReset').style.display = active || filter !== 'all' || filterText ? '' : 'none'; }
}
// dettaglio carta
$('main').addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (!el || !current) return;
  if (selMode) {
    if (el.classList.contains('no')) return;            // carta che non ho: niente da selezionare
    const n = el.dataset.n;
    if (sel.has(n)) sel.delete(n); else sel.add(n);
    el.classList.toggle('sel', sel.has(n));
    if ($('selN')) $('selN').textContent = `${sel.size} carte selezionate`;
    return;
  }
  const n0 = el.dataset.n;
  const c = current.cards.find(x => norm(x.localId) === n0);
  const cm = current.cmByNum[n0];
  const ls = current.byNum[n0] || [], sb = current.sbByNum[n0] || [];
  const srcs = imgSrcs(c.image, cm, c.localId);
  const vs = ls.map(([k, l]) => ({ k, l, v: varOf(k, l) })).filter(x => x.v);
  // vendite di questa carta (stesso set e numero)
  const soldHere = state.sold.filter(s => { const sn = s.expName || state.cm[s.exp]?.name || ''; return norm(s.num) === n0 && (simp(sn) === simp(current.setName) || (!selected.startsWith('cm:') && (s.vs || tcgIdFor(sn)) === selected)); });
  const qSold = soldHere.reduce((a, s) => a + s.q, 0), inc = soldHere.reduce((a, s) => a + (s.price || 0) * s.q, 0);
  const qLs = ls.reduce((a, [, l]) => a + l.q, 0), qSb = sb.reduce((a, [, x]) => a + x.q, 0);
  const since = ls.map(([, l]) => l.date).filter(Boolean).sort()[0];
  const lastSold = soldHere.map(s => s.date).sort().pop();
  const src = M => M ? `${M.src === 'pg' ? 'Price Guide' : M.src === 'tcgdex' ? 'TCGdex' : 'nessun dato'}${M.upd ? ' · ' + fmtD(M.upd) : ''}${M.x ? ' · ⚠ abbinamento da verificare' : ''}` : '';
  /** i 6 valori in una riga + barra con la posizione del tuo prezzo tra il più basso e il più alto */
  const market = (M, price, rev) => {
    if (!M) return '<p class="cd-none">Prezzi di mercato non ancora letti: premi ⚙ → Prezzi di mercato → Aggiorna adesso.</p>';
    if (rev && !M.rv) return '<p class="cd-none">Mancano i prezzi di mercato della Reverse (quelli della Normale non li uso).</p>';
    const L = [['Da', M.lo], ['Tendenza', M.t], ['Media', M.a], ['1 g', M.a1], ['7 g', M.a7], ['30 g', M.a30]];
    const C = consOf(M);
    let bar = '';
    const pts = [M.lo, M.t, M.a, M.a7, M.a30, price, C?.v].filter(v => v != null && isFinite(v));
    if (C && pts.length > 1) {
      const lo = Math.min(...pts), hi = Math.max(...pts), X = v => hi > lo ? ((v - lo) / (hi - lo) * 100).toFixed(1) : 50;
      const same = price != null && r2(price) === C.v;
      bar = `<div class="cd-range"><div class="trk"></div>
        <span class="mk m-c" style="left:${X(C.v)}%"></span>${price != null && !same ? `<span class="mk m-p" style="left:${X(price)}%"></span>` : ''}</div>
        <div class="cd-leg">${same ? `<span class="c">● Tuo prezzo = Consigliato ${eur(C.v)}</span>` : `${price != null ? `<span class="p">● Tuo ${eur(price)}</span>` : ''}<span class="c">● Consigliato ${eur(C.v)}</span>`}
          <span class="r">da ${eur(lo)} a ${eur(hi)}</span></div>`;
    }
    const dl = C && C.drop ? C.drop.map(([l]) => l) : [];
    return `<div class="cd-mk">${L.map(([l, v]) => `<div${dl.includes(l) ? ' class="anom" title="Valore anomalo: non usato per il Consigliato"' : ''}><span>${l}</span><b>${eur(v) || '—'}</b></div>`).join('')}<div class="c"><span>Consigliato</span><b>${C ? eur(C.v) : '—'}</b></div></div>${bar}
      ${dl.length ? `<p class="small anomtxt">⚠ ${C.drop.map(([l, v]) => `${l} ${eur(v)}`).join(', ')}: ${dl.length === 1 ? 'valore anomalo' : 'valori anomali'} rispetto a Tendenza e medie recenti (probabile vendita fuori scala), non ${dl.length === 1 ? 'usato' : 'usati'} per il Consigliato.</p>` : ''}`;
  };
  const verdict = (k, l) => {
    const M = mOf(k); if (!M || (l.rev && !M.rv) || l.price == null || !consOf(M)) return '';
    const o = outOf(k, l);
    return o ? `<span class="cd-tag ${o.dir}">${o.dir === 'hi' ? '▲ troppo alto' : '▼ troppo basso'} di ${eur(Math.abs(o.d))}</span>` : '<span class="cd-tag ok">in linea con il mercato</span>';
  };
  const hist = l => { const a = ((state.hist || {})[histKey(l)] || []); return a.length >= 2 ? histChart(l, 'Andamento') : `<p class="cd-none">Andamento: il grafico compare dopo almeno 2 giorni di prezzi raccolti${a.length ? ' (finora 1)' : ''}.</p>`; };
  const fig = (v, l, cls = '') => `<div class="${cls}"><b>${v}</b><span>${l}</span></div>`;
  // link a Cardmarket: l'immagine apre la prima variante (in vendita, poi Standby, altrimenti Normale italiana)
  const cmLink = x => x.vp ? vxCmUrl(cm, x, c.id, c.name, x.lang || 'it') : cmCardUrl(cm, c.name, !!x.rev, x.lang || 'it');
  const vName = x => `${vLab(x)} · ${LANGN[x.lang || 'it'] || x.lang}`;
  const VC = c.id ? varCache(c.id) : null, noRev = VC && VC.det && !VC.rev;
  const v0 = ls[0]?.[1] || sb[0]?.[1] || { rev: false, lang: 'it' };
  // pagina esatta solo se nota (catalogo letto dallo script nella pagina bulk); altrimenti è una ricerca per nome, e lo dico
  const cmA = x => { const h = cmLink(x), q = /\/Products\/Search/.test(h);
    return `<a class="cd-cml" href="${esc(h)}" target="cardscanner" referrerpolicy="no-referrer" title="${q ? 'Pagina esatta di questa versione non ancora nota: apre la ricerca per nome. Diventa esatta dopo che lo script ha mandato al gestionale una pagina bulk dove c\'è questa versione (per esempio quando la metti in vendita).' : 'Apri su Cardmarket con i filtri ' + esc(vName(x))}">${q ? 'Cerca su Cardmarket ↗' : 'Cardmarket ↗'}</a>`; };
  openDlg(`<div class="cdx">
    <div class="cd-img"><a class="cd-cm" href="${esc(cmLink(v0))}" target="cardscanner" referrerpolicy="no-referrer" title="Apri su Cardmarket: ${esc(vName(v0))}">${imgTag(srcs, false) || `<div class="cd-ph">${esc(c.localId)}</div>`}<span>Apri su Cardmarket ↗<small>${esc(vName(v0))}</small></span></a><p class="small">${srcs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noreferrer">immagine ${i + 1}</a>`).join(' · ') || 'nessuna immagine'}</p></div>
    <div class="cd-main">
      <div class="cd-head"><div><span class="cd-num">${esc(c.localId)}</span><h3>${esc(c.name)}</h3>
        <div class="cd-sub">${[el.querySelector('.rar')?.textContent.trim(), current.setName].filter(Boolean).map(esc).join(' · ')}</div></div>
        <button id="dClose" class="cd-x" title="Chiudi">✕</button></div>
      <div class="cd-figs">${fig(qLs, 'in vendita', 'g')}${fig(qSb, 'in Standby', 's')}${fig(qSold, qSold === 1 ? 'venduta' : 'vendute', 'v')}${fig(eur(inc) || '0,00 €', 'incassato')}
        ${fig(since ? daysAgo(since) : '—', since ? `giorni in vendita` : 'non in vendita')}</div>
      ${vs.length ? `<div class="vbox"><b style="color:var(--var)">⚠ Il prezzo di mercato è cambiato</b>
        ${vs.map(({ l, v }) => `<div>${l.rev ? 'Reverse' : 'Normale'}: ${BASEN[l.rb || 'low']} ${eur(v.ref)} (${fmtD(l.refAt)}) → <b>${eur(v.cur)}</b> · con la tua regola <b>${eur(v.sugg)}</b> (tuo ${eur(l.price)})</div>`).join('')}
        <p class="row" style="margin:6px 0 0"><button class="sm pri" id="dVar">Conferma / tieni il prezzo…</button></p></div>` : ''}
      ${ls.map(([k, l]) => `<section class="cd-v on" data-k="${esc(k)}">
        <header><b>${l.vp ? `<span class="vxl">${esc(l.vl || 'Variante speciale')}</span>` : l.rev ? '<span class="rv">Reverse Holo</span>' : 'Normale'}</b><span>${LANGN[l.lang] || l.lang}</span><em class="st">In vendita</em>${verdict(k, l)}${cmA(l)}</header>
        <div class="cd-row">
          <label>Prezzo €<input type="number" min="0" step="0.01" value="${l.price ?? ''}" data-f="price"><small>dal ${fmtD(l.pAt || l.date)}</small></label>
          <label>Copie<input type="number" min="0" value="${l.q}" data-f="q"></label>
          <div class="cd-rule"><span>Regola</span><b>${l.ref != null ? ruleTxt(l) : '—'}</b>${l.ref != null ? `<small>riferimento ${eur(l.ref)} · ${fmtD(l.refAt)}</small>` : ''}</div>
          <button class="sm" data-sell="1">Venduta 1</button></div>
        ${market(mOf(k), l.price, l.rev && !l.vp)}
        <div class="cd-foot">${hist(l)}<span class="small">${src(mOf(k))}</span></div>
      </section>`).join('')}
      ${sb.map(([k, x]) => `<section class="cd-v sb" data-sb="${esc(k)}">
        <header><b>${x.vp ? `<span class="vxl">${esc(x.vl || 'Variante speciale')}</span>` : x.rev ? '<span class="rv">Reverse Holo</span>' : 'Normale'}</b><span>${LANGN[x.lang] || x.lang}</span><em class="st">Standby</em>${cmA(x)}</header>
        ${x.rev && !x.vp && noRev ? `<div class="vbox wrbox"><b>⚠ In questo set questa carta non ha la Reverse semplice</b>
          <div>Le tue ${x.q} ${x.q === 1 ? 'copia segnata' : 'copie segnate'} Reverse sono una variante speciale. Quale?</div>
          <p class="row" style="margin:6px 0 0"><select class="wrSel">${VC.x.map(v => `<option value="${esc(v.p)}">${esc(v.l)}</option>`).join('')}</select><button class="sm pri" data-wr="1">Sposta le copie</button></p></div>` : ''}
        <div class="cd-row"><label>Copie<input type="number" min="0" value="${x.q}" data-f="sbq"></label>
          <div class="cd-rule"><span>Dalla lista</span><b>${esc(x.file || '—')}</b><small>caricata il ${fmtD(x.date)}</small></div></div>
        ${market(sbmOf(k), null, x.rev && !x.vp)}
        <p class="small">Passa "in vendita" quando la carichi su Cardmarket con lo script e premi "Invia al gestionale".</p>
      </section>`).join('')}
      ${!ls.length && !sb.length ? '<p class="cd-none">Questa carta non è né in vendita né in Standby.</p>' : ''}
      ${soldHere.length ? `<details class="cd-sold"><summary>Vendite di questa carta · ${qSold} ${qSold === 1 ? 'copia' : 'copie'}${lastSold ? ' · ultima il ' + fmtD(lastSold) : ''}</summary>
        <table><tr><th>Data</th><th>Variante</th><th class="n">Copie</th><th class="n">Prezzo</th><th>Ordine</th></tr>
        ${soldHere.slice().reverse().map(s => `<tr><td>${fmtD(s.date)}</td><td>${esc(vLab(s))}</td><td class="n">${s.q}</td><td class="n">${eur(s.price)}</td><td class="small">${esc(s.order || s.file || s.source || '')}</td></tr>`).join('')}</table></details>` : ''}
      ${ls.length && ls[0][1].com ? `<p class="small">Commento su Cardmarket: ${esc(ls[0][1].com)}</p>` : ''}
    </div></div>`, () => {
    $('dClose').onclick = closeDlg;
    if ($('dVar')) $('dVar').onclick = () => varDialog(vs, `Conferma prezzi · ${c.localId} ${c.name}`);
    // copie segnate Reverse che sono in realtà una variante speciale: le sposto su quella variante (sempre in Standby)
    $('dlgBody').querySelectorAll('[data-wr]').forEach(b => b.onclick = () => {
      const sec = b.closest('[data-sb]'), k = sec.dataset.sb, X = state.standby[k], v = VC && VC.x.find(o => o.p === sec.querySelector('.wrSel').value);
      if (!X || !v) return;
      const nk = sbKey(X.s, X.u, false, X.lang, v.p);
      const Y = state.standby[nk] || (state.standby[nk] = Object.assign({}, X, { rev: false, vp: v.p, vl: v.l, vb: v.b, q: 0 }));
      Y.q += X.q;
      logOp('standby', X.sn, `${X.u} ${X.n || ''}: ${X.q} ${X.q === 1 ? 'copia' : 'copie'} in Standby da Reverse a ${v.l}`, null);
      delete state.standby[k]; delete (state.sbMarket || {})[k];
      save(); closeDlg(); refresh(); updatePrices(false);
    });
    $('dlgBody').querySelectorAll('input[data-f]').forEach(inp => inp.onchange = () => {
      if (inp.dataset.f === 'sbq') {
        const k = inp.closest('[data-sb]').dataset.sb, X = state.standby[k];
        if (!X) return;
        const q0 = X.q;
        X.q = Math.max(0, +inp.value || 0);
        logOp('quantita', X.sn, `${X.u} ${X.n || ''}${X.vp ? ' ' + (X.vl || '') : X.rev ? ' Reverse' : ''} in Standby: ${q0} → ${X.q}`, X.q - q0);
        if (!X.q) { delete state.standby[k]; delete (state.sbMarket || {})[k]; }
        save(); refresh(); return;
      }
      const k = inp.closest('[data-k]').dataset.k, L = state.listings[k];
      if (!L) return;
      const set = L.expName || state.cm[L.exp]?.name;
      if (inp.dataset.f === 'q') {
        const q0 = L.q; L.q = Math.max(0, +inp.value || 0);
        logOp('quantita', set, `${cardTxt(L)} in vendita: ${q0} → ${L.q} (a mano)`, L.q - q0);
        if (!L.q) delete state.listings[k];
      }
      else {
        const p0 = L.price;
        L.price = inp.value === '' ? null : r2(+inp.value); L.pAt = today();
        logOp('prezzo', set, `${cardTxt(L)}: prezzo ${eur(p0) || '—'} → ${eur(L.price) || '—'} (a mano)`, L.q);
        const cur = baseOf(mOf(k), L.rb || 'low'); if (cur != null) { L.ref = cur; L.refAt = mOf(k).upd || today(); }
      }
      save(); refresh();
    });
    $('dlgBody').querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
      const L0 = state.listings[b.closest('[data-k]').dataset.k];
      if (L0) logOp('venduta', L0.expName || state.cm[L0.exp]?.name, `${cardTxt(L0)} ×1 a ${eur(L0.price)} (a mano)`, 1);
      sell(b.closest('[data-k]').dataset.k, 1, 'Cardmarket', 'a mano'); save(); closeDlg(); refresh();
    });
  });
});

// ---------- statistiche ----------
const DAY = 86400e3;
const daysAgo = d => d ? Math.floor((Date.now() - new Date(d)) / DAY) : null;
function bars(items, fmt, cls) {
  const max = Math.max(1e-9, ...items.map(x => x[1]));
  return `<div class="bars">${items.map(([label, v, extra]) => `<div class="br2"><span class="lb" title="${esc(label)}">${esc(label)}</span>
    <span class="tr"><i class="${cls || ''}" style="width:${Math.max(1, v / max * 100)}%"></i></span><span class="vl">${fmt(v)}${extra ? ' ' + extra : ''}</span></div>`).join('')}</div>`;
}
function info(l) {
  const c = state.cm[l.exp]?.cards?.[l.p] || {};
  return { c, name: c.n || '', set: l.expName || state.cm[l.exp]?.name || '', rar: rarIt(c.r) || 'Non indicata' };
}
function renderDash() {
  const ls = Object.entries(state.listings).map(([k, l]) => Object.assign({ k }, l, info(l)));
  const sold = state.sold;
  const copies = ls.reduce((a, l) => a + l.q, 0);
  const value = ls.reduce((a, l) => a + (l.price || 0) * l.q, 0);
  const priced = ls.filter(l => l.price != null);
  const avg = priced.length ? priced.reduce((a, l) => a + l.price * l.q, 0) / priced.reduce((a, l) => a + l.q, 0) : 0;
  const soldQ = sold.reduce((a, s) => a + s.q, 0);
  const soldV = sold.reduce((a, s) => a + (s.price || 0) * s.q, 0);
  const now = new Date(), ym = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  const thisM = ym(now);
  const monthSold = sold.filter(s => ym(s.date) === thisM);
  const dts = sold.filter(s => s.listed).map(s => (new Date(s.date) - new Date(s.listed)) / DAY);
  const avgDays = dts.length ? Math.round(dts.reduce((a, b) => a + b, 0) / dts.length) : null;
  const revQ = ls.filter(l => l.rev && !l.vp).reduce((a, l) => a + l.q, 0);
  // copie per variante: Normali, Reverse, e ogni variante speciale con il suo nome
  const byV = arr => { const m = {}; arr.filter(x => x.vp).forEach(x => { m[x.vl || 'Variante speciale'] = (m[x.vl || 'Variante speciale'] || 0) + x.q; });
    return [['Normali', arr.filter(x => !x.vp && !x.rev).reduce((a, x) => a + x.q, 0)], ['Reverse Holo', arr.filter(x => !x.vp && x.rev).reduce((a, x) => a + x.q, 0)], ...Object.entries(m).sort((a, b) => b[1] - a[1])]; };
  const sbAll = Object.values(state.standby || {}), xQ = ls.filter(l => l.vp).reduce((a, l) => a + l.q, 0);

  // vendite ultimi 12 mesi
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(ym(d)); }
  const mQ = {}, mV = {};
  sold.forEach(s => { const m = ym(s.date); mQ[m] = (mQ[m] || 0) + s.q; mV[m] = (mV[m] || 0) + (s.price || 0) * s.q; });
  const maxV = Math.max(0.01, ...months.map(m => mV[m] || 0));
  const MN = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  // raggruppamenti
  const group = (arr, key, val) => { const m = {}; arr.forEach(x => { const k = key(x); m[k] = (m[k] || 0) + val(x); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const valBySet = group(ls, l => l.set, l => (l.price || 0) * l.q).slice(0, 10);
  const qByRar = group(ls, l => l.rar, l => l.q);
  const bands = [['meno di 0,10 €', 0, 0.10], ['0,10 – 0,49 €', 0.10, 0.50], ['0,50 – 0,99 €', 0.50, 1], ['1 – 4,99 €', 1, 5], ['5 – 19,99 €', 5, 20], ['20 € e oltre', 20, 1e9]];
  const qByBand = bands.map(([lb, a, b]) => [lb, priced.filter(l => l.price >= a && l.price < b).reduce((s, l) => s + l.q, 0)]);
  const ages = [['meno di 30 giorni', 0, 30], ['30 – 89 giorni', 30, 90], ['90 – 179 giorni', 90, 180], ['180 giorni e oltre', 180, 1e9]];
  const qByAge = ages.map(([lb, a, b]) => [lb, ls.filter(l => { const d = daysAgo(l.date) ?? 0; return d >= a && d < b; }).reduce((s, l) => s + l.q, 0)]);

  // per set: in vendita, vendute, % vendute
  const setNames = [...new Set([...ls.map(l => l.set), ...sold.map(s => s.expName || state.cm[s.exp]?.name || '')])].filter(Boolean);
  const perSet = setNames.map(n => {
    const inV = ls.filter(l => l.set === n), sd = sold.filter(s => (s.expName || state.cm[s.exp]?.name) === n);
    const q = inV.reduce((a, l) => a + l.q, 0), v = inV.reduce((a, l) => a + (l.price || 0) * l.q, 0);
    const sq = sd.reduce((a, s) => a + s.q, 0), sv = sd.reduce((a, s) => a + (s.price || 0) * s.q, 0);
    return { n, q, v, sq, sv, pct: q + sq ? Math.round(sq / (q + sq) * 100) : 0 };
  }).sort((a, b) => b.v + b.sv - (a.v + a.sv));

  // prezzi da rivedere (confronto con la tendenza di Cardmarket)
  ls.forEach(l => { const M = mOf(l.k); if (M && M.t != null && !(l.rev && !M.rv)) l.c = Object.assign({}, l.c, { t: M.t }); });
  const withT = ls.filter(l => l.price != null && l.c.t);
  const high = withT.filter(l => l.price > l.c.t * 1.5 && l.price - l.c.t >= 0.05).sort((a, b) => (b.price / b.c.t) - (a.price / a.c.t)).slice(0, 15);
  const low = withT.filter(l => l.price < l.c.t * 0.7 && l.c.t - l.price >= 0.05).sort((a, b) => (a.price / a.c.t) - (b.price / b.c.t)).slice(0, 15);
  const old = ls.filter(l => (daysAgo(l.date) ?? 0) >= 60).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 15);
  const noPrice = ls.filter(l => l.price == null);
  const topVal = ls.filter(l => l.price != null).sort((a, b) => b.price - a.price).slice(0, 10);
  const topSoldCards = group(sold, s => `${s.num} ${s.name}${s.rev ? ' (R)' : ''} · ${s.expName || ''}`, s => s.q).slice(0, 10);
  const row = l => `<tr><td>${esc(l.u)} ${esc(l.name)}${l.rev ? ' <b style="color:var(--rev)">R</b>' : ''}</td><td>${esc(l.set)}</td>`;

  $('main').innerHTML = `<div class="sethead"><div><h2>📊 Statistiche</h2><div class="sub">Aggiornate al ${now.toLocaleDateString('it-IT')} · valori calcolati sui prezzi di listino</div></div>
    <div class="row"><button id="xInv">⬇ Magazzino (Excel)</button><button id="xSold">⬇ Vendite (Excel)</button></div></div>
  <div class="kpis">
    <div class="kpi"><span>Copie in vendita</span><b>${copies}</b><span>${ls.length} righe · ${revQ} Reverse</span></div>
    <div class="kpi"><span>Valore a listino</span><b>${eur(value)}</b><span>prezzo medio ${eur(avg)}</span></div>
    <div class="kpi"><span>Set con carte in vendita</span><b>${new Set(ls.map(l => l.set)).size}</b><span>${noPrice.length} righe senza prezzo</span></div>
    <div class="kpi"><span>Vendute in totale</span><b>${soldQ}</b><span>${eur(soldV)}</span></div>
    <div class="kpi"><span>Vendute questo mese</span><b>${monthSold.reduce((a, s) => a + s.q, 0)}</b><span>${eur(monthSold.reduce((a, s) => a + (s.price || 0) * s.q, 0))}</span></div>
    <div class="kpi"><span>Tempo medio di vendita</span><b>${avgDays == null ? '—' : avgDays + ' gg'}</b><span>dalla messa in vendita</span></div>
  </div>
  <div class="panels">
    <div class="panel"><h3>Vendite per mese (€)</h3><div class="cols">${months.map(m => `<div class="c"><b>${mQ[m] ? eur(mV[m] || 0).replace(' €', '') : ''}</b><i style="height:${(mV[m] || 0) / maxV * 100}%"></i>${MN[+m.slice(5) - 1]}</div>`).join('')}</div>
      <div class="small" style="margin-top:6px">Copie: ${months.map(m => mQ[m] || 0).join(' · ')}</div></div>
    <div class="panel"><h3>Valore in vendita per set</h3>${valBySet.length ? bars(valBySet, eur) : '<p class="small">Nessun dato.</p>'}</div>
    <div class="panel"><h3>Copie per rarità</h3>${qByRar.length ? bars(qByRar, v => v + ' copie', 'a') : '<p class="small">Nessun dato.</p>'}</div>
    <div class="panel"><h3>Copie per fascia di prezzo</h3>${bars(qByBand, v => v + ' copie')}
      <h3 style="margin-top:14px">Copie per variante (in vendita)</h3>${bars(byV(ls), v => v + ' copie', 'r')}
      ${sbAll.some(x => x.vp) ? `<h3 style="margin-top:14px">Copie per variante (in Standby)</h3>${bars(byV(sbAll), v => v + ' copie', 'r')}` : ''}</div>
    <div class="panel"><h3>Da quanto sono in vendita</h3>${bars(qByAge, v => v + ' copie', 'a')}
      ${old.length ? `<h3 style="margin-top:14px">Ferme da più di 60 giorni (da ribassare?)</h3><table><tr><th>Carta</th><th>Set</th><th>Prezzo</th><th>Giorni</th></tr>${old.map(l => row(l) + `<td>${eur(l.price)}</td><td>${daysAgo(l.date)}</td></tr>`).join('')}</table>` : ''}</div>
    <div class="panel"><h3>Per set</h3>${perSet.length ? `<table><tr><th>Set</th><th>In vendita</th><th>Valore</th><th>Vendute</th><th>Incasso</th><th>% vendute</th></tr>
      ${perSet.map(x => `<tr><td>${esc(x.n)}</td><td>${x.q}</td><td>${eur(x.v)}</td><td>${x.sq}</td><td>${eur(x.sv)}</td><td>${x.pct}%</td></tr>`).join('')}</table>` : '<p class="small">Nessun dato.</p>'}</div>
    <div class="panel"><h3>Prezzi da rivedere (rispetto alla tendenza Cardmarket)</h3>
      ${!withT.length ? '<p class="small">Serve la tendenza di Cardmarket: premi ⚙ → Prezzi di mercato → Aggiorna adesso.</p>' : ''}
      ${high.length ? `<p class="small up">Molto sopra la tendenza (difficili da vendere):</p><table><tr><th>Carta</th><th>Set</th><th>Tuo</th><th>Tendenza</th></tr>${high.map(l => row(l) + `<td class="up">${eur(l.price)}</td><td>${eur(l.c.t)}</td></tr>`).join('')}</table>` : ''}
      ${low.length ? `<p class="small down" style="margin-top:10px">Molto sotto la tendenza (stai regalando?):</p><table><tr><th>Carta</th><th>Set</th><th>Tuo</th><th>Tendenza</th></tr>${low.map(l => row(l) + `<td class="down">${eur(l.price)}</td><td>${eur(l.c.t)}</td></tr>`).join('')}</table>` : ''}
      ${withT.length && !high.length && !low.length ? '<p class="small">Tutti i prezzi sono in linea con la tendenza ✔</p>' : ''}</div>
    <div class="panel"><h3>Le carte di valore più alto in vendita</h3>${topVal.length ? `<table><tr><th>Carta</th><th>Set</th><th>Prezzo</th><th>Q.tà</th></tr>${topVal.map(l => row(l) + `<td>${eur(l.price)}</td><td>${l.q}</td></tr>`).join('')}</table>` : '<p class="small">Nessun dato.</p>'}</div>
    <div class="panel"><h3>Le più vendute</h3>${topSoldCards.length ? bars(topSoldCards, v => v + ' copie') : '<p class="small">Ancora nessuna vendita registrata.</p>'}</div>
    ${noPrice.length ? `<div class="panel"><h3>Senza prezzo (${noPrice.length})</h3><table><tr><th>Carta</th><th>Set</th><th>Q.tà</th></tr>${noPrice.slice(0, 30).map(l => row(l) + `<td>${l.q}</td></tr>`).join('')}</table>
      <p class="small">Clicca la carta nel suo set per scrivere il prezzo.</p></div>` : ''}
  </div>`;
  $('xInv').onclick = () => downloadCsv(`magazzino-${now.toISOString().slice(0, 10)}.csv`,
    [['Set', 'Numero', 'Nome', 'Rarità', 'Variante', 'Lingua', 'Quantità', 'Prezzo', 'Valore', 'Tendenza CM', 'In vendita dal', 'Giorni', 'Commento']].concat(
      ls.sort((a, b) => a.set.localeCompare(b.set) || (parseInt(a.u) || 0) - (parseInt(b.u) || 0)).map(l => [l.set, l.u, l.name, l.rar, vLab(l), LANGN[l.lang] || l.lang, l.q,
        l.price, l.price != null ? +(l.price * l.q).toFixed(2) : '', l.c.t ?? '', l.date ? new Date(l.date).toLocaleDateString('it-IT') : '', daysAgo(l.date) ?? '', l.com || ''])));
  $('xSold').onclick = () => downloadCsv(`vendite-${now.toISOString().slice(0, 10)}.csv`,
    [['Data', 'Set', 'Numero', 'Nome', 'Variante', 'Quantità', 'Prezzo', 'Totale', 'Venduta su', 'File', 'Giorni per vendere']].concat(
      sold.map(s => [new Date(s.date).toLocaleDateString('it-IT'), s.expName || state.cm[s.exp]?.name || '', s.num, s.name, vLab(s), s.q,
        s.price ?? '', s.price != null ? +(s.price * s.q).toFixed(2) : '', s.source, s.file || '', s.listed ? Math.round((new Date(s.date) - new Date(s.listed)) / DAY) : ''])));
}
// ---------- storico vendite ----------
const salesF = { period: 'month', from: '', to: '', ch: '', set: '', q: '' };
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function periodRange() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (salesF.period) {
    case 'month': return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    case 'lastmonth': return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    case '30': return [new Date(sod(n) - 29 * DAY), new Date(+sod(n) + DAY)];
    case '90': return [new Date(sod(n) - 89 * DAY), new Date(+sod(n) + DAY)];
    case 'year': return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
    case 'custom': return [salesF.from ? new Date(salesF.from) : new Date(2000, 0, 1), salesF.to ? new Date(+new Date(salesF.to) + DAY) : new Date(+sod(n) + DAY)];
    default: {
      const first = state.sold.length ? new Date(Math.min(...state.sold.map(s => +new Date(s.date)))) : n;
      return [sod(first), new Date(+sod(n) + DAY)];
    }
  }
}
const chOf = s => /ebay/i.test(s.source) ? 'eBay' : /cardmarket/i.test(s.source) ? 'Cardmarket' : (s.source || 'Altro');
const setOf = s => s.expName || state.cm[s.exp]?.name || '';
function salesIn(a, b) {
  const t = salesF.q.trim().toLowerCase();
  return state.sold.map((s, i) => Object.assign({ i }, s)).filter(s => {
    const d = new Date(s.date);
    if (d < a || d >= b) return false;
    if (salesF.ch && chOf(s) !== salesF.ch) return false;
    if (salesF.set && setOf(s) !== salesF.set) return false;
    if (t && !`${s.name} ${s.num} ${setOf(s)} ${s.buyer || ''} ${s.order || ''}`.toLowerCase().includes(t)) return false;
    return true;
  });
}
function kpisOf(list) {
  const rev = list.reduce((a, s) => a + (s.price || 0) * s.q, 0);
  const q = list.reduce((a, s) => a + s.q, 0);
  const orders = new Set(list.map(s => s.order ? 'o' + s.order : 'm' + dayKey(s.date) + chOf(s))).size;
  const dts = list.filter(s => s.listed).map(s => (new Date(s.date) - new Date(s.listed)) / DAY);
  return { rev, q, orders, aov: orders ? rev / orders : 0, avgP: q ? rev / q : 0, days: dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : null };
}
function delta(cur, prev, invert) {
  if (prev == null || cur == null) return '';
  if (!prev && !cur) return '<span class="delta eq">=</span>';
  if (!prev) return '<span class="delta pos">nuovo</span>';
  const p = Math.round((cur - prev) / prev * 100);
  if (p === 0) return '<span class="delta eq">= </span>';
  const good = invert ? p < 0 : p > 0;
  return `<span class="delta ${good ? 'pos' : 'neg'}" title="periodo precedente: ${typeof prev === 'number' ? prev.toFixed(2).replace('.', ',') : prev}">${p > 0 ? '▲' : '▼'} ${Math.abs(p) > 999 ? '>999' : Math.abs(p)}%</span>`;
}
/** copia personale dell'ordine in PDF: stessa struttura del documento di Cardmarket, ricostruita con i dati salvati nel gestionale */
async function pdfOrder(o) {
  let JsPDF;
  try { JsPDF = await pdfLib(); } catch (e) { alert('Non riesco a creare il PDF (serve internet): ' + e.message); return; }
  const D = (o.id && (state.orders || {})[o.id]) || {};
  const full = !!(D.items && D.items.length);
  const codeOf = s => state.cm[s.exp]?.cards?.[s.p]?.c || '';
  const rows = full
    ? D.items.map(it => ({ q: it.qty, name: it.name, num: it.num, lang: (it.lang || '').toUpperCase(), cond: it.cond || '', code: it.code || '', rar: it.rar || '', com: it.com || (it.rev && !/reverse/i.test(it.com || '') ? 'Reverse Holo' : ''), price: it.price }))
    : o.lines.map(s => ({ q: s.q, name: s.name, num: s.num, lang: (s.lang || '').toUpperCase(), cond: '', code: codeOf(s) || setOf(s), rar: '', com: s.rev ? 'Reverse Holo' : '', price: s.price }));
  const X = D.x || {}, nArt = X.n || rows.reduce((a, r) => a + r.q, 0);
  const val = X.val != null ? X.val : rows.reduce((a, r) => a + (r.price || 0) * r.q, 0);
  const grand = X.tot != null ? X.tot : val + (X.ship || 0);
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const ink = [24, 34, 58], mut = [104, 114, 134], navy = [29, 61, 122];
  const dt = d => new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  // intestazione, come l'originale: numero di spedizione e data di pagamento
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(pdfT(o.id ? `Spedizione #${o.id}` : 'Vendita'), 14, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...mut);
  doc.text(pdfT(`Pagato ${dt(o.date)}`), 14, 24);
  doc.setFillColor(...navy); doc.roundedRect(W - 54, 11, 40, 9, 2, 2, 'F');
  doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.text(pdfT('COPIA PERSONALE'), W - 34, 16.8, { align: 'center' });
  // venditore / acquirente
  doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text(pdfT(`Venditore - ${D.seller || '—'}`), 14, 36); doc.text(pdfT(`Acquirente - ${o.buyer || D.buyer || '—'}`), W / 2 + 4, 36);
  doc.setDrawColor(227, 231, 238); doc.setLineWidth(0.3); doc.line(14, 41, W - 14, 41);
  // riepilogo
  const sum = [['Contenuto', `${nArt} ${nArt === 1 ? 'articolo' : 'articoli'}`], ["Valore dell'oggetto", eurP(val)]];
  if (X.ship != null) sum.push(['Spese di spedizione', eurP(X.ship)]);
  sum.push(['Totale', eurP(grand)]);
  let y = 49;
  sum.forEach(([k, v]) => { doc.setFont('helvetica', k === 'Totale' ? 'bold' : 'normal'); doc.setTextColor(...(k === 'Totale' ? ink : mut)); doc.text(pdfT(k), 14, y); doc.setTextColor(...ink); doc.text(pdfT(v), 70, y); y += 6; });
  y += 2;
  doc.setFont('helvetica', 'normal');
  if (X.method) { doc.setTextColor(...mut); doc.text(pdfT('Tipo di spedizione'), 14, y); doc.setTextColor(...ink); doc.text(pdfT(X.method), 70, y); y += 6; }
  if (X.trustee) { doc.setTextColor(...mut); doc.text(pdfT('Trustee Service'), 14, y); doc.setTextColor(...ink); doc.text(pdfT(X.trustee), 70, y); y += 6; }
  // articoli
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink); doc.text(pdfT('Pokémon Singles:'), 14, y + 5);
  doc.autoTable({
    startY: y + 8, margin: { left: 14, right: 14 }, theme: 'plain',
    styles: { fontSize: 8.8, cellPadding: { top: 1.8, bottom: 1.8, left: 1.6, right: 1.6 }, textColor: ink, lineColor: [227, 231, 238], lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: [243, 245, 248], textColor: mut, fontStyle: 'bold', fontSize: 7.8 },
    head: [['Qtà', 'Carta', 'N°', 'Lingua', 'Cond.', 'Set', 'Rarità', 'Commento', 'Prezzo']].map(r => r.map(pdfT)),
    body: rows.map(r => [r.q, r.name, r.num, r.lang, r.cond, r.code, r.rar, r.com, eurP(r.price)].map(v => pdfT(String(v ?? '')))),
    columnStyles: { 0: { halign: 'right', cellWidth: 9 }, 1: { fontStyle: 'bold' }, 2: { cellWidth: 11 }, 3: { halign: 'center', cellWidth: 13 }, 4: { halign: 'center', cellWidth: 12 }, 5: { cellWidth: 12 }, 6: { cellWidth: 14 }, 8: { halign: 'right', cellWidth: 18 } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 7 && /reverse/i.test(rows[d.row.index].com)) d.cell.styles.textColor = [124, 77, 204]; }
  });
  if (!full) {
    let ty = doc.lastAutoTable.finalY + 6; if (ty > H - 30) { doc.addPage(); ty = 20; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...mut);
    doc.text(pdfT('Ordine caricato con una versione precedente del gestionale: mancano condizione, rarità, commenti e spedizione. Ricarica il PDF dell\'ordine (Carica > Ordini venduti) per completarli.'), 14, ty, { maxWidth: W - 28 });
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...mut);
    doc.text(pdfT(`Copia creata dal Gestionale carte il ${new Date().toLocaleString('it-IT')} con i dati dell'ordine${D.file ? ' (' + D.file + ')' : ''}. Non è il documento originale di Cardmarket.`), 14, H - 10, { maxWidth: W - 45 });
    doc.text(`${i}/${n}`, W - 14, H - 10, { align: 'right' });
  }
  doc.save(`Spedizione_${o.id || dayKey(o.date)}_copia.pdf`);
}
function renderSales() {
  // vendite registrate prima che salvassi il numero d'ordine: lo ricavo dal riferimento "Ordine #…"
  state.sold.forEach(x => { if (!x.order) { const m = String(x.file || '').match(/Ordine #(\d+)/); if (m) x.order = m[1]; } });
  const [a, b] = periodRange();
  const list = salesIn(a, b);
  const span = +b - +a;
  const prevList = salesF.period === 'all' ? null : salesIn(new Date(+a - span), a);
  const K = kpisOf(list), P = prevList ? kpisOf(prevList) : null;
  const allSets = [...new Set(state.sold.map(setOf).filter(Boolean))].sort();
  const allCh = [...new Set(state.sold.map(chOf))].sort();

  // andamento: giorni se il periodo è breve, mesi altrimenti
  const daily = span <= 62 * DAY;
  const buckets = [];
  if (daily) for (let t = +a; t < +b && buckets.length < 62; t += DAY) buckets.push(dayKey(t));
  else { const d = new Date(a.getFullYear(), a.getMonth(), 1); while (d < b && buckets.length < 36) { buckets.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() + 1); } }
  const bk = s => daily ? dayKey(s.date) : dayKey(s.date).slice(0, 7);
  const bv = {}, bq = {};
  list.forEach(s => { const k = bk(s); bv[k] = (bv[k] || 0) + (s.price || 0) * s.q; bq[k] = (bq[k] || 0) + s.q; });
  const maxB = Math.max(0.01, ...buckets.map(k => bv[k] || 0));
  const MN = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const lab = k => daily ? (+k.slice(8)) + (k.slice(8) === '01' || k === buckets[0] ? ' ' + MN[+k.slice(5, 7) - 1] : '') : MN[+k.slice(5, 7) - 1] + (k.slice(5) === '01' || k === buckets[0] ? " '" + k.slice(2, 4) : '');

  const group = (key, val) => { const m = {}; list.forEach(s => { const k = key(s); if (k) m[k] = (m[k] || 0) + val(s); }); return Object.entries(m).sort((x, y) => y[1] - x[1]); };
  const val = s => (s.price || 0) * s.q;
  const byCh = group(chOf, val), bySet = group(setOf, val).slice(0, 10);
  const byRar = group(s => rarIt(state.cm[s.exp]?.cards?.[s.p]?.r) || 'Non indicata', s => s.q);
  const byCard = group(s => `${s.num} ${s.name}${s.rev ? ' (R)' : ''} · ${setOf(s)}`, s => s.q).slice(0, 10);
  const byBuyer = group(s => s.buyer, val).slice(0, 10);
  const revQ = list.filter(s => s.rev && !s.vp).reduce((x, s) => x + s.q, 0);
  const byVs = (() => { const m = {}; list.filter(s => s.vp).forEach(s => { m[s.vl || 'Variante speciale'] = (m[s.vl || 'Variante speciale'] || 0) + s.q; });
    return [['Normali', list.filter(s => !s.vp && !s.rev).reduce((x, s) => x + s.q, 0)], ['Reverse Holo', revQ], ...Object.entries(m)]; })();

  // ordini
  const orders = {};
  list.forEach(s => {
    const k = s.order ? 'o' + s.order : 'm' + dayKey(s.date) + chOf(s);
    const o = orders[k] || (orders[k] = { k, id: s.order, date: s.date, buyer: s.buyer || '', ch: chOf(s), q: 0, v: 0, lines: [] });
    o.q += s.q; o.v += val(s); o.lines.push(s);
    if (new Date(s.date) > new Date(o.date)) o.date = s.date;
  });
  const olist = Object.values(orders).sort((x, y) => new Date(y.date) - new Date(x.date));
  const chTag = c => `<span class="tag ${c === 'Cardmarket' ? 'cm' : c === 'eBay' ? 'eb' : 'mn'}">${esc(c)}</span>`;
  const fmtD = d => new Date(d).toLocaleDateString('it-IT');
  const per = { month: 'Questo mese', lastmonth: 'Mese scorso', '30': 'Ultimi 30 giorni', '90': 'Ultimi 90 giorni', year: "Quest'anno", all: 'Tutto', custom: 'Date' };

  $('main').innerHTML = `<div class="sethead"><div><h2>📈 Vendite</h2>
    <div class="sub">${fmtD(a)} – ${fmtD(new Date(+b - 1))}${prevList ? ' · confronto con il periodo precedente di pari durata' : ''}</div></div>
    <div class="row"><button id="xSales">⬇ Esporta (Excel)</button></div></div>
  <div class="filters">
    <span class="seg" id="segP">${Object.entries(per).map(([k, l]) => `<button data-p="${k}" class="${salesF.period === k ? 'on' : ''}">${l}</button>`).join('')}</span>
    <span id="customBox" class="${salesF.period === 'custom' ? '' : 'hide'}"><label>dal</label> <input type="date" id="fFrom" value="${salesF.from}"> <label>al</label> <input type="date" id="fTo" value="${salesF.to}"></span>
    <select id="fCh"><option value="">Tutti i canali</option>${allCh.map(c => `<option ${salesF.ch === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="fSetS"><option value="">Tutti i set</option>${allSets.map(c => `<option ${salesF.set === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <input type="search" id="fQ" placeholder="Cerca carta, acquirente, ordine…" value="${esc(salesF.q)}" style="flex:1;min-width:180px">
  </div>
  <div class="kpis">
    <div class="kpi"><span>Incasso</span><b>${eur(K.rev)}${delta(K.rev, P?.rev)}</b><small>${P ? 'prima: ' + eur(P.rev) : ''}</small></div>
    <div class="kpi"><span>Copie vendute</span><b>${K.q}${delta(K.q, P?.q)}</b><small>${revQ} Reverse</small></div>
    <div class="kpi"><span>Ordini</span><b>${K.orders}${delta(K.orders, P?.orders)}</b><small>${P ? 'prima: ' + P.orders : ''}</small></div>
    <div class="kpi"><span>Valore medio ordine</span><b>${eur(K.aov)}${delta(K.aov, P?.aov)}</b><small>${K.orders ? (K.q / K.orders).toFixed(1).replace('.', ',') + ' carte per ordine' : ''}</small></div>
    <div class="kpi"><span>Prezzo medio per carta</span><b>${eur(K.avgP)}${delta(K.avgP, P?.avgP)}</b><small>&nbsp;</small></div>
    <div class="kpi"><span>Tempo medio di vendita</span><b>${K.days == null ? '—' : Math.round(K.days) + ' gg'}${K.days != null && P?.days != null ? delta(K.days, P.days, true) : ''}</b><small>dalla messa in vendita</small></div>
  </div>
  ${!list.length ? `<div class="empty">Nessuna vendita in questo periodo${salesF.ch || salesF.set || salesF.q ? ' con questi filtri' : ''}.<br>Le vendite arrivano dal pulsante in alto <b>Registra una vendita</b>: PDF degli ordini di Cardmarket o foto della lista di un cliente.</div>` : `
  <div class="panels">
    <div class="panel wide"><h3>Andamento incasso (${daily ? 'per giorno' : 'per mese'})</h3>
      <div class="cols" style="height:180px">${buckets.map(k => `<div class="c" title="${k}: ${eur(bv[k] || 0)} · ${bq[k] || 0} copie"><b>${bv[k] ? eur(bv[k]).replace(' €', '') : ''}</b><i style="height:${(bv[k] || 0) / maxB * 100}%"></i>${lab(k)}</div>`).join('')}</div></div>
    <div class="panel"><h3>Per canale</h3>${bars(byCh, eur)}
      <h3 style="margin-top:14px">Copie per variante</h3>${bars(byVs, v => v + ' copie', 'r')}</div>
    <div class="panel"><h3>Incasso per set</h3>${bars(bySet, eur)}</div>
    <div class="panel"><h3>Copie per rarità</h3>${bars(byRar, v => v + ' copie', 'a')}</div>
    <div class="panel"><h3>Carte più vendute</h3>${bars(byCard, v => v + ' copie')}</div>
    <div class="panel"><h3>Migliori acquirenti</h3>${byBuyer.length ? bars(byBuyer, eur) : '<p class="small">Gli acquirenti arrivano dagli ordini Cardmarket caricati.</p>'}</div>
    <div class="panel wide"><h3>Ordini (${olist.length})</h3>
      <table class="otable"><tr><th>Data</th><th>Ordine</th><th>Canale</th><th>Acquirente</th><th>Copie</th><th>Totale</th><th></th></tr>
      ${olist.map(o => `<tr class="ord" data-o="${esc(o.k)}"><td>${fmtD(o.date)}</td><td>${o.id ? '#' + esc(o.id) : '<span class="small">vendite a mano</span>'}</td><td>${chTag(o.ch)}</td>
        <td>${esc(o.buyer) || '<span class="small">—</span>'}</td><td>${o.q}</td><td><b>${eur(o.v)}</b></td>
        <td style="text-align:right"><button class="sm" data-pdf="${esc(o.k)}" title="Copia personale dell'ordine in PDF, creata dal gestionale">📄 PDF</button></td></tr>
        <tr class="det hide" data-d="${esc(o.k)}"><td colspan="7"><table>${o.lines.map(s => `<tr><td>${s.q}×</td><td>${esc(s.num)} ${esc(s.name)}${s.rev ? ' <b style="color:var(--rev)">R</b>' : ''}</td>
          <td>${esc(setOf(s))}</td><td>${eur(s.price)}</td><td>${s.listed ? Math.round((new Date(s.date) - new Date(s.listed)) / DAY) + ' gg in vendita' : ''}</td>
          <td><button class="sm" data-undo="${s.i}">annulla vendita</button></td></tr>`).join('')}</table></td></tr>`).join('')}</table></div>
  </div>`}`;

  // comandi
  $('segP').onclick = e => { const bt = e.target.closest('button[data-p]'); if (!bt) return; salesF.period = bt.dataset.p; renderSales(); };
  $('fFrom').onchange = () => { salesF.from = $('fFrom').value; renderSales(); };
  $('fTo').onchange = () => { salesF.to = $('fTo').value; renderSales(); };
  $('fCh').onchange = () => { salesF.ch = $('fCh').value; renderSales(); };
  $('fSetS').onchange = () => { salesF.set = $('fSetS').value; renderSales(); };
  $('fQ').oninput = () => { salesF.q = $('fQ').value; clearTimeout(renderSales.t); renderSales.t = setTimeout(() => { renderSales(); const q = $('fQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); };
  document.querySelectorAll('[data-pdf]').forEach(bt => bt.onclick = e => { e.stopPropagation(); pdfOrder(orders[bt.dataset.pdf]); });
  document.querySelectorAll('tr.ord').forEach(tr => tr.onclick = () => document.querySelector(`tr[data-d="${CSS.escape(tr.dataset.o)}"]`).classList.toggle('hide'));
  document.querySelectorAll('[data-undo]').forEach(bt => bt.onclick = e => {
    e.stopPropagation();
    const s = state.sold[+bt.dataset.undo];
    // copie da rimettere in vendita: solo quelle tolte davvero dal magazzino (una vendita registrata senza carta nel gestionale non ne rimette)
    if (!s) return;
    const back = s.nolist || !s.p ? 0 : Math.min(s.q, s.took ?? s.q);
    const sbB = s.sbTook && s.sbk ? s.sbTook : 0;
    if (!confirm(`Annullare la vendita di ${s.q} × ${s.name}?${back ? ` ${back === 1 ? '1 copia torna' : back + ' copie tornano'} tra quelle in vendita.` : ''}${sbB ? ` ${sbB === 1 ? '1 copia torna' : sbB + ' copie tornano'} in Standby.` : ''}${!back && !sbB ? ' Viene tolta solo dalle vendite (la carta non era nel magazzino del gestionale).' : ''}`)) return;
    if (back) {
      const k = lkey(s.p, s.rev, s.lang);
      const L = state.listings[k] || (state.listings[k] = Object.assign({ p: s.p, exp: s.exp, expName: s.expName, u: s.num, rev: s.rev, lang: s.lang, q: 0, price: s.price, date: s.listed || s.date, com: '' }, s.vp ? { vp: s.vp, vl: s.vl, vs: s.vs, vb: (vxInfoOf(s.vs || tcgIdFor(s.expName), s.num, s.vp) || {}).vb || 'SP' } : {}));
      L.q += back;
    }
    if (s.sbTook && s.sbk) {
      const X = state.standby[s.sbk] || (state.standby[s.sbk] = Object.assign({}, s.sbx || { s: '', sn: s.expName, u: s.num, rev: s.rev, lang: s.lang, n: s.name }, { q: 0 }));
      X.q += s.sbTook;
    }
    state.sold.splice(+bt.dataset.undo, 1);
    logOp('riportata', s.expName || '', `Annullata la vendita di ${s.num} ${s.name}${s.rev ? ' Reverse' : ''} ×${s.q}${s.order ? ' (ordine #' + s.order + ')' : ''}${back ? `: ${back} tornano in vendita` : ''}`, s.q);
    save(); refresh();
  });
  $('xSales').onclick = () => downloadCsv(`vendite-${dayKey(a)}_${dayKey(+b - 1)}.csv`,
    [['Data', 'Ordine', 'Canale', 'Acquirente', 'Set', 'Numero', 'Nome', 'Rarità', 'Variante', 'Lingua', 'Quantità', 'Prezzo', 'Totale', 'Giorni in vendita']].concat(
      list.sort((x, y) => new Date(x.date) - new Date(y.date)).map(s => [fmtD(s.date), s.order || '', chOf(s), s.buyer || '', setOf(s), s.num, s.name,
        rarIt(state.cm[s.exp]?.cards?.[s.p]?.r) || '', vLab(s), (s.lang || '').toUpperCase(), s.q, s.price ?? '',
        s.price != null ? +(s.price * s.q).toFixed(2) : '', s.listed ? Math.round((new Date(s.date) - new Date(s.listed)) / DAY) : ''])));
}

function downloadCsv(name, rows) {
  const cell = v => { if (typeof v === 'number') return String(v).replace('.', ','); const t = String(v ?? ''); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click();
}

// ---------- lettura dei PDF (ordini di Cardmarket) ----------
async function pdfText(file) {
  if (!window.pdfjsLib) await new Promise(r => setTimeout(r, 1500));
  if (!window.pdfjsLib) throw new Error('lettore PDF non caricato: ricarica la pagina');
  // isEvalSupported: false → il PDF non può far eseguire codice (vedi CVE-2024-4367); niente script dentro i PDF
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false, enableScripting: false }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const rows = new Map();
    tc.items.forEach(it => { const y = Math.round(it.transform[5] / 3) * 3; (rows.get(y) || rows.set(y, []).get(y)).push(it); });
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) =>
      lines.push(its.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return lines.join('\n');
}
function textOf(raw) {
  if (/<br|<html|<body/i.test(raw)) raw = new DOMParser().parseFromString(raw.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
  return raw.replace(/ /g, ' ');
}
// ---------- ordine / spedizione di Cardmarket ----------
// riga tipo: "1 Mimikyu 037 IT NM PAF R Reverse Holo - Collezione Personale 0,02 EUR"
const ORDER_LINE = /^(\d+)\s+(.+?)\s+([A-Z]{0,4}\d{1,3}[a-z]?)\s+(IT|EN|FR|DE|ES|PT|JP|JA|KO|ZH|RU|NL)\s+(MT|NM|EX|GD|LP|PL|PO)\s+([A-Z0-9-]{2,6})\s+(.*?)\s*(\d{1,4}(?:\.\d{3})*,\d{2})\s*(?:EUR|€)\s*$/;
const LANG_CODE = { IT: 'it', EN: 'en', FR: 'fr', DE: 'de', ES: 'es', PT: 'pt', JP: 'ja', JA: 'ja' };
function parseOrder(text) {
  const items = [];
  text.split(/\n/).forEach(raw => {
    const m = raw.trim().match(ORDER_LINE);
    if (!m) return;
    items.push({ line: raw.trim(), qty: +m[1], name: m[2], num: m[3], lang: LANG_CODE[m[4]] || m[4].toLowerCase(), cond: m[5], code: m[6],
      rev: /reverse\s*holo/i.test(m[7]), rar: (m[7].match(/^\S+/) || [''])[0], com: m[7].replace(/^\S+\s*/, '').trim(), price: parseFloat(m[8].replace(/\./g, '').replace(',', '.')) });
  });
  if (!items.length) return null;
  const id = (text.match(/Spedizione\s*#\s*(\d+)/i) || text.match(/#\s*(\d{6,})/) || [])[1] || '';
  const d = text.match(/Pagato:\s*(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/i) || text.match(/Inviato:\s*(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/i);
  const date = d ? new Date(+d[3], +d[2] - 1, +d[1], +(d[4] || 12), +(d[5] || 0)).toISOString() : today();
  const buyer = (text.match(/Acquirente\s*-\s*(\S+)/i) || [])[1] || '';
  const money = re => { const m = text.match(re); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null; };
  const x = { ship: money(/(?:Spese di spedizione|Costi? di spedizione|Spedizione)\s*:?\s*(\d{1,4}(?:\.\d{3})*,\d{2})\s*(?:EUR|€)/i),
    tot: money(/(?:Totale(?: ordine)?|Importo totale)\s*:?\s*(\d{1,5}(?:\.\d{3})*,\d{2})\s*(?:EUR|€)/i),
    val: money(/Valore dell.oggetto\s*:?\s*(\d{1,5}(?:\.\d{3})*,\d{2})\s*(?:EUR|€)/i),
    n: +((text.match(/Contenuto\s+(\d+)\s+articol/i) || [])[1] || 0) || null,
    trustee: ((text.match(/Trustee Service\s+(\S+)/i) || [])[1] || '').trim(),
    method: ((text.match(/(?:Tipo|Metodo) di spedizione\s*:?\s*([^\n]+)/i) || [])[1] || '').trim().slice(0, 80) };
  const seller = (text.match(/Venditore\s*-\s*(\S+)/i) || [])[1] || '';
  return { id, date, buyer, seller, items, x };
}
const setCodeMemo = {};
const setCode = l => {
  const c = state.cm[l.exp]?.cards?.[l.p]?.c; if (c) return c;
  const mk = l.exp + '|' + (l.expName || '');
  if (!(mk in setCodeMemo)) { const nm = l.expName || state.cm[l.exp]?.name || ''; setCodeMemo[mk] = Object.values(state.cm[l.exp]?.cards || {}).find(c => c.c)?.c || siglaOf(tcgIdFor(nm), nm) || ''; }
  return setCodeMemo[mk];
};
function orderCandidates(it) {
  // stessa sigla del set e stesso numero; prima quelle con stessa variante e lingua
  return Object.entries(state.listings)
    .filter(([, l]) => setCode(l).toUpperCase() === it.code.toUpperCase() && norm(l.u) === norm(it.num))
    .map(([k, l]) => ({ k, l, exact: l.rev === it.rev && l.lang === it.lang }))
    .sort((a, b) => b.exact - a.exact);
}
/** sigla del set (es. 30C, DLR) → espansione di Cardmarket conosciuta */
function expByCode(code) {
  code = String(code || '').toUpperCase();
  return Object.values(state.cm).find(e => Object.values(e.cards || {}).some(c => String(c.c || '').toUpperCase() === code)) || null;
}
function orderReview(o, file, pos) {
  state.orders = state.orders || {};
  const dup = o.id && state.orders[o.id];
  const tot = o.items.reduce((a, it) => a + it.price * it.qty, 0);
  const n = o.items.reduce((a, it) => a + it.qty, 0);
  // se l'ordine era già stato caricato: le righe già registrate (stesso numero, variante e prezzo) non si ripetono
  const done = o.id ? state.sold.filter(s => s.order === o.id).map(s => ({ num: norm(s.num), rev: !!s.rev, price: r2(s.price || 0), q: s.q })) : [];
  const rows = o.items.map(it => {
    const r = Object.assign({ cands: orderCandidates(it) }, it);
    let need = it.qty;
    done.forEach(d => { if (need && d.q > 0 && d.num === norm(it.num) && d.rev === !!it.rev && d.price === r2(it.price)) { const t = Math.min(need, d.q); d.q -= t; need -= t; } });
    r.left = need;
    return r;
  });
  const miss = rows.filter(r => r.left > 0).length, found = rows.filter(r => r.cands.length).length;
  // copie disponibili nel gestionale, consumate riga per riga (due righe della stessa carta a prezzi diversi)
  const warnOf = () => {
    const B = $('dlgBody'), rem = {};
    rows.forEach((r, i) => {
      const w = B.querySelector(`[data-w="${i}"]`); if (!w) return;
      const cb = B.querySelector(`[data-i="${i}"]`), qn = Math.max(1, +B.querySelector(`[data-q="${i}"]`).value || 1);
      if (!r.cands.length) { w.textContent = cb.checked ? 'Non è tra le carte in vendita del gestionale: registro solo la vendita.' : ''; return; }
      const c = r.cands[+B.querySelector(`[data-s="${i}"]`).value];
      if (!(c.k in rem)) rem[c.k] = state.listings[c.k]?.q || 0;
      if (!cb.checked) { w.textContent = ''; return; }
      w.textContent = qn > rem[c.k] ? `⚠ Nel gestionale ${rem[c.k] === 0 ? 'non ne resta nessuna copia' : rem[c.k] === 1 ? 'ne resta 1 sola copia' : `ne restano ${rem[c.k]}`}: registro comunque la vendita per intero (il magazzino scende a 0).` : '';
      rem[c.k] = Math.max(0, rem[c.k] - qn);
    });
  };
  openDlg(`<h3>Ordine Cardmarket ${o.id ? '#' + esc(o.id) : ''}${pos ? ` <span class="small">· ${pos}</span>` : ''}</h3>
    <p class="small">Pagato il ${new Date(o.date).toLocaleDateString('it-IT')}${o.buyer ? ' · acquirente ' + esc(o.buyer) : ''} · ${n} carte · ${eur(tot)}${o.x?.ship != null ? ` + spedizione ${eur(o.x.ship)}` : ''} ·
      <b>${found}/${rows.length}</b> righe trovate tra le carte in vendita</p>
    ${dup ? `<p style="color:#c8372d;font-weight:600">⚠ Questo ordine è già stato caricato il ${new Date(dup.at).toLocaleDateString('it-IT')}. ${miss ? (miss === 1 ? 'È spuntata solo la riga che manca nelle vendite del gestionale.' : `Sono spuntate solo le ${miss} righe che mancano nelle vendite del gestionale.`) : 'Tutte le righe sono già registrate: non serve fare nulla (aggiorno solo i dettagli dell\'ordine).'}</p>` : ''}
    <div style="max-height:55vh;overflow:auto"><table><tr><th></th><th>Riga dell'ordine</th><th>Carta in vendita</th><th>Q.tà</th><th>Prezzo</th></tr>
    ${rows.map((r, i) => `<tr style="${r.left ? '' : 'opacity:.55'}">
      <td><input type="checkbox" data-i="${i}" ${r.left > 0 && (!r.cands.length || r.cands[0].exact || dup) ? 'checked' : ''}></td>
      <td>${esc(r.code)} ${esc(r.num)} <b>${esc(r.name)}</b>${r.rev ? ' <b style="color:var(--rev)">Reverse</b>' : ''} <span class="small">${esc(r.lang.toUpperCase())} ${esc(r.cond)}${r.com ? ' · ' + esc(r.com) : ''}</span>${r.left ? '' : '<div class="small">già registrata</div>'}</td>
      <td>${r.cands.length ? `<select data-s="${i}">${r.cands.map((c, j) => `<option value="${j}">${esc(c.l.u)} ${esc(state.cm[c.l.exp]?.cards?.[c.l.p]?.n || '')} · ${esc(vLab(c.l))} · ${esc((c.l.lang || '').toUpperCase())} (${c.l.q} in vendita)${c.exact ? '' : ' ⚠ variante diversa'}</option>`).join('')}</select>` : ''}
        <div class="small" data-w="${i}" style="color:var(--var)"></div></td>
      <td><input type="number" min="1" value="${r.left || r.qty}" data-q="${i}" style="width:56px"></td><td>${eur(r.price)}</td></tr>`).join('')}</table></div>
    <p class="row" style="justify-content:space-between"><span class="small" id="oSum"></span><span><button id="dClose">${pos ? 'Salta questo ordine' : 'Annulla'}</button> <button class="pri" id="dApply">Registra la vendita</button></span></p>`, () => {
    $('dClose').onclick = closeDlg;
    // riepilogo: quello che registro deve tornare con il totale dell'ordine
    const sumOf = () => {
      const B = $('dlgBody'); let q = 0, v = 0;
      rows.forEach((r, i) => { if (!B.querySelector(`[data-i="${i}"]`).checked) return; const n0 = Math.max(1, +B.querySelector(`[data-q="${i}"]`).value || 1); q += n0; v += n0 * r.price; });
      const leftQ = rows.reduce((a, r) => a + r.left, 0), leftV = rows.reduce((a, r) => a + r.left * r.price, 0);
      const okk = q === leftQ && Math.abs(v - leftV) < 0.005;
      $('oSum').innerHTML = `Registro <b>${q}</b> carte per <b>${eur(v)}</b>` + (dup ? ` (mancavano ${leftQ} carte, ${eur(leftV)})` : ` su ${n} carte, ${eur(tot)} dell'ordine`) +
        (okk ? ' ✔' : ` · <b style="color:var(--var)">⚠ non corrisponde: controlla le righe non spuntate</b>`);
    };
    $('dlgBody').querySelectorAll('[data-i],[data-q],[data-s]').forEach(x => x.onchange = () => { warnOf(); sumOf(); });
    warnOf(); sumOf();
    $('dApply').onclick = () => {
      const B = $('dlgBody'), ref = o.id ? 'Ordine #' + o.id : file, meta = { order: o.id, buyer: o.buyer };
      let q = 0; const soldTxt = [];
      rows.forEach((r, i) => {
        if (!B.querySelector(`[data-i="${i}"]`).checked) return;
        const n0 = Math.max(1, +B.querySelector(`[data-q="${i}"]`).value || 1);
        const c = r.cands.length ? r.cands[+B.querySelector(`[data-s="${i}"]`).value] : null;
        if (c && state.listings[c.k]) sell(c.k, n0, 'Cardmarket', ref, r.price, o.date, Object.assign({ force: 1 }, meta));
        else {
          // carta venduta che il gestionale non ha (o non ha più): registro solo la vendita, così l'incasso torna con Cardmarket
          const E = c ? state.cm[c.l.exp] : expByCode(r.code);
          state.sold.push({ date: o.date, listed: c?.l.date || null, p: c?.l.p || null, exp: E?.id || c?.l.exp || '', expName: E?.name || c?.l.expName || r.code, name: r.name, num: r.num,
            rev: r.rev, lang: r.lang, q: n0, price: r.price, source: 'Cardmarket', file: ref, order: o.id || '', buyer: o.buyer || '', nolist: 1, ...(c?.l?.vp ? { vp: c.l.vp, vl: c.l.vl, vs: c.l.vs } : {}) });
        }
        q += n0; soldTxt.push(`${r.num}${r.rev ? ' R' : ''} ${r.name} ×${n0} a ${eur(r.price)}`);
      });
      if (o.id) state.orders[o.id] = { at: dup?.at || today(), n: (dup?.n || 0) + q, date: o.date, buyer: o.buyer, seller: o.seller || '', file, x: o.x || {},
        items: o.items.map(it => ({ qty: it.qty, name: it.name, num: it.num, lang: it.lang, cond: it.cond, code: it.code, rar: it.rar || '', com: it.com || '', rev: it.rev, price: it.price })) };
      logOp('venduta', '', `Ordine ${o.id ? '#' + o.id : file}${o.buyer ? ' (' + o.buyer + ')' : ''}${dup ? ' (ricaricato)' : ''}: ${soldTxt.join(', ') || 'nessuna riga nuova, aggiornati i dettagli'}`, q);
      save(); closeDlg(); refresh(); toast(`Ordine ${o.id ? '#' + o.id + ' ' : ''}registrato: ${q} carte`);
    };
  });
}

async function importSales(files) {
  const orders = [], other = [];
  for (const f of files) {
    let text;
    try { text = /\.pdf$/i.test(f.name) ? await pdfText(f) : textOf(await f.text()); } catch (e) { alert(`"${f.name}": ${e.message}`); continue; }
    const order = parseOrder(text);
    if (order) orders.push({ o: order, f: f.name }); else other.push(f.name);
  }
  if (other.length) alert(`${other.join(', ')}: non ${other.length === 1 ? 'è un ordine' : 'sono ordini'} di Cardmarket.\n\nCarica il PDF dell'ordine (o della spedizione) scaricato da Cardmarket.`);
  if (!orders.length) return;
  // più ordini insieme: un riquadro alla volta, il successivo si apre quando chiudi quello prima
  const tot = orders.length; let i = 0;
  const next = () => {
    const x = orders.shift(); if (!x) return;
    i++;
    $('dlg').addEventListener('close', () => setTimeout(next, 150), { once: true });
    orderReview(x.o, x.f, tot > 1 ? `ordine ${i} di ${tot}` : '');
  };
  next();
}
function sell(k, q, source, file, price, date, meta) {
  const L = state.listings[k]; let n0;
  if (!L) return;
  const c = state.cm[L.exp]?.cards?.[L.p] || {};
  const n = Math.min(q, L.q);
  L.q -= n;
  if (meta?.force) n0 = q; else n0 = n;
  state.sold.push({ date: date || today(), listed: L.date, p: L.p, exp: L.exp, expName: L.expName, name: c.n || '', num: L.u || c.u || '', rev: L.rev, lang: L.lang, q: n0,
    price: price != null ? price : L.price, source, file: file || '', order: meta?.order || '', buyer: meta?.buyer || '', took: n, ...(L.vp ? { vp: L.vp, vl: L.vl, vs: L.vs } : {}) });
  if (L.q <= 0) delete state.listings[k];
}

// ---------- prezzi di mercato (automatici: TCGdex + Price Guide di Cardmarket) ----------
// state.market[chiave carta in vendita] e state.sbMarket[chiave standby] =
//   {v:2, lo: "Da" (prezzo minimo), t: tendenza, rv: 1 se valori Reverse, rn: 1 se Reverse ma valori della normale,
//    src: 'pg' | 'tcgdex', x: 1 se TCGdex abbina un altro prodotto Cardmarket, upd: data dei prezzi, at: quando l'ho letto}
//    a: media vendite, a1 / a7 / a30: media vendite ultimo giorno / 7 / 30 giorni (per le Reverse i valori -holo)
// state.pg = {v:2, at, p:{idProduct:[low, trend, avg, avg1, avg7, avg30, e gli stessi 6 Reverse]}}  Price Guide ridotta alle carte che conosco
// Carta in vendita: rb = base del prezzo ('low' = Da, 'trend' = Tendenza), ro = ± centesimi,
//   ref = valore di mercato al caricamento (o all'ultima conferma), refAt, pAt = data del prezzo.
// Ogni variazione del valore di mercato rispetto a ref, anche di 0,01 €, viene segnalata finché non la confermi.
const r2 = v => Math.round(v * 100) / 100;
const PG_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json';
const PG_PAGE = 'https://www.cardmarket.com/it/Pokemon/Data/Price-Guide';
const AUTO_H = 12;  // ogni quante ore aggiorno da solo
const BASEN = { low: 'Da', trend: 'Tendenza', cons: 'Consigliato' };
const mOf = k => { const M = (state.market || {})[k]; return M && M.v === 2 ? M : null; };
const sbmOf = k => { const M = (state.sbMarket || {})[k]; return M && M.v === 2 ? M : null; };
const baseOf = (M, b) => M ? (b === 'trend' ? M.t : b === 'cons' ? consOf(M)?.v ?? null : M.lo) : null;
// se manca il valore scelto: Da ↔ Tendenza; per il Consigliato prima Da, poi Tendenza
const BASEALT = { low: ['trend'], trend: ['low'], cons: ['low', 'trend'] };
const fmtDT = d => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const ruleTxt = L => `${BASEN[L.rb || 'low']}${L.ro ? ` ${L.ro > 0 ? '+' : '−'} ${eur(Math.abs(L.ro) / 100)}` : ''}`;
/** variazione del prezzo di mercato per una carta in vendita (null = nessuna) */
function varOf(k, L) {
  if (!L) return null;
  const M = mOf(k);
  if (M && L.rev && !M.rv) return null; // per una Reverse confronto solo con valori Reverse
  const cur = baseOf(M, L.rb || 'low');
  if (cur == null || L.ref == null || r2(cur) === r2(L.ref) || !bigDiff(cur, L.ref)) return null;
  const sugg = r2(Math.max(0.02, cur + (L.ro || 0) / 100));
  return { cur, ref: L.ref, d: r2(cur - L.ref), sugg, diff: L.price != null ? r2(sugg - L.price) : null, M };
}
/** soglia: una differenza conta solo se è di almeno c centesimi E almeno pct % (state.thr) */
function thrCfg() { return state.thr || (state.thr = { c: 2, pct: 10 }); }
function bigDiff(a, b) { const d = Math.abs(a - b), t = thrCfg(); return d >= t.c / 100 - 1e-9 && d >= Math.max(a, b) * t.pct / 100 - 1e-9; }
/** carta in vendita fuori mercato: il tuo prezzo è lontano dal Consigliato (oltre la soglia) */
function outOf(k, L) {
  if (!L || L.price == null) return null;
  const M = mOf(k);
  if (!M || (L.rev && !M.rv)) return null;
  const C = consOf(M);
  if (!C || !bigDiff(L.price, C.v)) return null;
  return { dir: L.price > C.v ? 'hi' : 'lo', cons: C.v, d: r2(L.price - C.v), pct: Math.round((L.price - C.v) / C.v * 100), M };
}
const outAll = () => Object.entries(state.listings).map(([k, l]) => ({ k, l, o: outOf(k, l) })).filter(x => x.o);
function variations(filterFn) {
  return Object.entries(state.listings).filter(([k, l]) => !filterFn || filterFn(k, l))
    .map(([k, l]) => ({ k, l, v: varOf(k, l) })).filter(x => x.v);
}

// --- Price Guide: file JSON di Cardmarket (scaricato da solo se il browser lo permette, altrimenti caricato a mano) ---
function pgKeep() {
  const s = new Set(Object.values(state.listings).map(l => String(l.p)));
  Object.values(state.cm).forEach(e => Object.keys(e.cards || {}).forEach(p => s.add(String(p))));
  Object.values(state.standby || {}).forEach(x => { if (x.vp) s.add(String(x.vp)); });
  return s;
}
function pgImport(d) {
  const list = Array.isArray(d) ? d : (d && (d.priceGuides || d.priceguides));
  if (!Array.isArray(list) || !list.length || !('idProduct' in list[0])) throw new Error('non è una Price Guide di Cardmarket');
  const keep = pgKeep(), p = {};
  const n = v => (v = +v) > 0 ? r2(v) : null;
  list.forEach(x => { if (keep.has(String(x.idProduct))) p[x.idProduct] = [...MK.map(f => n(x[f])), ...MK.map(f => n(x[f + '-holo']))]; });
  state.pg = { v: 2, at: d.createdAt ? new Date(d.createdAt).toISOString() : today(), p };
  return Object.keys(p).length;
}
async function pgAuto() {
  if (state.pg && state.pg.v === 2 && Date.now() - new Date(state.pg.at) < 20 * 3600e3) return true;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch(PG_URL, { signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) throw 0;
    pgImport(await r.json());
    state.pgAuto = 1;
    return true;
  } catch (e) { state.pgAuto = 0; return false; }
}
async function pgFile(f) {
  try {
    const n = pgImport(JSON.parse(await f.text()));
    save(); toast(`Price Guide caricata: ${n} carte tue trovate`);
    updatePrices(true);
  } catch (e) { alert('File non valido: ' + (e.message || e) + '.\nScarica il file "Pokémon" dalla pagina Price Guide di Cardmarket.'); }
}

// --- TCGdex: prezzi Cardmarket dentro il dettaglio della carta ---
async function tcgJson(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}
async function tcgCardId(l) {
  const setId = l.s || lSid(l);
  if (!setId) return null;
  const n0 = norm(l.u);
  for (const p of ['/sets/' + encodeURIComponent(setId), '@en/sets/' + encodeURIComponent(setId)]) {
    const S = await tcg(p, 24);
    const c = (S?.cards || []).find(x => norm(x.localId) === n0);
    if (c) return c.id;
  }
  return null;
}
async function tcgPrice(l) {
  const id = await tcgCardId(l);
  if (!id) return null;
  for (const base of [API, API_EN]) {
    const d = await tcgJson(base + '/cards/' + encodeURIComponent(id));
    if (!d) continue;
    if (base === API || !varCache(id)) varStore(id, d);      // già che ci sono: le varianti della carta
    if (l.vp) {
      // variante speciale: i prezzi Cardmarket del suo prodotto
      const v = (d.variants_detailed || []).find(v => String(v?.thirdParty?.cardmarket || '') === String(l.vp));
      if (v?.pricing?.cardmarket) return v.pricing.cardmarket;
      continue;
    }
    const cm = d?.pricing?.cardmarket;
    if (cm) return cm;
  }
  return null;
}
const pos = v => (v = +v) > 0 ? r2(v) : null;
// i 6 valori di Cardmarket, nell'ordine in cui li salvo
const MK = ['low', 'trend', 'avg', 'avg1', 'avg7', 'avg30'], MF = ['lo', 't', 'a', 'a1', 'a7', 'a30'];
/** v = [6 valori normale, 6 valori Reverse] (Price Guide vecchia: [low, trend, lowR, trendR]) */
function fromVals(l, v) {
  if (v.length === 4) v = [v[0], v[1], null, null, null, null, v[2], v[3], null, null, null, null];
  const pick = off => Object.fromEntries(MF.map((f, i) => [f, v[off + i] ?? null]));
  const R = pick(6);
  if (l.rev && (R.lo != null || R.t != null)) return Object.assign(R, { rv: 1 });
  return Object.assign(pick(0), { rn: l.rev ? 1 : 0 });
}
/** "Consigliato": a metà tra "Da" (l'offerta più bassa) e il prezzo a cui la carta si vende davvero
 *  (mediana di Tendenza, Media, Media 7 g, Media 30 g; la media di 1 giorno è troppo ballerina e non la uso). */
function consOf(M) {
  if (!M) return null;
  // valori anomali: nella Price Guide a volte una vendita fuori scala gonfia Media o Media 30 g (es. Oddish 001 di
  // Ascesa Eroica: Tendenza 0,02 €, Media 0,40 €, 30 g 0,45 €, mentre su Cardmarket la media 30 g è 0,04 €).
  // Riferimento = valori recenti (Tendenza, 7 g, 1 g); scarto chi supera sia 3 volte il riferimento sia il riferimento + 0,20 €.
  const fin = v => v != null && isFinite(v);
  const rec = [M.t, M.a7, M.a1].filter(fin).sort((a, b) => a - b);
  const ref = rec.length ? (rec.length % 2 ? rec[(rec.length - 1) / 2] : (rec[rec.length / 2 - 1] + rec[rec.length / 2]) / 2) : null;
  const lim = ref != null ? Math.max(ref * 3, ref + 0.2) : Infinity;
  const drop = [['Tendenza', M.t], ['Media', M.a], ['7 g', M.a7], ['30 g', M.a30]].filter(([, v]) => fin(v) && v > lim);
  const s = [M.t, M.a, M.a7, M.a30].filter(v => fin(v) && v <= lim).sort((a, b) => a - b);
  const med = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  if (!isFinite(M.lo)) M = Object.assign({}, M, { lo: null });
  if (med == null && M.lo == null) return null;
  const R = med == null ? { v: r2(Math.max(0.02, M.lo)), med: null } : (M.lo == null || M.lo >= med) ? { v: r2(Math.max(0.02, med)), med } : { v: r2(Math.max(0.02, (M.lo + med) / 2)), med };
  if (drop.length) R.drop = drop;
  return R;
}
/** idProduct Cardmarket di una carta in standby (dall'elenco del set inviato dallo script, se c'è) */
/** prodotto Cardmarket della carta base secondo TCGdex (se le varianti della carta sono già state lette) */
function tcgBaseOf(setId, u) {
  for (const p of ['/sets/' + encodeURIComponent(setId), '@en/sets/' + encodeURIComponent(setId)]) {
    let S = mem[p];
    if (!S) { try { S = (JSON.parse(localStorage.getItem('tcg:' + p)) || {}).d; } catch (e) {} }
    const c = (S?.cards || []).find(x => norm(x.localId) === norm(u));
    if (c) { const V = varCache(c.id); return V && V.base ? String(V.base) : null; }
  }
  return null;
}
function sbPid(S) {
  if (S.vp) return S.vp;
  // nella pagina del set Cardmarket può avere più prodotti con lo stesso numero (Non Holo, timbrate…): vale quello base di TCGdex
  const b = S.s && tcgBaseOf(S.s, S.u);
  if (b) return b;
  const E = cmCatalogFor(S.sn || tcgSets.find(x => x.id === S.s)?.name || '');
  const c = E && Object.values(E.cards || {}).find(c => norm(c.u) === norm(S.u));
  return c ? c.p : null;
}
async function readMarket(l, pid) {
  const pgFresh = state.pg && state.pg.v === 2 && Date.now() - new Date(state.pg.at) < 3 * 86400e3;
  if (l.vp) {
    // varianti speciali: Cardmarket le tratta come "Reverse Holo" (casella fissa): uso i valori holo, se mancano quelli normali
    const mk = (src, upd, arr) => Object.assign({ v: 2, src, upd }, fromVals({ rev: true }, arr), { rn: 0, vx: 1 });
    if (pgFresh && state.pg.p[l.vp]) return mk('pg', state.pg.at, state.pg.p[l.vp]);
    const cm = await tcgPrice(l);
    if (cm) { const M = mk('tcgdex', cm.updated || null, [...MK.map(f => pos(cm[f])), ...MK.map(f => pos(cm[f + '-holo']))]); if (cm.idProduct && String(cm.idProduct) !== String(l.vp)) M.x = 1; return M; }
    if (state.pg?.p?.[l.vp]) return mk('pg', state.pg.at, state.pg.p[l.vp]);
    return null;
  }
  const pg = pid && pgFresh && state.pg.p[pid];
  if (pg) return Object.assign({ v: 2, src: 'pg', upd: state.pg.at }, fromVals(l, pg));
  const cm = await tcgPrice(l);
  if (cm) {
    const M = Object.assign({ v: 2, src: 'tcgdex', upd: cm.updated || null }, fromVals(l, [...MK.map(f => pos(cm[f])), ...MK.map(f => pos(cm[f + '-holo']))]));
    if (pid && cm.idProduct && String(cm.idProduct) !== String(pid)) M.x = 1;
    return M;
  }
  if (pid && state.pg?.p?.[pid]) return Object.assign({ v: 2, src: 'pg', upd: state.pg.at }, fromVals(l, state.pg.p[pid]));
  return null;
}
let upd = null; // aggiornamento in corso
async function updatePrices(force) {
  if (upd) return upd;
  state.standby = state.standby || {};
  const jobs = [
    ...Object.entries(state.listings).map(([k, l]) => ({ k, l, sb: false })),
    ...Object.entries(state.standby).map(([k, l]) => ({ k, l, sb: true }))
  ];
  if (!jobs.length) return;
  upd = (async () => {
    const prog = { done: 0, tot: jobs.length, copies: jobs.reduce((a, j) => a + (j.l.q || 0), 0) };
    showProg(prog);
    await pgAuto();
    state.market = state.market || {}; state.sbMarket = state.sbMarket || {};
    let i = 0, nNew = 0, fetched = 0, failed = 0;
    const before = new Set(variations().map(x => x.k));
    const worker = async () => {
      while (i < jobs.length) {
        const { k, l, sb } = jobs[i++];
        const store = sb ? state.sbMarket : state.market;
        const old = store[k];
        if (!force && old && old.v === 2 && Date.now() - new Date(old.at) < AUTO_H * 3600e3) { prog.done++; continue; }
        const M = await readMarket(l, sb ? sbPid(l) : l.p);
        fetched++;
        const st2 = sb ? state.sbMarket : state.market;   // (lo stato può essere stato sostituito da un Annulla nel frattempo)
        if (!M && old && old.v === 2 && (old.lo != null || old.t != null)) { failed++; prog.done++; showProg(prog); continue; }
        st2[k] = Object.assign(M || { v: 2, src: '', lo: null, t: null }, { at: today() });
        if (M && (!l.rev || M.rv)) histAdd(l, M);
        if (!sb) {
          // carte messe in vendita prima di questa versione: il primo valore letto diventa il riferimento
          const cur = baseOf(M, l.rb || 'low');
          if (l.ref == null && cur != null && (!l.rev || M.rv)) { l.ref = cur; l.refAt = M.upd || today(); if (!l.rb) l.rb = 'low'; if (l.ro == null) l.ro = 0; }
          if (varOf(k, l)) nNew++;
        }
        prog.done++;
        showProg(prog);
      }
    };
    await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
    const bySet = {};
    jobs.forEach(({ l, sb }) => { const n = sb ? (l.sn || l.s) : (l.expName || state.cm[l.exp]?.name || '?'); bySet[n] = (bySet[n] || 0) + 1; });
    if (!fetched) { showProg(null); return { nNew, tot: jobs.length, copies: prog.copies, bySet, failed }; }   // erano già tutti aggiornati
    if (failed < fetched) state.revAt = today();
    const fresh = variations().filter(x => !before.has(x.k));
    const bySetV = {};
    fresh.forEach(({ l, v }) => { const sn = l.expName || state.cm[l.exp]?.name || ''; (bySetV[sn] = bySetV[sn] || []).push(`${cardTxt(l)} ${BASEN[l.rb || 'low']} ${eur(v.ref)} → ${eur(v.cur)}`); });
    Object.entries(bySetV).forEach(([sn, a]) => logOp('mercato', sn, `Nuove variazioni del prezzo di mercato: ${a.join(', ')}`, null));
    softSave();
    showProg(null);
    refresh();
    if (failed && force) toast(`${failed} carte non lette (TCGdex non risponde o manca internet): ho tenuto i prezzi di prima`);
    return { nNew, tot: jobs.length, copies: prog.copies, bySet, failed };
  })();
  try { return await upd; } finally { upd = null; }
}
function showProg(p) {
  const b = $('sUpd');
  if (!b) return;
  b.disabled = !!p;
  b.textContent = p ? `🔄 Aggiorno ${p.done} di ${p.tot}…` : '🔄 Aggiorna adesso';
}

// --- conferma delle variazioni ---
/** hai cambiato il prezzo su Cardmarket (o decidi di tenerlo): il valore di mercato di oggi diventa il nuovo riferimento */
function confirmVar(k, newPrice) {
  const L = state.listings[k], v = varOf(k, L);
  if (!L || !v) return;
  const set = L.expName || state.cm[L.exp]?.name;
  if (newPrice != null && !isNaN(newPrice)) {
    logOp('prezzo', set, `${cardTxt(L)}: prezzo ${eur(L.price)} → ${eur(r2(newPrice))} (mercato ${BASEN[L.rb || 'low']} ${eur(v.ref)} → ${eur(v.cur)})`, L.q);
    L.price = r2(newPrice); L.pAt = today();
  } else logOp('prezzo', set, `${cardTxt(L)}: tenuto il prezzo ${eur(L.price)} (mercato ${BASEN[L.rb || 'low']} ${eur(v.ref)} → ${eur(v.cur)})`, L.q);
  L.ref = v.cur; L.refAt = v.M.upd || today();
}
function varDialog(rows, title) {
  if (!rows.length) { alert('Nessuna variazione da confermare.'); return; }
  rows.sort((a, b) => (parseInt(a.l.u) || 0) - (parseInt(b.l.u) || 0) || a.l.rev - b.l.rev);
  openDlg(`<h3>${esc(title)}</h3>
    <p class="small">Per ogni carta: se hai cambiato il prezzo su Cardmarket scrivi il nuovo prezzo (è già proposto quello consigliato) e premi <b>✔ Prezzo cambiato</b>.
    Se decidi di tenere il prezzo attuale premi <b>Tengo il mio</b>. In tutti e due i casi il valore di mercato di oggi diventa il nuovo riferimento e la segnalazione sparisce, finché il mercato non cambia di nuovo.</p>
    <table class="rtable"><thead><tr><th>Carta</th><th>Variante</th><th class="n">Qtà</th><th class="n">Tuo prezzo</th><th>Regola</th><th class="n">Mercato prima</th><th class="n">Oggi</th><th class="n">Consigliato</th><th class="n">Nuovo prezzo</th><th></th></tr></thead><tbody>
    ${rows.map(({ k, l, v }) => { const I = info(l); return `<tr data-k="${esc(k)}">
      <td><b>${esc(l.u)}</b> ${esc(I.name)}<small>${esc(I.set)}</small></td>
      <td>${l.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale'}<small>${LANGN[l.lang] || l.lang}</small></td>
      <td class="n">${l.q}</td>
      <td class="n">${eur(l.price)}<small>dal ${fmtD(l.pAt || l.date)}</small></td>
      <td>${ruleTxt(l)}${v.M.rn ? '<small>valori della normale</small>' : ''}${v.M.x ? '<small>⚠ abbinamento da verificare</small>' : ''}</td>
      <td class="n">${eur(v.ref)}<small>${fmtD(l.refAt)}</small></td>
      <td class="n"><b>${eur(v.cur)}</b><small class="${v.d > 0 ? 'down' : 'up'}">${v.d > 0 ? '▲ +' : '▼ −'}${eur(Math.abs(v.d))}</small></td>
      <td class="n"><b>${eur(v.sugg)}</b></td>
      <td class="n"><input type="number" min="0.02" step="0.01" class="vP" value="${v.sugg.toFixed(2)}"></td>
      <td style="white-space:nowrap"><button class="sm pri" data-ok="1">✔ Prezzo cambiato</button> <button class="sm" data-keep="1">Tengo il mio</button></td></tr>`; }).join('')}
    </tbody></table>
    <p class="row" style="justify-content:space-between;margin-top:12px"><span><button id="vAll">✔ Ho messo il consigliato a tutte</button> <button id="vKeepAll">Tengo il mio a tutte</button> <button id="vScript" title="Lo script Card Scanner scrive i nuovi prezzi su Cardmarket">✏️ Cambiali con lo script</button></span><button id="dClose">Chiudi</button></p>`, () => {
    $('dClose').onclick = closeDlg;
    $('vScript').onclick = () => { const L0 = rows[0]?.l; openPriceEdit(rows.every(r => (r.l.expName || '') === (L0?.expName || '')) ? (L0?.expName || state.cm[L0?.exp]?.name || '') : ''); };
    const done = tr => { tr.style.opacity = '.35'; tr.querySelectorAll('button,input').forEach(x => x.disabled = true); save(); refresh(); };
    $('dlgBody').querySelectorAll('[data-ok]').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'), p = parseFloat(tr.querySelector('.vP').value);
      if (isNaN(p) || p <= 0) { alert('Scrivi il nuovo prezzo.'); return; }
      confirmVar(tr.dataset.k, p); done(tr);
    });
    $('dlgBody').querySelectorAll('[data-keep]').forEach(b => b.onclick = () => { const tr = b.closest('tr'); confirmVar(tr.dataset.k, null); done(tr); });
    $('vAll').onclick = () => {
      const trs = [...$('dlgBody').querySelectorAll('tbody tr')].filter(tr => !tr.querySelector('[data-ok]').disabled);
      if (!trs.length || !confirm(`Confermi di aver messo su Cardmarket il prezzo consigliato a tutte le ${trs.length} carte rimaste?`)) return;
      trs.forEach(tr => { const k = tr.dataset.k; confirmVar(k, varOf(k, state.listings[k])?.sugg); tr.style.opacity = '.35'; tr.querySelectorAll('button,input').forEach(x => x.disabled = true); });
      save(); refresh();
    };
    $('vKeepAll').onclick = () => {
      const trs = [...$('dlgBody').querySelectorAll('tbody tr')].filter(tr => !tr.querySelector('[data-ok]').disabled);
      if (!trs.length || !confirm(`Tenere il tuo prezzo attuale per tutte le ${trs.length} carte rimaste? La variazione sparisce e il controllo riparte dal mercato di oggi.`)) return;
      trs.forEach(tr => { confirmVar(tr.dataset.k, null); tr.style.opacity = '.35'; tr.querySelectorAll('button,input').forEach(x => x.disabled = true); });
      save(); refresh();
    };
  });
}

// --- PDF della revisione prezzi di un set ---
function loadJs(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('impossibile caricare ' + src)); document.head.appendChild(s); });
}
async function pdfLib() {
  if (!window.jspdf) await loadJs('lib/jspdf.umd.min.js');
  if (!window.jspdf.jsPDF.API.autoTable) await loadJs('lib/jspdf.plugin.autotable.min.js');
  return window.jspdf.jsPDF;
}
const pdfT = s => String(s ?? '').replace(/−/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');
const eurP = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',') + ' €';
function pdfSetCode(rows, setName) {
  for (const { l } of rows) { const c = state.cm[l.exp]?.cards?.[l.p]?.c; if (c) return c.toUpperCase(); }
  const t = tcgSets.find(x => simp(x.name) === simp(setName));
  return siglaOf(t ? t.id : '', setName) || (t ? t.id : 'SET').toUpperCase();
}
async function pdfVariations(rows, setName) {
  if (!rows.length) { alert('Nessuna variazione di prezzo in questo set.'); return; }
  let JsPDF;
  try { JsPDF = await pdfLib(); } catch (e) { alert('Non riesco a creare il PDF (serve internet): ' + e.message); return; }
  rows = rows.slice().sort((a, b) => (parseInt(a.l.u) || 0) - (parseInt(b.l.u) || 0) || String(a.l.u).localeCompare(String(b.l.u)) || a.l.rev - b.l.rev);
  const code = pdfSetCode(rows, setName);
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(pdfT(`Revisione prezzi - ${setName} (${code})`), 12, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  const upds = rows.map(r => r.v.M.upd).filter(Boolean).sort();
  const nUp = rows.filter(r => r.v.d > 0).length, nDown = rows.length - nUp;
  const dVal = rows.reduce((a, r) => a + (r.v.diff || 0) * r.l.q, 0);
  doc.text(pdfT(`Creato il ${new Date().toLocaleString('it-IT')} · prezzi di mercato Cardmarket del ${upds.length ? fmtD(upds[upds.length - 1]) : '—'} · ${rows.length} righe con variazione (${nUp} in aumento, ${nDown} in calo) · effetto sul valore se applichi i consigliati: ${dVal >= 0 ? '+' : '-'}${eurP(Math.abs(dVal))}`), 12, 21);
  doc.text(pdfT('Mercato = "Da" (prezzo minimo), Tendenza o Consigliato, secondo la regola scelta al caricamento. Consigliato = mercato di oggi con la stessa regola. Dopo aver cambiato il prezzo su Cardmarket, conferma nel gestionale.'), 12, 26, { maxWidth: W - 24 });
  doc.autoTable({
    startY: 35, margin: { left: 8, right: 8 }, theme: 'grid',
    styles: { fontSize: 8.6, cellPadding: 1.6, valign: 'middle', lineColor: [210, 214, 220] },
    headStyles: { fillColor: [28, 33, 40], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 247, 249] },
    head: [['N°', 'Carta', 'Variante', 'Lingua', 'Qtà', 'Tuo prezzo', 'Prezzo dal', 'Regola', 'Mercato al caricamento', 'Mercato oggi', 'Variazione', 'Nuovo prezzo consigliato', 'Differenza', 'Fatto']].map(r => r.map(pdfT)),
    body: rows.map(({ l, v }) => {
      const I = info(l);
      return [l.u, I.name, vLab(l), (l.lang || '').toUpperCase(), l.q, eurP(l.price), fmtD(l.pAt || l.date),
        ruleTxt(l) + (v.M.rn ? ' (val. normale)' : '') + (v.M.x ? ' (!) verifica' : ''), `${eurP(v.ref)}  (${fmtD(l.refAt)})`, eurP(v.cur),
        (v.d > 0 ? '+' : '-') + eurP(Math.abs(v.d)), eurP(v.sugg), v.diff == null ? '' : (v.diff > 0 ? '+' : v.diff < 0 ? '-' : '') + eurP(Math.abs(v.diff)), ''].map(pdfT);
    }),
    columnStyles: { 0: { halign: 'right', cellWidth: 11 }, 1: { cellWidth: 36, fontStyle: 'bold' }, 3: { halign: 'center', cellWidth: 13 }, 4: { halign: 'right', cellWidth: 10 },
      5: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' }, 10: { halign: 'right' }, 11: { halign: 'right', fontStyle: 'bold' }, 12: { halign: 'right' }, 13: { cellWidth: 13 } },
    didParseCell: d => {
      if (d.section !== 'body') return;
      const r = rows[d.row.index];
      if (d.column.index === 10) d.cell.styles.textColor = r.v.d > 0 ? [47, 158, 91] : [229, 72, 77];
      if (d.column.index === 2 && r.l.rev) d.cell.styles.textColor = [166, 79, 209];
    },
    didDrawCell: d => {
      if (d.section === 'body' && d.column.index === 13) { const s = 4; doc.setDrawColor(90); doc.rect(d.cell.x + (d.cell.width - s) / 2, d.cell.y + (d.cell.height - s) / 2, s, s); }
    },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(pdfT(`${code} - ${setName} · Revisione prezzi · pagina ${doc.internal.getNumberOfPages()}`), W - 8, H - 6, { align: 'right' });
      doc.setTextColor(0);
    }
  });
  doc.save(`${code}-${String(setName).trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '')}_Revisioneprezzi.pdf`);
}

// ---------- "Apri su Cardmarket": prezzi calcolati qui (Normali e Reverse separati) e passati allo script ----------
function upCfg() { return state.upCfg || (state.upCfg = { base: 'trend', plus: 0 }); }
/** riga dell'elenco per lo script: Da e Tendenza della variante giusta. Per una Reverse senza valori Reverse → niente (mai quelli della normale) */
function jobVals(k) {
  const M = sbmOf(k), X = state.standby[k];
  if (!M || (X.rev && !M.rv)) return { lo: null, t: null };
  return { lo: M.lo ?? null, t: M.t ?? null, c: consOf(M)?.v ?? null };
}
async function openOnCardmarket(setId, setName, cmCat) {
  const list = Object.entries(state.standby || {}).filter(([, x]) => x.s === setId)
    .sort((a, b) => !!a[1].vp - !!b[1].vp || (parseInt(a[1].u) || 0) - (parseInt(b[1].u) || 0) || String(a[1].u).localeCompare(String(b[1].u)) || a[1].rev - b[1].rev);
  const xq = list.filter(([, x]) => x.vp).reduce((a, [, x]) => a + x.q, 0);
  if (!list.length) { if (cmCat) window.open(CMBULK + encodeURIComponent(cmCat.id), CM_TAB); else window.open('https://www.cardmarket.com/it/Pokemon', CM_TAB); return; }
  // prezzi di mercato freschi prima di decidere
  await tcg('/sets/' + encodeURIComponent(setId), 24 * 7); await tcg('@en/sets/' + encodeURIComponent(setId), 24 * 7); // per la sigla
  if (list.some(([k]) => { const M = sbmOf(k); return !M || Date.now() - new Date(M.at) > AUTO_H * 3600e3; })) {
    openDlg('<h3>Metti in vendita su Cardmarket</h3><p>Aggiorno i prezzi di mercato delle carte in Standby…</p>');
    await updatePrices(false);
  }
  const cfg = upCfg(), over = {};
  // carta già in vendita: uso il prezzo che ha già nel gestionale, così su Cardmarket le copie nuove finiscono
  // nella stessa offerta (stesso prezzo) invece di crearne una seconda a un prezzo diverso
  const saleOf = {};
  list.forEach(([k, x]) => {
    const p = sbPid(x), lang = x.lang || 'it';
    const L = (p && state.listings[lkey(p, x.vp ? false : x.rev, lang)]) || Object.values(state.listings).find(l => norm(l.u) === norm(x.u) && vcOf(l) === vcOf(x) && (l.lang || 'it') === lang && (l.vs || tcgIdFor(setOf(l))) === setId);
    if (L && L.q > 0 && L.price != null) saleOf[k] = L;
  });
  const priceOf = (k, b, plus) => {
    if (over[k] != null) return { p: over[k], m: 1 };
    if (saleOf[k]) return { p: r2(saleOf[k].price), sale: 1 };
    const v = jobVals(k), F = { low: 'lo', trend: 't', cons: 'c' };
    const used = [b, ...BASEALT[b]].find(x => v[F[x]] != null);
    return used == null ? { p: null } : { p: r2(Math.max(0.02, v[F[used]] + plus)), alt: used !== b, used };
  };
  const draw = () => {
    const b = $('upBase').value, plus = (+$('upSign').value || 1) * Math.abs(parseInt($('upPlus').value || '0', 10) || 0) / 100;
    let miss = 0, tot = 0;
    $('upBody').innerHTML = list.map(([k, x]) => {
      const v = jobVals(k), M = sbmOf(k), r = priceOf(k, b, plus);
      if (r.p == null) miss++; else tot += r.p * x.q;
      return `<tr data-k="${esc(k)}" style="${r.p == null ? 'background:rgba(229,72,77,.12)' : ''}"><td><b>${esc(cardCode(setId, setName, x.u))}</b> ${esc(x.n)}</td>
        <td>${vHtml(x)}</td><td class="n">${x.q}</td>
        <td class="n">${eur(v.lo) || '—'}</td><td class="n">${eur(v.t) || '—'}</td><td class="n">${eur(v.c) || '—'}</td>
        <td class="n"><input type="number" min="0.02" step="0.01" class="upP" value="${r.p != null ? r.p.toFixed(2) : ''}" placeholder="scrivilo" style="${r.m ? 'border-color:var(--acc);font-weight:700' : ''}">
          <small>${r.m ? 'scritto da te' : r.sale ? `già in vendita (${saleOf[k].q})` : r.p == null ? (x.rev && M && !M.rv ? 'manca il prezzo Reverse' : 'manca il prezzo') : r.alt ? `da ${BASEN[r.used]}` : ''}</small></td></tr>`;
    }).join('');
    $('upInfo').innerHTML = `${list.length} righe · ${list.reduce((a, [, x]) => a + x.q, 0)} copie · valore ${eur(tot)}` +
      (miss ? ` · <b style="color:#e5484d">${miss} senza prezzo: scrivilo qui o lo scrivi tu su Cardmarket</b>` : '');
    $('upBody').querySelectorAll('.upP').forEach(inp => inp.onchange = () => {
      const k = inp.closest('tr').dataset.k, val = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(val) || val <= 0) delete over[k]; else over[k] = r2(val);
      draw();
    });
  };
  openDlg(`<h3>Metti in vendita su Cardmarket · ${esc(setName)}</h3>
    ${xq ? `<p class="small" style="color:#7a4f00">Le <b>${xq} copie di varianti speciali</b> su Cardmarket stanno di solito nella pagina <b>${esc(setName)}: Supplementi</b>, alcune nella pagina del set: lo script le riconosce dal numero del prodotto e, finite le altre, ti porta ai Supplementi${list.length > list.filter(([, x]) => x.vp).length ? '' : ' (li apre subito)'}.</p>` : ''}
    <p class="small">Scegli il prezzo: lo script Card Scanner lo userà così com'è, con i valori giusti per le <b>Normali</b> e per le <b>Reverse</b>.
    Se serve puoi cambiare il prezzo di una singola carta nella tabella.</p>
    ${Object.keys(saleOf).length ? `<p class="small">Le carte <b>già in vendita</b> (${Object.keys(saleOf).length}) usano il prezzo che hanno già: così su Cardmarket le copie nuove si aggiungono alla stessa offerta. Se è fuori mercato te lo segnala il gestionale come sempre.</p>` : ''}
    <div class="filters"><label>Prezzo = <select id="upBase"><option value="low">"Da" (prezzo minimo)</option><option value="trend">Tendenza</option><option value="cons">Consigliato</option></select>
      <select id="upSign"><option value="1">+</option><option value="-1">−</option></select>
      <input type="number" id="upPlus" min="0" step="1" style="width:70px"> cent.</label><span class="small" id="upInfo"></span></div>
    <div style="max-height:46vh;overflow:auto"><table class="rtable"><thead><tr><th>Carta</th><th>Variante</th><th class="n">Qtà</th><th class="n">Da</th><th class="n">Tendenza</th><th class="n" title="a metà tra Da e il prezzo a cui la carta si vende davvero">Consigliato</th><th class="n">Prezzo</th></tr></thead><tbody id="upBody"></tbody></table></div>
    <ol class="small" style="line-height:1.7"><li>Premi <b>Apri Cardmarket</b>: si apre la pagina <b>Inserisci carte bulk</b> di Cardmarket.</li>
    <li>Scegli il set <b>${esc(setName)}</b> in "Edizione", poi ${csExt() ? 'il riquadro di Card Scanner si apre da solo' : 'premi il pulsante <b>Card Scanner</b> nei preferiti'}: l'elenco e i prezzi sono già caricati. (Se il set nella pagina non è quello giusto, lo script ti propone "Vai a ${esc(setName)}".)</li>
    <li>Premi <b>Compila la pagina</b> e controlla i prezzi.</li>
    <li><b>Metti in vendita su Cardmarket</b>, poi premi <b>📤 Invia al gestionale</b>: così qui arrivano solo le carte davvero in vendita.</li></ol>
    <p class="small">Non hai il pulsante Card Scanner nei preferiti? <a href="../cardmarket/" target="_blank">Installalo da qui</a> (lo trovi anche in Impostazioni → Strumenti).</p>
    <p class="small">Se lo script non trova l'elenco (per esempio se usi una scheda di Cardmarket già aperta), nel riquadro dello script clicca "Incolla elenco dal gestionale": l'elenco è anche negli appunti.</p>
    <p class="row" style="justify-content:flex-end"><button id="dClose">Annulla</button><button class="pri" id="upGo">Apri Cardmarket ↗</button></p>`, () => {
    $('upBase').value = cfg.base; $('upSign').value = (+cfg.plus || 0) < 0 ? '-1' : '1'; $('upPlus').value = Math.abs(+cfg.plus || 0);
    ['upBase', 'upSign', 'upPlus'].forEach(id => { $(id).onchange = draw; $(id).oninput = draw; });
    draw();
    $('dClose').onclick = closeDlg;
    $('upGo').onclick = () => {
      const b = $('upBase').value, plusC = (+$('upSign').value || 1) * Math.abs(parseInt($('upPlus').value || '0', 10) || 0);
      cfg.base = b; cfg.plus = plusC; save();
      const lang = list[0][1].lang || 'it';
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const code = siglaOf(setId, setName) || String(setId).toUpperCase();
      const name = `${code}-${String(setName).trim().replace(/\s+/g, '_')}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
      const job = {
        v: 1, at: today(), name, set: cmCat?.name || setName, sid: setId, cm: cmCat?.id || '', lang, com: list.find(([, x]) => x.com)?.[1].com || '',
        base: b, plus: plusC,
        items: list.map(([k, x]) => Object.assign({ u: x.u, rev: x.vp ? false : !!x.rev, q: x.q, n: x.n || '', r: x.r || '' }, x.vp ? { v: 'S', p: String(x.vp), vl: x.vl || '', vb: x.vb || '' } : sbPid(x) ? { bp: String(sbPid(x)) } : {}, jobVals(k), over[k] != null ? { mp: over[k] } : saleOf[k] ? { mp: r2(saleOf[k].price) } : {}))
      };
      const enc = 'csjob=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(job)))));
      try { navigator.clipboard.writeText(enc); } catch (e) {}
      const win = openCm('https://www.cardmarket.com/it/Pokemon/Stock/ListingMethods/BulkListing', enc);
      if (!win) { alert('Il browser ha bloccato l\'apertura di Cardmarket: consenti i popup per questa pagina e riprova.'); return; }
      closeDlg();
      toast(`Elenco ${name} pronto per lo script Card Scanner`);
    };
  });
}

// ---------- "Cambia prezzi su Cardmarket": nuovi prezzi calcolati qui, applicati dallo script sulla pagina "Le mie offerte" ----------
const OFFERS_URL = 'https://www.cardmarket.com/it/Pokemon/Stock/Offers/Singles';
function editCfg() { return state.editCfg || (state.editCfg = { base: 'low', plus: 0 }); }
async function openPriceEdit(scopeSet, opt = {}) {
  // prezzi di mercato freschi prima di decidere
  if (Object.keys(state.listings).some(k => { const M = mOf(k); return !M || Date.now() - new Date(M.at) > AUTO_H * 3600e3; })) {
    openDlg('<h3>Cambia prezzi su Cardmarket</h3><p>Aggiorno i prezzi di mercato…</p>');
    await updatePrices(false);
  }
  const cfg = editCfg(), over = {};
  let scope = scopeSet || '';
  const setOf = l => l.expName || state.cm[l.exp]?.name || '?';
  const sets = [...new Set(Object.values(state.listings).map(setOf))].sort((a, b) => a.localeCompare(b));
  let outDir = opt.out || 'all';
  const isOut = (k, l) => { const o = outOf(k, l); return o && (outDir === 'all' || o.dir === outDir); };
  const rowsOf = () => Object.entries(state.listings).filter(([k, l]) => (!scope || setOf(l) === scope) && (!$('peOut').checked || isOut(k, l)))
    .sort((a, b) => setOf(a[1]).localeCompare(setOf(b[1])) || (parseInt(a[1].u) || 0) - (parseInt(b[1].u) || 0) || a[1].rev - b[1].rev);
  const calc = (k, l, b, plus) => {
    if (over[k] != null) return { p: over[k], m: 1 };
    const M = mOf(k);
    if (!M || (l.rev && !M.rv)) return { p: null, why: l.rev && M ? 'manca il prezzo Reverse' : 'manca il prezzo' };
    const used = [b, ...BASEALT[b]].find(x => baseOf(M, x) != null);
    if (used == null) return { p: null, why: 'manca il prezzo' };
    const x = baseOf(M, used);
    return { p: r2(Math.max(0.02, x + plus)), ref: x, used };
  };
  let cur = [];
  const draw = () => {
    scope = $('peSet').value;
    const b = $('peBase').value, plus = (+$('peSign').value || 1) * Math.abs(parseInt($('pePlus').value || '0', 10) || 0) / 100;
    const onlyCh = $('peOnly').checked;
    cur = rowsOf().map(([k, l]) => ({ k, l, c: calc(k, l, b, plus) }));
    const ch = cur.filter(r => r.c.p != null && r2(r.c.p) !== r2(l0(r.l.price)));
    function l0(v) { return v == null ? -1 : v; }
    const show = onlyCh ? ch.concat(cur.filter(r => r.c.p == null)) : cur;
    $('peInfo').innerHTML = `<b>${ch.length}</b> offerte da cambiare su ${cur.length}` + (cur.some(r => r.c.p == null) ? ` · <span style="color:#e5484d">${cur.filter(r => r.c.p == null).length} senza prezzo di mercato (restano come sono)</span>` : '');
    $('peBody').innerHTML = show.map(({ k, l, c }) => {
      const M = mOf(k) || {}, same = c.p != null && r2(c.p) === r2(l.price ?? -1);
      const code = state.cm[l.exp]?.cards?.[l.p]?.c || '';
      return `<tr data-k="${esc(k)}" style="${c.p == null ? 'background:rgba(229,72,77,.10)' : same ? 'opacity:.55' : ''}">
        <td><b>${esc(code)}${esc(l.u)}</b> ${esc(info(l).name)}<small>${esc(setOf(l))}</small></td>
        <td>${l.rev ? '<b style="color:var(--rev)">Reverse</b>' : 'Normale'}</td><td class="n">${l.q}</td>
        <td class="n">${eur(l.price)}</td><td class="n">${l.rev && !M.rv ? '—' : eur(M.lo) || '—'}</td><td class="n">${l.rev && !M.rv ? '—' : eur(M.t) || '—'}</td><td class="n">${l.rev && !M.rv ? '—' : eur(consOf(M.v ? M : null)?.v) || '—'}</td>
        <td class="n"><input type="number" min="0.02" step="0.01" class="peP" value="${c.p != null ? c.p.toFixed(2) : ''}" placeholder="—" style="${c.m ? 'border-color:var(--acc);font-weight:700' : ''}">
          <small>${c.m ? 'scritto da te' : c.p == null ? c.why : same ? 'già così' : c.used !== b ? `da ${BASEN[c.used]}` : ''}</small></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="small">Nessuna offerta da cambiare con questa regola.</td></tr>';
    $('peBody').querySelectorAll('.peP').forEach(inp => inp.onchange = () => {
      const k = inp.closest('tr').dataset.k, v = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(v) || v <= 0) delete over[k]; else over[k] = r2(v);
      draw();
    });
    $('peGo').disabled = !ch.length;
    $('peGo').textContent = ch.length ? `Apri le mie offerte su Cardmarket ↗ (${ch.length})` : 'Niente da cambiare';
  };
  openDlg(`<h3>Cambia prezzi su Cardmarket</h3>
    <p class="small">Scegli il nuovo prezzo: il gestionale calcola quello di ogni offerta (Normali e Reverse separate) e lo script Card Scanner lo scrive su Cardmarket, nella pagina delle tue offerte.</p>
    <div class="filters"><select id="peSet"><option value="">Tutti i set</option>${sets.map(x => `<option ${x === scope ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <label>Nuovo prezzo = <select id="peBase"><option value="low">"Da" (prezzo minimo)</option><option value="trend">Tendenza</option><option value="cons">Consigliato</option></select>
      <select id="peSign"><option value="1">+</option><option value="-1">−</option></select>
      <input type="number" id="pePlus" min="0" step="1" style="width:70px"> cent.</label>
      <label><input type="checkbox" id="peOnly" checked> solo quelle da cambiare</label>
      <label title="prezzo lontano dal Consigliato oltre la soglia"><input type="checkbox" id="peOut"> solo carte fuori mercato<span id="peOutD"></span></label></div>
    <p class="small" id="peInfo"></p>
    <div style="max-height:44vh;overflow:auto"><table class="rtable"><thead><tr><th>Carta</th><th>Variante</th><th class="n">Qtà</th><th class="n">Prezzo ora</th><th class="n">Da</th><th class="n">Tendenza</th><th class="n">Consigliato</th><th class="n">Nuovo prezzo</th></tr></thead><tbody id="peBody"></tbody></table></div>
    <ol class="small" style="line-height:1.7"><li>Premi il pulsante qui sotto: si apre la pagina delle tue offerte su Cardmarket.</li>
      <li>${csExt() ? 'Il riquadro di Card Scanner si apre da solo' : 'Premi il pulsante <b>Card Scanner</b>'}: legge tutte le pagine delle tue offerte e trova quelle da cambiare.</li>
      <li>Premi <b>▶ Cambia i prezzi</b>: apre una carta alla volta e scrive il prezzo; tu controlli e premi <b>MODIFICA ARTICOLO</b> (oppure scegli la conferma automatica).</li>
      <li>Alla fine premi <b>📤 Invia al gestionale</b>: i nuovi prezzi entrano qui, con la nuova regola.</li></ol>
      <p class="small">Non hai il pulsante Card Scanner nei preferiti? <a href="../cardmarket/" target="_blank">Installalo da qui</a> (lo trovi anche in Impostazioni → Strumenti).</p>
    <p class="row" style="justify-content:flex-end"><button id="dClose">Annulla</button><button class="pri" id="peGo">Apri le mie offerte su Cardmarket ↗</button></p>`, () => {
    $('peBase').value = cfg.base; $('peSign').value = (+cfg.plus || 0) < 0 ? '-1' : '1'; $('pePlus').value = Math.abs(+cfg.plus || 0);
    if (opt.out) { $('peOut').checked = true; $('peBase').value = 'cons'; $('peSign').value = '1'; $('pePlus').value = 0; }
    const outLbl = () => { $('peOutD').textContent = $('peOut').checked && outDir !== 'all' ? (outDir === 'hi' ? ' (troppo alte)' : ' (troppo basse)') : ''; };
    $('peOut').addEventListener('change', () => { if (!$('peOut').checked) outDir = 'all'; outLbl(); }); outLbl();
    ['peSet', 'peBase', 'peSign', 'pePlus', 'peOnly', 'peOut'].forEach(id => { $(id).onchange = draw; });
    $('pePlus').oninput = draw;
    draw();
    $('dClose').onclick = closeDlg;
    $('peGo').onclick = () => {
      const b = $('peBase').value, plusC = (+$('peSign').value || 1) * Math.abs(parseInt($('pePlus').value || '0', 10) || 0);
      cfg.base = b; cfg.plus = plusC; save();
      const ch = cur.filter(r => r.c.p != null && r2(r.c.p) !== r2(r.l.price ?? -1));
      // offerte che hanno già il prezzo giusto: prendono subito la nuova regola (i controlli giornalieri partono da qui)
      cur.filter(r => r.c.p != null && !r.c.m && r2(r.c.p) === r2(r.l.price ?? -1)).forEach(({ l, c }) => { l.rb = c.used; l.ro = plusC; if (c.ref != null) { l.ref = c.ref; l.refAt = today(); } });
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const name = `PREZZI-${scope ? SavedListsName(scope) : 'Tutti'}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
      const job = { v: 1, type: 'edit', at: today(), name, base: b, plus: plusC,
        items: ch.map(({ k, l, c }) => ({ k, code: state.cm[l.exp]?.cards?.[l.p]?.c || '', exp: setOf(l), u: l.u, n: info(l).name, rev: !!l.rev, lang: l.lang || 'it', q: l.q, ...(l.vp ? { v: 'S', vl: l.vl, vb: l.vb, sl: slOfL(l) } : slOfL(l) ? { sl: slOfL(l) } : {}),
          old: l.price, price: c.p, b: c.m ? (l.rb || b) : c.used, o: c.m ? (l.ro ?? 0) : plusC, ref: c.ref ?? null, m: c.m ? 1 : 0 })) };
      const enc = 'csedit=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(job)))));
      try { navigator.clipboard.writeText(enc); } catch (e) {}
      const win = openCm(OFFERS_URL, enc);
      if (!win) { alert('Il browser ha bloccato l\'apertura di Cardmarket: consenti i popup per questa pagina e riprova.'); return; }
      logOp('prezzo', scope, `Preparato "${name}": ${ch.length} offerte da cambiare (${BASEN[b]}${plusC ? ` ${plusC > 0 ? '+' : '−'} ${eur(Math.abs(plusC) / 100)}` : ''})`, ch.reduce((a, r) => a + r.l.q, 0));
      save(); closeDlg();
      toast(csExt() ? `Elenco ${name} pronto: su Cardmarket il riquadro di Card Scanner si apre da solo` : `Elenco ${name} pronto: premi Card Scanner sulla pagina delle tue offerte`);
    };
  });
}
const SavedListsName = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
/** ritorno dallo script: prezzi cambiati su Cardmarket */
function importEditFromHash() {
  const m = location.hash.match(/^#cmedit=(.+)$/);
  if (!m) return false;
  csPendingDone();   // il risultato è arrivato: l'elenco non va più consegnato allo script
  history.replaceState(null, '', location.pathname);
  let d;
  try { d = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { alert('Dati delle modifiche non leggibili.'); return false; }
  if (d.type === 'qty') {
    // quantità corrette su Cardmarket: il gestionale aveva già quelle giuste, registro e basta
    const txtQ = {}, zero = [];
    (d.res || []).forEach(r => { const L = state.listings[r.k]; const set = L ? (L.expName || state.cm[L.exp]?.name || '') : '';
      (txtQ[set] = txtQ[set] || []).push(`${L ? cardTxt(L) : r.k} → ${r.qt} copie${r.zero ? ' (offerta da togliere a mano)' : ''}`); if (r.zero) zero.push(L ? cardTxt(L) : r.k); });
    Object.entries(txtQ).forEach(([set, a]) => logOp('quantita', set, `Quantità corrette su Cardmarket (script, ${d.name || ''}): ${a.join(', ')}`, null));
    chkAfterFix(d.res || []);
    save();
    setTimeout(() => toast(`Quantità corrette su Cardmarket: ${(d.res || []).length}${zero.length ? ` · da togliere a mano: ${zero.join(', ')}` : ''}`), 300);
    return true;
  }
  let n = 0, copies = 0;
  const txt = {};
  (d.res || []).forEach(r => {
    const L = state.listings[r.k];
    if (!L) return;
    const set = L.expName || state.cm[L.exp]?.name || '';
    (txt[set] = txt[set] || []).push(`${L.u}${L.rev ? ' R' : ''} ${eur(L.price)} → ${eur(r.price)}`);
    L.price = r2(r.price); L.pAt = r.at || today();
    if (r.b) L.rb = r.b;
    if (r.o != null) L.ro = r.o;
    // riferimento = valore di mercato di oggi con la nuova regola (così la variazione riparte da qui)
    const cur = baseOf(mOf(r.k), L.rb || 'low');
    if (cur != null && (!L.rev || mOf(r.k)?.rv)) { L.ref = cur; L.refAt = mOf(r.k)?.upd || today(); } else if (r.ref != null) { L.ref = r.ref; L.refAt = today(); }
    n++; copies += L.q;
  });
  Object.entries(txt).forEach(([set, a]) => logOp('prezzo', set, `Prezzi cambiati su Cardmarket (script, ${d.name || ''}): ${a.join(', ')}`, null));
  chkAfterFix((d.res || []).filter(r => state.listings[r.k]));
  save();
  setTimeout(() => toast(n ? `Prezzi aggiornati: ${n} offerte (${copies} copie) cambiate su Cardmarket` : 'Nessun prezzo da aggiornare'), 300);
  return true;
}

// ---------- storico prezzi (per il grafico degli ultimi 10 giorni) ----------
// state.hist["setTcgdex|numero|N/R|lingua"] = [[AAAA-MM-GG, Da, Tendenza], …] un valore al giorno, ultimi 30 giorni
const histKey = l => l.s ? sbKey(l.s, l.u, l.rev, l.lang, l.vp) : sbKey(lSid(l) || ('cm:' + l.exp), l.u, l.rev, l.lang, l.vp);
function histAdd(l, M) {
  if (!M || (M.lo == null && M.t == null)) return;
  const day = String(M.upd || today()).slice(0, 10);
  const H = (state.hist = state.hist || {}), k = histKey(l);
  const a = H[k] || (H[k] = []);
  const i = a.findIndex(x => x[0] === day);
  if (i >= 0) a[i] = [day, M.lo, M.t]; else a.push([day, M.lo, M.t]);
  a.sort((x, y) => x[0].localeCompare(y[0]));
  if (a.length > 30) a.splice(0, a.length - 30);
}
function histChart(l, title) {
  const a = ((state.hist || {})[histKey(l)] || []).slice(-10);
  if (a.length < 2) return `<div class="small" style="margin:6px 0">📈 ${esc(title)}: l'andamento si costruisce giorno per giorno${a.length ? ` (finora 1 giorno: Da ${eur(a[0][1]) || '—'}, Tendenza ${eur(a[0][2]) || '—'})` : ''}. Apri il gestionale ogni giorno per raccogliere i prezzi.</div>`;
  const W = 420, H = 130, pl = 44, pr = 10, pt = 18, pb = 22;
  const vals = a.flatMap(x => [x[1], x[2]]).filter(v => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.02) { hi += 0.01; lo = Math.max(0, lo - 0.01); }
  const X = i => pl + i * (W - pl - pr) / (a.length - 1), Y = v => pt + (hi - v) * (H - pt - pb) / (hi - lo);
  const line = (j, col) => { const pts = a.map((x, i) => x[j] == null ? null : [X(i), Y(x[j])]).filter(Boolean);
    return `<polyline fill="none" stroke="${col}" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${col}"/>`).join(''); };
  const lab = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  return `<div style="margin:8px 0"><div class="small"><b>📈 ${esc(title)}</b> · ultimi ${a.length} giorni · <span style="color:#2f7fd8">● Da</span> <span style="color:#e8590c">● Tendenza</span></div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block">
    <line x1="${pl}" y1="${Y(hi)}" x2="${W - pr}" y2="${Y(hi)}" stroke="var(--line)"/><line x1="${pl}" y1="${Y(lo)}" x2="${W - pr}" y2="${Y(lo)}" stroke="var(--line)"/>
    <text x="${pl - 4}" y="${Y(hi) + 4}" font-size="10" text-anchor="end" fill="var(--mut)">${eur(hi)}</text><text x="${pl - 4}" y="${Y(lo) + 4}" font-size="10" text-anchor="end" fill="var(--mut)">${eur(lo)}</text>
    ${a.map((x, i) => `<text x="${X(i)}" y="${H - 6}" font-size="9.5" text-anchor="middle" fill="var(--mut)">${lab(x[0])}</text>`).join('')}
    ${line(1, '#2f7fd8')}${line(2, '#e8590c')}</svg></div>`;
}

// ---------- catalogo dall'app (.txt) → Standby ----------
// state.standby["setTcgdex|numero|N/R|lingua"] = {s, sn, u, rev, lang, q, n, r, com, date, file}
const sbKey = (s, u, rev, lang, vp) => `${s}|${norm(u)}|${vp ? 'X' + vp : rev ? 'R' : 'N'}|${lang || 'it'}`;
const isCatalogTxt = t => /^\s*CARDSCANNER/i.test(t) || /^\s*SET\s+.+\|/im.test(t);
function parseCatalog(text) {
  if (/<br|<html|<body/i.test(text)) text = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
  const sets = [];
  let cur = null, com = '', listId = '';
  text.replace(/ /g, ' ').split(/\r?\n/).forEach(line => {
    const l = line.trim();
    const li = l.match(/^#\s*LISTA\s+(\S+)/i);
    if (li) { if (cur && !cur.items.length && !cur.listId) cur.listId = li[1]; else listId = li[1]; return; }
    if (!l || l.startsWith('#') || /^CARDSCANNER/i.test(l)) return;
    let m = l.match(/^COMMENTO\s+(.*)$/i);
    if (m) { com = m[1].trim(); if (cur) cur.com = com; return; }
    m = l.match(/^SET\s+(.*?)\s*\|\s*([a-z]{2})\s*(?:\|\s*([^|]*?))?\s*$/i);
    if (m) { cur = { name: m[1].trim(), lang: m[2].toLowerCase(), id: (m[3] || '').trim(), com, listId, items: [] }; listId = ''; sets.push(cur); return; }
    if (!cur) return;
    // terza colonna: N, R oppure X + variante speciale (nome della variante, es. "X Poké Ball", o numero prodotto Cardmarket, es. "X870135")
    m = l.match(/^([A-Z]*\d+[a-z]?)\s*\|\s*x\s*(\d+)\s*\|\s*([NR]|X\s*[^|]*?)\s*(?:\|\s*([^|]*?))?\s*(?:\|\s*([^|]*?))?\s*$/i);
    if (m) {
      const t = m[3].trim(), xq = /^X/i.test(t) && t.length > 1 ? t.slice(1).trim() : '';
      cur.items.push(Object.assign({ u: m[1], q: +m[2], rev: t.toUpperCase() === 'R', n: m[4] || '', r: m[5] || '' }, xq ? { xq } : {}));
    }
  });
  return sets.filter(s => s.items.length);
}
/** variante speciale scritta nella lista ("Poké Ball", "Reverse Energia", "PB", "870135") tra quelle vere della carta */
function matchVar(V, q0) {
  const all = (V && V.x) || [], s0 = simp(q0);
  if (!all.length) return { err: 'la carta non ha varianti speciali su TCGdex' };
  if (/^\d+$/.test(s0)) { const v = all.find(o => o.p === s0); return v ? { v } : { err: `${s0} non è una variante di questa carta (${all.map(o => o.l).join(', ')})` }; }
  // confronto a parole, con i nomi italiani di TCGdex portati in inglese ("Dusk Ball" = "Scuro Ball"); "Non Holo" è una parola sola
  const WM = { scuro: 'dusk', velox: 'quick', energia: 'energy', cosmo: 'cosmos', galassia: 'galaxy', olografica: 'holo', metallo: 'metal', luccichio: 'glitter', oro: 'gold', timbro: '' };
  const W = x => (' ' + unacc(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ').replace(/ non holo /g, ' nonholo ').split(' ').map(w => w in WM ? WM[w] : w).filter(Boolean).join(' ');
  const q = W(q0), qn = q.replace(/ /g, '');
  const F = o => W(o.l), L = o => W(String(o.l).replace(/·.*$/, ''));
  // prima il nome intero (timbro compreso), poi senza timbro, poi le parole scritte dentro il nome
  const same = x => { const n = x.replace(/ /g, ''); return n === qn || n === 'reverse' + qn; };   // "Energia" = "Reverse Energia"
  let h = all.filter(o => same(F(o)) || simp(o.b) === s0);
  if (!h.length) h = all.filter(o => same(L(o)));
  if (!h.length && q) h = all.filter(o => (' ' + F(o) + ' ').includes(' ' + q + ' '));
  if (h.length === 1) return { v: h[0] };
  return { err: h.length ? `"${q0}" va bene per più varianti (${h.map(o => o.l).join(', ')}): scrivi il nome intero` : `"${q0}" non c'è tra le varianti della carta (${all.map(o => o.l).join(', ')})` };
}
/** righe "X …" di una lista: trova la variante su TCGdex; le righe che non si risolvono vengono saltate (it.skip) */
async function resolveListVariants(sid, S) {
  const xs = S.items.filter(it => it.xq);
  if (!xs.length) return [];
  const [it, en] = await Promise.all([tcg('/sets/' + encodeURIComponent(sid), 24), tcg('@en/sets/' + encodeURIComponent(sid), 24)]);
  const by = {};
  [...(en?.cards || []), ...(it?.cards || [])].forEach(c => { by[norm(c.localId)] = c; });
  const bad = [];
  for (const x of xs) {
    const c = by[norm(x.u)];
    const V = c && c.id ? await cardVariants(c.id) : null;
    const r = !c ? { err: 'numero non trovato nel set' } : !V ? { err: 'non riesco a leggere le varianti (serve internet)' } : matchVar(V, x.xq);
    if (r.v) Object.assign(x, { rev: false, vp: r.v.p, vl: r.v.l, vb: r.v.b, n: x.n || c.name });
    else { x.skip = 1; bad.push(`${x.u} ${x.xq}: ${r.err}`); }
  }
  return bad;
}
/** copie già in vendita della stessa carta (stesso set, numero, variante, lingua) */
function listedQty(setId, u, rev, lang, vp) {
  return Object.values(state.listings).filter(l => (vp ? String(l.vp) === String(vp) : !l.vp && l.rev === rev) && (l.lang || 'it') === lang && norm(l.u) === norm(u) &&
    lSid(l) === setId).reduce((a, l) => a + l.q, 0);
}
/** "＋ Aggiungi carte": dalle liste dell'app oppure a mano, una carta alla volta (vanno in Standby) */
async function openAddCards() {
  const mine = new Set([...Object.keys(listingsBySet()), ...Object.values(state.standby || {}).map(x => x.s)]);
  const sets = [...tcgSets.filter(x => mine.has(x.id)), ...tcgSets.filter(x => !mine.has(x.id))];
  const rows = [];
  let cards = [], sid = null;
  openDlg(`<h3>Aggiungi carte</h3>
    <div class="addw">
      <section><h4>Dalle liste dell'app</h4>
        <div class="row"><button class="pri" id="adFile">📂 Carica le liste dall'app (.txt)</button><span class="small">Puoi anche trascinare i file qui nella pagina.</span></div></section>
      <section><h4>A mano, senza scansionare</h4>
        <div class="af">
          <label>Set<input id="adSet" list="adSets" placeholder="Scrivi il nome del set" autocomplete="off"></label>
          <label>Carta<input id="adCard" list="adCards" placeholder="Numero o nome" autocomplete="off" disabled></label>
          <label>Variante<select id="adRev"><option value="N">Normale</option><option value="R">Reverse Holo</option></select></label>
          <label>Lingua<select id="adLang">${Object.entries(LANGN).map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select></label>
          <label>Copie<input id="adQ" type="number" min="1" value="1"></label>
          <button id="adPlus">Aggiungi</button>
        </div>
        <datalist id="adSets">${sets.map(x => `<option value="${esc(x.name)}">${mine.has(x.id) ? 'tuo set' : ''}</option>`).join('')}</datalist>
        <datalist id="adCards"></datalist>
        <p class="small" id="adMsg" style="min-height:18px;margin:6px 0 0"></p>
        <div id="adList"></div>
      </section>
    </div>
    <p style="text-align:right"><button id="dClose">Annulla</button> <button class="pri" id="adGo" disabled>Metti in Standby</button></p>`, () => {
    $('dClose').onclick = closeDlg;
    $('adFile').onclick = () => { closeDlg(); $('fCat').click(); };
    const msg = (t, bad) => { $('adMsg').textContent = t; $('adMsg').style.color = bad ? 'var(--red)' : ''; };
    const draw = () => {
      $('adList').innerHTML = rows.length ? `<table class="adt"><tbody>${rows.map((r, i) => `<tr><td><b>${esc(r.u)}</b> ${esc(r.n)}<small>${esc(r.sn)}</small></td><td>${vHtml(r)}</td><td>${LANGN[r.lang] || r.lang}</td><td class="n">×${r.q}</td><td><button class="sm" data-x="${i}" title="Togli">✕</button></td></tr>`).join('')}</tbody></table>` : '';
      $('adGo').disabled = !rows.length;
      $('adGo').textContent = rows.length ? `Metti in Standby (${rows.reduce((a, r) => a + r.q, 0)} copie)` : 'Metti in Standby';
    };
    $('adList').onclick = e => { const b = e.target.closest('[data-x]'); if (b) { rows.splice(+b.dataset.x, 1); draw(); } };
    $('adSet').onchange = async () => {
      const t = simp($('adSet').value), S = sets.find(x => simp(x.name) === t) || sets.find(x => simp(x.name).includes(t));
      if (!S || !t) { sid = null; $('adCard').disabled = true; msg('Scegli un set dall\'elenco.', true); return; }
      $('adSet').value = S.name; sid = S.id; msg('Carico le carte del set…');
      const [it, en] = await Promise.all([tcg('/sets/' + encodeURIComponent(sid), 24), tcg('@en/sets/' + encodeURIComponent(sid), 24)]);
      const by = {};
      [...(en?.cards || []), ...(it?.cards || [])].forEach(c => { by[norm(c.localId)] = c; });   // nomi italiani se ci sono, fuoriserie dall'inglese
      cards = Object.values(by).sort((a, b) => (parseInt(a.localId, 10) || 0) - (parseInt(b.localId, 10) || 0) || String(a.localId).localeCompare(b.localId));
      if (!cards.length) { msg('Non riesco a leggere le carte di questo set (serve internet).', true); return; }
      $('adCards').innerHTML = cards.map(c => `<option value="${esc(c.localId)} · ${esc(c.name)}"></option>`).join('');
      $('adCard').disabled = false; $('adCard').value = ''; $('adCard').focus();
      msg(`${cards.length} carte in ${S.name}: scrivi il numero o il nome.`);
    };
    // varianti della carta scelta (da TCGdex): Normale, Reverse se esiste, e le varianti speciali
    let vOf = null;
    const fillVar = async () => {
      const c = pick(), sel = $('adRev');
      const opts = V => `<option value="N">Normale</option>${!V || !V.det || V.rev ? '<option value="R">Reverse Holo</option>' : ''}${(V?.x || []).map(v => `<option value="${esc(v.p)}">${esc(v.l)}</option>`).join('')}`;
      if (!c || !c.id) { vOf = null; sel.innerHTML = opts(null); return; }
      if (vOf && vOf.id === c.id) return;
      const keep = sel.value;
      vOf = { id: c.id, V: varCache(c.id) };
      sel.innerHTML = opts(vOf.V);
      if (!vOf.V) { msg('Leggo le varianti della carta…'); const V = await cardVariants(c.id); if (vOf?.id !== c.id) return; vOf.V = V; sel.innerHTML = opts(V); msg(''); }
      if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
      const V = vOf.V;
      if (V && V.x.length) msg(`${c.localId} ${c.name}: ${V.x.length} ${V.x.length === 1 ? 'variante speciale' : 'varianti speciali'} (${V.x.map(v => v.l).join(', ')})${V.det && !V.rev ? '. Non esiste la Reverse semplice' : ''}.`);
    };
    $('adCard').addEventListener('change', fillVar);
    $('adCard').addEventListener('input', () => { if (pick()) fillVar(); });
    const pick = () => {
      const v = $('adCard').value.trim(); if (!v) return null;
      const num = (v.match(/^([A-Z]*\d+[a-z]?)\b/i) || [])[1];
      if (num) { const c = cards.find(x => norm(x.localId) === norm(num)); if (c) return c; }
      const t = simp(v.replace(/^[A-Z]*\d+[a-z]?\s*·\s*/i, '')), hits = cards.filter(x => simp(x.name).includes(t));
      return hits.length === 1 ? hits[0] : hits.find(x => simp(x.name) === t) || null;
    };
    const add = () => {
      if (!sid) { msg('Prima scegli il set.', true); return; }
      const c = pick(); if (!c) { msg('Carta non trovata in questo set: scegli dall\'elenco che compare scrivendo.', true); return; }
      const q = Math.max(1, parseInt($('adQ').value, 10) || 1), sv = $('adRev').value, rev = sv === 'R', lang = $('adLang').value;
      // variante speciale: solo se l'elenco mostrato è proprio quello di questa carta
      const xv = !/^[NR]$/.test(sv) && vOf && vOf.id === c.id ? (vOf.V?.x || []).find(v => v.p === sv) : null;
      if (!/^[NR]$/.test(sv) && !xv) { msg('Scegli di nuovo la variante: l\'elenco era di un\'altra carta.', true); fillVar(); return; }
      const sn = tcgSets.find(x => x.id === sid)?.name || '';
      const ex = rows.find(r => r.sid === sid && norm(r.u) === norm(c.localId) && vcOf(r) === (xv ? 'X' + xv.p : rev ? 'R' : 'N') && r.lang === lang);
      if (ex) ex.q += q; else rows.push(Object.assign({ sid, sn, u: c.localId, n: c.name, rev: xv ? false : rev, lang, q, r: rarCache(sid)[norm(c.localId)] || '' }, xv ? { vp: xv.p, vl: xv.l, vb: xv.b } : {}));
      draw(); msg(`Aggiunta ${c.localId} ${c.name}${xv ? ' ' + xv.l : rev ? ' Reverse' : ''} ×${q}.`);
      $('adCard').value = ''; $('adQ').value = 1; $('adCard').focus(); vOf = null; $('adRev').innerHTML = '<option value="N">Normale</option><option value="R">Reverse Holo</option>';
    };
    $('adPlus').onclick = add;
    $('adCard').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    $('adGo').onclick = () => {
      state.standby = state.standby || {};
      const bySet = {};
      rows.forEach(r => {
        const k = sbKey(r.sid, r.u, r.rev, r.lang, r.vp);
        const x = state.standby[k] || (state.standby[k] = Object.assign({ s: r.sid, sn: r.sn, u: r.u, rev: r.rev, lang: r.lang, q: 0, n: r.n, r: r.r, com: '', date: today(), file: 'aggiunta a mano' }, r.vp ? { vp: r.vp, vl: r.vl, vb: r.vb } : {}));
        x.q += r.q;
        (bySet[r.sn] = bySet[r.sn] || []).push(`${r.u} ${r.n}${vTag(r)}${r.lang !== 'it' ? ' (' + r.lang + ')' : ''} ×${r.q}`);
      });
      Object.entries(bySet).forEach(([sn, a]) => logOp('standby', sn, `Aggiunte a mano in Standby di ${sn}: ${a.join(', ')}`, null));
      save(); closeDlg();
      selected = rows[rows.length - 1].sid; filter = 'all';
      refresh();
      toast(`${rows.reduce((a, r) => a + r.q, 0)} copie in Standby: per metterle in vendita apri il set e premi "Metti in vendita su Cardmarket"`);
      updatePrices(false);
    };
    draw();
    setTimeout(() => $('adSet').focus(), 50);
  });
}
async function importCatalog(files) {
  state.standby = state.standby || {};
  let last = null;
  const msg = [];
  state.lists = state.lists || {};
  for (const f of files) {
    const sets = parseCatalog(await f.text());
    if (!sets.length) { alert(`"${f.name}" non è un catalogo dell'app (formato CARDSCANNER).`); continue; }
    // lista numerata dell'app (es. DLR-DominioDelta001): si AGGIUNGE allo Standby del set, una volta sola
    const fileList = (f.name.match(/^([A-Za-z0-9.]+-[^.]*?\d{3})(?: ?\(\d+\))?\.(txt|html?)$/i) || [])[1] || '';
    for (const S of sets) {
      const listId = S.listId || (sets.length === 1 ? fileList : '');
      if (listId) {
        if (state.lists[listId]) { msg.push(`${listId}: già caricata il ${fmtD(state.lists[listId].at)}, saltata`); continue; }
        const sid = S.id && tcgSets.some(x => x.id === S.id) ? S.id : (tcgIdFor(S.name) || S.id);
        if (!sid) { msg.push(`${listId}: set "${S.name}" non riconosciuto, saltata`); continue; }
        const sn = tcgSets.find(x => x.id === sid)?.name || S.name;
        let tot = 0;
        (await resolveListVariants(sid, S)).forEach(b => msg.push(`${listId}: riga saltata, ${b}`));
        S.items.forEach(it => {
          if (it.skip) return;
          const k = sbKey(sid, it.u, it.rev, S.lang, it.vp);
          const x = state.standby[k] || (state.standby[k] = Object.assign({ s: sid, sn, u: it.u, rev: it.rev, lang: S.lang, q: 0, n: it.n, r: it.r, com: S.com || '', date: today(), file: f.name }, it.vp ? { vp: it.vp, vl: it.vl, vb: it.vb } : {}));
          x.q += it.q; x.file = f.name; if (S.com) x.com = S.com;
          tot += it.q;
        });
        state.lists[listId] = { at: today(), set: sn, q: tot };
        msg.push(`${listId}: +${tot} copie nello Standby di ${sn}`);
        last = sid;
        continue;
      }
      const sid = S.id && tcgSets.some(x => x.id === S.id) ? S.id : (tcgIdFor(S.name) || S.id);
      if (!sid) { msg.push(`${S.name}: set non riconosciuto, saltato`); continue; }
      const sn = tcgSets.find(x => x.id === sid)?.name || S.name;
      const old = Object.keys(state.standby).filter(k => state.standby[k].s === sid && !state.standby[k].vp);
      if (old.length && !confirm(`Il set "${sn}" ha già ${old.reduce((a, k) => a + state.standby[k].q, 0)} copie in Standby.\n\nSostituirle con il contenuto di "${f.name}"?`)) continue;
      old.forEach(k => delete state.standby[k]);
      const agg = {};
      (await resolveListVariants(sid, S)).forEach(b => msg.push(`${sn}: riga saltata, ${b}`));
      S.items.forEach(it => {
        if (it.skip) return;
        const k = sbKey(sid, it.u, it.rev, S.lang, it.vp);
        const x = agg[k] || (agg[k] = Object.assign({ s: sid, sn, u: it.u, rev: it.rev, lang: S.lang, q: 0, n: it.n, r: it.r, com: S.com || '', date: today(), file: f.name }, it.vp ? { vp: it.vp, vl: it.vl, vb: it.vb } : {}));
        x.q += it.q;
      });
      let tot = 0, already = 0;
      Object.entries(agg).forEach(([k, x]) => {
        const inV = listedQty(sid, x.u, x.rev, x.lang, x.vp);
        const q = x.q - inV;
        already += Math.min(inV, x.q);
        if (q > 0) { x.q = q; state.standby[k] = x; tot += q; }
      });
      msg.push(`${sn}: ${tot} copie in Standby` + (already ? ` (${already} già in vendita, non aggiunte)` : ''));
      last = sid;
    }
  }
  msg.forEach(m => logOp('standby', (m.match(/Standby di (.+)$/) || m.match(/^([^:]+): \d+ copie in Standby/) || [])[1] || '', m));
  save();
  if (msg.some(m => m.includes('riga saltata'))) alert(msg.join('\n') + '\n\nLe righe saltate non sono entrate: aggiungile con "＋ Aggiungi carte" scegliendo la variante.');
  else if (msg.length) toast(msg.join(' · '));
  if (last) { selected = last; filter = 'all'; }
  refresh();
  updatePrices(false);
  loadMyCodes(); // sigla dei set appena caricati (per il dialogo Apri su Cardmarket)
}

// ---------- backup su GitHub: un file in un repository PRIVATO dell'utente, con tutta la cronologia ----------
// La chiave (token) resta solo in questo browser (localStorage 'gestionaleGithub'), mai nello stato né nei file di backup.
const GH_KEY = 'gestionaleGithub', GH_PATH = 'gestionale-carte.json', GH_EVERY = 10 * 60e3;
let gh = (() => { try { return JSON.parse(localStorage.getItem(GH_KEY)) || null; } catch (e) { return null; } })();
let ghState = gh ? 'ok' : 'off', ghErr = '', ghTimer = null, ghDirty = false, ghBusy = false;
// ghConflict: su GitHub c'è una versione che questo browser non conosce (salvata da un altro PC o browser): non la sovrascrivo da solo
let ghConflict = false;
const GH_CONFLICT = 'su GitHub c\'è una versione più recente, salvata da un altro PC o browser. Scegli quale tenere in Impostazioni → Backup su GitHub';
function ghSetConflict() { ghConflict = true; ghState = 'err'; ghErr = GH_CONFLICT; }
const ghStore = () => { if (gh) localStorage.setItem(GH_KEY, JSON.stringify(gh)); else localStorage.removeItem(GH_KEY); };
const bkOk = () => bkState === 'ok' || (!!gh && ghState === 'ok');
function ghMsg(st, m) {
  return st === 401 ? 'chiave (token) non valida o scaduta: creane una nuova e ricollega'
    : st === 403 ? 'la chiave non ha il permesso di scrivere (serve "Contents: Read and write")'
    : st === 404 ? 'repository non trovato: controlla il nome e che la chiave possa accedervi'
    : st === 409 || st === 422 ? 'conflitto con la versione su GitHub'
    : `errore ${st}${m ? ': ' + m : ''}`;
}
async function ghApi(path, opt = {}, accept) {
  let r;
  try {
    r = await fetch('https://api.github.com/repos/' + gh.repo + path, Object.assign({ cache: 'no-store' }, opt, { headers: Object.assign({
      Authorization: 'Bearer ' + gh.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      opt.body ? { 'Content-Type': 'application/json' } : {}) }));
  } catch (e) { throw new Error('GitHub non raggiungibile (sei connesso a internet?)'); }
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} const e = new Error(ghMsg(r.status, m)); e.status = r.status; throw e; }
  return accept === 'application/vnd.github.raw+json' ? r.text() : r.json();
}
function ghB64(txt) {
  const b = new TextEncoder().encode(txt); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
/** sha del file su GitHub (null se non c'è ancora) */
async function ghSha() {
  try { return (await ghApi('/contents/' + GH_PATH, {}, 'application/vnd.github.object')).sha; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
async function ghWrite(force) {
  if (!gh || ghBusy) return;
  if (ghConflict && !force) return;
  ghBusy = true; clearTimeout(ghTimer); ghTimer = null;
  const chg = ghChg;
  try {
    const ls = Object.values(state.listings), sbq = Object.values(state.standby || {}).reduce((a, x) => a + x.q, 0);
    const body = sha => JSON.stringify(Object.assign({ message: `Backup ${new Date().toLocaleString('it-IT')} · ${ls.reduce((a, l) => a + l.q, 0)} in vendita, ${sbq} in Standby`,
      content: ghB64(JSON.stringify(state)) }, sha ? { sha } : {}));
    let sha = gh.sha !== undefined ? gh.sha : await ghSha(), r;
    try { r = await ghApi('/contents/' + GH_PATH, { method: 'PUT', body: body(sha) }); }
    catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      // il file su GitHub è cambiato senza passare da qui: lo sovrascrivo solo se me lo chiedi
      sha = await ghSha();
      if (sha && !force && !gh.dirty) { ghBusy = false; ghDirty = false; await ghCheck(); return; }
      if (sha && !force) { ghSetConflict(); throw new Error(GH_CONFLICT); }
      r = await ghApi('/contents/' + GH_PATH, { method: 'PUT', body: body(sha) });
    }
    gh.sha = r.content.sha; gh.at = new Date().toISOString();
    if (ghChg === chg) { gh.dirty = false; ghDirty = false; } else ghSchedule();   // altre modifiche durante l'invio: le mando dopo
    ghStore();
    ghState = 'ok'; ghErr = ''; ghConflict = false;
  } catch (e) { ghState = 'err'; ghErr = e.message; }
  ghBusy = false; bkShow(); renderTabs();
  if (selected === '__set') renderSettings();
}
/** dopo una modifica: salva entro 1 minuto, ma al massimo una volta ogni 10 minuti */
let ghChg = 0, ghQuiet = false, ghSoft = false;
function ghSchedule() {
  if (!gh || ghQuiet) return;
  // ghSoft = è cambiato solo ciò che il gestionale aggiorna da solo (prezzi di mercato): va salvato, ma se un altro PC
  // ha dati più recenti si possono caricare quelli senza chiedere. gh.dirty = modifiche TUE non ancora su GitHub.
  if (ghSoft) { ghDirty = true; }
  else {
    ghChg++;
    if (!gh.dirty) { gh.dirty = true; ghStore(); }   // lo segno subito, così resta anche se chiudi la pagina
    ghDirty = true;
  }
  if (ghTimer) return;
  const wait = Math.max(60e3, (gh.at ? new Date(gh.at).getTime() + GH_EVERY : 0) - Date.now());
  ghTimer = setTimeout(() => { ghTimer = null; if (ghDirty) ghWrite(); }, wait);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && gh && ghDirty) ghWrite(); });
/** all'apertura: su GitHub c'è una versione che questo browser non ha mai visto? (gestionale usato su un altro PC) */
// Regola: se su GitHub c'è una versione diversa da quella che questo browser ha salvato o caricato per ultima
// - e qui NON ci sono modifiche non ancora inviate → la carico da sola (è il caso normale: hai lavorato su un altro PC)
// - e qui ci SONO modifiche non inviate → non tocco nulla e ti chiedo quale tenere
async function ghCheck(quiet) {
  if (!gh || ghBusy || ghConflict) return false;
  try {
    const remote = await ghSha();
    if (!remote || remote === gh.sha) return false;
    if (gh.dirty) {
      ghSetConflict(); bkShow(); renderTabs(); if (selected === '__set') renderSettings();
      toast('Backup su GitHub: un altro PC ha salvato dati più recenti, ma anche qui ci sono modifiche non salvate. Apri Impostazioni → Backup su GitHub per scegliere quale tenere.');
      return false;
    }
    if ($('dlg').open) return false;                                   // finestra aperta: riprovo più tardi
    const st = await ghLoad();
    if (ghChg && gh.dirty) return false;                               // hai modificato qualcosa mentre leggevo: non sovrascrivo
    const sel = selected;
    state = Object.assign({ cm: {}, sold: [], standby: {} }, st);
    gh.sha = remote; gh.dirty = false; ghDirty = false; clearTimeout(ghTimer); ghTimer = null; ghStore();
    ghState = 'ok'; ghErr = '';
    ghQuiet = true;
    try { logOp('dati', '', 'Caricato da GitHub l\'ultimo salvataggio (fatto su un altro PC)'); save(); } finally { ghQuiet = false; }
    if (selected !== sel) selected = sel;
    refresh(); bkShow();
    if (selected === '__set') renderSettings();
    toast('☁️ Caricato l\'ultimo salvataggio da GitHub');
    return true;
  } catch (e) { return false; /* senza internet riprovo più tardi */ }
}
// quando torni su questa scheda dopo un po' (magari hai lavorato su un altro PC), ricontrollo
let ghHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') ghHiddenAt = Date.now();
  else if (gh && ghHiddenAt && Date.now() - ghHiddenAt > 30e3) ghCheck();
});
setInterval(() => { if (gh && document.visibilityState === 'visible') ghCheck(); }, 5 * 60e3);
/** risolve il conflitto: 'remote' = carico la versione di GitHub, 'local' = tengo i dati di questo browser */
async function ghResolve(which) {
  try {
    if (which === 'remote') {
      const st = await ghLoad(); gh.sha = await ghSha(); ghStore();
      ghConflict = false; ghState = 'ok'; ghErr = '';
      ghRestore(st, '(versione salvata da un altro PC)', true);
    } else { ghConflict = false; await ghWrite(true); }
  } catch (e) { ghState = 'err'; ghErr = e.message; }
  bkShow(); renderTabs(); if (selected === '__set') renderSettings();
}
async function ghConnect(repo, token) {
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  token = String(token || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('scrivi il repository come utente/nome, per esempio mamouse87/gestionale-backup');
  if (!token) throw new Error('incolla la chiave (token) creata su GitHub');
  const prev = gh;
  gh = { repo, token }; ghConflict = false;
  try {
    const info = await ghApi('');
    if (!info.private) throw new Error('il repository è PUBBLICO: chiunque vedrebbe i tuoi dati. Rendilo privato su GitHub (Settings → Danger Zone → Change visibility) e riprova');
    if (info.permissions && !info.permissions.push) throw new Error('la chiave può leggere ma non scrivere: serve il permesso "Contents: Read and write"');
    gh.sha = await ghSha();
  } catch (e) { gh = prev; throw e; }
  ghStore(); ghState = 'ok'; ghErr = '';
  return gh.sha;
}
async function ghVersions() {
  const list = await ghApi(`/commits?path=${encodeURIComponent(GH_PATH)}&per_page=50`);
  return list.map(c => ({ sha: c.sha, at: c.commit.committer?.date || c.commit.author?.date, msg: c.commit.message }));
}
function ghUnB64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, '')), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
async function ghLoad(ref) {
  // 1) dati del file (sha del contenuto); 2) contenuto letto per sha: sempre quello giusto, anche oltre 1 MB
  const meta = await ghApi(`/contents/${GH_PATH}${ref ? '?ref=' + ref : ''}`, {}, 'application/vnd.github.object');
  if (!meta || meta.type !== 'file') throw new Error(`su GitHub non trovo il file ${GH_PATH}`);
  let txt = meta.encoding === 'base64' && meta.content ? ghUnB64(meta.content) : '';
  if (!txt) { const b = await ghApi('/git/blobs/' + meta.sha); txt = ghUnB64(b.content); }
  let s;
  try { s = JSON.parse(txt); } catch (e) { throw new Error(`il file ${GH_PATH} su GitHub non si riesce a leggere (${txt.length} caratteri)`); }
  if (!s || typeof s !== 'object' || !s.listings) throw new Error(`il file ${GH_PATH} su GitHub non contiene i dati del gestionale`);
  return s;
}
function ghRestore(s, label, same) {
  state = Object.assign({ cm: {}, sold: [], standby: {} }, s);
  logOp('dati', '', `Ripristinato il backup di GitHub ${label}`);
  // same = ho caricato proprio l'ultima versione di GitHub: non c'è niente di nuovo da rimandare su
  if (same) { ghQuiet = true; try { save(); } finally { ghQuiet = false; } if (gh) { gh.dirty = false; ghDirty = false; clearTimeout(ghTimer); ghTimer = null; ghStore(); } }
  else save();
  refresh(); toast('Dati ripristinati da GitHub ✔');
}
async function ghVersionsDlg() {
  openDlg('<h3>Versioni salvate su GitHub</h3><p>Leggo la cronologia…</p>');
  let v;
  try { v = await ghVersions(); } catch (e) { openDlg(`<h3>Versioni salvate su GitHub</h3><p>Non riesco a leggerle: ${esc(e.message)}</p><p style="text-align:right"><button id="dClose">Chiudi</button></p>`, () => $('dClose').onclick = closeDlg); return; }
  openDlg(`<h3>Versioni salvate su GitHub</h3>
    <p class="small">Le ultime ${v.length} copie di <b>${esc(gh.repo)}</b>, dalla più recente. Ripristinando, i dati di questo browser vengono sostituiti (la versione attuale resta comunque nella cronologia di GitHub).</p>
    <div style="max-height:56vh;overflow:auto"><table class="rtable"><thead><tr><th>Data e ora</th><th>Contenuto</th><th></th></tr></thead><tbody>
    ${v.map((x, i) => `<tr><td style="white-space:nowrap">${fmtDT(x.at)}${i === 0 ? ' <span class="small">(ultima)</span>' : ''}</td><td class="small">${esc(x.msg.replace(/^Backup [^·]*·\s*/, ''))}</td>
      <td style="text-align:right"><button class="sm" data-ref="${esc(x.sha)}" data-at="${esc(x.at)}">Ripristina</button></td></tr>`).join('') || '<tr><td colspan="3" class="small">Nessuna versione: premi "Salva adesso".</td></tr>'}
    </tbody></table></div>
    <p style="text-align:right"><button id="dClose">Chiudi</button></p>`, () => {
    $('dClose').onclick = closeDlg;
    $('dlgBody').querySelectorAll('[data-ref]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Leggo…';
      try {
        const s = await ghLoad(b.dataset.ref);
        if (!confirm(`Sostituire i dati di questo browser con la versione del ${fmtDT(b.dataset.at)} (${Object.keys(s.listings).length} righe in vendita, ${(s.sold || []).length} vendite)?`)) { b.disabled = false; b.textContent = 'Ripristina'; return; }
        try { gh.sha = await ghSha(); ghStore(); ghConflict = false; ghState = 'ok'; ghErr = ''; } catch (er) {}
        closeDlg(); ghRestore(s, 'del ' + fmtDT(b.dataset.at));
      } catch (e) { alert('Non riesco a leggere quella versione: ' + e.message); b.disabled = false; b.textContent = 'Ripristina'; }
    });
  });
}

// ---------- backup automatico in una cartella del PC (es. dentro Google Drive o OneDrive) ----------
const BK_FILE = 'gestionale-carte.json', BK_SUB = 'copie-giornaliere', BK_KEEP = 30;
let bkDir = null, bkState = 'off', bkErr = '', bkTimer = null;
function bkDb(op, val) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('gestionaleBackup', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const st = r.result.transaction('h', op === 'get' ? 'readonly' : 'readwrite').objectStore('h');
      const x = op === 'get' ? st.get('dir') : op === 'del' ? st.delete('dir') : st.put(val, 'dir');
      x.onsuccess = () => res(x.result); x.onerror = () => rej(x.error);
    };
  });
}
async function bkWriteFile(dir, name, txt) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(txt); await w.close();
}
function bkSchedule() { if (bkState === 'ok') { clearTimeout(bkTimer); bkTimer = setTimeout(bkWrite, 2500); } }
async function bkWrite() {
  if (!bkDir || bkState !== 'ok') return;
  try {
    const txt = JSON.stringify(state);
    await bkWriteFile(bkDir, BK_FILE, txt);
    const sub = await bkDir.getDirectoryHandle(BK_SUB, { create: true });
    await bkWriteFile(sub, `gestionale-carte-${dayKey(Date.now())}.json`, txt);
    const names = [];
    for await (const [n] of sub.entries()) if (/^gestionale-carte-\d{4}-\d\d-\d\d\.json$/.test(n)) names.push(n);
    for (const n of names.sort().slice(0, -BK_KEEP)) await sub.removeEntry(n).catch(() => {});
    localStorage.setItem('gestionaleBackupAt', today());
  } catch (e) { bkState = 'err'; bkErr = e.message; }
  bkShow();
}
async function bkInit() {
  if (!window.showDirectoryPicker) { bkState = 'nosupport'; bkShow(); return; }
  try { bkDir = await bkDb('get'); } catch (e) { bkDir = null; }
  if (bkDir) { try { bkState = (await bkDir.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'paused'; } catch (e) { bkState = 'paused'; } }
  bkShow();
  if (bkState === 'ok') bkWrite();
}
async function bkChoose() {
  try {
    const d = await window.showDirectoryPicker({ id: 'gestionaleBackup', mode: 'readwrite' });
    bkDir = d; await bkDb('put', d); bkState = 'ok';
    await bkWrite();
    if (bkState === 'ok') toast('Backup automatico attivo ✔');
  } catch (e) { if (e.name !== 'AbortError') alert('Non riesco a usare quella cartella: ' + e.message); }
  bkShow();
}
async function bkResume() {
  if (!bkDir) return bkChoose();
  try { bkState = (await bkDir.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'paused'; } catch (e) { bkState = 'paused'; }
  if (bkState === 'ok') { await bkWrite(); toast('Backup automatico riattivato ✔'); }
  bkShow();
}
function bkShow() {
  const b = $('btnBk'); if (!b) return;
  const t = d => d ? new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
  const at = localStorage.getItem('gestionaleBackupAt');
  const err = (gh && ghState === 'err') || bkState === 'err';
  const lines = [];
  if (gh) lines.push(ghState === 'ok' ? `GitHub: attivo · ultimo salvataggio ${t(gh.at)}` : `GitHub: errore · ${ghErr}`);
  if (bkState !== 'off' && bkState !== 'nosupport') lines.push({ ok: `Cartella: attiva · ultimo salvataggio ${t(at)}`, paused: 'Cartella: in pausa', err: 'Cartella: errore' }[bkState]);
  if (!lines.length) lines.push('Backup non attivo: clicca per attivarlo');
  const lb = err ? 'Errore backup' : bkOk() ? '' : bkState === 'paused' ? 'In pausa' : 'Backup spento';
  // un pallino discreto: verde = salvato; arancione con la scritta solo se c'è un problema
  b.innerHTML = `<i class="sd"></i>${lb ? esc(lb) : ''}`; b.title = (lb ? '' : 'Dati salvati\n') + lines.join('\n');
  b.className = 'tsave' + (lb ? ' warn' : '');
}
function downloadBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
  a.download = `gestionale-carte-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

// ---------- comandi ----------
function openDlg(html, wire) { $('dlgBody').innerHTML = html; $('dlg').classList.toggle('cdw', html.includes('class="cdx"')); if (!$('dlg').open) $('dlg').showModal(); wire && wire(); }
function closeDlg() { $('dlg').close(); }
function refresh() {
  const ls = Object.values(state.listings);
  const copies = ls.reduce((a, l) => a + l.q, 0);
  const value = ls.reduce((a, l) => a + (l.price || 0) * l.q, 0);
  const noPrice = ls.filter(l => l.price == null).length;
  const sbq = Object.values(state.standby || {}).reduce((a, x) => a + x.q, 0);
  $('stats').innerHTML = `<span><b>${copies}</b>in vendita</span><span><b>${eur(value) || '0,00 €'}</b>valore</span>` +
    (sbq ? `<span><b>${sbq}</b>in Standby</span>` : '') + `<span><b>${state.sold.reduce((a, s) => a + s.q, 0)}</b>vendute</span>` +
    (noPrice ? `<span class="w"><b>${noPrice}</b>senza prezzo</span>` : '');
  const m = $('main'), top = m.scrollTop, was = selected;
  renderSets();
  Promise.resolve(renderSet()).then(() => { if (selected === was && top) m.scrollTop = top; });
}
document.addEventListener('click', e => {
  document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target) || e.target.closest('.mn button, .mn a')) d.removeAttribute('open'); });
});
$('btnSale').onclick = () => $('fSale').click();
$('fSale').onchange = e => { importSales([...e.target.files]); e.target.value = ''; };
$('btnAdd').onclick = () => openAddCards();
$('btnClF').onclick = () => clPickPhotos();
$('fCat').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importCatalog(fs); };
$('undoList').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('undoMenu').open = false; if (b.dataset.r) redoDo(); else undoDo(+b.dataset.u || 1); };
$('btnBk').onclick = () => { if (bkState === 'paused' && !(gh && ghState === 'ok')) bkResume(); else { setSec = gh ? 'gh' : 'bk'; goTab('__set'); } };
$('btnMore').onclick = () => goTab('__set');
$('tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) goTab(b.dataset.tab); };
$('fRestore').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.listings) throw 0; if (confirm('Sostituire i dati attuali con questo backup?')) { const lg = state.log || []; state = Object.assign({ cm: {}, sold: [], standby: {} }, s); if (!s.log) state.log = lg; logOp('dati', '', `Ripristinato il backup "${f.name}"`); save(); closeDlg(); refresh(); } }
  catch (err) { alert('Backup non valido.'); }
};
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault();
  const fs = [...e.dataTransfer.files];
  const pgF = fs.find(f => /price_?guide/i.test(f.name));
  if (pgF) { pgFile(pgF); return; }
  // file .txt dell'app → Standby; il resto (PDF ordini ecc.) → vendite
  const cat = [];
  for (const f of fs) if (/\.(txt|html?)$/i.test(f.name) && isCatalogTxt(await f.text())) cat.push(f);
  if (cat.length) importCatalog(cat);
  const rest = fs.filter(f => !cat.includes(f));
  if (rest.length) importSales(rest);
});
$('fPg').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) pgFile(f); };
window.addEventListener('hashchange', () => { if (importCheckFromHash() || importEditFromHash()) { refresh(); return; } const name = importFromHash(); if (name) selected = tcgIdFor(name) || selected; refresh(); });

// ---------- una sola pagina del gestionale ----------
// Lo script di Cardmarket rimanda i dati alla scheda chiamata "gestionaleCarte". Se però si apre una scheda nuova
// e un'altra pagina del gestionale è già aperta, i dati vengono passati a quella e la scheda nuova si chiude.
try { window.name = 'gestionaleCarte'; } catch (e) {}
const BC = 'BroadcastChannel' in window ? new BroadcastChannel('gestionaleCarte') : null;
const myId = Math.random().toString(36).slice(2);
let secondary = false;
if (BC) BC.onmessage = e => {
  const d = e.data || {};
  if (d.type === 'ping' && d.from !== myId && !secondary) BC.postMessage({ type: 'pong', from: myId, to: d.from });
  if (d.type === 'data' && d.to === myId && d.hash) {
    // dati arrivati da Cardmarket tramite una scheda nuova: li prendo qui (stessa elaborazione del cambio di indirizzo)
    (async () => {
      if (DBOK()) { try { window.__gsBoot = await dbGet(); } catch (er) {} }
      state = load();
      location.hash = d.hash;
      try { window.focus(); } catch (er) {}
    })();
  }
};
function otherTab() {
  if (!BC) return Promise.resolve(null);
  return new Promise(res => {
    const t = setTimeout(() => { BC.removeEventListener('message', h); res(null); }, 600);
    const h = e => { if (e.data && e.data.type === 'pong' && e.data.to === myId) { clearTimeout(t); BC.removeEventListener('message', h); res(e.data.from); } };
    BC.addEventListener('message', h);
    BC.postMessage({ type: 'ping', from: myId });
  });
}

(async () => {
  const other = await otherTab();
  if (other) {
    secondary = true;
    const hasData = /^#(cm2|cmedit|cmchk)=/.test(location.hash);
    if (hasData) BC.postMessage({ type: 'data', to: other, hash: location.hash });
    history.replaceState(null, '', location.pathname);
    document.body.innerHTML = `<div class="empty" style="margin:80px auto;max-width:560px;font-size:16px">
      <b>Il gestionale è già aperto in un'altra scheda.</b><br>${hasData ? 'Le carte da Cardmarket sono state inviate lì ✔<br>' : ''}
      Usa quella scheda: questa si chiude da sola (se non si chiude, chiudila tu).</div>`;
    setTimeout(() => { try { window.close(); } catch (e) {} }, 1500);
    return;
  }
  undoLast = JSON.stringify(state);
  // primo avvio con l'archivio grande: ci copio subito i dati che finora stavano solo nel vecchio spazio
  if (DBOK() && !window.__gsBoot) { let at = ''; try { at = localStorage.getItem(SAVED_AT) || ''; } catch (e) {} dbPut({ at: at || new Date().toISOString(), js: undoLast }); }
  tcgPurge(false);
  bkInit(); undoInit();
  if (gh) {
    await Promise.race([ghCheck('start'), new Promise(r => setTimeout(r, 8000))]);
    // modifiche rimaste da inviare dall'ultima volta (pagina chiusa prima del salvataggio)
    if (gh.dirty && !ghConflict) { ghDirty = true; setTimeout(() => { if (ghDirty && !ghConflict) ghWrite(); }, 4000); }
  }
  await loadSets();
  cleanVariants();
  const checked = importCheckFromHash();
  importEditFromHash();
  const arrived = importFromHash();
  const bySet = listingsBySet();
  selected = (checked && '__chk') || (arrived && tcgIdFor(arrived)) || Object.keys(bySet).sort((a, b) => bySet[b].length - bySet[a].length)[0] || (tcgSets[0] && tcgSets[0].id) || null;
  refresh();
  updatePrices(false); // aggiorna da solo i prezzi più vecchi di 12 ore
  loadMyCodes();
  setInterval(() => updatePrices(false), 3600e3); // e ricontrolla ogni ora se la pagina resta aperta
})();
