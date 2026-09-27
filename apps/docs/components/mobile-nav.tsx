"use client"

import type * as PageTree from "fumadocs-core/page-tree"

import * as React from "react"
import Link, { type LinkProps } from "next/link"
import { useRouter, usePathname } from "next/navigation"

import { sections } from "@/components/docs-sidebar"
import { cn } from "@/lib/utils"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from "@/registry/new-york-v4/ui/drawer"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

const SCROLL_POSITION_KEY = "agileflow-nav-scroll"

// Hook for persisting scroll position across navigation
function useScrollPersistence(open: boolean, contentRef: React.RefObject<HTMLDivElement | null>) {
  const pathname = usePathname()

  // Restore scroll position when drawer opens
  React.useEffect(() => {
    if (open && contentRef.current) {
      try {
        const saved = sessionStorage.getItem(SCROLL_POSITION_KEY)
        if (saved) {
          const positions = JSON.parse(saved) as Record<string, number>
          const position = positions[pathname] ?? 0
          contentRef.current.scrollTop = position
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, [open, pathname, contentRef])

  // Save scroll position on scroll
  const handleScroll = React.useCallback(() => {
    if (!contentRef.current) return
    try {
      const saved = sessionStorage.getItem(SCROLL_POSITION_KEY)
      const positions = saved ? JSON.parse(saved) : {}
      positions[pathname] = contentRef.current.scrollTop
      sessionStorage.setItem(SCROLL_POSITION_KEY, JSON.stringify(positions))
    } catch {
      // Ignore sessionStorage errors
    }
  }, [pathname, contentRef])

  return handleScroll
}

export function MobileNav({
  tree,
  className,
}: {
  tree: PageTree.Root
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const activeItemRef = React.useRef<HTMLAnchorElement>(null)
  const pathname = usePathname()
  const handleScroll = useScrollPersistence(open, contentRef)

  // Scroll to center the active item when drawer opens
  React.useEffect(() => {
    if (open && activeItemRef.current) {
      // Small delay to allow drawer animation and collapsibles to expand
      const timer = setTimeout(() => {
        activeItemRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "extend-touch-target size-8 touch-manipulation hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent dark:hover:bg-transparent",
            className
          )}
          aria-label="Open navigation menu"
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
      </DrawerTrigger>
      <DrawerContent
        className="max-h-[85vh] focus:outline-none"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DrawerTitle>Navigation Menu</DrawerTitle>
        </VisuallyHidden>
        <nav
          ref={contentRef}
          onScroll={handleScroll}
          className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-4"
          aria-label="Main navigation"
          role="navigation"
        >
          {/* External links */}
          <div className="flex flex-col gap-2">
            <a
              href="https://agileflow.projectquestorg.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              Website
            </a>
            <a
              href="https://github.com/projectquestorg/AgileFlow"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/agileflow"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              npm
            </a>
          </div>

          <div className="border-t border-border/40" />

          {/* Navigation: same sections as the desktop sidebar */}
          {sections(tree.children).map((section, i) => (
            <div key={section.label ?? i} className="flex flex-col gap-1">
              {section.label && (
                <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                  {section.label}
                </div>
              )}
              {section.pages.map((page) => (
                <MobileLink
                  key={page.url}
                  ref={pathname === page.url ? activeItemRef : undefined}
                  href={page.url}
                  onOpenChange={setOpen}
                  isActive={pathname === page.url}
                  className="py-1 text-lg"
                >
                  {page.name}
                </MobileLink>
              ))}
            </div>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  )
}

const MobileLink = React.forwardRef<
  HTMLAnchorElement,
  LinkProps & {
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
    className?: string
    isActive?: boolean
  }
>(function MobileLink(
  { href, onOpenChange, className, children, isActive, ...props },
  ref
) {
  const router = useRouter()
  return (
    <Link
      ref={ref}
      href={href}
      onClick={() => {
        router.push(href.toString())
        onOpenChange?.(false)
      }}
      className={cn(
        "text-muted-foreground text-2xl font-medium",
        isActive && "text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  )
})
