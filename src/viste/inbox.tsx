"use client"

import { CheckCheck, Inbox } from "lucide-react"
import { useMemo, useState } from "react"
import { RigaNotifica } from "../componenti/notifiche"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { giornoRoma, oggiIso, aggiungiGiorniIso } from "../regole"
import type { Notifica } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"

type Filtro = "tutte" | "non_lette" | "menzioni" | "assegnate"

/** Tutte le notifiche delle attività della persona, di tutte le app. */
export function VistaInbox({ onApri }: { onApri: (id: string) => void }) {
  const { notifiche, api, ricarica } = useAttivita()
  const [filtro, setFiltro] = useState<Filtro>("tutte")
  const oggi = oggiIso()
  const ieri = aggiungiGiorniIso(oggi, -1)

  const lista = useMemo(() => {
    const l = (notifiche ?? []).filter((n) =>
      filtro === "non_lette" ? !n.letta_at : filtro === "menzioni" ? n.tipo === "menzione" : filtro === "assegnate" ? n.tipo === "assegnata" || n.tipo === "tocca_a_te" : true,
    )
    const gruppi: { titolo: string; voci: Notifica[] }[] = []
    for (const n of l) {
      const g = giornoRoma(n.aggiornata_at)
      const titolo = g === oggi ? "Oggi" : g === ieri ? "Ieri" : g >= aggiungiGiorniIso(oggi, -7) ? "Questa settimana" : "Prima"
      const ultimo = gruppi[gruppi.length - 1]
      if (ultimo?.titolo === titolo) ultimo.voci.push(n)
      else gruppi.push({ titolo, voci: [n] })
    }
    return gruppi
  }, [notifiche, filtro, oggi, ieri])

  const nonLette = (notifiche ?? []).filter((n) => !n.letta_at).length

  const apri = async (n: Notifica) => {
    if (!n.letta_at) await api.segnaNotificheLette([n.id]).catch(() => undefined)
    void ricarica("notifiche")
    if (n.task_id) onApri(n.task_id)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["tutte", "Tutte"],
              ["non_lette", `Non lette${nonLette ? ` (${nonLette})` : ""}`],
              ["menzioni", "Menzioni"],
              ["assegnate", "Per me"],
            ] as [Filtro, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} className={cn("rounded px-2.5 py-1 text-xs font-medium", filtro === k ? "bg-accent" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {nonLette ? (
          <Bottone
            variante="contorno"
            misura="sm"
            onClick={async () => {
              try {
                await api.segnaNotificheLette(null)
                void ricarica("notifiche")
              } catch (e) {
                avviso.errore(messaggioErrore(e))
              }
            }}
          >
            <CheckCheck /> Segna tutte lette
          </Bottone>
        ) : null}
      </div>
      {notifiche === null ? null : lista.length ? (
        lista.map((g) => (
          <section key={g.titolo} className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
            <h3 className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titolo}</h3>
            {g.voci.map((n) => (
              <RigaNotifica
                key={n.id}
                n={n}
                onApri={() => void apri(n)}
                onArchivia={async () => {
                  await api.archiviaNotifica(n.id).catch((e) => avviso.errore(messaggioErrore(e)))
                  void ricarica("notifiche")
                }}
              />
            ))}
          </section>
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8 opacity-40" />
          {filtro === "tutte" ? "Nessuna notifica: quando qualcuno ti assegna o ti scrive qualcosa arriva qui." : "Niente con questo filtro."}
        </div>
      )}
    </div>
  )
}
