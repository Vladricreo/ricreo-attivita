"use client"

import { ChevronRight, CornerDownRight, MessageSquare, Paperclip, Plus, Repeat, UserPlus } from "lucide-react"
import { useState } from "react"
import { useAttivita } from "../contesto"
import { descriviRicorrenza, fatta, oggiIso, scadenzaRelativa, giorniTraIso } from "../regole"
import type { BozzaTask, Task } from "../tipi"
import { cn } from "../ui/cn"
import { Popover } from "../ui/popover"
import { Suggerimento } from "../ui/suggerimento"
import { BadgeCategoria, BandierinaPriorita, BarraProgresso, LogoServizio, Personale, SpuntaCompleta } from "./aspetto"
import { MenuAzioniTask } from "./azioni-task"
import { GruppoAvatar, ScegliPersone } from "./persone"
import { SelettoreData, SelettorePriorita } from "./selettori"

export function testoScadenza(t: Task, oggi = oggiIso()) {
  if (!t.scadenza) return null
  const g = giorniTraIso(oggi, t.scadenza)
  const tono = fatta(t) ? "text-muted-foreground" : g < 0 ? "text-red-600 dark:text-red-400" : g === 0 ? "text-amber-600 dark:text-amber-400" : g <= 2 ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
  return { testo: scadenzaRelativa(t.scadenza, oggi), tono }
}

/** Assegnatari cliccabili (popover per cambiarli). */
export function CampoPersone({ t, misura = "sm", max = 3 }: { t: Task; misura?: "xs" | "sm" | "md"; max?: number }) {
  const { azioni, me } = useAttivita()
  const ids = t.assegnatari.map((a) => a.user_id)
  const fatti = new Set(t.assegnatari.filter((a) => a.fatto_at).map((a) => a.user_id))
  return (
    <Popover
      className="w-72"
      allinea="end"
      trigger={
        <button type="button" className="flex shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(e) => e.stopPropagation()} aria-label="Chi la fa">
          <GruppoAvatar
            ids={ids}
            max={max}
            misura={misura}
            fatti={t.conferma_tutti ? fatti : undefined}
            vuoto={
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary">
                <UserPlus className="h-3 w-3" />
              </span>
            }
          />
        </button>
      }
    >
      <ScegliPersone
        titolo={t.personale ? "Attività personale: solo tu" : "Chi la fa"}
        scelti={ids}
        soloIds={t.personale && me ? [me] : undefined}
        onCambia={(nuovi) => void azioni.assegna(t, nuovi)}
      />
    </Popover>
  )
}

export function RigaTask({
  t,
  sottotask,
  livello = 0,
  conCategoria = true,
  onApri,
  inAttesa,
  breadcrumb,
}: {
  t: Task
  sottotask?: Task[]
  livello?: number
  conCategoria?: boolean
  onApri: (t: Task) => void
  inAttesa?: string | null
  breadcrumb?: string | null
}) {
  const { azioni } = useAttivita()
  const [aperta, setAperta] = useState(false)
  const scad = testoScadenza(t)
  const ric = descriviRicorrenza(t.ricorrenza_unita, t.ricorrenza_intervallo)
  const haSotto = !!sottotask?.length
  const fattaOra = fatta(t)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onApri(t)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onApri(t)
        }}
        className={cn(
          "group flex min-h-11 cursor-pointer items-center gap-2 border-b border-border/60 px-2 py-1.5 text-sm transition-colors hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none sm:px-3",
          livello > 0 && "bg-muted/20",
        )}
        style={livello ? { paddingLeft: `${livello * 1.75 + 0.5}rem` } : undefined}
      >
        <span className="flex w-4 shrink-0 justify-center">
          {haSotto ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation()
                setAperta((v) => !v)
              }}
              aria-label={aperta ? "Chiudi sottotask" : "Mostra sottotask"}
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", aperta && "rotate-90")} />
            </button>
          ) : livello > 0 ? (
            <CornerDownRight className="h-3 w-3 text-muted-foreground/60" />
          ) : null}
        </span>
        <SpuntaCompleta t={t} inAttesa={inAttesa} onClick={() => (fattaOra ? void azioni.riapri(t) : void azioni.completa(t))} />
        <div className="min-w-0 flex-1">
          {breadcrumb ? <div className="truncate text-[11px] leading-tight text-muted-foreground">{breadcrumb} ›</div> : null}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate font-medium", fattaOra && "text-muted-foreground line-through")}>{t.titolo}</span>
            {t.personale ? <Personale /> : null}
            <LogoServizio servizio={t.servizio} />
            {ric ? (
              <Suggerimento testo={ric}>
                <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Suggerimento>
            ) : null}
            {inAttesa ? <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">in attesa</span> : null}
          </div>
          {/* Su mobile i dettagli vanno sotto il titolo */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
            {conCategoria ? <BadgeCategoria id={t.categoria_id} sottocategoria={t.sottocategoria_id} piccolo /> : null}
            {scad ? <span className={cn("text-xs", scad.tono)}>{scad.testo}</span> : null}
            <BarraProgresso t={t} conTesto />
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          {conCategoria ? <BadgeCategoria id={t.categoria_id} sottocategoria={t.sottocategoria_id} className="max-w-[12rem]" /> : null}
          <BarraProgresso t={t} conTesto />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {t.n_allegati ? (
            <span className="hidden items-center gap-0.5 md:inline-flex">
              <Paperclip className="h-3.5 w-3.5" />
              {t.n_allegati}
            </span>
          ) : null}
          {t.n_commenti ? (
            <span className={cn("inline-flex items-center gap-0.5", t.n_non_letti && "font-semibold text-primary")}>
              <MessageSquare className={cn("h-3.5 w-3.5", t.n_non_letti && "fill-primary/20")} />
              {t.n_non_letti || t.n_commenti}
            </span>
          ) : null}
        </div>
        <span className="hidden w-24 shrink-0 justify-end sm:flex" onClick={(e) => e.stopPropagation()}>
          <SelettoreData
            valore={t.scadenza}
            minimo={t.data_inizio}
            onCambia={(d) => void azioni.aggiorna(t.id, { scadenza: d })}
            trigger={
              <button type="button" className={cn("truncate rounded px-1.5 py-0.5 text-xs hover:bg-accent", scad?.tono ?? "text-muted-foreground/50 opacity-0 group-hover:opacity-100")}>
                {scad?.testo ?? "+ data"}
              </button>
            }
          />
        </span>
        <span className="hidden w-5 shrink-0 justify-center sm:flex" onClick={(e) => e.stopPropagation()}>
          <SelettorePriorita
            valore={t.priorita}
            onCambia={(p) => void azioni.aggiorna(t.id, { priorita: p })}
            trigger={
              <button type="button" className="rounded p-0.5 hover:bg-accent" aria-label="Priorità">
                <BandierinaPriorita priorita={t.priorita} />
                {t.priorita === "normale" ? <span className="block h-3.5 w-3.5" /> : null}
              </button>
            }
          />
        </span>
        <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
          <CampoPersone t={t} />
        </span>
        <span className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <MenuAzioniTask t={t} onApri={() => onApri(t)} />
        </span>
      </div>
      {haSotto && aperta
        ? sottotask!.map((s) => <RigaTask key={s.id} t={s} livello={livello + 1} conCategoria={false} onApri={onApri} />)
        : null}
    </>
  )
}

/** Riga per creare al volo (Invio = crea, Esc = annulla). */
export function AggiuntaRapida({
  bozza,
  segnaposto = "Nuova attività…",
  className,
  onCreata,
}: {
  bozza?: Partial<BozzaTask>
  segnaposto?: string
  className?: string
  onCreata?: (id: string) => void
}) {
  const { azioni, config } = useAttivita()
  const [attiva, setAttiva] = useState(false)
  const [testo, setTesto] = useState("")
  const [invio, setInvio] = useState(false)
  const crea = async () => {
    const titolo = testo.trim()
    if (!titolo || invio) return
    setInvio(true)
    const id = await azioni.crea({ categoria_id: config.app, ...bozza, titolo })
    setInvio(false)
    if (id) {
      setTesto("")
      onCreata?.(id)
    }
  }
  if (!attiva)
    return (
      <button
        type="button"
        onClick={() => setAttiva(true)}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground", className)}
      >
        <Plus className="h-4 w-4" /> {segnaposto}
      </button>
    )
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5", className)}>
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={testo}
        disabled={invio}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void crea()
          if (e.key === "Escape") {
            setTesto("")
            setAttiva(false)
          }
        }}
        onBlur={() => !testo.trim() && setAttiva(false)}
        placeholder="Scrivi e premi Invio"
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}
