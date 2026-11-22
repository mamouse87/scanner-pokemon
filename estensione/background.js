// Card Scanner → Cardmarket: smista le operazioni tra il gestionale e Cardmarket.
// - gestionale → "job": salva l'operazione (lo fa il ponte) e apre/riusa la scheda di Cardmarket
// - Cardmarket → "res": porta il risultato nella finestra del gestionale già aperta (o la apre)
// - clic sull'icona: apre il riquadro nella scheda di Cardmarket (o porta a Cardmarket)
const CM = 'https://www.cardmarket.com/';
const GEST = 'https://mamouse87.github.io/scanner-pokemon/gestionale/';
const FRESH_MS = 24 * 3600e3;
// versione nuova: controllo il manifest pubblicato su GitHub Pages (al massimo ogni 3 ore)
const MANIFEST_URL = GEST.replace('gestionale/', 'estensione/manifest.json');
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate(force) {
  const { upd } = await chrome.storage.local.get('upd');
  if (!force && upd && Date.now() - upd.at < 3 * 3600e3) return;
  try {
    const r = await fetch(MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const m = await r.json(), cur = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({ upd: { at: Date.now(), ver: m && newer(m.version, cur) ? m.version : '' } });
  } catch (e) { /* senza rete: riprovo più tardi */ }
  badge();
}

async function pending() {
  const { job } = await chrome.storage.local.get('job');
  return job && !job.taken && Date.now() - job.at < FRESH_MS ? job : null;
}
async function badge() {
  const j = await pending(), { upd } = await chrome.storage.local.get('upd'), nv = upd && upd.ver;
  await chrome.action.setBadgeBackgroundColor({ color: j ? '#d9620f' : '#1f8f55' });
  await chrome.action.setBadgeText({ text: j ? '1' : nv ? '↑' : '' });
  await chrome.action.setTitle({ title: (j ? 'Card Scanner: operazione dal gestionale in attesa' : 'Card Scanner: apri il riquadro su Cardmarket') + (nv ? ` · c'è la versione nuova ${nv} dell'estensione` : '') });
}
async function normalWindow() {
  const ws = await chrome.windows.getAll({ windowTypes: ['normal'] });
  return ws.find(w => w.focused) || ws[0] || null;
}
async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
}
/** riusa la scheda di Cardmarket se c'è (la più recente), altrimenti ne apre una in una finestra normale di Chrome */
async function openCm(url) {
  const tabs = (await chrome.tabs.query({ url: CM + '*' })).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { url }); await focusTab(tabs[0]); return; }
  const w = await normalWindow();
  if (w) { const t = await chrome.tabs.create({ windowId: w.id, url }); await focusTab(t); }
  else await chrome.windows.create({ url, focused: true });
}
/** risultato dello script → finestra del gestionale (anche l'app installata) */
async function toGest(h) {
  const tabs = (await chrome.tabs.query({ url: GEST + '*' })).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const t of tabs) {
    try { await chrome.tabs.sendMessage(t.id, { t: 'res', h }); await focusTab(t); return; } catch (e) { /* ponte non presente: provo la prossima */ }
  }
  const w = await normalWindow();
  if (w) await chrome.tabs.create({ windowId: w.id, url: GEST + h });
  else await chrome.windows.create({ url: GEST + h, focused: true });
}

chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || !sender.url) return;
  if (m.t === 'job' && sender.url.startsWith(GEST) && typeof m.url === 'string' && m.url.startsWith(CM)) { badge(); openCm(m.url); checkUpdate(); }
  else if (m.t === 'res' && sender.url.startsWith(CM) && /^#cm(2|edit|chk)=/.test(m.h || '')) toGest(m.h);
  else if (m.t === 'badge') badge();
});
chrome.action.onClicked.addListener(async tab => {
  if (tab && tab.url && tab.url.startsWith(CM)) { try { await chrome.tabs.sendMessage(tab.id, { t: 'open' }); return; } catch (e) {} }
  const j = await pending();
  openCm(j && j.url ? j.url : CM + 'it/Pokemon');
});
chrome.runtime.onStartup.addListener(() => checkUpdate(true));
chrome.runtime.onInstalled.addListener(() => checkUpdate(true));
