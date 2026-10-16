"use client"

import { ChevronLeft, ChevronRight, Clock, Inbox, Plus, Repeat } from "lucide-react"
import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from "react"
import { colore } from "../colori"
import { BandierinaPriorita } from "../componenti/aspetto"
import { GruppoAvatar } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { righePrincipali, usePersistito } from "../filtri"
import {
  aggiungiGiorniIso,
  aggiungiMesiIso,
  dataBreve,
  fatta,
  GIORNI_BREVI,
  giornoSettimana,
  giorniTraIso,
  inizioMese,
  inizioSettimana,
  MESI,
  oggiIso,
  ordinaPerPriorita,
  prossimaData,
  ricorrente,
} from "../regole"
import type { Task } from "../tipi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Popover } from "../ui/popover"

type Modo = "mese" | "settimana"

/** Un'attività in calendario: dal giorno di inizio (o dalla scadenza) alla scadenza. Le ricorrenze future sono "fantasmi". */
type Voce = { t: Task; da: string; a: string; fantasma: boolean; chiave: string }

const GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
/** Righe visibili per settimana nel mese (le altre in "+N altre") e altezza di una riga, in rem. */
const RIGHE_MESE = 3
const PASSO_MESE = 1.5
const PASSO_SETTIMANA = 2.75
const TESTA = 2.25

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const nelGiorno = (v: Voce, g: string) => v.da <= g && v.a >= g

export function VistaCalendario({ filtrate, onApri }: { filtrate: Task[]; onApri: (t: Task) => void }) {
  const { azioni, categoria, config, perId } = useAttivita()
  const oggi = oggiIso()
  const [modo, setModo] = usePersistito<Modo>(`${config.app}:calendario:modo`, "mese")
  const [rif, setRif] = useState(oggi)
  const [scelto, setScelto] = useState(oggi)
  const [senzaAperto, setSenzaAperto] = useState(false)

  const inizio = modo === "mese" ? inizioSettimana(inizioMese(rif)) : inizioSettimana(rif)
  const settimane = modo === "mese" ? Math.ceil(giorniTraIso(inizio, aggiungiMesiIso(inizioMese(rif), 1)) / 7) : 1
  const fine = aggiungiGiorniIso(inizio, settimane * 7 - 1)
  const meseCorrente = modo === "mese" ? inizioMese(rif).slice(0, 7) : null

  const voci = useMemo<Voce[]>(() => {
    const out: Voce[] = []
    for (const t of filtrate) {
      if (!t.scadenza && !t.data_inizio) continue
      const a = t.scadenza ?? t.data_inizio!
      const da = t.data_inizio && t.data_inizio <= a ? t.data_inizio : a
      if (!(a < inizio || da > fine)) out.push({ t, da, a, fantasma: false, chiave: t.id })
      // Prossime occorrenze delle ricorrenti dentro il periodo visibile.
      if (ricorrente(t) && t.scadenza && !t.completata_at) {
        const durata = giorniTraIso(da, a)
        let d = t.scadenza
        for (let i = 0; i < 60; i++) {
          d = prossimaData(d, t.ricorrenza_unita!, t.ricorrenza_intervallo!, t.ricorrenza_giorno)
          if (d > fine || (t.ricorrenza_fine && d > t.ricorrenza_fine)) break
          const dd = aggiungiGiorniIso(d, -durata)
          if (d >= inizio) out.push({ t, da: dd, a: d, fantasma: true, chiave: `${t.id}@${d}` })
        }
      }
    }
    return out.sort((x, y) => x.da.localeCompare(y.da) || giorniTraIso(y.da, y.a) - giorniTraIso(x.da, x.a) || ordinaPerPriorita(x.t, y.t))
  }, [filtrate, inizio, fine])

  const senzaData = useMemo(() => righePrincipali(filtrate).filter((t) => !t.scadenza && !t.data_inizio && !fatta(t)), [filtrate])
  const nelPeriodo = useMemo(() => {
    const da = meseCorrente ? `${meseCorrente}-01` : inizio
    const a = meseCorrente ? aggiungiGiorniIso(aggiungiMesiIso(da, 1), -1) : fine
    const reali = voci.filter((v) => !v.fantasma && !(v.a < da || v.da > a))
    return { tutte: reali.length, scadute: reali.filter((v) => !fatta(v.t) && v.a < oggi).length }
  }, [voci, meseCorrente, inizio, fine, oggi])

  const sposta = (t: Task, giorno: string, daGiorno: string | null) => {
    if (!t.scadenza && !t.data_inizio) {
      void azioni.aggiorna(t.id, { scadenza: giorno })
      return
    }
    const delta = giorniTraIso(daGiorno ?? t.scadenza ?? t.data_inizio!, giorno)
    if (!delta) return
    void azioni.aggiorna(t.id, {
      scadenza: t.scadenza ? aggiungiGiorniIso(t.scadenza, delta) : null,
      data_inizio: t.data_inizio ? aggiungiGiorniIso(t.data_inizio, delta) : null,
    })
  }

  // Cambiando periodo il giorno scelto (agenda su mobile) va al primo giorno, o a oggi se è dentro.
  const vaiA = (nuovo: string, m: Modo = modo) => {
    setRif(nuovo)
    const da = m === "mese" ? inizioMese(nuovo) : inizioSettimana(nuovo)
    const a = m === "mese" ? aggiungiGiorniIso(aggiungiMesiIso(da, 1), -1) : aggiungiGiorniIso(da, 6)
    setScelto(oggi >= da && oggi <= a ? oggi : da)
  }
  const naviga = (n: number) => vaiA(modo === "mese" ? aggiungiMesiIso(inizioMese(rif), n) : aggiungiGiorniIso(rif, 7 * n))
  const cambiaModo = (m: Modo) => {
    setModo(m)
    setRif(scelto)
  }
  const scegli = (g: string) => {
    setScelto(g)
    if (meseCorrente && g.slice(0, 7) !== meseCorrente) setRif(g)
  }

  const [a, m] = (modo === "mese" ? inizioMese(rif) : inizio).split("-").map(Number)
  const coloreDi = (t: Task) => colore(categoria(t.categoria_id)?.colore)
  const oggiVisibile = oggi >= inizio && oggi <= fine

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Barra */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold leading-tight tracking-tight">
              {modo === "mese" ? (
                <>
                  <span className="capitalize">{MESI[m - 1]}</span> <span className="font-normal text-muted-foreground">{a}</span>
                </>
              ) : (
                <>
                  {dataBreve(inizio)} – {dataBreve(fine)}
                </>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {nelPeriodo.tutte ? `${nelPeriodo.tutte} attività` : "Nessuna attività"}
              {nelPeriodo.scadute ? <span className="text-red-600 dark:text-red-400"> · {nelPeriodo.scadute} scadut{nelPeriodo.scadute === 1 ? "a" : "e"}</span> : null}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-background shadow-sm">
              <button type="button" onClick={() => naviga(-1)} className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Precedente">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => vaiA(oggi)}
                className={cn("h-8 border-x border-border px-2.5 text-xs font-medium hover:bg-accent sm:px-3", oggiVisibile ? "text-muted-foreground" : "text-foreground")}
              >
                Oggi
              </button>
              <button type="button" onClick={() => naviga(1)} className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Successivo">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="inline-flex rounded-lg bg-muted p-0.5">
              {(["mese", "settimana"] as Modo[]).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => cambiaModo(x)}
                  className={cn(
                    "h-7 rounded-md px-2 text-xs font-medium capitalize transition-colors sm:px-2.5",
                    modo === x ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {x}
                </button>
              ))}
            </div>
            <Bottone
              variante={senzaAperto ? "secondario" : "contorno"}
              misura="sm"
              onClick={() => setSenzaAperto((v) => !v)}
              title="Attività senza data"
              className="ml-auto rounded-lg px-2 sm:ml-0 sm:px-2.5"
            >
              <Inbox />
              <span className="hidden sm:inline">Senza data</span>
              {senzaData.length ? <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums leading-4 text-muted-foreground">{senzaData.length}</span> : null}
            </Bottone>
          </div>
        </div>

        {/* Desktop: griglia con le barre */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {GIORNI_BREVI.map((g, i) => (
              <div key={g} className={cn("px-2 py-2 text-[11px] font-semibold uppercase tracking-wider", i >= 5 ? "text-muted-foreground/60" : "text-muted-foreground")}>
                {g}
              </div>
            ))}
          </div>
          {Array.from({ length: settimane }, (_, i) => (
            <Settimana
              key={i}
              inizio={aggiungiGiorniIso(inizio, i * 7)}
              meseCorrente={meseCorrente}
              voci={voci}
              oggi={oggi}
              alta={modo === "settimana"}
              onApri={onApri}
              onSposta={sposta}
              coloreDi={coloreDi}
              perId={perId}
            />
          ))}
        </div>

        {/* Mobile: giorni con i pallini e l'agenda del giorno scelto */}
        <div className="sm:hidden">
          <div className="grid grid-cols-7 px-2 pt-2">
            {GIORNI_BREVI.map((g, i) => (
              <div key={g} className={cn("pb-1 text-center text-[10px] font-semibold uppercase tracking-wider", i >= 5 ? "text-muted-foreground/60" : "text-muted-foreground")}>
                {g.slice(0, 1)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-2 pb-2">
            {Array.from({ length: settimane * 7 }, (_, i) => {
              const g = aggiungiGiorniIso(inizio, i)
              const qui = voci.filter((v) => nelGiorno(v, g))
              const fuori = meseCorrente && g.slice(0, 7) !== meseCorrente
              const sel = g === scelto
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => scegli(g)}
                  className={cn("flex h-12 flex-col items-center justify-start gap-1 rounded-lg pt-1 transition-colors", sel ? "bg-accent" : "active:bg-accent/60")}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[13px] tabular-nums",
                      g === oggi ? "bg-primary font-semibold text-primary-foreground" : sel ? "font-semibold text-foreground" : fuori ? "text-muted-foreground/40" : "text-foreground",
                    )}
                  >
                    {Number(g.slice(8))}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {qui.slice(0, 3).map((v) => (
                      <span key={v.chiave} className={cn("h-1.5 w-1.5 rounded-full", coloreDi(v.t).punto, (v.fantasma || fatta(v.t)) && "opacity-40")} />
                    ))}
                    {qui.length > 3 ? <span className="text-[9px] leading-none text-muted-foreground">+</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
          <AgendaGiorno giorno={scelto} voci={voci.filter((v) => nelGiorno(v, scelto))} oggi={oggi} onApri={onApri} coloreDi={coloreDi} />
        </div>
      </div>

      {senzaAperto ? (
        <aside className="w-full shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:sticky lg:top-4 lg:w-72">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Senza data</span>
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{senzaData.length}</span>
          </div>
          <p className="hidden px-3 pt-2 text-xs text-muted-foreground sm:block">Trascinale su un giorno per darle una scadenza.</p>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {senzaData.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => trascina(e, t.id, null)}
                onClick={() => onApri(t)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 sm:cursor-grab"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", coloreDi(t).punto)} />
                <span className="min-w-0 flex-1 truncate">{t.titolo}</span>
                <BandierinaPriorita priorita={t.priorita} className="h-3 w-3" />
                <GruppoAvatar ids={t.assegnatari.map((x) => x.user_id)} misura="xs" max={2} />
              </div>
            ))}
            {!senzaData.length ? <div className="px-1 py-3 text-center text-sm text-muted-foreground">Tutte hanno una data.</div> : null}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

function trascina(e: DragEvent, id: string, giorno: string | null) {
  e.dataTransfer.setData("text/x-attivita", JSON.stringify({ id, giorno }))
  e.dataTransfer.effectAllowed = "move"
}

function Settimana({
  inizio,
  meseCorrente,
  voci,
  oggi,
  alta,
  onApri,
  onSposta,
  coloreDi,
  perId,
}: {
  inizio: string
  meseCorrente: string | null
  voci: Voce[]
  oggi: string
  alta: boolean
  onApri: (t: Task) => void
  onSposta: (t: Task, giorno: string, daGiorno: string | null) => void
  coloreDi: (t: Task) => ReturnType<typeof colore>
  perId: Map<string, Task>
}) {
  const fine = aggiungiGiorniIso(inizio, 6)
  const giorni = Array.from({ length: 7 }, (_, i) => aggiungiGiorniIso(inizio, i))
  const [sopra, setSopra] = useState<string | null>(null)

  // Corsie: ogni voce prende la prima riga libera per tutti i suoi giorni della settimana.
  const posizionate = useMemo(() => {
    const qui = voci.filter((v) => !(v.a < inizio || v.da > fine))
    const occupate: boolean[][] = []
    const pos: { v: Voce; col: number; span: number; riga: number }[] = []
    for (const v of qui) {
      const col = Math.max(0, giorniTraIso(inizio, v.da))
      const ultima = Math.min(6, giorniTraIso(inizio, v.a))
      let riga = 0
      while (occupate[riga]?.slice(col, ultima + 1).some(Boolean)) riga++
      occupate[riga] = occupate[riga] ?? Array(7).fill(false)
      for (let c = col; c <= ultima; c++) occupate[riga][c] = true
      pos.push({ v, col, span: ultima - col + 1, riga })
    }
    return pos
  }, [voci, inizio, fine])

  const max = alta ? 30 : RIGHE_MESE
  const passo = alta ? PASSO_SETTIMANA : PASSO_MESE
  const visibili = posizionate.filter((p) => p.riga < max)
  const righe = Math.min(max, Math.max(0, ...posizionate.map((p) => p.riga + 1)))

  return (
    <div className="relative grid grid-cols-7 border-b border-border last:border-b-0">
      {giorni.map((g, i) => {
        const fuori = meseCorrente && g.slice(0, 7) !== meseCorrente
        const eOggi = g === oggi
        const nascoste = posizionate.filter((p) => p.riga >= max && p.col <= i && p.col + p.span > i)
        return (
          <div
            key={g}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/x-attivita")) {
                e.preventDefault()
                setSopra(g)
              }
            }}
            onDragLeave={() => setSopra((s) => (s === g ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setSopra(null)
              try {
                const { id, giorno } = JSON.parse(e.dataTransfer.getData("text/x-attivita"))
                const t = perId.get(id)
                if (t) onSposta(t, g, giorno)
              } catch {
                // dati non nostri
              }
            }}
            className={cn(
              "group/giorno relative border-r border-border transition-colors last:border-r-0",
              alta ? "min-h-[28rem]" : "min-h-[7.5rem]",
              fuori ? "bg-muted/30" : giornoSettimana(g) >= 5 ? "bg-muted/15" : "",
              eOggi && "bg-primary/5",
              sopra === g && "bg-primary/10 ring-2 ring-inset ring-primary/40",
            )}
            style={{ paddingTop: `${TESTA}rem`, paddingBottom: nascoste.length ? "1.75rem" : "0.5rem" }}
          >
            <div className="absolute left-1.5 right-1.5 top-1.5 flex items-center justify-between gap-1">
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
                  eOggi ? "bg-primary font-semibold text-primary-foreground shadow-sm" : fuori ? "text-muted-foreground/50" : "text-foreground/80",
                )}
              >
                {Number(g.slice(8))}
                {g.slice(8) === "01" && !alta ? <span className="ml-1 font-normal">{MESI[Number(g.slice(5, 7)) - 1].slice(0, 3)}</span> : null}
              </span>
              <CreaQui
                giorno={g}
                trigger={
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover/giorno:opacity-100"
                    aria-label="Nuova attività in questo giorno"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
            <div style={{ height: `${righe * passo}rem` }} />
            {nascoste.length ? (
              <AltreDelGiorno giorno={g} voci={posizionate.filter((p) => p.col <= i && p.col + p.span > i).map((p) => p.v)} n={nascoste.length} onApri={onApri} coloreDi={coloreDi} />
            ) : null}
          </div>
        )
      })}
      {visibili.map(({ v, col, span, riga }) => (
        <Barra
          key={`${v.chiave}:${inizio}`}
          v={v}
          alta={alta}
          continuaPrima={v.da < inizio}
          continuaDopo={v.a > fine}
          scaduta={!v.fantasma && !fatta(v.t) && v.a < oggi}
          c={coloreDi(v.t)}
          onApri={onApri}
          style={{
            left: `calc(${(col / 7) * 100}% + 4px)`,
            width: `calc(${(span / 7) * 100}% - 8px)`,
            top: `calc(${TESTA}rem + ${riga * passo}rem)`,
            height: `${passo - 0.25}rem`,
          }}
        />
      ))}
    </div>
  )
}

function Barra({
  v,
  alta,
  continuaPrima,
  continuaDopo,
  scaduta,
  c,
  onApri,
  style,
}: {
  v: Voce
  alta: boolean
  continuaPrima: boolean
  continuaDopo: boolean
  scaduta: boolean
  c: ReturnType<typeof colore>
  onApri: (t: Task) => void
  style: CSSProperties
}) {
  const fattaOra = fatta(v.t)
  const ora = v.t.ora_scadenza && !v.fantasma ? v.t.ora_scadenza.slice(0, 5) : null
  return (
    <div
      draggable={!v.fantasma}
      onDragStart={(e) => trascina(e, v.t.id, v.a)}
      onClick={() => onApri(v.t)}
      title={v.t.titolo}
      className={cn(
        "absolute z-10 flex cursor-pointer overflow-hidden border text-[11px] font-medium leading-tight shadow-sm transition-shadow hover:z-20 hover:shadow-md",
        c.badge,
        continuaPrima ? "rounded-l-none border-l-0" : "rounded-l-md",
        continuaDopo ? "rounded-r-none border-r-0" : "rounded-r-md",
        v.fantasma && "border-dashed opacity-50 shadow-none",
        fattaOra && "opacity-55",
        scaduta && "ring-1 ring-red-500/60",
      )}
      style={style}
    >
      {!continuaPrima ? <span className={cn("w-[3px] shrink-0", c.punto)} /> : null}
      <span className={cn("flex min-w-0 flex-1 gap-1 px-1.5", alta ? "flex-col justify-center" : "items-center")}>
        <span className="flex min-w-0 items-center gap-1">
          {v.fantasma ? <Repeat className="h-2.5 w-2.5 shrink-0" /> : null}
          <span className={cn("truncate", fattaOra && "line-through")}>{v.t.titolo}</span>
          {!alta ? <BandierinaPriorita priorita={v.t.priorita} className="h-2.5 w-2.5" /> : null}
          {!alta && ora ? <span className="ml-auto shrink-0 font-normal tabular-nums opacity-70">{ora}</span> : null}
        </span>
        {alta ? (
          <span className="flex min-w-0 items-center gap-1.5 font-normal opacity-80">
            {ora ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                <Clock className="h-2.5 w-2.5" />
                {ora}
              </span>
            ) : null}
            <BandierinaPriorita priorita={v.t.priorita} className="h-2.5 w-2.5" />
            <span className="ml-auto shrink-0">
              <GruppoAvatar ids={v.t.assegnatari.map((x) => x.user_id)} misura="xs" max={3} />
            </span>
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** Agenda del giorno scelto (su mobile). */
function AgendaGiorno({
  giorno,
  voci,
  oggi,
  onApri,
  coloreDi,
}: {
  giorno: string
  voci: Voce[]
  oggi: string
  onApri: (t: Task) => void
  coloreDi: (t: Task) => ReturnType<typeof colore>
}) {
  const diff = giorniTraIso(oggi, giorno)
  const etichetta = diff === 0 ? "Oggi" : diff === 1 ? "Domani" : diff === -1 ? "Ieri" : null
  return (
    <div className="border-t border-border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {etichetta ? `${etichetta} · ` : ""}
            {maiuscola(`${GIORNI[giornoSettimana(giorno)]} ${Number(giorno.slice(8))} ${MESI[Number(giorno.slice(5, 7)) - 1]}`)}
          </div>
          <div className="text-xs text-muted-foreground">{voci.length ? `${voci.length} attività` : "Niente in programma"}</div>
        </div>
        <CreaQui
          giorno={giorno}
          trigger={
            <Bottone variante="contorno" misura="sm" className="rounded-lg">
              <Plus /> Aggiungi
            </Bottone>
          }
        />
      </div>
      {voci.length ? (
        <div className="space-y-1.5 px-3 pb-3">
          {voci.map((v) => {
            const c = coloreDi(v.t)
            const fattaOra = fatta(v.t)
            const scaduta = !v.fantasma && !fattaOra && v.a < oggi
            const ora = v.t.ora_scadenza && !v.fantasma ? v.t.ora_scadenza.slice(0, 5) : null
            return (
              <button
                key={v.chiave}
                type="button"
                onClick={() => onApri(v.t)}
                className={cn(
                  "flex w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm active:bg-accent/50",
                  v.fantasma && "border-dashed opacity-60 shadow-none",
                )}
              >
                <span className={cn("w-1 shrink-0", c.punto)} />
                <span className="min-w-0 flex-1 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {v.fantasma ? <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
                    <span className={cn("truncate text-sm font-medium", fattaOra && "text-muted-foreground line-through")}>{v.t.titolo}</span>
                    <BandierinaPriorita priorita={v.t.priorita} />
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    {ora ? (
                      <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                        <Clock className="h-3 w-3" />
                        {ora}
                      </span>
                    ) : null}
                    {v.da !== v.a ? <span className="truncate">{`${dataBreve(v.da)} → ${dataBreve(v.a)}`}</span> : null}
                    {scaduta ? <span className="shrink-0 font-medium text-red-600 dark:text-red-400">Scaduta</span> : null}
                    {fattaOra ? <span className="shrink-0 text-emerald-600 dark:text-emerald-400">Fatta</span> : null}
                    {v.fantasma ? <span className="shrink-0">Prossima ricorrenza</span> : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center pr-3">
                  <GruppoAvatar ids={v.t.assegnatari.map((x) => x.user_id)} misura="sm" max={2} />
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function CreaQui({ giorno, trigger }: { giorno: string; trigger: ReactNode }) {
  const { azioni, config } = useAttivita()
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState("")
  const crea = async () => {
    if (!testo.trim()) return
    const id = await azioni.crea({ titolo: testo.trim(), scadenza: giorno, categoria_id: config.app })
    if (id) {
      setTesto("")
      setAperto(false)
    }
  }
  return (
    <Popover aperto={aperto} onCambia={setAperto} allinea="end" className="w-72 p-3" trigger={trigger}>
      <div className="mb-2 text-xs font-medium text-muted-foreground">Nuova attività per {dataBreve(giorno)}</div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void crea()}
          placeholder="Cosa c'è da fare?"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Bottone misura="icona" onClick={() => void crea()} disabled={!testo.trim()} aria-label="Crea">
          <Plus />
        </Bottone>
      </div>
    </Popover>
  )
}

function AltreDelGiorno({
  giorno,
  voci,
  n,
  onApri,
  coloreDi,
}: {
  giorno: string
  voci: Voce[]
  n: number
  onApri: (t: Task) => void
  coloreDi: (t: Task) => ReturnType<typeof colore>
}) {
  return (
    <Popover
      className="w-72"
      trigger={
        <button type="button" className="absolute bottom-1 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          +{n} altre
        </button>
      }
    >
      <div className="mb-1 px-2 pt-1 text-xs font-semibold capitalize text-muted-foreground">
        {GIORNI[giornoSettimana(giorno)]} {dataBreve(giorno)}
      </div>
      {voci.map((v) => (
        <button
          key={v.chiave}
          type="button"
          onClick={() => onApri(v.t)}
          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", (v.fantasma || fatta(v.t)) && "opacity-60")}
        >
          <span className={cn("h-2 w-2 shrink-0 rounded-full", coloreDi(v.t).punto)} />
          {v.fantasma ? <Repeat className="h-3 w-3 shrink-0" /> : null}
          <span className={cn("min-w-0 flex-1 truncate", fatta(v.t) && "line-through")}>{v.t.titolo}</span>
          <GruppoAvatar ids={v.t.assegnatari.map((x) => x.user_id)} misura="xs" max={2} />
        </button>
      ))}
    </Popover>
  )
}
