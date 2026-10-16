import { primoNome } from "./regole"
import type { Notifica } from "./tipi"

/** Il testo lo compone l'interfaccia (il database salva tipo, attore, titolo e un estratto). */
export function testoNotifica(n: Notifica, nome: (id: string | null) => string, stato: (id: string) => string): { titolo: string; dettaglio: string | null } {
  const chi = n.attore ? primoNome(nome(n.attore)) : "Qualcuno"
  const titolo = n.titolo ?? "attività"
  switch (n.tipo) {
    case "assegnata":
      return { titolo: `${chi} ti ha assegnato “${titolo}”`, dettaglio: null }
    case "menzione":
      return { titolo: `${chi} ti ha menzionato in “${titolo}”`, dettaglio: n.testo }
    case "commento":
      return { titolo: n.conteggio > 1 ? `${n.conteggio} nuovi messaggi in “${titolo}”` : `${chi} ha scritto in “${titolo}”`, dettaglio: n.testo }
    case "completata":
      return { titolo: `${chi} ha completato “${titolo}”`, dettaglio: n.testo }
    case "stato":
      return { titolo: `${chi} ha spostato “${titolo}” in ${n.testo ? stato(n.testo) : "un altro stato"}`, dettaglio: null }
    case "tocca_a_te":
      return { titolo: `Tocca a te: “${titolo}”`, dettaglio: n.testo }
    case "sottotask_finite":
      return { titolo: `Sottotask tutte fatte in “${titolo}”`, dettaglio: "Puoi chiudere l'attività" }
    case "riaperta":
      return { titolo: `${chi} ha riaperto “${titolo}”`, dettaglio: null }
    default:
      return { titolo, dettaglio: n.testo }
  }
}
