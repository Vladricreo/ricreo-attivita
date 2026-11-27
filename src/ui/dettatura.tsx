"use client"

import { Mic, MicOff } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
import { avviso } from "./avvisi"
import { cn } from "./cn"

/* Dettatura vocale con la Web Speech API del browser (Chrome, Edge, Safari).
   Dove il browser non la supporta (es. Firefox) il pulsante non compare. */

type Campo = HTMLTextAreaElement | HTMLInputElement

// Tipi minimi della Web Speech API (non sono ancora nelle librerie DOM di TypeScript).
type Riconoscimento = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type CostruttoreRiconoscimento = new () => Riconoscimento

function costruttore(): CostruttoreRiconoscimento | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: CostruttoreRiconoscimento; webkitSpeechRecognition?: CostruttoreRiconoscimento }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Vero se il browser sa dettare. Si legge dopo il montaggio, per non sbagliare l'idratazione. */
export function useDettaturaDisponibile() {
  const [disponibile, setDisponibile] = useState(false)
  useEffect(() => setDisponibile(costruttore() !== null), [])
  return disponibile
}

/**
 * Inserisce il testo dettato dove sta il cursore del campo, con uno spazio se serve.
 * Passa dal setter nativo e da un evento "input", così l'onChange di React parte come se si scrivesse.
 */
export function inserisciNelCampo(el: Campo, testo: string) {
  const valore = el.value
  const inizio = el.selectionStart ?? valore.length
  const fine = el.selectionEnd ?? inizio
  const prima = valore.slice(0, inizio)
  const dopo = valore.slice(fine)
  let pezzo = testo.trim()
  if (!pezzo) return
  if (prima && !/\s$/.test(prima)) pezzo = " " + pezzo
  // Maiuscola a inizio testo o dopo un punto.
  if (!prima.trim() || /[.!?]\s*$/.test(prima)) pezzo = pezzo.replace(/^(\s*)(\p{L})/u, (_, s: string, c: string) => s + c.toUpperCase())
  if (dopo && !/^\s/.test(dopo)) pezzo += " "
  if (el.maxLength > 0) pezzo = pezzo.slice(0, Math.max(0, el.maxLength - prima.length - dopo.length))
  if (!pezzo) return

  const nuovo = prima + pezzo + dopo
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, nuovo)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  const cursore = prima.length + pezzo.length
  el.setSelectionRange(cursore, cursore)
}

const ERRORI: Record<string, string> = {
  "not-allowed": "Consenti l'uso del microfono al sito per dettare.",
  "service-not-allowed": "Consenti l'uso del microfono al sito per dettare.",
  "audio-capture": "Nessun microfono trovato.",
  network: "Dettatura non disponibile: controlla la connessione.",
}

/**
 * Pulsante col microfono: un clic inizia a dettare nel campo `campo`, un altro clic smette.
 * Si ferma da solo dopo una pausa lunga o quando il componente sparisce.
 */
export function PulsanteDettatura({
  campo,
  className,
  disabilitato,
  lingua = "it-IT",
  onErrore = avviso.errore,
}: {
  campo: RefObject<Campo | null>
  className?: string
  disabilitato?: boolean
  lingua?: string
  onErrore?: (testo: string) => void
}) {
  const disponibile = useDettaturaDisponibile()
  const [ascolta, setAscolta] = useState(false)
  const riconoscimento = useRef<Riconoscimento | null>(null)
  const errore = useRef(onErrore)
  errore.current = onErrore

  // Smette di ascoltare se il pulsante sparisce (finestra chiusa, campo smontato).
  useEffect(() => () => riconoscimento.current?.abort(), [])
  useEffect(() => {
    if (disabilitato) riconoscimento.current?.stop()
  }, [disabilitato])

  if (!disponibile) return null

  const alterna = () => {
    if (riconoscimento.current) {
      riconoscimento.current.stop()
      return
    }
    const C = costruttore()
    const el = campo.current
    if (!C || !el) return
    const r = new C()
    r.lang = lingua
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      const bersaglio = campo.current
      if (!bersaglio) return
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const risultato = e.results[i]
        if (risultato.isFinal) inserisciNelCampo(bersaglio, risultato[0].transcript)
      }
    }
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return
      errore.current(ERRORI[e.error] ?? "La dettatura si è interrotta.")
    }
    r.onend = () => {
      riconoscimento.current = null
      setAscolta(false)
    }
    try {
      r.start()
      riconoscimento.current = r
      setAscolta(true)
      el.focus()
    } catch {
      errore.current("Non riesco ad avviare la dettatura.")
    }
  }

  return (
    <button
      type="button"
      // Non toglie il fuoco al campo: il testo va dove sta il cursore.
      onMouseDown={(e) => e.preventDefault()}
      onClick={alterna}
      disabled={disabilitato}
      aria-pressed={ascolta}
      aria-label={ascolta ? "Smetti di dettare" : "Detta"}
      title={ascolta ? "Smetti di dettare" : "Detta con la voce"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        ascolta && "animate-pulse bg-red-500/10 text-red-600 hover:bg-red-500/15 hover:text-red-600 dark:text-red-400",
        className,
      )}
    >
      {ascolta ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </button>
  )
}
