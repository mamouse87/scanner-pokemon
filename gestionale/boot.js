// Avvio del gestionale: prima leggo i dati salvati nell'archivio grande del browser (IndexedDB, spazio in GB),
// poi carico app.js. Se l'archivio grande non c'è o non risponde, app.js usa la copia nel vecchio spazio (localStorage).
(function () {
  // l'invito "Installa come app" può arrivare prima di app.js: lo tengo da parte
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__gsPwa = e; });
  const go = () => { const s = document.createElement('script'); s.src = 'app.js'; document.body.appendChild(s); };
  let done = false;
  // ok = l'archivio grande ha risposto: solo allora app.js ci scrive (se non risponde non rischio di coprirlo con dati vecchi)
  const start = (v, ok) => { if (done) return; done = true; window.__gsBoot = v || null; window.__gsBootOk = !!ok; go(); };
  setTimeout(() => start(null, false), 10000);      // archivio bloccato: parto comunque con la copia di riserva
  try {
    const r = indexedDB.open('gestionaleDati', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('d');
    r.onerror = () => start(null, false);
    r.onblocked = () => start(null, false);
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('d', 'readonly').objectStore('d').get('state');
        g.onsuccess = () => { start(g.result, true); r.result.close(); };
        g.onerror = () => start(null, false);
      } catch (e) { start(null, false); }
    };
  } catch (e) { start(null, false); }
  // chiedo a Chrome di non cancellare mai questi dati (per l'app installata di solito lo concede da solo)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
})();
