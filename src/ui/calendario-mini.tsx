"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { aggiungiGiorniIso, aggiungiMesiIso, GIORNI_BREVI, giornoSettimana, giorniNelMese, inizioMese, MESI, oggiIso } from "../regole"
import { cn } from "./cn"

/** Calendario mensile per scegliere un giorno (lunedì primo giorno). */
export function CalendarioMini({
  valore,
  onScegli,
  evidenzia,
}: {
  valore: string | null
  onScegli: (iso: string) => void
  /** Giorni da segnare con un punto (es. inizio). */
  evidenzia?: string[]
}) {
  const oggi = oggiIso()
  const [mese, setMese] = useState(inizioMese(valore ?? oggi))
  const primo = giornoSettimana(mese)
  const giorni = giorniNelMese(mese)
  const celle: (string | null)[] = [...Array(primo).fill(null), ...Array.from({ length: giorni }, (_, i) => aggiungiGiorniIso(mese, i))]
  while (celle.length % 7) celle.push(null)
  const [a, m] = mese.split("-").map(Number)

  return (
    <div className="w-64 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-md p-1 hover:bg-accent" onClick={() => setMese(aggiungiMesiIso(mese, -1))} aria-label="Mese precedente">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium capitalize">
          {MESI[m - 1]} {a}
        </span>
        <button type="button" className="rounded-md p-1 hover:bg-accent" onClick={() => setMese(aggiungiMesiIso(mese, 1))} aria-label="Mese successivo">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
        {GIORNI_BREVI.map((g) => (
          <div key={g} className="py-1 capitalize">
            {g.slice(0, 2)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {celle.map((iso, i) =>
          iso ? (
            <button
              key={iso}
              type="button"
              onClick={() => onScegli(iso)}
              className={cn(
                "relative flex h-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent",
                iso === oggi && "font-semibold text-primary",
                iso === valore && "bg-primary text-primary-foreground hover:bg-primary/90",
                giornoSettimana(iso) >= 5 && iso !== valore && "text-muted-foreground",
              )}
            >
              {Number(iso.slice(8))}
              {evidenzia?.includes(iso) && iso !== valore ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" /> : null}
            </button>
          ) : (
            <div key={`v${i}`} />
          ),
        )}
      </div>
    </div>
  )
}
