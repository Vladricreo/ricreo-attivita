import { PGlite } from "@electric-sql/pglite"
// Prova lo schema in un Postgres in memoria (PGlite) con un Supabase finto: permessi, trigger, notifiche.
// Uso (dalla cartella del modulo): bun install && node test/schema.mjs
import { readdirSync, readFileSync } from "node:fs"

const cartella = new URL("../supabase/migrations/", import.meta.url)
const migrazioni = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(cartella).filter((f) => f.endsWith(".sql")).sort().map((f) => new URL(f, cartella))
const db = new PGlite()
await db.exec(readFileSync(new URL("./supabase-finto.sql", import.meta.url), "utf8"))
for (const m of migrazioni) {
  try {
    await db.exec(readFileSync(m, "utf8"))
  } catch (e) {
    console.error("MIGRAZIONE FALLITA", m, e.message, e.position ? `pos ${e.position}` : "")
    process.exit(1)
  }
}

const U = { anna: "00000000-0000-0000-0000-00000000000a", bruno: "00000000-0000-0000-0000-00000000000b", carla: "00000000-0000-0000-0000-00000000000c", dario: "00000000-0000-0000-0000-00000000000d", elena: "00000000-0000-0000-0000-00000000000e" }
let errori = 0
const ok = (c, msg) => { if (!c) errori++; console.log(c ? "  ok " : "  NO ", msg) }

async function come(chi, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U[chi]}',false); select set_config('request.jwt.claim.role','authenticated',false);`)
  try { return await fn() } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);`)
  }
}
const q = async (sql, p) => { try { return (await db.query(sql, p)).rows } catch (e) { const err = new Error(e.message); throw err } }
async function errore(fn) { try { await fn(); return null } catch (e) { return e.message } }

// Carla (manager) segue Dario.
await db.exec(`insert into tasks.manager_persone (manager_id, persona_id) values ('${U.carla}', '${U.dario}')`)

console.log("Visibilità e notifiche di assegnazione")
const t1 = await come("bruno", async () => (await q(`select tasks.crea_task($1) id`, [{ titolo: "Inventario scaffale A", categoria_id: "inventory", assegnatari: [U.dario], app_origine: "inventory" }]))[0].id)
ok(!!t1, "bruno crea per dario")
const nDav = await come("dario", () => q(`select * from tasks.notifiche`))
ok(nDav.length === 1 && nDav[0].tipo === "assegnata" && nDav[0].app_slug === "inventory", `dario notificato in inventory (${JSON.stringify(nDav.map((n) => [n.tipo, n.app_slug]))})`)
const t2 = await come("bruno", async () => (await q(`select tasks.crea_task($1) id`, [{ titolo: "Pagare F24", categoria_id: "finance", assegnatari: [U.dario] }]))[0].id)
const n2 = await come("dario", () => q(`select app_slug from tasks.notifiche where task_id = $1`, [t2]))
ok(n2.length === 1 && n2[0].app_slug === null, "finance senza accesso → notifica in tutte le app")
ok((await come("elena", () => q(`select id from tasks.v_task`))).length === 0, "elena non vede nulla")
ok((await come("carla", () => q(`select id from tasks.v_task where id = $1`, [t1]))).length === 1, "carla (manager di dario) vede")
ok((await come("anna", () => q(`select id from tasks.v_task`))).length === 2, "anna admin vede tutto")
const pers = await come("dario", async () => (await q(`select tasks.crea_task($1) id`, [{ titolo: "Dentista", personale: true }]))[0].id)
ok((await come("anna", () => q(`select id from tasks.v_task where id = $1`, [pers]))).length === 0, "personale invisibile all'admin")
ok((await come("dario", () => q(`select id from tasks.v_task where id = $1`, [pers]))).length === 1, "personale visibile a chi l'ha creata")
ok(!!(await come("dario", () => errore(() => q(`insert into tasks.assegnatari (task_id, user_id) values ($1, $2)`, [pers, U.anna])))), "personale non assegnabile ad altri")
ok((await come("elena", () => q(`update tasks.task set titolo = 'x' where id = $1 returning id`, [t1]))).length === 0, "elena non modifica")

console.log("Cestino")
ok(!!(await come("dario", () => errore(() => q(`update tasks.task set eliminata_at = now() where id = $1`, [t1])))), "dario (non creatore) non elimina")
const el = await come("bruno", () => q(`update tasks.task set eliminata_at = now() where id = $1 returning eliminata_da`, [t1]))
ok(el[0]?.eliminata_da === U.bruno, "bruno elimina (cestino)")
await come("bruno", () => q(`update tasks.task set eliminata_at = null where id = $1`, [t1]))

console.log("Chat, menzioni, non letti")
await come("dario", () => q(`insert into tasks.commenti (task_id, testo) values ($1, 'Fatto metà')`, [t1]))
await come("dario", () => q(`insert into tasks.commenti (task_id, testo) values ($1, 'Fatto tutto')`, [t1]))
const nm = await come("bruno", () => q(`select tipo, conteggio, testo from tasks.notifiche where task_id = $1 and tipo = 'commento'`, [t1]))
ok(nm.length === 1 && nm[0].conteggio === 2 && nm[0].testo === "Fatto tutto", `commenti aggregati (${JSON.stringify(nm)})`)
const nl = await come("bruno", () => q(`select n_non_letti, n_commenti from tasks.v_task where id = $1`, [t1]))
ok(nl[0].n_non_letti === 2 && nl[0].n_commenti === 2, "2 non letti per bruno")
await come("bruno", () => q(`select tasks.segna_letta($1)`, [t1]))
ok((await come("bruno", () => q(`select n_non_letti from tasks.v_task where id = $1`, [t1])))[0].n_non_letti === 0, "letti dopo segna_letta")
ok((await come("elena", () => errore(() => q(`insert into tasks.commenti (task_id, testo) values ($1, 'ciao')`, [t1])))) !== null, "elena non commenta")
await come("dario", () => q(`insert into tasks.commenti (task_id, testo, menzioni) values ($1, '@Elena guarda', $2)`, [t1, [U.elena]]))
ok((await come("elena", () => q(`select tipo from tasks.notifiche where task_id = $1`, [t1])))[0]?.tipo === "menzione", "elena menzionata riceve la notifica")
ok((await come("elena", () => q(`select id from tasks.v_task where id = $1`, [t1]))).length === 1, "e ora vede l'attività")

console.log("Sottotask in sequenza e conferma di tutti")
const seq = await come("anna", async () => (await q(`select tasks.crea_task($1) id`, [{
  titolo: "Nuovo prodotto", categoria_id: "product-console", in_sequenza: true,
  sottotask: [
    { titolo: "Modello 3D", assegnatari: [U.bruno] },
    { titolo: "Foto", assegnatari: [U.dario] },
    { titolo: "Listing insieme", assegnatari: [U.bruno, U.dario], conferma_tutti: true },
  ],
}]))[0].id)
const subs = await come("anna", () => q(`select id, titolo, ordine from tasks.task where padre_id = $1 order by ordine`, [seq]))
ok(subs.length === 3 && subs[0].ordine === 1, "3 sottotask ordinate")
ok((await come("dario", () => q(`select id from tasks.v_task where id = $1`, [seq]))).length === 1, "chi ha una sottotask vede la principale")
await come("bruno", () => q(`select tasks.completa($1)`, [subs[0].id]))
const tocca = await come("dario", () => q(`select tipo, task_id from tasks.notifiche where tipo = 'tocca_a_te'`))
ok(tocca.length === 1 && tocca[0].task_id === subs[1].id, "dario: tocca a te per Foto")
await come("dario", () => q(`select tasks.completa($1)`, [subs[1].id]))
const tocca3 = await come("bruno", () => q(`select task_id from tasks.notifiche where tipo = 'tocca_a_te'`))
ok(tocca3.some((n) => n.task_id === subs[2].id), "bruno: tocca a te per Listing")
await come("bruno", () => q(`select tasks.segna_mia_parte($1)`, [subs[2].id]))
ok((await come("anna", () => q(`select completata_at from tasks.task where id = $1`, [subs[2].id])))[0].completata_at === null, "manca la parte di dario")
await come("dario", () => q(`select tasks.segna_mia_parte($1)`, [subs[2].id]))
ok((await come("anna", () => q(`select completata_at from tasks.task where id = $1`, [subs[2].id])))[0].completata_at !== null, "tutti hanno fatto → completata")
const fin = await come("anna", () => q(`select tipo from tasks.notifiche where task_id = $1 and tipo = 'sottotask_finite'`, [seq]))
ok(fin.length === 1, "anna: sottotask tutte finite")
const prog = await come("anna", () => q(`select n_sottotask, n_sottotask_fatte from tasks.v_task where id = $1`, [seq]))
ok(prog[0].n_sottotask === 3 && prog[0].n_sottotask_fatte === 3, "progresso 3/3")

console.log("Ricorrenti")
const ric = await come("anna", async () => (await q(`select tasks.crea_task($1) id`, [{ titolo: "Chiusura mese", categoria_id: "finance", scadenza: "2026-01-31", ricorrenza_unita: "month", ricorrenza_intervallo: 1, checklist: ["Banca", "Fatture"], sottotask: [{ titolo: "Estratto conto" }] }]))[0].id)
await come("anna", () => q(`update tasks.checklist set fatta_at = now() where task_id = $1`, [ric]))
const r1 = await come("anna", () => q(`select tasks.completa($1) r`, [ric]))
const dopo = await come("anna", () => q(`select scadenza::text, stato_id, ricorrenza_giorno, completata_at from tasks.task where id = $1`, [ric]))
console.log("    ", JSON.stringify(r1[0].r), JSON.stringify(dopo[0]))
ok(dopo[0].stato_id === "da_fare" && dopo[0].completata_at === null && dopo[0].scadenza.endsWith("-31") || dopo[0].scadenza.endsWith("-30"), "passa alla prossima occorrenza (fine mese)")
ok((await come("anna", () => q(`select count(*)::int n from tasks.checklist where task_id = $1 and fatta_at is not null`, [ric])))[0].n === 0, "checklist riaperta")
ok((await come("anna", () => q(`select count(*)::int n from tasks.completamenti where task_id = $1`, [ric])))[0].n === 1, "storico completamento")
await come("anna", () => q(`select tasks.annulla_completamento($1)`, [ric]))
const ann = await come("anna", () => q(`select scadenza::text, stato_id from tasks.task where id = $1`, [ric]))
ok(ann[0].scadenza === "2026-01-31", `annullo riporta la scadenza (${ann[0].scadenza})`)
ok((await come("anna", () => q(`select count(*)::int n from tasks.completamenti where task_id = $1`, [ric])))[0].n === 0, "annullo toglie lo storico")

console.log("Allegati e storage")
ok((await come("dario", () => errore(() => q(`insert into storage.objects (bucket_id, name, owner_id) values ('tasks', $1, $2)`, [`${t1}/a.jpg`, U.dario])))) === null, "dario carica su attività sua")
ok((await come("carla", () => errore(() => q(`insert into storage.objects (bucket_id, name, owner_id) values ('tasks', $1, $2)`, [`${pers}/a.jpg`, U.carla])))) !== null, "carla non carica su personale di dario")
const all = await come("dario", () => q(`insert into tasks.allegati (task_id, percorso, nome, tipo_mime) values ($1, $2, 'a.jpg', 'image/jpeg') returning id`, [t1, `${t1}/a.jpg`]))
ok((await come("dario", () => q(`select copertina_id, copertina_percorso from tasks.v_task where id = $1`, [t1])))[0].copertina_id === all[0].id, "prima foto = copertina")
ok(!!(await come("dario", () => errore(() => q(`insert into tasks.allegati (task_id, percorso, nome) values ($1, $2, 'b.jpg')`, [t1, `${t2}/b.jpg`])))), "percorso di un'altra attività rifiutato")

console.log("Persone e storico")
const pp = await come("dario", () => q(`select nome, ruoli, app from tasks.v_persone order by user_id`))
ok(pp.length === 5 && pp[0].ruoli.includes("Admin"), "v_persone con ruoli")
const st = await come("anna", () => q(`select azione from tasks.storico where task_id = $1 order by id`, [t1]))
console.log("    storico t1:", st.map((s) => s.azione).join(", "))
ok(st.length >= 4, "storico registrato")
ok((await come("dario", () => errore(() => q(`select tasks_private.notifica(array[$1::uuid], 'assegnata', $2)`, [U.anna, t1])))) !== null, "notifica() non chiamabile dagli utenti")

console.log("Vista app")
const app = await come("dario", () => q(`select slug from tasks.v_app order by ordine`))
ok(app.length === 4, `v_app (${app.map((a) => a.slug).join(",")})`)
const ces = await q(`select * from tasks.da_eliminare_definitivamente(0)`)
ok(ces.length >= 0, `cestino da svuotare: ${ces.length}`)
console.log(errori ? `\n${errori} controlli falliti` : "\nTutto ok")
process.exit(errori ? 1 : 0)
