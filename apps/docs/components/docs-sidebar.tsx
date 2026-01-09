"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { PAGES_NEW } from "@/lib/docs"
import { showMcpDocs } from "@/lib/flags"
import type { source } from "@/lib/source"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/registry/new-york-v4/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/registry/new-york-v4/ui/sidebar"

// Pages that link directly (not collapsible)
const DIRECT_PAGES = ["/", "/installation"]

export function DocsSidebar({
  tree,
  ...props
}: React.ComponentProps<typeof Sidebar> & { tree: typeof source.pageTree }) {
  const pathname = usePathname()

  // Helper to check if a section is active (current page is within it)
  const isSectionActive = (url: string) => {
    if (url === "/") return pathname === "/"
    return pathname.startsWith(url)
  }

  // Helper to render pages within a folder, handling separators
  const renderFolderContents = (children: typeof tree.children) => {
    let currentGroup: string | null = null
    const elements: React.ReactNode[] = []

    children.forEach((item, index) => {
      if (item.type === "separator") {
        currentGroup = item.name
        elements.push(
          <div
            key={`sep-${index}`}
            className="text-muted-foreground/60 mt-3 mb-1 px-2 text-[0.7rem] font-medium uppercase tracking-wider first:mt-0"
          >
            {item.name}
          </div>
        )
      } else if (item.type === "page") {
        if (!showMcpDocs && item.url?.includes("/mcp")) {
          return
        }
        elements.push(
          <SidebarMenuSubItem key={item.url}>
            <SidebarMenuSubButton
              asChild
              isActive={item.url === pathname}
              className="text-muted-foreground data-[active=true]:text-foreground data-[active=true]:bg-accent h-7 text-[0.8rem]"
            >
              <Link href={item.url}>
                <span>{item.name}</span>
                {PAGES_NEW.includes(item.url) && (
                  <span className="ml-auto flex size-1.5 rounded-full bg-blue-500" />
                )}
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )
      } else if (item.type === "folder") {
        // Nested folder - render recursively
        elements.push(
          <div key={item.$id} className="mt-2">
            <div className="text-muted-foreground/60 mb-1 px-2 text-[0.7rem] font-medium uppercase tracking-wider">
              {item.name}
            </div>
            <SidebarMenuSub className="ml-0 border-l-0 pl-2">
              {renderFolderContents(item.children)}
            </SidebarMenuSub>
          </div>
        )
      }
    })

    return elements
  }

  return (
    <Sidebar
      className="sticky top-[calc(var(--header-height)+1px)] z-30 hidden h-[calc(100svh-var(--footer-height)-4rem)] overscroll-none bg-transparent lg:flex"
      collapsible="none"
      {...props}
    >
      <SidebarContent className="no-scrollbar overflow-x-hidden px-2">
        <div className="from-background via-background/80 to-background/50 sticky -top-1 z-10 h-8 shrink-0 bg-gradient-to-b blur-xs" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Introduction - direct link */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  className="data-[active=true]:bg-accent data-[active=true]:text-foreground h-8 text-[0.85rem] font-medium"
                >
                  <Link href="/">Introduction</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Installation - direct link */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/installation"}
                  className="data-[active=true]:bg-accent data-[active=true]:text-foreground h-8 text-[0.85rem] font-medium"
                >
                  <Link href="/installation">Installation</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Collapsible sections from tree */}
              {tree.children.map((item) => {
                if (item.type !== "folder") return null
                if (DIRECT_PAGES.some(p => item.name.toLowerCase() === p.slice(1))) return null

                const sectionUrl = `/${item.name.toLowerCase()}`
                const isActive = isSectionActive(sectionUrl)
                const hasIndex = item.children.some(
                  child => child.type === "page" && child.url === sectionUrl
                )

                return (
                  <Collapsible
                    key={item.$id}
                    asChild
                    defaultOpen={isActive}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          className="data-[state=open]:text-foreground h-8 text-[0.85rem] font-medium"
                          tooltip={item.name}
                        >
                          <span>{item.name}</span>
                          <ChevronRight className="text-muted-foreground ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="mr-0 border-l border-border/40 pr-0">
                          {/* Link to index page if it exists */}
                          {hasIndex && (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === sectionUrl}
                                className="text-muted-foreground data-[active=true]:text-foreground data-[active=true]:bg-accent h-7 text-[0.8rem]"
                              >
                                <Link href={sectionUrl}>
                                  <span>Overview</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                          {renderFolderContents(
                            item.children.filter(
                              child => !(child.type === "page" && child.url === sectionUrl)
                            )
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="from-background via-background/80 to-background/50 sticky -bottom-1 z-10 h-16 shrink-0 bg-gradient-to-t blur-xs" />
      </SidebarContent>
    </Sidebar>
  )
}
