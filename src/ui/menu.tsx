"use client"

import * as M from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "./cn"

export function Menu({
  trigger,
  children,
  allinea = "end",
  className,
}: {
  trigger: ReactNode
  children: ReactNode
  allinea?: "start" | "center" | "end"
  className?: string
}) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={allinea}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[11rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

const VOCE =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"

export function MenuVoce({
  children,
  onSeleziona,
  distruttiva,
  disabilitata,
  className,
}: {
  children: ReactNode
  onSeleziona?: () => void
  distruttiva?: boolean
  disabilitata?: boolean
  className?: string
}) {
  return (
    <M.Item
      disabled={disabilitata}
      onSelect={() => onSeleziona?.()}
      className={cn(VOCE, distruttiva && "text-destructive focus:bg-destructive/10 focus:text-destructive", className)}
    >
      {children}
    </M.Item>
  )
}

export function MenuSpunta({ children, attiva, onCambia }: { children: ReactNode; attiva: boolean; onCambia: (v: boolean) => void }) {
  return (
    <M.CheckboxItem checked={attiva} onCheckedChange={(v) => onCambia(!!v)} onSelect={(e) => e.preventDefault()} className={cn(VOCE, "pl-8")}>
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <M.ItemIndicator>
          <Check className="h-4 w-4" />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  )
}

export function MenuEtichetta({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{children}</M.Label>
}

export function MenuSeparatore() {
  return <M.Separator className="-mx-1 my-1 h-px bg-border" />
}

export function SottoMenu({ etichetta, children }: { etichetta: ReactNode; children: ReactNode }) {
  return (
    <M.Sub>
      <M.SubTrigger className={cn(VOCE, "data-[state=open]:bg-accent")}>
        {etichetta}
        <ChevronRight className="ml-auto h-4 w-4" />
      </M.SubTrigger>
      <M.Portal>
        <M.SubContent
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[10rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {children}
        </M.SubContent>
      </M.Portal>
    </M.Sub>
  )
}
