"use client"

import { Check, Plus, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import type { Task, VoceChecklist } from "../tipi"
import { avviso } from "../ui/avvisi"
import { cn } from "../ui/cn"

/** Checklist veloce dentro l'attività (voci senza persone né date: per quelle ci sono le sottotask). */
export function Checklist({ t }: { t: Task }) {
  const { api, ricarica } = useAttivita()
  const [voci, setVoci] = useState<VoceChecklist[] | null>(null)
  const [nuova, setNuova] = useState("")

  const carica = useCallback(() => {
    api
      .checklist([t.id])
      .then(setVoci)
      .catch((e) => avviso.errore(messaggioErrore(e)))
  }, [api, t.id])

  // Si ricarica anche quando cambia il conteggio (modifiche di altri in tempo reale).
  useEffect(() => carica(), [carica, t.n_checklist, t.n_checklist_fatte])

  const azione = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
    carica()
    void ricarica("tasks")
  }

  const aggiungi = () => {
    const testo = nuova.trim()
    if (!testo) return
    setNuova("")
    const ordine = (voci?.[voci.length - 1]?.ordine ?? 0) + 1
    setVoci((v) => [...(v ?? []), { id: `tmp-${ordine}`, task_id: t.id, testo, ordine, assegnatario: null, fatta_at: null, fatta_da: null, creato_at: new Date().toISOString() }])
    void azione(() => api.aggiungiVoce(t.id, testo, ordine))
  }

  if (!voci) return null
  const fatte = voci.filter((v) => v.fatta_at).length

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold">Checklist</h4>
        {voci.length ? (
          <>
            <span className="text-xs tabular-nums text-muted-foreground">
              {fatte}/{voci.length}
            </span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(fatte / voci.length) * 100}%` }} />
            </span>
          </>
        ) : null}
      </div>
      <div className="space-y-0.5">
        {voci.map((v) => (
          <VoceRiga
            key={v.id}
            v={v}
            onSpunta={() => {
              setVoci((l) => l?.map((x) => (x.id === v.id ? { ...x, fatta_at: x.fatta_at ? null : new Date().toISOString() } : x)) ?? l)
              void azione(() => api.modificaVoce(v.id, { fatta_at: v.fatta_at ? null : new Date().toISOString() }))
            }}
            onTesto={(testo) => void azione(() => api.modificaVoce(v.id, { testo }))}
            onElimina={() => {
              setVoci((l) => l?.filter((x) => x.id !== v.id) ?? l)
              void azione(() => api.eliminaVoce(v.id))
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={nuova}
          onChange={(e) => setNuova(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aggiungi()}
          placeholder="Aggiungi una voce"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-input focus:bg-background focus:ring-1 focus:ring-ring"
        />
      </div>
    </section>
  )
}

function VoceRiga({ v, onSpunta, onTesto, onElimina }: { v: VoceChecklist; onSpunta: () => void; onTesto: (s: string) => void; onElimina: () => void }) {
  const [testo, setTesto] = useState(v.testo)
  useEffect(() => setTesto(v.testo), [v.testo])
  return (
    <div className="group flex items-center gap-2 rounded-md px-1 hover:bg-accent/40">
      <button
        type="button"
        onClick={onSpunta}
        className={cn("relative flex h-4 w-4 shrink-0 items-center justify-center rounded border after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']", v.fatta_at ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 hover:border-primary")}
        aria-label={v.fatta_at ? "Segna da fare" : "Segna fatta"}
      >
        {v.fatta_at ? <Check className="h-3 w-3" /> : null}
      </button>
      <input
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        onBlur={() => testo.trim() && testo.trim() !== v.testo && onTesto(testo.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={cn("h-7 min-w-0 flex-1 bg-transparent text-sm outline-none", v.fatta_at && "text-muted-foreground line-through")}
      />
      <button type="button" onClick={onElimina} className="rounded p-1.5 text-muted-foreground hover:text-destructive sm:p-1 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Togli voce">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
