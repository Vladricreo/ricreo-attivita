"use client"

import { ChevronDown } from "lucide-react"
import { useMemo } from "react"
import { colore } from "../colori"
import { AvatarPersona } from "../componenti/persone"
import { AggiuntaRapida, RigaTask } from "../componenti/riga-task"
import { useAttivita } from "../contesto"
import { righePrincipali, usePersistito } from "../filtri"
import {
  aggiungiGiorniIso,
  FASCE,
  fascia,
  fatta,
  inAttesaDi,
  oggiIso,
  ORDINE_FASCE,
  ORDINE_PRIORITA,
  ordinaPerPosizione,
  ordinaPerPriorita,
  ordinaPerScadenza,
  PRIORITA,
  type Fascia,
} from "../regole"
import type { BozzaTask, Task } from "../tipi"
import { cn } from "../ui/cn"

export type Raggruppa = "fascia" | "stato" | "persona" | "categoria" | "priorita" | "nessuno"

export const RAGGRUPPAMENTI: { id: Raggruppa; label: string }[] = [
  { id: "fascia", label: "Scadenza" },
  { id: "stato", label: "Stato" },
  { id: "persona", label: "Persona" },
  { id: "categoria", label: "Categoria" },
  { id: "priorita", label: "Priorità" },
  { id: "nessuno", label: "Nessuno" },
]

type Gruppo = { chiave: string; titolo: React.ReactNode; tono?: string; righe: Task[]; bozza?: Partial<BozzaTask>; chiuso?: boolean }

export function VistaLista({ filtrate, raggruppa, onApri }: { filtrate: Task[]; raggruppa: Raggruppa; onApri: (t: Task) => void }) {
  const { tasks, perId, base, persona, config } = useAttivita()
  const [chiusi, setChiusi] = usePersistito<string[]>(`${config.app}:lista:chiusi`, ["fascia:in_arrivo"])
  const oggi = oggiIso()
  const tutte = tasks ?? []

  const sottotaskDi = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tutte) {
      if (!t.padre_id || t.eliminata_at) continue
      const l = m.get(t.padre_id) ?? []
      l.push(t)
      m.set(t.padre_id, l)
    }
    for (const l of m.values()) l.sort(ordinaPerPosizione)
    return m
  }, [tutte])

  const gruppi = useMemo<Gruppo[]>(() => {
    const righe = righePrincipali(filtrate)
    // Le ricorrenti fuori dal preavviso stanno solo nel gruppo "Ricorrenti in arrivo" della vista per scadenza.
    const aperte = righe.filter((t) => !fatta(t) && (raggruppa === "fascia" || fascia(t, oggi) !== "in_arrivo"))
    const chiuse = righe.filter(fatta).sort((a, b) => (b.completata_at ?? "").localeCompare(a.completata_at ?? ""))
    const out: Gruppo[] = []
    const g = (chiave: string, titolo: React.ReactNode, lista: Task[], extra?: Partial<Gruppo>) => {
      out.push({ chiave: `${raggruppa}:${chiave}`, titolo, righe: lista, ...extra })
    }

    if (raggruppa === "fascia") {
      const perFascia = new Map<Fascia, Task[]>()
      for (const t of aperte) {
        const f = fascia(t, oggi)
        perFascia.set(f, [...(perFascia.get(f) ?? []), t])
      }
      const bozze: Partial<Record<Fascia, Partial<BozzaTask>>> = {
        oggi: { scadenza: oggi },
        settimana: { scadenza: aggiungiGiorniIso(oggi, 7) },
        senza: {},
      }
      for (const f of ORDINE_FASCE) {
        const l = (perFascia.get(f) ?? []).sort(ordinaPerPriorita)
        if (!l.length && !(f === "oggi" || f === "senza")) continue
        g(f, FASCE[f].label, l, { tono: FASCE[f].testo, bozza: bozze[f] })
      }
    } else if (raggruppa === "stato") {
      for (const s of base?.stati ?? []) {
        if (s.tipo === "fatto") continue
        g(s.id, s.nome, aperte.filter((t) => t.stato_id === s.id).sort(ordinaPerScadenza), { tono: colore(s.colore).testo, bozza: { stato_id: s.id } })
      }
    } else if (raggruppa === "persona") {
      const ids = new Set<string>()
      for (const t of aperte) t.assegnatari.forEach((a) => ids.add(a.user_id))
      const ordinati = [...ids].sort((a, b) => (persona(a)?.nome ?? "").localeCompare(persona(b)?.nome ?? ""))
      for (const id of ordinati)
        g(
          id,
          <span className="inline-flex items-center gap-1.5">
            <AvatarPersona id={id} misura="xs" />
            {persona(id)?.nome ?? "Persona"}
          </span>,
          aperte.filter((t) => t.assegnatari.some((a) => a.user_id === id)).sort(ordinaPerScadenza),
          { bozza: { assegnatari: [id] } },
        )
      const senza = aperte.filter((t) => !t.assegnatari.length).sort(ordinaPerScadenza)
      if (senza.length) g("nessuno", "Senza assegnatario", senza)
    } else if (raggruppa === "categoria") {
      for (const c of base?.categorie ?? []) {
        const l = aperte.filter((t) => t.categoria_id === c.id).sort(ordinaPerScadenza)
        if (!l.length && c.id !== config.app) continue
        g(c.id, c.nome, l, { tono: colore(c.colore).testo, bozza: { categoria_id: c.id } })
      }
    } else if (raggruppa === "priorita") {
      for (const p of ORDINE_PRIORITA) {
        const l = aperte.filter((t) => t.priorita === p).sort(ordinaPerScadenza)
        if (!l.length && p !== "normale") continue
        g(p, PRIORITA[p].label, l, { tono: PRIORITA[p].testo, bozza: { priorita: p } })
      }
    } else {
      g("tutte", "Attività", aperte.sort(ordinaPerScadenza))
    }
    if (chiuse.length) g("completate", "Completate", chiuse, { tono: "text-emerald-600 dark:text-emerald-400" })
    return out
  }, [filtrate, raggruppa, oggi, base?.stati, base?.categorie, persona, config.app])

  const conCategoria = raggruppa !== "categoria"
  const nCategorie = new Set(filtrate.map((t) => t.categoria_id)).size

  return (
    <div className="space-y-4">
      {gruppi.map((gr) => {
        const chiuso = chiusi.includes(gr.chiave)
        return (
          <section key={gr.chiave} className="overflow-hidden rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setChiusi((c) => (chiuso ? c.filter((x) => x !== gr.chiave) : [...c, gr.chiave]))}
              className="flex w-full items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-left"
            >
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", chiuso && "-rotate-90")} />
              <span className={cn("text-xs font-semibold uppercase tracking-wide", gr.tono)}>{gr.titolo}</span>
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{gr.righe.length}</span>
            </button>
            {!chiuso ? (
              <div>
                {gr.righe.map((t) => (
                  <RigaTask
                    key={`${gr.chiave}:${t.id}`}
                    t={t}
                    sottotask={sottotaskDi.get(t.id)}
                    conCategoria={conCategoria && (nCategorie > 1 || t.categoria_id !== config.app)}
                    onApri={onApri}
                    inAttesa={inAttesaDi(t, perId, tutte)?.titolo ?? null}
                    breadcrumb={t.padre_id ? (perId.get(t.padre_id)?.titolo ?? null) : null}
                  />
                ))}
                {gr.righe.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">Niente qui.</div> : null}
                {gr.chiave.endsWith(":completate") ? null : <AggiuntaRapida bozza={gr.bozza} />}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
