"use client"

import * as T from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"

export function ProviderSuggerimenti({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={300}>{children}</T.Provider>
}

/** Tooltip; senza testo restituisce solo il figlio. */
export function Suggerimento({
  testo,
  children,
  lato = "top",
}: {
  testo: ReactNode
  children: ReactNode
  lato?: "top" | "bottom" | "left" | "right"
}) {
  if (!testo) return <>{children}</>
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={lato} sideOffset={6} collisionPadding={8} className="z-[60] max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md">
          {testo}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
