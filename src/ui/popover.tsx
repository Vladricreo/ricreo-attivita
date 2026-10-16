"use client"

import * as P from "@radix-ui/react-popover"
import type { ReactNode } from "react"
import { cn } from "./cn"

export function Popover({
  trigger,
  children,
  aperto,
  onCambia,
  allinea = "start",
  lato = "bottom",
  className,
  modale = false,
}: {
  trigger: ReactNode
  children: ReactNode
  aperto?: boolean
  onCambia?: (v: boolean) => void
  allinea?: "start" | "center" | "end"
  lato?: "top" | "bottom" | "left" | "right"
  className?: string
  modale?: boolean
}) {
  return (
    <P.Root open={aperto} onOpenChange={onCambia} modal={modale}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={allinea}
          side={lato}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

export const ChiudiPopover = P.Close
