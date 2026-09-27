import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** shadcn/ui class helper (components.json `aliases.utils`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
