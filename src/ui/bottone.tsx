"use client"

import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "./cn"

type Variante = "primario" | "secondario" | "contorno" | "fantasma" | "distruttivo" | "link"
type Misura = "sm" | "md" | "icona" | "icona-sm"

const VARIANTI: Record<Variante, string> = {
  primario: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondario: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  contorno: "border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  fantasma: "hover:bg-accent hover:text-accent-foreground",
  distruttivo: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  link: "text-primary underline-offset-4 hover:underline",
}

const MISURE: Record<Misura, string> = {
  sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-9 gap-2 rounded-md px-3.5 text-sm",
  icona: "h-9 w-9 rounded-md",
  "icona-sm": "h-7 w-7 rounded-md",
}

export type PropsBottone = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; misura?: Misura }

export const Bottone = forwardRef<HTMLButtonElement, PropsBottone>(function Bottone(
  { variante = "primario", misura = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTI[variante],
        MISURE[misura],
        className,
      )}
      {...props}
    />
  )
})
