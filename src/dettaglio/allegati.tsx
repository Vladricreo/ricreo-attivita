"use client"

import * as D from "@radix-ui/react-dialog"
import { Camera, ChevronLeft, ChevronRight, Download, FileText, ImageIcon, LoaderCircle, Paperclip, Star, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import { AvatarPersona } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { eAudio, eImmagine, eVideo, preparaFile } from "../dati/immagini"
import { useUrlFirmati } from "../dati/url-firmati"
import { dimensioneFile, quandoRelativo } from "../regole"
import type { Allegato, Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

/** Carica più file su un'attività (foto ridimensionate prima). */
export async function caricaFile(api: ReturnType<typeof useAttivita>["api"], taskId: string, files: File[], commentoId?: string | null): Promise<Allegato[]> {
  const fatti: Allegato[] = []
  for (const f of files) {
    try {
      const p = await preparaFile(f)
      fatti.push(await api.caricaAllegato(taskId, p.blob, { nome: p.nome, tipo: p.tipo, larghezza: p.larghezza, altezza: p.altezza }, commentoId))
    } catch (e) {
      avviso.errore(`${f.name}: ${messaggioErrore(e)}`)
    }
  }
  return fatti
}

export function Allegati({ t }: { t: Task }) {
  const { api, azioni, ricarica, me } = useAttivita()
  const [allegati, setAllegati] = useState<Allegato[] | null>(null)
  const [inCarico, setInCarico] = useState(0)
  const [sopra, setSopra] = useState(false)
  const [aperto, setAperto] = useState<number | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const foto = useRef<HTMLInputElement>(null)

  const carica = useCallback(() => {
    api
      .allegati(t.id)
      .then(setAllegati)
      .catch((e) => avviso.errore(messaggioErrore(e)))
  }, [api, t.id])
  useEffect(() => carica(), [carica, t.n_allegati])

  const url = useUrlFirmati((allegati ?? []).map((a) => a.percorso))
  const immagini = (allegati ?? []).filter((a) => eImmagine(a.tipo_mime))

  const invia = async (lista: File[]) => {
    if (!lista.length) return
    setInCarico((n) => n + lista.length)
    await caricaFile(api, t.id, lista)
    setInCarico((n) => n - lista.length)
    carica()
    void ricarica("tasks")
  }

  const rilascia = (e: DragEvent) => {
    e.preventDefault()
    setSopra(false)
    void invia([...e.dataTransfer.files])
  }

  return (
    <section
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setSopra(true)
        }
      }}
      onDragLeave={() => setSopra(false)}
      onDrop={rilascia}
      className={cn("rounded-lg transition-colors", sopra && "bg-primary/5 ring-2 ring-primary/40")}
    >
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold">Foto e file</h4>
        {allegati?.length ? <span className="text-xs text-muted-foreground">{allegati.length}</span> : null}
        <span className="flex-1" />
        <Bottone variante="fantasma" misura="sm" onClick={() => foto.current?.click()} className="sm:hidden">
          <Camera /> Foto
        </Bottone>
        <Bottone variante="fantasma" misura="sm" onClick={() => file.current?.click()}>
          <Paperclip /> Aggiungi
        </Bottone>
        <input ref={file} type="file" multiple hidden onChange={(e) => (void invia([...(e.target.files ?? [])]), (e.target.value = ""))} />
        <input ref={foto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void invia([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </div>
      {allegati && !allegati.length && !inCarico ? (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:bg-accent/40"
        >
          <ImageIcon className="h-4 w-4" /> Trascina qui foto o file, oppure clicca
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(allegati ?? []).map((a) => {
            const img = eImmagine(a.tipo_mime)
            const copertina = t.copertina_id === a.id
            return (
              <div key={a.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
                {img ? (
                  <button type="button" className="block aspect-square w-full" onClick={() => setAperto(immagini.findIndex((x) => x.id === a.id))}>
                    {url[a.percorso] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url[a.percorso]} alt={a.nome} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                      </span>
                    )}
                  </button>
                ) : (
                  <a href={url[a.percorso]} target="_blank" rel="noreferrer" className="flex aspect-square w-full flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                    <span className="line-clamp-2 break-all text-[11px]">{a.nome}</span>
                    <span className="text-[10px] text-muted-foreground">{dimensioneFile(a.dimensione)}</span>
                  </a>
                )}
                {copertina ? <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Copertina</span> : null}
                <div className="absolute right-1 top-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  {img && !copertina ? (
                    <Suggerimento testo="Usa come copertina della scheda">
                      <button type="button" className="rounded bg-black/60 p-1 text-white hover:bg-black/80" onClick={() => void azioni.aggiorna(t.id, { copertina_id: a.id })}>
                        <Star className="h-3 w-3" />
                      </button>
                    </Suggerimento>
                  ) : null}
                  {a.caricato_da === me || t.creato_da === me ? (
                    <Suggerimento testo="Togli">
                      <button
                        type="button"
                        className="rounded bg-black/60 p-1 text-white hover:bg-red-600"
                        onClick={async () => {
                          try {
                            await api.eliminaAllegato(a)
                            carica()
                            void ricarica("tasks")
                          } catch (e) {
                            avviso.errore(messaggioErrore(e))
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Suggerimento>
                  ) : null}
                </div>
              </div>
            )
          })}
          {Array.from({ length: inCarico }, (_, i) => (
            <div key={`c${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border">
              <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
      <Galleria immagini={immagini} url={url} indice={aperto} onCambia={setAperto} />
    </section>
  )
}

/** Foto a schermo intero con frecce (tastiera e tocco). */
export function Galleria({
  immagini,
  url,
  indice,
  onCambia,
}: {
  immagini: Allegato[]
  url: Record<string, string>
  indice: number | null
  onCambia: (i: number | null) => void
}) {
  const a = indice != null ? immagini[indice] : null
  const tocco = useRef<number | null>(null)
  const vai = (d: number) => indice != null && immagini.length && onCambia((indice + d + immagini.length) % immagini.length)
  return (
    <D.Root open={!!a} onOpenChange={(v) => !v && onCambia(null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <D.Content
          className="fixed inset-0 z-[60] flex flex-col focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") vai(1)
            if (e.key === "ArrowLeft") vai(-1)
          }}
          onTouchStart={(e) => (tocco.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (tocco.current == null) return
            const dx = e.changedTouches[0].clientX - tocco.current
            if (Math.abs(dx) > 50) vai(dx < 0 ? 1 : -1)
            tocco.current = null
          }}
        >
          <D.Title className="sr-only">{a?.nome ?? "Foto"}</D.Title>
          <D.Description className="sr-only">Anteprima della foto</D.Description>
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-white">
            {a?.caricato_da ? <AvatarPersona id={a.caricato_da} misura="sm" /> : null}
            <span className="min-w-0 flex-1 truncate">
              {a?.nome}
              {a ? <span className="ml-2 text-white/60">{quandoRelativo(a.caricato_at)}</span> : null}
            </span>
            {a && url[a.percorso] ? (
              <a href={url[a.percorso]} download={a.nome} target="_blank" rel="noreferrer" className="rounded-md p-2 hover:bg-white/10" aria-label="Scarica">
                <Download className="h-4 w-4" />
              </a>
            ) : null}
            <D.Close className="rounded-md p-2 hover:bg-white/10" aria-label="Chiudi">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onClick={() => onCambia(null)}>
            {a && url[a.percorso] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url[a.percorso]} alt={a.nome} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            ) : null}
            {immagini.length > 1 ? (
              <>
                <button type="button" onClick={(e) => (e.stopPropagation(), vai(-1))} className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Precedente">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button type="button" onClick={(e) => (e.stopPropagation(), vai(1))} className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Successiva">
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            ) : null}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export { eAudio, eVideo }
