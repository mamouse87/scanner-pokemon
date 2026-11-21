# Rigenera index.html (pulsante da trascinare nei preferiti) da cm-filler.js.
# Uso: npx terser cm-filler.js -c -m -o /tmp/min.js && python3 build.py /tmp/min.js
import sys, urllib.parse, html
code = open(sys.argv[1]).read().strip()
# "void": il pulsante non deve restituire nulla, altrimenti il browser sostituisce la pagina con il risultato
if not code.startswith('void '): code = 'void ' + code
bm = 'javascript:' + urllib.parse.quote(code, safe="!*'();:@&=+$,/?#[]-_.~")
page = f'''<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card Scanner → Cardmarket</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;background:#111418;color:#e8eaed;max-width:720px;margin:auto;padding:24px}}
a.bm{{display:inline-block;background:#ffcb05;color:#111;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none;margin:12px 0}}
code,pre{{background:#1c2128;border-radius:6px;padding:2px 6px}} pre{{padding:10px;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow:auto;font-size:11px}}
h2{{color:#ffcb05}} li{{margin:6px 0}}</style></head><body>
<h1>Card Scanner → Cardmarket</h1>
<h2>Estensione di Chrome (in prova)</h2>
<p>Fa le stesse cose del pulsante, ma non devi premerlo: quando il gestionale prepara un'operazione, su Cardmarket il riquadro si apre da solo, anche dopo che Cardmarket ti ha chiesto di accedere. Il gestionale riusa sempre la stessa scheda di Cardmarket.</p>
<ol><li>Scarica <a href="../card-scanner-estensione.zip" style="color:#ffcb05"><b>card-scanner-estensione.zip</b></a> ed estrailo in una cartella che <b>non cancellerai</b> (per esempio <code>Documenti\\CardScanner-estensione</code>). Dentro c'è il file <code>manifest.json</code>.</li>
<li>In Chrome apri <code>chrome://extensions</code> e accendi <b>Modalità sviluppatore</b> (in alto a destra).</li>
<li>Premi <b>Carica estensione non pacchettizzata</b> e scegli la cartella <code>CardScanner-estensione</code>.</li>
<li>Premi l'icona del puzzle accanto alla barra degli indirizzi e fissa <b>Card Scanner → Cardmarket</b> con la puntina.</li>
<li>Ricarica il gestionale (Ctrl+F5) e le schede di Cardmarket aperte.</li></ol>
<p><b>Uso:</b> dal gestionale premi i soliti pulsanti (Metti in vendita, Cambia prezzi, Nuovo controllo). Sull'icona compare un <b>1</b> arancione finché l'operazione non arriva su Cardmarket. Se chiudi il riquadro, lo riapri cliccando l'icona. Sulle pagine 2, 3… dello stesso set il riquadro si riapre da solo.</p>
<p><b>Aggiornare:</b> scarica di nuovo lo zip, estrailo sopra la stessa cartella (sostituisci i file), poi in <code>chrome://extensions</code> premi la freccia circolare ↻ sull'estensione e ricarica le schede di Cardmarket.</p>
<p>Il pulsante qui sotto continua a funzionare: tienilo come riserva finché l'estensione non ti convince.</p>
<h2>1. Installa il pulsante (una volta, dal PC)</h2>
<ol><li>Mostra la barra dei preferiti di Chrome: <code>Ctrl+Shift+B</code>.</li>
<li>Se avevi già il pulsante, eliminalo (tasto destro → Elimina) e trascina di nuovo questo:</li></ol>
<p><a class="bm" href="{html.escape(bm, quote=True)}">📋 Card Scanner → CM</a></p>
<h2>2. Mettere in vendita le carte di un set</h2>
<ol><li>Nel <a href="../gestionale/" style="color:#ffcb05">gestionale</a> premi <b>＋ Aggiungi carte</b> e carica i file .txt dell'app (oppure aggiungi a mano poche carte): le carte vanno in <b>Standby</b>.</li>
<li>Apri il set e premi <b>Metti in vendita su Cardmarket</b>: scegli il prezzo ("Da", Tendenza o Consigliato, ± centesimi). Il gestionale calcola il prezzo di ogni carta, <b>Normali e Reverse separate</b>.</li>
<li>Si apre Cardmarket: premi <b>📋 Card Scanner → CM</b>. Se non sei già sulla pagina "Inserisci carte bulk" del set ti ci porta; lì premilo di nuovo.</li>
<li>Premi <b>Compila la pagina</b> e controlla. Le righe con il <b>bordo rosso</b> non hanno un prezzo: scrivilo tu.</li>
<li>Premi tu <b>Mettere in vendita le carte</b> su Cardmarket. Poi premi il pulsante verde <b>📤 Le ho messe in vendita: invia al gestionale</b>. Lo script controlla su Cardmarket che le carte siano davvero in vendita e manda al gestionale solo quelle: se qualcuna manca te lo dice.</li>
<li>Se il set ha più pagine: vai alla pagina successiva, premi di nuovo il pulsante (l'elenco resta caricato) e ripeti.</li></ol>
<h2>Cambiare i prezzi delle carte già in vendita</h2>
<ol><li>Nel gestionale apri la scheda <b>Fuori mercato</b> ("Cambia questi prezzi su Cardmarket" o "Cambia i prezzi di tutte le carte…"), oppure premi <b>✏️ Cambia prezzi di questo set</b> nella pagina di un set.</li>
<li>Si apre <b>Le mie offerte</b> di Cardmarket: premi <b>📋 Card Scanner → CM</b>. Lo script legge le tue offerte (oltre 300 le legge set per set, con il filtro Edizione).</li>
<li>Premi <b>▶ Cambia i prezzi</b>: per ogni carta apre la pagina della sua Edizione in un riquadro con il bordo giallo, apre "Modifica" e scrive il nuovo prezzo. Tu premi <b>MODIFICA ARTICOLO</b> (con la spunta <b>Conferma automatica</b> lo preme lo script). Dopo ogni carta rilegge il prezzo su Cardmarket per controllare che sia cambiato davvero.</li>
<li>Alla fine premi <b>📤 Invia al gestionale</b>.</li></ol>
<h2>Controllare il magazzino (e correggere le copie)</h2>
<ol><li>Nel gestionale apri la scheda <b>Controllo</b>, premi <b>Nuovo controllo</b> e poi <b>Apri le mie offerte</b>. Se metti la spunta <b>Correggi subito su Cardmarket le copie in più</b>, controllo e correzione si fanno in un colpo solo.</li>
<li>Su Cardmarket premi <b>📋 Card Scanner → CM</b>, poi <b>🔎 Leggi le mie offerte</b>.</li>
<li>Con la spunta: lo script ti mostra le carte che su Cardmarket hanno <b>più</b> copie che nel gestionale; premi <b>▶ Correggi le quantità</b>. Le copie si tolgono con il pulsante rosso <b>−</b> della riga, nella pagina della sua Edizione. Dove su Cardmarket ce ne sono <b>meno</b> non tocca nulla (può essere una vendita non ancora caricata).</li>
<li>Premi <b>📤 Invia al gestionale</b>: nella scheda <b>Controllo</b> vedi le differenze rimaste e scegli tu: <b>Usa…</b> corregge il gestionale, <b>Correggi su Cardmarket</b> fa cambiare le copie su Cardmarket dallo script.</li>
<li>Le offerte da portare a 0 copie lo script non le cancella mai: le togli tu.</li></ol>
<h2>Cosa fa lo script su Cardmarket</h2>
<p>Lo script non legge password e non mette in vendita nulla da solo: "Mettere in vendita le carte" lo premi sempre tu. Cambia prezzi e copie solo quando premi ▶: senza la spunta <b>Conferma automatica</b> ogni modifica la confermi tu; con la spunta la conferma lo script, una carta ogni 3 secondi, e poi la ricontrolla.</p>
<p>Il gestionale apre Cardmarket sempre nella stessa scheda: se è già aperta, la riusa. Se Cardmarket ti chiede di accedere, dopo l'accesso ripremi il pulsante nel gestionale: l'operazione arriva in quella scheda. In alto nel riquadro dello script vedi a che ora è arrivata l'operazione che sta usando.</p>
<p>Dopo "Invia al gestionale" i dati tornano nella pagina del gestionale già aperta (se si apre una scheda nuova, passa i dati a quella già aperta e si chiude da sola). In fondo al riquadro dello script c'è la versione: se non è quella nuova, elimina il pulsante dai preferiti e trascinalo di nuovo da questa pagina.</p>
<h2>In alternativa</h2>
<p>Se il pulsante non funziona: sulla pagina di Cardmarket premi <code>F12</code> → <b>Console</b>, incolla il codice e premi Invio.</p>
<pre>{html.escape(code)}</pre>
</body></html>'''
open('index.html', 'w').write(page)
print('index.html aggiornato', len(bm))
