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
<p>Lo script non invia nulla a Cardmarket e non legge password.</p>
<h2>Cambiare i prezzi delle carte già in vendita</h2>
<ol><li>Nel gestionale premi <b>✏️ Cambia prezzi su Cardmarket</b> (in alto per tutti i set, oppure nella pagina di un set): scegli il nuovo prezzo ("Da" o Tendenza ± centesimi) e controlla l'elenco.</li>
<li>Si apre la pagina <b>Le mie offerte</b> di Cardmarket: premi <b>📋 Card Scanner → CM</b>. Lo script legge da solo tutte le pagine delle tue offerte (Normali e Reverse) e trova quelle da cambiare.</li>
<li>Premi <b>▶ Inizia</b>: apre il riquadro "Modifica" di una carta alla volta e scrive il nuovo prezzo (campo giallo). Tu controlli e premi <b>MODIFICA ARTICOLO</b>; chiudendo il riquadro la carta viene saltata. Con "Conferma automatica" lo preme lo script, una carta ogni 3 secondi (puoi fermarlo con ⏸).</li>
<li>Alla fine premi <b>🔁 Verifica</b> (rilegge le offerte e controlla i prezzi) e <b>📤 Invia al gestionale</b>: i nuovi prezzi e la nuova regola entrano nel gestionale.</li></ol>
<h2>Prezzo</h2>
<p>Il prezzo si sceglie solo nel gestionale ("Apri su Cardmarket": "Da" o Tendenza ± centesimi, calcolato a parte per Normali e Reverse). Ogni volta che premi "Apri su Cardmarket" l'elenco ha un nome nuovo (es. <code>DLR-Dominio_Delta_20261115-030612</code>), così lo script lo tratta sempre come una lista nuova. Il prezzo non scende mai sotto 0,02 €; le righe senza prezzo hanno il bordo rosso.</p>
<p>Dopo "Invia al gestionale" i dati tornano nella pagina del gestionale già aperta (se si apre una scheda nuova, passa i dati a quella già aperta e si chiude da sola).</p>
<h2>Revisione prezzi</h2>
<p>Si fa nel <a href="../gestionale/" style="color:#ffcb05">gestionale</a>: i prezzi di mercato si aggiornano da soli e le carte con una variazione (anche di 0,01 €) vengono segnalate nel set, con il PDF della revisione e la conferma dei nuovi prezzi.</p>
<h2>In alternativa</h2>
<p>Se il pulsante non funziona: sulla pagina di Cardmarket premi <code>F12</code> → <b>Console</b>, incolla il codice e premi Invio.</p>
<pre>{html.escape(code)}</pre>
</body></html>'''
open('index.html', 'w').write(page)
print('index.html aggiornato', len(bm))
