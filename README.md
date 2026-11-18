# Card Scanner

Strumenti per catalogare e vendere carte Pokémon su Cardmarket (negozio LULU-MOUSE):

- **App Android "Card Scanner"** (`app/`): legge il numero della carta con la fotocamera (ML Kit), crea liste numerate per set e le invia al gestionale.
- **Gestionale** (`gestionale/`, su GitHub Pages: https://mamouse87.github.io/scanner-pokemon/gestionale/): magazzino delle carte in vendita e in Standby, prezzi di mercato (TCGdex e Price Guide di Cardmarket), vendite dagli ordini PDF, clienti diretti, controllo con Cardmarket, backup in un repository GitHub privato. Si può installare come app dal browser.
- **Pulsante "Card Scanner → CM"** (`cardmarket/`): script da mettere nei preferiti di Chrome; su Cardmarket compila la pagina "Inserisci carte bulk", cambia prezzi e copie, legge le offerte per il controllo del magazzino. Istruzioni e pulsante: https://mamouse87.github.io/scanner-pokemon/cardmarket/

## Come ottenere l'APK
Quando cambia l'app (`app/`), GitHub la compila da solo (scheda **Actions**, circa 5 minuti) e la pubblica nelle **Releases**: dal telefono apri l'ultima release, scarica `CardScanner.apk` e installalo. Le versioni nuove si installano sopra la precedente senza perdere le liste.

## Note
- Lo script dei preferiti si rigenera da `cardmarket/cm-filler.js` con `npx terser cm-filler.js -c -m -o /tmp/min.js && python3 build.py /tmp/min.js`.
- Il gestionale usa solo librerie salvate in `gestionale/lib` (vedi `gestionale/lib/LICENZE.txt`).
