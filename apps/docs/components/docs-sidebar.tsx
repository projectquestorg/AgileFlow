"use client"
import type * as PageTree from "fumadocs-core/page-tree"
import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/registry/new-york-v4/ui/sidebar"

type Node = PageTree.Node

/** Group the tree into sections: each separator starts a new labeled group. */
export function sections(nodes: Node[]): Array<{ label: string | null; pages: PageTree.Item[] }> {
  const out: Array<{ label: string | null; pages: PageTree.Item[] }> = [{ label: null, pages: [] }]
  const add = (node: Node) => {
    if (node.type === "separator") out.push({ label: String(node.name ?? ""), pages: [] })
    else if (node.type === "page") out[out.length - 1]!.pages.push(node)
    else if (node.type === "folder") {
      out.push({ label: String(node.name ?? ""), pages: [] })
      if (node.index) out[out.length - 1]!.pages.push(node.index)
      node.children.forEach(add)
    }
  }
  nodes.forEach(add)
  return out.filter((s) => s.pages.length)
}

/** Docs navigation, rendered straight from content/docs/meta.json. */
export function DocsSidebar({
  tree,
  ...props
}: React.ComponentProps<typeof Sidebar> & { tree: PageTree.Root }) {
  const pathname = usePathname()
  const groups = React.useMemo(() => sections(tree.children), [tree])

  return (
    <Sidebar
      className="sticky top-[calc(var(--header-height)+1px)] z-30 hidden h-[calc(100svh-var(--footer-height)-4rem)] overscroll-none bg-transparent lg:flex"
      collapsible="none"
      {...props}
    >
      <SidebarContent className="no-scrollbar overflow-x-hidden px-2 pb-12">
        {groups.map((group, i) => (
          <SidebarGroup key={`${group.label ?? "top"}-${i}`} className="py-1.5">
            {group.label && (
              <SidebarGroupLabel className="text-muted-foreground/70 h-7 px-2 text-[0.7rem] font-medium tracking-wider uppercase">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.pages.map((page) => (
                  <SidebarMenuItem key={page.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === page.url}
                      className="text-muted-foreground hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-foreground h-8 text-[0.85rem] data-[active=true]:font-medium"
                    >
                      <Link href={page.url}>{page.name}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
