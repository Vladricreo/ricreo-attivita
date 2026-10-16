"use client"

import { Building2, CalendarDays, Flag, ListPlus, Lock, Repeat, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { colore } from "../colori"
import { useAttivita, useRichiedi } from "../contesto"
import { dataBreve, descriviRicorrenza, PRIORITA, servizioDaTesto } from "../regole"
import type { BozzaTask } from "../tipi"
import { Bottone } from "../ui/bottone"
import { AreaTesto, Campo, Interruttore } from "../ui/campi"
import { cn } from "../ui/cn"
import { Dialogo } from "../ui/dialogo"
import { Popover } from "../ui/popover"
import { ICONE_CATEGORIA } from "./aspetto"
import { GruppoAvatar, ScegliPersone } from "./persone"
import { Chip, SelettoreCategoria, SelettoreData, SelettorePriorita, SelettoreRicorrenza } from "./selettori"

const EVENTO = "attivita:nuova"
export const ATTIVITA_CREATA = "attivita:creata"

/** Apre la finestra "Nuova attività" da qualsiasi pagina dell'app (serve <NuovaAttivitaGlobale /> nel layout). */
export function apriNuovaAttivita(bozza: Partial<BozzaTask> = {}) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: bozza }))
}

export function NuovaAttivitaGlobale() {
  const [bozza, setBozza] = useState<Partial<BozzaTask> | null>(null)
  useEffect(() => {
    const f = (e: Event) => setBozza((e as CustomEvent<Partial<BozzaTask>>).detail ?? {})
    window.addEventListener(EVENTO, f)
    return () => window.removeEventListener(EVENTO, f)
  }, [])
  return bozza ? <NuovaAttivita aperta bozza={bozza} onChiudi={() => setBozza(null)} /> : null
}

export function NuovaAttivita({
  aperta,
  bozza,
  onChiudi,
  onCreata,
}: {
  aperta: boolean
  bozza?: Partial<BozzaTask>
  onChiudi: () => void
  onCreata?: (id: string) => void
}) {
  useRichiedi("tasks")
  const { config, azioni, me, base, categoria, sottocategoria, persona } = useAttivita()
  const iniziale = (): BozzaTask => ({
    titolo: "",
    categoria_id: config.app,
    priorita: "normale",
    assegnatari: [],
    sottotask: [],
    checklist: [],
    ...bozza,
  })
  const [d, setD] = useState<BozzaTask>(iniziale)
  const [sotto, setSotto] = useState("")
  const [invio, setInvio] = useState(false)
  const [altre, setAltre] = useState(false)
  useEffect(() => {
    if (aperta) setD(iniziale())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperta])

  const cambia = (p: Partial<BozzaTask>) => setD((x) => ({ ...x, ...p }))

  // Sottocategoria passata per nome (es. da altre pagine dell'app): si risolve quando arrivano le anagrafiche.
  useEffect(() => {
    if (!d.sottocategoria_nome || d.sottocategoria_id || !base) return
    const s = base.sottocategorie.find((x) => x.categoria_id === d.categoria_id && x.nome === d.sottocategoria_nome)
    setD((x) => ({ ...x, sottocategoria_id: s?.id ?? null, sottocategoria_nome: undefined }))
  }, [base, d.sottocategoria_nome, d.sottocategoria_id, d.categoria_id])
  const cat = categoria(d.categoria_id)
  const CatIcona = ICONE_CATEGORIA[cat?.icona ?? ""] ?? Building2

  const crea = async () => {
    if (!d.titolo.trim() || invio) return
    setInvio(true)
    const { sottocategoria_nome: _, ...resto } = d
    const id = await azioni.crea({ ...resto, titolo: d.titolo.trim(), servizio: d.servizio ?? servizioDaTesto(`${d.titolo} ${d.descrizione ?? ""}`) })
    setInvio(false)
    if (!id) return
    window.dispatchEvent(new CustomEvent(ATTIVITA_CREATA, { detail: { id } }))
    onCreata?.(id)
    if (altre) setD({ ...iniziale(), categoria_id: d.categoria_id, sottocategoria_id: d.sottocategoria_id, assegnatari: d.assegnatari })
    else onChiudi()
  }

  const aggiungiSotto = () => {
    const titolo = sotto.trim()
    if (!titolo) return
    cambia({ sottotask: [...(d.sottotask ?? []), { titolo }] })
    setSotto("")
  }

  return (
    <Dialogo
      aperto={aperta}
      onChiudi={onChiudi}
      titolo="Nuova attività"
      className="max-w-2xl"
      piede={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Interruttore attivo={altre} onCambia={setAltre} /> Creane un&apos;altra
          </label>
          <Bottone variante="contorno" onClick={onChiudi}>
            Annulla
          </Bottone>
          <Bottone onClick={() => void crea()} disabled={!d.titolo.trim() || invio}>
            {invio ? "Salvo…" : "Crea attività"}
          </Bottone>
        </>
      }
    >
      <div className="space-y-4">
        <Campo
          autoFocus
          value={d.titolo}
          onChange={(e) => cambia({ titolo: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey || !d.descrizione) && void crea()}
          placeholder="Cosa c'è da fare?"
          className="h-11 text-base font-medium"
        />
        <AreaTesto value={d.descrizione ?? ""} onChange={(e) => cambia({ descrizione: e.target.value })} placeholder="Dettagli (facoltativo)" righeMax={8} />

        <div className="flex flex-wrap gap-1.5">
          <SelettoreCategoria
            categoria={d.categoria_id ?? config.app}
            sottocategoria={d.sottocategoria_id ?? null}
            onCambia={(c, s) => cambia({ categoria_id: c, sottocategoria_id: s })}
            trigger={
              <Chip className="border-border">
                <CatIcona className={colore(cat?.colore).testo} />
                {cat?.nome ?? "Categoria"}
                {d.sottocategoria_id ? <span className="text-muted-foreground">· {sottocategoria(d.sottocategoria_id)?.nome}</span> : null}
              </Chip>
            }
          />
          <Popover
            className="w-72"
            trigger={
              <Chip className="border-border" vuoto={!d.assegnatari?.length}>
                {d.assegnatari?.length ? <GruppoAvatar ids={d.assegnatari} max={4} misura="xs" /> : <Users />}
                {d.assegnatari?.length === 1 ? persona(d.assegnatari[0])?.nome : d.assegnatari?.length ? `${d.assegnatari.length} persone` : "Chi la fa"}
              </Chip>
            }
          >
            <ScegliPersone titolo={d.personale ? "Attività personale: solo tu" : "Chi la fa"} scelti={d.assegnatari ?? []} soloIds={d.personale && me ? [me] : undefined} onCambia={(a) => cambia({ assegnatari: a })} />
            {(d.assegnatari?.length ?? 0) > 1 ? (
              <label className="mt-2 flex items-center justify-between gap-2 border-t border-border px-1 pt-2 text-xs">
                Fatta quando tutti hanno fatto la loro parte
                <Interruttore attivo={!!d.conferma_tutti} onCambia={(v) => cambia({ conferma_tutti: v })} />
              </label>
            ) : null}
          </Popover>
          <SelettoreData
            titolo="Inizio"
            valore={d.data_inizio ?? null}
            onCambia={(v) => cambia({ data_inizio: v, ...(v && d.scadenza && v > d.scadenza ? { scadenza: v } : {}) })}
            trigger={
              <Chip className="border-border" vuoto={!d.data_inizio}>
                <CalendarDays /> {d.data_inizio ? `Dal ${dataBreve(d.data_inizio)}` : "Inizio"}
              </Chip>
            }
          />
          <SelettoreData
            valore={d.scadenza ?? null}
            minimo={d.data_inizio}
            onCambia={(v) => cambia({ scadenza: v, ...(v ? {} : { ricorrenza_unita: null, ricorrenza_intervallo: null }) })}
            trigger={
              <Chip className="border-border" vuoto={!d.scadenza}>
                <CalendarDays /> {d.scadenza ? `Entro ${dataBreve(d.scadenza)}` : "Scadenza"}
              </Chip>
            }
          />
          <SelettorePriorita
            valore={d.priorita ?? "normale"}
            onCambia={(p) => cambia({ priorita: p })}
            trigger={
              <Chip className="border-border">
                <Flag className={cn(PRIORITA[d.priorita ?? "normale"].testo, d.priorita !== "bassa" && "fill-current")} /> {PRIORITA[d.priorita ?? "normale"].label}
              </Chip>
            }
          />
          <SelettoreRicorrenza
            valore={{
              ricorrenza_unita: d.ricorrenza_unita ?? null,
              ricorrenza_intervallo: d.ricorrenza_intervallo ?? null,
              ricorrenza_fine: d.ricorrenza_fine ?? null,
              preavviso_giorni: d.preavviso_giorni ?? null,
            }}
            scadenza={d.scadenza ?? null}
            onCambia={(r) => cambia(r)}
            trigger={
              <Chip className="border-border" vuoto={!d.ricorrenza_unita}>
                <Repeat /> {descriviRicorrenza(d.ricorrenza_unita ?? null, d.ricorrenza_intervallo ?? null) ?? "Ripeti"}
              </Chip>
            }
          />
          <Chip
            className={cn("border-border", d.personale && "border-primary bg-primary/5")}
            onClick={() => cambia({ personale: !d.personale, ...(d.personale ? {} : { assegnatari: (d.assegnatari ?? []).filter((a) => a === me) }) })}
          >
            <Lock /> {d.personale ? "Personale" : "Personale?"}
          </Chip>
        </div>
        {d.personale ? <p className="-mt-2 text-xs text-muted-foreground">La vedrai solo tu, nemmeno gli admin.</p> : null}

        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
            <ListPlus className="h-4 w-4" /> Sottotask
            {(d.sottotask?.length ?? 0) > 1 ? (
              <label className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                Una dopo l&apos;altra <Interruttore attivo={!!d.in_sequenza} onCambia={(v) => cambia({ in_sequenza: v })} />
              </label>
            ) : null}
          </div>
          <div className="space-y-1">
            {(d.sottotask ?? []).map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                {d.in_sequenza ? <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span> : null}
                <span className="min-w-0 flex-1 truncate text-sm">{s.titolo}</span>
                <Popover
                  className="w-72"
                  allinea="end"
                  trigger={
                    <button type="button" className="shrink-0 rounded-full">
                      <GruppoAvatar ids={s.assegnatari ?? []} misura="xs" vuoto={<Users className="h-4 w-4 text-muted-foreground" />} />
                    </button>
                  }
                >
                  <ScegliPersone
                    titolo="Chi fa questo passo"
                    scelti={s.assegnatari ?? []}
                    soloIds={d.personale && me ? [me] : undefined}
                    onCambia={(a) => cambia({ sottotask: d.sottotask!.map((x, j) => (j === i ? { ...x, assegnatari: a, conferma_tutti: a.length > 1 } : x)) })}
                  />
                </Popover>
                <button type="button" onClick={() => cambia({ sottotask: d.sottotask!.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" aria-label="Togli">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <input
              value={sotto}
              onChange={(e) => setSotto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  aggiungiSotto()
                }
              }}
              onBlur={aggiungiSotto}
              placeholder="Aggiungi un passo e premi Invio"
              className="h-8 w-full rounded-md border border-dashed border-border bg-transparent px-2 text-sm outline-none focus:border-input focus:ring-1 focus:ring-ring"
            />
          </div>
          {d.in_sequenza ? <p className="mt-1 text-xs text-muted-foreground">Ognuno riceve &quot;tocca a te&quot; quando il passo prima è fatto. Con più persone su un passo, è fatto quando tutte hanno finito.</p> : null}
        </div>
      </div>
    </Dialogo>
  )
}
