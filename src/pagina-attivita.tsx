"use client"

import {
  Archive,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  CircleAlert,
  Inbox,
  LayoutList,
  ListFilter,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  SquareKanban,
  X,
  type LucideIcon,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { colore } from "./colori"
import { useNotificheApp } from "./componenti/notifiche"
import { NuovaAttivita } from "./componenti/nuova-attivita"
import { AvatarPersona } from "./componenti/persone"
import { useAttivita, useRichiedi } from "./contesto"
import { PannelloTask } from "./dettaglio/pannello"
import { filtra, FILTRI_VUOTI, filtriValidi, quantiFiltri, usePersistito, type Filtri } from "./filtri"
import { aggiungiGiorniIso, eAdmin, eManager, fascia, fatta, oggiIso, ORDINE_PRIORITA, PRIORITA } from "./regole"
import type { Task } from "./tipi"
import { Bottone } from "./ui/bottone"
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

/**
 * Pagina Attività completa (la stessa in tutte le app). L'attività aperta e la vista stanno
 * nell'indirizzo (?task=…&vista=…), così i link delle notifiche aprono il punto giusto.
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
  const { tasks, base, errore, me, persona, config, registraApertura, ricarica } = useAttivita()
  const parametri = useSearchParams()
  const router = useRouter()
  const percorso = usePathname()
  const [vistaSalvata, setVistaSalvata] = usePersistito<Vista>(`${config.app}:vista`, "lista", eVista)
  const [filtri, setFiltri] = usePersistito<Filtri>(`${config.app}:filtri`, FILTRI_VUOTI, filtriValidi)
  const [raggruppa, setRaggruppa] = usePersistito<Raggruppa>(`${config.app}:raggruppa`, "fascia")
  const [colonne, setColonne] = usePersistito<ColonneBacheca>(`${config.app}:colonne`, "stato")
  const [nuova, setNuova] = useState(false)
  const { tutte: notifiche } = useNotificheApp()

  const vistaUrl = parametri.get("vista")
  const vista: Vista = eVista(vistaUrl) ? vistaUrl : vistaSalvata
  const aperta = parametri.get("task")

  const impostaUrl = useCallback(
    (cambi: Record<string, string | null>) => {
      const p = new URLSearchParams(parametri.toString())
      for (const [k, v] of Object.entries(cambi)) {
        if (v == null) p.delete(k)
        else p.set(k, v)
      }
      const q = p.toString()
      router.replace(`${percorso}${q ? `?${q}` : ""}`, { scroll: false })
    },
    [parametri, percorso, router],
  )
  const apri = useCallback((id: string) => impostaUrl({ task: id }), [impostaUrl])
  const apriTask = useCallback((t: Task) => apri(t.id), [apri])
  const cambiaVista = (v: Vista) => {
    setVistaSalvata(v)
    impostaUrl({ vista: null })
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
      <div className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {principali.map((v) => (
          <SchedaVista key={v.id} v={v} attiva={vista === v.id} onClick={() => cambiaVista(v.id)} />
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        {secondarie.map((v) => (
          <SchedaVista key={v.id} v={v} attiva={vista === v.id} onClick={() => cambiaVista(v.id)} conteggio={v.id === "inbox" ? notificheNonLette : undefined} soloIcona={v.id === "impostazioni"} />
        ))}
      </div>

      {conFiltri ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filtri.testo}
              onChange={(e) => setFiltri((f) => ({ ...f, testo: e.target.value }))}
              placeholder="Cerca…"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            {filtri.testo ? (
              <button type="button" onClick={() => setFiltri((f) => ({ ...f, testo: "" }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Svuota">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Menu
            allinea="start"
            trigger={
              <Bottone variante="contorno" misura="md">
                {filtri.persona !== "mie" && persona(filtri.persona) ? <AvatarPersona id={filtri.persona} misura="xs" /> : null}
                {etichettaPersona}
              </Bottone>
            }
          >
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
            className="w-80 p-3"
            trigger={
              <Bottone variante={quantiFiltri(filtri) ? "secondario" : "contorno"}>
                <ListFilter /> Filtri{quantiFiltri(filtri) ? ` (${quantiFiltri(filtri)})` : ""}
              </Bottone>
            }
          >
            <div className="space-y-3">
              <GruppoFiltro titolo="Categoria">
                {(base?.categorie ?? [])
                  .filter((c) => c.attiva)
                  .map((c) => (
                    <Pillola key={c.id} attiva={filtroAttivo("categorie", c.id)} onClick={() => toggleFiltro("categorie", c.id)} punto={colore(c.colore).punto}>
                      {c.nome}
                    </Pillola>
                  ))}
              </GruppoFiltro>
              {(() => {
                const sotto = (base?.sottocategorie ?? []).filter((s) => !s.archiviata_at && (!filtri.categorie.length || filtri.categorie.includes(s.categoria_id)))
                return sotto.length ? (
                  <GruppoFiltro titolo="Sottocategoria">
                    {sotto.map((s) => (
                      <Pillola key={s.id} attiva={filtroAttivo("sottocategorie", s.id)} onClick={() => toggleFiltro("sottocategorie", s.id)}>
                        {s.nome}
                      </Pillola>
                    ))}
                  </GruppoFiltro>
                ) : null
              })()}
              <GruppoFiltro titolo="Priorità">
                {ORDINE_PRIORITA.map((p) => (
                  <Pillola key={p} attiva={filtroAttivo("priorita", p)} onClick={() => toggleFiltro("priorita", p)} punto={PRIORITA[p].punto}>
                    {PRIORITA[p].label}
                  </Pillola>
                ))}
              </GruppoFiltro>
              <GruppoFiltro titolo="Stato">
                {(base?.stati ?? []).map((s) => (
                  <Pillola key={s.id} attiva={filtroAttivo("stati", s.id)} onClick={() => toggleFiltro("stati", s.id)} punto={colore(s.colore).punto}>
                    {s.nome}
                  </Pillola>
                ))}
              </GruppoFiltro>
              <GruppoFiltro titolo="Personali">
                {(
                  [
                    ["tutte", "Insieme alle altre"],
                    ["solo", "Solo personali"],
                    ["nascondi", "Nascondi"],
                  ] as const
                ).map(([k, l]) => (
                  <Pillola key={k} attiva={filtri.personali === k} onClick={() => setFiltri((f) => ({ ...f, personali: k }))}>
                    {l}
                  </Pillola>
                ))}
              </GruppoFiltro>
              {vista === "lista" || vista === "dashboard" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={filtri.completate} onChange={(e) => setFiltri((f) => ({ ...f, completate: e.target.checked }))} />
                  Mostra anche le completate
                </label>
              ) : null}
              {quantiFiltri(filtri) ? (
                <Bottone variante="fantasma" misura="sm" onClick={() => setFiltri((f) => ({ ...FILTRI_VUOTI, persona: f.persona, testo: f.testo }))}>
                  Togli i filtri
                </Bottone>
              ) : null}
            </div>
          </Popover>
          {vista === "lista" ? (
            <Menu
              allinea="start"
              trigger={
                <Bottone variante="contorno">
                  Raggruppa: {RAGGRUPPAMENTI.find((r) => r.id === raggruppa)?.label}
                </Bottone>
              }
            >
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
                <Bottone variante="contorno">
                  Colonne: {COLONNE_BACHECA.find((r) => r.id === colonne)?.label}
                </Bottone>
              }
            >
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
          <div className="ml-auto flex items-center gap-3 text-xs">
            {conteggi.scadute ? (
              <button type="button" onClick={() => (cambiaVista("lista"), setRaggruppa("fascia"))} className="inline-flex items-center gap-1 font-medium text-red-600 hover:underline dark:text-red-400">
                <CircleAlert className="h-3.5 w-3.5" /> {conteggi.scadute} scadut{conteggi.scadute === 1 ? "a" : "e"}
              </button>
            ) : null}
            {conteggi.oggi ? <span className="text-amber-600 dark:text-amber-400">{conteggi.oggi} oggi</span> : null}
            {conteggi.settimana ? <span className="hidden text-muted-foreground sm:inline">{conteggi.settimana} in settimana</span> : null}
          </div>
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

function GruppoFiltro({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{titolo}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Pillola({ attiva, onClick, children, punto }: { attiva: boolean; onClick: () => void; children: ReactNode; punto?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", attiva ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
    >
      {punto ? <span className={cn("h-1.5 w-1.5 rounded-full", punto)} /> : null}
      {children}
    </button>
  )
}

