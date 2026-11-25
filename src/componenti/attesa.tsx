"use client"

import { ArrowUpRight, Ban, CalendarClock, Hourglass, Play, Shuffle, Snowflake } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useAttivita } from "../contesto"
import {
  aggiungiGiorniIso,
  daRicontrollare,
  dataBreve,
  ESITI,
  ferma,
  giorniFerma,
  giorniTraIso,
  inAttesa,
  oggiIso,
  primoNome,
  prossimaData,
  quandoRelativo,
  scadenzaRelativa,
} from "../regole"
import type { Esito, Task } from "../tipi"
import { Bottone } from "../ui/bottone"
import { AreaTesto, Campo, Etichetta, Interruttore } from "../ui/campi"
import { cn } from "../ui/cn"
import { Dialogo } from "../ui/dialogo"
import { Suggerimento } from "../ui/suggerimento"
import { SelettoreData } from "./selettori"

/**
 * Attività che non dipendono da chi le deve fare (in attesa, con il giorno in cui ricontrollare), attività
 * chiuse senza farle (con il perché e l'eventuale sostituta) e attività ferme: finestre, etichette e riquadri.
 */

const VIOLA = "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
const AMBRA = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
const GRIGIO = "border-border bg-muted/60 text-muted-foreground"
const ETICHETTA = "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"

/** Testo del giorno di ricontrollo: «ricontrolla ven 5 dic», «da ricontrollare da 3 giorni». */
export function testoRicontrollo(t: Task, oggi = oggiIso()): string | null {
  if (!t.ricontrolla_il) return null
  const g = giorniTraIso(oggi, t.ricontrolla_il)
  if (g < -1) return `da ricontrollare da ${-g} giorni`
  if (g === -1) return "da ricontrollare da ieri"
  if (g === 0) return "da ricontrollare oggi"
  return `ricontrolla ${scadenzaRelativa(t.ricontrolla_il, oggi).toLowerCase()}`
}

/** Etichetta «In attesa» (viola), che diventa ambra il giorno in cui va ricontrollata. */
export function BadgeAttesa({ t, breve, className }: { t: Task; breve?: boolean; className?: string }) {
  if (!inAttesa(t)) return null
  const oggi = oggiIso()
  const ora = daRicontrollare(t, oggi)
  const quando = testoRicontrollo(t, oggi)
  return (
    <Suggerimento
      testo={
        <span className="block space-y-0.5">
          <span className="block font-medium">Aspetta: {t.attesa_motivo}</span>
          <span className="block opacity-80">{quando ? `${quando.charAt(0).toUpperCase()}${quando.slice(1)}` : "Senza un giorno in cui ricontrollare"}</span>
        </span>
      }
    >
      <span className={cn(ETICHETTA, ora ? AMBRA : VIOLA, className)}>
        {ora ? <CalendarClock className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
        {ora ? "Da ricontrollare" : breve || !t.ricontrolla_il ? "In attesa" : `In attesa · ${dataBreve(t.ricontrolla_il, oggi)}`}
      </span>
    </Suggerimento>
  )
}

/** Etichetta «Ferma da N giorni» per le attività aperte che nessuno tocca. */
export function BadgeFerma({ t, className }: { t: Task; className?: string }) {
  const oggi = oggiIso()
  if (!ferma(t, oggi)) return null
  const g = giorniFerma(t, oggi)
  return (
    <Suggerimento testo={`Nessuna modifica o messaggio da ${g} giorni: è ancora da fare?`}>
      <span className={cn(ETICHETTA, GRIGIO, className)}>
        <Snowflake className="h-3 w-3" />
        Ferma da {g} g
      </span>
    </Suggerimento>
  )
}

/** Etichetta dell'esito di un'attività chiusa senza farla. */
export function BadgeEsito({ t, className }: { t: Task; className?: string }) {
  if (!t.esito || !t.archiviata_at) return null
  const e = ESITI[t.esito]
  return (
    <span className={cn(ETICHETTA, e.chip, className)}>
      {t.esito === "superata" ? <Shuffle className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
      {e.label}
    </span>
  )
}

/** Le etichette che servono su una riga o una scheda: in attesa, oppure ferma. */
export function SegnaliTask({ t, breve, className }: { t: Task; breve?: boolean; className?: string }) {
  if (t.archiviata_at) return <BadgeEsito t={t} className={className} />
  if (inAttesa(t)) return <BadgeAttesa t={t} breve={breve} className={className} />
  return <BadgeFerma t={t} className={className} />
}

function Scelta({ attiva, onClick, children, disabled }: { attiva: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={attiva}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        attiva ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** Mette in attesa (o modifica l'attesa): cosa si aspetta e quando tornare a guardarla. */
export function DialogoAttesa({ t, aperto, onChiudi }: { t: Task; aperto: boolean; onChiudi: () => void }) {
  const { azioni } = useAttivita()
  const oggi = oggiIso()
  const gia = !!t.attesa_motivo
  const [motivo, setMotivo] = useState("")
  const [quando, setQuando] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  useEffect(() => {
    if (!aperto) return
    setMotivo(t.attesa_motivo ?? "")
    setQuando(t.attesa_motivo ? t.ricontrolla_il : aggiungiGiorniIso(oggi, 7))
  }, [aperto]) // eslint-disable-line react-hooks/exhaustive-deps

  const rapide: [string, string][] = [
    ["Domani", aggiungiGiorniIso(oggi, 1)],
    ["Tra 3 giorni", aggiungiGiorniIso(oggi, 3)],
    ["Tra una settimana", aggiungiGiorniIso(oggi, 7)],
    ["Tra due settimane", aggiungiGiorniIso(oggi, 14)],
    ["Tra un mese", prossimaData(oggi, "month", 1)],
  ]
  const altra = !!quando && !rapide.some(([, v]) => v === quando)
  const valido = motivo.trim().length > 0

  const salva = async () => {
    if (!valido || invio) return
    setInvio(true)
    const riuscito = await azioni.mettiInAttesa(t, motivo, quando)
    setInvio(false)
    if (riuscito) onChiudi()
  }

  return (
    <Dialogo
      aperto={aperto}
      onChiudi={onChiudi}
      titolo={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300">
            <Hourglass className="h-4 w-4" />
          </span>
          {gia ? "In attesa" : "Metti in attesa"}
        </span>
      }
      descrizione="Per quando non dipende da te. Resta tua, ma esce dalle cose da fare finché non è il giorno di ricontrollarla."
      piede={
        <>
          {gia ? (
            <Bottone
              variante="fantasma"
              className="mr-auto"
              onClick={() => {
                void azioni.riprendi(t)
                onChiudi()
              }}
            >
              <Play /> Si riparte
            </Bottone>
          ) : null}
          <Bottone variante="contorno" onClick={onChiudi}>
            Annulla
          </Bottone>
          <Bottone onClick={() => void salva()} disabled={!valido || invio}>
            {gia ? "Salva" : "Metti in attesa"}
          </Bottone>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Etichetta htmlFor="attesa-motivo">Cosa o chi stai aspettando?</Etichetta>
          <AreaTesto
            id="attesa-motivo"
            autoFocus
            value={motivo}
            maxLength={500}
            righeMax={5}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void salva()
            }}
            placeholder="Es. la risposta del fornitore sul preventivo"
          />
        </div>
        <div className="space-y-2">
          <Etichetta>Quando torni a guardarla?</Etichetta>
          <div className="flex flex-wrap gap-1.5">
            {rapide.map(([l, v]) => (
              <Scelta key={l} attiva={quando === v} onClick={() => setQuando(v)}>
                {l}
              </Scelta>
            ))}
            <SelettoreData
              valore={quando}
              minimo={oggi}
              titolo="Giorno in cui ricontrollare"
              onCambia={setQuando}
              trigger={
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    altra ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <CalendarClock className="h-3 w-3" /> {altra && quando ? dataBreve(quando, oggi) : "Un altro giorno"}
                </button>
              }
            />
            <Scelta attiva={quando === null} onClick={() => setQuando(null)}>
              Non lo so
            </Scelta>
          </div>
          <p className={cn("rounded-md border px-2.5 py-2 text-xs", quando ? "border-border bg-muted/40 text-muted-foreground" : AMBRA)}>
            {quando
              ? `Il ${dataBreve(quando, oggi)} torna tra le cose da guardare e ti arriva un promemoria. Non è una scadenza: è solo il giorno in cui richiedere.`
              : "Senza un giorno rischia di restare lì: te la riproponiamo comunque nella revisione, ma è meglio sceglierne uno."}
          </p>
        </div>
      </div>
    </Dialogo>
  )
}

/** Chiude un'attività senza farla: perché, cosa è successo e (se serve) l'attività che la sostituisce. */
export function DialogoChiusura({ t, aperto, onChiudi }: { t: Task; aperto: boolean; onChiudi: () => void }) {
  const { azioni, apri } = useAttivita()
  const [esito, setEsito] = useState<Esito>("superata")
  const [nota, setNota] = useState("")
  const [sostituisci, setSostituisci] = useState(false)
  const [titoloNuova, setTitoloNuova] = useState("")
  const [invio, setInvio] = useState(false)

  useEffect(() => {
    if (!aperto) return
    setEsito("superata")
    setNota("")
    setSostituisci(false)
    setTitoloNuova("")
  }, [aperto])

  const valido = !sostituisci || titoloNuova.trim().length > 0

  const chiudi = async () => {
    if (!valido || invio) return
    setInvio(true)
    let nuova: string | null = null
    if (sostituisci) {
      nuova = await azioni.crea({
        titolo: titoloNuova.trim(),
        descrizione: `Sostituisce “${t.titolo}”${nota.trim() ? `: ${nota.trim()}` : "."}`,
        categoria_id: t.categoria_id,
        sottocategoria_id: t.sottocategoria_id,
        priorita: t.priorita,
        personale: t.personale,
        padre_id: t.padre_id,
        assegnatari: t.assegnatari.map((a) => a.user_id),
        collegamenti: t.collegamenti.map(({ id: _id, ...c }) => c),
      })
      if (!nuova) {
        setInvio(false)
        return
      }
    }
    const riuscito = await azioni.chiudiSenzaFare(t, { esito, nota, sostituitaDa: nuova })
    setInvio(false)
    if (!riuscito) return
    onChiudi()
    if (nuova) apri(nuova)
  }

  return (
    <Dialogo
      aperto={aperto}
      onChiudi={onChiudi}
      titolo="Chiudi senza farla"
      descrizione="Chiudere non vuol dire averla fatta: resta in archivio con il motivo, e chi la seguiva viene avvisato."
      piede={
        <>
          <Bottone variante="contorno" onClick={onChiudi}>
            Annulla
          </Bottone>
          <Bottone onClick={() => void chiudi()} disabled={!valido || invio}>
            {sostituisci ? "Chiudi e crea la nuova" : "Chiudi senza farla"}
          </Bottone>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(ESITI) as Esito[]).reverse().map((k) => {
            const attivo = esito === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={attivo}
                onClick={() => setEsito(k)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  attivo ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {k === "superata" ? <Shuffle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <Ban className="h-4 w-4 text-muted-foreground" />}
                  {ESITI[k].label}
                </span>
                <span className="text-xs text-muted-foreground">{ESITI[k].descrizione}</span>
              </button>
            )
          })}
        </div>
        <div className="space-y-1.5">
          <Etichetta htmlFor="chiusura-nota">{esito === "superata" ? "Cosa è successo?" : "Perché non serve più?"}</Etichetta>
          <AreaTesto
            id="chiusura-nota"
            value={nota}
            maxLength={500}
            righeMax={5}
            onChange={(e) => setNota(e.target.value)}
            placeholder={esito === "superata" ? "Es. il cliente ha risposto che vuole solo la versione online" : "Es. il progetto è stato fermato"}
          />
        </div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <Interruttore attivo={sostituisci} onCambia={setSostituisci} etichetta="Crea l'attività che la sostituisce" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">C&apos;è una cosa nuova da fare al suo posto</span>
              <span className="block text-xs text-muted-foreground">Nasce con le stesse persone, categoria e collegamenti, e resta legata a questa.</span>
            </span>
          </label>
          {sostituisci ? (
            <Campo
              autoFocus
              value={titoloNuova}
              maxLength={300}
              onChange={(e) => setTitoloNuova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void chiudi()
              }}
              placeholder="Cosa va fatto adesso?"
              aria-label="Titolo della nuova attività"
            />
          ) : null}
        </div>
      </div>
    </Dialogo>
  )
}

/** Riquadro nel dettaglio: cosa aspetta e da quando, oppure perché è stata chiusa e cosa l'ha sostituita. */
export function RiquadroAttesa({ t, onApri }: { t: Task; onApri: (id: string) => void }) {
  const { azioni, persona, tasks, perId } = useAttivita()
  const [modifica, setModifica] = useState(false)
  const oggi = oggiIso()
  const sostituta = t.sostituita_da ? perId.get(t.sostituita_da) : null
  const sostituisce = (tasks ?? []).find((x) => x.sostituita_da === t.id)

  const legame = (testo: string, altra: Task) => (
    <button
      type="button"
      onClick={() => onApri(altra.id)}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-sm hover:bg-accent/50"
    >
      <Shuffle className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {testo} <b>{altra.titolo}</b>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )

  if (t.archiviata_at && t.esito) {
    return (
      <div className="space-y-2">
        <div className={cn("rounded-lg border px-3 py-2 text-sm", t.esito === "superata" ? AMBRA : GRIGIO)}>
          <div className="flex items-center gap-2 font-medium">
            {t.esito === "superata" ? <Shuffle className="h-4 w-4 shrink-0" /> : <Ban className="h-4 w-4 shrink-0" />}
            Chiusa senza farla · {ESITI[t.esito].label.toLowerCase()}
          </div>
          {t.archivio_motivo ? <p className="mt-1 whitespace-pre-wrap break-words text-foreground/90">{t.archivio_motivo}</p> : null}
          <p className="mt-1 text-xs opacity-80">
            {primoNome(persona(t.archiviata_da)?.nome)} · {quandoRelativo(t.archiviata_at)}
          </p>
        </div>
        {sostituta ? legame("Sostituita da", sostituta) : null}
      </div>
    )
  }

  if (!inAttesa(t)) return sostituisce ? legame("Sostituisce", sostituisce) : null

  const ora = daRicontrollare(t, oggi)
  const quando = testoRicontrollo(t, oggi)
  return (
    <div className="space-y-2">
      <div className={cn("rounded-lg border px-3 py-2.5 text-sm", ora ? AMBRA : VIOLA)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {ora ? <CalendarClock className="h-4 w-4 shrink-0" /> : <Hourglass className="h-4 w-4 shrink-0" />}
          <span className="font-medium">{ora ? "È ora di ricontrollare" : "In attesa"}</span>
          <span className="text-xs opacity-80">
            {t.attesa_dal ? `da ${quandoRelativo(t.attesa_dal).replace(/ fa$/, "")}` : ""}
            {t.attesa_da ? ` · ${primoNome(persona(t.attesa_da)?.nome)}` : ""}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-foreground/90">{t.attesa_motivo}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-auto text-xs opacity-90">{quando ? `${quando.charAt(0).toUpperCase()}${quando.slice(1)}` : "Nessun giorno in cui ricontrollare"}</span>
          <Bottone variante="contorno" misura="sm" onClick={() => setModifica(true)}>
            {quando ? "Cambia" : "Scegli un giorno"}
          </Bottone>
          <Bottone misura="sm" onClick={() => void azioni.riprendi(t)}>
            <Play /> Si riparte
          </Bottone>
        </div>
      </div>
      {sostituisce ? legame("Sostituisce", sostituisce) : null}
      <DialogoAttesa t={t} aperto={modifica} onChiudi={() => setModifica(false)} />
    </div>
  )
}
