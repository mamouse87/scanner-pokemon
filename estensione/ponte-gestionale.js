// Ponte sul gestionale (mondo isolato dell'estensione): il gestionale vede che l'estensione c'è e le passa le operazioni
// per Cardmarket; i risultati dello script arrivano qui e diventano l'indirizzo #cm2= / #cmedit= / #cmchk= del gestionale.
(() => {
  const mark = () => { if (document.documentElement) document.documentElement.dataset.csExt = chrome.runtime.getManifest().version; };
  mark(); document.addEventListener('DOMContentLoaded', mark);
  // dopo un aggiornamento dell'estensione questo ponte resta "orfano" finché la pagina non si ricarica: lo dico al gestionale,
  // che apre Cardmarket da solo (e i clic successivi non passano più di qui)
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (x) { return false; } };
  const ack = (ok) => { if (!ok) delete document.documentElement.dataset.csExt; window.postMessage({ csExtAck: ok }, location.origin); };
  addEventListener('message', async e => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.csExt !== 'job') return;
    const { p, url } = e.data;
    if (typeof p !== 'string' || !/^cs(job|edit|check)=/.test(p) || typeof url !== 'string' || !url.startsWith('https://www.cardmarket.com/')) return;
    if (!alive()) { ack(false); return; }
    try {
      await chrome.storage.local.set({ job: { p, url, at: Date.now(), taken: false } });
      chrome.runtime.sendMessage({ t: 'job', url }).catch(() => {});
      ack(true);
    } catch (x) { ack(false); }
  });
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (m && m.t === 'res' && /^#cm(2|edit|chk)=/.test(m.h || '')) { location.hash = m.h; reply(true); }
  });
})();
