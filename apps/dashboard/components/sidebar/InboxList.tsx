"use client";

import { useState } from "react";
import {
  Inbox,
  Check,
  X,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { InboxItem } from "@/hooks/useDashboard";

interface InboxListProps {
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

export function InboxList({ items, onAccept, onDismiss, onMarkRead }: InboxListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-4">
        <div className="bg-muted/30 rounded-full p-2.5 w-fit mx-auto mb-2">
          <Inbox className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <p className="text-xs text-muted-foreground">Inbox empty</p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          Automation results appear here
        </p>
      </div>
    );
  }

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
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg overflow-hidden">
          {/* Item Header */}
          <button
            onClick={() => handleToggle(item)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
              expandedId === item.id
                ? "bg-muted/70"
                : "hover:bg-muted/50"
            } ${item.status === "unread" ? "font-medium" : ""}`}
          >
            {item.result?.success !== false ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate">{item.title}</span>
                {item.status === "unread" && (
                  <span className="h-1.5 w-1.5 bg-primary rounded-full flex-shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatTimeAgo(item.timestamp)}
              </span>
            </div>

            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                expandedId === item.id ? "rotate-90" : ""
              }`}
            />
          </button>

          {/* Expanded Content */}
          {expandedId === item.id && (
            <div className="px-3 pb-3 bg-muted/30 border-t border-border/50">
              <div className="pt-3 space-y-3">
                {/* Summary */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.summary}
                </p>

                {/* Result Details */}
                {item.result && (
                  <div className="space-y-2">
                    {item.result.output && (
                      <div className="bg-card/50 rounded-md p-2 border border-border">
                        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                          {item.result.output.slice(0, 500)}
                          {item.result.output.length > 500 && "..."}
                        </pre>
                      </div>
                    )}

                    {item.result.error && (
                      <div className="bg-red-500/10 rounded-md p-2 border border-red-500/20">
                        <pre className="text-[10px] text-red-500 whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono">
                          {item.result.error}
                        </pre>
                      </div>
                    )}

                    {item.result.duration_ms !== undefined && (
                      <div className="text-[10px] text-muted-foreground">
                        Duration: {(item.result.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onAccept(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:opacity-90 transition-opacity"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground text-xs font-medium rounded-md hover:bg-muted/80 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
