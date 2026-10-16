"use client"

import { Building2, CalendarDays, Check, Flag, Repeat, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { colore } from "../colori"
import { useAttivita } from "../contesto"
import {
  aggiungiGiorniIso,
  dataLunga,
  descriviRicorrenza,
  giornoSettimana,
  oggiIso,
  ORDINE_PRIORITA,
  PRIORITA,
  prossimaData,
  UNITA,
} from "../regole"
import type { Priorita, UnitaRicorrenza } from "../tipi"
import { CalendarioMini } from "../ui/calendario-mini"
import { cn } from "../ui/cn"
import { Menu, MenuEtichetta, MenuSeparatore, MenuVoce } from "../ui/menu"
import { Popover } from "../ui/popover"
import { ICONE_CATEGORIA, ICONE_STATO } from "./aspetto"

/** Bottoncino-campo usato dai selettori nel dettaglio e nei dialog. */
export function Chip({
  children,
  vuoto,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { vuoto?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-sm transition-colors hover:border-border hover:bg-accent/60 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        vuoto && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SelettoreData({
  valore,
  onCambia,
  trigger,
  titolo = "Scadenza",
  minimo,
}: {
  valore: string | null
  onCambia: (iso: string | null) => void
  trigger: ReactNode
  titolo?: string
  minimo?: string | null
}) {
  const [aperto, setAperto] = useState(false)
  const oggi = oggiIso()
  const lunedi = aggiungiGiorniIso(oggi, 7 - giornoSettimana(oggi))
  const venerdi = aggiungiGiorniIso(oggi, (4 - giornoSettimana(oggi) + 7) % 7 || 7)
  const rapide: [string, string][] = [
    ["Oggi", oggi],
    ["Domani", aggiungiGiorniIso(oggi, 1)],
    ["Venerdì", venerdi],
    ["Lunedì prossimo", lunedi],
    ["Tra una settimana", aggiungiGiorniIso(oggi, 7)],
    ["Tra un mese", prossimaData(oggi, "month", 1)],
  ]
  const scegli = (v: string | null) => {
    onCambia(v)
    setAperto(false)
  }
  return (
    <Popover trigger={trigger} aperto={aperto} onCambia={setAperto} className="w-auto p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{titolo}</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-row flex-wrap gap-1 sm:w-36 sm:flex-col">
          {rapide.map(([l, v]) => (
            <button
              key={l}
              type="button"
              disabled={!!minimo && v < minimo}
              onClick={() => scegli(v)}
              className={cn("rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-40", v === valore && "bg-accent font-medium")}
            >
              {l}
            </button>
          ))}
          {valore ? (
            <button type="button" onClick={() => scegli(null)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent">
              <X className="h-3.5 w-3.5" /> Togli data
            </button>
          ) : null}
        </div>
        <CalendarioMini valore={valore} onScegli={(v) => scegli(minimo && v < minimo ? minimo : v)} />
      </div>
      {valore ? <div className="mt-2 text-center text-xs text-muted-foreground">{dataLunga(valore)}</div> : null}
    </Popover>
  )
}

export function SelettoreStato({ valore, onCambia, trigger }: { valore: string; onCambia: (id: string) => void; trigger: ReactNode }) {
  const { base } = useAttivita()
  return (
    <Menu trigger={trigger} allinea="start">
      <MenuEtichetta>Stato</MenuEtichetta>
      {(base?.stati ?? []).map((s) => {
        const Icona = ICONE_STATO[s.tipo]
        return (
          <MenuVoce key={s.id} onSeleziona={() => onCambia(s.id)}>
            <Icona className={colore(s.colore).testo} />
            <span className="flex-1">{s.nome}</span>
            {s.id === valore ? <Check className="text-primary" /> : null}
          </MenuVoce>
        )
      })}
    </Menu>
  )
}

export function SelettorePriorita({ valore, onCambia, trigger }: { valore: Priorita; onCambia: (p: Priorita) => void; trigger: ReactNode }) {
  return (
    <Menu trigger={trigger} allinea="start">
      <MenuEtichetta>Priorità</MenuEtichetta>
      {ORDINE_PRIORITA.map((p) => (
        <MenuVoce key={p} onSeleziona={() => onCambia(p)}>
          <Flag className={cn(PRIORITA[p].testo, p !== "bassa" && "fill-current")} />
          <span className="flex-1">{PRIORITA[p].label}</span>
          {p === valore ? <Check className="text-primary" /> : null}
        </MenuVoce>
      ))}
    </Menu>
  )
}

export function SelettoreCategoria({
  categoria,
  sottocategoria,
  onCambia,
  trigger,
}: {
  categoria: string
  sottocategoria: string | null
  onCambia: (categoria: string, sottocategoria: string | null) => void
  trigger: ReactNode
}) {
  const { base } = useAttivita()
  const [aperto, setAperto] = useState(false)
  const categorie = (base?.categorie ?? []).filter((c) => c.attiva || c.id === categoria)
  return (
    <Popover trigger={trigger} aperto={aperto} onCambia={setAperto} className="w-64 p-1">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Categoria</div>
      {categorie.map((c) => {
        const Icona = ICONE_CATEGORIA[c.icona ?? ""] ?? Building2
        const sotto = (base?.sottocategorie ?? []).filter((s) => s.categoria_id === c.id && (!s.archiviata_at || s.id === sottocategoria))
        return (
          <div key={c.id}>
            <button
              type="button"
              onClick={() => {
                onCambia(c.id, null)
                setAperto(false)
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", c.id === categoria && !sottocategoria && "bg-accent/60")}
            >
              <Icona className={cn("h-4 w-4", colore(c.colore).testo)} />
              <span className="flex-1 font-medium">{c.nome}</span>
              {c.id === categoria && !sottocategoria ? <Check className="h-4 w-4 text-primary" /> : null}
            </button>
            {sotto.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onCambia(c.id, s.id)
                  setAperto(false)
                }}
                className={cn("flex w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground", s.id === sottocategoria && "bg-accent/60 text-foreground")}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", colore(s.colore ?? c.colore).punto)} />
                <span className="flex-1">{s.nome}</span>
                {s.id === sottocategoria ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            ))}
          </div>
        )
      })}
    </Popover>
  )
}

export type Ricorrenza = {
  ricorrenza_unita: UnitaRicorrenza | null
  ricorrenza_intervallo: number | null
  ricorrenza_fine: string | null
  preavviso_giorni: number | null
}

export function SelettoreRicorrenza({
  valore,
  scadenza,
  onCambia,
  trigger,
}: {
  valore: Ricorrenza
  scadenza: string | null
  onCambia: (r: Ricorrenza) => void
  trigger: ReactNode
}) {
  const [aperto, setAperto] = useState(false)
  const rapide: [string, UnitaRicorrenza, number][] = [
    ["Ogni giorno", "day", 1],
    ["Ogni settimana", "week", 1],
    ["Ogni 2 settimane", "week", 2],
    ["Ogni mese", "month", 1],
    ["Ogni trimestre", "month", 3],
    ["Ogni anno", "year", 1],
  ]
  const imposta = (u: UnitaRicorrenza | null, n: number | null) =>
    onCambia({ ...valore, ricorrenza_unita: u, ricorrenza_intervallo: u ? n : null, ...(u ? {} : { ricorrenza_fine: null, preavviso_giorni: null }) })
  const prossime =
    valore.ricorrenza_unita && valore.ricorrenza_intervallo && scadenza
      ? [1, 2, 3].reduce<string[]>((acc) => [...acc, prossimaData(acc[acc.length - 1] ?? scadenza, valore.ricorrenza_unita!, valore.ricorrenza_intervallo!, Number(scadenza.slice(8)))], [])
      : []
  return (
    <Popover trigger={trigger} aperto={aperto} onCambia={setAperto} className="w-80 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Ripeti</div>
      {!scadenza ? <p className="mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">Serve prima una scadenza: da lì partono le ripetizioni.</p> : null}
      <div className="grid grid-cols-2 gap-1">
        {rapide.map(([l, u, n]) => (
          <button
            key={l}
            type="button"
            disabled={!scadenza}
            onClick={() => imposta(u, n)}
            className={cn(
              "rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40",
              valore.ricorrenza_unita === u && valore.ricorrenza_intervallo === n && "border-primary bg-primary/5 font-medium",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Ogni</span>
        <input
          type="number"
          min={1}
          max={365}
          disabled={!scadenza}
          value={valore.ricorrenza_intervallo ?? ""}
          onChange={(e) => imposta(valore.ricorrenza_unita ?? "month", Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
        />
        <select
          disabled={!scadenza}
          value={valore.ricorrenza_unita ?? ""}
          onChange={(e) => imposta((e.target.value || null) as UnitaRicorrenza | null, valore.ricorrenza_intervallo ?? 1)}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">mai</option>
          {(Object.keys(UNITA) as UnitaRicorrenza[]).map((u) => (
            <option key={u} value={u}>
              {(valore.ricorrenza_intervallo ?? 1) === 1 ? UNITA[u].uno : UNITA[u].molti}
            </option>
          ))}
        </select>
      </div>
      {valore.ricorrenza_unita ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Ricompare giorni prima</span>
            <input
              type="number"
              min={0}
              max={365}
              placeholder={String(UNITA[valore.ricorrenza_unita].preavviso)}
              value={valore.preavviso_giorni ?? ""}
              onChange={(e) => onCambia({ ...valore, preavviso_giorni: e.target.value === "" ? null : Math.max(0, Math.min(365, Number(e.target.value))) })}
              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Fino al</span>
            <input
              type="date"
              value={valore.ricorrenza_fine ?? ""}
              min={scadenza ?? undefined}
              onChange={(e) => onCambia({ ...valore, ricorrenza_fine: e.target.value || null })}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          {prossime.length ? <p className="text-xs text-muted-foreground">Prossime: {prossime.map((d) => d.split("-").reverse().join("/")).join(" · ")}</p> : null}
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => imposta(null, null)}>
            Non ripetere più
          </button>
        </div>
      ) : null}
    </Popover>
  )
}

export function TestoRicorrenza({ unita, n }: { unita: UnitaRicorrenza | null; n: number | null }) {
  const t = descriviRicorrenza(unita, n)
  if (!t) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Repeat className="h-3 w-3" /> {t}
    </span>
  )
}

export { CalendarDays }
