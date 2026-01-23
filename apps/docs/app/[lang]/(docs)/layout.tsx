import { source } from "@/lib/source"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { DocsSidebar } from "@/components/docs-sidebar"
import { StickyBanner } from "@/components/sticky-banner"
import { SidebarProvider } from "@/registry/new-york-v4/ui/sidebar"

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const tree = source.pageTree[lang] || source.pageTree

  return (
    <div
      data-slot="layout"
      className="bg-background relative z-10 flex min-h-svh flex-col"
    >
      <StickyBanner>
        If you like AgileFlow, give it a star on{" "}
        <a
          href="https://github.com/projectquestorg/AgileFlow"
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-4 hover:no-underline"
        >
          GitHub
        </a>
      </StickyBanner>
      <SiteHeader tree={tree} />
      <main className="flex flex-1 flex-col">
        <div className="container-wrapper flex flex-1 flex-col px-2">
          <SidebarProvider className="3xl:fixed:container 3xl:fixed:px-3 min-h-min flex-1 items-start px-0 [--sidebar-width:220px] [--top-spacing:0] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:[--sidebar-width:240px] lg:[--top-spacing:calc(var(--spacing)*4)]">
            <DocsSidebar tree={tree} />
            <div className="h-full w-full">{children}</div>
          </SidebarProvider>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
