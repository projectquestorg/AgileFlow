"use client"

import Image from "next/image"
import Link from "next/link"
import { siteConfig } from "@/lib/config"

const footerLinks = {
  product: {
    title: "Product",
    links: [
      { label: "Quick start", href: "/quick-start" },
      { label: "Commands", href: "/commands/init" },
      { label: "Official skills", href: "/reference/official-skills" },
      { label: "Legacy v4 docs", href: "https://github.com/projectquestorg/AgileFlow/tree/v4", external: true },
    ],
  },
  resources: {
    title: "Resources",
    links: [
      { label: "GitHub", href: siteConfig.links.github, external: true },
      { label: "npm", href: "https://www.npmjs.com/package/agileflow", external: true },
      { label: "Releases", href: `${siteConfig.links.github}/releases`, external: true },
    ],
  },
  community: {
    title: "Community",
    links: [
      { label: "Twitter", href: siteConfig.links.twitter, external: true },
      { label: "Discussions", href: `${siteConfig.links.github}/discussions`, external: true },
      { label: "Issues", href: `${siteConfig.links.github}/issues`, external: true },
    ],
  },
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 py-12">
      <div className="container-wrapper px-4 xl:px-6">
        <div className="grid gap-8 md:grid-cols-12">
          {/* Logo and description */}
          <div className="md:col-span-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/banner.png"
                alt="AgileFlow"
                width={120}
                height={28}
                className="h-7 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-[44ch] text-sm leading-6 text-muted-foreground">
              Open-source agile scaffolding for AI-driven development. Everything versioned. Nothing hidden.
            </p>
          </div>

          {/* Links */}
          <div className="grid gap-8 sm:grid-cols-3 md:col-span-8">
            {Object.values(footerLinks).map((section) => (
              <div key={section.title} className="grid gap-3">
                <div className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
                  {section.title}
                </div>
                <div className="grid gap-2">
                  {section.links.map((link) =>
                    link.external ? (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-2 border-t border-border/50 pt-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            Built by{" "}
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="font-medium hover:text-foreground transition-colors"
            >
              the AgileFlow team
            </a>
            . Open source on{" "}
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="font-medium hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            .
          </div>
          <div className="font-mono text-[#e8683a]">agileflow</div>
        </div>
      </div>
    </footer>
  )
}
