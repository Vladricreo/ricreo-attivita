"use client"

import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react"
import { cn } from "./cn"

export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Campo({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
})

/** Textarea che cresce col testo (fino a `righeMax`). */
export const AreaTesto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { righeMax?: number }>(
  function AreaTesto({ className, righeMax = 12, value, ...props }, ref) {
    const interno = useRef<HTMLTextAreaElement | null>(null)
    useLayoutEffect(() => {
      const el = interno.current
      if (!el) return
      el.style.height = "auto"
      const riga = parseFloat(getComputedStyle(el).lineHeight) || 20
      el.style.height = `${Math.min(el.scrollHeight + 2, riga * righeMax + 18)}px`
    }, [value, righeMax])
    return (
      <textarea
        ref={(el) => {
          interno.current = el
          if (typeof ref === "function") ref(el)
          else if (ref) ref.current = el
        }}
        value={value}
        rows={1}
        className={cn(
          "flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    )
  },
)

export function Etichetta({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </label>
  )
}

/** Interruttore semplice (senza dipendenze). */
export function Interruttore({
  attivo,
  onCambia,
  disabilitato,
  id,
  etichetta,
}: {
  attivo: boolean
  onCambia: (v: boolean) => void
  disabilitato?: boolean
  id?: string
  etichetta?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={attivo}
      aria-label={etichetta}
      disabled={disabilitato}
      onClick={() => onCambia(!attivo)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        attivo ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("block h-4 w-4 rounded-full bg-background shadow transition-transform", attivo ? "translate-x-4" : "translate-x-0")} />
    </button>
  )
}
