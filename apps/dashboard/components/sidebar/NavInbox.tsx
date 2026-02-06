"use client";

import {
  Inbox,
  Check,
  X,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface InboxItemResult {
  success: boolean;
  output?: string;
  error?: string;
  duration_ms?: number;
}

export interface InboxItem {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  status: "unread" | "read" | "accepted" | "dismissed";
  result?: InboxItemResult;
}

interface NavInboxProps {
  items: InboxItem[];
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diff = now.getTime() - then.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;

  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NavInbox({
  items,
  onAccept,
  onDismiss,
  onMarkRead,
}: NavInboxProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const unreadCount = items.filter((i) => i.status === "unread").length;

  const handleToggle = (item: InboxItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
    } else {
      setExpandedId(item.id);
      if (item.status === "unread") {
        onMarkRead(item.id);
      }
    }
  };

  return (
    <Collapsible className="group/collapsible">
      <SidebarGroup>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 h-8 text-sidebar-foreground/70 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <span className="flex-1 text-left">Inbox</span>
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px]">
              {unreadCount}
            </Badge>
          )}
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.length === 0 ? (
                <SidebarMenuItem>
                  <div className="text-center py-4 px-2">
                    <Inbox className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">Inbox empty</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Automation results appear here
                    </p>
                  </div>
                </SidebarMenuItem>
              ) : (
                items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => handleToggle(item)}
                      className={item.status === "unread" ? "font-medium" : ""}
                    >
                      {item.result?.success !== false ? (
                        <CheckCircle className="size-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="size-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate">{item.title}</span>
                      {item.status === "unread" && (
                        <span className="h-2 w-2 bg-primary rounded-full flex-shrink-0" />
                      )}
                      <ChevronRight
                        className={`size-4 text-muted-foreground transition-transform ${
                          expandedId === item.id ? "rotate-90" : ""
                        }`}
                      />
                    </SidebarMenuButton>

                    {/* Expanded Content */}
                    {expandedId === item.id && (
                      <div className="px-2 pb-2 space-y-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1 px-2">
                          <Clock className="size-3" />
                          {formatTimeAgo(item.timestamp)}
                        </div>
                        <p className="text-xs text-muted-foreground px-2 leading-relaxed">
                          {item.summary}
                        </p>

                        {item.result?.output && (
                          <div className="bg-muted/50 rounded-md p-2 mx-2">
                            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono">
                              {item.result.output.slice(0, 300)}
                              {item.result.output.length > 300 && "..."}
                            </pre>
                          </div>
                        )}

                        {item.result?.error && (
                          <div className="bg-destructive/10 rounded-md p-2 mx-2 border border-destructive/20">
                            <pre className="text-[10px] text-destructive whitespace-pre-wrap break-words max-h-20 overflow-y-auto font-mono">
                              {item.result.error}
                            </pre>
                          </div>
                        )}

                        <div className="flex items-center gap-2 px-2">
                          <Button
                            size="sm"
                            onClick={() => onAccept(item.id)}
                            className="h-7 text-xs"
                          >
                            <Check className="size-3" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDismiss(item.id)}
                            className="h-7 text-xs"
                          >
                            <X className="size-3" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
