// Ponte su Cardmarket (mondo isolato dell'estensione): passa allo script del riquadro l'operazione del gestionale
// e porta indietro i risultati. Accetta solo messaggi della pagina stessa.
(() => {
  const FRESH_MS = 24 * 3600e3;
  const sig = p => p.slice(0, 200) + p.length;
  addEventListener('message', async e => {
    if (e.source !== window || !e.data || typeof e.data.csx !== 'string') return;
    const d = e.data;
    if (d.csx === 'want') {
      const { job } = await chrome.storage.local.get('job');
      const fresh = !!(job && !job.taken && Date.now() - job.at < FRESH_MS);
      window.postMessage({ csx: 'job', p: job ? job.p : '', url: job ? job.url : '', fresh }, location.origin);
    } else if (d.csx === 'taken' && typeof d.sig === 'string') {
      const { job } = await chrome.storage.local.get('job');
      if (job && !job.taken && sig(job.p) === d.sig) { job.taken = true; await chrome.storage.local.set({ job }); chrome.runtime.sendMessage({ t: 'badge' }); }
    } else if (d.csx === 'res' && typeof d.h === 'string' && /^#cm(2|edit|chk)=/.test(d.h)) {
      chrome.runtime.sendMessage({ t: 'res', h: d.h });
    }
  });
  // clic sull'icona dell'estensione: apro il riquadro
  chrome.runtime.onMessage.addListener(m => { if (m && m.t === 'open') window.postMessage({ csx: 'open' }, location.origin); });
})();
