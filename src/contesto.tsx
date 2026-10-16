"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { creaApi, messaggioErrore, type Api, type Base } from "./dati/api"
import { aggiungiGiorniIso, oggiIso, statoDiTipo } from "./regole"
import type { BozzaTask, Categoria, ConfigAttivita, ModificaTask, Notifica, Persona, Preferenze, Sottocategoria, Stato, Task } from "./tipi"
import { Avvisi, avviso } from "./ui/avvisi"
import { ProviderSuggerimenti } from "./ui/suggerimento"

/**
 * Stato condiviso del modulo: persone, anagrafiche, attività e notifiche dell'utente, tenuti
 * aggiornati in tempo reale (Supabase Realtime) e caricati solo quando un componente li chiede.
 * Va montato una volta nel layout dell'app (serve anche a campanella e "nuova attività" globali).
 */

const GIORNI_COMPLETATE = 120

type Richiesta = "tasks" | "notifiche"

export type Azioni = {
  crea: (b: BozzaTask) => Promise<string | null>
  aggiorna: (id: string, patch: ModificaTask) => Promise<boolean>
  completa: (t: Task) => Promise<void>
  riapri: (t: Task) => Promise<void>
  segnaMiaParte: (t: Task, fatta: boolean) => Promise<void>
  assegna: (t: Task, persone: string[]) => Promise<void>
  osserva: (t: Task, si: boolean) => Promise<void>
  elimina: (t: Task) => Promise<void>
  recupera: (t: Task) => Promise<void>
  archivia: (t: Task, motivo?: string | null) => Promise<void>
  disarchivia: (t: Task) => Promise<void>
}

type ValoreAttivita = {
  config: ConfigAttivita
  api: Api
  me: string | null
  base: Base | null
  tasks: Task[] | null
  notifiche: Notifica[] | null
  errore: string | null
  perId: Map<string, Task>
  persona: (id: string | null | undefined) => Persona | undefined
  categoria: (id: string | null | undefined) => Categoria | undefined
  sottocategoria: (id: string | null | undefined) => Sottocategoria | undefined
  stato: (id: string | null | undefined) => Stato | undefined
  richiedi: (cosa: Richiesta) => () => void
  ricarica: (cosa?: Richiesta | "base") => Promise<void>
  /** Applica subito una modifica locale (bacheca, Gantt) prima della risposta del database. */
  ritocca: (id: string, patch: Partial<Task>) => void
  /** Preferenze della persona (in tutte le app): si applicano subito, poi si salvano. */
  salvaPreferenze: (p: Partial<Preferenze>) => Promise<boolean>
  apri: (id: string) => void
  registraApertura: (fn: ((id: string) => void) | null) => void
  azioni: Azioni
}

const Ctx = createContext<ValoreAttivita | null>(null)

export function useAttivita(): ValoreAttivita {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAttivita va usato dentro <AttivitaProvider>")
  return v
}

/** Chiede al provider di tenere caricati (e aggiornati) attività e/o notifiche finché il componente è montato. */
export function useRichiedi(...cosa: Richiesta[]) {
  const { richiedi } = useAttivita()
  const chiave = cosa.join(",")
  useEffect(() => {
    const rilasci = chiave.split(",").filter(Boolean).map((c) => richiedi(c as Richiesta))
    return () => rilasci.forEach((r) => r())
  }, [chiave, richiedi])
}

export function AttivitaProvider({ config, children }: { config: ConfigAttivita; children: ReactNode }) {
  const api = useMemo(() => creaApi(config.supabase), [config.supabase])
  const [me, setMe] = useState<string | null>(null)
  const [base, setBase] = useState<Base | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [notifiche, setNotifiche] = useState<Notifica[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [richieste, setRichieste] = useState<Record<Richiesta, number>>({ tasks: 0, notifiche: 0 })
  const apertura = useRef<((id: string) => void) | null>(null)
  const configRef = useRef(config)
  configRef.current = config

  // Utente della sessione (e cambi di login).
  useEffect(() => {
    let vivo = true
    api.utente().then((u) => vivo && setMe(u))
    const { data } = config.supabase.auth.onAuthStateChange((_e, s) => setMe(s?.user.id ?? null))
    return () => {
      vivo = false
      data.subscription.unsubscribe()
    }
  }, [api, config.supabase])

  const caricaBase = useCallback(async () => {
    try {
      setBase(await api.base())
      setErrore(null)
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }, [api])

  const caricaTasks = useCallback(async () => {
    try {
      setTasks(await api.tasks(`${aggiungiGiorniIso(oggiIso(), -GIORNI_COMPLETATE)}T00:00:00Z`))
      setErrore(null)
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }, [api])

  const caricaNotifiche = useCallback(async () => {
    try {
      setNotifiche(await api.notifiche())
    } catch (e) {
      console.error("[attivita] notifiche:", messaggioErrore(e))
    }
  }, [api])

  const servonoTasks = richieste.tasks > 0
  const servonoNotifiche = richieste.notifiche > 0
  const serveQualcosa = servonoTasks || servonoNotifiche

  useEffect(() => {
    if (me && serveQualcosa && !base) caricaBase()
  }, [me, serveQualcosa, base, caricaBase])
  useEffect(() => {
    if (me && servonoTasks) caricaTasks()
  }, [me, servonoTasks, caricaTasks])
  useEffect(() => {
    if (me && servonoNotifiche) caricaNotifiche()
  }, [me, servonoNotifiche, caricaNotifiche])

  // Tempo reale: ogni modifica ricarica (a raffica, una volta sola) quello che serve.
  const timer = useRef<{ tasks?: ReturnType<typeof setTimeout>; notifiche?: ReturnType<typeof setTimeout> }>({})
  const presto = useCallback(
    (cosa: Richiesta) => {
      clearTimeout(timer.current[cosa])
      timer.current[cosa] = setTimeout(() => (cosa === "tasks" ? caricaTasks() : caricaNotifiche()), 350)
    },
    [caricaTasks, caricaNotifiche],
  )

  useEffect(() => {
    if (!me || !serveQualcosa) return
    const sb = config.supabase
    const canale = sb.channel(`attivita:${me}:${Math.random().toString(36).slice(2, 8)}`)
    if (servonoTasks) {
      for (const tabella of ["task", "assegnatari", "checklist", "commenti", "allegati"])
        canale.on("postgres_changes" as any, { event: "*", schema: "tasks", table: tabella }, () => presto("tasks"))
    }
    if (servonoNotifiche || servonoTasks) {
      canale.on("postgres_changes" as any, { event: "*", schema: "tasks", table: "notifiche", filter: `user_id=eq.${me}` }, () => {
        if (servonoNotifiche) presto("notifiche")
      })
    }
    canale.subscribe()
    // Rete: al ritorno sulla scheda e ogni 3 minuti, nel caso il tempo reale abbia perso qualcosa.
    let ultimo = Date.now()
    const ravviva = () => {
      if (document.visibilityState !== "visible" || Date.now() - ultimo < 30_000) return
      ultimo = Date.now()
      if (servonoTasks) presto("tasks")
      if (servonoNotifiche) presto("notifiche")
    }
    document.addEventListener("visibilitychange", ravviva)
    const giro = setInterval(() => {
      ultimo = 0
      ravviva()
    }, 180_000)
    return () => {
      document.removeEventListener("visibilitychange", ravviva)
      clearInterval(giro)
      sb.removeChannel(canale)
    }
  }, [me, serveQualcosa, servonoTasks, servonoNotifiche, config.supabase, presto])

  const richiedi = useCallback((cosa: Richiesta) => {
    setRichieste((r) => ({ ...r, [cosa]: r[cosa] + 1 }))
    return () => setRichieste((r) => ({ ...r, [cosa]: Math.max(0, r[cosa] - 1) }))
  }, [])

  const ricarica = useCallback(
    async (cosa?: Richiesta | "base") => {
      if (!cosa || cosa === "base") await caricaBase()
      if (!cosa || cosa === "tasks") await caricaTasks()
      if (!cosa || cosa === "notifiche") await caricaNotifiche()
    },
    [caricaBase, caricaTasks, caricaNotifiche],
  )

  const perId = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks])
  const mappe = useMemo(
    () => ({
      persone: new Map((base?.persone ?? []).map((p) => [p.auth_id, p])),
      categorie: new Map((base?.categorie ?? []).map((c) => [c.id, c])),
      sottocategorie: new Map((base?.sottocategorie ?? []).map((s) => [s.id, s])),
      stati: new Map((base?.stati ?? []).map((s) => [s.id, s])),
    }),
    [base],
  )

  const ritocca = useCallback(
    (id: string, patch: Partial<Task>) => {
      setTasks((ts) =>
        ts
          ? ts.map((t) => {
              if (t.id !== id) return t
              const nuovo = { ...t, ...patch }
              if (patch.stato_id) nuovo.stato_tipo = mappe.stati.get(patch.stato_id)?.tipo ?? t.stato_tipo
              return nuovo
            })
          : ts,
      )
    },
    [mappe.stati],
  )

  const salvaPreferenze = useCallback(
    async (p: Partial<Preferenze>) => {
      if (!me) return false
      const prima = base?.preferenze
      setBase((b) => (b ? { ...b, preferenze: { ...b.preferenze, ...p } } : b))
      try {
        await api.salvaPreferenze(me, p)
        return true
      } catch (e) {
        if (prima) setBase((b) => (b ? { ...b, preferenze: prima } : b))
        avviso.errore(messaggioErrore(e))
        return false
      }
    },
    [api, me, base?.preferenze],
  )

  const azioni = useMemo<Azioni>(() => {
    const prova = async (fn: () => Promise<void>, ricaricaDopo = true) => {
      try {
        await fn()
        return true
      } catch (e) {
        avviso.errore(messaggioErrore(e))
        return false
      } finally {
        if (ricaricaDopo) presto("tasks")
      }
    }
    const fatto = () => statoDiTipo(base?.stati ?? [], "fatto")?.id ?? "fatta"

    const a: Azioni = {
      async crea(b) {
        try {
          const id = await api.crea({ app_origine: configRef.current.app, ...b })
          const persone = [...(b.assegnatari ?? []), ...(b.sottotask ?? []).flatMap((s) => s.assegnatari ?? [])].filter((u) => u !== me)
          if (persone.length) configRef.current.dopo?.({ tipo: "assegnazione", taskId: id, utenti: [...new Set(persone)] })
          await caricaTasks()
          return id
        } catch (e) {
          avviso.errore(messaggioErrore(e))
          return null
        }
      },
      async aggiorna(id, patch) {
        ritocca(id, patch as Partial<Task>)
        return prova(() => api.aggiorna(id, patch))
      },
      async completa(t) {
        if (t.conferma_tutti && me && t.assegnatari.some((x) => x.user_id === me && !x.fatto_at)) {
          await a.segnaMiaParte(t, true)
          return
        }
        ritocca(t.id, { stato_id: fatto() })
        try {
          const r = await api.completa(t.id)
          avviso.ok(r.chiusa ? `Completata: ${t.titolo}` : `Fatta. Prossima scadenza ${r.prossima_scadenza?.split("-").reverse().join("/")}`, {
            etichetta: "Annulla",
            fai: () => void a.riapri(t),
          })
        } catch (e) {
          avviso.errore(messaggioErrore(e))
        } finally {
          presto("tasks")
        }
      },
      async riapri(t) {
        await prova(() => api.annullaCompletamento(t.id))
      },
      async segnaMiaParte(t, fatta) {
        if (await prova(() => api.segnaMiaParte(t.id, fatta))) avviso.ok(fatta ? "Hai segnato la tua parte come fatta" : "Tua parte riaperta")
      },
      async assegna(t, persone) {
        ritocca(t.id, {
          assegnatari: persone.map((u, i) => t.assegnatari.find((x) => x.user_id === u) ?? { user_id: u, ordine: i + 1, fatto_at: null, assegnato_da: me, assegnato_at: new Date().toISOString() }),
        })
        const nuovi = persone.filter((u) => u !== me && !t.assegnatari.some((x) => x.user_id === u))
        if (await prova(() => api.assegnatari(t.id, persone, t.assegnatari.map((x) => x.user_id))))
          if (nuovi.length) configRef.current.dopo?.({ tipo: "assegnazione", taskId: t.id, utenti: nuovi })
      },
      async osserva(t, si) {
        if (!me) return
        ritocca(t.id, { osservatori: si ? [...t.osservatori, me] : t.osservatori.filter((x) => x !== me) })
        await prova(() => api.osserva(t.id, me, si))
      },
      async elimina(t) {
        ritocca(t.id, { eliminata_at: new Date().toISOString() })
        if (await prova(() => api.aggiorna(t.id, { eliminata_at: new Date().toISOString() })))
          avviso.ok(`Nel cestino: ${t.titolo}`, { etichetta: "Annulla", fai: () => void a.recupera(t) })
      },
      async recupera(t) {
        if (await prova(() => api.aggiorna(t.id, { eliminata_at: null }))) avviso.ok(`Recuperata: ${t.titolo}`)
      },
      async archivia(t, motivo) {
        ritocca(t.id, { archiviata_at: new Date().toISOString() })
        if (await prova(() => api.aggiorna(t.id, { archiviata_at: new Date().toISOString(), archivio_motivo: motivo?.trim() || null })))
          avviso.ok(`Archiviata: ${t.titolo}`, { etichetta: "Annulla", fai: () => void a.disarchivia(t) })
      },
      async disarchivia(t) {
        if (await prova(() => api.aggiorna(t.id, { archiviata_at: null }))) avviso.ok(`Di nuovo tra le attività: ${t.titolo}`)
      },
    }
    return a
  }, [api, base?.stati, caricaTasks, me, presto, ritocca])

  const valore = useMemo<ValoreAttivita>(
    () => ({
      config,
      api,
      me,
      base,
      tasks,
      notifiche,
      errore,
      perId,
      persona: (id) => (id ? mappe.persone.get(id) : undefined),
      categoria: (id) => (id ? mappe.categorie.get(id) : undefined),
      sottocategoria: (id) => (id ? mappe.sottocategorie.get(id) : undefined),
      stato: (id) => (id ? mappe.stati.get(id) : undefined),
      richiedi,
      ricarica,
      ritocca,
      salvaPreferenze,
      apri: (id) => {
        if (apertura.current) apertura.current(id)
        else {
          const href = `${configRef.current.percorso}?task=${id}`
          if (configRef.current.naviga) configRef.current.naviga(href)
          else window.location.href = href
        }
      },
      registraApertura: (fn) => {
        apertura.current = fn
      },
      azioni,
    }),
    [config, api, me, base, tasks, notifiche, errore, perId, mappe, richiedi, ricarica, ritocca, salvaPreferenze, azioni],
  )

  return (
    <Ctx.Provider value={valore}>
      <ProviderSuggerimenti>
        {children}
        <Avvisi />
      </ProviderSuggerimenti>
    </Ctx.Provider>
  )
}
