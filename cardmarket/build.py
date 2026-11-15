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
<ol><li>Su Cardmarket apri <b>Inserisci carte bulk</b> dell'espansione e premi <b>📋 Card Scanner → CM</b>.</li>
<li>Carica il file .txt dell'app: nel riquadro <b>📦 Lista</b> vedi tutte le carte (numero, nome, Reverse, quantità) e dove si trovano.</li>
<li>Scegli il prezzo ("Da" o Tendenza, ± centesimi), premi <b>Compila la pagina</b> e controlla.</li>
<li>Premi il pulsante verde <b>📤 Invia al gestionale</b>: il <a href="../gestionale/" style="color:#ffcb05">gestionale</a> riceve le carte compilate con i prezzi, e nella lista dello script diventano "✔ inviata".
<li>Metti in vendita su Cardmarket tu stesso (pulsante "Mettere in vendita le carte").</li>
<li>Per le carte rimaste: vai alla pagina giusta, premi di nuovo il pulsante nei preferiti (la lista resta caricata) e ripeti.</li></ol>
<p>Lo script non invia nulla a Cardmarket e non legge password.</p>
<h2>Prezzo</h2>
<p>Nel riquadro scegli la base: <b>"Da" (prezzo minimo)</b> oppure <b>Tendenza</b>, poi <b>+</b> o <b>−</b> e quanti centesimi (es. 150 = 1,50 €). Il prezzo non scende mai sotto 0,02 €.
I valori li legge direttamente dalla pagina "Inserisci carte bulk", senza aprire altre pagine di Cardmarket. Per le Reverse prova a usare la Price Guide di Cardmarket; se non riesce usa i valori della versione normale e colora la riga di arancione.</p>
<h2>Revisione prezzi</h2>
<p>Si fa nel <a href="../gestionale/" style="color:#ffcb05">gestionale</a> (💶 Revisione prezzi): i prezzi di Cardmarket si aggiornano da soli, non serve più questo pulsante.</p>
<h2>In alternativa</h2>
<p>Se il pulsante non funziona: sulla pagina di Cardmarket premi <code>F12</code> → <b>Console</b>, incolla il codice e premi Invio.</p>
<pre>{html.escape(code)}</pre>
</body></html>'''
open('index.html', 'w').write(page)
print('index.html aggiornato', len(bm))
