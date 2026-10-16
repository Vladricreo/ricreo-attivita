import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Allegato,
  AppRicreo,
  BozzaTask,
  Categoria,
  Collegamento,
  Commento,
  Completamento,
  ManagerPersona,
  ModificaTask,
  Notifica,
  Persona,
  Preferenze,
  Reazione,
  Sollecito,
  StatoGoogle,
  Sottocategoria,
  Stato,
  Task,
  VoceChecklist,
  VoceStorico,
} from "../tipi"

/** Accesso ai dati: client del browser con la sessione, schema `tasks`, regole in RLS. */

type Errore = { message?: string; code?: string; details?: string | null } | null

export class ErroreAttivita extends Error {}

export function messaggioErrore(e: Errore | unknown, fallback = "Operazione non riuscita"): string {
  if (!e) return fallback
  if (e instanceof Error && !(e as any).code) return e.message || fallback
  const err = e as NonNullable<Errore>
  if (err.code === "42501") return err.message && !/permission denied|row-level security/i.test(err.message) ? err.message : "Non hai i permessi per questa operazione."
  if (err.code === "23503") return "Un elemento collegato non esiste più: ricarica la pagina."
  if (err.code === "PGRST106" || /schema must be one of/i.test(err.message ?? ""))
    return "Lo schema tasks non è esposto dalle API di Supabase (Settings → API → Exposed schemas)."
  if (/Failed to fetch|NetworkError|Load failed/i.test(err.message ?? "")) return "Connessione assente: riprova tra poco."
  return err.message || fallback
}

function ok<T>(r: { data: T; error: Errore }, fallback?: string): T {
  if (r.error) throw new ErroreAttivita(messaggioErrore(r.error, fallback))
  return r.data
}

const NOME_FILE = /[^\w.\-]+/g

export type Base = {
  persone: Persona[]
  categorie: Categoria[]
  sottocategorie: Sottocategoria[]
  stati: Stato[]
  app: AppRicreo[]
  manager: ManagerPersona[]
  preferenze: Preferenze
}

export function creaApi(sb: SupabaseClient<any, any, any>) {
  const db = () => sb.schema("tasks")

  return {
    async utente(): Promise<string | null> {
      const { data } = await sb.auth.getSession()
      return data.session?.user.id ?? null
    },

    async base(): Promise<Base> {
      const [persone, categorie, sottocategorie, stati, app, manager, preferenze] = await Promise.all([
        db().from("v_persone").select("*").order("nome"),
        db().from("categorie").select("*").order("ordine"),
        db().from("sottocategorie").select("*").order("ordine"),
        db().from("stati").select("*").order("ordine"),
        db().from("v_app").select("*").order("ordine"),
        db().from("manager_persone").select("manager_id, persona_id"),
        db().from("preferenze").select("vista_iniziale").maybeSingle(),
      ])
      return {
        persone: ok(persone, "Errore caricamento persone") as Persona[],
        categorie: ok(categorie) as Categoria[],
        sottocategorie: ok(sottocategorie) as Sottocategoria[],
        stati: ok(stati) as Stato[],
        app: ok(app) as AppRicreo[],
        manager: ok(manager) as ManagerPersona[],
        // Le preferenze non bloccano la pagina (es. migration non ancora applicata): si parte da quelle vuote.
        preferenze: { vista_iniziale: null, ...(preferenze.error ? null : (preferenze.data as Preferenze | null)) },
      }
    },

    async salvaPreferenze(utente: string, p: Partial<Preferenze>): Promise<void> {
      ok(await db().from("preferenze").upsert({ user_id: utente, ...p, aggiornata_at: new Date().toISOString() }), "Errore salvataggio preferenze")
    },

    /** Aperte, archiviate e completate da `completateDa` (le altre si caricano dall'archivio). */
    async tasks(completateDa: string): Promise<Task[]> {
      const r = await db()
        .from("v_task")
        .select("*")
        .is("eliminata_at", null)
        .or(`completata_at.is.null,completata_at.gte.${completateDa}`)
        .order("ordine")
        .limit(5000)
      return ok(r, "Errore caricamento attività") as Task[]
    },

    async task(id: string): Promise<Task | null> {
      const r = await db().from("v_task").select("*").eq("id", id).maybeSingle()
      return ok(r) as Task | null
    },

    async sottotaskDi(padre: string): Promise<Task[]> {
      return ok(await db().from("v_task").select("*").eq("padre_id", padre).order("ordine")) as Task[]
    },

    async eliminate(): Promise<Task[]> {
      return ok(await db().from("v_task").select("*").not("eliminata_at", "is", null).order("eliminata_at", { ascending: false }).limit(500)) as Task[]
    },

    async completatePrima(prima: string, limite = 300): Promise<Task[]> {
      return ok(
        await db()
          .from("v_task")
          .select("*")
          .is("eliminata_at", null)
          .lt("completata_at", prima)
          .order("completata_at", { ascending: false })
          .limit(limite),
      ) as Task[]
    },

    async crea(b: BozzaTask): Promise<string> {
      const r = await db().rpc("crea_task", { p: b })
      return ok(r, "Errore salvataggio attività") as string
    },

    async aggiorna(id: string, patch: ModificaTask): Promise<void> {
      const r = await db().from("task").update(patch).eq("id", id).select("id")
      const righe = ok(r, "Errore salvataggio attività") as { id: string }[]
      if (!righe?.length) throw new ErroreAttivita("L'attività non esiste più o non hai accesso: ricarica la pagina.")
    },

    async completa(id: string): Promise<{ chiusa: boolean; prossima_scadenza: string | null }> {
      return ok(await db().rpc("completa", { p_id: id }), "Errore completamento") as { chiusa: boolean; prossima_scadenza: string | null }
    },

    async annullaCompletamento(id: string): Promise<void> {
      ok(await db().rpc("annulla_completamento", { p_id: id }), "Errore annullamento")
    },

    async segnaMiaParte(id: string, fatta: boolean): Promise<void> {
      ok(await db().rpc("segna_mia_parte", { p_id: id, p_fatta: fatta }))
    },

    async assegnatari(id: string, nuovi: string[], vecchi: string[]): Promise<void> {
      const via = vecchi.filter((u) => !nuovi.includes(u))
      const dentro = nuovi.filter((u) => !vecchi.includes(u))
      if (via.length) ok(await db().from("assegnatari").delete().eq("task_id", id).in("user_id", via))
      if (dentro.length)
        ok(
          await db()
            .from("assegnatari")
            .insert(dentro.map((u) => ({ task_id: id, user_id: u, ordine: nuovi.indexOf(u) + 1 }))),
          "Errore assegnazione",
        )
    },

    async osserva(id: string, utente: string, si: boolean): Promise<void> {
      if (si) ok(await db().from("osservatori").upsert({ task_id: id, user_id: utente }, { ignoreDuplicates: true }))
      else ok(await db().from("osservatori").delete().eq("task_id", id).eq("user_id", utente))
    },

    async dipendenza(id: string, da: string, si: boolean): Promise<void> {
      if (si) ok(await db().from("dipendenze").upsert({ task_id: id, dipende_da: da }, { ignoreDuplicates: true }))
      else ok(await db().from("dipendenze").delete().eq("task_id", id).eq("dipende_da", da))
    },

    async collega(id: string, c: Omit<Collegamento, "id">): Promise<void> {
      ok(await db().from("collegamenti").insert({ task_id: id, ...c }))
    },

    async scollega(idCollegamento: string): Promise<void> {
      ok(await db().from("collegamenti").delete().eq("id", idCollegamento))
    },

    // Checklist ---------------------------------------------------------------------------------------
    async checklist(taskIds: string[]): Promise<VoceChecklist[]> {
      if (!taskIds.length) return []
      return ok(await db().from("checklist").select("*").in("task_id", taskIds).order("ordine")) as VoceChecklist[]
    },
    async aggiungiVoce(taskId: string, testo: string, ordine: number): Promise<VoceChecklist> {
      return ok(await db().from("checklist").insert({ task_id: taskId, testo, ordine }).select("*").single()) as VoceChecklist
    },
    async modificaVoce(id: string, patch: Partial<Pick<VoceChecklist, "testo" | "fatta_at" | "ordine" | "assegnatario">>): Promise<void> {
      ok(await db().from("checklist").update(patch).eq("id", id))
    },
    async eliminaVoce(id: string): Promise<void> {
      ok(await db().from("checklist").delete().eq("id", id))
    },

    // Chat --------------------------------------------------------------------------------------------
    async commenti(taskId: string): Promise<Commento[]> {
      return ok(await db().from("commenti").select("*").eq("task_id", taskId).order("creato_at").limit(2000)) as Commento[]
    },
    async inviaCommento(taskId: string, testo: string, menzioni: string[], rispostaA: string | null): Promise<Commento> {
      return ok(
        await db().from("commenti").insert({ task_id: taskId, testo, menzioni, risposta_a: rispostaA }).select("*").single(),
        "Messaggio non inviato",
      ) as Commento
    },
    async modificaCommento(id: string, testo: string, menzioni: string[]): Promise<void> {
      ok(await db().from("commenti").update({ testo, menzioni }).eq("id", id))
    },
    async eliminaCommento(id: string): Promise<void> {
      ok(await db().from("commenti").update({ eliminato_at: new Date().toISOString() }).eq("id", id))
    },
    async reazioni(commentoIds: string[]): Promise<Reazione[]> {
      if (!commentoIds.length) return []
      return ok(await db().from("reazioni").select("commento_id, user_id, emoji").in("commento_id", commentoIds)) as Reazione[]
    },
    async reazione(commentoId: string, utente: string, emoji: string, si: boolean): Promise<void> {
      if (si) ok(await db().from("reazioni").upsert({ commento_id: commentoId, user_id: utente, emoji }, { ignoreDuplicates: true }))
      else ok(await db().from("reazioni").delete().eq("commento_id", commentoId).eq("user_id", utente).eq("emoji", emoji))
    },
    async segnaLetta(taskId: string): Promise<void> {
      ok(await db().rpc("segna_letta", { p_task: taskId }))
    },

    // Allegati ----------------------------------------------------------------------------------------
    async allegati(taskId: string): Promise<Allegato[]> {
      return ok(await db().from("allegati").select("*").eq("task_id", taskId).is("eliminato_at", null).order("caricato_at")) as Allegato[]
    },
    async caricaAllegato(
      taskId: string,
      file: Blob,
      info: { nome: string; tipo: string; larghezza?: number | null; altezza?: number | null },
      commentoId?: string | null,
    ): Promise<Allegato> {
      const sicuro = info.nome.replace(NOME_FILE, "_").slice(-120) || "file"
      const percorso = `${taskId}/${crypto.randomUUID()}-${sicuro}`
      const up = await sb.storage.from("tasks").upload(percorso, file, { contentType: info.tipo || "application/octet-stream", upsert: false })
      if (up.error) throw new ErroreAttivita(/mime|type/i.test(up.error.message) ? "Tipo di file non ammesso." : /size|large/i.test(up.error.message) ? "File troppo grande (max 50 MB)." : up.error.message)
      const r = await db()
        .from("allegati")
        .insert({
          task_id: taskId,
          commento_id: commentoId ?? null,
          percorso,
          nome: info.nome.slice(0, 255),
          tipo_mime: info.tipo || null,
          dimensione: file.size,
          larghezza: info.larghezza ?? null,
          altezza: info.altezza ?? null,
        })
        .select("*")
        .single()
      if (r.error) {
        await sb.storage.from("tasks").remove([percorso])
        throw new ErroreAttivita(messaggioErrore(r.error))
      }
      return r.data as Allegato
    },
    async eliminaAllegato(a: Allegato): Promise<void> {
      ok(await db().from("allegati").update({ eliminato_at: new Date().toISOString() }).eq("id", a.id))
    },
    async urlFirmati(percorsi: string[], secondi = 3600): Promise<Record<string, string>> {
      if (!percorsi.length) return {}
      const r = await sb.storage.from("tasks").createSignedUrls(percorsi, secondi)
      if (r.error) throw new ErroreAttivita(r.error.message)
      const out: Record<string, string> = {}
      for (const x of r.data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl
      return out
    },

    // Storico, completamenti --------------------------------------------------------------------------
    async storico(taskIds: string[]): Promise<VoceStorico[]> {
      if (!taskIds.length) return []
      return ok(await db().from("storico").select("*").in("task_id", taskIds).order("creato_at", { ascending: false }).limit(500)) as VoceStorico[]
    },
    async completamenti(da: string): Promise<Completamento[]> {
      return ok(
        await db().from("v_completamenti").select("*").gte("completata_at", da).order("completata_at", { ascending: false }).limit(5000),
      ) as Completamento[]
    },
    async completamentiDi(taskId: string): Promise<Completamento[]> {
      return ok(await db().from("v_completamenti").select("*").eq("task_id", taskId).order("completata_at", { ascending: false }).limit(200)) as Completamento[]
    },

    // Notifiche ---------------------------------------------------------------------------------------
    async notifiche(limite = 150): Promise<Notifica[]> {
      return ok(await db().from("notifiche").select("*").is("archiviata_at", null).order("aggiornata_at", { ascending: false }).limit(limite)) as Notifica[]
    },
    async segnaNotificheLette(ids: string[] | null, taskId?: string): Promise<void> {
      ok(await db().rpc("segna_notifiche_lette", { p_ids: ids, p_task: taskId ?? null }))
    },
    async archiviaNotifica(id: string): Promise<void> {
      ok(await db().from("notifiche").update({ archiviata_at: new Date().toISOString(), letta_at: new Date().toISOString() }).eq("id", id))
    },

    // Solleciti --------------------------------------------------------------------------------------
    async sollecita(taskId: string, persona: string, forte: boolean, messaggio: string | null): Promise<void> {
      ok(await db().rpc("sollecita", { p_task: taskId, p_persona: persona, p_forte: forte, p_messaggio: messaggio }), "Sollecito non inviato")
    },
    /** Solleciti forti ricevuti e non ancora confermati (popup), con il titolo dell'attività. */
    async sollecitiDaConfermare(me: string): Promise<(Sollecito & { titolo: string | null })[]> {
      const righe = ok(
        await db().from("solleciti").select("*, task:task_id(titolo)").eq("a", me).eq("forte", true).is("visto_at", null).order("creato_at").limit(20),
      ) as (Sollecito & { task: { titolo: string } | null })[]
      return righe.map(({ task, ...s }) => ({ ...s, titolo: task?.titolo ?? null }))
    },
    /** Solleciti mandati da me su un'attività (per sapere se sono stati visti). */
    async sollecitiMandati(taskId: string, me: string): Promise<Sollecito[]> {
      return ok(await db().from("solleciti").select("*").eq("task_id", taskId).eq("da", me).order("creato_at", { ascending: false }).limit(20)) as Sollecito[]
    },
    async confermaSollecito(id: string): Promise<void> {
      ok(await db().rpc("conferma_sollecito", { p_id: id }))
    },

    // Google Tasks e Calendar (per persona) ----------------------------------------------------------
    async statoGoogle(): Promise<StatoGoogle | null> {
      return ok(await db().rpc("google_stato"), "Errore lettura collegamento Google") as StatoGoogle | null
    },
    /** Codice monouso per aprire il consenso Google nell'app che lo gestisce. */
    async avviaGoogle(ritorno: string, servizi: { tasks: boolean; calendar: boolean }): Promise<string> {
      return ok(await db().rpc("google_avvia", { p_ritorno: ritorno, p_tasks: servizi.tasks, p_calendar: servizi.calendar }), "Collegamento non avviato") as string
    },
    async impostaGoogle(servizi: { tasks?: boolean; calendar?: boolean }): Promise<void> {
      ok(await db().rpc("google_imposta", { p_tasks: servizi.tasks ?? null, p_calendar: servizi.calendar ?? null }))
    },
    async scollegaGoogle(): Promise<void> {
      ok(await db().rpc("google_scollega"), "Scollegamento non riuscito")
    },

    // Impostazioni (admin) ----------------------------------------------------------------------------
    async managerPersona(manager: string, persona: string, si: boolean): Promise<void> {
      if (si) ok(await db().from("manager_persone").upsert({ manager_id: manager, persona_id: persona }, { ignoreDuplicates: true }))
      else ok(await db().from("manager_persone").delete().eq("manager_id", manager).eq("persona_id", persona))
    },
    async salvaSottocategoria(s: Partial<Sottocategoria> & { categoria_id: string; nome: string }): Promise<void> {
      if (s.id) ok(await db().from("sottocategorie").update({ nome: s.nome, colore: s.colore ?? null, ordine: s.ordine ?? 0, archiviata_at: s.archiviata_at ?? null }).eq("id", s.id))
      else ok(await db().from("sottocategorie").insert({ categoria_id: s.categoria_id, nome: s.nome, colore: s.colore ?? null, ordine: s.ordine ?? 0 }))
    },
    async salvaCategoria(c: Pick<Categoria, "id" | "nome" | "colore" | "attiva" | "ordine">): Promise<void> {
      ok(await db().from("categorie").update({ nome: c.nome, colore: c.colore, attiva: c.attiva, ordine: c.ordine }).eq("id", c.id))
    },
  }
}

export type Api = ReturnType<typeof creaApi>
