"use client"

import { useCallback, useEffect, useState } from "react"
import { aperta, fatta, fascia, normalizza } from "./regole"
import type { Priorita, Task } from "./tipi"

/** Stato ricordato nel browser (per persona e app): vista, filtri, raggruppamenti. */
export function usePersistito<T>(chiave: string, iniziale: T, valida?: (v: unknown) => v is T): [T, (v: T | ((p: T) => T)) => void] {
  const k = `attivita:${chiave}`
  const [v, setV] = useState<T>(iniziale)
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(k)
      if (s == null) return
      const x = JSON.parse(s)
      if (!valida || valida(x)) setV(x)
    } catch {
      // storage non disponibile (navigazione privata): si resta sul valore iniziale
    }
  }, [k])
  const imposta = useCallback(
    (nuovo: T | ((p: T) => T)) => {
      setV((p) => {
        const x = typeof nuovo === "function" ? (nuovo as (p: T) => T)(p) : nuovo
        try {
          window.localStorage.setItem(k, JSON.stringify(x))
        } catch {
          // ignorato
        }
        return x
      })
    },
    [k],
  )
  return [v, imposta]
}

/**
 * Persona: "mie" (assegnate a me, o create da me senza nessuno), "seguo" (osservatore), "da_me" (create da me per altri),
 * "tutte" (tutto quello che posso vedere), "nessuno" (senza assegnatario) o l'id di una persona.
 */
export type Filtri = {
  persona: string
  categorie: string[]
  sottocategorie: string[]
  priorita: Priorita[]
  stati: string[]
  testo: string
  completate: boolean
  personali: "tutte" | "solo" | "nascondi"
}

export const FILTRI_VUOTI: Filtri = {
  persona: "mie",
  categorie: [],
  sottocategorie: [],
  priorita: [],
  stati: [],
  testo: "",
  completate: false,
  personali: "tutte",
}

export const filtriValidi = (v: unknown): v is Filtri =>
  !!v && typeof v === "object" && typeof (v as Filtri).persona === "string" && Array.isArray((v as Filtri).categorie)

export function quantiFiltri(f: Filtri): number {
  return f.categorie.length + f.sottocategorie.length + f.priorita.length + f.stati.length + (f.personali !== "tutte" ? 1 : 0) + (f.completate ? 1 : 0)
}

export function corrispondePersona(t: Task, persona: string, me: string | null): boolean {
  const ass = t.assegnatari.map((a) => a.user_id)
  switch (persona) {
    case "tutte":
      return true
    case "mie":
      return (!!me && ass.includes(me)) || (ass.length === 0 && t.creato_da === me)
    case "seguo":
      return !!me && (t.osservatori.includes(me) || ass.includes(me))
    case "da_me":
      return t.creato_da === me && ass.some((a) => a !== me)
    case "nessuno":
      return ass.length === 0
    default:
      return ass.includes(persona)
  }
}

export function filtra(tasks: Task[], f: Filtri, me: string | null, opz: { conCompletate?: boolean } = {}): Task[] {
  const n = normalizza(f.testo.trim())
  return tasks.filter((t) => {
    if (t.eliminata_at || t.archiviata_at) return false
    if (!(opz.conCompletate || f.completate) && fatta(t)) return false
    if (!corrispondePersona(t, f.persona, me)) return false
    if (f.categorie.length && !f.categorie.includes(t.categoria_id)) return false
    if (f.sottocategorie.length && !(t.sottocategoria_id && f.sottocategorie.includes(t.sottocategoria_id))) return false
    if (f.priorita.length && !f.priorita.includes(t.priorita)) return false
    if (f.stati.length && !f.stati.includes(t.stato_id)) return false
    if (f.personali === "solo" && !t.personale) return false
    if (f.personali === "nascondi" && t.personale) return false
    if (n && !normalizza(`${t.titolo} ${t.descrizione ?? ""}`).includes(n)) return false
    return true
  })
}

/**
 * Righe principali: attività principali che passano i filtri, più le sottotask che passano quando
 * la loro principale no (si mostrano da sole, con il nome della principale).
 */
export function righePrincipali(filtrate: Task[]): Task[] {
  const ids = new Set(filtrate.map((t) => t.id))
  return filtrate.filter((t) => !t.padre_id || !ids.has(t.padre_id))
}

/** Le ricorrenti fuori dal preavviso non si mostrano tra le aperte. */
export const visibileOra = (t: Task, oggi: string) => !aperta(t) || fascia(t, oggi) !== "in_arrivo"
