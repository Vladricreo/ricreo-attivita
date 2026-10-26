"use client"

import { CheckCircle2, CircleAlert, X } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "./cn"

/** Avvisi a comparsa del modulo (non dipendono dal sistema di toast dell'app). */
type Avviso = { id: number; testo: string; tipo: "ok" | "errore"; azione?: { etichetta: string; fai: () => void } }

let elenco: Avviso[] = []
let prossimo = 1
const ascoltatori = new Set<(a: Avviso[]) => void>()
const emetti = () => ascoltatori.forEach((f) => f(elenco))

function aggiungi(a: Omit<Avviso, "id">, durata: number) {
  const id = prossimo++
  elenco = [...elenco.slice(-3), { ...a, id }]
  emetti()
  setTimeout(() => togli(id), durata)
}
function togli(id: number) {
  elenco = elenco.filter((a) => a.id !== id)
  emetti()
}

export const avviso = {
  ok: (testo: string, azione?: Avviso["azione"]) => aggiungi({ testo, tipo: "ok", azione }, azione ? 6000 : 3000),
  errore: (testo: string) => aggiungi({ testo, tipo: "errore" }, 6000),
}

export function Avvisi() {
  const [voci, setVoci] = useState<Avviso[]>(elenco)
  useEffect(() => {
    ascoltatori.add(setVoci)
    return () => {
      ascoltatori.delete(setVoci)
    }
  }, [])
  if (!voci.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-4 md:top-auto">
      {voci.map((a) => (
        <div
          key={a.id}
          role="status"
          className={cn(
            "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg",
            a.tipo === "errore" ? "border-destructive/40 bg-background text-destructive" : "border-border bg-foreground text-background",
          )}
        >
          {a.tipo === "errore" ? <CircleAlert className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="min-w-0 flex-1">{a.testo}</span>
          {a.azione ? (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                a.azione?.fai()
                togli(a.id)
              }}
            >
              {a.azione.etichetta}
            </button>
          ) : null}
          <button type="button" className="shrink-0 opacity-60 hover:opacity-100" onClick={() => togli(a.id)} aria-label="Chiudi">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
