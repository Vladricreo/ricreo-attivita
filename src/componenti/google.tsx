"use client"

import { CalendarDays, ListTodo, Unlink } from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import type { StatoGoogle } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { Interruttore } from "../ui/campi"

/**
 * Collegamento facoltativo a Google Tasks e Google Calendar della persona (Impostazioni).
 * Il consenso lo gestisce un'app sola (Finance): qui si chiede un codice monouso con la propria sessione
 * e si apre il link; al ritorno l'indirizzo ha ?google=collegato|errore.
 */
export function SezioneGoogle() {
  const { api, config } = useAttivita()
  const [stato, setStato] = useState<StatoGoogle | null>(null)
  const [nonDisponibile, setNonDisponibile] = useState(false)
  const [servizi, setServizi] = useState({ tasks: true, calendar: true })
  const [occupato, setOccupato] = useState(false)

  const carica = useCallback(async () => {
    try {
      setStato(await api.statoGoogle())
    } catch {
      // Migration non ancora applicata: la sezione non si mostra.
      setNonDisponibile(true)
    }
  }, [api])

  useEffect(() => {
    void carica()
  }, [carica])

  // Ritorno dal consenso Google.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const esito = p.get("google")
    if (!esito) return
    if (esito === "collegato") avviso.ok("Google collegato: le attività arrivano entro qualche minuto")
    else avviso.errore(p.get("motivo") || "Collegamento Google non riuscito")
    p.delete("google")
    p.delete("motivo")
    const q = p.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`)
  }, [])

  const base = config.collegamentoGoogle ?? stato?.url_app ?? null

  const collega = async (scelti = servizi) => {
    if (base == null) return avviso.errore("Indirizzo dell'app per il collegamento Google non configurato")
    setOccupato(true)
    try {
      const ritorno = new URL(window.location.href)
      ritorno.searchParams.set("vista", "impostazioni")
      ritorno.searchParams.delete("task")
      const codice = await api.avviaGoogle(ritorno.toString(), scelti)
      window.location.assign(`${base.replace(/\/+$/, "")}/api/attivita/google/connect?c=${encodeURIComponent(codice)}`)
    } catch (e) {
      avviso.errore(messaggioErrore(e))
      setOccupato(false)
    }
  }

  const imposta = async (patch: { tasks?: boolean; calendar?: boolean }) => {
    try {
      await api.impostaGoogle(patch)
      await carica()
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }

  const scollega = async () => {
    if (!window.confirm("Scollegare Google? La lista \"Ricreo\" e il calendario \"Ricreo attività\" verranno cancellati da Google.")) return
    setOccupato(true)
    try {
      await api.scollegaGoogle()
      await carica()
      avviso.ok("Google scollegato: lista e calendario spariscono entro qualche minuto")
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    } finally {
      setOccupato(false)
    }
  }

  if (nonDisponibile || !stato) return null

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Google Tasks e Calendar</h3>
        <p className="text-xs text-muted-foreground">
          Facoltativo e personale: le attività assegnate a te con una scadenza compaiono nel tuo Google Tasks (lista &quot;Ricreo&quot;) e/o nel
          tuo Google Calendar (calendario &quot;Ricreo attività&quot;). Si aggiornano da sole ogni pochi minuti; si completano qui nell&apos;app.
        </p>
      </div>

      {stato.collegato ? (
        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Collegato come <span className="font-medium">{stato.email ?? "account Google"}</span>
            </span>
            <span className="flex-1" />
            <Bottone variante="fantasma" misura="sm" disabled={occupato} onClick={() => void scollega()}>
              <Unlink /> Scollega
            </Bottone>
          </div>
          <RigaServizio
            icona={<ListTodo className="h-4 w-4" />}
            nome="Google Tasks"
            attivo={stato.tasks_attivo}
            concesso={stato.tasks_concesso}
            onCambia={(v) => void imposta({ tasks: v })}
          />
          <RigaServizio
            icona={<CalendarDays className="h-4 w-4" />}
            nome="Google Calendar"
            dettaglio="All'ora di scadenza se c'è, altrimenti tutto il giorno. Non ti segna come occupato."
            attivo={stato.calendar_attivo}
            concesso={stato.calendar_concesso}
            onCambia={(v) => void imposta({ calendar: v })}
          />
          {(!stato.tasks_concesso || !stato.calendar_concesso) ? (
            <p className="text-xs text-muted-foreground">
              Per attivare un servizio non concesso ricollega l&apos;account:{" "}
              <button type="button" className="underline" disabled={occupato} onClick={() => void collega({ tasks: true, calendar: true })}>
                ricollega
              </button>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {stato.ultimo_sync_at ? `Ultimo aggiornamento: ${new Date(stato.ultimo_sync_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}` : "Primo aggiornamento in corso…"}
          </p>
          {stato.ultimo_errore ? <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{stato.ultimo_errore}</p> : null}
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Interruttore attivo={servizi.tasks} onCambia={(v) => setServizi((s) => ({ ...s, tasks: v }))} etichetta="Google Tasks" />
              <ListTodo className="h-4 w-4" /> Google Tasks
            </label>
            <label className="flex items-center gap-2">
              <Interruttore attivo={servizi.calendar} onCambia={(v) => setServizi((s) => ({ ...s, calendar: v }))} etichetta="Google Calendar" />
              <CalendarDays className="h-4 w-4" /> Google Calendar
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Bottone misura="sm" disabled={occupato || (!servizi.tasks && !servizi.calendar)} onClick={() => void collega()}>
              Collega Google
            </Bottone>
            <span className="text-xs text-muted-foreground">Accedi con il tuo account Google di lavoro; puoi scollegarti quando vuoi.</span>
          </div>
        </div>
      )}
    </section>
  )
}

function RigaServizio({
  icona,
  nome,
  dettaglio,
  attivo,
  concesso,
  onCambia,
}: {
  icona: ReactNode
  nome: string
  dettaglio?: string
  attivo: boolean
  concesso: boolean
  onCambia: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Interruttore attivo={attivo && concesso} disabilitato={!concesso} onCambia={onCambia} etichetta={nome} />
      <span className="text-muted-foreground">{icona}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{nome}</p>
        {!concesso ? <p className="text-xs text-muted-foreground">Permesso non concesso a Google</p> : dettaglio ? <p className="text-xs text-muted-foreground">{dettaglio}</p> : null}
      </div>
    </div>
  )
}
