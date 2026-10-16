// Modulo attività condiviso tra le app Ricreo. Vedi README.md per come montarlo in un'app.

export { AttivitaProvider, useAttivita, useRichiedi, type Azioni } from "./contesto"
export { PaginaAttivita } from "./pagina-attivita"
export { PannelloTask } from "./dettaglio/pannello"
export { NuovaAttivita, NuovaAttivitaGlobale, apriNuovaAttivita, ATTIVITA_CREATA } from "./componenti/nuova-attivita"
export { CampanellaAttivita, RigaNotifica, useNotificheApp } from "./componenti/notifiche"
export { DialogoSollecito, PopupSolleciti, useSollecitabili } from "./componenti/solleciti"
export { AvatarPersona, GruppoAvatar } from "./componenti/persone"
export { BadgeCategoria } from "./componenti/aspetto"
export { creaApi, messaggioErrore, type Api } from "./dati/api"
export { testoNotifica } from "./testi"
export * from "./regole"
export type * from "./tipi"
