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
<h2>2. Ogni set (consigliato: dal gestionale)</h2>
<ol><li>Nel <a href="../gestionale/" style="color:#ffcb05">gestionale</a> carica il file .txt dell'app (<b>📥 Carica catalogo</b>): le carte vanno in <b>Standby</b>.</li>
<li>Apri il set e premi <b>Apri su Cardmarket</b>: scegli il prezzo ("Da" o Tendenza, ± centesimi). Il gestionale calcola il prezzo di ogni carta, <b>Normali e Reverse separate</b>; se serve puoi cambiarne uno a mano.</li>
<li>Si apre Cardmarket: premi <b>📋 Card Scanner → CM</b>. Se non sei già sulla pagina "Inserisci carte bulk" del set ti ci porta; lì premilo di nuovo. L'elenco e i prezzi sono già caricati.</li>
<li>Premi <b>Compila la pagina</b> e controlla. Le righe con il <b>bordo rosso</b> non hanno un prezzo (per esempio una Reverse senza prezzo Reverse): scrivilo tu. Lo script non usa mai il prezzo della versione normale per una Reverse.</li>
<li>Metti in vendita su Cardmarket tu stesso, poi premi il pulsante verde <b>📤 Invia al gestionale</b>: le carte passano da Standby a In vendita.</li>
<li>Se il set ha più pagine: vai alla pagina successiva, premi di nuovo il pulsante (l'elenco resta caricato) e ripeti.</li></ol>
<p>Puoi ancora caricare il file .txt direttamente nello script (📄): in quel caso i prezzi delle Normali li prende dalla pagina, e le Reverse restano vuote se non trova il loro prezzo.</p>
<p>Lo script non invia nulla a Cardmarket e non legge password.</p>
<h2>Prezzo</h2>
<p>Nel riquadro scegli la base: <b>"Da" (prezzo minimo)</b> oppure <b>Tendenza</b>, poi <b>+</b> o <b>−</b> e quanti centesimi (es. 150 = 1,50 €). Il prezzo non scende mai sotto 0,02 €.
I valori li legge direttamente dalla pagina "Inserisci carte bulk", senza aprire altre pagine di Cardmarket. Per le Reverse prova a usare la Price Guide di Cardmarket; se non riesce usa i valori della versione normale e colora la riga di arancione.</p>
<h2>Revisione prezzi</h2>
<p>Si fa nel <a href="../gestionale/" style="color:#ffcb05">gestionale</a>: i prezzi di mercato si aggiornano da soli e le carte con una variazione (anche di 0,01 €) vengono segnalate nel set, con il PDF della revisione e la conferma dei nuovi prezzi.</p>
<h2>In alternativa</h2>
<p>Se il pulsante non funziona: sulla pagina di Cardmarket premi <code>F12</code> → <b>Console</b>, incolla il codice e premi Invio.</p>
<pre>{html.escape(code)}</pre>
</body></html>'''
open('index.html', 'w').write(page)
print('index.html aggiornato', len(bm))
