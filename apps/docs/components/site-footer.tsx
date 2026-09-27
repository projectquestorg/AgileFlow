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
      { label: "Website", href: "https://agileflow.projectquestorg.com", external: true },
      { label: "GitHub", href: siteConfig.links.github, external: true },
      { label: "npm", href: "https://www.npmjs.com/package/agileflow", external: true },
      { label: "Releases", href: `${siteConfig.links.github}/releases`, external: true },
    ],
  },
  community: {
    title: "Community",
    links: [
      { label: "Discussions", href: `${siteConfig.links.github}/discussions`, external: true },
      { label: "Issues", href: `${siteConfig.links.github}/issues`, external: true },
    ],
  },
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,255,255,0.05),transparent_75%)] py-12">
      <div className="container-wrapper px-4 xl:px-6">
        <div className="grid gap-8 md:grid-cols-12">
          {/* Logo and description */}
          <div className="md:col-span-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/brand/agileflow-lockup-dark.png"
                alt="AgileFlow"
                width={432}
                height={112}
                className="h-7 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-[44ch] text-sm leading-6 text-muted-foreground">
              Portable workflows for coding agents. Small, versioned skills. No agent runtime.
            </p>
          </div>

          {/* Links */}
          <div className="grid gap-8 sm:grid-cols-3 md:col-span-8">
            {Object.values(footerLinks).map((section) => (
              <div key={section.title} className="grid content-start gap-3">
                <div className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
                  {section.title}
                </div>
                <div className="grid content-start gap-2">
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
        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>&copy; {new Date().getFullYear()} AgileFlow. MIT License.</div>
          <div className="font-mono text-primary">agileflow</div>
        </div>
      </div>
    </footer>
  )
}
