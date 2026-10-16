"use client"

import * as D from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "./cn"

/** Finestra centrata (su mobile occupa quasi tutto lo schermo). */
export function Dialogo({
  aperto,
  onChiudi,
  titolo,
  descrizione,
  children,
  piede,
  className,
}: {
  aperto: boolean
  onChiudi: () => void
  titolo: ReactNode
  descrizione?: ReactNode
  children: ReactNode
  piede?: ReactNode
  className?: string
}) {
  return (
    <D.Root open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold leading-tight">{titolo}</D.Title>
              {descrizione ? (
                <D.Description className="mt-1 text-sm text-muted-foreground">{descrizione}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof titolo === "string" ? titolo : "Finestra"}</D.Description>
              )}
            </div>
            <D.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Chiudi">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {piede ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{piede}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/** Pannello laterale a destra (dettaglio attività); su mobile a schermo intero. */
export function Pannello({
  aperto,
  onChiudi,
  titolo,
  children,
  className,
}: {
  aperto: boolean
  onChiudi: () => void
  titolo: string
  children: ReactNode
  className?: string
}) {
  return (
    <D.Root open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full flex-col border-l border-border bg-background shadow-2xl focus:outline-none sm:w-[min(calc(100vw-3rem),76rem)]",
            className,
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <D.Title className="sr-only">{titolo}</D.Title>
          <D.Description className="sr-only">Dettaglio dell&apos;attività</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export const ChiudiPannello = D.Close
