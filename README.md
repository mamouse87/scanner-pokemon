# Card Scanner

App Android per catalogare velocemente carte Pokémon: legge il numero (es. 123/198) con il riconoscimento testo di Google (ML Kit), lo verifica sul set scelto e crea la lista per vendita in lotti.

## Come ottenere l'APK
Ogni volta che i file cambiano sul ramo `main`, GitHub compila l'app da solo (scheda **Actions**, circa 5 minuti).
L'APK pronto si trova nella sezione **Releases** del repository: apri l'ultima release dal telefono, scarica `CardScanner.apk` e installalo (consenti l'installazione da origini sconosciute se richiesto).
Le versioni successive si installano sopra la precedente senza perdere la lista.

## Modalità
- **Singola**: inquadra la carta intera, viene aggiunta da sola appena legge numero (e nome, se "Verifica nome" è attivo).
- **Ventaglio**: sovrapponi le carte lasciando visibile la riga del numero in basso, premi "Leggi ventaglio", controlla i riquadri verdi e conferma.

Il file `index.html` è la vecchia versione web (GitHub Pages).
