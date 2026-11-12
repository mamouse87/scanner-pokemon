# Rigenera index.html (pulsante da trascinare nei preferiti) da cm-filler.js.
# Uso: npx terser cm-filler.js -c -m -o /tmp/min.js && python3 build.py /tmp/min.js
import sys, urllib.parse, html
code = open(sys.argv[1]).read().strip()
bm = 'javascript:' + urllib.parse.quote(code, safe="!*'();:@&=+$,/?#[]-_.~")
page = f'''<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card Scanner → Cardmarket</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;background:#111418;color:#e8eaed;max-width:720px;margin:auto;padding:24px}}
a.bm{{display:inline-block;background:#ffcb05;color:#111;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;margin:12px 0}}
code,pre{{background:#1c2128;border-radius:6px;padding:2px 6px}} pre{{padding:10px;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow:auto;font-size:11px}}
h2{{color:#ffcb05}} li{{margin:6px 0}}</style></head><body>
<h1>Card Scanner → Cardmarket</h1>
<h2>1. Installa il pulsante (una volta, dal PC)</h2>
<ol><li>Mostra la barra dei preferiti di Chrome: <code>Ctrl+Shift+B</code>.</li>
<li>Se avevi già il pulsante, eliminalo (tasto destro → Elimina) e trascina di nuovo questo:</li></ol>
<p><a class="bm" href="{html.escape(bm, quote=True)}">📋 Card Scanner → CM</a></p>
<h2>2. Ogni set</h2>
<ol><li>App: <b>Lista</b> → tocca il nome del set → scrivi l'eventuale commento → <b>Invia file</b> (Bluetooth, email, WhatsApp…).</li>
<li>Cardmarket: <b>Vendite → Inserisci carte bulk</b> → scegli l'espansione.</li>
<li>Premi <b>📋 Card Scanner → CM</b>, scegli il file ricevuto (o incolla il testo), imposta i centesimi da aggiungere e il tuo nome utente (la prima volta), poi <b>Compila la pagina</b>.</li>
<li>Prezzo = offerta più bassa in quella lingua, Near Mint o migliore, escluse le tue + i centesimi scelti. Se non riesce a leggerlo usa la tendenza e lo segnala in arancione.</li>
<li>Righe verdi = normali, viola = Reverse, arancione = nome o rarità diversi da quanto scansionato: controllale.</li>
<li>Premi il pulsante di invio di Cardmarket. Se il set ha 2 pagine: invia, vai alla seconda e premi di nuovo il pulsante (la lista resta caricata).</li></ol>
<p>Lo script non invia nulla da solo e non legge password.</p>
<h2>In alternativa</h2>
<p>Se il pulsante non funziona: sulla pagina di Cardmarket premi <code>F12</code> → <b>Console</b>, incolla il codice e premi Invio.</p>
<pre>{html.escape(code)}</pre>
</body></html>'''
open('index.html', 'w').write(page)
print('index.html aggiornato', len(bm))
