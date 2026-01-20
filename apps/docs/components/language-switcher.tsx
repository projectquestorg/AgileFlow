"use client"

import * as React from "react"
import { Languages } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDirection } from "@/components/direction-provider"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"

interface Language {
  code: string
  name: string
  nativeName: string
  direction: "ltr" | "rtl"
}

const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", direction: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl" },
  { code: "he", name: "Hebrew", nativeName: "עברית", direction: "rtl" },
  { code: "fa", name: "Persian", nativeName: "فارسی", direction: "rtl" },
]

export function LanguageSwitcher({ className }: { className?: string }) {
  const { direction, setDirection, isRTL } = useDirection()
  const [currentLang, setCurrentLang] = React.useState<Language>(LANGUAGES[0])

  // Find current language based on direction
  React.useEffect(() => {
    const lang = LANGUAGES.find((l) => l.direction === direction)
    if (lang) setCurrentLang(lang)
  }, [direction])

  const handleLanguageChange = (lang: Language) => {
    setCurrentLang(lang)
    setDirection(lang.direction)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", className)}
          aria-label="Switch language direction"
        >
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? "start" : "end"}>
        <DropdownMenuLabel>Language / Direction</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang)}
            className={cn(
              "flex items-center justify-between gap-4",
              currentLang.code === lang.code && "bg-accent"
            )}
          >
            <span className="flex items-center gap-2">
              <span>{lang.name}</span>
              <span className="text-muted-foreground text-xs">({lang.nativeName})</span>
            </span>
            <span className="text-muted-foreground text-xs uppercase">{lang.direction}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
