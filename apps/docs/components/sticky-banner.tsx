"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface StickyBannerProps {
  className?: string
  children: React.ReactNode
  storageKey?: string
}

export function StickyBanner({
  className,
  children,
  storageKey = "agileflow-banner-dismissed"
}: StickyBannerProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if banner was dismissed
    const dismissed = localStorage.getItem(storageKey)
    if (!dismissed) {
      setIsVisible(true)
    }
  }, [storageKey])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem(storageKey, "true")
  }

  if (!isVisible) return null

  return (
    <div
      className={cn(
        "relative z-50 flex items-center justify-center gap-4 bg-primary px-4 py-2.5 text-center text-sm text-primary-foreground",
        className
      )}
    >
      <div className="flex-1">{children}</div>
      <button
        onClick={handleDismiss}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
