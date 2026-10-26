"use client"

import { closestCenter, DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ListOrdered, Plus, Trash2, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { SpuntaCompleta } from "../componenti/aspetto"
import { CampoPersone, testoScadenza } from "../componenti/riga-task"
import { SelettoreData } from "../componenti/selettori"
import { useAttivita } from "../contesto"
import { fatta, inAttesaDi, ordinaPerPosizione, posizioneTra } from "../regole"
import type { Task } from "../tipi"
import { Interruttore } from "../ui/campi"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

/** Sottotask di un'attività: in ordine, con persone e scadenza, eventualmente in sequenza. */
export function Sottotask({ t, onApri }: { t: Task; onApri: (t: Task) => void }) {
  const { tasks, perId, azioni, ritocca } = useAttivita()
  const sotto = useMemo(() => (tasks ?? []).filter((s) => s.padre_id === t.id && !s.eliminata_at).sort(ordinaPerPosizione), [tasks, t.id])
  const [nuova, setNuova] = useState("")
  const fatte = sotto.filter(fatta).length
  const sensori = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }))

  const aggiungi = async () => {
    const titolo = nuova.trim()
    if (!titolo) return
    setNuova("")
    await azioni.crea({ titolo, padre_id: t.id, categoria_id: t.categoria_id, ordine: (sotto[sotto.length - 1]?.ordine ?? 0) + 1 })
  }

  const fine = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = sotto.map((s) => s.id)
    const nuovi = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    const i = nuovi.indexOf(String(e.active.id))
    const ordine = posizioneTra(i > 0 ? perId.get(nuovi[i - 1])!.ordine : null, i < nuovi.length - 1 ? perId.get(nuovi[i + 1])!.ordine : null)
    ritocca(String(e.active.id), { ordine })
    void azioni.aggiorna(String(e.active.id), { ordine })
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Sottotask</h4>
        {sotto.length ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fatte}/{sotto.length}
          </span>
        ) : null}
        <span className="flex-1" />
        {sotto.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListOrdered className="h-3.5 w-3.5" />
            Una dopo l&apos;altra
            <Interruttore attivo={t.in_sequenza} onCambia={(v) => void azioni.aggiorna(t.id, { in_sequenza: v })} etichetta="In sequenza" />
          </label>
        ) : null}
      </div>
      {t.in_sequenza && sotto.length > 1 ? (
        <p className="mb-2 text-xs text-muted-foreground">Chi ha il passo successivo riceve &quot;tocca a te&quot; quando il precedente è fatto.</p>
      ) : null}
      {sotto.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <DndContext sensors={sensori} collisionDetection={closestCenter} onDragEnd={fine}>
            <SortableContext items={sotto.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sotto.map((s, i) => (
                <RigaSottotask key={s.id} s={s} numero={t.in_sequenza ? i + 1 : null} inAttesa={inAttesaDi(s, perId, tasks ?? [])?.titolo ?? null} onApri={onApri} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={nuova}
          onChange={(e) => setNuova(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void aggiungi()}
          placeholder="Aggiungi una sottotask e premi Invio"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus:border-input focus:bg-background focus:ring-1 focus:ring-ring"
        />
      </div>
    </section>
  )
}

function RigaSottotask({ s, numero, inAttesa, onApri }: { s: Task; numero: number | null; inAttesa: string | null; onApri: (t: Task) => void }) {
  const { azioni } = useAttivita()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id })
  const scad = testoScadenza(s)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-center gap-2 border-b border-border/60 bg-background px-2 py-1.5 text-sm last:border-b-0", isDragging && "relative z-10 shadow-lg")}
    >
      <button type="button" className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground" {...attributes} {...listeners} aria-label="Sposta">
        <GripVertical className="h-4 w-4" />
      </button>
      {numero != null ? <span className="w-4 text-center text-xs font-semibold tabular-nums text-muted-foreground">{numero}</span> : null}
      <SpuntaCompleta t={s} misura="sm" inAttesa={inAttesa} onClick={() => (fatta(s) ? void azioni.riapri(s) : void azioni.completa(s))} />
      <button type="button" onClick={() => onApri(s)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", fatta(s) && "text-muted-foreground line-through")}>
        {s.titolo}
      </button>
      {inAttesa && !fatta(s) ? <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">aspetta: {inAttesa}</span> : null}
      {s.conferma_tutti ? (
        <Suggerimento testo="Fatta quando tutti hanno fatto la loro parte">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Suggerimento>
      ) : null}
      <SelettoreData
        valore={s.scadenza}
        onCambia={(d) => void azioni.aggiorna(s.id, { scadenza: d })}
        trigger={
          <button type="button" className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs hover:bg-accent", scad?.tono ?? "text-muted-foreground/60")}>
            {scad?.testo ?? "data"}
          </button>
        }
      />
      <CampoPersone t={s} misura="xs" max={3} />
      <button
        type="button"
        onClick={() => void azioni.elimina(s)}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive sm:p-1 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Elimina sottotask"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
