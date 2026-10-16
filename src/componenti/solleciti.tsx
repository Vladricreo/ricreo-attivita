"use client"

import { BellRing, Megaphone } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { eAdmin, oraRoma, primoNome, quandoRelativo } from "../regole"
import type { Sollecito, Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { AreaTesto, Etichetta } from "../ui/campi"
import { cn } from "../ui/cn"
import { Dialogo } from "../ui/dialogo"
import { AvatarPersona } from "./persone"

/**
 * Solleciti: un admin, o il manager di una persona (tasks.manager_persone), le ricorda un'attività
 * in cui è coinvolta. Normale = notifica nell'app della categoria; forte = in più un popup in
 * quell'app che resta finché la persona non lo conferma (PopupSolleciti, montato dal provider).
 * I permessi veri li controlla tasks.sollecita() nel database.
 */

/** Persone dell'attività che posso sollecitare (vuoto se non sono admin né manager di nessuna). */
export function useSollecitabili(t: Task): string[] {
  const { me, persona, base } = useAttivita()
  return useMemo(() => {
    if (!me || !base || t.personale || t.completata_at || t.eliminata_at || t.archiviata_at) return []
    const admin = eAdmin(persona(me))
    const seguo = new Set(base.manager.filter((m) => m.manager_id === me).map((m) => m.persona_id))
    if (!admin && !seguo.size) return []
    const coinvolte = [...t.assegnatari.map((a) => a.user_id), t.creato_da, ...t.osservatori]
    return [...new Set(coinvolte)].filter((u): u is string => !!u && u !== me && (admin || seguo.has(u)) && persona(u)?.attivo !== false)
  }, [me, base, persona, t])
}

/** Finestra per mandare un sollecito (normale o forte) a una persona dell'attività. */
export function DialogoSollecito({ t, aperto, onChiudi }: { t: Task; aperto: boolean; onChiudi: () => void }) {
  const { api, me, persona, categoria, base, config } = useAttivita()
  const persone = useSollecitabili(t)
  const [chi, setChi] = useState<string | null>(null)
  const [forte, setForte] = useState(false)
  const [messaggio, setMessaggio] = useState("")
  const [invio, setInvio] = useState(false)
  const [mandati, setMandati] = useState<Sollecito[] | null>(null)

  // Di default: il primo assegnatario sollecitabile.
  useEffect(() => {
    if (!aperto) return
    setChi((c) => (c && persone.includes(c) ? c : (t.assegnatari.map((a) => a.user_id).find((u) => persone.includes(u)) ?? persone[0] ?? null)))
  }, [aperto, persone, t.assegnatari])

  useEffect(() => {
    if (!aperto || !me) return
    let vivo = true
    api.sollecitiMandati(t.id, me).then(
      (r) => vivo && setMandati(r),
      () => vivo && setMandati([]),
    )
    return () => {
      vivo = false
    }
  }, [aperto, api, me, t.id])

  // Dove arriva: app della categoria se la persona ci entra, altrimenti in tutte le sue app.
  const slug = categoria(t.categoria_id)?.app_slug ?? null
  const p = persona(chi)
  const nomeApp = slug && p?.app.includes(slug) ? (base?.app.find((a) => a.slug === slug)?.nome ?? slug) : null
  const dove = nomeApp ? `in ${nomeApp}` : "in tutte le sue app"

  const chiudi = () => {
    setMessaggio("")
    setForte(false)
    onChiudi()
  }

  const invia = async () => {
    if (!chi) return
    setInvio(true)
    try {
      await api.sollecita(t.id, chi, forte, messaggio.trim() || null)
      config.dopo?.({ tipo: "sollecito", taskId: t.id, utenti: [chi] })
      avviso.ok(`${forte ? "Sollecito forte" : "Promemoria"} inviato a ${primoNome(persona(chi)?.nome ?? "")}`)
      chiudi()
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    } finally {
      setInvio(false)
    }
  }

  const tipi = [
    { forte: false, Icona: BellRing, titolo: "Promemoria", testo: `Notifica ${dove} (campanella e push).` },
    { forte: true, Icona: Megaphone, titolo: "Promemoria forte", testo: `Popup ${dove} che resta finché non lo conferma.` },
  ]

  return (
    <Dialogo
      aperto={aperto}
      onChiudi={chiudi}
      titolo="Sollecita"
      descrizione={`“${t.titolo}”`}
      piede={
        <>
          <Bottone variante="contorno" onClick={chiudi}>
            Annulla
          </Bottone>
          <Bottone onClick={() => void invia()} disabled={!chi || invio} className={cn(forte && "bg-red-600 text-white hover:bg-red-600/90")}>
            {forte ? <Megaphone /> : <BellRing />} {invio ? "Invio…" : "Invia"}
          </Bottone>
        </>
      }
    >
      {!persone.length ? (
        <p className="text-sm text-muted-foreground">Nessuna persona da sollecitare: puoi sollecitare solo chi segui come manager (gli admin tutti).</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Etichetta>A chi</Etichetta>
            <div className="flex flex-wrap gap-1.5">
              {persone.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setChi(u)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-sm transition-colors",
                    chi === u ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent",
                  )}
                >
                  <AvatarPersona id={u} />
                  {persona(u)?.nome ?? "Persona"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Etichetta>Tipo</Etichetta>
            <div className="grid gap-2 sm:grid-cols-2">
              {tipi.map(({ forte: f, Icona, titolo, testo }) => (
                <button
                  key={titolo}
                  type="button"
                  onClick={() => setForte(f)}
                  className={cn(
                    "flex gap-2.5 rounded-lg border p-3 text-left transition-colors",
                    forte === f ? (f ? "border-red-500 bg-red-500/10" : "border-primary bg-primary/10") : "border-border hover:bg-accent",
                  )}
                >
                  <Icona className={cn("mt-0.5 h-4 w-4 shrink-0", f ? "text-red-600 dark:text-red-400" : "text-primary")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{titolo}</span>
                    <span className="block text-xs text-muted-foreground">{testo}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Etichetta htmlFor="sollecito-messaggio">Messaggio (facoltativo)</Etichetta>
            <AreaTesto
              id="sollecito-messaggio"
              value={messaggio}
              maxLength={500}
              righeMax={6}
              placeholder="Es. Serve entro stasera"
              onChange={(e) => setMessaggio(e.target.value)}
            />
          </div>

          {mandati?.length ? (
            <div className="space-y-1.5">
              <Etichetta>Già mandati da te</Etichetta>
              <ul className="space-y-1 text-xs">
                {mandati.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    {s.forte ? <Megaphone className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" /> : <BellRing className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate">
                      {primoNome(persona(s.a)?.nome ?? "")} · {quandoRelativo(s.creato_at)}
                    </span>
                    <span className={cn("shrink-0", s.visto_at ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                      {s.visto_at ? `Visto alle ${oraRoma(s.visto_at)}` : "Non ancora visto"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialogo>
  )
}

type DaConfermare = Sollecito & { titolo: string | null }

/**
 * Popup dei solleciti forti ricevuti, solo nell'app di pertinenza (o in tutte se app_slug è null).
 * Resta finché la persona non conferma; montato una volta dal provider, quindi in ogni pagina.
 */
export function PopupSolleciti() {
  const { api, me, config, persona, base, ricarica, apri } = useAttivita()
  const [lista, setLista] = useState<DaConfermare[]>([])
  const appRef = useRef(config.app)
  appRef.current = config.app

  const carica = useCallback(async () => {
    if (!me) return setLista([])
    try {
      const r = await api.sollecitiDaConfermare(me)
      setLista(r.filter((s) => !s.app_slug || s.app_slug === appRef.current))
    } catch (e) {
      // Schema non ancora aggiornato o rete assente: niente popup, si riprova al prossimo giro.
      console.error("[attivita] solleciti:", messaggioErrore(e))
    }
  }, [api, me])

  useEffect(() => {
    if (!me) {
      setLista([])
      return
    }
    void carica()
    const sb = config.supabase
    const canale = sb
      .channel(`attivita-solleciti:${me}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes" as any, { event: "*", schema: "tasks", table: "solleciti", filter: `a=eq.${me}` }, () => void carica())
      .subscribe()
    const visibile = () => document.visibilityState === "visible" && void carica()
    document.addEventListener("visibilitychange", visibile)
    const giro = setInterval(() => void carica(), 120_000)
    return () => {
      document.removeEventListener("visibilitychange", visibile)
      clearInterval(giro)
      sb.removeChannel(canale)
    }
  }, [me, carica, config.supabase])

  // Serve il nome di chi sollecita: le persone si caricano solo quando c'è un popup.
  const primo = lista[0]
  useEffect(() => {
    if (primo && !base) void ricarica("base")
  }, [primo, base, ricarica])

  // Sul telefono una vibrazione all'arrivo di un sollecito nuovo.
  const visti = useRef(new Set<string>())
  useEffect(() => {
    if (!primo || visti.current.has(primo.id)) return
    visti.current.add(primo.id)
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      /* non supportato */
    }
  }, [primo])

  if (!primo) return null

  const conferma = async (apriDopo: boolean) => {
    setLista((l) => l.filter((s) => s.task_id !== primo.task_id))
    try {
      await api.confermaSollecito(primo.id)
    } catch (e) {
      avviso.errore(messaggioErrore(e))
      void carica()
    }
    if (apriDopo) apri(primo.task_id)
  }

  const nome = persona(primo.da)?.nome ?? "Un responsabile"
  return (
    <Dialogo
      aperto
      bloccante
      onChiudi={() => undefined}
      titolo={
        <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Megaphone className="h-5 w-5" /> Sollecito urgente
        </span>
      }
      descrizione={lista.length > 1 ? `1 di ${lista.length}` : undefined}
      piede={
        <>
          <Bottone variante="contorno" onClick={() => void conferma(false)}>
            Ok, ho visto
          </Bottone>
          <Bottone onClick={() => void conferma(true)}>Apri attività</Bottone>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <AvatarPersona id={primo.da} misura="lg" />
          <div className="min-w-0">
            <div className="text-sm">
              <b>{nome}</b> ti chiede di occuparti di
            </div>
            <div className="text-xs text-muted-foreground">{quandoRelativo(primo.creato_at)}</div>
          </div>
        </div>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-base font-semibold">{primo.titolo ?? "un'attività"}</div>
        {primo.messaggio ? <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">{primo.messaggio}</p> : null}
      </div>
    </Dialogo>
  )
}
