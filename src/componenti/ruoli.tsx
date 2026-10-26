"use client"

import { ShieldCheck, User, UserCog, Users } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { eAdmin, eManager, primoNome } from "../regole"
import type { Persona } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Dialogo } from "../ui/dialogo"
import { Popover } from "../ui/popover"
import { AvatarPersona, GruppoAvatar, ScegliPersone } from "./persone"

type Ruolo = "persona" | "manager" | "admin"

const RUOLI: { id: Ruolo; nome: string; icona: ReactNode; testo: string }[] = [
  { id: "persona", nome: "Persona", icona: <User className="h-4 w-4" />, testo: "Vede solo le attività in cui è coinvolta." },
  { id: "manager", nome: "Manager", icona: <UserCog className="h-4 w-4" />, testo: "Vede le attività delle persone che segue e le può sollecitare." },
  { id: "admin", nome: "Admin", icona: <ShieldCheck className="h-4 w-4" />, testo: "Vede tutto (tranne le personali), decide ruoli, responsabili e categorie." },
]

export const ruoloDi = (p: Persona | null | undefined): Ruolo => (eAdmin(p) ? "admin" : eManager(p) ? "manager" : "persona")

/** Ruoli e responsabili: chi è admin, chi è manager e chi segue chi. Modificabile solo dagli admin. */
export function SezioneRuoli() {
  const { base, me, persona, api, ricarica } = useAttivita()
  const admin = eAdmin(persona(me))
  const [conferma, setConferma] = useState<{ titolo: string; testo: string; fai: () => Promise<void> } | null>(null)
  const [lavoro, setLavoro] = useState(false)

  if (!base) return null
  const ordine: Record<Ruolo, number> = { admin: 0, manager: 1, persona: 2 }
  const persone = base.persone
    .filter((p) => p.attivo)
    .sort((a, b) => ordine[ruoloDi(a)] - ordine[ruoloDi(b)] || a.nome.localeCompare(b.nome))
  const seguiti = (m: string) => base.manager.filter((x) => x.manager_id === m).map((x) => x.persona_id)
  const responsabili = (p: string) => base.manager.filter((x) => x.persona_id === p).map((x) => x.manager_id)
  const managers = persone.filter((p) => eManager(p)).map((p) => p.auth_id)

  const fai = async (fn: () => Promise<unknown>) => {
    setLavoro(true)
    try {
      await fn()
      await ricarica("base")
    } catch (e) {
      avviso.errore(messaggioErrore(e))
    } finally {
      setLavoro(false)
    }
  }

  const cambiaRuolo = (p: Persona, nuovo: Ruolo) => {
    const ora = ruoloDi(p)
    if (nuovo === ora) return
    const esegui = async () => {
      if (nuovo === "admin") await api.impostaRuolo(p.auth_id, "Admin", true)
      if (nuovo === "manager") {
        await api.impostaRuolo(p.auth_id, "Manager", true)
        if (eAdmin(p)) await api.impostaRuolo(p.auth_id, "Admin", false)
      }
      if (nuovo === "persona") {
        if (eAdmin(p)) await api.impostaRuolo(p.auth_id, "Admin", false)
        if (eManager(p)) await api.impostaRuolo(p.auth_id, "Manager", false)
      }
    }
    const n = seguiti(p.auth_id).length
    const nome = primoNome(p.nome)
    if (nuovo === "admin")
      setConferma({ titolo: `${nome} diventa admin`, testo: `Il ruolo Admin vale in tutte le app Ricreo, non solo nelle Attività. ${nome} vedrà tutte le attività (tranne le personali) e potrà cambiare ruoli e impostazioni.`, fai: esegui })
    else if (nuovo === "persona" && n > 0)
      setConferma({ titolo: `${nome} non è più manager`, testo: `Smetterà di seguire ${n === 1 ? "1 persona" : `${n} persone`} e non vedrà più le loro attività.`, fai: esegui })
    else if (ora === "admin")
      setConferma({ titolo: `${nome} non è più admin`, testo: `Perde il ruolo Admin in tutte le app Ricreo.`, fai: esegui })
    else void fai(esegui)
  }

  const aggiornaLegami = (manager: string, prima: string[], dopo: string[], chiave: "persona" | "manager") =>
    fai(async () => {
      for (const x of dopo.filter((y) => !prima.includes(y))) await (chiave === "persona" ? api.managerPersona(manager, x, true) : api.managerPersona(x, manager, true))
      for (const x of prima.filter((y) => !dopo.includes(y))) await (chiave === "persona" ? api.managerPersona(manager, x, false) : api.managerPersona(x, manager, false))
    })

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Ruoli e responsabili
        </h3>
        <p className="text-xs text-muted-foreground">
          {admin ? "Scegli il ruolo di ognuno e chi è il suo responsabile. " : "Solo gli admin possono cambiarli. "}
          Admin e Manager valgono in tutte le app Ricreo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3 sm:grid-cols-3">
        {RUOLI.map((r) => (
          <div key={r.id} className="flex gap-2 rounded-md bg-muted/50 p-2">
            <span className={cn("mt-0.5 shrink-0", r.id === "admin" ? "text-primary" : "text-muted-foreground")}>{r.icona}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold">{r.nome}</div>
              <div className="text-[11px] leading-snug text-muted-foreground">{r.testo}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span>Persona</span>
        <span className="w-[13.5rem]">Ruolo</span>
        <span>Responsabile</span>
        <span>Segue</span>
      </div>

      <div className="divide-y divide-border">
        {persone.map((p) => {
          const ruolo = ruoloDi(p)
          const suoi = seguiti(p.auth_id)
          const resp = responsabili(p.auth_id)
          return (
            <div key={p.auth_id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <AvatarPersona id={p.auth_id} misura="md" conNome />
                {p.auth_id === me ? <span className="shrink-0 text-xs text-muted-foreground">(tu)</span> : null}
              </span>

              <SceltaRuolo valore={ruolo} disabilitato={!admin || lavoro} onCambia={(r) => cambiaRuolo(p, r)} />

              <Cella etichetta="Responsabile">
                {ruolo === "admin" ? (
                  <span className="text-xs text-muted-foreground">Vede già tutto</span>
                ) : (
                  <Legami
                    ids={resp}
                    modificabile={admin && !lavoro}
                    vuoto="Nessuno"
                    titolo={`Chi è responsabile di ${primoNome(p.nome)}`}
                    soloIds={managers.filter((m) => m !== p.auth_id)}
                    nessuno="Nessun manager: prima dai a qualcuno il ruolo Manager."
                    onCambia={(nuovi) => void aggiornaLegami(p.auth_id, resp, nuovi, "manager")}
                  />
                )}
              </Cella>

              <Cella etichetta="Segue">
                {eManager(p) ? (
                  <Legami
                    ids={suoi}
                    modificabile={admin && !lavoro}
                    vuoto="Nessuno"
                    titolo={`Chi segue ${primoNome(p.nome)}`}
                    soloIds={persone.filter((x) => x.auth_id !== p.auth_id && !eAdmin(x)).map((x) => x.auth_id)}
                    onCambia={(nuovi) => void aggiornaLegami(p.auth_id, suoi, nuovi, "persona")}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </Cella>
            </div>
          )
        })}
      </div>

      <Dialogo
        aperto={!!conferma}
        onChiudi={() => setConferma(null)}
        titolo={conferma?.titolo ?? ""}
        piede={
          <>
            <Bottone variante="contorno" onClick={() => setConferma(null)}>
              Annulla
            </Bottone>
            <Bottone
              onClick={() => {
                const c = conferma
                setConferma(null)
                if (c) void fai(c.fai)
              }}
            >
              Conferma
            </Bottone>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{conferma?.testo}</p>
      </Dialogo>
    </section>
  )
}

function Cella({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground md:hidden">{etichetta}</span>
      {children}
    </div>
  )
}

function SceltaRuolo({ valore, onCambia, disabilitato }: { valore: Ruolo; onCambia: (r: Ruolo) => void; disabilitato?: boolean }) {
  if (disabilitato) {
    const r = RUOLI.find((x) => x.id === valore)!
    return (
      <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium md:w-[13.5rem]", valore === "persona" ? "text-muted-foreground" : "text-foreground")}>
        {r.icona} {r.nome}
      </span>
    )
  }
  return (
    <div className="inline-flex w-fit rounded-md border border-border p-0.5" role="radiogroup" aria-label="Ruolo">
      {RUOLI.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={valore === r.id}
          onClick={() => onCambia(r.id)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            valore === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {r.icona} {r.nome}
        </button>
      ))}
    </div>
  )
}

function Legami({
  ids,
  modificabile,
  vuoto,
  titolo,
  soloIds,
  nessuno,
  onCambia,
}: {
  ids: string[]
  modificabile: boolean
  vuoto: string
  titolo: string
  soloIds: string[]
  nessuno?: string
  onCambia: (ids: string[]) => void
}) {
  const { persona } = useAttivita()
  const nomi = ids.length === 1 ? persona(ids[0])?.nome : ids.length > 1 ? `${ids.length} persone` : null
  const contenuto = ids.length ? (
    <>
      <GruppoAvatar ids={ids} max={5} misura="xs" />
      <span className="truncate text-xs">{nomi}</span>
    </>
  ) : (
    <span className="text-xs text-muted-foreground">{vuoto}</span>
  )
  if (!modificabile) return <span className="flex min-w-0 items-center gap-1.5">{contenuto}</span>
  return (
    <Popover
      className="w-72"
      trigger={
        <button type="button" className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 hover:border-input hover:bg-accent">
          {contenuto}
        </button>
      }
    >
      {soloIds.length || !nessuno ? <ScegliPersone titolo={titolo} scelti={ids} soloIds={soloIds} onCambia={onCambia} /> : <p className="p-2 text-sm text-muted-foreground">{nessuno}</p>}
    </Popover>
  )
}
