ACCADEMIA ADMIN DESKTOP
README OPERATIVO INTERNO

1. Scopo dell'app
Questa applicazione desktop è ad uso interno/admin.
Serve come strumento operativo per gestione tesi, workspace redazionale, diagnostica, export e test del flusso admin.

2. Versioni disponibili
Versione sviluppo:
- usata per sviluppo, debug e test locali
- si avvia dal progetto con npm start

Versione portable:
- eseguibile standalone
- non richiede installazione classica
- utile per test rapidi o distribuzione interna controllata

Versione setup:
- installer Windows
- installa l'app come applicazione desktop standard

3. Avvio in sviluppo
Dal root del progetto:

  npm start

Questo avvia Electron usando i file locali correnti del progetto.

4. File avvia-admin-desktop.vbs
Il file avvia-admin-desktop.vbs serve per avviare rapidamente l'app desktop su Windows con doppio click, evitando l'uso manuale del terminale in alcuni contesti interni.

5. Output build
I file di build vengono generati nella cartella:

  dist/

In dist/ puoi trovare, a seconda del comando eseguito:
- win-unpacked
- installer Setup
- eseguibile Portable
- file di configurazione generati da electron-builder

6. Differenza tra Setup e Portable
Setup:
- installa l'app nel sistema
- crea un'installazione Windows standard
- adatto a postazioni dove l'app deve restare installata

Portable:
- eseguibile singolo o pacchetto portabile
- non richiede installazione completa
- adatto a uso rapido, test o distribuzione interna temporanea

7. Rigenerare la build
Per build unpacked:

  npm run pack

Per build distribuita completa:

  npm run dist

Comandi aggiuntivi disponibili:

  npm run dist:win
  npm run dist:portable

8. Cartelle da non versionare
Le cartelle seguenti non vanno versionate:
- node_modules
- dist

Sono output locali o artefatti generati.

9. Dati locali dell'app
Lo stato principale della desktop admin viene salvato in modo portabile nella cartella del progetto/app:

  storage/admin-state.json

In sviluppo (`npm start`) il file resta quindi dentro `accademia-admin-desktop/storage/`.
Nelle build packaged/portable l'app prova a usare una cartella `storage/` adiacente all'eseguibile, evitando percorsi non scrivibili dentro `app.asar`.

Per compatibilita' resta supportato anche il vecchio archivio legacy in `userData/storage/admin-state.json`.
Se il file portabile non esiste ma il legacy esiste, l'app ne copia automaticamente una versione nello storage portabile e crea anche un backup timestampato nella stessa cartella `storage/`.
Il file legacy non viene mai cancellato automaticamente.

10. Buona pratica prima di modifiche importanti
Prima di modifiche rilevanti a renderer, main process, packaging o servizi:
- fare commit Git
- oppure creare almeno un punto di ripristino chiaro

Questo riduce il rischio di perdere una versione stabile.

11. Uso corretto
L'app va usata come supporto redazionale, organizzativo e metodologico al lavoro di tesi.
Non va usata per sostituzione fraudolenta del lavoro dello studente o per finalità scorrette.
