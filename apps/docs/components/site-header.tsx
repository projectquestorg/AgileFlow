import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { siteConfig } from "@/lib/config"
import { source } from "@/lib/source"
import { MainNav } from "@/components/main-nav"
import { MobileNav } from "@/components/mobile-nav"
import { ModeSwitcher } from "@/components/mode-switcher"
import { Button } from "@/registry/new-york-v4/ui/button"

export function SiteHeader() {
  const pageTree = source.pageTree

  return (
    <header className="bg-background sticky top-0 z-50 w-full border-b border-border/40">
      <div className="container-wrapper 3xl:fixed:px-0 px-4">
        <div className="3xl:fixed:container flex h-14 items-center justify-between">
          {/* Logo - always visible */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/banner.png"
              alt={siteConfig.name}
              width={120}
              height={32}
              className="h-5 w-auto"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <MainNav items={siteConfig.navItems} className="hidden lg:flex" />

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ModeSwitcher />
            <Button
              asChild
              size="sm"
              className="hidden h-8 rounded-lg sm:flex"
            >
              <Link href="/installation">
                Get Started
                <ArrowRightIcon className="ml-1 size-3" />
              </Link>
            </Button>
            {/* Mobile menu - hamburger only, on the right */}
            <MobileNav
              tree={pageTree}
              className="flex lg:hidden"
            />
          </div>
        </div>
      </div>
    </header>
  )
}
