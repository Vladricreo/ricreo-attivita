"use client"

import { ChevronLeft, ChevronRight, Inbox, Plus, Repeat } from "lucide-react"
import { useMemo, useState, type DragEvent } from "react"
import { colore } from "../colori"
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

const RIGHE_MAX = 3

export function VistaCalendario({ filtrate, onApri }: { filtrate: Task[]; onApri: (t: Task) => void }) {
  const { azioni, categoria, config, perId } = useAttivita()
  const oggi = oggiIso()
  const [modo, setModo] = usePersistito<Modo>(`${config.app}:calendario:modo`, "mese")
  const [rif, setRif] = useState(oggi)
  const [senzaAperto, setSenzaAperto] = useState(false)

  const inizio = modo === "mese" ? inizioSettimana(inizioMese(rif)) : inizioSettimana(rif)
  const settimane = modo === "mese" ? Math.ceil(giorniTraIso(inizio, aggiungiMesiIso(inizioMese(rif), 1)) / 7) : 1
  const fine = aggiungiGiorniIso(inizio, settimane * 7 - 1)

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

  const naviga = (n: number) => setRif((r) => (modo === "mese" ? aggiungiMesiIso(inizioMese(r), n) : aggiungiGiorniIso(r, 7 * n)))
  const [a, m] = (modo === "mese" ? inizioMese(rif) : inizio).split("-").map(Number)
  const titolo = modo === "mese" ? `${MESI[m - 1]} ${a}` : `${dataBreve(inizio)} – ${dataBreve(fine)}`

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Bottone variante="contorno" misura="sm" onClick={() => setRif(oggi)}>
            Oggi
          </Bottone>
          <Bottone variante="fantasma" misura="icona-sm" onClick={() => naviga(-1)} aria-label="Precedente">
            <ChevronLeft />
          </Bottone>
          <Bottone variante="fantasma" misura="icona-sm" onClick={() => naviga(1)} aria-label="Successivo">
            <ChevronRight />
          </Bottone>
          <span className="text-sm font-semibold capitalize">{titolo}</span>
          <span className="flex-1" />
          <div className="flex rounded-md border border-border p-0.5">
            {(["mese", "settimana"] as Modo[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setModo(x)}
                className={cn("rounded px-2.5 py-1 text-xs font-medium capitalize", modo === x ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {x}
              </button>
            ))}
          </div>
          <Bottone variante={senzaAperto ? "secondario" : "contorno"} misura="sm" onClick={() => setSenzaAperto((v) => !v)}>
            <Inbox /> Senza data <span className="tabular-nums text-muted-foreground">{senzaData.length}</span>
          </Bottone>
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {GIORNI_BREVI.map((g) => (
            <div key={g} className="py-1.5">
              {g}
            </div>
          ))}
        </div>
        <div className={cn(modo === "settimana" && "min-h-[60vh]")}>
          {Array.from({ length: settimane }, (_, i) => (
            <Settimana
              key={i}
              inizio={aggiungiGiorniIso(inizio, i * 7)}
              meseCorrente={modo === "mese" ? inizioMese(rif).slice(0, 7) : null}
              voci={voci}
              oggi={oggi}
              alta={modo === "settimana"}
              onApri={onApri}
              onSposta={sposta}
              coloreDi={(t) => colore(categoria(t.categoria_id)?.colore)}
              perId={perId}
            />
          ))}
        </div>
      </div>
      {senzaAperto ? (
        <aside className="w-full shrink-0 rounded-lg border border-border bg-card lg:w-72">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold">Senza data</div>
          <p className="px-3 pt-2 text-xs text-muted-foreground">Trascinale su un giorno per darle una scadenza.</p>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {senzaData.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => trascina(e, t.id, null)}
                onClick={() => onApri(t)}
                className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm hover:bg-accent/50"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", colore(categoria(t.categoria_id)?.colore).punto)} />
                <span className="min-w-0 flex-1 truncate">{t.titolo}</span>
                <GruppoAvatar ids={t.assegnatari.map((x) => x.user_id)} misura="xs" max={2} />
              </div>
            ))}
            {!senzaData.length ? <div className="px-1 py-2 text-sm text-muted-foreground">Tutte hanno una data.</div> : null}
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

  const max = alta ? 30 : RIGHE_MAX
  const visibili = posizionate.filter((p) => p.riga < max)
  const righe = Math.min(max, Math.max(0, ...posizionate.map((p) => p.riga + 1)))

  return (
    <div className="relative grid grid-cols-7 border-b border-border last:border-b-0">
      {giorni.map((g) => {
        const fuori = meseCorrente && g.slice(0, 7) !== meseCorrente
        const nascoste = posizionate.filter((p) => p.riga >= max && p.col <= giorniTraIso(inizio, g) && p.col + p.span > giorniTraIso(inizio, g))
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
              "group/giorno relative border-r border-border last:border-r-0",
              alta ? "min-h-[60vh]" : "min-h-[6.5rem]",
              (fuori || giornoSettimana(g) >= 5) && "bg-muted/25",
              sopra === g && "bg-primary/10",
            )}
            style={{ paddingTop: "1.75rem", paddingBottom: nascoste.length ? "1.5rem" : undefined }}
          >
            <div className="absolute left-1.5 right-1 top-1 flex items-center justify-between">
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                  g === oggi ? "bg-primary font-semibold text-primary-foreground" : fuori ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {Number(g.slice(8))}
                {g.slice(8) === "01" && !alta ? <span className="ml-0.5">{MESI[Number(g.slice(5, 7)) - 1].slice(0, 3)}</span> : null}
              </span>
              <CreaQui giorno={g} />
            </div>
            <div style={{ height: `${righe * 1.5}rem` }} />
            {nascoste.length ? <AltreDelGiorno giorno={g} voci={posizionate.filter((p) => p.col <= giorniTraIso(inizio, g) && p.col + p.span > giorniTraIso(inizio, g)).map((p) => p.v)} n={nascoste.length} onApri={onApri} /> : null}
          </div>
        )
      })}
      {visibili.map(({ v, col, span, riga }) => {
        const c = coloreDi(v.t)
        const fattaOra = fatta(v.t)
        const continuaPrima = v.da < inizio
        const continuaDopo = v.a > fine
        return (
          <div
            key={`${v.chiave}:${inizio}`}
            draggable={!v.fantasma}
            onDragStart={(e) => trascina(e, v.t.id, v.a)}
            onClick={() => onApri(v.t)}
            title={v.t.titolo}
            className={cn(
              "absolute flex h-[1.3rem] cursor-pointer items-center gap-1 overflow-hidden border px-1.5 text-[11px] font-medium leading-none",
              c.badge,
              continuaPrima ? "rounded-l-none border-l-0" : "rounded-l-md",
              continuaDopo ? "rounded-r-none border-r-0" : "rounded-r-md",
              v.fantasma && "border-dashed opacity-50",
              fattaOra && "opacity-60 line-through",
            )}
            style={{ left: `calc(${(col / 7) * 100}% + 3px)`, width: `calc(${(span / 7) * 100}% - 6px)`, top: `calc(1.75rem + ${riga * 1.5}rem)` }}
          >
            {v.fantasma ? <Repeat className="h-2.5 w-2.5 shrink-0" /> : null}
            <span className="truncate">{v.t.titolo}</span>
            {v.t.ora_scadenza && !v.fantasma ? <span className="ml-auto shrink-0 opacity-70">{v.t.ora_scadenza.slice(0, 5)}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

function CreaQui({ giorno }: { giorno: string }) {
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
    <Popover
      aperto={aperto}
      onCambia={setAperto}
      className="w-64"
      trigger={
        <button type="button" className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent group-hover/giorno:opacity-100 focus:opacity-100" aria-label="Nuova attività in questo giorno">
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Nuova attività per {dataBreve(giorno)}</div>
      <input
        autoFocus
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void crea()}
        placeholder="Cosa c'è da fare?"
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </Popover>
  )
}

function AltreDelGiorno({ giorno, voci, n, onApri }: { giorno: string; voci: Voce[]; n: number; onApri: (t: Task) => void }) {
  return (
    <Popover
      className="w-64"
      trigger={
        <button type="button" className="absolute bottom-1 left-1.5 rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          +{n} altre
        </button>
      }
    >
      <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{dataBreve(giorno)}</div>
      {voci.map((v) => (
        <button key={v.chiave} type="button" onClick={() => onApri(v.t)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", v.fantasma && "opacity-60")}>
          {v.fantasma ? <Repeat className="h-3 w-3 shrink-0" /> : null}
          <span className="truncate">{v.t.titolo}</span>
        </button>
      ))}
    </Popover>
  )
}
