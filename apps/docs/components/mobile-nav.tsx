"use client"

import * as React from "react"
import Link, { type LinkProps } from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { PAGES_NEW } from "@/lib/docs"
import { showMcpDocs } from "@/lib/flags"
import { type source } from "@/lib/source"
import { cn } from "@/lib/utils"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/registry/new-york-v4/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/registry/new-york-v4/ui/popover"

export function MobileNav({
  tree,
  className,
}: {
  tree: typeof source.pageTree
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  // Helper to render pages within a folder, handling separators
  const renderFolderContents = (
    children: typeof tree.children,
    onNavigate: () => void
  ) => {
    const elements: React.ReactNode[] = []

    children.forEach((item, index) => {
      if (item.type === "separator") {
        elements.push(
          <div
            key={`sep-${index}`}
            className="text-muted-foreground mt-4 mb-2 text-xs font-medium uppercase tracking-wider first:mt-0"
          >
            {item.name}
          </div>
        )
      } else if (item.type === "page") {
        if (!showMcpDocs && item.url?.includes("/mcp")) {
          return
        }
        elements.push(
          <MobileLink
            key={item.url}
            href={item.url}
            onOpenChange={onNavigate}
            className="flex items-center gap-2 py-1 text-lg"
          >
            {item.name}
            {PAGES_NEW.includes(item.url) && (
              <span className="flex size-2 rounded-full bg-blue-500" />
            )}
          </MobileLink>
        )
      } else if (item.type === "folder") {
        // Nested folder
        elements.push(
          <div key={item.$id} className="mt-3">
            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
              {item.name}
            </div>
            <div className="flex flex-col gap-1 pl-3 border-l border-border/40">
              {renderFolderContents(item.children, onNavigate)}
            </div>
          </div>
        )
      }
    })

    return elements
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "extend-touch-target size-8 touch-manipulation hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent dark:hover:bg-transparent",
            className
          )}
        >
          <div className="relative size-5">
            <span
              className={cn(
                "bg-foreground absolute left-0 block h-0.5 w-5 transition-all duration-100",
                open ? "top-[0.5rem] -rotate-45" : "top-1"
              )}
            />
            <span
              className={cn(
                "bg-foreground absolute left-0 block h-0.5 w-5 transition-all duration-100",
                open ? "top-[0.5rem] rotate-45" : "top-3"
              )}
            />
          </div>
          <span className="sr-only">Toggle Menu</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-background/90 no-scrollbar h-(--radix-popper-available-height) w-(--radix-popper-available-width) overflow-y-auto rounded-none border-none p-0 shadow-none backdrop-blur duration-100"
        align="end"
        side="bottom"
        alignOffset={16}
        sideOffset={14}
      >
        <div className="flex flex-col gap-4 overflow-auto px-6 py-6">
          {/* Navigation */}
          <div className="flex flex-col gap-1">
            {/* Direct links */}
            <MobileLink
              href="/"
              onOpenChange={setOpen}
              className="text-xl font-medium"
            >
              Introduction
            </MobileLink>
            <MobileLink
              href="/installation"
              onOpenChange={setOpen}
              className="text-xl font-medium"
            >
              Installation
            </MobileLink>

            {/* Collapsible sections */}
            {tree?.children?.map((group) => {
              if (group.type !== "folder") return null
              if (group.name.toLowerCase() === "installation") return null

              const sectionUrl = `/${group.name.toLowerCase()}`
              const hasIndex = group.children.some(
                (child) => child.type === "page" && child.url === sectionUrl
              )

              return (
                <Collapsible
                  key={group.$id}
                  className="group/collapsible"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xl font-medium">
                    <span>{group.name}</span>
                    <ChevronRight className="text-muted-foreground size-5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-1 py-2 pl-4 border-l border-border/40">
                      {hasIndex && (
                        <MobileLink
                          href={sectionUrl}
                          onOpenChange={setOpen}
                          className="py-1 text-lg"
                        >
                          Overview
                        </MobileLink>
                      )}
                      {renderFolderContents(
                        group.children.filter(
                          (child) =>
                            !(child.type === "page" && child.url === sectionUrl)
                        ),
                        () => setOpen(false)
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MobileLink({
  href,
  onOpenChange,
  className,
  children,
  ...props
}: LinkProps & {
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  return (
    <Link
      href={href}
      onClick={() => {
        router.push(href.toString())
        onOpenChange?.(false)
      }}
      className={cn("text-2xl font-medium", className)}
      {...props}
    >
      {children}
    </Link>
  )
}
