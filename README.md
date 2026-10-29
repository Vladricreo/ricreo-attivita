# ricreo-attivita

Pagina **Attività** condivisa tra le app Ricreo (stile ClickUp) e il suo schema Supabase `tasks`.
Si monta come **git submodule** nelle app (finance, inventory, print-farm, product-console,
preventivatore): una task assegnata da Inventory a una persona la vede anche in Finance e in Print farm.

## Cosa fa

- **Viste**: Lista (per scadenza, stato, persona, categoria, priorità), Bacheca kanban con foto di
  copertina e trascinamento, Calendario (mese/settimana, ricorrenze future in trasparenza), Gantt (barre
  da trascinare, dipendenze), Dashboard (aperte, scadute, fatte, puntualità, carico per persona), Inbox,
  Archivio e Cestino, Impostazioni.
- **Attività**: più persone, osservatori, categoria (= app) e sottocategoria, stati personalizzabili,
  priorità, inizio e scadenza, stima, ricorrenze con preavviso, personali (le vede solo chi le crea).
- **Sottotask** con progresso, **in sequenza** (al passo dopo arriva "tocca a te"), passi con più persone
  che si chiudono quando **tutte** hanno fatto la loro parte; **checklist**; **dipendenze**.
- **Chat** per attività in tempo reale: @menzioni, risposte, reazioni, foto incollate/trascinate/scattate,
  "sta scrivendo", non letti. Foto e file nel bucket privato `tasks` (le foto si rimpiccioliscono prima).
- **Notifiche** per persona nell'app della categoria (o in tutte le sue se non usa quell'app).
- **Solleciti** (admin, o manager delle persone che segue): dal dettaglio o dal menu "…" di un'attività,
  a una persona coinvolta. *Promemoria* = notifica (e push) nell'app della categoria; *forte* = in più un
  popup in quell'app che resta finché non lo conferma (`PopupSolleciti`, montato dal provider: nessun lavoro
  nelle app). Chi lo manda vede se è stato visto.
- **Google Tasks e Calendar** (facoltativo, per persona, da Impostazioni): le attività assegnate con scadenza
  vanno nella lista "Ricreo" e/o nel calendario "Ricreo attività" del proprio Google. Nei due sensi: spunta,
  data/ora e titolo cambiati su Google tornano nell'attività (`tasks.google_applica`), task/eventi aggiunti lì
  diventano attività personali (`tasks.google_crea`), eliminare su Google manda nel cestino solo le personali
  proprie (le altre si ricreano).
  Consenso OAuth e sync li fa Finance (`/api/attivita/google/*`, cron `/api/cron/attivita-google`); le altre
  app aprono il link di Finance con un codice monouso (`tasks.google_avvia`), nessun lavoro nelle app.
- **Cestino**: eliminare sposta nel cestino; dopo un anno un job cancella righe e file.

## Chi vede cosa (RLS)

- Ognuno vede le attività in cui è coinvolto (creatore, assegnatario, osservatore, anche solo di una sottotask).
- Le **personali** solo chi le ha create, nemmeno gli admin.
- Ruolo **Admin** (`app_auth.has_role('Admin')`): tutte le altre. Ruolo **Manager**: quelle delle persone che
  segue (`tasks.manager_persone`, la decidono gli admin in Impostazioni).
- Chi vede modifica, commenta e completa; il cestino solo creatore, admin e manager.

## Database

Migration in `supabase/migrations/`. Vanno applicate al progetto Supabase condiviso (SQL editor o MCP).
Dopo la prima:

1. **Settings → API → Exposed schemas**: aggiungere `tasks` (non `tasks_private`).
2. Il bucket privato `tasks`, le policy di storage e le tabelle in tempo reale le crea la migration.

Prova in locale senza toccare il database: `cd test && bun install && node schema.mjs` (Postgres in
memoria con un Supabase finto: permessi, notifiche, sequenze, ricorrenze, cestino).

## Montarlo in un'app

1. Submodule, dentro la cartella del progetto Next (per inventory e print-farm è `client/`):
   ```bash
   git submodule add https://github.com/Vladricreo/ricreo-attivita.git modules/attivita
   ```
2. `tsconfig.json`:
   ```json
   "paths": {
     "@ricreo/attivita": ["./modules/attivita/src/index.ts"],
     "@ricreo/attivita/*": ["./modules/attivita/src/*"]
   }
   ```
   (con `src/` nell'app: `"./modules/attivita/src/index.ts"` resta relativo alla cartella del tsconfig).
3. Dipendenze: quelle in `package.json → dipendenzeApp` le deve avere **l'app**. Non fare `bun install`
   nella cartella del modulo (porterebbe un secondo React).
4. Tailwind:
   - v4: nel CSS globale `@source "../../modules/attivita/src";` (percorso relativo al file CSS);
   - v3: in `content` aggiungere `"./modules/attivita/src/**/*.{ts,tsx}"`.
   Servono i colori shadcn (`background`, `foreground`, `muted`, `primary`, `accent`, `border`, `input`,
   `ring`, `popover`, `card`, `destructive`, `secondary`) e la variante `dark` a classe.
5. Provider nel layout dell'app (una volta, anche per campanella e "nuova attività" da altre pagine):
   ```tsx
   "use client"
   import { AttivitaProvider, NuovaAttivitaGlobale } from "@ricreo/attivita"

   <AttivitaProvider
     config={{
       app: "inventory", // slug in public."RicreoApp"
       supabase: createBrowserClient(), // client del browser con la sessione
       percorso: "/dashboard/attivita", // dove sta la pagina in questa app
       avatarUrl: (p) => (p.avatar_path ? `/files/${p.avatar_path}` : null),
       naviga: (href) => router.push(href),
     }}
   >
     {children}
     <NuovaAttivitaGlobale />
   </AttivitaProvider>
   ```
6. Pagina: `export default function Page() { return <PaginaAttivita /> }` (client component).
7. Notifiche: `<CampanellaAttivita />` nella barra in alto, oppure unire `useNotificheApp()` alla campanella
   dell'app (Finance le legge lato server, vedi `lib/tasks/notifiche.ts` nel suo repo).
8. Da altre pagine: `apriNuovaAttivita({ titolo, scadenza, collegamenti: [{ app_slug, tipo, rif_id }] })`.

Opzionali in `config`: `pagine` (proposte per "Pagina da aprire"), `dopo` (dopo assegnazioni e messaggi,
per push immediate), `estensioni.dettaglio` / `estensioni.archivio` / `estensioni.collegamento`.

### Deploy (Coolify)

Il Dockerfile delle app fa `COPY . .`: il submodule deve essere scaricato nel build (Coolify lo fa per i
submodule pubblici). Il job del cestino gira in una sola app (Finance, nel cron delle notifiche) con
`pulisciCestino()` da `@ricreo/attivita/server`.

## Aggiornare il modulo

Si lavora dentro `modules/attivita` di un'app qualsiasi, sul ramo `main` del modulo:

```bash
cd modules/attivita
git checkout main && git pull
# … modifiche …
git add -A && git commit -m "…" && git push
```

Fatto il push, il workflow `.github/workflows/aggiorna-app.yml` porta il puntatore all'ultima versione su
`main` di **tutte** le app (Finance, Inventory, Print farm, Product console, Planner) con un commit
"Attività: aggiorna il modulo a …", e Coolify le ripubblica. Nell'app dove hai lavorato basta poi `git pull`.
Il workflow non torna mai indietro: se un'app è già su una versione più nuova, la lascia stare.

- Serve il secret `SYNC_TOKEN` in questo repo (Settings → Secrets and variables → Actions): un token GitHub
  con "Contents: Read and write" sui repo delle app. Si può rilanciare a mano da Actions.
- Una nuova app che monta il modulo va aggiunta alla `matrix` del workflow.
- In locale `predev` (prima di `bun dev`) porta il modulo all'ultima versione di `main` in tutte le app,
  così si vedono subito anche le modifiche fatte da un'altra app.
