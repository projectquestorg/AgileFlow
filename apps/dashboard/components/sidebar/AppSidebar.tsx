"use client";

import * as React from "react";
import { ChevronDown, GitBranch, Settings, HelpCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { NavSessions, Session } from "./NavSessions";
import { NavAutomations, Automation } from "./NavAutomations";
import { NavInbox, InboxItem } from "./NavInbox";

interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  // Provider
  provider: string;
  providerInfo: ProviderInfo;
  providers: ProviderInfo[];
  onProviderChange: (id: string) => void;

  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onSessionCreate: () => void;
  onSessionDelete?: (id: string) => void;
  onSessionRename?: (id: string, newName: string) => void;

  // Automations
  automations: Automation[];
  onAutomationRun: (id: string) => void;
  onAutomationStop: (id: string) => void;

  // Inbox
  inbox: InboxItem[];
  onInboxAccept: (id: string) => void;
  onInboxDismiss: (id: string) => void;
  onInboxMarkRead: (id: string) => void;

  // Git
  gitBranch?: string;
}

export function AppSidebar({
  provider,
  providerInfo,
  providers,
  onProviderChange,
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  onSessionRename,
  automations,
  onAutomationRun,
  onAutomationStop,
  inbox,
  onInboxAccept,
  onInboxDismiss,
  onInboxMarkRead,
  gitBranch = "main",
  ...props
}: AppSidebarProps) {
  const [showProviderMenu, setShowProviderMenu] = React.useState(false);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="relative">
              <SidebarMenuButton
                size="lg"
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-base">{providerInfo.icon}</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{providerInfo.name}</span>
                  <span className="truncate text-xs text-muted-foreground">AI Provider</span>
                </div>
                <ChevronDown className={`ml-auto size-4 transition-transform ${showProviderMenu ? "rotate-180" : ""}`} />
              </SidebarMenuButton>

              {showProviderMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProviderMenu(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onProviderChange(p.id);
                          setShowProviderMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors ${
                          provider === p.id ? "bg-accent text-accent-foreground" : ""
                        }`}
                      >
                        <span className="text-base">{p.icon}</span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavSessions
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={onSessionSelect}
          onCreate={onSessionCreate}
          onDelete={onSessionDelete}
          onRename={onSessionRename}
        />
        <NavAutomations
          automations={automations}
          onRun={onAutomationRun}
          onStop={onAutomationStop}
        />
        <NavInbox
          items={inbox}
          onAccept={onInboxAccept}
          onDismiss={onInboxDismiss}
          onMarkRead={onInboxMarkRead}
        />

        {/* Secondary Nav - pushed to bottom */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings">
                  <Settings className="size-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Help">
                  <HelpCircle className="size-4" />
                  <span>Help</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={gitBranch}>
              <GitBranch className="size-4" />
              <span className="font-mono text-xs">{gitBranch}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
