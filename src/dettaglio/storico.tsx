"use client"

import { History, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { AvatarPersona } from "../componenti/persone"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { dataBreve, dataLunga, PRIORITA, primoNome, quandoRelativo } from "../regole"
import type { Completamento, Priorita, Task, VoceStorico } from "../tipi"

/** Chi ha fatto cosa sull'attività (e sulle sue sottotask), più lo storico dei completamenti. */
export function Storico({ t }: { t: Task }) {
  const { api, tasks, persona, stato, categoria, sottocategoria, config, base } = useAttivita()
  const [voci, setVoci] = useState<VoceStorico[] | null>(null)
  const [completamenti, setCompletamenti] = useState<Completamento[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const ids = [t.id, ...(tasks ?? []).filter((s) => s.padre_id === t.id).map((s) => s.id)]
  const chiave = ids.join(",")

  useEffect(() => {
    let vivo = true
    Promise.all([api.storico(chiave.split(",")), api.completamentiDi(t.id)])
      .then(([s, c]) => {
        if (!vivo) return
        setVoci(s)
        setCompletamenti(c)
      })
      .catch((e) => vivo && setErrore(messaggioErrore(e)))
    return () => {
      vivo = false
    }
  }, [api, chiave, t.id, t.aggiornato_at])

  const nome = (id: unknown) => (typeof id === "string" ? (persona(id)?.nome ?? "una persona") : "una persona")
  const data = (d: unknown) => (typeof d === "string" ? dataBreve(d) : "nessuna")
  const nomeApp = (slug: unknown) => base?.app.find((a) => a.slug === slug)?.nome ?? (typeof slug === "string" ? slug : null)

  const testo = (v: VoceStorico): string => {
    const d = v.dettagli as Record<string, unknown>
    const suSotto = v.task_id !== t.id ? ` (sottotask “${(tasks ?? []).find((s) => s.id === v.task_id)?.titolo ?? ""}”)` : ""
    switch (v.azione) {
      case "creata":
        return `ha creato l'attività${d.app && d.app !== config.app ? ` da ${nomeApp(d.app)}` : ""}${suSotto}`
      case "sottotask":
        return `ha aggiunto la sottotask “${d.titolo}”`
      case "campo":
        if (d.campo === "titolo") return `ha cambiato il titolo in “${d.dopo}”${suSotto}`
        if (d.campo === "descrizione") return `ha modificato la descrizione${suSotto}`
        if (d.campo === "priorita") return `ha messo priorità ${PRIORITA[d.dopo as Priorita]?.label.toLowerCase() ?? d.dopo}${suSotto}`
        return `ha modificato ${d.campo}${suSotto}`
      case "stato":
        return `ha spostato da ${stato(d.prima as string)?.nome ?? d.prima} a ${stato(d.dopo as string)?.nome ?? d.dopo}${suSotto}`
      case "date":
        if (d.prima !== d.dopo) return `ha cambiato la scadenza da ${data(d.prima)} a ${data(d.dopo)}${suSotto}`
        return `ha cambiato l'inizio da ${data(d.inizio_prima)} a ${data(d.inizio_dopo)}${suSotto}`
      case "categoria": {
        const c = categoria(d.dopo as string)?.nome ?? d.dopo
        const s = d.sotto_dopo ? sottocategoria(d.sotto_dopo as string)?.nome : null
        return `ha spostato in ${c}${s ? ` · ${s}` : ""}${suSotto}`
      }
      case "assegnata":
        return d.persona === v.attore ? `si è presa l'attività${suSotto}` : `l'ha assegnata a ${nome(d.persona)}${suSotto}`
      case "tolta":
        return d.persona === v.attore ? `si è tolta dall'attività${suSotto}` : `ha tolto ${nome(d.persona)}${suSotto}`
      case "parte_fatta":
        return `ha fatto la sua parte${suSotto}`
      case "completata":
        return d.prossima ? `l'ha fatta (scadenza ${data(d.scadenza)}), la prossima è il ${data(d.prossima)}` : `l'ha completata${suSotto}`
      case "riaperta":
        return `l'ha riaperta${suSotto}`
      case "archiviata":
        return `l'ha archiviata${d.motivo ? `: ${d.motivo}` : ""}`
      case "ripristinata":
        return "l'ha riportata tra le attività"
      case "eliminata":
        return `l'ha spostata nel cestino${suSotto}`
      case "recuperata":
        return `l'ha recuperata dal cestino${suSotto}`
      case "personale":
        return "l'ha resa personale"
      case "condivisa":
        return "l'ha resa visibile a chi è coinvolto"
      case "sollecito":
        return `ha mandato ${d.forte ? "un sollecito forte" : "un promemoria"} a ${nome(d.persona)}`
      case "allegato":
        return `ha aggiunto ${d.nome ?? "un file"}${suSotto}`
      default:
        return v.azione
    }
  }

  if (errore) return <p className="p-4 text-sm text-destructive">{errore}</p>
  if (!voci)
    return (
      <div className="flex justify-center py-10">
        <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )

  // Completamenti importati (senza voce di storico) in coda.
  const completateNelloStorico = new Set(voci.filter((v) => v.azione === "completata").map((v) => v.creato_at.slice(0, 16)))
  const soloCompletamenti = completamenti.filter((c) => !completateNelloStorico.has(c.completata_at.slice(0, 16)))

  // La creazione di una sottotask è già la voce "ha aggiunto la sottotask" sulla principale.
  const visibili = voci.filter((v) => !(v.azione === "creata" && v.task_id !== t.id))

  return (
    <div className="space-y-3 p-4">
      {visibili.map((v) => (
        <div key={v.id} className="flex gap-2.5 text-sm">
          <AvatarPersona id={v.attore} misura="sm" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{v.attore ? primoNome(persona(v.attore)?.nome) : "Sistema"}</span> <span className="text-muted-foreground">{testo(v)}</span>
            <div className="text-[11px] text-muted-foreground">{quandoRelativo(v.creato_at)}</div>
          </div>
        </div>
      ))}
      {soloCompletamenti.length ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">Completamenti precedenti</div>
          {soloCompletamenti.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <AvatarPersona id={c.completata_da} misura="xs" />
              {c.scadenza ? `Scadenza ${dataLunga(c.scadenza)}` : "Senza scadenza"} · fatta {quandoRelativo(c.completata_at)}
            </div>
          ))}
        </div>
      ) : null}
      {!visibili.length && !soloCompletamenti.length ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
          <History className="h-6 w-6 opacity-40" /> Nessuna modifica registrata.
        </div>
      ) : null}
    </div>
  )
}
