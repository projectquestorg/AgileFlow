"use client"

import * as React from "react"
import { ArrowLeftRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDirection } from "@/components/direction-provider"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/registry/new-york-v4/ui/tooltip"

export function LanguageSwitcher({ className }: { className?: string }) {
  const { direction, setDirection, isRTL } = useDirection()

  const toggleDirection = () => {
    setDirection(isRTL ? "ltr" : "rtl")
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDirection}
          className={cn(
            "size-8 text-muted-foreground hover:text-foreground",
            className
          )}
          aria-label={`Switch to ${isRTL ? "LTR" : "RTL"} direction`}
        >
          <ArrowLeftRight className="size-4" />
          <span className="sr-only">
            {isRTL ? "Switch to LTR" : "Switch to RTL"}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">
          {isRTL ? "Switch to LTR" : "Switch to RTL"} ({direction.toUpperCase()})
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
