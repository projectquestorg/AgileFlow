"use client";

import { useState } from "react";
import { Bot, User, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Message } from "@/hooks/useDashboard";
import { ToolCallBlock } from "./ToolCallBlock";

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
}

export function MessageBubble({ message, showAvatar = true }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  return (
    <div
      className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      {/* Assistant avatar */}
      {!isUser && showAvatar && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        {/* Message content */}
        <div
          className={`relative rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card border border-border rounded-bl-md shadow-sm"
          }`}
        >
          {/* Copy button - appears on hover */}
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="absolute -right-8 top-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-all"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}

          {/* Message text */}
          <div className="text-sm whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-middle rounded-sm" />
            )}
          </div>
        </div>

        {/* Tool calls section */}
        {hasToolCalls && (
          <div className="mt-2">
            {/* Tool calls toggle */}
            {message.toolCalls!.length > 1 && (
              <button
                onClick={() => setToolsExpanded(!toolsExpanded)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
              >
                {toolsExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>
                  {message.toolCalls!.length} tool call
                  {message.toolCalls!.length !== 1 ? "s" : ""}
                </span>
              </button>
            )}

            {/* Tool call blocks */}
            {toolsExpanded && (
              <div className="space-y-1">
                {message.toolCalls!.map((tc) => (
                  <ToolCallBlock key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-[10px] text-muted-foreground mt-1.5 ${
            isUser ? "text-right" : ""
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {/* User avatar */}
      {isUser && showAvatar && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center ring-1 ring-border">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
