"use client"

import { Camera, FileText, LoaderCircle, MessageSquare, Paperclip, Pencil, Reply, Send, Smile, Trash2, X } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react"
import { AvatarPersona } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { eAudio, eImmagine, eVideo } from "../dati/immagini"
import { useUrlFirmati } from "../dati/url-firmati"
import { dataLunga, dimensioneFile, giornoRoma, normalizza, oggiIso, oraRoma, primoNome } from "../regole"
import type { Allegato, Commento, Persona, Reazione, Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { AreaTesto } from "../ui/campi"
import { cn } from "../ui/cn"
import { Popover } from "../ui/popover"
import { caricaFile, Galleria } from "./allegati"

const EMOJI = ["👍", "❤️", "😂", "😮", "🙏", "✅", "👀", "🎉"]

/** Chat dell'attività: messaggi, menzioni, risposte, reazioni, foto; in tempo reale con "sta scrivendo". */
export function Chat({ t }: { t: Task }) {
  const { api, me, config, persona, ricarica } = useAttivita()
  const [messaggi, setMessaggi] = useState<Commento[] | null>(null)
  const [reazioni, setReazioni] = useState<Reazione[]>([])
  const [allegati, setAllegati] = useState<Allegato[]>([])
  const [scrivono, setScrivono] = useState<string[]>([])
  const [rispondiA, setRispondiA] = useState<Commento | null>(null)
  const [modifica, setModifica] = useState<Commento | null>(null)
  const [galleria, setGalleria] = useState<{ lista: Allegato[]; i: number } | null>(null)
  const fondo = useRef<HTMLDivElement>(null)
  const scorri = useRef<HTMLDivElement>(null)
  const canale = useRef<ReturnType<typeof config.supabase.channel> | null>(null)
  const inFondo = useRef(true)

  const carica = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.commenti(t.id), api.allegati(t.id)])
      setMessaggi(c)
      setAllegati(a.filter((x) => x.commento_id))
      setReazioni(await api.reazioni(c.map((x) => x.id)))
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }, [api, t.id])

  const segnaLetta = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leggi = useCallback(() => {
    if (segnaLetta.current) clearTimeout(segnaLetta.current)
    segnaLetta.current = setTimeout(() => {
      api
        .segnaLetta(t.id)
        .then(() => ricarica("notifiche"))
        .catch(() => undefined)
    }, 800)
  }, [api, t.id, ricarica])

  useEffect(() => {
    void carica()
    leggi()
  }, [carica, leggi])

  // Tempo reale: nuovi messaggi, modifiche, reazioni, allegati; presenza per "sta scrivendo".
  useEffect(() => {
    if (!me) return
    const sb = config.supabase
    const ch = sb.channel(`chat:${t.id}`, { config: { presence: { key: me } } })
    let attesa: ReturnType<typeof setTimeout> | null = null
    const presto = () => {
      if (attesa) clearTimeout(attesa)
      attesa = setTimeout(() => {
        void carica()
        if (document.visibilityState === "visible") leggi()
      }, 250)
    }
    ch.on("postgres_changes" as any, { event: "*", schema: "tasks", table: "commenti", filter: `task_id=eq.${t.id}` }, presto)
      .on("postgres_changes" as any, { event: "*", schema: "tasks", table: "allegati", filter: `task_id=eq.${t.id}` }, presto)
      .on("postgres_changes" as any, { event: "*", schema: "tasks", table: "reazioni" }, presto)
      .on("presence", { event: "sync" }, () => {
        const stato = ch.presenceState<{ scrive?: boolean }>()
        setScrivono(Object.entries(stato).filter(([k, v]) => k !== me && v.some((x) => x.scrive)).map(([k]) => k))
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") void ch.track({ scrive: false })
      })
    canale.current = ch
    return () => {
      if (attesa) clearTimeout(attesa)
      canale.current = null
      sb.removeChannel(ch)
    }
  }, [t.id, me, config.supabase, carica, leggi])

  const segnalaScrittura = useMemo(() => {
    let ultimo = 0
    let spegni: ReturnType<typeof setTimeout> | null = null
    return () => {
      const ch = canale.current
      if (!ch) return
      if (Date.now() - ultimo > 2000) {
        ultimo = Date.now()
        void ch.track({ scrive: true })
      }
      if (spegni) clearTimeout(spegni)
      spegni = setTimeout(() => void canale.current?.track({ scrive: false }), 3000)
    }
  }, [])

  // In fondo all'apertura e quando arrivano messaggi (se si era già in fondo).
  useEffect(() => {
    if (inFondo.current) fondo.current?.scrollIntoView({ block: "end" })
  }, [messaggi?.length, allegati.length])

  const urlAllegati = useUrlFirmati(allegati.map((a) => a.percorso))
  const perCommento = useMemo(() => {
    const m = new Map<string, Allegato[]>()
    for (const a of allegati) if (a.commento_id && !a.eliminato_at) m.set(a.commento_id, [...(m.get(a.commento_id) ?? []), a])
    return m
  }, [allegati])
  const reazioniDi = useMemo(() => {
    const m = new Map<string, Reazione[]>()
    for (const r of reazioni) m.set(r.commento_id, [...(m.get(r.commento_id) ?? []), r])
    return m
  }, [reazioni])
  const perId = useMemo(() => new Map((messaggi ?? []).map((c) => [c.id, c])), [messaggi])

  const reagisci = async (c: Commento, emoji: string) => {
    if (!me) return
    const gia = reazioni.some((r) => r.commento_id === c.id && r.user_id === me && r.emoji === emoji)
    setReazioni((l) => (gia ? l.filter((r) => !(r.commento_id === c.id && r.user_id === me && r.emoji === emoji)) : [...l, { commento_id: c.id, user_id: me, emoji }]))
    try {
      await api.reazione(c.id, me, emoji, !gia)
    } catch (e) {
      avviso.errore(messaggioErrore(e))
      void carica()
    }
  }

  const elimina = async (c: Commento) => {
    try {
      await api.eliminaCommento(c.id)
      void carica()
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }

  const visibili = messaggi ?? []
  const oggi = oggiIso()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scorri}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3 sm:px-4"
        onScroll={(e) => {
          const el = e.currentTarget
          inFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {messaggi === null ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !visibili.length ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p>Nessun messaggio.</p>
            <p className="max-w-xs text-xs">Scrivi qui per chiarimenti, aggiornamenti o foto. Con @nome avvisi una persona.</p>
          </div>
        ) : (
          visibili.map((c, i) => {
            const prec = visibili[i - 1]
            const giorno = giornoRoma(c.creato_at)
            const nuovoGiorno = !prec || giornoRoma(prec.creato_at) !== giorno
            const raggruppato = !nuovoGiorno && prec && prec.autore === c.autore && !prec.eliminato_at && Date.parse(c.creato_at) - Date.parse(prec.creato_at) < 5 * 60_000 && !c.risposta_a
            return (
              <Fragment key={c.id}>
                {nuovoGiorno ? (
                  <div className="sticky top-0 z-10 flex justify-center py-2">
                    <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-sm">
                      {giorno === oggi ? "Oggi" : dataLunga(giorno)}
                    </span>
                  </div>
                ) : null}
                <Messaggio
                  c={c}
                  mio={c.autore === me}
                  raggruppato={!!raggruppato}
                  allegati={perCommento.get(c.id) ?? []}
                  url={urlAllegati}
                  reazioni={reazioniDi.get(c.id) ?? []}
                  risposta={c.risposta_a ? perId.get(c.risposta_a) : undefined}
                  onRispondi={() => setRispondiA(c)}
                  onModifica={() => setModifica(c)}
                  onElimina={() => void elimina(c)}
                  onReagisci={(e) => void reagisci(c, e)}
                  onFoto={(lista, j) => setGalleria({ lista, i: j })}
                />
              </Fragment>
            )
          })
        )}
        <div ref={fondo} />
      </div>
      <div className="h-5 px-4 text-[11px] text-muted-foreground">
        {scrivono.length ? `${scrivono.map((id) => primoNome(persona(id)?.nome)).join(", ")} ${scrivono.length === 1 ? "sta" : "stanno"} scrivendo…` : ""}
      </div>
      <Compositore
        t={t}
        rispondiA={rispondiA}
        onTogliRisposta={() => setRispondiA(null)}
        modifica={modifica}
        onFineModifica={() => setModifica(null)}
        onScrive={segnalaScrittura}
        onInviato={() => {
          inFondo.current = true
          setRispondiA(null)
          void canale.current?.track({ scrive: false })
          void carica()
          void ricarica("tasks")
        }}
      />
      <Galleria immagini={galleria?.lista ?? []} url={urlAllegati} indice={galleria?.i ?? null} onCambia={(i) => setGalleria((g) => (g && i != null ? { ...g, i } : null))} />
    </div>
  )
}

/** Testo con @menzioni evidenziate e link cliccabili. */
function TestoMessaggio({ testo, menzioni }: { testo: string; menzioni: string[] }) {
  const { persona, me } = useAttivita()
  const nomi = menzioni.map((id) => ({ id, nome: persona(id)?.nome })).filter((x): x is { id: string; nome: string } => !!x.nome)
  const parti: (string | { tipo: "menzione"; id: string; testo: string } | { tipo: "link"; href: string })[] = []
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const schema = new RegExp(`(https?://[^\\s<]+)${nomi.length ? `|(@(?:${nomi.map((n) => esc(n.nome)).join("|")}))` : ""}`, "g")
  let ultimo = 0
  for (const m of testo.matchAll(schema)) {
    if (m.index! > ultimo) parti.push(testo.slice(ultimo, m.index))
    if (m[1]) parti.push({ tipo: "link", href: m[1] })
    else if (m[2]) {
      const n = nomi.find((x) => `@${x.nome}` === m[2])
      parti.push({ tipo: "menzione", id: n?.id ?? "", testo: m[2] })
    }
    ultimo = m.index! + m[0].length
  }
  if (ultimo < testo.length) parti.push(testo.slice(ultimo))
  return (
    <span className="whitespace-pre-wrap break-words">
      {parti.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : p.tipo === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
            {p.href.length > 60 ? `${p.href.slice(0, 57)}…` : p.href}
          </a>
        ) : (
          <span key={i} className={cn("rounded px-0.5 font-medium", p.id === me ? "bg-amber-400/30" : "bg-primary/10 text-primary")}>
            {p.testo}
          </span>
        ),
      )}
    </span>
  )
}

function Messaggio({
  c,
  mio,
  raggruppato,
  allegati,
  url,
  reazioni,
  risposta,
  onRispondi,
  onModifica,
  onElimina,
  onReagisci,
  onFoto,
}: {
  c: Commento
  mio: boolean
  raggruppato: boolean
  allegati: Allegato[]
  url: Record<string, string>
  reazioni: Reazione[]
  risposta?: Commento
  onRispondi: () => void
  onModifica: () => void
  onElimina: () => void
  onReagisci: (emoji: string) => void
  onFoto: (lista: Allegato[], i: number) => void
}) {
  const { persona, me } = useAttivita()
  const autore = persona(c.autore)
  const foto = allegati.filter((a) => eImmagine(a.tipo_mime))
  const altri = allegati.filter((a) => !eImmagine(a.tipo_mime))
  const gruppiReazioni = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of reazioni) m.set(r.emoji, [...(m.get(r.emoji) ?? []), r.user_id])
    return [...m.entries()]
  }, [reazioni])

  if (c.eliminato_at)
    return (
      <div className={cn("flex py-1", mio ? "justify-end" : "justify-start pl-9")}>
        <span className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs italic text-muted-foreground">Messaggio eliminato</span>
      </div>
    )

  return (
    <div tabIndex={-1} className={cn("group flex gap-2 outline-none", mio ? "flex-row-reverse" : "flex-row", raggruppato ? "pt-0.5" : "pt-2")}>
      <div className="w-7 shrink-0">{!mio && !raggruppato ? <AvatarPersona id={c.autore} misura="md" className="h-7 w-7" /> : null}</div>
      <div className={cn("flex min-w-0 max-w-[85%] flex-col", mio ? "items-end" : "items-start")}>
        {!raggruppato ? (
          <div className={cn("mb-0.5 flex items-baseline gap-2 px-1 text-[11px] text-muted-foreground", mio && "flex-row-reverse")}>
            <span className="font-semibold text-foreground">{mio ? "Tu" : (autore?.nome ?? "Qualcuno")}</span>
            <span>{oraRoma(c.creato_at)}</span>
            {c.modificato_at ? <span>(modificato)</span> : null}
          </div>
        ) : null}
        <div className="relative">
          <div className={cn("rounded-2xl px-3 py-2 text-sm", mio ? "rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md bg-muted")}>
            {risposta ? (
              <div className={cn("mb-1.5 border-l-2 pl-2 text-xs", mio ? "border-primary-foreground/50 text-primary-foreground/80" : "border-primary/50 text-muted-foreground")}>
                <span className="font-semibold">{risposta.autore === me ? "Tu" : primoNome(persona(risposta.autore)?.nome)}</span>
                <span className="line-clamp-2">{risposta.eliminato_at ? "Messaggio eliminato" : risposta.testo || "Allegato"}</span>
              </div>
            ) : null}
            {foto.length ? (
              <div className={cn("mb-1 grid gap-1", foto.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {foto.map((a, i) => (
                  <button key={a.id} type="button" onClick={() => onFoto(foto, i)} className="overflow-hidden rounded-lg bg-black/5">
                    {url[a.percorso] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url[a.percorso]} alt={a.nome} className={cn("w-full object-cover", foto.length === 1 ? "max-h-72" : "aspect-square")} loading="lazy" />
                    ) : (
                      <span className="flex aspect-square w-40 items-center justify-center">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : null}
            {altri.map((a) =>
              eVideo(a.tipo_mime) && url[a.percorso] ? (
                <video key={a.id} src={url[a.percorso]} controls className="mb-1 max-h-72 rounded-lg" />
              ) : eAudio(a.tipo_mime) && url[a.percorso] ? (
                <audio key={a.id} src={url[a.percorso]} controls className="mb-1 w-64 max-w-full" />
              ) : (
                <a
                  key={a.id}
                  href={url[a.percorso]}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", mio ? "bg-primary-foreground/15" : "bg-background")}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{a.nome}</span>
                  <span className="shrink-0 opacity-70">{dimensioneFile(a.dimensione)}</span>
                </a>
              ),
            )}
            {c.testo ? <TestoMessaggio testo={c.testo} menzioni={c.menzioni} /> : null}
          </div>
          {/* Azioni al passaggio del mouse; su touch compaiono toccando il messaggio (che prende il focus) */}
          <div
            className={cn(
              "absolute -top-3 flex items-center gap-0.5 rounded-full border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&_button]:p-1.5 sm:[&_button]:p-1",
              mio ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
            )}
          >
            <Popover
              allinea="center"
              lato="top"
              className="w-auto p-1"
              trigger={
                <button type="button" className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Reagisci">
                  <Smile className="h-3.5 w-3.5" />
                </button>
              }
            >
              <div className="flex gap-0.5">
                {EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => onReagisci(e)} className="rounded-md p-1 text-lg leading-none hover:bg-accent">
                    {e}
                  </button>
                ))}
              </div>
            </Popover>
            <button type="button" onClick={onRispondi} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Rispondi">
              <Reply className="h-3.5 w-3.5" />
            </button>
            {mio ? (
              <>
                <button type="button" onClick={onModifica} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Modifica">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={onElimina} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-destructive" aria-label="Elimina">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
        {gruppiReazioni.length ? (
          <div className={cn("-mt-1 flex flex-wrap gap-1 px-1", mio && "justify-end")}>
            {gruppiReazioni.map(([emoji, chi]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReagisci(emoji)}
                title={chi.map((id) => (id === me ? "Tu" : (persona(id)?.nome ?? "?"))).join(", ")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm",
                  chi.includes(me ?? "") ? "border-primary/50 bg-primary/10" : "border-border",
                )}
              >
                <span>{emoji}</span>
                <span className="tabular-nums text-muted-foreground">{chi.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Casella di scrittura: Invio manda, Maiusc+Invio va a capo, @ per menzionare, incolla/trascina foto. */
function Compositore({
  t,
  rispondiA,
  onTogliRisposta,
  modifica,
  onFineModifica,
  onScrive,
  onInviato,
}: {
  t: Task
  rispondiA: Commento | null
  onTogliRisposta: () => void
  modifica: Commento | null
  onFineModifica: () => void
  onScrive: () => void
  onInviato: () => void
}) {
  const { api, base, me, persona, config } = useAttivita()
  const [testo, setTesto] = useState("")
  const [menzionati, setMenzionati] = useState<string[]>([])
  const [file, setFile] = useState<File[]>([])
  const [invio, setInvio] = useState(false)
  const [cerca, setCerca] = useState<{ q: string; da: number } | null>(null)
  const [scelta, setScelta] = useState(0)
  const [sopra, setSopra] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const inputFile = useRef<HTMLInputElement>(null)
  const inputFoto = useRef<HTMLInputElement>(null)
  const bozzaChiave = `attivita:bozza:${t.id}`

  // Bozza ricordata per attività (se si chiude il pannello a metà).
  useEffect(() => {
    try {
      const b = window.localStorage.getItem(bozzaChiave)
      if (b) setTesto(b)
    } catch {
      // niente storage
    }
  }, [bozzaChiave])
  useEffect(() => {
    try {
      if (testo && !modifica) window.localStorage.setItem(bozzaChiave, testo)
      else window.localStorage.removeItem(bozzaChiave)
    } catch {
      // niente storage
    }
  }, [testo, bozzaChiave, modifica])

  useEffect(() => {
    if (modifica) {
      setTesto(modifica.testo)
      setMenzionati(modifica.menzioni)
      area.current?.focus()
    }
  }, [modifica])
  useEffect(() => {
    if (rispondiA) area.current?.focus()
  }, [rispondiA])

  const candidati = useMemo<Persona[]>(() => {
    if (!cerca) return []
    const n = normalizza(cerca.q)
    return (base?.persone ?? []).filter((p) => p.attivo && p.auth_id !== me && (!n || normalizza(p.nome).includes(n) || normalizza(p.username ?? "").includes(n))).slice(0, 6)
  }, [cerca, base?.persone, me])

  const aggiornaRicerca = (valore: string, cursore: number) => {
    const prima = valore.slice(0, cursore)
    const m = prima.match(/(^|\s)@([\p{L}\d._-]{0,30})$/u)
    if (m) {
      setCerca({ q: m[2], da: cursore - m[2].length - 1 })
      setScelta(0)
    } else setCerca(null)
  }

  const scegliMenzione = (p: Persona) => {
    if (!cerca) return
    const el = area.current
    const cursore = el?.selectionStart ?? testo.length
    const nuovo = `${testo.slice(0, cerca.da)}@${p.nome} ${testo.slice(cursore)}`
    setTesto(nuovo)
    setMenzionati((m) => [...new Set([...m, p.auth_id])])
    setCerca(null)
    requestAnimationFrame(() => {
      const pos = cerca.da + p.nome.length + 2
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const invia = async () => {
    const pulito = testo.trim()
    if ((!pulito && !file.length) || invio) return
    const menzioni = menzionati.filter((id) => {
      const nome = persona(id)?.nome
      return !!nome && pulito.includes(`@${nome}`)
    })
    setInvio(true)
    try {
      if (modifica) {
        await api.modificaCommento(modifica.id, pulito, menzioni)
        onFineModifica()
      } else {
        const c = await api.inviaCommento(t.id, pulito, menzioni, rispondiA?.id ?? null)
        if (file.length) await caricaFile(api, t.id, file, c.id)
        const avvisati = [...new Set([...t.osservatori, ...t.assegnatari.map((a) => a.user_id), ...menzioni])].filter((u) => u !== me)
        if (avvisati.length && !t.personale) config.dopo?.({ tipo: "messaggio", taskId: t.id, utenti: avvisati })
      }
      setTesto("")
      setMenzionati([])
      setFile([])
      onInviato()
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    } finally {
      setInvio(false)
    }
  }

  const tasto = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (cerca && candidati.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setScelta((s) => (s + 1) % candidati.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setScelta((s) => (s - 1 + candidati.length) % candidati.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        scegliMenzione(candidati[scelta])
        return
      }
      if (e.key === "Escape") {
        setCerca(null)
        return
      }
    }
    // Invio manda il messaggio; su touch (niente Maiusc+Invio) va a capo e si manda col bottone
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault()
      void invia()
    }
    if (e.key === "Escape" && modifica) {
      onFineModifica()
      setTesto("")
    }
  }

  const incolla = (e: ClipboardEvent) => {
    const presi = [...e.clipboardData.files]
    if (presi.length) {
      e.preventDefault()
      setFile((f) => [...f, ...presi])
    }
  }

  const rilascia = (e: DragEvent) => {
    e.preventDefault()
    setSopra(false)
    if (e.dataTransfer.files.length) setFile((f) => [...f, ...e.dataTransfer.files])
  }

  return (
    <div
      className={cn("relative border-t border-border bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]", sopra && "bg-primary/5")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setSopra(true)
        }
      }}
      onDragLeave={() => setSopra(false)}
      onDrop={rilascia}
    >
      {cerca && candidati.length ? (
        <div className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg">
          {candidati.map((p, i) => (
            <button
              key={p.auth_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                scegliMenzione(p)
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === scelta ? "bg-accent" : "hover:bg-accent/60")}
            >
              <AvatarPersona id={p.auth_id} misura="sm" />
              <span className="truncate">{p.nome}</span>
            </button>
          ))}
        </div>
      ) : null}
      {rispondiA || modifica ? (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs">
          {modifica ? <Pencil className="h-3.5 w-3.5 shrink-0" /> : <Reply className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">
            {modifica ? (
              "Modifica del messaggio"
            ) : (
              <>
                Rispondi a <b>{rispondiA!.autore === me ? "te" : primoNome(persona(rispondiA!.autore)?.nome)}</b>: {rispondiA!.testo || "allegato"}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              if (modifica) {
                onFineModifica()
                setTesto("")
              } else onTogliRisposta()
            }}
            aria-label="Annulla"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {file.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {file.map((f, i) => (
            <span key={`${f.name}${i}`} className="inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.name || "foto incollata"}</span>
              <button type="button" onClick={() => setFile((l) => l.filter((_, j) => j !== i))} aria-label="Togli">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <button type="button" onClick={() => inputFile.current?.click()} className="mb-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Allega file">
          <Paperclip className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => inputFoto.current?.click()} className="mb-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden" aria-label="Scatta foto">
          <Camera className="h-4 w-4" />
        </button>
        <input ref={inputFile} type="file" multiple hidden onChange={(e) => (setFile((f) => [...f, ...(e.target.files ?? [])]), (e.target.value = ""))} />
        <input ref={inputFoto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (setFile((f) => [...f, ...(e.target.files ?? [])]), (e.target.value = ""))} />
        <AreaTesto
          ref={area}
          value={testo}
          righeMax={8}
          onChange={(e) => {
            setTesto(e.target.value)
            aggiornaRicerca(e.target.value, e.target.selectionStart ?? e.target.value.length)
            onScrive()
          }}
          onKeyDown={tasto}
          onPaste={incolla}
          placeholder={t.personale ? "Note per te…" : "Scrivi un messaggio…"}
          className="min-h-9 flex-1 rounded-2xl bg-muted/40 px-3.5"
        />
        <button
          type="button"
          onClick={() => void invia()}
          disabled={invio || (!testo.trim() && !file.length)}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          aria-label="Invia"
        >
          {invio ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
