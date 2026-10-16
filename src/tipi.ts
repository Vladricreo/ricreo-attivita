import type { ReactNode } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Tipi del modulo attività (schema `tasks`, supabase/migrations/20261113090000_attivita_schema.sql).
 * Date senza ora come stringhe ISO yyyy-mm-dd (fuso di Roma), istanti come ISO completi.
 */

export type Priorita = "bassa" | "normale" | "alta" | "urgente"
export type UnitaRicorrenza = "day" | "week" | "month" | "year"
export type TipoStato = "aperto" | "attivo" | "revisione" | "bloccato" | "fatto"
export type Colore =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "emerald"
  | "teal"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "pink"

export type Assegnazione = {
  user_id: string
  ordine: number
  fatto_at: string | null
  assegnato_da: string | null
  assegnato_at: string
}

export type Collegamento = {
  id: string
  app_slug: string
  tipo: string
  rif_id: string | null
  etichetta: string | null
  url: string | null
}

export type Task = {
  id: string
  radice_id: string
  padre_id: string | null
  ordine: number
  categoria_id: string
  sottocategoria_id: string | null
  titolo: string
  descrizione: string | null
  stato_id: string
  stato_tipo: TipoStato
  priorita: Priorita
  data_inizio: string | null
  scadenza: string | null
  ora_scadenza: string | null
  stima_minuti: number | null
  ricorrenza_unita: UnitaRicorrenza | null
  ricorrenza_intervallo: number | null
  ricorrenza_fine: string | null
  ricorrenza_giorno: number | null
  preavviso_giorni: number | null
  personale: boolean
  in_sequenza: boolean
  conferma_tutti: boolean
  copertina_id: string | null
  copertina_percorso: string | null
  servizio: string | null
  link: string | null
  app_origine: string | null
  dati: Record<string, unknown>
  legacy_id: string | null
  creato_da: string | null
  creato_at: string
  aggiornato_at: string
  aggiornato_da: string | null
  completata_at: string | null
  completata_da: string | null
  ultimo_completamento_at: string | null
  archiviata_at: string | null
  archiviata_da: string | null
  archivio_motivo: string | null
  automatizzata_da: string | null
  eliminata_at: string | null
  eliminata_da: string | null
  assegnatari: Assegnazione[]
  osservatori: string[]
  dipende_da: string[]
  n_sottotask: number
  n_sottotask_fatte: number
  n_checklist: number
  n_checklist_fatte: number
  n_commenti: number
  ultimo_commento_at: string | null
  n_non_letti: number
  n_allegati: number
  collegamenti: Collegamento[]
  n_completamenti: number
}

/** Campi modificabili direttamente (update sulla tabella). */
export type ModificaTask = Partial<
  Pick<
    Task,
    | "titolo"
    | "descrizione"
    | "categoria_id"
    | "sottocategoria_id"
    | "stato_id"
    | "priorita"
    | "data_inizio"
    | "scadenza"
    | "ora_scadenza"
    | "stima_minuti"
    | "ricorrenza_unita"
    | "ricorrenza_intervallo"
    | "ricorrenza_fine"
    | "preavviso_giorni"
    | "personale"
    | "in_sequenza"
    | "conferma_tutti"
    | "copertina_id"
    | "servizio"
    | "link"
    | "ordine"
    | "dati"
    | "archiviata_at"
    | "archivio_motivo"
    | "automatizzata_da"
    | "eliminata_at"
  >
>

/** Bozza per tasks.crea_task (anche da altre pagine dell'app: apriNuovaAttivita). */
export type BozzaTask = {
  titolo: string
  descrizione?: string | null
  categoria_id?: string
  sottocategoria_id?: string | null
  stato_id?: string
  priorita?: Priorita
  data_inizio?: string | null
  scadenza?: string | null
  ora_scadenza?: string | null
  stima_minuti?: number | null
  ricorrenza_unita?: UnitaRicorrenza | null
  ricorrenza_intervallo?: number | null
  ricorrenza_fine?: string | null
  preavviso_giorni?: number | null
  personale?: boolean
  in_sequenza?: boolean
  conferma_tutti?: boolean
  servizio?: string | null
  link?: string | null
  dati?: Record<string, unknown>
  padre_id?: string | null
  ordine?: number
  assegnatari?: string[]
  osservatori?: string[]
  checklist?: string[]
  sottotask?: BozzaTask[]
  collegamenti?: Omit<Collegamento, "id">[]
  /** App da cui nasce (la mette il provider). */
  app_origine?: string
  /** Sottocategoria per nome, quando chi apre la finestra non ne conosce l'id (la risolve l'interfaccia). */
  sottocategoria_nome?: string
}

export type Persona = {
  auth_id: string
  user_id: number
  nome: string
  username: string | null
  email: string | null
  avatar_path: string | null
  ruoli: string[]
  app: string[]
  attivo: boolean
}

export type Categoria = {
  id: string
  nome: string
  app_slug: string | null
  colore: Colore
  icona: string | null
  ordine: number
  attiva: boolean
}

export type Sottocategoria = {
  id: string
  categoria_id: string
  nome: string
  colore: Colore | null
  ordine: number
  archiviata_at: string | null
}

export type Stato = {
  id: string
  nome: string
  tipo: TipoStato
  colore: Colore
  ordine: number
}

export type AppRicreo = { slug: string; nome: string; url: string | null; logo_url: string | null; ordine: number }

export type ManagerPersona = { manager_id: string; persona_id: string }

/** Viste con cui si può aprire la pagina Attività. */
export type VistaIniziale = "lista" | "bacheca" | "calendario" | "gantt" | "dashboard"

/** Preferenze della persona, uguali in tutte le app. vista_iniziale null = l'ultima usata in quell'app. */
export type Preferenze = { vista_iniziale: VistaIniziale | null }

export type VoceChecklist = {
  id: string
  task_id: string
  testo: string
  ordine: number
  assegnatario: string | null
  fatta_at: string | null
  fatta_da: string | null
  creato_at: string
}

export type Commento = {
  id: string
  task_id: string
  autore: string | null
  testo: string
  risposta_a: string | null
  menzioni: string[]
  creato_at: string
  modificato_at: string | null
  eliminato_at: string | null
}

export type Reazione = { commento_id: string; user_id: string; emoji: string }

export type Allegato = {
  id: string
  task_id: string
  commento_id: string | null
  percorso: string
  nome: string
  tipo_mime: string | null
  dimensione: number | null
  larghezza: number | null
  altezza: number | null
  caricato_da: string | null
  caricato_at: string
  eliminato_at: string | null
}

export type VoceStorico = {
  id: number
  task_id: string
  attore: string | null
  azione: string
  dettagli: Record<string, unknown>
  creato_at: string
}

export type Completamento = {
  id: string
  task_id: string
  scadenza: string | null
  completata_at: string
  completata_da: string | null
  titolo: string
  categoria_id: string
  sottocategoria_id: string | null
  padre_id: string | null
  radice_id: string
}

export type TipoNotifica =
  | "assegnata"
  | "menzione"
  | "commento"
  | "completata"
  | "stato"
  | "tocca_a_te"
  | "sottotask_finite"
  | "scadenza"
  | "riaperta"

export type Notifica = {
  id: string
  user_id: string
  tipo: TipoNotifica
  task_id: string | null
  commento_id: string | null
  attore: string | null
  app_slug: string | null
  titolo: string | null
  testo: string | null
  conteggio: number
  creata_at: string
  aggiornata_at: string
  letta_at: string | null
  archiviata_at: string | null
}

/** Configurazione passata da ogni app al modulo. */
export type ConfigAttivita = {
  /** Slug dell'app che monta il modulo (public."RicreoApp".slug): categoria di default e notifiche. */
  app: string
  /** Client Supabase del browser con la sessione dell'utente (lo schema di default non conta). */
  supabase: SupabaseClient<any, any, any>
  /** Percorso della pagina Attività in questa app (es. "/tasks"). */
  percorso: string
  /** Avatar della persona (ogni app li serve a modo suo). */
  avatarUrl?: (p: Persona) => string | null
  /** Navigazione interna (router.push); senza, si usa location. */
  naviga?: (href: string) => void
  /** Pagine di questa app proposte nel campo "Pagina da aprire". */
  pagine?: { etichetta: string; href: string }[]
  /** Dopo un'azione che avvisa altre persone (es. push immediate dell'app): assegnazioni e messaggi. */
  dopo?: (e: { tipo: "assegnazione" | "messaggio"; taskId: string; utenti: string[] }) => void
  /** Pezzi specifici dell'app. */
  estensioni?: {
    /** Sezione in fondo al dettaglio (es. Finance: stato del job che fa l'attività). */
    dettaglio?: (t: Task) => ReactNode
    /** Sezione in fondo all'archivio. */
    archivio?: () => ReactNode
    /** Come mostrare un collegamento di questa app (etichetta, link). */
    collegamento?: (c: Collegamento) => { etichetta: string; href?: string } | null
  }
}
