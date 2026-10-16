"use client"

import { Archive, Eye, Plus, RotateCcw } from "lucide-react"
import { useState } from "react"
import { colore, ELENCO_COLORI } from "../colori"
import { SezioneGoogle } from "../componenti/google"
import { SezioneRuoli } from "../componenti/ruoli"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { eAdmin, eManager } from "../regole"
import type { Colore, Sottocategoria } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Popover } from "../ui/popover"

export function VistaImpostazioni() {
  const { base, me, persona, api, ricarica } = useAttivita()
  const io = persona(me)
  const admin = eAdmin(io)
  const manager = eManager(io)
  const [nuove, setNuove] = useState<Record<string, string>>({})

  const fai = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await ricarica("base")
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }

  if (!base) return null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SezioneGoogle />

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" /> Chi vede cosa
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Ognuno vede le attività in cui è coinvolto: create da lui, assegnate a lui o che segue (anche solo una sottotask).</li>
          <li>Le attività personali le vede solo chi le ha create, nemmeno gli admin.</li>
          <li>Gli admin vedono tutte le altre; i manager quelle delle persone che seguono (vedi Ruoli e responsabili).</li>
          <li>Chi è @menzionato in una chat entra tra chi segue l&apos;attività.</li>
          <li>Le notifiche arrivano nell&apos;app della categoria; se la persona non usa quell&apos;app, in tutte le sue.</li>
        </ul>
      </section>

      <SezioneRuoli />

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Categorie e sottocategorie</h3>
          <p className="text-xs text-muted-foreground">La categoria è l&apos;app di appartenenza (badge e notifiche); le sottocategorie sono libere.</p>
        </div>
        <div className="divide-y divide-border">
          {base.categorie.map((c) => {
            const sotto = base.sottocategorie.filter((s) => s.categoria_id === c.id).sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome))
            return (
              <div key={c.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SceltaColore valore={c.colore} disabilitato={!admin} onCambia={(col) => void fai(() => api.salvaCategoria({ ...c, colore: col }))} />
                  <span className={cn("text-sm font-semibold", !c.attiva && "text-muted-foreground line-through")}>{c.nome}</span>
                  {c.app_slug ? <span className="text-xs text-muted-foreground">app {c.app_slug}</span> : null}
                  <span className="flex-1" />
                  {admin ? (
                    <Bottone variante="fantasma" misura="sm" onClick={() => void fai(() => api.salvaCategoria({ ...c, attiva: !c.attiva }))}>
                      {c.attiva ? "Nascondi" : "Riattiva"}
                    </Bottone>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-7">
                  {sotto.map((s) => (
                    <ChipSottocategoria key={s.id} s={s} modificabile={admin || manager} onSalva={(x) => void fai(() => api.salvaSottocategoria(x))} />
                  ))}
                  {admin || manager ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        value={nuove[c.id] ?? ""}
                        onChange={(e) => setNuove((n) => ({ ...n, [c.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          const nome = (nuove[c.id] ?? "").trim()
                          if (e.key === "Enter" && nome) {
                            setNuove((n) => ({ ...n, [c.id]: "" }))
                            void fai(() => api.salvaSottocategoria({ categoria_id: c.id, nome, ordine: (sotto[sotto.length - 1]?.ordine ?? 0) + 10 }))
                          }
                        }}
                        placeholder="Nuova sottocategoria"
                        className="h-7 w-40 rounded-md border border-dashed border-border bg-transparent px-2 text-xs outline-none focus:border-input focus:ring-1 focus:ring-ring"
                      />
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SceltaColore({ valore, onCambia, disabilitato }: { valore: Colore | null; onCambia: (c: Colore) => void; disabilitato?: boolean }) {
  if (disabilitato) return <span className={cn("h-4 w-4 rounded-full", colore(valore).punto)} />
  return (
    <Popover
      className="w-auto p-2"
      trigger={
        <button type="button" className={cn("h-4 w-4 rounded-full ring-2 ring-background ring-offset-1 ring-offset-border", colore(valore).punto)} aria-label="Colore" />
      }
    >
      <div className="grid grid-cols-7 gap-1.5">
        {ELENCO_COLORI.map((c) => (
          <button key={c} type="button" onClick={() => onCambia(c)} className={cn("h-6 w-6 rounded-full", colore(c).punto, c === valore && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} aria-label={c} />
        ))}
      </div>
    </Popover>
  )
}

function ChipSottocategoria({ s, modificabile, onSalva }: { s: Sottocategoria; modificabile: boolean; onSalva: (s: Sottocategoria) => void }) {
  const [nome, setNome] = useState(s.nome)
  if (!modificabile)
    return <span className={cn("rounded-md border px-2 py-0.5 text-xs", colore(s.colore).badge, s.archiviata_at && "opacity-50 line-through")}>{s.nome}</span>
  return (
    <Popover
      className="w-64"
      trigger={
        <button type="button" className={cn("rounded-md border px-2 py-0.5 text-xs hover:opacity-80", colore(s.colore).badge, s.archiviata_at && "opacity-50 line-through")}>
          {s.nome}
        </button>
      }
    >
      <div className="space-y-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && nome.trim() && onSalva({ ...s, nome: nome.trim() })}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        />
        <div className="grid grid-cols-7 gap-1.5">
          {ELENCO_COLORI.map((c) => (
            <button key={c} type="button" onClick={() => onSalva({ ...s, nome: nome.trim() || s.nome, colore: c })} className={cn("h-5 w-5 rounded-full", colore(c).punto, c === s.colore && "ring-2 ring-foreground ring-offset-1 ring-offset-background")} aria-label={c} />
          ))}
        </div>
        <div className="flex justify-between">
          <Bottone variante="fantasma" misura="sm" onClick={() => onSalva({ ...s, archiviata_at: s.archiviata_at ? null : new Date().toISOString() })}>
            {s.archiviata_at ? <RotateCcw /> : <Archive />} {s.archiviata_at ? "Riattiva" : "Archivia"}
          </Bottone>
          <Bottone misura="sm" onClick={() => nome.trim() && onSalva({ ...s, nome: nome.trim() })}>
            Salva
          </Bottone>
        </div>
      </div>
    </Popover>
  )
}
