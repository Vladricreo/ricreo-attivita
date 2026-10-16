"use client"

import { AtSign, Bell, BellRing, CircleCheck, Hourglass, ListChecks, Megaphone, MessageSquare, RotateCcw, Shuffle, UserPlus, X, type LucideIcon } from "lucide-react"
import { useMemo } from "react"
import { colore } from "../colori"
import { useAttivita, useRichiedi } from "../contesto"
import { quandoRelativo } from "../regole"
import { testoNotifica } from "../testi"
import type { Notifica, TipoNotifica } from "../tipi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Popover } from "../ui/popover"
import { AvatarPersona } from "./persone"

const ICONE: Record<TipoNotifica, LucideIcon> = {
  assegnata: UserPlus,
  menzione: AtSign,
  commento: MessageSquare,
  completata: CircleCheck,
  stato: Shuffle,
  tocca_a_te: Hourglass,
  sottotask_finite: ListChecks,
  scadenza: Bell,
  riaperta: RotateCcw,
  sollecito: BellRing,
  sollecito_forte: Megaphone,
}

export function RigaNotifica({ n, onApri, onArchivia, compatta }: { n: Notifica; onApri: () => void; onArchivia?: () => void; compatta?: boolean }) {
  const { persona, stato, base, config } = useAttivita()
  const { titolo, dettaglio } = testoNotifica(n, (id) => persona(id)?.nome ?? "Qualcuno", (id) => stato(id)?.nome ?? id)
  const Icona = ICONE[n.tipo] ?? Bell
  const app = n.app_slug && n.app_slug !== config.app ? base?.app.find((a) => a.slug === n.app_slug) : null
  const cat = base?.categorie.find((c) => c.app_slug === n.app_slug)
  return (
    <div className={cn("group relative flex gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-accent/40", !n.letta_at && "bg-primary/[0.04]")}>
      <button type="button" onClick={onApri} className="absolute inset-0" aria-label="Apri" />
      <div className="relative shrink-0">
        {n.attore ? <AvatarPersona id={n.attore} misura="md" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Icona className="h-4 w-4" /></span>}
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <Icona className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        <div className={cn("text-sm leading-snug", !n.letta_at && "font-medium")}>{titolo}</div>
        {dettaglio && !compatta ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{dettaglio}</div> : null}
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {quandoRelativo(n.aggiornata_at)}
          {app ? <span className={cn("rounded border px-1 text-[10px]", colore(cat?.colore).badge)}>{app.nome}</span> : null}
        </div>
      </div>
      {!n.letta_at ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
      {onArchivia ? (
        <button type="button" onClick={onArchivia} className="relative z-10 shrink-0 self-start rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100" aria-label="Togli">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Notifiche che riguardano questa app (quelle della sua categoria o senza app). */
export function useNotificheApp() {
  const { notifiche, config } = useAttivita()
  return useMemo(() => {
    const qui = (notifiche ?? []).filter((n) => !n.app_slug || n.app_slug === config.app)
    return { tutte: notifiche ?? [], qui, nonLette: qui.filter((n) => !n.letta_at).length }
  }, [notifiche, config.app])
}

/** Campanella per le app che non hanno un sistema di notifiche proprio da unire. */
export function CampanellaAttivita({ className }: { className?: string }) {
  useRichiedi("notifiche")
  const { api, apri, ricarica, config } = useAttivita()
  const { qui, nonLette } = useNotificheApp()
  const apriNotifica = async (n: Notifica) => {
    if (!n.letta_at) await api.segnaNotificheLette([n.id]).catch(() => undefined)
    void ricarica("notifiche")
    if (n.task_id) apri(n.task_id)
  }
  return (
    <Popover
      allinea="end"
      className="w-[min(24rem,calc(100vw-1rem))] p-0"
      trigger={
        <button type="button" className={cn("relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground", className)} aria-label="Notifiche attività">
          <Bell className="h-5 w-5" />
          {nonLette ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{nonLette > 99 ? "99+" : nonLette}</span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Attività</span>
        {nonLette ? (
          <Bottone
            variante="fantasma"
            misura="sm"
            onClick={async () => {
              await api.segnaNotificheLette(qui.filter((n) => !n.letta_at).map((n) => n.id)).catch(() => undefined)
              void ricarica("notifiche")
            }}
          >
            Segna tutte lette
          </Bottone>
        ) : null}
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {qui.slice(0, 25).map((n) => (
          <RigaNotifica key={n.id} n={n} compatta onApri={() => void apriNotifica(n)} />
        ))}
        {!qui.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nessuna notifica.</div> : null}
      </div>
      <a href={`${config.percorso}?vista=inbox`} className="block border-t border-border px-3 py-2 text-center text-sm font-medium text-primary hover:bg-accent/40">
        Vedi tutte
      </a>
    </Popover>
  )
}
