"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Languages, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { LANGUAGES } from "@/lib/languages"
import { useDirection } from "@/components/direction-provider"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/registry/new-york-v4/ui/tooltip"

export function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { setDirection } = useDirection()

  // Detect current language from URL
  const getCurrentLang = () => {
    const pathParts = pathname.split("/").filter(Boolean)
    const firstPart = pathParts[0]
    const lang = LANGUAGES.find((l) => l.code === firstPart)
    return lang ? lang.code : "en"
  }

  const currentLang = getCurrentLang()
  const currentLangData = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0]

  // Build URL for a different language
  const getLanguageUrl = (langCode: string) => {
    const pathParts = pathname.split("/").filter(Boolean)
    const currentLangInPath = LANGUAGES.find((l) => l.code === pathParts[0])

    // Remove current language prefix if it exists
    const pathWithoutLang = currentLangInPath
      ? "/" + pathParts.slice(1).join("/")
      : pathname

    // Add new language prefix (skip for English as default)
    if (langCode === "en") {
      return pathWithoutLang || "/"
    }
    return `/${langCode}${pathWithoutLang}`
  }

  // Handle language change with direction update
  const handleLanguageChange = (lang: typeof LANGUAGES[number]) => {
    // Set text direction based on language
    setDirection(lang.dir as "ltr" | "rtl")
    // Navigate to the translated page
    router.push(getLanguageUrl(lang.code))
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("group/toggle extend-touch-target size-8", className)}
            >
              <Languages className="size-4.5" />
              <span className="sr-only">Switch language</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Language</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang)}
            className={cn(
              "flex cursor-pointer items-center justify-between",
              currentLang === lang.code && "bg-accent"
            )}
          >
            <span className="flex items-center gap-2">
              <span>{lang.nativeName}</span>
              <span className="text-muted-foreground text-xs">({lang.name})</span>
            </span>
            {currentLang === lang.code && (
              <Check className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
