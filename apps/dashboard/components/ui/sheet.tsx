"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SheetContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error("Sheet components must be used within a Sheet")
  }
  return context
}

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(open)
  const isControlled = onOpenChange !== undefined
  const isOpen = isControlled ? open : internalOpen

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }, [isControlled, onOpenChange])

  return (
    <SheetContext.Provider value={{ open: isOpen, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  )
}

interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

function SheetTrigger({ children, asChild, ...props }: SheetTriggerProps) {
  const { onOpenChange } = useSheetContext()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(true),
    })
  }

  return (
    <button onClick={() => onOpenChange(true)} {...props}>
      {children}
    </button>
  )
}

function SheetClose({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useSheetContext()

  return (
    <button onClick={() => onOpenChange(false)} className={className} {...props}>
      {children}
    </button>
  )
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const { open, onOpenChange } = useSheetContext()

  if (!open) return null

  const sideClasses = {
    top: "inset-x-0 top-0 border-b animate-in slide-in-from-top",
    right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm animate-in slide-in-from-right",
    bottom: "inset-x-0 bottom-0 border-t animate-in slide-in-from-bottom",
    left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm animate-in slide-in-from-left",
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />
      {/* Content */}
      <div
        className={cn(
          "fixed z-50 flex flex-col bg-background p-0 shadow-lg",
          sideClasses[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 p-1.5 hover:bg-muted rounded-md"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("gap-0.5 p-4 flex flex-col", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("gap-2 p-4 mt-auto flex flex-col", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-foreground text-sm font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
