import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...classi: ClassValue[]) {
  return twMerge(clsx(classi))
}
