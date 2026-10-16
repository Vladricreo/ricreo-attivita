"use client"

import {
  Archive,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Columns3,
  Flag,
  Inbox,
  Layers,
  LayoutList,
  LoaderCircle,
  Lock,
  Pin,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  SquareKanban,
  Tag,
  Tags,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { colore } from "./colori"
import { useNotificheApp } from "./componenti/notifiche"
import { NuovaAttivita } from "./componenti/nuova-attivita"
import { AvatarPersona } from "./componenti/persone"
import { useAttivita, useRichiedi } from "./contesto"
import { PannelloTask } from "./dettaglio/pannello"
import { filtra, FILTRI_VUOTI, filtriValidi, quantiFiltri, usePersistito, type Filtri } from "./filtri"
import { aggiungiGiorniIso, eAdmin, eManager, fascia, fatta, oggiIso, ORDINE_PRIORITA, PRIORITA } from "./regole"
import type { Task, VistaIniziale } from "./tipi"
import { avviso } from "./ui/avvisi"
import { Bottone } from "./ui/bottone"
import { Interruttore } from "./ui/campi"
import { cn } from "./ui/cn"
import { Menu, MenuEtichetta, MenuSeparatore, MenuSpunta } from "./ui/menu"
import { Popover } from "./ui/popover"
import { VistaArchivio } from "./viste/archivio"
import { COLONNE_BACHECA, VistaBacheca, type ColonneBacheca } from "./viste/bacheca"
import { VistaCalendario } from "./viste/calendario"
import { VistaDashboard } from "./viste/dashboard"
import { VistaGantt } from "./viste/gantt"
import { VistaImpostazioni } from "./viste/impostazioni"
import { VistaInbox } from "./viste/inbox"
import { RAGGRUPPAMENTI, VistaLista, type Raggruppa } from "./viste/lista"

type Vista = "lista" | "bacheca" | "calendario" | "gantt" | "dashboard" | "inbox" | "archivio" | "impostazioni"
const VISTE: { id: Vista; label: string; icona: LucideIcon; secondaria?: boolean }[] = [
  { id: "lista", label: "Lista", icona: LayoutList },
  { id: "bacheca", label: "Bacheca", icona: SquareKanban },
  { id: "calendario", label: "Calendario", icona: CalendarDays },
  { id: "gantt", label: "Gantt", icona: ChartGantt },
  { id: "dashboard", label: "Dashboard", icona: ChartColumn },
  { id: "inbox", label: "Inbox", icona: Inbox, secondaria: true },
  { id: "archivio", label: "Archivio", icona: Archive, secondaria: true },
  { id: "impostazioni", label: "Impostazioni", icona: Settings2, secondaria: true },
]
const eVista = (v: unknown): v is Vista => VISTE.some((x) => x.id === v)
const etichettaVista = (v: Vista) => VISTE.find((x) => x.id === v)?.label ?? v

/**
 * Pagina Attività completa (la stessa in tutte le app). L'attività aperta e la vista stanno
 * nell'indirizzo (?task=…&vista=…), così i link delle notifiche aprono il punto giusto.
 * Senza ?vista si apre la vista iniziale scelta dalla persona (salvata nel database, vale in tutte
 * le app) o, se non l'ha scelta, l'ultima usata in quest'app.
 */
export function PaginaAttivita(props: { titolo?: string; descrizione?: string; azioni?: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Interna {...props} />
    </Suspense>
  )
}

function Interna({ titolo = "Attività", descrizione, azioni: azioniExtra }: { titolo?: string; descrizione?: string; azioni?: ReactNode }) {
  useRichiedi("tasks", "notifiche")
  const { tasks, base, errore, me, persona, config, registraApertura, ricarica, salvaPreferenze } = useAttivita()
  const parametri = useSearchParams()
  const percorso = usePathname()
  const [vistaSalvata, setVistaSalvata] = usePersistito<Vista>(`${config.app}:vista`, "lista", eVista)
  const [filtri, setFiltri] = usePersistito<Filtri>(`${config.app}:filtri`, FILTRI_VUOTI, filtriValidi)
  const [raggruppa, setRaggruppa] = usePersistito<Raggruppa>(`${config.app}:raggruppa`, "fascia")
  const [colonne, setColonne] = usePersistito<ColonneBacheca>(`${config.app}:colonne`, "stato")
  const [scelta, setScelta] = useState<Vista | null>(null)
  const [nuova, setNuova] = useState(false)
  const { tutte: notifiche } = useNotificheApp()

  const vistaUrl = parametri.get("vista")
  const iniziale = base?.preferenze.vista_iniziale ?? null
  const vista: Vista = eVista(vistaUrl) ? vistaUrl : (scelta ?? iniziale ?? vistaSalvata)
  // Finché le preferenze non arrivano non si sa con che vista aprire: nessuna scheda evidenziata.
  const vistaNota = !!base || !!errore || eVista(vistaUrl) || !!scelta
  const aperta = parametri.get("task")

  // Solo l'indirizzo nel browser (Next aggiorna useSearchParams): niente giro sul server a ogni vista o attività aperta.
  const impostaUrl = useCallback(
    (cambi: Record<string, string | null>) => {
      const p = new URLSearchParams(window.location.search)
      for (const [k, v] of Object.entries(cambi)) {
        if (v == null) p.delete(k)
        else p.set(k, v)
      }
      const q = p.toString()
      const url = `${percorso}${q ? `?${q}` : ""}`
      if ("task" in cambi && cambi.task && !parametri.get("task")) window.history.pushState(null, "", url)
      else window.history.replaceState(null, "", url)
    },
    [parametri, percorso],
  )
  const apri = useCallback((id: string) => impostaUrl({ task: id }), [impostaUrl])
  const apriTask = useCallback((t: Task) => apri(t.id), [apri])
  const cambiaVista = (v: Vista) => {
    setScelta(v)
    setVistaSalvata(v)
    impostaUrl({ vista: null })
  }
  const scegliIniziale = async (v: VistaIniziale | null) => {
    if (v) cambiaVista(v)
    if (await salvaPreferenze({ vista_iniziale: v }))
      avviso.ok(v ? `Attività si aprirà in ${etichettaVista(v)}, in tutte le app` : "Attività si aprirà nell'ultima vista usata")
  }

  useEffect(() => {
    registraApertura(apri)
    return () => registraApertura(null)
  }, [apri, registraApertura])

  // "n" = nuova attività (fuori dai campi di testo).
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      e.preventDefault()
      setNuova(true)
    }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [])

  const oggi = oggiIso()
  const filtrate = useMemo(() => filtra(tasks ?? [], filtri, me, { conCompletate: vista === "bacheca" || vista === "calendario" || vista === "gantt" }), [tasks, filtri, me, vista])

  const conteggi = useMemo(() => {
    const mie = filtra(tasks ?? [], { ...FILTRI_VUOTI, persona: filtri.persona }, me).filter((t) => !fatta(t))
    return {
      scadute: mie.filter((t) => fascia(t, oggi) === "scadute").length,
      oggi: mie.filter((t) => fascia(t, oggi) === "oggi").length,
      settimana: mie.filter((t) => t.scadenza && t.scadenza > oggi && t.scadenza <= aggiungiGiorniIso(oggi, 7) && fascia(t, oggi) !== "in_arrivo").length,
      nonLette: (tasks ?? []).filter((t) => t.n_non_letti > 0 && !t.eliminata_at).length,
    }
  }, [tasks, filtri.persona, me, oggi])
  const notificheNonLette = notifiche.filter((n) => !n.letta_at).length

  const io = persona(me)
  const vedeTutto = eAdmin(io)
  const segue = eManager(io) && (base?.manager ?? []).some((m) => m.manager_id === me)

  const sceltePersona: { id: string; label: string }[] = [
    { id: "mie", label: "Le mie" },
    { id: "seguo", label: "Che seguo" },
    { id: "da_me", label: "Assegnate da me" },
    { id: "tutte", label: vedeTutto ? "Tutte" : segue ? "Mie e del mio team" : "Tutte quelle che vedo" },
    { id: "nessuno", label: "Senza assegnatario" },
  ]
  const etichettaPersona = sceltePersona.find((s) => s.id === filtri.persona)?.label ?? persona(filtri.persona)?.nome ?? "Persona"

  const filtroAttivo = (cosa: keyof Pick<Filtri, "categorie" | "sottocategorie" | "priorita" | "stati">, v: string) => (filtri[cosa] as string[]).includes(v)
  const toggleFiltro = (cosa: keyof Pick<Filtri, "categorie" | "sottocategorie" | "priorita" | "stati">, v: string) =>
    setFiltri((f) => ({ ...f, [cosa]: (f[cosa] as string[]).includes(v) ? (f[cosa] as string[]).filter((x) => x !== v) : [...(f[cosa] as string[]), v] }))

  const nFiltri = quantiFiltri(filtri)
  const azzera = () => setFiltri((f) => ({ ...FILTRI_VUOTI, persona: f.persona, testo: f.testo }))
  const sottocategorie = (base?.sottocategorie ?? []).filter((s) => !s.archiviata_at && (!filtri.categorie.length || filtri.categorie.includes(s.categoria_id)))

  // Filtri attivi come chip da togliere sotto la barra.
  const chipAttivi: { chiave: string; gruppo: string; label: string; punto?: string; togli: () => void }[] = [
    ...filtri.categorie.map((id) => {
      const c = base?.categorie.find((x) => x.id === id)
      return { chiave: `c:${id}`, gruppo: "Categoria", label: c?.nome ?? id, punto: colore(c?.colore).punto, togli: () => toggleFiltro("categorie", id) }
    }),
    ...filtri.sottocategorie.map((id) => {
      const s = base?.sottocategorie.find((x) => x.id === id)
      return { chiave: `s:${id}`, gruppo: "Sottocategoria", label: s?.nome ?? id, punto: colore(s?.colore).punto, togli: () => toggleFiltro("sottocategorie", id) }
    }),
    ...filtri.priorita.map((p) => ({ chiave: `p:${p}`, gruppo: "Priorità", label: PRIORITA[p].label, punto: PRIORITA[p].punto, togli: () => toggleFiltro("priorita", p) })),
    ...filtri.stati.map((id) => {
      const s = base?.stati.find((x) => x.id === id)
      return { chiave: `st:${id}`, gruppo: "Stato", label: s?.nome ?? id, punto: colore(s?.colore).punto, togli: () => toggleFiltro("stati", id) }
    }),
    ...(filtri.personali !== "tutte"
      ? [{ chiave: "pers", gruppo: "Personali", label: filtri.personali === "solo" ? "Solo personali" : "Nascoste", togli: () => setFiltri((f) => ({ ...f, personali: "tutte" as const })) }]
      : []),
    ...(filtri.completate ? [{ chiave: "compl", gruppo: "Completate", label: "Mostrate", togli: () => setFiltri((f) => ({ ...f, completate: false })) }] : []),
  ]

  const principali = VISTE.filter((v) => !v.secondaria)
  const secondarie = VISTE.filter((v) => v.secondaria)
  const conFiltri = vista !== "inbox" && vista !== "impostazioni"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titolo}</h1>
          <p className="text-sm text-muted-foreground">{descrizione ?? "Le cose da fare di tutto il team, in tutte le app Ricreo."}</p>
        </div>
        <div className="flex items-center gap-2">
          {azioniExtra}
          <Bottone onClick={() => setNuova(true)}>
            <Plus /> Nuova attività
          </Bottone>
        </div>
      </div>

      {/* Viste */}
      <div className="relative -mx-4 flex items-center gap-1 overflow-x-auto border-b [scrollbar-width:none] border-border px-4 sm:mx-0 sm:px-0">
        {principali.map((v) => (
          <SchedaVista key={v.id} v={v} attiva={vistaNota && vista === v.id} onClick={() => cambiaVista(v.id)} />
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        {secondarie.map((v) => (
          <SchedaVista key={v.id} v={v} attiva={vistaNota && vista === v.id} onClick={() => cambiaVista(v.id)} conteggio={v.id === "inbox" ? notificheNonLette : undefined} soloIcona={v.id === "impostazioni"} />
        ))}
        {base ? (
          <Menu
            trigger={
              <button
                type="button"
                title="Vista con cui si apre Attività, in tutte le app"
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pin className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{iniziale ? `Si apre in: ${etichettaVista(iniziale)}` : "Vista iniziale"}</span>
              </button>
            }
          >
            <MenuEtichetta>Apri sempre Attività in (tutte le app)</MenuEtichetta>
            {principali.map((v) => (
              <MenuSpunta key={v.id} attiva={iniziale === v.id} onCambia={() => void scegliIniziale(v.id as VistaIniziale)}>
                <v.icona className="h-4 w-4 text-muted-foreground" /> {v.label}
              </MenuSpunta>
            ))}
            <MenuSeparatore />
            <MenuSpunta attiva={!iniziale} onCambia={() => void scegliIniziale(null)}>
              L&apos;ultima che ho usato
            </MenuSpunta>
          </Menu>
        ) : null}
      </div>

      {conFiltri ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative w-full min-w-0 lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filtri.testo}
                onChange={(e) => setFiltri((f) => ({ ...f, testo: e.target.value }))}
                placeholder="Cerca per titolo o descrizione…"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
              />
              {filtri.testo ? (
                <button
                  type="button"
                  onClick={() => setFiltri((f) => ({ ...f, testo: "" }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Svuota"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className="grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:flex-wrap sm:items-center lg:shrink-0 lg:flex-nowrap">
              <Menu
                allinea="start"
                trigger={
                  <Bottone variante="contorno" className="w-full min-w-0 rounded-lg sm:w-auto">
                    {filtri.persona !== "mie" && persona(filtri.persona) ? <AvatarPersona id={filtri.persona} misura="xs" /> : <Users className="text-muted-foreground" />}
                    <span className="min-w-0 truncate sm:max-w-[10rem]">{etichettaPersona}</span>
                    <ChevronDown className="hidden opacity-50 sm:block" />
                  </Bottone>
                }
              >
                <MenuEtichetta>Quali attività</MenuEtichetta>
                {sceltePersona.map((s) => (
                  <MenuSpunta key={s.id} attiva={filtri.persona === s.id} onCambia={() => setFiltri((f) => ({ ...f, persona: s.id }))}>
                    {s.label}
                  </MenuSpunta>
                ))}
                {vedeTutto || segue ? (
                  <>
                    <MenuSeparatore />
                    <MenuEtichetta>Di una persona</MenuEtichetta>
                    {(base?.persone ?? [])
                      .filter((p) => p.attivo && p.auth_id !== me && (vedeTutto || base?.manager.some((m) => m.manager_id === me && m.persona_id === p.auth_id)))
                      .map((p) => (
                        <MenuSpunta key={p.auth_id} attiva={filtri.persona === p.auth_id} onCambia={() => setFiltri((f) => ({ ...f, persona: p.auth_id }))}>
                          <AvatarPersona id={p.auth_id} misura="xs" /> {p.nome}
                        </MenuSpunta>
                      ))}
                  </>
                ) : null}
              </Menu>
              <Popover
                className="w-[22rem] p-0"
                trigger={
                  <Bottone variante="contorno" className={cn("w-full min-w-0 rounded-lg sm:w-auto", nFiltri > 0 && "border-primary/50 bg-primary/5")}>
                    <SlidersHorizontal className={nFiltri ? "text-primary" : "text-muted-foreground"} />
                    Filtri
                    {nFiltri ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{nFiltri}</span> : null}
                  </Bottone>
                }
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-sm font-semibold">Filtri</span>
                  {nFiltri ? (
                    <button type="button" onClick={azzera} className="text-xs font-medium text-primary hover:underline">
                      Azzera tutto
                    </button>
                  ) : null}
                </div>
                <div className="divide-y divide-border">
                  <GruppoFiltro titolo="Categoria" icona={Tag}>
                    {(base?.categorie ?? [])
                      .filter((c) => c.attiva)
                      .map((c) => (
                        <Pillola key={c.id} attiva={filtroAttivo("categorie", c.id)} onClick={() => toggleFiltro("categorie", c.id)} punto={colore(c.colore).punto}>
                          {c.nome}
                        </Pillola>
                      ))}
                  </GruppoFiltro>
                  {sottocategorie.length ? (
                    <GruppoFiltro titolo="Sottocategoria" icona={Tags}>
                      {sottocategorie.map((s) => (
                        <Pillola key={s.id} attiva={filtroAttivo("sottocategorie", s.id)} onClick={() => toggleFiltro("sottocategorie", s.id)} punto={colore(s.colore).punto}>
                          {s.nome}
                        </Pillola>
                      ))}
                    </GruppoFiltro>
                  ) : null}
                  <GruppoFiltro titolo="Priorità" icona={Flag}>
                    {ORDINE_PRIORITA.map((p) => (
                      <Pillola key={p} attiva={filtroAttivo("priorita", p)} onClick={() => toggleFiltro("priorita", p)} punto={PRIORITA[p].punto}>
                        {PRIORITA[p].label}
                      </Pillola>
                    ))}
                  </GruppoFiltro>
                  <GruppoFiltro titolo="Stato" icona={CircleDot}>
                    {(base?.stati ?? []).map((s) => (
                      <Pillola key={s.id} attiva={filtroAttivo("stati", s.id)} onClick={() => toggleFiltro("stati", s.id)} punto={colore(s.colore).punto}>
                        {s.nome}
                      </Pillola>
                    ))}
                  </GruppoFiltro>
                  <GruppoFiltro titolo="Attività personali" icona={Lock}>
                    <div className="grid w-full grid-cols-3 rounded-lg bg-muted p-0.5">
                      {SCELTE_PERSONALI.map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFiltri((f) => ({ ...f, personali: k }))}
                          className={cn(
                            "h-7 truncate rounded-md px-2 text-xs font-medium transition-colors",
                            filtri.personali === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </GruppoFiltro>
                  {vista === "lista" || vista === "dashboard" ? (
                    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="flex items-center gap-2">
                        <CircleCheck className="h-4 w-4 text-muted-foreground" /> Mostra anche le completate
                      </span>
                      <Interruttore attivo={filtri.completate} onCambia={(v) => setFiltri((f) => ({ ...f, completate: v }))} />
                    </label>
                  ) : null}
                </div>
              </Popover>
              {vista === "lista" ? (
                <Menu
                  allinea="start"
                  trigger={
                    <Bottone variante="contorno" className="w-full min-w-0 rounded-lg sm:w-auto">
                      <Layers className="text-muted-foreground" />
                      <span className="hidden text-muted-foreground sm:inline">Raggruppa:</span>
                      <span className="min-w-0 truncate">{RAGGRUPPAMENTI.find((r) => r.id === raggruppa)?.label}</span>
                      <ChevronDown className="hidden opacity-50 sm:block" />
                    </Bottone>
                  }
                >
                  <MenuEtichetta>Raggruppa per</MenuEtichetta>
                  {RAGGRUPPAMENTI.map((r) => (
                    <MenuSpunta key={r.id} attiva={raggruppa === r.id} onCambia={() => setRaggruppa(r.id)}>
                      {r.label}
                    </MenuSpunta>
                  ))}
                </Menu>
              ) : null}
              {vista === "bacheca" ? (
                <Menu
                  allinea="start"
                  trigger={
                    <Bottone variante="contorno" className="w-full min-w-0 rounded-lg sm:w-auto">
                      <Columns3 className="text-muted-foreground" />
                      <span className="hidden text-muted-foreground sm:inline">Colonne:</span>
                      <span className="min-w-0 truncate">{COLONNE_BACHECA.find((r) => r.id === colonne)?.label}</span>
                      <ChevronDown className="hidden opacity-50 sm:block" />
                    </Bottone>
                  }
                >
                  <MenuEtichetta>Colonne per</MenuEtichetta>
                  {COLONNE_BACHECA.map((r) => (
                    <MenuSpunta key={r.id} attiva={colonne === r.id} onCambia={() => setColonne(r.id)}>
                      {r.label}
                    </MenuSpunta>
                  ))}
                  {colonne !== "stato" ? (
                    <>
                      <MenuSeparatore />
                      <MenuSpunta attiva={filtri.completate} onCambia={(v) => setFiltri((f) => ({ ...f, completate: v }))}>
                        Mostra le completate
                      </MenuSpunta>
                    </>
                  ) : null}
                </Menu>
              ) : null}
            </div>
            {conteggi.scadute || conteggi.oggi || conteggi.settimana ? (
              <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto lg:shrink-0 lg:flex-nowrap">
                {conteggi.scadute ? (
                  <button
                    type="button"
                    onClick={() => (cambiaVista("lista"), setRaggruppa("fascia"))}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-300"
                  >
                    <CircleAlert className="h-3.5 w-3.5" /> {conteggi.scadute} scadut{conteggi.scadute === 1 ? "a" : "e"}
                  </button>
                ) : null}
                {conteggi.oggi ? (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Clock className="h-3.5 w-3.5" /> {conteggi.oggi} oggi
                  </span>
                ) : null}
                {conteggi.settimana ? (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {conteggi.settimana} in settimana
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {chipAttivi.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {chipAttivi.map((c) => (
                <span key={c.chiave} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-1 text-xs shadow-sm">
                  <span className="shrink-0 text-muted-foreground">{c.gruppo}</span>
                  {c.punto ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.punto)} /> : null}
                  <span className="truncate font-medium">{c.label}</span>
                  <button type="button" onClick={c.togli} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Togli ${c.label}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {chipAttivi.length > 1 ? (
                <button type="button" onClick={azzera} className="px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                  Azzera
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {errore && !tasks ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">Non riesco a caricare le attività</div>
          <p className="mt-1 text-muted-foreground">{errore}</p>
          <Bottone variante="contorno" misura="sm" className="mt-3" onClick={() => void ricarica()}>
            Riprova
          </Bottone>
        </div>
      ) : !tasks || !base ? (
        <div className="flex justify-center py-16">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : vista === "lista" ? (
        <VistaLista filtrate={filtrate} raggruppa={raggruppa} onApri={apriTask} />
      ) : vista === "bacheca" ? (
        <VistaBacheca filtrate={filtrate} colonne={colonne} onApri={apriTask} mostraFatte={filtri.completate} />
      ) : vista === "calendario" ? (
        <VistaCalendario filtrate={filtrate} onApri={apriTask} />
      ) : vista === "gantt" ? (
        <VistaGantt filtrate={filtrate} onApri={apriTask} />
      ) : vista === "dashboard" ? (
        <VistaDashboard filtri={filtri} onApri={apriTask} />
      ) : vista === "inbox" ? (
        <VistaInbox onApri={apri} />
      ) : vista === "archivio" ? (
        <VistaArchivio onApri={apriTask} testo={filtri.testo} />
      ) : (
        <VistaImpostazioni />
      )}

      <PannelloTask id={aperta} onChiudi={() => impostaUrl({ task: null })} onApri={apri} />
      <NuovaAttivita aperta={nuova} onChiudi={() => setNuova(false)} onCreata={(id) => impostaUrl({ task: id })} />
    </div>
  )
}

function SchedaVista({ v, attiva, onClick, conteggio, soloIcona }: { v: (typeof VISTE)[number]; attiva: boolean; onClick: () => void; conteggio?: number; soloIcona?: boolean }) {
  const Icona = v.icona
  return (
    <button
      type="button"
      onClick={onClick}
      title={v.label}
      className={cn(
        "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors",
        attiva ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icona className="h-4 w-4" />
      {soloIcona ? <span className="sr-only">{v.label}</span> : v.label}
      {conteggio ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{conteggio > 99 ? "99+" : conteggio}</span> : null}
    </button>
  )
}

const SCELTE_PERSONALI = [
  ["tutte", "Insieme"],
  ["solo", "Solo loro"],
  ["nascondi", "Nascondi"],
] as const

function GruppoFiltro({ titolo, icona: Icona, children }: { titolo: string; icona: LucideIcon; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icona className="h-3.5 w-3.5" /> {titolo}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Pillola({ attiva, onClick, children, punto }: { attiva: boolean; onClick: () => void; children: ReactNode; punto?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        attiva ? "border-primary/50 bg-primary/10 font-medium text-foreground" : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {attiva ? <Check className="h-3 w-3 text-primary" /> : punto ? <span className={cn("h-2 w-2 rounded-full", punto)} /> : null}
      {children}
    </button>
  )
}

