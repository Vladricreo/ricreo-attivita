"use client"

import { AlarmClock, CalendarClock, CircleCheck, Clock, ListTodo, Target, type LucideIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { colore, GRAFICO } from "../colori"
import { AvatarPersona } from "../componenti/persone"
import { testoScadenza } from "../componenti/riga-task"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { filtra, type Filtri } from "../filtri"
import { aggiungiGiorniIso, aperta, dataBreve, fascia, giornoRoma, giorniTraIso, inizioSettimana, oggiIso, plurale, ricorrente, scaduta } from "../regole"
import type { Completamento, Task, TipoStato } from "../tipi"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

const SETTIMANE = 12

export function VistaDashboard({ filtri, onApri }: { filtri: Filtri; onApri: (t: Task) => void }) {
  const { tasks, api, me, base } = useAttivita()
  const oggi = oggiIso()
  const [completamenti, setCompletamenti] = useState<Completamento[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api
      .completamenti(`${aggiungiGiorniIso(inizioSettimana(oggi), -7 * (SETTIMANE - 1))}T00:00:00Z`)
      .then((c) => vivo && setCompletamenti(c))
      .catch((e) => vivo && setErrore(messaggioErrore(e)))
    return () => {
      vivo = false
    }
  }, [api, oggi, tasks])

  const insieme = useMemo(() => filtra(tasks ?? [], { ...filtri, completate: true }, me, { conCompletate: true }), [tasks, filtri, me])
  const ids = useMemo(() => new Set(insieme.map((t) => t.id)), [insieme])
  const aperte = useMemo(() => insieme.filter((t) => aperta(t) && fascia(t, oggi) !== "in_arrivo"), [insieme, oggi])
  const comp = useMemo(() => (completamenti ?? []).filter((c) => ids.has(c.task_id)), [completamenti, ids])

  const kpi = useMemo(() => {
    const scadute = aperte.filter((t) => scaduta(t, oggi))
    const settimana = aperte.filter((t) => t.scadenza && t.scadenza >= oggi && t.scadenza <= aggiungiGiorniIso(oggi, 7))
    const da7 = `${aggiungiGiorniIso(oggi, -6)}`
    const da14 = `${aggiungiGiorniIso(oggi, -13)}`
    const fatte7 = comp.filter((c) => giornoRoma(c.completata_at) >= da7).length
    const fattePrima = comp.filter((c) => giornoRoma(c.completata_at) >= da14 && giornoRoma(c.completata_at) < da7).length
    const da30 = aggiungiGiorniIso(oggi, -29)
    const conScadenza = comp.filter((c) => c.scadenza && giornoRoma(c.completata_at) >= da30)
    const puntuali = conScadenza.filter((c) => giornoRoma(c.completata_at) <= c.scadenza!).length
    const singole = insieme.filter((t) => t.completata_at && !ricorrente(t) && giornoRoma(t.completata_at) >= da30)
    const giorniMedi = singole.length ? singole.reduce((s, t) => s + Math.max(0, giorniTraIso(giornoRoma(t.creato_at), giornoRoma(t.completata_at!))), 0) / singole.length : null
    return {
      aperte: aperte.length,
      scadute: scadute.length,
      settimana: settimana.length,
      fatte7,
      delta: fatte7 - fattePrima,
      puntualita: conScadenza.length ? Math.round((puntuali / conScadenza.length) * 100) : null,
      nPuntualita: conScadenza.length,
      giorniMedi,
      nSingole: singole.length,
    }
  }, [aperte, comp, insieme, oggi])

  // Completate per settimana, divise per categoria (ordine fisso delle categorie).
  const settimane = useMemo(() => {
    const prima = aggiungiGiorniIso(inizioSettimana(oggi), -7 * (SETTIMANE - 1))
    const perId = new Map(insieme.map((t) => [t.id, t]))
    const col = Array.from({ length: SETTIMANE }, (_, i) => ({ da: aggiungiGiorniIso(prima, i * 7), perCategoria: new Map<string, number>(), tot: 0 }))
    for (const c of comp) {
      const i = Math.floor(giorniTraIso(prima, giornoRoma(c.completata_at)) / 7)
      if (i < 0 || i >= SETTIMANE) continue
      const cat = perId.get(c.task_id)?.categoria_id ?? c.categoria_id
      col[i].perCategoria.set(cat, (col[i].perCategoria.get(cat) ?? 0) + 1)
      col[i].tot++
    }
    return col
  }, [comp, insieme, oggi])
  const categorieUsate = (base?.categorie ?? []).filter((c) => settimane.some((s) => s.perCategoria.has(c.id)))
  const massimo = Math.max(4, ...settimane.map((s) => s.tot))
  const tacche = scala(massimo)

  // Carico per persona (aperte per tipo di stato, più le scadute).
  const TIPI: { tipo: TipoStato; label: string; colore: keyof typeof GRAFICO }[] = [
    { tipo: "aperto", label: "Da fare", colore: "slate" },
    { tipo: "attivo", label: "In corso", colore: "sky" },
    { tipo: "revisione", label: "Da rivedere", colore: "violet" },
    { tipo: "bloccato", label: "Bloccate", colore: "red" },
  ]
  const carico = useMemo(() => {
    const m = new Map<string, { id: string; per: Record<string, number>; tot: number; scadute: number }>()
    for (const t of aperte) {
      const chi = t.assegnatari.length ? t.assegnatari.map((a) => a.user_id) : ["__nessuno__"]
      for (const id of chi) {
        const r = m.get(id) ?? { id, per: {}, tot: 0, scadute: 0 }
        r.per[t.stato_tipo] = (r.per[t.stato_tipo] ?? 0) + 1
        r.tot++
        if (scaduta(t, oggi)) r.scadute++
        m.set(id, r)
      }
    }
    return [...m.values()].sort((a, b) => b.tot - a.tot)
  }, [aperte, oggi])
  const maxCarico = Math.max(1, ...carico.map((c) => c.tot))

  const vecchieScadute = useMemo(() => aperte.filter((t) => scaduta(t, oggi)).sort((a, b) => a.scadenza!.localeCompare(b.scadenza!)).slice(0, 8), [aperte, oggi])
  const ferme = useMemo(() => aperte.filter((t) => t.stato_tipo === "bloccato" || t.stato_tipo === "revisione").slice(0, 8), [aperte])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tessera icona={ListTodo} etichetta="Aperte" valore={kpi.aperte} />
        <Tessera icona={AlarmClock} etichetta="Scadute" valore={kpi.scadute} tono={kpi.scadute ? "text-red-600 dark:text-red-400" : undefined} />
        <Tessera icona={CalendarClock} etichetta="Prossimi 7 giorni" valore={kpi.settimana} />
        <Tessera
          icona={CircleCheck}
          etichetta="Fatte in 7 giorni"
          valore={kpi.fatte7}
          nota={completamenti ? `${kpi.delta >= 0 ? "+" : ""}${kpi.delta} rispetto ai 7 prima` : "…"}
        />
        <Tessera
          icona={Target}
          etichetta="Puntualità 30 giorni"
          valore={kpi.puntualita == null ? "—" : `${kpi.puntualita}%`}
          nota={kpi.nPuntualita ? `${kpi.nPuntualita} con scadenza` : "nessuna con scadenza"}
        />
        <Tessera
          icona={Clock}
          etichetta="Tempo medio"
          valore={kpi.giorniMedi == null ? "—" : `${kpi.giorniMedi.toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`}
          nota={kpi.nSingole ? `da creata a fatta, ${plurale(kpi.nSingole, "attività", "attività")}` : "nessuna fatta in 30 giorni"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="rounded-lg border border-border bg-card p-4 xl:col-span-3">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Completate per settimana</h3>
            <Legenda voci={categorieUsate.map((c) => ({ etichetta: c.nome, classe: GRAFICO[c.colore] }))} />
          </div>
          {errore ? <p className="text-sm text-destructive">{errore}</p> : null}
          <div className="flex gap-2">
            <div className="relative h-48 w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {tacche.map((v) => (
                <span key={v} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(v / tacche[tacche.length - 1]) * 100}%` }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="relative h-48 flex-1">
              {tacche.map((v) => (
                <div key={v} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: `${(v / tacche[tacche.length - 1]) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-1.5">
                {settimane.map((s) => {
                  const alto = tacche[tacche.length - 1]
                  const dettaglio = (
                    <div className="space-y-0.5">
                      <div className="font-medium">Settimana del {dataBreve(s.da)}</div>
                      {categorieUsate
                        .filter((c) => s.perCategoria.get(c.id))
                        .map((c) => (
                          <div key={c.id} className="flex justify-between gap-4">
                            <span>{c.nome}</span>
                            <span className="tabular-nums">{s.perCategoria.get(c.id)}</span>
                          </div>
                        ))}
                      <div className="flex justify-between gap-4 border-t border-background/20 pt-0.5 font-medium">
                        <span>Totale</span>
                        <span className="tabular-nums">{s.tot}</span>
                      </div>
                    </div>
                  )
                  return (
                    <Suggerimento key={s.da} testo={dettaglio}>
                      <div className="group flex h-full flex-1 cursor-default flex-col justify-end">
                        <div className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity group-hover:opacity-80" style={{ height: `${(s.tot / alto) * 100}%` }}>
                          {categorieUsate.map((c) => {
                            const n = s.perCategoria.get(c.id) ?? 0
                            return n ? <div key={c.id} className={GRAFICO[c.colore]} style={{ flexGrow: n, flexBasis: 0 }} /> : null
                          })}
                        </div>
                      </div>
                    </Suggerimento>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="ml-8 mt-1.5 flex gap-1.5 text-[10px] text-muted-foreground">
            {settimane.map((s, i) => (
              <span key={s.da} className="flex-1 truncate text-center">
                {i % 2 === SETTIMANE % 2 || i === SETTIMANE - 1 ? dataBreve(s.da) : ""}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Carico per persona</h3>
            <Legenda voci={TIPI.map((x) => ({ etichetta: x.label, classe: GRAFICO[x.colore] }))} />
          </div>
          <div className="space-y-2.5">
            {carico.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="flex w-28 shrink-0 items-center gap-1.5 truncate text-sm">
                  {c.id === "__nessuno__" ? <span className="text-muted-foreground">Nessuno</span> : <AvatarPersona id={c.id} misura="xs" conNome />}
                </span>
                <Suggerimento
                  testo={
                    <div className="space-y-0.5">
                      {TIPI.filter((x) => c.per[x.tipo]).map((x) => (
                        <div key={x.tipo} className="flex justify-between gap-4">
                          <span>{x.label}</span>
                          <span className="tabular-nums">{c.per[x.tipo]}</span>
                        </div>
                      ))}
                      {c.scadute ? <div className="text-red-300">{plurale(c.scadute, "scaduta", "scadute")}</div> : null}
                    </div>
                  }
                >
                  <div className="flex h-4 flex-1 cursor-default">
                    <div className="flex h-full gap-[2px] overflow-hidden rounded-r-[4px]" style={{ width: `${(c.tot / maxCarico) * 100}%` }}>
                      {TIPI.map((x) => (c.per[x.tipo] ? <div key={x.tipo} className={GRAFICO[x.colore]} style={{ flexGrow: c.per[x.tipo], flexBasis: 0 }} /> : null))}
                    </div>
                  </div>
                </Suggerimento>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                  {c.tot}
                  {c.scadute ? <span className="ml-1 text-red-600 dark:text-red-400">({c.scadute})</span> : null}
                </span>
              </div>
            ))}
            {!carico.length ? <p className="text-sm text-muted-foreground">Nessuna attività aperta.</p> : null}
            {carico.some((c) => c.scadute) ? <p className="pt-1 text-[11px] text-muted-foreground">Tra parentesi le scadute.</p> : null}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ElencoBreve titolo="Scadute da più tempo" vuoto="Nessuna attività scaduta." tasks={vecchieScadute} onApri={onApri} />
        <ElencoBreve titolo="Bloccate o da rivedere" vuoto="Niente di fermo." tasks={ferme} onApri={onApri} mostraStato />
      </div>
    </div>
  )
}

function scala(max: number): number[] {
  const passo = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 50) * 10
  const out: number[] = []
  for (let v = 0; v <= max + passo - 1; v += passo) out.push(v)
  return out
}

function Tessera({ icona: Icona, etichetta, valore, nota, tono }: { icona: LucideIcon; etichetta: string; valore: number | string; nota?: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icona className="h-3.5 w-3.5" /> {etichetta}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tono)}>{valore}</div>
      {nota ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{nota}</div> : null}
    </div>
  )
}

function Legenda({ voci }: { voci: { etichetta: string; classe: string }[] }) {
  if (voci.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {voci.map((v) => (
        <span key={v.etichetta} className="inline-flex items-center gap-1">
          <span className={cn("h-2.5 w-2.5 rounded-sm", v.classe)} />
          {v.etichetta}
        </span>
      ))}
    </div>
  )
}

function ElencoBreve({ titolo, vuoto, tasks, onApri, mostraStato }: { titolo: string; vuoto: string; tasks: Task[]; onApri: (t: Task) => void; mostraStato?: boolean }) {
  const { stato } = useAttivita()
  return (
    <section className="rounded-lg border border-border bg-card">
      <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold">{titolo}</h3>
      {tasks.length ? (
        tasks.map((t) => {
          const s = testoScadenza(t)
          const st = stato(t.stato_id)
          return (
            <button key={t.id} type="button" onClick={() => onApri(t)} className="flex w-full items-center gap-2 border-b border-border/60 px-4 py-2 text-left text-sm last:border-b-0 hover:bg-accent/40">
              <span className="min-w-0 flex-1 truncate">{t.titolo}</span>
              {mostraStato && st ? <span className={cn("shrink-0 text-xs", colore(st.colore).testo)}>{st.nome}</span> : null}
              {s ? <span className={cn("shrink-0 text-xs", s.tono)}>{s.testo}</span> : null}
            </button>
          )
        })
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">{vuoto}</p>
      )}
    </section>
  )
}
