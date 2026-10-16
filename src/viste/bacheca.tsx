"use client"

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CalendarDays, MessageSquare, Paperclip, Repeat } from "lucide-react"
import { useMemo, useRef, useState, type ReactNode } from "react"
import { colore } from "../colori"
import { BadgeCategoria, BandierinaPriorita, BarraProgresso, ICONE_STATO, LogoServizio, Personale, SpuntaCompleta } from "../componenti/aspetto"
import { MenuAzioniTask } from "../componenti/azioni-task"
import { AvatarPersona } from "../componenti/persone"
import { AggiuntaRapida, CampoPersone, testoScadenza } from "../componenti/riga-task"
import { useAttivita } from "../contesto"
import { useUrlFirmati } from "../dati/url-firmati"
import { righePrincipali } from "../filtri"
import { fascia, fatta, inAttesaDi, oggiIso, ORDINE_PRIORITA, ordinaPerPosizione, posizioneTra, PRIORITA, ricorrente } from "../regole"
import type { BozzaTask, ModificaTask, Priorita, Task } from "../tipi"
import { cn } from "../ui/cn"

export type ColonneBacheca = "stato" | "persona" | "priorita" | "categoria"

export const COLONNE_BACHECA: { id: ColonneBacheca; label: string }[] = [
  { id: "stato", label: "Stato" },
  { id: "persona", label: "Persona" },
  { id: "priorita", label: "Priorità" },
  { id: "categoria", label: "Categoria" },
]

type Colonna = { id: string; titolo: ReactNode; punto?: string; bozza: Partial<BozzaTask>; ids: string[] }

const SENZA = "__nessuno__"

export function VistaBacheca({
  filtrate,
  colonne: tipo,
  onApri,
  mostraFatte,
}: {
  filtrate: Task[]
  colonne: ColonneBacheca
  onApri: (t: Task) => void
  mostraFatte: boolean
}) {
  const { base, perId, tasks, persona, azioni, ritocca, me } = useAttivita()
  const oggi = oggiIso()
  const tutte = tasks ?? []

  const schede = useMemo(
    () =>
      righePrincipali(filtrate)
        .filter((t) => fascia(t, oggi) !== "in_arrivo" || fatta(t))
        .filter((t) => tipo === "stato" || mostraFatte || !fatta(t)),
    [filtrate, oggi, tipo, mostraFatte],
  )

  const colonne = useMemo<Colonna[]>(() => {
    const ordina = (l: Task[]) => l.sort(ordinaPerPosizione).map((t) => t.id)
    if (tipo === "stato")
      return (base?.stati ?? []).map((s) => {
        const Icona = ICONE_STATO[s.tipo]
        return {
          id: s.id,
          titolo: (
            <span className="inline-flex items-center gap-1.5">
              <Icona className={cn("h-3.5 w-3.5", colore(s.colore).testo)} />
              {s.nome}
            </span>
          ),
          punto: colore(s.colore).punto,
          bozza: { stato_id: s.id },
          ids: ordina(schede.filter((t) => t.stato_id === s.id && (s.tipo !== "fatto" || mostraFatte || isRecent(t)))),
        }
      })
    if (tipo === "priorita")
      return ORDINE_PRIORITA.map((p) => ({
        id: p,
        titolo: PRIORITA[p].label,
        punto: PRIORITA[p].punto,
        bozza: { priorita: p },
        ids: ordina(schede.filter((t) => t.priorita === p)),
      }))
    if (tipo === "categoria")
      return (base?.categorie ?? [])
        .filter((c) => c.attiva || schede.some((t) => t.categoria_id === c.id))
        .map((c) => ({
          id: c.id,
          titolo: c.nome,
          punto: colore(c.colore).punto,
          bozza: { categoria_id: c.id },
          ids: ordina(schede.filter((t) => t.categoria_id === c.id)),
        }))
    // persona: una colonna per chi ha attività (e io sempre), più "senza assegnatario"
    const persone = new Set<string>(me ? [me] : [])
    schede.forEach((t) => t.assegnatari.forEach((a) => persone.add(a.user_id)))
    const cols: Colonna[] = [...persone]
      .sort((a, b) => Number(b === me) - Number(a === me) || (persona(a)?.nome ?? "").localeCompare(persona(b)?.nome ?? ""))
      .map((id) => ({
        id,
        titolo: (
          <span className="inline-flex items-center gap-1.5">
            <AvatarPersona id={id} misura="xs" />
            {id === me ? "Io" : (persona(id)?.nome ?? "Persona")}
          </span>
        ),
        bozza: { assegnatari: [id] },
        ids: ordina(schede.filter((t) => t.assegnatari.some((a) => a.user_id === id))),
      }))
    cols.push({ id: SENZA, titolo: "Senza assegnatario", bozza: {}, ids: ordina(schede.filter((t) => !t.assegnatari.length)) })
    return cols
  }, [tipo, base?.stati, base?.categorie, schede, persona, me, mostraFatte])

  // Trascinamento tra colonne (stato, priorità, categoria, persona) e dentro la colonna (ordine).
  const [locali, setLocali] = useState<Record<string, string[]> | null>(null)
  const [attivo, setAttivo] = useState<{ id: string; da: string } | null>(null)
  const viste = useMemo(() => {
    if (!locali) return colonne
    return colonne.map((c) => ({ ...c, ids: locali[c.id] ?? c.ids }))
  }, [colonne, locali])

  const sensori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Id trascinabili "colonna::attività": con le colonne per persona la stessa attività può stare in più colonne.
  const corrente = useRef<string | null>(null)
  const dividi = (id: unknown): [string, string | null] => {
    const s = String(id)
    if (s.startsWith("col:")) return [s.slice(4), null]
    const [c, t] = s.split("::")
    return [c, t ?? null]
  }

  const inizio = (e: DragStartEvent) => {
    const [da, id] = dividi(e.active.id)
    if (!id) return
    corrente.current = da
    setAttivo({ id, da })
    setLocali(Object.fromEntries(colonne.map((c) => [c.id, c.ids])))
  }

  const sopra = (e: DragOverEvent) => {
    if (!e.over || !attivo) return
    const id = attivo.id
    const [a, overId] = dividi(e.over.id)
    const da = corrente.current
    if (!da || !a || da === a) return
    corrente.current = a
    setLocali((p) => {
      if (!p || !p[a]) return p
      const sorgente = (p[da] ?? []).filter((x) => x !== id)
      const dest = p[a].filter((x) => x !== id)
      const i = overId ? dest.indexOf(overId) : -1
      dest.splice(i >= 0 ? i : dest.length, 0, id)
      return { ...p, [da]: sorgente, [a]: dest }
    })
  }

  const fine = (e: DragEndEvent) => {
    const stato = locali
    const partenza = attivo
    const col = corrente.current
    setAttivo(null)
    setLocali(null)
    corrente.current = null
    if (!stato || !partenza || !col || !stato[col]) return
    const id = partenza.id
    let lista = stato[col]
    const [colOver, overId] = e.over ? dividi(e.over.id) : [null, null]
    if (overId && colOver === col) {
      const i = lista.indexOf(id)
      const j = lista.indexOf(overId)
      if (i >= 0 && j >= 0 && i !== j) lista = arrayMove(lista, i, j)
    }
    const pos = lista.indexOf(id)
    const prima = pos > 0 ? (perId.get(lista[pos - 1])?.ordine ?? null) : null
    const dopo = pos < lista.length - 1 ? (perId.get(lista[pos + 1])?.ordine ?? null) : null
    const t = perId.get(id)
    if (!t) return
    const patch: ModificaTask = { ordine: posizioneTra(prima, dopo) }
    const cambiata = col !== partenza.da
    if (!cambiata && pos === colonne.find((c) => c.id === col)?.ids.indexOf(id)) return

    if (cambiata && tipo === "stato") {
      const s = base?.stati.find((x) => x.id === col)
      if (s?.tipo === "fatto") {
        ritocca(id, { ordine: patch.ordine! })
        void azioni.completa(t)
        return
      }
      patch.stato_id = col
    }
    if (cambiata && tipo === "priorita") patch.priorita = col as Priorita
    if (cambiata && tipo === "categoria") {
      patch.categoria_id = col
      patch.sottocategoria_id = null
    }
    if (cambiata && tipo === "persona") {
      const resto = t.assegnatari.map((a) => a.user_id).filter((u) => u !== partenza.da)
      const nuovi = col === SENZA ? resto : [...new Set([...resto, col])]
      void azioni.assegna(t, col === SENZA ? [] : nuovi)
    }
    void azioni.aggiorna(id, patch)
  }

  const attivoTask = attivo ? perId.get(attivo.id) : null

  return (
    <DndContext sensors={sensori} collisionDetection={closestCorners} onDragStart={inizio} onDragOver={sopra} onDragEnd={fine} onDragCancel={() => (setAttivo(null), setLocali(null), (corrente.current = null))}>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
        {viste.map((c) => (
          <ColonnaBacheca key={c.id} colonna={c} onApri={onApri} tutte={tutte} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{attivoTask ? <Scheda t={attivoTask} trascinata colonna="" onApri={() => undefined} /> : null}</DragOverlay>
    </DndContext>
  )
}

/** Le completate da più di 14 giorni non affollano la colonna "Fatta". */
function isRecent(t: Task) {
  return !t.completata_at || Date.now() - Date.parse(t.completata_at) < 14 * 86_400_000
}

function ColonnaBacheca({ colonna, onApri, tutte }: { colonna: Colonna; onApri: (t: Task) => void; tutte: Task[] }) {
  const { perId } = useAttivita()
  const { setNodeRef, isOver } = useDroppable({ id: `col:${colonna.id}` })
  const percorsi = colonna.ids.map((id) => perId.get(id)?.copertina_percorso)
  const url = useUrlFirmati(percorsi)
  return (
    <div className="flex w-[85vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/30 sm:w-72">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        {colonna.punto ? <span className={cn("h-2 w-2 rounded-full", colonna.punto)} /> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{colonna.titolo}</span>
        <span className="rounded-full bg-background px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{colonna.ids.length}</span>
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors", isOver && "bg-primary/5")}>
        <SortableContext items={colonna.ids.map((id) => `${colonna.id}::${id}`)} strategy={verticalListSortingStrategy}>
          {colonna.ids.map((id) => {
            const t = perId.get(id)
            if (!t) return null
            return (
              <SchedaTrascinabile
                key={id}
                t={t}
                colonna={colonna.id}
                onApri={onApri}
                copertina={t.copertina_percorso ? url[t.copertina_percorso] : undefined}
                inAttesa={inAttesaDi(t, perId, tutte)?.titolo ?? null}
              />
            )
          })}
        </SortableContext>
        <AggiuntaRapida bozza={colonna.bozza} segnaposto="Aggiungi" className="rounded-lg px-2" />
      </div>
    </div>
  )
}

function SchedaTrascinabile(props: { t: Task; colonna: string; onApri: (t: Task) => void; copertina?: string; inAttesa?: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${props.colonna}::${props.t.id}` })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <Scheda {...props} />
    </div>
  )
}

export function Scheda({
  t,
  onApri,
  copertina,
  trascinata,
  inAttesa,
}: {
  t: Task
  colonna: string
  onApri: (t: Task) => void
  copertina?: string
  trascinata?: boolean
  inAttesa?: string | null
}) {
  const { azioni, perId } = useAttivita()
  const scad = testoScadenza(t)
  const padre = t.padre_id ? perId.get(t.padre_id) : null
  const fattaOra = fatta(t)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onApri(t)}
      onKeyDown={(e) => e.key === "Enter" && onApri(t)}
      className={cn(
        "group overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        trascinata && "rotate-2 shadow-xl",
      )}
    >
      {copertina ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={copertina} alt="" className="aspect-[16/9] w-full bg-muted object-cover" loading="lazy" draggable={false} />
      ) : null}
      <div className="space-y-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <BadgeCategoria id={t.categoria_id} sottocategoria={t.sottocategoria_id} piccolo />
          <span className="-mr-1 -mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onPointerDown={(e) => e.stopPropagation()}>
            <MenuAzioniTask t={t} onApri={() => onApri(t)} />
          </span>
        </div>
        {padre ? <div className="truncate text-[11px] text-muted-foreground">{padre.titolo} ›</div> : null}
        <div className="flex items-start gap-2">
          <span className="pt-0.5" onPointerDown={(e) => e.stopPropagation()}>
            <SpuntaCompleta t={t} misura="sm" inAttesa={inAttesa} onClick={() => (fattaOra ? void azioni.riapri(t) : void azioni.completa(t))} />
          </span>
          <span className={cn("min-w-0 flex-1 break-words text-sm font-medium leading-snug", fattaOra && "text-muted-foreground line-through")}>{t.titolo}</span>
        </div>
        <BarraProgresso t={t} conTesto />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {scad ? (
            <span className={cn("inline-flex items-center gap-1", scad.tono)}>
              <CalendarDays className="h-3 w-3" />
              {scad.testo}
            </span>
          ) : null}
          {ricorrente(t) ? <Repeat className="h-3 w-3" /> : null}
          <BandierinaPriorita priorita={t.priorita} className="h-3 w-3" />
          {t.personale ? <Personale className="h-3 w-3" /> : null}
          <LogoServizio servizio={t.servizio} className="h-3.5 w-3.5" />
          <span className="flex-1" />
          {t.n_allegati ? (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />
              {t.n_allegati}
            </span>
          ) : null}
          {t.n_commenti ? (
            <span className={cn("inline-flex items-center gap-0.5", t.n_non_letti && "font-semibold text-primary")}>
              <MessageSquare className="h-3 w-3" />
              {t.n_non_letti || t.n_commenti}
            </span>
          ) : null}
          <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <CampoPersone t={t} misura="xs" />
          </span>
        </div>
      </div>
    </div>
  )
}
