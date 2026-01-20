"use client"

import * as React from "react"

type Direction = "ltr" | "rtl"

interface DirectionContextValue {
  direction: Direction
  setDirection: (dir: Direction) => void
  isRTL: boolean
}

const DirectionContext = React.createContext<DirectionContextValue | undefined>(undefined)

const STORAGE_KEY = "agileflow-direction"

// RTL languages
const RTL_LOCALES = ["ar", "he", "fa", "ur"]

function getInitialDirection(): Direction {
  if (typeof window === "undefined") return "ltr"

  // Check localStorage first
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "rtl" || stored === "ltr") return stored

  // Check browser language
  const browserLang = navigator.language.split("-")[0]
  if (RTL_LOCALES.includes(browserLang)) return "rtl"

  return "ltr"
}

export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const [direction, setDirectionState] = React.useState<Direction>("ltr")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setDirectionState(getInitialDirection())
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!mounted) return
    document.documentElement.dir = direction
    localStorage.setItem(STORAGE_KEY, direction)
  }, [direction, mounted])

  const setDirection = React.useCallback((dir: Direction) => {
    setDirectionState(dir)
  }, [])

  const value = React.useMemo(
    () => ({
      direction,
      setDirection,
      isRTL: direction === "rtl",
    }),
    [direction, setDirection]
  )

  return (
    <DirectionContext.Provider value={value}>
      {children}
    </DirectionContext.Provider>
  )
}

export function useDirection() {
  const context = React.useContext(DirectionContext)
  if (context === undefined) {
    throw new Error("useDirection must be used within a DirectionProvider")
  }
  return context
}
