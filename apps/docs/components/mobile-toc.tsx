"use client"

import * as React from "react"
import { List } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from "@/registry/new-york-v4/ui/drawer"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

interface TocItem {
  title?: React.ReactNode
  url: string
  depth: number
}

function useActiveItem(itemIds: string[]) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "0% 0% -80% 0%" }
    )

    for (const id of itemIds ?? []) {
      const element = document.getElementById(id)
      if (element) {
        observer.observe(element)
      }
    }

    return () => {
      for (const id of itemIds ?? []) {
        const element = document.getElementById(id)
        if (element) {
          observer.unobserve(element)
        }
      }
    }
  }, [itemIds])

  return activeId
}

export function MobileTocButton({
  toc,
  className,
}: {
  toc: TocItem[]
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const itemIds = React.useMemo(
    () => toc.map((item) => item.url.replace("#", "")),
    [toc]
  )
  const activeHeading = useActiveItem(itemIds)

  if (!toc?.length) {
    return null
  }

  const handleItemClick = (url: string) => {
    setOpen(false)
    // Small delay to ensure drawer closes before scroll
    setTimeout(() => {
      const id = url.replace("#", "")
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 100)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "fixed bottom-20 right-4 z-40 size-12 rounded-full shadow-lg xl:hidden",
            "touch-manipulation",
            "transition-transform active:scale-95",
            className
          )}
          aria-label="Open table of contents"
        >
          <List className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className="max-h-[70vh] focus:outline-none"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DrawerTitle>On This Page</DrawerTitle>
        </VisuallyHidden>
        <nav
          className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-6 py-4"
          aria-label="Table of contents"
          role="navigation"
        >
          <p className="text-muted-foreground mb-2 text-sm font-medium">
            On This Page
          </p>
          {toc.map((item) => (
            <button
              key={item.url}
              onClick={() => handleItemClick(item.url)}
              className={cn(
                "text-muted-foreground hover:text-foreground text-left text-sm no-underline transition-colors",
                "py-1.5 touch-manipulation",
                item.url === `#${activeHeading}` && "text-foreground font-medium",
                item.depth === 3 && "pl-4",
                item.depth === 4 && "pl-6"
              )}
              aria-current={item.url === `#${activeHeading}` ? "location" : undefined}
            >
              {item.title}
            </button>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  )
}
