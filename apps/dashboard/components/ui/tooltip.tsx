"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

function useTooltipContext() {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip components must be used within a Tooltip")
  }
  return context
}

interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
}

function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>
}

interface TooltipProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function Tooltip({ children, open: controlledOpen, onOpenChange }: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const setOpen = React.useCallback((value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value)
    } else {
      setUncontrolledOpen(value)
    }
  }, [isControlled, onOpenChange])

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

function TooltipTrigger({ children, asChild, ...props }: TooltipTriggerProps) {
  const { setOpen } = useTooltipContext()

  const handleMouseEnter = () => setOpen(true)
  const handleMouseLeave = () => setOpen(false)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{
      onMouseEnter?: () => void
      onMouseLeave?: () => void
    }>, {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    })
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </div>
  )
}

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  sideOffset?: number
  hidden?: boolean
}

function TooltipContent({
  className,
  children,
  side = "top",
  sideOffset = 4,
  hidden = false,
  ...props
}: TooltipContentProps) {
  const { open } = useTooltipContext()

  if (!open || hidden) return null

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1",
    right: "left-full top-1/2 -translate-y-1/2 ml-1",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1",
    left: "right-full top-1/2 -translate-y-1/2 mr-1",
  }

  return (
    <div
      role="tooltip"
      className={cn(
        "absolute z-50 px-3 py-1.5 text-xs bg-foreground text-background rounded-none animate-in fade-in-0 zoom-in-95",
        sideClasses[side],
        className
      )}
      style={{ marginTop: side === "bottom" ? sideOffset : undefined, marginBottom: side === "top" ? sideOffset : undefined }}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
