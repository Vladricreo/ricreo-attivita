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
import { Dialogo } from "../ui/dialogo"
import { Popover } from "../ui/popover"

type Modo = "mese" | "settimana"

/** Un'attività in calendario: dal giorno di inizio (o dalla scadenza) alla scadenza. Le ricorrenze future sono "fantasmi". */
type Voce = { t: Task; da: string; a: string; fantasma: boolean; chiave: string }

const GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
/** Nel mese al massimo 4 righe per settimana (le altre in "+N altre"); spazio per le barre e per il numero del giorno, in rem. */
const MAX_MESE = 4
const AREA_MESE = 6.5
const AREA_SETTIMANA = 26
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

  // Le barre si dividono lo spazio del riquadro: una sola è alta (titolo su due righe, avatar sotto),
  // più sono e più si stringono; oltre il massimo resta "+N altre" che apre il dettaglio del giorno.
  const corsie = Math.max(0, ...posizionate.map((p) => p.riga + 1))
  const max = alta ? 30 : corsie > MAX_MESE ? MAX_MESE - 1 : MAX_MESE
  const righe = Math.min(max, corsie)
  const area = alta ? AREA_SETTIMANA : corsie > MAX_MESE ? AREA_MESE - 1.5 : AREA_MESE
  const passo = righe ? Math.min(alta ? 5 : AREA_MESE, Math.max(alta ? 2.75 : 1.5, area / righe)) : 0
  const visibili = posizionate.filter((p) => p.riga < max)
  const spazio = Math.max(alta ? AREA_SETTIMANA : AREA_MESE, righe * passo + (corsie > max ? 1.5 : 0))
  const [giornoAperto, setGiornoAperto] = useState<string | null>(null)
  const vociDel = (i: number) => posizionate.filter((p) => p.col <= i && p.col + p.span > i).map((p) => p.v)

  return (
    <div className="relative grid grid-cols-7 border-b border-border last:border-b-0">
      {giorni.map((g, i) => {
        const fuori = meseCorrente && g.slice(0, 7) !== meseCorrente
        const eOggi = g === oggi
        const nascoste = posizionate.filter((p) => p.riga >= max && p.col <= i && p.col + p.span > i)
        const quante = nascoste.length + visibili.filter((p) => p.col <= i && p.col + p.span > i).length
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
              fuori ? "bg-muted/30" : giornoSettimana(g) >= 5 ? "bg-muted/15" : "",
              eOggi && "bg-primary/5",
              sopra === g && "bg-primary/10 ring-2 ring-inset ring-primary/40",
            )}
            style={{ minHeight: `${TESTA + spazio + 0.5}rem` }}
          >
            <div className="absolute left-1.5 right-1.5 top-1.5 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => quante && setGiornoAperto(g)}
                title={quante ? "Tutte le attività del giorno" : undefined}
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
                  eOggi ? "bg-primary font-semibold text-primary-foreground shadow-sm" : fuori ? "text-muted-foreground/50" : "text-foreground/80",
                  quante ? (eOggi ? "hover:bg-primary/90" : "hover:bg-accent") : "cursor-default",
                )}
              >
                {Number(g.slice(8))}
                {g.slice(8) === "01" && !alta ? <span className="ml-1 font-normal">{MESI[Number(g.slice(5, 7)) - 1].slice(0, 3)}</span> : null}
              </button>
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
            {nascoste.length ? (
              <button
                type="button"
                onClick={() => setGiornoAperto(g)}
                className="absolute bottom-1.5 left-1 right-1 rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                +{nascoste.length} altr{nascoste.length === 1 ? "a" : "e"}
              </button>
            ) : null}
          </div>
        )
      })}
      {visibili.map(({ v, col, span, riga }) => (
        <Barra
          key={`${v.chiave}:${inizio}`}
          v={v}
          altezza={passo - 0.25}
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
      <DialogoGiorno
        giorno={giornoAperto}
        voci={giornoAperto ? vociDel(giorni.indexOf(giornoAperto)) : []}
        oggi={oggi}
        onChiudi={() => setGiornoAperto(null)}
        onApri={(t) => {
          setGiornoAperto(null)
          onApri(t)
        }}
        coloreDi={coloreDi}
      />
    </div>
  )
}

function Barra({
  v,
  altezza,
  continuaPrima,
  continuaDopo,
  scaduta,
  c,
  onApri,
  style,
}: {
  v: Voce
  /** In rem: decide quante cose ci stanno. */
  altezza: number
  continuaPrima: boolean
  continuaDopo: boolean
  scaduta: boolean
  c: ReturnType<typeof colore>
  onApri: (t: Task) => void
  style: CSSProperties
}) {
  const fattaOra = fatta(v.t)
  const ora = v.t.ora_scadenza && !v.fantasma ? v.t.ora_scadenza.slice(0, 5) : null
  const misura = altezza >= 2.5 ? "grande" : altezza >= 1.6 ? "media" : "piccola"
  const ids = v.t.assegnatari.map((x) => x.user_id)
  const avatar = ids.length ? (
    <span className={cn("ml-auto flex shrink-0 items-center", misura === "piccola" && "origin-right scale-75")}>
      <GruppoAvatar ids={ids} misura={misura === "grande" ? "sm" : "xs"} max={misura === "grande" ? 3 : 2} />
    </span>
  ) : null
  return (
    <div
      draggable={!v.fantasma}
      onDragStart={(e) => trascina(e, v.t.id, v.a)}
      onClick={() => onApri(v.t)}
      title={v.t.titolo}
      className={cn(
        "absolute z-10 flex cursor-pointer overflow-hidden border font-medium leading-tight shadow-sm transition-shadow hover:z-20 hover:shadow-md",
        misura === "piccola" ? "text-[11px]" : misura === "media" ? "text-xs" : "text-[13px]",
        c.badge,
        continuaPrima ? "rounded-l-none border-l-0" : misura === "grande" ? "rounded-l-lg" : "rounded-l-md",
        continuaDopo ? "rounded-r-none border-r-0" : misura === "grande" ? "rounded-r-lg" : "rounded-r-md",
        v.fantasma && "border-dashed opacity-50 shadow-none",
        fattaOra && "opacity-55",
        scaduta && "ring-1 ring-red-500/60",
      )}
      style={style}
    >
      {!continuaPrima ? <span className={cn("shrink-0", misura === "grande" ? "w-1" : "w-[3px]", c.punto)} /> : null}
      {misura === "grande" ? (
        <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-2 py-1.5">
          <span className="flex min-w-0 items-start gap-1">
            {v.fantasma ? <Repeat className="mt-0.5 h-3 w-3 shrink-0" /> : null}
            <span className={cn("break-words", altezza >= 4 ? "line-clamp-3" : "line-clamp-2", fattaOra && "line-through")}>{v.t.titolo}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-normal">
            {ora ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums opacity-80">
                <Clock className="h-3 w-3" />
                {ora}
              </span>
            ) : null}
            <BandierinaPriorita priorita={v.t.priorita} className="h-3 w-3" />
            {avatar}
          </span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1 pl-1.5 pr-1">
          {v.fantasma ? <Repeat className="h-2.5 w-2.5 shrink-0" /> : null}
          <span className={cn("min-w-0 truncate", fattaOra && "line-through")}>{v.t.titolo}</span>
          <BandierinaPriorita priorita={v.t.priorita} className={misura === "media" ? "h-3 w-3" : "h-2.5 w-2.5"} />
          {ora ? <span className="shrink-0 font-normal tabular-nums opacity-70">{ora}</span> : null}
          {avatar}
        </span>
      )}
    </div>
  )
}

const titoloGiorno = (giorno: string, oggi: string) => {
  const diff = giorniTraIso(oggi, giorno)
  const etichetta = diff === 0 ? "Oggi" : diff === 1 ? "Domani" : diff === -1 ? "Ieri" : null
  return `${etichetta ? `${etichetta} · ` : ""}${maiuscola(`${GIORNI[giornoSettimana(giorno)]} ${Number(giorno.slice(8))} ${MESI[Number(giorno.slice(5, 7)) - 1]}`)}`
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
  return (
    <div className="border-t border-border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{titoloGiorno(giorno, oggi)}</div>
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
          {voci.map((v) => (
            <SchedaVoce key={v.chiave} v={v} oggi={oggi} onApri={onApri} c={coloreDi(v.t)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Tutte le attività di un giorno (dal numero del giorno o da "+N altre"). */
function DialogoGiorno({
  giorno,
  voci,
  oggi,
  onChiudi,
  onApri,
  coloreDi,
}: {
  giorno: string | null
  voci: Voce[]
  oggi: string
  onChiudi: () => void
  onApri: (t: Task) => void
  coloreDi: (t: Task) => ReturnType<typeof colore>
}) {
  const ordinate = [...voci].sort((x, y) => Number(fatta(x.t)) - Number(fatta(y.t)) || ordinaPerPriorita(x.t, y.t))
  const aperte = voci.filter((v) => !fatta(v.t) && !v.fantasma).length
  return (
    <Dialogo
      aperto={!!giorno}
      onChiudi={onChiudi}
      titolo={giorno ? titoloGiorno(giorno, oggi) : ""}
      descrizione={`${voci.length} attività${aperte !== voci.length ? ` · ${aperte} da fare` : ""}`}
      className="max-w-xl"
      piede={
        giorno ? (
          <CreaQui
            giorno={giorno}
            trigger={
              <Bottone variante="contorno" misura="sm" className="rounded-lg">
                <Plus /> Aggiungi in questo giorno
              </Bottone>
            }
          />
        ) : null
      }
    >
      <div className="space-y-1.5">
        {ordinate.map((v) => (
          <SchedaVoce key={v.chiave} v={v} oggi={oggi} onApri={onApri} c={coloreDi(v.t)} />
        ))}
      </div>
    </Dialogo>
  )
}

function SchedaVoce({ v, oggi, onApri, c }: { v: Voce; oggi: string; onApri: (t: Task) => void; c: ReturnType<typeof colore> }) {
  const { categoria } = useAttivita()
  const fattaOra = fatta(v.t)
  const scaduta = !v.fantasma && !fattaOra && v.a < oggi
  const ora = v.t.ora_scadenza && !v.fantasma ? v.t.ora_scadenza.slice(0, 5) : null
  return (
    <button
      type="button"
      onClick={() => onApri(v.t)}
      className={cn(
        "flex w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-colors hover:bg-accent/40 active:bg-accent/50",
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
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className={cn("shrink-0", c.testo)}>{categoria(v.t.categoria_id)?.nome}</span>
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
