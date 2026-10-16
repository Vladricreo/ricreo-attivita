"use client"

import { useEffect, useState } from "react"
import { useAttivita } from "../contesto"

/**
 * Link temporanei ai file del bucket privato `tasks` (copertine, foto della chat), chiesti a gruppi e
 * tenuti in memoria finché non stanno per scadere.
 */
const DURATA = 3600
const cache = new Map<string, { url: string; scade: number }>()
const inCorso = new Map<string, Promise<void>>()

export function useUrlFirmati(percorsi: (string | null | undefined)[]): Record<string, string> {
  const { api } = useAttivita()
  const chiave = [...new Set(percorsi.filter((p): p is string => !!p))].sort().join("|")
  const [mappa, setMappa] = useState<Record<string, string>>(() => leggi(chiave))

  useEffect(() => {
    if (!chiave) return
    const tutti = chiave.split("|")
    const ora = Date.now()
    const mancanti = tutti.filter((p) => {
      const c = cache.get(p)
      return (!c || c.scade - ora < 120_000) && !inCorso.has(p)
    })
    let vivo = true
    const attesa = [...new Set(tutti.map((p) => inCorso.get(p)).filter(Boolean))] as Promise<void>[]
    if (mancanti.length) {
      const p = api
        .urlFirmati(mancanti, DURATA)
        .then((r) => {
          for (const [k, url] of Object.entries(r)) cache.set(k, { url, scade: Date.now() + DURATA * 1000 })
        })
        .catch((e) => console.error("[attivita] url firmati:", e))
        .finally(() => mancanti.forEach((m) => inCorso.delete(m)))
      mancanti.forEach((m) => inCorso.set(m, p))
      attesa.push(p)
    }
    if (attesa.length) Promise.all(attesa).then(() => vivo && setMappa(leggi(chiave)))
    else setMappa(leggi(chiave))
    return () => {
      vivo = false
    }
  }, [chiave, api])

  return mappa
}

function leggi(chiave: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!chiave) return out
  for (const p of chiave.split("|")) {
    const c = cache.get(p)
    if (c) out[p] = c.url
  }
  return out
}
