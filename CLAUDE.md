# Regole per Claude (modulo ricreo-attivita)

Questo repo è **pubblico** ed è montato come git submodule in tutte le app Ricreo (finance, inventory,
print-farm, product-console, preventivatore). Qui si cambia solo la pagina Attività e il suo schema.

## Git
- Lavora sempre su `main`: niente branch, worktree o pull request (salvo richiesta esplicita).
- Dopo un push qui, ogni app va aggiornata (`git add modules/attivita` + commit nell'app): finché non
  lo fai, l'app resta sulla versione precedente.

## Pubblico
- Mai chiavi, token, URL di progetto, email, nomi di clienti o dati veri: né nel codice né nei test.
- La sicurezza sta nella RLS dello schema `tasks`, non nel codice del browser.

## Compatibilità con le app
- Tailwind: Finance è ancora v3, le altre v4. Solo classi valide in entrambe (niente `bg-(--x)`,
  `outline-hidden`, `inset-shadow`, colori `current/…`). Colori dinamici solo dalle mappe in `src/colori.ts`.
- Niente import con `@/`: solo percorsi relativi dentro `src/` (ogni app ha alias diversi).
- Componenti grafici solo da `src/ui/` (le app usano Radix o base-ui, shadcn diversi).
- Icone lucide: dopo averne aggiunte, `node scripts/controlla-icone.mjs <lucide-react.d.ts delle app>`
  (Finance ha 0.454, Inventory 1.x: alcuni nomi cambiano).
- Testi in italiano.

## Database
- Migration in `supabase/migrations/`, numerate in ordine. Dopo una modifica: `bun install` e
  `node test/schema.mjs` (Postgres in memoria con un Supabase finto) e aggiungi i controlli nuovi.
- Applicarle al database (progetto ricreo-db) solo con l'ok esplicito dell'utente.
- Funzioni interne in `tasks_private` (security definer, `search_path = ''`), viste `security_invoker`.
