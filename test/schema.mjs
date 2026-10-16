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

console.log("Preferenze")
await come("dario", () => q(`insert into tasks.preferenze (user_id, vista_iniziale) values ($1, 'bacheca')`, [U.dario]))
ok((await come("dario", () => q(`select vista_iniziale from tasks.preferenze`)))[0]?.vista_iniziale === "bacheca", "dario salva la sua vista iniziale")
ok((await come("elena", () => q(`select * from tasks.preferenze`))).length === 0, "elena non vede le preferenze di dario")
ok(!!(await come("elena", () => errore(() => q(`insert into tasks.preferenze (user_id, vista_iniziale) values ($1, 'lista')`, [U.dario])))), "elena non scrive le preferenze di dario")
ok((await come("elena", () => q(`update tasks.preferenze set vista_iniziale = 'lista' where user_id = $1 returning user_id`, [U.dario]))).length === 0, "elena non modifica le preferenze di dario")
ok(!!(await come("dario", () => errore(() => q(`update tasks.preferenze set vista_iniziale = 'inbox' where user_id = $1`, [U.dario])))), "vista iniziale non valida rifiutata")
await come("dario", () => q(`insert into tasks.preferenze (user_id, vista_iniziale) values ($1, null) on conflict (user_id) do update set vista_iniziale = excluded.vista_iniziale`, [U.dario]))
ok((await come("dario", () => q(`select vista_iniziale from tasks.preferenze`)))[0]?.vista_iniziale === null, "upsert: torna all'ultima usata")

console.log("Solleciti")
// t1: creata da bruno, categoria inventory, assegnata a dario (carla è sua manager); elena è stata menzionata.
const sol = (chi, persona, forte, msg = null) => come(chi, () => errore(() => q(`select tasks.sollecita($1, $2, $3, $4)`, [t1, U[persona], forte, msg])))
ok((await sol("elena", "dario", false)) !== null, "elena (né admin né manager) non sollecita")
ok((await sol("carla", "elena", false)) !== null, "carla non sollecita chi non segue")
ok((await sol("dario", "dario", false)) !== null, "non si sollecita se stessi")
ok((await sol("carla", "dario", false, "Ci sei?")) === null, "carla (manager) sollecita dario")
ok((await sol("carla", "dario", true)) !== null, "secondo sollecito entro un minuto rifiutato")
const nSol = await come("dario", () => q(`select tipo, testo, app_slug, attore from tasks.notifiche where task_id = $1 and tipo like 'sollecito%'`, [t1]))
ok(nSol.length === 1 && nSol[0].tipo === "sollecito" && nSol[0].testo === "Ci sei?" && nSol[0].app_slug === "inventory" && nSol[0].attore === U.carla, `notifica di sollecito in inventory (${JSON.stringify(nSol)})`)
ok((await sol("anna", "dario", true, "Urgente")) === null, "anna (admin) manda un sollecito forte")
const daVedere = await come("dario", () => q(`select id, forte, app_slug, messaggio from tasks.solleciti where a = $1 and visto_at is null order by creato_at`, [U.dario]))
ok(daVedere.length === 2 && daVedere[1].forte && daVedere[1].app_slug === "inventory", "dario vede i suoi due solleciti")
ok((await come("elena", () => q(`select id from tasks.solleciti`))).length === 0, "elena non vede i solleciti degli altri")
ok((await come("carla", () => q(`select id from tasks.solleciti`))).length === 1, "carla vede solo quello che ha mandato")
ok(!!(await come("dario", () => errore(() => q(`update tasks.solleciti set visto_at = now()`)))), "niente update diretti")
await come("dario", () => q(`update tasks.notifiche set letta_at = now() where task_id = $1 and tipo = 'sollecito'`, [t1]))
const dopoLetta = await come("dario", () => q(`select forte, visto_at from tasks.solleciti where a = $1 order by creato_at`, [U.dario]))
ok(dopoLetta[0].visto_at !== null && dopoLetta[1].visto_at === null, "notifica letta → visto il normale, il forte resta")
await come("elena", () => q(`select tasks.conferma_sollecito($1)`, [daVedere[1].id]))
ok((await come("dario", () => q(`select visto_at from tasks.solleciti where id = $1`, [daVedere[1].id])))[0].visto_at === null, "elena non conferma quello di dario")
await come("dario", () => q(`select tasks.conferma_sollecito($1)`, [daVedere[1].id]))
ok((await come("dario", () => q(`select count(*)::int n from tasks.solleciti where a = $1 and visto_at is null`, [U.dario])))[0].n === 0, "dario conferma il popup")
ok((await come("dario", () => q(`select count(*)::int n from tasks.notifiche where task_id = $1 and tipo like 'sollecito%' and letta_at is null`, [t1])))[0].n === 0, "e le notifiche di sollecito sono lette")
ok((await come("anna", () => errore(() => q(`select tasks.sollecita($1, $2, false)`, [pers, U.dario])))) !== null, "personale non sollecitabile")
ok((await come("anna", () => q(`select count(*)::int n from tasks.storico where task_id = $1 and azione = 'sollecito'`, [t1])))[0].n === 2, "solleciti nello storico")

console.log("Google Tasks e Calendar")
ok(!!(await come("dario", () => errore(() => q(`select * from tasks.google_account`)))), "le tabelle Google non si leggono dal browser")
ok(!!(await come("dario", () => errore(() => q(`select * from tasks.google_attivita($1)`, [U.dario])))), "google_attivita solo per il server")
const st0 = (await come("dario", () => q(`select tasks.google_stato() s`)))[0].s
ok(st0.collegato === false && st0.email === null, `stato non collegato (${JSON.stringify(st0)})`)
ok((await come("dario", () => errore(() => q(`select tasks.google_avvia('javascript:alert(1)')`)))) !== null, "ritorno non http rifiutato")
ok((await come("dario", () => errore(() => q(`select tasks.google_avvia(null, false, false)`)))) !== null, "almeno un servizio")
const nonce = (await come("dario", () => q(`select tasks.google_avvia('https://app.example/attivita', true, false) id`)))[0].id
const rigaNonce = await q(`select utente_id, tasks, calendar from tasks.google_collegamenti where id = $1`, [nonce])
ok(rigaNonce[0]?.utente_id === U.dario && rigaNonce[0].tasks && !rigaNonce[0].calendar, "codice monouso legato a dario")
await q(`insert into tasks.google_account (utente_id, google_email, refresh_token, scope, collegato_at) values ($1, 'dario@example.test', 'x', 'openid https://www.googleapis.com/auth/tasks', now())`, [U.dario])
const st1 = (await come("dario", () => q(`select tasks.google_stato() s`)))[0].s
ok(st1.collegato && st1.tasks_concesso && !st1.calendar_concesso && !("refresh_token" in st1), "stato collegato senza token")
await come("elena", () => q(`select tasks.google_imposta(false, false)`))
ok((await q(`select tasks_attivo from tasks.google_account where utente_id = $1`, [U.dario]))[0].tasks_attivo, "elena non cambia le impostazioni di dario")
await come("dario", () => q(`select tasks.google_imposta(true, false)`))
ok(!(await q(`select calendar_attivo from tasks.google_account where utente_id = $1`, [U.dario]))[0].calendar_attivo, "dario spegne Calendar")
const gT = await come("anna", async () => (await q(`select tasks.crea_task($1) id`, [{
  titolo: "Fiera", categoria_id: "inventory", scadenza: "2030-05-10", assegnatari: [U.dario],
  sottotask: [{ titolo: "Stand", assegnatari: [U.dario], scadenza: "2030-05-08" }, { titolo: "Senza data", assegnatari: [U.dario] }],
}]))[0].id)
await q(`update public."RicreoApp" set url = 'https://' || slug || '.example'`)
const comeServer = async (sql, p) => { await db.exec("set role service_role; select set_config('request.jwt.claim.role','service_role',false);"); try { return await q(sql, p) } finally { await db.exec("reset role; select set_config('request.jwt.claim.role','',false);") } }
const gAtt = await comeServer(`select * from tasks.google_attivita($1) order by scadenza`, [U.dario])
ok(gAtt.length === 2 && gAtt[0].titolo === "Fiera › Stand" && gAtt[1].task_id === gT && gAtt[1].app_slug === "inventory" && gAtt[1].url_app === "https://inventory.example" && !gAtt[1].fatta,
  `attività di dario per Google (${JSON.stringify(gAtt.map((r) => [r.titolo, r.app_slug, r.url_app]))})`)
await come("anna", () => q(`update tasks.task set eliminata_at = now() where id = $1`, [gT]))
ok((await comeServer(`select * from tasks.google_attivita($1)`, [U.dario])).length === 0, "cestino → fuori da Google (anche le sottotask)")
await come("dario", () => q(`select tasks.google_scollega()`))
ok((await q(`select scollegato_at from tasks.google_account where utente_id = $1`, [U.dario]))[0].scollegato_at !== null, "scollega → da ripulire")
ok((await come("dario", () => q(`select tasks.google_stato() s`)))[0].s.collegato === false, "dopo scollega non risulta collegato")

console.log("Ruoli Admin e Manager")
const ruoliDi = async (chi) => (await come(chi, () => q(`select ruoli from tasks.v_persone where auth_id = $1`, [U[chi]])))[0].ruoli
ok(!!(await come("carla", () => errore(() => q(`select tasks.imposta_ruolo($1, 'Manager', true)`, [U.elena])))), "manager non dà ruoli")
ok(!!(await come("anna", () => errore(() => q(`select tasks.imposta_ruolo($1, 'Finance', true)`, [U.elena])))), "solo Admin e Manager")
await come("anna", () => q(`select tasks.imposta_ruolo($1, 'Manager', true)`, [U.elena]))
await come("anna", () => q(`select tasks.imposta_ruolo($1, 'Manager', true)`, [U.elena]))
ok((await ruoliDi("elena")).includes("Manager"), "admin fa manager elena (due volte senza errori)")
await come("anna", () => q(`insert into tasks.manager_persone (manager_id, persona_id) values ($1, $2)`, [U.elena, U.dario]))
await come("anna", () => q(`select tasks.imposta_ruolo($1, 'Manager', false)`, [U.elena]))
ok(!(await ruoliDi("elena")).includes("Manager"), "admin toglie manager a elena")
ok((await q(`select 1 from tasks.manager_persone where manager_id = $1`, [U.elena])).length === 0, "tolto Manager → via anche le persone seguite")
ok(!!(await come("anna", () => errore(() => q(`select tasks.imposta_ruolo($1, 'Admin', false)`, [U.anna])))), "non ci si toglie Admin da soli")
await come("anna", () => q(`select tasks.imposta_ruolo($1, 'Admin', false)`, [U.bruno]))
ok(!(await ruoliDi("bruno")).includes("Admin"), "anna toglie Admin a bruno")
await come("anna", () => q(`select tasks.imposta_ruolo($1, 'Admin', true)`, [U.bruno]))
ok((await ruoliDi("bruno")).includes("Admin"), "e glielo ridà")

console.log("Vista app")
const app = await come("dario", () => q(`select slug from tasks.v_app order by ordine`))
ok(app.length === 4, `v_app (${app.map((a) => a.slug).join(",")})`)
const ces = await q(`select * from tasks.da_eliminare_definitivamente(0)`)
ok(ces.length >= 0, `cestino da svuotare: ${ces.length}`)
console.log(errori ? `\n${errori} controlli falliti` : "\nTutto ok")
process.exit(errori ? 1 : 0)
