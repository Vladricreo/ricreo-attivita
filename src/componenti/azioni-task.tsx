"use client"

import {
  Archive,
  Bell,
  BellOff,
  BellRing,
  CalendarDays,
  Copy,
  Ellipsis,
  ExternalLink,
  Flag,
  Link2,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { colore } from "../colori"
import { useAttivita } from "../contesto"
import { messaggioErrore } from "../dati/api"
import { aggiungiGiorniIso, giornoSettimana, oggiIso, ORDINE_PRIORITA, PRIORITA } from "../regole"
import type { BozzaTask, Task } from "../tipi"
import { avviso } from "../ui/avvisi"
import { Bottone } from "../ui/bottone"
import { cn } from "../ui/cn"
import { Menu, MenuSeparatore, MenuVoce, SottoMenu } from "../ui/menu"
import { ICONE_STATO } from "./aspetto"
import { DialogoSollecito, useSollecitabili } from "./solleciti"

/** Copia completa: campi, persone, checklist e sottotask (aperte). */
export async function duplicaTask(ctx: ReturnType<typeof useAttivita>, t: Task): Promise<string | null> {
  try {
    const [sotto, voci] = await Promise.all([ctx.api.sottotaskDi(t.id), ctx.api.checklist([t.id])])
    const bozza: BozzaTask = {
      titolo: `${t.titolo} (copia)`.slice(0, 300),
      descrizione: t.descrizione,
      categoria_id: t.categoria_id,
      sottocategoria_id: t.sottocategoria_id,
      priorita: t.priorita,
      data_inizio: t.data_inizio,
      scadenza: t.scadenza,
      ora_scadenza: t.ora_scadenza,
      stima_minuti: t.stima_minuti,
      ricorrenza_unita: t.ricorrenza_unita,
      ricorrenza_intervallo: t.ricorrenza_intervallo,
      ricorrenza_fine: t.ricorrenza_fine,
      preavviso_giorni: t.preavviso_giorni,
      personale: t.personale,
      in_sequenza: t.in_sequenza,
      conferma_tutti: t.conferma_tutti,
      servizio: t.servizio,
      link: t.link,
      dati: t.dati,
      padre_id: t.padre_id,
      assegnatari: t.assegnatari.map((a) => a.user_id),
      checklist: voci.map((v) => v.testo),
      sottotask: t.padre_id
        ? []
        : sotto
            .filter((s) => !s.eliminata_at)
            .map((s) => ({
              titolo: s.titolo,
              descrizione: s.descrizione,
              priorita: s.priorita,
              scadenza: s.scadenza,
              data_inizio: s.data_inizio,
              conferma_tutti: s.conferma_tutti,
              assegnatari: s.assegnatari.map((a) => a.user_id),
            })),
    }
    const id = await ctx.azioni.crea(bozza)
    if (id) avviso.ok("Attività duplicata", { etichetta: "Apri", fai: () => ctx.apri(id) })
    return id
  } catch (e) {
    avviso.errore(messaggioErrore(e))
    return null
  }
}

export function MenuAzioniTask({ t, onApri, className }: { t: Task; onApri?: () => void; className?: string }) {
  const ctx = useAttivita()
  const { azioni, base, me, config } = ctx
  const oggi = oggiIso()
  const lunedi = aggiungiGiorniIso(oggi, 7 - giornoSettimana(oggi))
  const sposta = (d: string | null) => {
    const patch: { scadenza: string | null; data_inizio?: string | null } = { scadenza: d }
    if (d && t.data_inizio && t.data_inizio > d) patch.data_inizio = d
    void azioni.aggiorna(t.id, patch)
  }
  const seguo = !!me && t.osservatori.includes(me)
  const sollecitabili = useSollecitabili(t)
  const [sollecito, setSollecito] = useState(false)
  const ferma = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <>
    <Menu
      trigger={
        <Bottone variante="fantasma" misura="icona-sm" className={cn("text-muted-foreground", className)} aria-label="Azioni" onClick={(e) => e.stopPropagation()}>
          <Ellipsis />
        </Bottone>
      }
    >
      {onApri ? (
        <MenuVoce onSeleziona={onApri}>
          <ExternalLink /> Apri
        </MenuVoce>
      ) : null}
      <SottoMenu
        etichetta={
          <>
            <RotateCcw /> Stato
          </>
        }
      >
        {(base?.stati ?? []).map((s) => {
          const Icona = ICONE_STATO[s.tipo]
          return (
            <MenuVoce key={s.id} onSeleziona={() => (s.tipo === "fatto" ? void azioni.completa(t) : void azioni.aggiorna(t.id, { stato_id: s.id }))}>
              <Icona className={colore(s.colore).testo} /> {s.nome}
            </MenuVoce>
          )
        })}
      </SottoMenu>
      <SottoMenu
        etichetta={
          <>
            <Flag /> Priorità
          </>
        }
      >
        {ORDINE_PRIORITA.map((p) => (
          <MenuVoce key={p} onSeleziona={() => void azioni.aggiorna(t.id, { priorita: p })}>
            <Flag className={cn(PRIORITA[p].testo, p !== "bassa" && "fill-current")} /> {PRIORITA[p].label}
          </MenuVoce>
        ))}
      </SottoMenu>
      <SottoMenu
        etichetta={
          <>
            <CalendarDays /> Rimanda
          </>
        }
      >
        <MenuVoce onSeleziona={() => sposta(oggi)}>Oggi</MenuVoce>
        <MenuVoce onSeleziona={() => sposta(aggiungiGiorniIso(oggi, 1))}>Domani</MenuVoce>
        <MenuVoce onSeleziona={() => sposta(lunedi)}>Lunedì prossimo</MenuVoce>
        <MenuVoce onSeleziona={() => sposta(aggiungiGiorniIso(t.scadenza ?? oggi, 7))}>Una settimana dopo</MenuVoce>
        {t.scadenza && !t.ricorrenza_unita ? <MenuVoce onSeleziona={() => sposta(null)}>Senza scadenza</MenuVoce> : null}
      </SottoMenu>
      <MenuSeparatore />
      {sollecitabili.length ? (
        <MenuVoce onSeleziona={() => setSollecito(true)}>
          <BellRing /> Sollecita…
        </MenuVoce>
      ) : null}
      <MenuVoce onSeleziona={() => void azioni.osserva(t, !seguo)}>
        {seguo ? <BellOff /> : <Bell />} {seguo ? "Non seguire più" : "Segui"}
      </MenuVoce>
      <MenuVoce
        onSeleziona={() => {
          const url = `${window.location.origin}${config.percorso}?task=${t.id}`
          navigator.clipboard?.writeText(url).then(
            () => avviso.ok("Link copiato"),
            () => avviso.errore("Non riesco a copiare il link"),
          )
        }}
      >
        <Link2 /> Copia link
      </MenuVoce>
      <MenuVoce onSeleziona={() => void duplicaTask(ctx, t)}>
        <Copy /> Duplica
      </MenuVoce>
      <MenuSeparatore />
      {t.archiviata_at ? (
        <MenuVoce onSeleziona={() => void azioni.disarchivia(t)}>
          <Archive /> Riporta tra le attività
        </MenuVoce>
      ) : (
        <MenuVoce onSeleziona={() => void azioni.archivia(t)}>
          <Archive /> Archivia (non si fa più)
        </MenuVoce>
      )}
      {t.eliminata_at ? (
        <MenuVoce onSeleziona={() => void azioni.recupera(t)}>
          <RotateCcw /> Recupera dal cestino
        </MenuVoce>
      ) : (
        <MenuVoce distruttiva onSeleziona={() => void azioni.elimina(t)}>
          <Trash2 /> Sposta nel cestino
        </MenuVoce>
      )}
    </Menu>
    {sollecitabili.length ? (
      // Il dialogo sta in un portal ma gli eventi React risalgono: non devono arrivare a riga o scheda (apri, trascina).
      <span className="contents" onClick={ferma} onPointerDown={ferma} onKeyDown={ferma}>
        <DialogoSollecito t={t} aperto={sollecito} onChiudi={() => setSollecito(false)} />
      </span>
    ) : null}
    </>
  )
}
