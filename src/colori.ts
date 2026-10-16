import type { Colore } from "./tipi"

/**
 * Classi Tailwind scritte per intero (il compilatore le trova solo così) per i colori di categorie,
 * sottocategorie e stati. Le app devono includere modules/attivita/src nella scansione di Tailwind.
 */
type Toni = { badge: string; punto: string; barra: string; testo: string; tenue: string; anello: string }

export const COLORI: Record<Colore, Toni> = {
  slate: {
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    punto: "bg-slate-500",
    barra: "bg-slate-500/80 hover:bg-slate-500",
    testo: "text-slate-600 dark:text-slate-400",
    tenue: "bg-slate-500/5",
    anello: "ring-slate-500/40",
  },
  red: {
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    punto: "bg-red-500",
    barra: "bg-red-500/80 hover:bg-red-500",
    testo: "text-red-600 dark:text-red-400",
    tenue: "bg-red-500/5",
    anello: "ring-red-500/40",
  },
  orange: {
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    punto: "bg-orange-500",
    barra: "bg-orange-500/80 hover:bg-orange-500",
    testo: "text-orange-600 dark:text-orange-400",
    tenue: "bg-orange-500/5",
    anello: "ring-orange-500/40",
  },
  amber: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    punto: "bg-amber-500",
    barra: "bg-amber-500/80 hover:bg-amber-500",
    testo: "text-amber-600 dark:text-amber-400",
    tenue: "bg-amber-500/5",
    anello: "ring-amber-500/40",
  },
  yellow: {
    badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    punto: "bg-yellow-500",
    barra: "bg-yellow-500/80 hover:bg-yellow-500",
    testo: "text-yellow-600 dark:text-yellow-400",
    tenue: "bg-yellow-500/5",
    anello: "ring-yellow-500/40",
  },
  lime: {
    badge: "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300",
    punto: "bg-lime-500",
    barra: "bg-lime-500/80 hover:bg-lime-500",
    testo: "text-lime-600 dark:text-lime-400",
    tenue: "bg-lime-500/5",
    anello: "ring-lime-500/40",
  },
  emerald: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    punto: "bg-emerald-500",
    barra: "bg-emerald-500/80 hover:bg-emerald-500",
    testo: "text-emerald-600 dark:text-emerald-400",
    tenue: "bg-emerald-500/5",
    anello: "ring-emerald-500/40",
  },
  teal: {
    badge: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    punto: "bg-teal-500",
    barra: "bg-teal-500/80 hover:bg-teal-500",
    testo: "text-teal-600 dark:text-teal-400",
    tenue: "bg-teal-500/5",
    anello: "ring-teal-500/40",
  },
  sky: {
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    punto: "bg-sky-500",
    barra: "bg-sky-500/80 hover:bg-sky-500",
    testo: "text-sky-600 dark:text-sky-400",
    tenue: "bg-sky-500/5",
    anello: "ring-sky-500/40",
  },
  blue: {
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    punto: "bg-blue-500",
    barra: "bg-blue-500/80 hover:bg-blue-500",
    testo: "text-blue-600 dark:text-blue-400",
    tenue: "bg-blue-500/5",
    anello: "ring-blue-500/40",
  },
  indigo: {
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    punto: "bg-indigo-500",
    barra: "bg-indigo-500/80 hover:bg-indigo-500",
    testo: "text-indigo-600 dark:text-indigo-400",
    tenue: "bg-indigo-500/5",
    anello: "ring-indigo-500/40",
  },
  violet: {
    badge: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    punto: "bg-violet-500",
    barra: "bg-violet-500/80 hover:bg-violet-500",
    testo: "text-violet-600 dark:text-violet-400",
    tenue: "bg-violet-500/5",
    anello: "ring-violet-500/40",
  },
  fuchsia: {
    badge: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    punto: "bg-fuchsia-500",
    barra: "bg-fuchsia-500/80 hover:bg-fuchsia-500",
    testo: "text-fuchsia-600 dark:text-fuchsia-400",
    tenue: "bg-fuchsia-500/5",
    anello: "ring-fuchsia-500/40",
  },
  pink: {
    badge: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
    punto: "bg-pink-500",
    barra: "bg-pink-500/80 hover:bg-pink-500",
    testo: "text-pink-600 dark:text-pink-400",
    tenue: "bg-pink-500/5",
    anello: "ring-pink-500/40",
  },
}

export const ELENCO_COLORI = Object.keys(COLORI) as Colore[]

/** Riempimenti dei grafici: 500 su sfondo chiaro, 600 su scuro (validati per daltonismo e contrasto). */
export const GRAFICO: Record<Colore, string> = {
  slate: "bg-slate-400 dark:bg-slate-500",
  red: "bg-red-500 dark:bg-red-600",
  orange: "bg-orange-500 dark:bg-orange-600",
  amber: "bg-amber-500 dark:bg-amber-600",
  yellow: "bg-yellow-500 dark:bg-yellow-600",
  lime: "bg-lime-500 dark:bg-lime-600",
  emerald: "bg-emerald-500 dark:bg-emerald-600",
  teal: "bg-teal-500 dark:bg-teal-600",
  sky: "bg-sky-500 dark:bg-sky-600",
  blue: "bg-blue-500 dark:bg-blue-600",
  indigo: "bg-indigo-500 dark:bg-indigo-600",
  violet: "bg-violet-500 dark:bg-violet-600",
  fuchsia: "bg-fuchsia-500 dark:bg-fuchsia-600",
  pink: "bg-pink-500 dark:bg-pink-600",
}

export const colore = (c: string | null | undefined): Toni => COLORI[(c as Colore) ?? "slate"] ?? COLORI.slate

/** Colore stabile per una persona (avatar senza foto, righe del Gantt per persona). */
const COLORI_PERSONA: Colore[] = ["sky", "violet", "emerald", "orange", "pink", "teal", "indigo", "amber", "fuchsia", "lime"]
export function colorePersona(id: string | null | undefined): Colore {
  if (!id) return "slate"
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORI_PERSONA[h % COLORI_PERSONA.length]
}
