# Rigenera l'estensione di Chrome (cartella estensione/) dallo stesso codice del pulsante (cm-filler.js)
# e prepara lo zip da scaricare. Uso: python3 cardmarket/build_ext.py
import json, os, re, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'cardmarket', 'cm-filler.js'), encoding='utf-8').read().rstrip()
start = '(async () => {'
assert start in src and src.endswith('})();'), 'forma di cm-filler.js cambiata'
body = src.replace(start, 'window.__csMain = async (csExt) => {', 1)[:-len('})();')] + '};\n'
starter = r'''
// ---------- avvio dall'estensione ----------
// Lo script è lo stesso del pulsante nei preferiti. Qui parte da solo a ogni pagina di Cardmarket:
// il riquadro si apre se il gestionale ha mandato un'operazione nuova (o sulla pagina bulk del set di un elenco non finito);
// il clic sull'icona dell'estensione lo apre sempre, come il pulsante.
(() => {
  if (window.top !== window) return;
  window.__csExtOn = true;
  const ask = () => new Promise(res => {
    const t = setTimeout(() => { removeEventListener('message', on); res(null); }, 1500);
    function on(e) { if (e.source !== window || !e.data || e.data.csx !== 'job') return; clearTimeout(t); removeEventListener('message', on); res(e.data); }
    addEventListener('message', on);
    window.postMessage({ csx: 'want' }, location.origin);
  });
  // operazione in attesa ma pagina sbagliata (per esempio dopo l'accesso Cardmarket ti riporta alla home):
  // una barra piccola con "Vai", senza finestre che bloccano. Non sulla pagina di accesso.
  function banner(r, bulk) {
    if (document.getElementById('csExtBar') || document.querySelector('input[type="password"]')) return;
    const h = document.createElement('div'); h.id = 'csExtBar';
    const sh = h.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>:host{all:initial}.b{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:10px;
      background:#12284c;color:#fff;font:14px/1.4 "Segoe UI",system-ui,sans-serif;padding:10px 12px 10px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
      b{color:#ffcb05}button{font:inherit;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}.go{background:#ffcb05;color:#12284c;font-weight:700}.no{background:transparent;color:#c8d3e6}</style>
      <div class="b"><span><b>Card Scanner</b> · c'è un'operazione dal gestionale (${bulk ? 'messa in vendita' : 'le tue offerte'})</span>
      <button class="go" id="go">Vai alla pagina</button><button class="no" id="no" title="Nascondi su questa pagina">✕</button></div>`;
    sh.getElementById('go').onclick = () => { location.href = r.url || (bulk ? '/it/Pokemon/Stock/ListingMethods/BulkListing' : '/it/Pokemon/Stock/Offers/Singles'); };
    sh.getElementById('no').onclick = () => h.remove();
    document.body.appendChild(h);
  }
  let busy = false;
  const go = async auto => {
    if (busy) return; busy = true;
    try {
      const r = await ask(), p = r && r.fresh && typeof r.p === 'string' ? r.p : '';
      if (auto && p) {
        const bulk = /^csjob=/.test(p), here = bulk ? !!document.getElementById('BulkListingForm') : /\/Stock\/Offers\//i.test(location.pathname);
        if (!here) { banner(r, bulk); return; }
      }
      const bar = document.getElementById('csExtBar'); if (bar) bar.remove();
      await window.__csMain({ auto, p });
    }
    catch (e) { console.error('Card Scanner', e); }
    finally { busy = false; }
  };
  addEventListener('message', e => { if (e.source === window && e.data && e.data.csx === 'open') go(false); });
  go(true);
})();
'''
head = '// Card Scanner → Cardmarket (estensione). FILE GENERATO da cardmarket/build_ext.py: modificare cardmarket/cm-filler.js.\n'
open(os.path.join(ROOT, 'estensione', 'cardscanner.js'), 'w', encoding='utf-8').write(head + body + starter)
# zip da scaricare: una cartella "CardScanner-estensione" con dentro i file
man = json.load(open(os.path.join(ROOT, 'estensione', 'manifest.json'), encoding='utf-8'))
zp = os.path.join(ROOT, 'card-scanner-estensione.zip')
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, dn, fn in os.walk(os.path.join(ROOT, 'estensione')):
        for f in sorted(fn):
            full = os.path.join(dp, f)
            z.write(full, os.path.join('CardScanner-estensione', os.path.relpath(full, os.path.join(ROOT, 'estensione'))))
print('estensione', man['version'], '→', zp, os.path.getsize(zp), 'byte')
