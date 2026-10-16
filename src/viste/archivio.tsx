"use client"

import { Archive, CircleCheck, RotateCcw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgeCategoria } from "../componenti/aspetto"
import { AvatarPersona } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { aggiungiGiorniIso, dataBreve, dataLunga, giornoRoma, normalizza, oggiIso, quandoRelativo } from "../regole"
import type { Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"

type Sezione = "archiviate" | "completate" | "cestino"

export function VistaArchivio({ onApri, testo }: { onApri: (t: Task) => void; testo: string }) {
  const { tasks, api, azioni, config } = useAttivita()
  const [sezione, setSezione] = useState<Sezione>("archiviate")
  const [cestino, setCestino] = useState<Task[] | null>(null)
  const [vecchie, setVecchie] = useState<Task[]>([])
  const [finite, setFinite] = useState(false)
  const n = normalizza(testo.trim())
  const passa = (t: Task) => !n || normalizza(`${t.titolo} ${t.descrizione ?? ""} ${t.archivio_motivo ?? ""}`).includes(n)

  const archiviate = useMemo(() => (tasks ?? []).filter((t) => t.archiviata_at && !t.padre_id && passa(t)).sort((a, b) => b.archiviata_at!.localeCompare(a.archiviata_at!)), [tasks, n]) // eslint-disable-line react-hooks/exhaustive-deps
  const completate = useMemo(() => {
    const recenti = (tasks ?? []).filter((t) => t.completata_at && !t.archiviata_at && passa(t))
    const ids = new Set(recenti.map((t) => t.id))
    return [...recenti, ...vecchie.filter((t) => !ids.has(t.id) && passa(t))].sort((a, b) => b.completata_at!.localeCompare(a.completata_at!))
  }, [tasks, vecchie, n]) // eslint-disable-line react-hooks/exhaustive-deps

  const caricaCestino = useCallback(() => {
    api
      .eliminate()
      .then(setCestino)
      .catch((e) => avviso.errore(messaggioErrore(e)))
  }, [api])
  useEffect(() => {
    if (sezione === "cestino") caricaCestino()
  }, [sezione, caricaCestino, tasks])

  const altre = async () => {
    const ultima = completate[completate.length - 1]?.completata_at ?? `${aggiungiGiorniIso(oggiIso(), -120)}T00:00:00Z`
    try {
      const r = await api.completatePrima(ultima, 100)
      setVecchie((v) => [...v, ...r])
      if (r.length < 100) setFinite(true)
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    }
  }

  const elenco = sezione === "archiviate" ? archiviate : sezione === "completate" ? completate : (cestino ?? []).filter((t) => passa(t) && (!t.padre_id || !(cestino ?? []).some((x) => x.id === t.padre_id)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["archiviate", "Archiviate", Archive],
              ["completate", "Completate", CircleCheck],
              ["cestino", "Cestino", Trash2],
            ] as const
          ).map(([k, l, Icona]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSezione(k)}
              className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", sezione === k ? "bg-accent" : "text-muted-foreground hover:text-foreground")}
            >
              <Icona className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {sezione === "archiviate"
            ? "Attività che non si fanno più: restano consultabili e si possono riportare tra quelle da fare."
            : sezione === "cestino"
              ? "Le attività eliminate restano qui un anno, poi vengono cancellate con foto e messaggi."
              : "Lo storico di quello che è stato fatto."}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {elenco.map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-accent/30">
            <button type="button" onClick={() => onApri(t)} className="min-w-0 flex-1 text-left">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("truncate font-medium", sezione === "completate" && "text-muted-foreground")}>{t.titolo}</span>
                <BadgeCategoria id={t.categoria_id} sottocategoria={t.sottocategoria_id} piccolo className="hidden sm:inline-flex" />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {sezione === "archiviate"
                  ? `Archiviata ${quandoRelativo(t.archiviata_at!)}${t.automatizzata_da ? ` · ora la fa il job ${t.automatizzata_da}` : ""}${t.archivio_motivo ? ` · ${t.archivio_motivo}` : ""}`
                  : sezione === "completate"
                    ? `Fatta ${quandoRelativo(t.completata_at!)}${t.scadenza ? ` · scadenza ${dataBreve(t.scadenza)}` : ""}`
                    : `Eliminata ${quandoRelativo(t.eliminata_at!)} · si cancella il ${dataLunga(aggiungiGiorniIso(giornoRoma(t.eliminata_at!), 365))}`}
              </div>
            </button>
            {sezione === "completate" ? <AvatarPersona id={t.completata_da} misura="sm" /> : null}
            {sezione === "archiviate" ? (
              <Bottone variante="contorno" misura="sm" onClick={() => void azioni.disarchivia(t)}>
                <RotateCcw /> <span className="hidden sm:inline">Riporta</span>
              </Bottone>
            ) : sezione === "cestino" ? (
              <Bottone
                variante="contorno"
                misura="sm"
                onClick={async () => {
                  await azioni.recupera(t)
                  caricaCestino()
                }}
              >
                <RotateCcw /> <span className="hidden sm:inline">Recupera</span>
              </Bottone>
            ) : (
              <Bottone variante="fantasma" misura="sm" onClick={() => void azioni.riapri(t)}>
                Riapri
              </Bottone>
            )}
          </div>
        ))}
        {!elenco.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">{sezione === "cestino" && !cestino ? "Carico…" : "Niente qui."}</div> : null}
      </div>
      {sezione === "completate" && !finite && completate.length >= 20 ? (
        <div className="flex justify-center">
          <Bottone variante="contorno" onClick={() => void altre()}>
            Carica le precedenti
          </Bottone>
        </div>
      ) : null}
      {config.estensioni?.archivio ? config.estensioni.archivio() : null}
    </div>
  )
}
