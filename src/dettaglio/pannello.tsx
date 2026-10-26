"use client"

import {
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Building2,
  CalendarDays,
  ChevronLeft,
  Clock,
  Flag,
  Hourglass,
  Link2,
  LoaderCircle,
  Lock,
  MessageSquare,
  Plus,
  Repeat,
  Search,
  Unlock,
  Users,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { colore } from "../colori"
import { BadgeCategoria, ICONE_CATEGORIA, ICONE_STATO, LogoServizio } from "../componenti/aspetto"
import { MenuAzioniTask } from "../componenti/azioni-task"
import { GruppoAvatar, NomiPersone, ScegliPersone } from "../componenti/persone"
import { DialogoSollecito, useSollecitabili } from "../componenti/solleciti"
import { SelettoreCategoria, SelettoreData, SelettorePriorita, SelettoreRicorrenza, SelettoreStato, Chip } from "../componenti/selettori"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import {
  dataBreve,
  dataLunga,
  descriviRicorrenza,
  durata,
  eAdmin,
  eManager,
  fatta,
  inAttesaDi,
  normalizza,
  PRIORITA,
  quandoRelativo,
  SERVIZI,
} from "../regole"
import type { Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { AreaTesto, Interruttore } from "../ui/campi"
import { cn } from "../ui/cn"
import { ChiudiPannello, Pannello } from "../ui/dialogo"
import { Popover } from "../ui/popover"
import { Suggerimento } from "../ui/suggerimento"
import { Allegati } from "./allegati"
import { Chat } from "./chat"
import { Checklist } from "./checklist"
import { Sottotask } from "./sottotask"
import { Storico } from "./storico"

/** Dettaglio di un'attività a pannello laterale (stile ClickUp): campi a sinistra, chat e storico a destra. */
export function PannelloTask({ id, onChiudi, onApri }: { id: string | null; onChiudi: () => void; onApri: (id: string) => void }) {
  const { perId, api } = useAttivita()
  const [extra, setExtra] = useState<Task | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const caricato = id ? perId.get(id) : undefined

  // Attività non tra quelle caricate (archivio, completate da tempo, cestino): la si chiede a parte.
  useEffect(() => {
    setErrore(null)
    if (!id || caricato) {
      setExtra(null)
      return
    }
    let vivo = true
    api
      .task(id)
      .then((t) => {
        if (!vivo) return
        if (t) setExtra(t)
        else setErrore("Attività non trovata: forse è stata eliminata o non hai accesso.")
      })
      .catch((e) => vivo && setErrore(messaggioErrore(e)))
    return () => {
      vivo = false
    }
  }, [id, caricato, api])

  const t = caricato ?? extra
  return (
    <Pannello aperto={!!id} onChiudi={onChiudi} titolo={t?.titolo ?? "Attività"}>
      {t ? (
        <Contenuto key={t.id} t={t} onApri={onApri} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
          {errore ? (
            <>
              <p>{errore}</p>
              <Bottone variante="contorno" onClick={onChiudi}>
                Chiudi
              </Bottone>
            </>
          ) : (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          )}
        </div>
      )}
    </Pannello>
  )
}

function Contenuto({ t, onApri }: { t: Task; onApri: (id: string) => void }) {
  const ctx = useAttivita()
  const { azioni, me, persona, perId, tasks, config, base, categoria, stato } = ctx
  const [scheda, setScheda] = useState<"dettagli" | "chat" | "storico">("dettagli")
  const [schedaDestra, setSchedaDestra] = useState<"chat" | "storico">("chat")
  const [titolo, setTitolo] = useState(t.titolo)
  const [descrizione, setDescrizione] = useState(t.descrizione ?? "")
  useEffect(() => setTitolo(t.titolo), [t.titolo])
  useEffect(() => setDescrizione(t.descrizione ?? ""), [t.descrizione])

  const padre = t.padre_id ? perId.get(t.padre_id) : null
  const attesa = inAttesaDi(t, perId, tasks ?? [])
  const ass = t.assegnatari.map((a) => a.user_id)
  const io = persona(me)
  const seguo = !!me && t.osservatori.includes(me)
  const sollecitabili = useSollecitabili(t)
  const [sollecito, setSollecito] = useState(false)
  const mia = t.creato_da === me
  const fattaOra = fatta(t)
  const mioTurno = t.conferma_tutti && t.assegnatari.find((a) => a.user_id === me)
  const st = stato(t.stato_id)
  const StatoIcona = st ? ICONE_STATO[st.tipo] : null

  const salvaTitolo = () => {
    const v = titolo.trim()
    if (!v) setTitolo(t.titolo)
    else if (v !== t.titolo) void azioni.aggiorna(t.id, { titolo: v })
  }
  const salvaDescrizione = () => {
    const v = descrizione.trim()
    if (v !== (t.descrizione ?? "")) void azioni.aggiorna(t.id, { descrizione: v || null })
  }

  const intestazione = (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <ChiudiPannello className="rounded-md p-1.5 text-muted-foreground hover:bg-accent sm:hidden" aria-label="Chiudi">
        <ChevronLeft className="h-5 w-5" />
      </ChiudiPannello>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <BadgeCategoria id={t.categoria_id} sottocategoria={t.sottocategoria_id} />
        {padre ? (
          <>
            <span className="text-muted-foreground">›</span>
            <button type="button" onClick={() => onApri(padre.id)} className="min-w-0 truncate text-muted-foreground hover:text-foreground hover:underline">
              {padre.titolo}
            </button>
          </>
        ) : null}
      </div>
      {t.archiviata_at ? <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Archiviata</span> : null}
      {t.eliminata_at ? <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Nel cestino</span> : null}
      <Suggerimento testo={seguo ? "Segui: ricevi le notifiche. Clicca per smettere" : "Segui per ricevere le notifiche"}>
        <Bottone variante="fantasma" misura="icona-sm" onClick={() => void azioni.osserva(t, !seguo)} aria-label={seguo ? "Non seguire" : "Segui"}>
          {seguo ? <Bell className="text-primary" /> : <BellOff className="text-muted-foreground" />}
        </Bottone>
      </Suggerimento>
      {sollecitabili.length ? (
        <Suggerimento testo="Sollecita: promemoria o popup a chi deve farla">
          <Bottone variante="fantasma" misura="sm" onClick={() => setSollecito(true)} aria-label="Sollecita">
            <BellRing /> <span className="hidden sm:inline">Sollecita</span>
          </Bottone>
        </Suggerimento>
      ) : null}
      {sollecitabili.length ? <DialogoSollecito t={t} aperto={sollecito} onChiudi={() => setSollecito(false)} /> : null}
      <MenuAzioniTask t={t} />
      <ChiudiPannello className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent sm:block" aria-label="Chiudi">
        <X className="h-4 w-4" />
      </ChiudiPannello>
    </div>
  )

  const completa = (
    <div className="flex flex-wrap items-center gap-2">
      {mioTurno && !fattaOra ? (
        <Bottone variante={mioTurno.fatto_at ? "secondario" : "primario"} misura="sm" onClick={() => void azioni.segnaMiaParte(t, !mioTurno.fatto_at)}>
          {mioTurno.fatto_at ? "Riapri la mia parte" : "Ho fatto la mia parte"}
        </Bottone>
      ) : null}
      <Bottone
        variante={fattaOra ? "secondario" : mioTurno ? "contorno" : "primario"}
        misura="sm"
        onClick={() => (fattaOra ? void azioni.riapri(t) : void azioni.completa(t))}
        className={cn(fattaOra && "text-emerald-700 dark:text-emerald-300")}
      >
        {fattaOra ? "Completata · riapri" : t.ricorrenza_unita ? "Fatta, passa alla prossima" : mioTurno ? "Completa per tutti" : "Segna completata"}
      </Bottone>
      {t.conferma_tutti && t.assegnatari.length > 1 ? (
        <span className="text-xs text-muted-foreground">
          {t.assegnatari.filter((a) => a.fatto_at).length} di {t.assegnatari.length} hanno fatto la loro parte
        </span>
      ) : null}
    </div>
  )

  const dettagli = (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-3">
        <AreaTesto
          value={titolo}
          righeMax={4}
          onChange={(e) => setTitolo(e.target.value.replace(/\n/g, " "))}
          onBlur={salvaTitolo}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
          className={cn("border-transparent bg-transparent px-1 text-xl font-semibold shadow-none hover:border-border focus-visible:ring-1 sm:text-2xl", fattaOra && "text-muted-foreground line-through")}
          aria-label="Titolo"
        />
        {completa}
        {attesa && !fattaOra ? (
          <button
            type="button"
            onClick={() => onApri(attesa.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-800 dark:text-amber-200"
          >
            <Hourglass className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              In attesa di <b>{attesa.titolo}</b>
              {attesa.assegnatari.length ? ` (${attesa.assegnatari.map((a) => persona(a.user_id)?.nome?.split(" ")[0]).join(", ")})` : ""}
            </span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Riga etichetta="Stato" icona={StatoIcona ? <StatoIcona className={colore(st?.colore).testo} /> : null}>
          <SelettoreStato
            valore={t.stato_id}
            onCambia={(s) => (base?.stati.find((x) => x.id === s)?.tipo === "fatto" ? void azioni.completa(t) : void azioni.aggiorna(t.id, { stato_id: s }))}
            trigger={<Chip className={cn("font-medium", colore(st?.colore).testo)}>{st?.nome ?? t.stato_id}</Chip>}
          />
        </Riga>
        <Riga etichetta="Persone" icona={<Users />}>
          <Popover
            className="w-72"
            trigger={
              <Chip vuoto={!ass.length}>
                {ass.length ? (
                  <>
                    <GruppoAvatar ids={ass} max={4} fatti={t.conferma_tutti ? new Set(t.assegnatari.filter((a) => a.fatto_at).map((a) => a.user_id)) : undefined} />
                    <NomiPersone ids={ass} />
                  </>
                ) : (
                  "Nessuno"
                )}
              </Chip>
            }
          >
            <ScegliPersone titolo={t.personale ? "Attività personale: solo tu" : "Chi la fa"} scelti={ass} soloIds={t.personale && me ? [me] : undefined} onCambia={(n) => void azioni.assegna(t, n)} />
            {ass.length > 1 ? (
              <label className="mt-2 flex items-center justify-between gap-2 border-t border-border px-1 pt-2 text-xs">
                <span>Fatta quando tutti hanno fatto la loro parte</span>
                <Interruttore attivo={t.conferma_tutti} onCambia={(v) => void azioni.aggiorna(t.id, { conferma_tutti: v })} />
              </label>
            ) : null}
          </Popover>
        </Riga>
        <Riga etichetta="Date" icona={<CalendarDays />}>
          <div className="flex items-center gap-1">
            <SelettoreData
              titolo="Inizio"
              valore={t.data_inizio}
              onCambia={(d) => void azioni.aggiorna(t.id, { data_inizio: d, ...(d && t.scadenza && d > t.scadenza ? { scadenza: d } : {}) })}
              trigger={<Chip vuoto={!t.data_inizio}>{t.data_inizio ? dataBreve(t.data_inizio) : "Inizio"}</Chip>}
            />
            <span className="text-muted-foreground">→</span>
            <SelettoreData
              valore={t.scadenza}
              minimo={t.data_inizio}
              onCambia={(d) => (!d && t.ricorrenza_unita ? avviso.errore("Una ricorrente ha bisogno della scadenza") : void azioni.aggiorna(t.id, { scadenza: d }))}
              trigger={<Chip vuoto={!t.scadenza}>{t.scadenza ? dataBreve(t.scadenza) : "Scadenza"}</Chip>}
            />
          </div>
        </Riga>
        <Riga etichetta="Priorità" icona={<Flag />}>
          <SelettorePriorita
            valore={t.priorita}
            onCambia={(p) => void azioni.aggiorna(t.id, { priorita: p })}
            trigger={
              <Chip>
                <Flag className={cn(PRIORITA[t.priorita].testo, t.priorita !== "bassa" && "fill-current")} />
                {PRIORITA[t.priorita].label}
              </Chip>
            }
          />
        </Riga>
        <Riga etichetta="Categoria" icona={<Building2 />}>
          <SelettoreCategoria
            categoria={t.categoria_id}
            sottocategoria={t.sottocategoria_id}
            onCambia={(c, s) => void azioni.aggiorna(t.id, { categoria_id: c, sottocategoria_id: s })}
            trigger={
              <Chip>
                {(() => {
                  const c = categoria(t.categoria_id)
                  const Icona = ICONE_CATEGORIA[c?.icona ?? ""] ?? Building2
                  return <Icona className={colore(c?.colore).testo} />
                })()}
                <span className="truncate">
                  {categoria(t.categoria_id)?.nome}
                  {t.sottocategoria_id ? <span className="text-muted-foreground"> · {ctx.sottocategoria(t.sottocategoria_id)?.nome}</span> : null}
                </span>
              </Chip>
            }
          />
        </Riga>
        {!t.padre_id ? (
          <Riga etichetta="Ripeti" icona={<Repeat />}>
            <SelettoreRicorrenza
              valore={{ ricorrenza_unita: t.ricorrenza_unita, ricorrenza_intervallo: t.ricorrenza_intervallo, ricorrenza_fine: t.ricorrenza_fine, preavviso_giorni: t.preavviso_giorni }}
              scadenza={t.scadenza}
              onCambia={(r) => void azioni.aggiorna(t.id, r)}
              trigger={<Chip vuoto={!t.ricorrenza_unita}>{descriviRicorrenza(t.ricorrenza_unita, t.ricorrenza_intervallo) ?? "Mai"}</Chip>}
            />
          </Riga>
        ) : null}
        <Riga etichetta="Stima" icona={<Clock />}>
          <CampoStima valore={t.stima_minuti} onCambia={(v) => void azioni.aggiorna(t.id, { stima_minuti: v })} />
        </Riga>
        {!t.padre_id && (mia || t.personale) ? (
          <Riga etichetta="Visibilità" icona={t.personale ? <Lock /> : <Unlock />}>
            <label className="flex h-8 items-center gap-2 px-2 text-sm">
              <Interruttore
                attivo={t.personale}
                disabilitato={!mia}
                onCambia={(v) => {
                  if (v && ass.some((a) => a !== me)) {
                    avviso.errore("Togli prima le altre persone: una attività personale è solo tua.")
                    return
                  }
                  void azioni.aggiorna(t.id, { personale: v })
                }}
              />
              <span className="text-muted-foreground">{t.personale ? "Personale, la vedi solo tu" : "Chi è coinvolto"}</span>
            </label>
          </Riga>
        ) : null}
        <Riga etichetta="Aspetta" icona={<Hourglass />}>
          <CampoDipendenze t={t} onApri={onApri} />
        </Riga>
        <Riga etichetta="Seguono" icona={<Bell />}>
          <Popover
            className="w-72"
            trigger={
              <Chip vuoto={!t.osservatori.length}>{t.osservatori.length ? <GruppoAvatar ids={t.osservatori} max={5} /> : "Nessuno"}</Chip>
            }
          >
            <ScegliPersone
              titolo="Chi riceve gli aggiornamenti"
              scelti={t.osservatori}
              soloIds={t.personale && me ? [me] : undefined}
              onCambia={async (nuovi) => {
                for (const u of nuovi.filter((x) => !t.osservatori.includes(x))) await ctx.api.osserva(t.id, u, true).catch((e) => avviso.errore(messaggioErrore(e)))
                for (const u of t.osservatori.filter((x) => !nuovi.includes(x))) await ctx.api.osserva(t.id, u, false).catch((e) => avviso.errore(messaggioErrore(e)))
                void ctx.ricarica("tasks")
              }}
            />
          </Popover>
        </Riga>
        <Riga etichetta="Pagina" icona={<Link2 />}>
          <CampoLink t={t} />
        </Riga>
      </div>

      <section>
        <h4 className="mb-1.5 text-sm font-semibold">Descrizione</h4>
        <AreaTesto
          value={descrizione}
          righeMax={20}
          onChange={(e) => setDescrizione(e.target.value)}
          onBlur={salvaDescrizione}
          placeholder="Dettagli, dove trovare i dati, a chi chiedere…"
          className="min-h-20 bg-muted/20"
        />
      </section>

      {!t.padre_id ? <Sottotask t={t} onApri={(s) => onApri(s.id)} /> : null}
      <Checklist t={t} />
      <Allegati t={t} />
      <Collegamenti t={t} />
      {config.estensioni?.dettaglio ? config.estensioni.dettaglio(t) : null}

      <div className="space-y-0.5 border-t border-border pt-4 text-xs text-muted-foreground">
        <div>
          Creata da {persona(t.creato_da)?.nome ?? "—"} il {dataLunga(t.creato_at.slice(0, 10))}
          {t.app_origine && t.app_origine !== config.app ? ` in ${base?.app.find((a) => a.slug === t.app_origine)?.nome ?? t.app_origine}` : ""}
        </div>
        {t.completata_at ? (
          <div>
            Completata da {persona(t.completata_da)?.nome ?? "—"} {quandoRelativo(t.completata_at)}
          </div>
        ) : null}
        {t.archiviata_at ? <div>Archiviata {quandoRelativo(t.archiviata_at)}{t.archivio_motivo ? `: ${t.archivio_motivo}` : ""}{t.automatizzata_da ? ` (ora la fa il job ${t.automatizzata_da})` : ""}</div> : null}
        {t.eliminata_at ? <div>Nel cestino da {quandoRelativo(t.eliminata_at)}: si cancella definitivamente dopo un anno.</div> : null}
        {io && (eAdmin(io) || eManager(io)) && !ass.includes(me ?? "") && t.creato_da !== me ? <div>La vedi perché sei {eAdmin(io) ? "admin" : "manager"}.</div> : null}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {intestazione}
      {/* Mobile: schede; desktop: due colonne */}
      <div className="flex border-b border-border lg:hidden">
        {(
          [
            ["dettagli", "Dettagli"],
            ["chat", `Chat${t.n_commenti ? ` (${t.n_commenti})` : ""}`],
            ["storico", "Storico"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setScheda(k)}
            className={cn("flex-1 border-b-2 px-3 py-2 text-sm font-medium", scheda === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          >
            {l}
            {k === "chat" && t.n_non_letti ? <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 flex-1 overflow-y-auto", scheda !== "dettagli" && "hidden lg:block")}>{dettagli}</div>
        <div className={cn("min-h-0 w-full flex-col border-border lg:flex lg:w-[26rem] lg:border-l", scheda === "dettagli" ? "hidden" : "flex")}>
          <div className="hidden border-b border-border lg:flex">
            {(
              [
                ["chat", "Chat"],
                ["storico", "Storico"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSchedaDestra(k)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
                  schedaDestra === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "chat" ? <MessageSquare className="h-4 w-4" /> : null}
                {l}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {(scheda === "dettagli" ? schedaDestra : scheda) === "storico" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Storico t={t} />
              </div>
            ) : (
              <Chat t={t} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Riga({ etichetta, icona, children }: { etichetta: string; icona: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icona}
        {etichetta}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function CampoStima({ valore, onCambia }: { valore: number | null; onCambia: (v: number | null) => void }) {
  const [aperto, setAperto] = useState(false)
  const rapide = [15, 30, 60, 120, 240, 480, 960, 2400]
  return (
    <Popover aperto={aperto} onCambia={setAperto} className="w-60" trigger={<Chip vuoto={!valore}>{durata(valore) ?? "Nessuna"}</Chip>}>
      <div className="mb-2 text-xs font-medium text-muted-foreground">Quanto tempo serve</div>
      <div className="grid grid-cols-4 gap-1">
        {rapide.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => (onCambia(m), setAperto(false))}
            className={cn("rounded-md border border-border px-1 py-1 text-xs hover:bg-accent", valore === m && "border-primary bg-primary/5")}
          >
            {durata(m)}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="number"
          min={1}
          defaultValue={valore ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = Number((e.target as HTMLInputElement).value)
              onCambia(v > 0 ? Math.min(100000, Math.round(v)) : null)
              setAperto(false)
            }
          }}
          className="h-8 w-20 rounded-md border border-input bg-background px-2"
        />
        <span className="text-muted-foreground">minuti</span>
      </label>
      {valore ? (
        <button type="button" onClick={() => (onCambia(null), setAperto(false))} className="mt-2 text-xs text-muted-foreground hover:underline">
          Togli stima
        </button>
      ) : null}
    </Popover>
  )
}

function CampoDipendenze({ t, onApri }: { t: Task; onApri: (id: string) => void }) {
  const { tasks, perId, api, ricarica } = useAttivita()
  const [q, setQ] = useState("")
  const candidati = useMemo(() => {
    const n = normalizza(q.trim())
    return (tasks ?? [])
      .filter((x) => x.id !== t.id && x.padre_id !== t.id && !x.eliminata_at && !x.archiviata_at && !fatta(x) && !t.dipende_da.includes(x.id))
      .filter((x) => !n || normalizza(x.titolo).includes(n))
      .slice(0, 30)
  }, [tasks, q, t])
  const cambia = async (da: string, si: boolean) => {
    try {
      await api.dipendenza(t.id, da, si)
      void ricarica("tasks")
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {t.dipende_da.map((id) => {
        const d = perId.get(id)
        return (
          <span key={id} className={cn("inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs", d && fatta(d) && "text-muted-foreground line-through")}>
            <button type="button" onClick={() => onApri(id)} className="truncate hover:underline">
              {d?.titolo ?? "Attività"}
            </button>
            <button type="button" onClick={() => void cambia(id, false)} aria-label="Togli">
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}
      <Popover
        className="w-80"
        trigger={
          <Chip vuoto>
            <Plus /> {t.dipende_da.length ? "" : "Niente"}
          </Chip>
        }
      >
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Questa può partire quando è fatta…</div>
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca attività…" className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {candidati.map((x) => (
            <button key={x.id} type="button" onClick={() => void cambia(x.id, true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
              <span className="min-w-0 flex-1 truncate">{x.titolo}</span>
              {x.scadenza ? <span className="shrink-0 text-xs text-muted-foreground">{dataBreve(x.scadenza)}</span> : null}
            </button>
          ))}
          {!candidati.length ? <div className="px-2 py-2 text-sm text-muted-foreground">Nessuna attività.</div> : null}
        </div>
      </Popover>
    </div>
  )
}

/** Pagina da aprire (percorso dell'app della categoria o https) e logo del servizio esterno. */
function CampoLink({ t }: { t: Task }) {
  const { azioni, config, base, categoria } = useAttivita()
  const [aperto, setAperto] = useState(false)
  const [link, setLink] = useState(t.link ?? "")
  useEffect(() => setLink(t.link ?? ""), [t.link])
  const appCategoria = categoria(t.categoria_id)?.app_slug ?? config.app
  const href = hrefLink(t.link, appCategoria, config.app, base?.app ?? [])

  const salva = () => {
    const v = link.trim()
    if (v && !v.startsWith("/") && !/^https:\/\//.test(v)) {
      avviso.errore("Il collegamento deve iniziare con / (pagina dell'app) o https://")
      return
    }
    void azioni.aggiorna(t.id, { link: v || null })
    setAperto(false)
  }

  return (
    <div className="flex items-center gap-1">
      {href ? (
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-sm text-primary hover:bg-accent hover:underline">
          <LogoServizio servizio={t.servizio} />
          <span className="truncate">{t.link}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : null}
      <Popover
        aperto={aperto}
        onCambia={setAperto}
        className="w-80"
        trigger={
          <Chip vuoto={!t.link} className={href ? "w-8 justify-center px-0" : undefined}>
            {href ? "…" : "Nessuna"}
          </Chip>
        }
      >
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Pagina da aprire</div>
        <input
          autoFocus
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && salva()}
          placeholder="/pagina o https://…"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        {config.pagine?.length ? (
          <div className="mt-2 max-h-40 overflow-y-auto">
            {config.pagine.map((p) => (
              <button key={p.href} type="button" onClick={() => setLink(p.href)} className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-accent">
                {p.etichetta}
                <span className="text-xs text-muted-foreground">{p.href}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 text-xs font-medium text-muted-foreground">Servizio (logo)</div>
        <select
          value={t.servizio ?? ""}
          onChange={(e) => void azioni.aggiorna(t.id, { servizio: e.target.value || null })}
          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Nessuno</option>
          {Object.entries(SERVIZI).map(([k, s]) => (
            <option key={k} value={k}>
              {s.nome}
            </option>
          ))}
        </select>
        <div className="mt-3 flex justify-end gap-2">
          <Bottone variante="primario" misura="sm" onClick={salva}>
            Salva
          </Bottone>
        </div>
      </Popover>
    </div>
  )
}

/** Link relativo: se la categoria è di un'altra app, si apre in quell'app. */
export function hrefLink(link: string | null, appCategoria: string, appCorrente: string, app: { slug: string; url: string | null }[]): string | null {
  if (!link) return null
  if (!link.startsWith("/")) return link
  if (appCategoria === appCorrente) return link
  const base = app.find((a) => a.slug === appCategoria)?.url
  return base ? `${base.replace(/\/$/, "")}${link}` : link
}

function Collegamenti({ t }: { t: Task }) {
  const { config, base, api, ricarica } = useAttivita()
  if (!t.collegamenti.length) return null
  return (
    <section>
      <h4 className="mb-1.5 text-sm font-semibold">Collegata a</h4>
      <div className="flex flex-wrap gap-1.5">
        {t.collegamenti.map((c) => {
          const proprio = c.app_slug === config.app ? config.estensioni?.collegamento?.(c) : null
          const app = base?.app.find((a) => a.slug === c.app_slug)
          const etichetta = proprio?.etichetta ?? `${app?.nome ?? c.app_slug}: ${c.etichetta ?? c.tipo}`
          const href = proprio?.href ?? (c.url ? (c.app_slug === config.app || !c.url.startsWith("/") ? c.url : `${app?.url?.replace(/\/$/, "") ?? ""}${c.url}`) : undefined)
          return (
            <span key={c.id} className="group inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              {href ? (
                <a href={href} className="truncate hover:underline" target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  {etichetta}
                </a>
              ) : (
                <span className="truncate">{etichetta}</span>
              )}
              <button
                type="button"
                className="-m-1 p-1 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={async () => {
                  try {
                    await api.scollega(c.id)
                    void ricarica("tasks")
                  } catch (e) {
                    avviso.errore(messaggioErrore(e))
                  }
                }}
                aria-label="Togli collegamento"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
      </div>
    </section>
  )
}
