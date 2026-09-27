import type * as PageTree from "fumadocs-core/page-tree"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { siteConfig } from "@/lib/config"
import { source } from "@/lib/source"
import { LanguageSwitcher } from "@/components/language-switcher"
import { LANGUAGES } from "@/lib/languages"
import { MainNav } from "@/components/main-nav"
import { MobileNav } from "@/components/mobile-nav"
import { Button } from "@/registry/new-york-v4/ui/button"

interface SiteHeaderProps {
  tree?: PageTree.Root
}

export function SiteHeader({ tree }: SiteHeaderProps) {
  const pageTree = tree || source.getPageTree()

  return (
    <header className="bg-background sticky top-0 z-50 w-full border-b border-border/40">
      <div className="container-wrapper 3xl:fixed:px-0 px-4">
        <div className="3xl:fixed:container flex h-14 items-center justify-between">
          {/* Logo - theme aware */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/agileflow-lockup-dark.png"
              alt={siteConfig.name}
              width={432}
              height={112}
              className="h-7 w-auto"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <MainNav items={siteConfig.navItems} className="hidden lg:flex" />

          {/* Right side */}
          <div className="flex items-center gap-2">
            {LANGUAGES.length > 1 && <LanguageSwitcher />}
            <Button asChild size="sm" variant="outline" className="hidden h-8 rounded-lg sm:flex">
              <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </Button>
            <Button asChild size="sm" className="hidden h-8 rounded-lg sm:flex">
              <Link href="/quick-start">
                Get started
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
