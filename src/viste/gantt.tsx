"use client"

import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as PE } from "react"
import { colore } from "../colori"
import { BandierinaPriorita } from "../componenti/aspetto"
import { AvatarPersona, GruppoAvatar } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { righePrincipali, usePersistito } from "../filtri"
import {
  aggiungiGiorniIso,
  dataBreve,
  fatta,
  giornoSettimana,
  giorniTraIso,
  MESI_BREVI,
  oggiIso,
  ordinaPerPosizione,
  ordinaPerScadenza,
  progresso,
} from "../regole"
import type { Task } from "../tipi"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

type Scala = "giorni" | "settimane" | "mesi"
type GruppoGantt = "categoria" | "persona" | "nessuno"
const LARGHEZZA: Record<Scala, number> = { giorni: 34, settimane: 14, mesi: 4 }
const ALTEZZA = 36

type Riga = { tipo: "gruppo"; chiave: string; titolo: React.ReactNode; n: number } | { tipo: "task"; t: Task; livello: number; chiave: string; figli: number }

type Trascina = { id: string; modo: "sposta" | "inizio" | "fine" | "disegna"; x0: number; da: string; a: string; mosso: boolean; giorno0?: string }

export function VistaGantt({ filtrate, onApri }: { filtrate: Task[]; onApri: (t: Task) => void }) {
  const { tasks, perId, categoria, persona, azioni, ritocca, base, config } = useAttivita()
  const oggi = oggiIso()
  const [scala, setScala] = usePersistito<Scala>(`${config.app}:gantt:scala`, "giorni")
  const [gruppo, setGruppo] = usePersistito<GruppoGantt>(`${config.app}:gantt:gruppo`, "categoria")
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())
  const [anteprima, setAnteprima] = useState<Record<string, { da: string | null; a: string | null }>>({})
  const trascina = useRef<Trascina | null>(null)
  const scorri = useRef<HTMLDivElement>(null)
  const w = LARGHEZZA[scala]
  const tutte = tasks ?? []

  const date = (t: Task) => {
    const p = anteprima[t.id]
    const a = p ? p.a : t.scadenza
    const d = p ? p.da : t.data_inizio
    if (!a && !d) return null
    const fine = a ?? d!
    return { da: d && d <= fine ? d : fine, a: fine }
  }

  const sottotaskDi = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tutte) if (t.padre_id && !t.eliminata_at) m.set(t.padre_id, [...(m.get(t.padre_id) ?? []), t])
    for (const l of m.values()) l.sort(ordinaPerPosizione)
    return m
  }, [tutte])

  const principali = useMemo(() => righePrincipali(filtrate).sort((a, b) => (a.data_inizio ?? a.scadenza ?? "9999").localeCompare(b.data_inizio ?? b.scadenza ?? "9999") || ordinaPerScadenza(a, b)), [filtrate])

  const righe = useMemo<Riga[]>(() => {
    const out: Riga[] = []
    const aggiungi = (t: Task, chiaveGruppo: string) => {
      const figli = t.padre_id ? [] : (sottotaskDi.get(t.id) ?? [])
      out.push({ tipo: "task", t, livello: 0, chiave: `${chiaveGruppo}:${t.id}`, figli: figli.length })
      if (!chiusi.has(t.id)) for (const s of figli) out.push({ tipo: "task", t: s, livello: 1, chiave: `${chiaveGruppo}:${s.id}`, figli: 0 })
    }
    if (gruppo === "nessuno") {
      principali.forEach((t) => aggiungi(t, "tutte"))
      return out
    }
    const gruppi = new Map<string, Task[]>()
    for (const t of principali) {
      const chiavi = gruppo === "categoria" ? [t.categoria_id] : t.assegnatari.length ? t.assegnatari.map((a) => a.user_id) : ["__nessuno__"]
      for (const k of chiavi) gruppi.set(k, [...(gruppi.get(k) ?? []), t])
    }
    const ordineGruppi =
      gruppo === "categoria"
        ? (base?.categorie ?? []).map((c) => c.id).filter((id) => gruppi.has(id))
        : [...gruppi.keys()].sort((a, b) => (a === "__nessuno__" ? 1 : b === "__nessuno__" ? -1 : (persona(a)?.nome ?? "").localeCompare(persona(b)?.nome ?? "")))
    for (const k of ordineGruppi) {
      const lista = gruppi.get(k)!
      const c = gruppo === "categoria" ? categoria(k) : null
      out.push({
        tipo: "gruppo",
        chiave: `g:${k}`,
        n: lista.length,
        titolo:
          gruppo === "categoria" ? (
            <span className={cn("inline-flex items-center gap-1.5", colore(c?.colore).testo)}>
              <span className={cn("h-2 w-2 rounded-full", colore(c?.colore).punto)} />
              {c?.nome ?? k}
            </span>
          ) : k === "__nessuno__" ? (
            "Senza assegnatario"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <AvatarPersona id={k} misura="xs" />
              {persona(k)?.nome ?? "Persona"}
            </span>
          ),
      })
      if (!chiusi.has(`g:${k}`)) lista.forEach((t) => aggiungi(t, k))
    }
    return out
  }, [principali, gruppo, sottotaskDi, chiusi, base?.categorie, categoria, persona])

  // Periodo: dalle date presenti (con margine) e almeno da una settimana fa a due mesi avanti.
  const { origine, giorni } = useMemo(() => {
    let min = aggiungiGiorniIso(oggi, -14)
    let max = aggiungiGiorniIso(oggi, scala === "mesi" ? 365 : scala === "settimane" ? 120 : 60)
    for (const r of righe) {
      if (r.tipo !== "task") continue
      const d = date(r.t)
      if (!d) continue
      if (d.da < min) min = d.da
      if (d.a > max) max = d.a
    }
    const origine = aggiungiGiorniIso(min, -7 - giornoSettimana(min))
    return { origine, giorni: giorniTraIso(origine, max) + 21 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe, oggi, scala])

  // All'apertura e al cambio di scala: oggi un po' a sinistra.
  useLayoutEffect(() => {
    const el = scorri.current
    if (el) el.scrollLeft = Math.max(0, giorniTraIso(origine, oggi) * w - 120)
  }, [scala]) // eslint-disable-line react-hooks/exhaustive-deps

  const x = (iso: string) => giorniTraIso(origine, iso) * w
  const giornoDa = (clientX: number, el: HTMLElement) => aggiungiGiorniIso(origine, Math.floor((clientX - el.getBoundingClientRect().left) / w))

  // Trascinamento delle barre (sposta, allunga a sinistra/destra) e disegno su righe senza date.
  const giu = (e: PE<HTMLElement>, t: Task, modo: Trascina["modo"]) => {
    if (e.button !== 0) return
    // Su touch niente trascinamento (il dito scorre la timeline): resta solo il tocco sulla barra, che apre l'attività
    const tocco = e.pointerType === "touch"
    if (tocco && modo !== "sposta") return
    e.stopPropagation()
    const d = date(t)
    const riga = (e.currentTarget.closest("[data-riga]") as HTMLElement) ?? e.currentTarget
    const g0 = giornoDa(e.clientX, riga)
    trascina.current = { id: t.id, modo, x0: e.clientX, da: d?.da ?? g0, a: d?.a ?? g0, mosso: false, giorno0: g0 }
    if (!tocco) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const muovi = (e: PE<HTMLElement>) => {
    const s = trascina.current
    if (!s || e.pointerType === "touch") return
    const delta = Math.round((e.clientX - s.x0) / w)
    if (!delta && !s.mosso) return
    s.mosso = true
    let da = s.da
    let a = s.a
    if (s.modo === "sposta") {
      da = aggiungiGiorniIso(s.da, delta)
      a = aggiungiGiorniIso(s.a, delta)
    } else if (s.modo === "inizio") {
      da = aggiungiGiorniIso(s.da, delta)
      if (da > a) da = a
    } else if (s.modo === "fine") {
      a = aggiungiGiorniIso(s.a, delta)
      if (a < da) a = da
    } else {
      const g = aggiungiGiorniIso(s.giorno0!, delta)
      da = g < s.giorno0! ? g : s.giorno0!
      a = g < s.giorno0! ? s.giorno0! : g
    }
    setAnteprima((p) => ({ ...p, [s.id]: { da: da === a && s.modo !== "disegna" && !perId.get(s.id)?.data_inizio ? null : da, a } }))
  }
  const su = (t: Task) => {
    const s = trascina.current
    trascina.current = null
    if (!s || s.id !== t.id) return
    if (!s.mosso) {
      if (s.modo !== "disegna") onApri(t)
      return
    }
    const p = anteprima[s.id]
    setAnteprima((x) => {
      const { [s.id]: _, ...resto } = x
      return resto
    })
    if (!p) return
    const patch = { data_inizio: p.da && p.da !== p.a ? p.da : t.data_inizio && p.da ? p.da : null, scadenza: p.a }
    if (patch.data_inizio === t.data_inizio && patch.scadenza === t.scadenza) return
    ritocca(t.id, patch)
    void azioni.aggiorna(t.id, patch)
  }

  // Frecce: dipendenze e sottotask in sequenza.
  const frecce = useMemo(() => {
    const indice = new Map<string, number>()
    righe.forEach((r, i) => r.tipo === "task" && !indice.has(r.t.id) && indice.set(r.t.id, i))
    const out: { da: string; a: string }[] = []
    for (const r of righe) {
      if (r.tipo !== "task") continue
      for (const dep of r.t.dipende_da) if (indice.has(dep)) out.push({ da: dep, a: r.t.id })
      if (r.t.padre_id && perId.get(r.t.padre_id)?.in_sequenza) {
        const fratelli = sottotaskDi.get(r.t.padre_id) ?? []
        const i = fratelli.findIndex((f) => f.id === r.t.id)
        if (i > 0 && indice.has(fratelli[i - 1].id)) out.push({ da: fratelli[i - 1].id, a: r.t.id })
      }
    }
    return out
      .map((f) => {
        const ta = perId.get(f.da)
        const tb = perId.get(f.a)
        const da = ta && date(ta)
        const db = tb && date(tb)
        if (!da || !db) return null
        const x1 = x(da.a) + w
        const y1 = indice.get(f.da)! * ALTEZZA + ALTEZZA / 2
        const x2 = x(db.da)
        const y2 = indice.get(f.a)! * ALTEZZA + ALTEZZA / 2
        const ritardo = db.da <= da.a
        return { chiave: `${f.da}>${f.a}`, d: `M ${x1} ${y1} C ${x1 + 16} ${y1}, ${x2 - 16} ${y2}, ${x2} ${y2}`, ritardo }
      })
      .filter(Boolean) as { chiave: string; d: string; ritardo: boolean }[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe, perId, sottotaskDi, anteprima, origine, w])

  const intestazione = useMemo(() => {
    const mesi: { da: number; n: number; etichetta: string }[] = []
    const celle: { i: number; etichetta: string; weekend: boolean; oggi: boolean; inizioSettimana: boolean }[] = []
    for (let i = 0; i < giorni; i++) {
      const d = aggiungiGiorniIso(origine, i)
      const [a, m, g] = d.split("-").map(Number)
      const ultimo = mesi[mesi.length - 1]
      const et = `${MESI_BREVI[m - 1]} ${a}`
      if (!ultimo || ultimo.etichetta !== et) mesi.push({ da: i, n: 1, etichetta: et })
      else ultimo.n++
      celle.push({ i, etichetta: String(g), weekend: giornoSettimana(d) >= 5, oggi: d === oggi, inizioSettimana: giornoSettimana(d) === 0 })
    }
    return { mesi, celle }
  }, [origine, giorni, oggi])

  // Gesto interrotto (es. il browser prende lo scorrimento): via lo stato del trascinamento
  const annulla = () => {
    trascina.current = null
    setAnteprima({})
  }

  useEffect(() => {
    const fine = () => {
      if (trascina.current) {
        trascina.current = null
        setAnteprima({})
      }
    }
    window.addEventListener("blur", fine)
    return () => window.removeEventListener("blur", fine)
  }, [])

  const larghezzaTotale = giorni * w

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">Raggruppa</span>
        <Interruttori valore={gruppo} onCambia={setGruppo} voci={[["categoria", "Categoria"], ["persona", "Persona"], ["nessuno", "Nessuno"]]} />
        <span className="flex-1" />
        <Interruttori valore={scala} onCambia={setScala} voci={[["giorni", "Giorni"], ["settimane", "Settimane"], ["mesi", "Mesi"]]} />
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent"
          onClick={() => scorri.current?.scrollTo({ left: Math.max(0, x(oggi) - 120), behavior: "smooth" })}
        >
          Oggi
        </button>
      </div>
      <div className="flex max-h-[70vh] overflow-auto" ref={scorri}>
        {/* Colonna nomi (fissa a sinistra) */}
        <div className="sticky left-0 z-20 w-40 shrink-0 border-r border-border bg-card sm:w-72">
          <div className="sticky top-0 z-10 h-12 border-b border-border bg-muted/40" />
          {righe.map((r) =>
            r.tipo === "gruppo" ? (
              <button
                key={r.chiave}
                type="button"
                onClick={() => setChiusi((c) => toggle(c, r.chiave))}
                className="flex w-full items-center gap-1.5 border-b border-border bg-muted/30 px-2 text-left text-xs font-semibold"
                style={{ height: ALTEZZA }}
              >
                {chiusi.has(r.chiave) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span className="min-w-0 truncate">{r.titolo}</span>
                <span className="ml-auto text-muted-foreground">{r.n}</span>
              </button>
            ) : (
              <div key={r.chiave} className="flex items-center gap-1.5 border-b border-border/60 px-2 text-sm" style={{ height: ALTEZZA, paddingLeft: r.livello ? 24 : 8 }}>
                {r.figli ? (
                  <button type="button" onClick={() => setChiusi((c) => toggle(c, r.t.id))} className="rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label="Sottotask">
                    {chiusi.has(r.t.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                ) : r.livello ? (
                  <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                ) : (
                  <span className="w-4" />
                )}
                <button type="button" onClick={() => onApri(r.t)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", fatta(r.t) && "text-muted-foreground line-through")}>
                  {r.t.titolo}
                </button>
                <BandierinaPriorita priorita={r.t.priorita} className="hidden h-3 w-3 sm:block" />
                <span className="hidden sm:block">
                  <GruppoAvatar ids={r.t.assegnatari.map((a) => a.user_id)} misura="xs" max={2} />
                </span>
              </div>
            ),
          )}
          {!righe.length ? <div className="p-4 text-sm text-muted-foreground">Nessuna attività con questi filtri.</div> : null}
        </div>

        {/* Linea del tempo */}
        <div className="relative shrink-0" style={{ width: larghezzaTotale }}>
          <div className="sticky top-0 z-10 h-12 border-b border-border bg-muted/40 backdrop-blur">
            <div className="relative h-6 border-b border-border/60">
              {intestazione.mesi.map((m) => (
                <div key={m.etichetta} className="absolute top-0 flex h-6 items-center truncate border-l border-border/60 px-1.5 text-[11px] font-semibold capitalize text-muted-foreground" style={{ left: m.da * w, width: m.n * w }}>
                  {m.etichetta}
                </div>
              ))}
            </div>
            <div className="relative h-6">
              {intestazione.celle.map((c) =>
                scala === "giorni" || (scala === "settimane" && c.inizioSettimana) ? (
                  <div
                    key={c.i}
                    className={cn("absolute top-0 flex h-6 items-center justify-center text-[10px] tabular-nums", c.oggi ? "font-bold text-primary" : c.weekend ? "text-muted-foreground/60" : "text-muted-foreground")}
                    style={{ left: c.i * w, width: scala === "giorni" ? w : 7 * w }}
                  >
                    {c.etichetta}
                  </div>
                ) : null,
              )}
            </div>
          </div>
          {/* Sfondo: weekend e oggi */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-12">
            {scala !== "mesi"
              ? intestazione.celle.map((c) => (c.weekend ? <div key={c.i} className="absolute inset-y-0 bg-muted/40" style={{ left: c.i * w, width: w }} /> : null))
              : intestazione.mesi.map((m) => <div key={m.etichetta} className="absolute inset-y-0 border-l border-border/60" style={{ left: m.da * w }} />)}
            <div className="absolute inset-y-0 w-0.5 bg-primary/70" style={{ left: x(oggi) + w / 2 }} />
          </div>
          <div className="relative">
            {righe.map((r) => {
              if (r.tipo === "gruppo") return <div key={r.chiave} className="border-b border-border bg-muted/20" style={{ height: ALTEZZA }} />
              const t = r.t
              const d = date(t)
              const c = colore(categoria(t.categoria_id)?.colore)
              const p = progresso(t)
              return (
                <div
                  key={r.chiave}
                  data-riga
                  className="group/riga relative border-b border-border/40"
                  style={{ height: ALTEZZA }}
                  onPointerDown={(e) => !d && giu(e, t, "disegna")}
                  onPointerMove={muovi}
                  onPointerUp={() => su(t)}
                  onPointerCancel={annulla}
                >
                  {d ? (
                    <Suggerimento testo={`${t.titolo} · ${d.da === d.a ? dataBreve(d.a) : `${dataBreve(d.da)} → ${dataBreve(d.a)}`}`}>
                      <div
                        onPointerDown={(e) => giu(e, t, "sposta")}
                        onPointerMove={muovi}
                        onPointerUp={() => su(t)}
                        onPointerCancel={annulla}
                        className={cn(
                          "absolute top-1.5 flex cursor-grab select-none [@media(pointer:fine)]:touch-none items-center overflow-hidden rounded-md text-[11px] font-medium text-white shadow-sm active:cursor-grabbing",
                          c.barra,
                          fatta(t) && "opacity-50",
                          r.livello && "top-2.5 h-4",
                        )}
                        style={{ left: x(d.da) + 1, width: Math.max(w - 2, (giorniTraIso(d.da, d.a) + 1) * w - 2), height: r.livello ? 16 : ALTEZZA - 12 }}
                      >
                        {p != null ? <div className="absolute inset-y-0 left-0 bg-black/15" style={{ width: `${p * 100}%` }} /> : null}
                        <span onPointerDown={(e) => giu(e, t, "inizio")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" />
                        <span className="relative truncate px-2">{scala !== "mesi" ? t.titolo : ""}</span>
                        <span onPointerDown={(e) => giu(e, t, "fine")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" />
                      </div>
                    </Suggerimento>
                  ) : (
                    <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-muted-foreground/0 group-hover/riga:text-muted-foreground/70" style={{ left: x(oggi) + 4 }}>
                      Trascina per dare le date
                    </div>
                  )}
                </div>
              )
            })}
            <svg className="pointer-events-none absolute inset-0" width={larghezzaTotale} height={righe.length * ALTEZZA}>
              <defs>
                <marker id="freccia-gantt" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
                </marker>
              </defs>
              {frecce.map((f) => (
                <path key={f.chiave} d={f.d} fill="none" strokeWidth={1.5} markerEnd="url(#freccia-gantt)" className={f.ritardo ? "stroke-red-500" : "stroke-muted-foreground/70"} />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function toggle(s: Set<string>, k: string) {
  const n = new Set(s)
  if (n.has(k)) n.delete(k)
  else n.add(k)
  return n
}

function Interruttori<T extends string>({ valore, onCambia, voci }: { valore: T; onCambia: (v: T) => void; voci: [T, string][] }) {
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {voci.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onCambia(v)} className={cn("rounded px-2 py-0.5 font-medium", valore === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {l}
        </button>
      ))}
    </div>
  )
}
