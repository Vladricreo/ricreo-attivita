"use client"

import { Check, Search, Users } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { colore, colorePersona } from "../colori"
import { useAttivita } from "../contesto"
import { eAdmin, eManager, iniziali, normalizza } from "../regole"
import type { Persona } from "../tipi"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

const MISURE = { xs: "h-5 w-5 text-[9px]", sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" }

export function AvatarPersona({
  id,
  misura = "sm",
  className,
  conNome,
  fatto,
}: {
  id: string | null | undefined
  misura?: keyof typeof MISURE
  className?: string
  conNome?: boolean
  /** Bordo verde: ha fatto la sua parte. */
  fatto?: boolean
}) {
  const { persona, config } = useAttivita()
  const p = persona(id)
  const url = p && config.avatarUrl ? config.avatarUrl(p) : null
  const [rotto, setRotto] = useState(false)
  const nome = p?.nome ?? "Persona"
  const tondo = (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-background",
        MISURE[misura],
        !url || rotto ? cn(colore(colorePersona(id)).punto, "text-white") : "bg-muted",
        fatto && "ring-emerald-500",
        className,
      )}
    >
      {url && !rotto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" onError={() => setRotto(true)} />
      ) : (
        iniziali(nome)
      )}
    </span>
  )
  if (conNome)
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {tondo}
        <span className="truncate text-sm">{nome}</span>
      </span>
    )
  return <Suggerimento testo={fatto ? `${nome} · ha fatto la sua parte` : nome}>{tondo}</Suggerimento>
}

export function GruppoAvatar({
  ids,
  max = 3,
  misura = "sm",
  fatti,
  vuoto,
}: {
  ids: string[]
  max?: number
  misura?: keyof typeof MISURE
  fatti?: Set<string>
  vuoto?: ReactNode
}) {
  const { persona } = useAttivita()
  if (!ids.length) return <>{vuoto ?? null}</>
  const visibili = ids.slice(0, max)
  const altri = ids.slice(max)
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {visibili.map((id) => (
        <AvatarPersona key={id} id={id} misura={misura} fatto={fatti?.has(id)} />
      ))}
      {altri.length ? (
        <Suggerimento testo={altri.map((id) => persona(id)?.nome ?? "?").join(", ")}>
          <span className={cn("inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background", MISURE[misura])}>
            +{altri.length}
          </span>
        </Suggerimento>
      ) : null}
    </span>
  )
}

export function etichettaRuolo(p: Persona): string | null {
  if (eAdmin(p)) return "Admin"
  if (eManager(p)) return "Manager"
  return null
}

/** Elenco persone con ricerca e scelta multipla (o singola). */
export function ScegliPersone({
  scelti,
  onCambia,
  multiplo = true,
  soloIds,
  titolo,
  onFine,
}: {
  scelti: string[]
  onCambia: (ids: string[]) => void
  multiplo?: boolean
  /** Limita a queste persone (es. attività personale = solo io). */
  soloIds?: string[]
  titolo?: string
  onFine?: () => void
}) {
  const { base, me, config } = useAttivita()
  const [q, setQ] = useState("")
  const persone = useMemo(() => {
    const tutte = (base?.persone ?? []).filter((p) => p.attivo && (!soloIds || soloIds.includes(p.auth_id)))
    const n = normalizza(q.trim())
    const filtrate = n ? tutte.filter((p) => normalizza(`${p.nome} ${p.username ?? ""} ${p.email ?? ""}`).includes(n)) : tutte
    // Io in cima, poi chi entra in questa app, poi gli altri.
    return filtrate.sort(
      (a, b) =>
        Number(b.auth_id === me) - Number(a.auth_id === me) ||
        Number(b.app.includes(config.app)) - Number(a.app.includes(config.app)) ||
        a.nome.localeCompare(b.nome),
    )
  }, [base?.persone, q, soloIds, me, config.app])

  const cambia = (id: string) => {
    if (!multiplo) {
      onCambia(scelti[0] === id ? [] : [id])
      onFine?.()
      return
    }
    onCambia(scelti.includes(id) ? scelti.filter((x) => x !== id) : [...scelti, id])
  }

  return (
    <div className="flex flex-col gap-1">
      {titolo ? <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">{titolo}</div> : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca persona…"
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="mt-1 max-h-72 overflow-y-auto">
        {persone.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> Nessuna persona
          </div>
        ) : (
          persone.map((p) => {
            const si = scelti.includes(p.auth_id)
            const ruolo = etichettaRuolo(p)
            return (
              <button
                key={p.auth_id}
                type="button"
                onClick={() => cambia(p.auth_id)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", si && "bg-accent/60")}
              >
                <AvatarPersona id={p.auth_id} misura="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {p.nome}
                    {p.auth_id === me ? <span className="text-muted-foreground"> (tu)</span> : null}
                  </span>
                  {!p.app.includes(config.app) ? <span className="block truncate text-[11px] text-muted-foreground">Non usa questa app</span> : null}
                </span>
                {ruolo ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{ruolo}</span> : null}
                <Check className={cn("h-4 w-4 shrink-0 text-primary", si ? "opacity-100" : "opacity-0")} />
              </button>
            )
          })
        )}
      </div>
      {multiplo && scelti.length > 0 ? (
        <button type="button" className="mt-1 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => onCambia([])}>
          Togli tutti
        </button>
      ) : null}
    </div>
  )
}
