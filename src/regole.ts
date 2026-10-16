import type { Persona, Priorita, Stato, Task, TipoStato, UnitaRicorrenza } from "./tipi"

// --- Date (stringhe ISO yyyy-mm-dd, fuso di Roma) ---------------------------------------------------

export function oggiIso(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date())
}

export function aggiungiGiorniIso(iso: string, giorni: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + giorni)
  return d.toISOString().slice(0, 10)
}

export function giorniTraIso(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${da}T12:00:00Z`)) / 86_400_000)
}

/** 0 = lunedì … 6 = domenica */
export function giornoSettimana(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
}

export function inizioSettimana(iso: string): string {
  return aggiungiGiorniIso(iso, -giornoSettimana(iso))
}

export function inizioMese(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function aggiungiMesiIso(iso: string, mesi: number): string {
  const [a, m] = iso.split("-").map(Number)
  const t = a * 12 + (m - 1) + mesi
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`
}

export function giorniNelMese(iso: string): number {
  const [a, m] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
export const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
export const GIORNI_BREVI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]

export function dataBreve(iso: string, oggi = oggiIso()): string {
  const [a, m, g] = iso.split("-").map(Number)
  return `${g} ${MESI_BREVI[m - 1]}${a !== Number(oggi.slice(0, 4)) ? ` ${a}` : ""}`
}

export function dataLunga(iso: string): string {
  const [a, m, g] = iso.split("-").map(Number)
  return `${g} ${MESI[m - 1]} ${a}`
}

/** "Scaduta da 3 giorni", "Oggi", "Domani", "Ven 10 ott", "12 nov". */
export function scadenzaRelativa(iso: string, oggi = oggiIso()): string {
  const g = giorniTraIso(oggi, iso)
  if (g < -1) return `Scaduta da ${-g} giorni`
  if (g === -1) return "Ieri"
  if (g === 0) return "Oggi"
  if (g === 1) return "Domani"
  if (g < 7) {
    const giorno = GIORNI_BREVI[giornoSettimana(iso)]
    return `${giorno.charAt(0).toUpperCase()}${giorno.slice(1)} ${dataBreve(iso, oggi)}`
  }
  return dataBreve(iso, oggi)
}

/** "adesso", "5 min fa", "3 ore fa", "ieri", "12 ott" */
export function quandoRelativo(istante: string): string {
  const min = Math.round((Date.now() - Date.parse(istante)) / 60_000)
  if (min < 1) return "adesso"
  if (min < 60) return `${min} min fa`
  const ore = Math.round(min / 60)
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`
  const giorno = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(istante))
  const g = giorniTraIso(giorno, oggiIso())
  if (g === 1) return "ieri"
  if (g < 7) return `${g} giorni fa`
  return dataBreve(giorno)
}

export function oraRoma(istante: string): string {
  return new Date(istante).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
}

export function giornoRoma(istante: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(istante))
}

// --- Priorità, ricorrenze -----------------------------------------------------------------------------

export const PRIORITA: Record<Priorita, { label: string; ordine: number; testo: string; punto: string; chip: string }> = {
  urgente: {
    label: "Urgente",
    ordine: 0,
    testo: "text-red-600 dark:text-red-400",
    punto: "bg-red-500",
    chip: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  alta: {
    label: "Alta",
    ordine: 1,
    testo: "text-orange-600 dark:text-orange-400",
    punto: "bg-orange-500",
    chip: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  normale: {
    label: "Normale",
    ordine: 2,
    testo: "text-sky-600 dark:text-sky-400",
    punto: "bg-sky-500",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  bassa: {
    label: "Bassa",
    ordine: 3,
    testo: "text-muted-foreground",
    punto: "bg-slate-400",
    chip: "border-border bg-muted/60 text-muted-foreground",
  },
}
export const ORDINE_PRIORITA: Priorita[] = ["urgente", "alta", "normale", "bassa"]

export const UNITA: Record<UnitaRicorrenza, { uno: string; molti: string; preavviso: number }> = {
  day: { uno: "giorno", molti: "giorni", preavviso: 0 },
  week: { uno: "settimana", molti: "settimane", preavviso: 1 },
  month: { uno: "mese", molti: "mesi", preavviso: 5 },
  year: { uno: "anno", molti: "anni", preavviso: 30 },
}

export function descriviRicorrenza(unita: UnitaRicorrenza | null, n: number | null): string | null {
  if (!unita || !n) return null
  if (n === 1) return unita === "day" ? "Ogni giorno" : unita === "week" ? "Ogni settimana" : unita === "month" ? "Ogni mese" : "Ogni anno"
  if (unita === "month" && n === 3) return "Ogni trimestre"
  if (unita === "month" && n === 6) return "Ogni semestre"
  return `Ogni ${n} ${UNITA[unita].molti}`
}

export const ricorrente = (t: Pick<Task, "ricorrenza_unita" | "ricorrenza_intervallo">) => !!(t.ricorrenza_unita && t.ricorrenza_intervallo)

/** Stesso calcolo di tasks_private.prossima_data (anteprima nel dialog). */
export function prossimaData(iso: string, unita: UnitaRicorrenza, n: number, giorno?: number | null): string {
  if (unita === "day") return aggiungiGiorniIso(iso, n)
  if (unita === "week") return aggiungiGiorniIso(iso, 7 * n)
  const [a, m, g] = iso.split("-").map(Number)
  const totale = a * 12 + (m - 1) + (unita === "year" ? 12 * n : n)
  const anno = Math.floor(totale / 12)
  const mese = (totale % 12) + 1
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return `${anno}-${String(mese).padStart(2, "0")}-${String(Math.min(giorno ?? g, ultimo)).padStart(2, "0")}`
}

export function preavviso(t: Pick<Task, "ricorrenza_unita" | "preavviso_giorni">): number {
  if (t.preavviso_giorni != null) return t.preavviso_giorni
  return t.ricorrenza_unita ? UNITA[t.ricorrenza_unita].preavviso : 0
}

/** Da quando una ricorrente torna visibile (null = sempre visibile). */
export function visibileDa(t: Task): string | null {
  if (!ricorrente(t) || !t.scadenza) return null
  return aggiungiGiorniIso(t.scadenza, -preavviso(t))
}

// --- Stato dell'attività -------------------------------------------------------------------------------

export const fatta = (t: Pick<Task, "stato_tipo">) => t.stato_tipo === "fatto"
export const aperta = (t: Task) => !fatta(t) && !t.archiviata_at && !t.eliminata_at

export type Fascia = "scadute" | "oggi" | "settimana" | "prossime" | "senza" | "in_arrivo"

export const FASCE: Record<Fascia, { label: string; testo: string }> = {
  scadute: { label: "Scadute", testo: "text-red-600 dark:text-red-400" },
  oggi: { label: "Oggi", testo: "text-amber-600 dark:text-amber-400" },
  settimana: { label: "Prossimi 7 giorni", testo: "text-sky-600 dark:text-sky-400" },
  prossime: { label: "Più avanti", testo: "text-muted-foreground" },
  senza: { label: "Senza scadenza", testo: "text-muted-foreground" },
  in_arrivo: { label: "Ricorrenti in arrivo", testo: "text-muted-foreground" },
}
export const ORDINE_FASCE: Fascia[] = ["scadute", "oggi", "settimana", "prossime", "senza", "in_arrivo"]

/** Fascia di un'attività aperta; "in_arrivo" = ricorrente nascosta fino al preavviso. */
export function fascia(t: Task, oggi: string): Fascia {
  const da = visibileDa(t)
  if (da && da > oggi) return "in_arrivo"
  if (!t.scadenza) return "senza"
  const g = giorniTraIso(oggi, t.scadenza)
  if (g < 0) return "scadute"
  if (g === 0) return "oggi"
  if (g <= 7) return "settimana"
  return "prossime"
}

export const scaduta = (t: Task, oggi: string) => !!t.scadenza && t.scadenza < oggi && aperta(t) && fascia(t, oggi) !== "in_arrivo"

/** Progresso 0-1 da sottotask e checklist (null se non ce ne sono). */
export function progresso(t: Task): number | null {
  const tot = t.n_sottotask + t.n_checklist
  if (!tot) return null
  return (t.n_sottotask_fatte + t.n_checklist_fatte) / tot
}

/**
 * Sottotask in attesa: in una sequenza c'è un passo precedente non fatto, oppure una dipendenza aperta.
 * `tutte` = le attività caricate (per trovare fratelli e dipendenze).
 */
export function inAttesaDi(t: Task, perId: Map<string, Task>, fratelli: Task[]): Task | null {
  if (fatta(t)) return null
  if (t.padre_id) {
    const padre = perId.get(t.padre_id)
    if (padre?.in_sequenza) {
      const prima = fratelli
        .filter((s) => s.padre_id === t.padre_id && !s.eliminata_at && s.ordine < t.ordine && !fatta(s))
        .sort((a, b) => a.ordine - b.ordine)
      if (prima.length) return prima[prima.length - 1]
    }
  }
  for (const id of t.dipende_da) {
    const d = perId.get(id)
    if (d && !fatta(d) && !d.eliminata_at) return d
  }
  return null
}

export function ordinaPerPriorita(a: Task, b: Task) {
  return (
    (PRIORITA[a.priorita]?.ordine ?? 2) - (PRIORITA[b.priorita]?.ordine ?? 2) ||
    (a.scadenza ?? "9999").localeCompare(b.scadenza ?? "9999") ||
    a.titolo.localeCompare(b.titolo)
  )
}

export function ordinaPerScadenza(a: Task, b: Task) {
  return (
    (a.scadenza ?? "9999").localeCompare(b.scadenza ?? "9999") ||
    (PRIORITA[a.priorita]?.ordine ?? 2) - (PRIORITA[b.priorita]?.ordine ?? 2) ||
    a.titolo.localeCompare(b.titolo)
  )
}

export const ordinaPerPosizione = (a: Task, b: Task) => a.ordine - b.ordine || a.creato_at.localeCompare(b.creato_at)

/** Posizione tra due vicini (bacheca, sottotask). */
export function posizioneTra(prima: number | null, dopo: number | null): number {
  if (prima == null && dopo == null) return Date.now() / 1000
  if (prima == null) return (dopo as number) - 1
  if (dopo == null) return prima + 1
  return (prima + dopo) / 2
}

export function statoDiTipo(stati: Stato[], tipo: TipoStato): Stato | undefined {
  return stati.filter((s) => s.tipo === tipo).sort((a, b) => a.ordine - b.ordine)[0]
}

// --- Testo, persone ------------------------------------------------------------------------------------

export function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function iniziali(nome: string | null | undefined): string {
  if (!nome) return "?"
  const parti = nome.trim().split(/\s+/)
  return ((parti[0]?.[0] ?? "") + (parti[1]?.[0] ?? "")).toUpperCase() || "?"
}

export const primoNome = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] || "Qualcuno"

export const eAdmin = (p: Persona | undefined | null) => !!p?.ruoli.includes("Admin")
export const eManager = (p: Persona | undefined | null) => !!p?.ruoli.includes("Manager")

export function plurale(n: number, uno: string, molti: string) {
  return `${n} ${n === 1 ? uno : molti}`
}

export function durata(minuti: number | null): string | null {
  if (!minuti) return null
  if (minuti < 60) return `${minuti} min`
  const ore = Math.floor(minuti / 60)
  const resto = minuti % 60
  if (ore < 8 || resto) return resto ? `${ore} h ${resto} min` : `${ore} h`
  return `${(minuti / 480).toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`
}

export function dimensioneFile(byte: number | null): string {
  if (byte == null) return ""
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`
}

// --- Servizi esterni con logo (favicon pubblica del dominio) -------------------------------------------

export const SERVIZI: Record<string, { nome: string; dominio: string; parole: string[] }> = {
  amazon: { nome: "Amazon", dominio: "amazon.com", parole: ["amazon"] },
  etsy: { nome: "Etsy", dominio: "etsy.com", parole: ["etsy"] },
  temu: { nome: "Temu", dominio: "temu.com", parole: ["temu"] },
  ebay: { nome: "eBay", dominio: "ebay.com", parole: ["ebay"] },
  shopify: { nome: "Shopify", dominio: "shopify.com", parole: ["shopify"] },
  zonwizard: { nome: "ZonWizard", dominio: "zonwizard.com", parole: ["zonwizard"] },
  revolut: { nome: "Revolut", dominio: "revolut.com", parole: ["revolut"] },
  intesa: { nome: "Intesa Sanpaolo", dominio: "intesasanpaolo.com", parole: ["intesa"] },
  aruba: { nome: "Aruba", dominio: "aruba.it", parole: ["aruba"] },
  effatta: { nome: "Effatta", dominio: "effatta.it", parole: ["effatta", "sdi"] },
  avask: { nome: "Avask", dominio: "avaskgroup.com", parole: ["avask"] },
  jethr: { nome: "Jet HR", dominio: "jethr.com", parole: ["jethr", "jet hr", "cedolini", "paghe"] },
  agenzia: { nome: "Agenzia delle Entrate", dominio: "agenziaentrate.gov.it", parole: ["f24", "agenzia entrate"] },
  gmail: { nome: "Gmail", dominio: "mail.google.com", parole: ["gmail"] },
  drive: { nome: "Google Drive", dominio: "drive.google.com", parole: ["drive"] },
  sendcloud: { nome: "Sendcloud", dominio: "sendcloud.com", parole: ["sendcloud"] },
  fedex: { nome: "FedEx", dominio: "fedex.com", parole: ["fedex"] },
  bambu: { nome: "Bambu Lab", dominio: "bambulab.com", parole: ["bambu", "bambulab"] },
}

export function logoServizio(servizio: string | null | undefined) {
  const s = servizio ? SERVIZI[servizio] : null
  return s ? { nome: s.nome, url: `https://www.google.com/s2/favicons?domain_url=https://${s.dominio}&sz=128` } : null
}

export function servizioDaTesto(testo: string): string | null {
  const t = testo.toLowerCase()
  for (const [k, s] of Object.entries(SERVIZI)) if (s.parole.some((p) => t.includes(p))) return k
  return null
}
