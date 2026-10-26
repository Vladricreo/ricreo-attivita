"use client"

import {
  Ban,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  Camera,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Code,
  Eye,
  Factory,
  FileText,
  Flag,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  Megaphone,
  Package,
  Palette,
  Printer,
  Rocket,
  Scale,
  Shield,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Target,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { colore } from "../colori"
import { useAttivita } from "../contesto"
import { logoServizio, PRIORITA, progresso } from "../regole"
import type { Priorita, Task, TipoStato } from "../tipi"
import { cn } from "../ui/cn"
import { Suggerimento } from "../ui/suggerimento"

/** Icone disponibili per le categorie: la chiave (kebab-case) è quella salvata in `tasks.categorie.icona`. */
export const ICONE_CATEGORIA: Record<string, LucideIcon> = {
  wallet: Wallet,
  boxes: Boxes,
  printer: Printer,
  package: Package,
  calculator: Calculator,
  building: Building2,
  target: Target,
  megaphone: Megaphone,
  users: Users,
  truck: Truck,
  wrench: Wrench,
  palette: Palette,
  "shopping-cart": ShoppingCart,
  store: Store,
  tag: Tag,
  headphones: Headphones,
  scale: Scale,
  briefcase: Briefcase,
  heart: Heart,
  "graduation-cap": GraduationCap,
  code: Code,
  globe: Globe,
  mail: Mail,
  camera: Camera,
  leaf: Leaf,
  factory: Factory,
  "file-text": FileText,
  lightbulb: Lightbulb,
  rocket: Rocket,
  calendar: Calendar,
  house: House,
  shield: Shield,
  sparkles: Sparkles,
}

export const ICONE_STATO: Record<TipoStato, LucideIcon> = {
  aperto: Circle,
  attivo: CircleDot,
  revisione: Eye,
  bloccato: Ban,
  fatto: CircleCheck,
}

export function BadgeCategoria({ id, sottocategoria, piccolo, className }: { id: string; sottocategoria?: string | null; piccolo?: boolean; className?: string }) {
  const { categoria, sottocategoria: sotto } = useAttivita()
  const c = categoria(id)
  const s = sotto(sottocategoria)
  if (!c) return null
  const Icona = ICONE_CATEGORIA[c.icona ?? ""] ?? Building2
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border font-medium",
        piccolo ? "px-1.5 py-0 text-[10px] leading-4" : "px-1.5 py-0.5 text-[11px]",
        colore(c.colore).badge,
        className,
      )}
    >
      <Icona className={piccolo ? "h-2.5 w-2.5 shrink-0" : "h-3 w-3 shrink-0"} />
      <span className="truncate">
        {c.nome}
        {s ? <span className="opacity-70"> · {s.nome}</span> : null}
      </span>
    </span>
  )
}

export function BadgeStato({ id, className }: { id: string; className?: string }) {
  const { stato } = useAttivita()
  const s = stato(id)
  if (!s) return null
  const Icona = ICONE_STATO[s.tipo]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", colore(s.colore).badge, className)}>
      <Icona className="h-3 w-3" />
      {s.nome}
    </span>
  )
}

export function BandierinaPriorita({ priorita, sempre, className }: { priorita: Priorita; sempre?: boolean; className?: string }) {
  if (priorita === "normale" && !sempre) return null
  const p = PRIORITA[priorita]
  return (
    <Suggerimento testo={`Priorità ${p.label.toLowerCase()}`}>
      <Flag className={cn("h-3.5 w-3.5 shrink-0", p.testo, priorita !== "bassa" && "fill-current", className)} />
    </Suggerimento>
  )
}

export function LogoServizio({ servizio, className }: { servizio: string | null | undefined; className?: string }) {
  const logo = logoServizio(servizio)
  if (!logo) return null
  return (
    <Suggerimento testo={logo.nome}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.url} alt={logo.nome} className={cn("h-4 w-4 shrink-0 rounded-sm", className)} loading="lazy" />
    </Suggerimento>
  )
}

export function Personale({ className }: { className?: string }) {
  return (
    <Suggerimento testo="Personale: la vedi solo tu">
      <Lock className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} />
    </Suggerimento>
  )
}

export function BarraProgresso({ t, className, conTesto }: { t: Task; className?: string; conTesto?: boolean }) {
  const p = progresso(t)
  if (p == null) return null
  const fatte = t.n_sottotask_fatte + t.n_checklist_fatte
  const tot = t.n_sottotask + t.n_checklist
  return (
    <Suggerimento testo={`${fatte} di ${tot} fatte`}>
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
          <span className={cn("block h-full rounded-full", p >= 1 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.round(p * 100)}%` }} />
        </span>
        {conTesto ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {fatte}/{tot}
          </span>
        ) : null}
      </span>
    </Suggerimento>
  )
}

/** Cerchio per completare (bordo del colore della priorità). */
export function SpuntaCompleta({
  t,
  onClick,
  misura = "md",
  inAttesa,
}: {
  t: Task
  onClick: () => void
  misura?: "sm" | "md"
  inAttesa?: string | null
}) {
  const { me } = useAttivita()
  const fatta = t.stato_tipo === "fatto"
  const miaFatta = t.conferma_tutti && !!t.assegnatari.find((a) => a.user_id === me)?.fatto_at
  const p = PRIORITA[t.priorita]
  const titolo = fatta
    ? "Riapri"
    : inAttesa
      ? `In attesa di: ${inAttesa}`
      : t.conferma_tutti
        ? miaFatta
          ? "Hai fatto la tua parte (tocca agli altri)"
          : "Segna la tua parte come fatta"
        : t.ricorrenza_unita
          ? "Fatta (passa alla prossima)"
          : "Segna completata"
  return (
    <Suggerimento testo={titolo}>
      <button
        type="button"
        aria-label={titolo}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        className={cn(
          "group/spunta relative flex shrink-0 items-center justify-center rounded-full border-2 transition-colors after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
          misura === "sm" ? "h-4 w-4" : "h-5 w-5",
          fatta
            ? "border-emerald-500 bg-emerald-500 text-white"
            : miaFatta
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-600"
              : inAttesa
                ? "border-dashed border-muted-foreground/40"
                : t.priorita === "urgente" || t.priorita === "alta"
                  ? cn(p.testo, "border-current hover:bg-muted")
                  : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
        )}
      >
        {fatta || miaFatta ? (
          <svg viewBox="0 0 16 16" className={misura === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : inAttesa ? (
          <CircleDashed className="hidden" />
        ) : (
          <svg viewBox="0 0 16 16" className={cn("opacity-0 group-hover/spunta:opacity-60", misura === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </Suggerimento>
  )
}
