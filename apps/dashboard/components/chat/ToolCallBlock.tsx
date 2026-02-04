"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  Loader2,
  Copy,
  Check,
  FileText,
  File,
  Code,
  Terminal,
  Folder,
  Search,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { ToolCall } from "@/hooks/useDashboard";

// Tool icon mapping
const toolIcons: Record<string, React.ReactNode> = {
  Read: <FileText className="h-3.5 w-3.5" />,
  Write: <File className="h-3.5 w-3.5" />,
  Edit: <Code className="h-3.5 w-3.5" />,
  Bash: <Terminal className="h-3.5 w-3.5" />,
  Glob: <Folder className="h-3.5 w-3.5" />,
  Grep: <Search className="h-3.5 w-3.5" />,
  WebFetch: <ExternalLink className="h-3.5 w-3.5" />,
  WebSearch: <Search className="h-3.5 w-3.5" />,
};

// Detect language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return langMap[ext || ""] || "plaintext";
}


// Format diff output with colors
function DiffView({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="font-mono text-xs">
      {lines.map((line, i) => {
        let className = "text-foreground/70";
        let prefix = "";

        if (line.startsWith("+") && !line.startsWith("+++")) {
          className = "text-green-500 bg-green-500/10";
          prefix = "";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          className = "text-red-500 bg-red-500/10";
          prefix = "";
        } else if (line.startsWith("@@")) {
          className = "text-blue-500 bg-blue-500/10";
        } else if (line.startsWith("diff") || line.startsWith("---") || line.startsWith("+++")) {
          className = "text-muted-foreground font-semibold";
        }

        return (
          <div key={i} className={`px-2 py-0.5 ${className}`}>
            {prefix}
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

// Terminal output styling
function TerminalOutput({ content, exitCode }: { content: string; exitCode?: number }) {
  return (
    <div className="bg-zinc-950 rounded-md overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500/80" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-zinc-500 flex-1 text-center font-mono">terminal</span>
        {exitCode !== undefined && (
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              exitCode === 0
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            exit {exitCode}
          </span>
        )}
      </div>
      {/* Terminal content */}
      <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto max-h-60 whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
}

// Copy button with feedback
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-muted rounded transition-colors"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

interface ToolCallBlockProps {
  toolCall: ToolCall;
  defaultExpanded?: boolean;
}

export function ToolCallBlock({ toolCall, defaultExpanded = false }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Determine the display summary based on tool type
  const getSummary = () => {
    const { tool, input } = toolCall;

    switch (tool) {
      case "Read":
        return input?.file_path;
      case "Write":
        return input?.file_path;
      case "Edit":
        return input?.file_path;
      case "Bash":
        return `$ ${input?.command?.slice(0, 60)}${(input?.command?.length || 0) > 60 ? "..." : ""}`;
      case "Glob":
        return input?.pattern;
      case "Grep":
        return `"${input?.pattern}" in ${input?.path || "."}`;
      case "WebFetch":
        return input?.url;
      case "WebSearch":
        return input?.query;
      default:
        return null;
    }
  };

  // Render output based on tool type
  const renderOutput = () => {
    const { tool, input, output, error } = toolCall;

    if (error) {
      return (
        <div className="flex items-start gap-2 text-red-500 bg-red-500/10 p-2 rounded">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <pre className="text-xs font-mono whitespace-pre-wrap">{error}</pre>
        </div>
      );
    }

    if (!output) {
      return <span className="text-xs text-muted-foreground">No output</span>;
    }

    const outputStr = typeof output === "string" ? output : JSON.stringify(output, null, 2);

    switch (tool) {
      case "Read":
        const lang = getLanguageFromPath(input?.file_path || "");
        return (
          <div className="relative">
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {lang}
              </span>
              <CopyButton text={outputStr} />
            </div>
            <pre className="text-xs font-mono overflow-x-auto max-h-60 p-2 bg-muted/30 rounded text-foreground/80">
              {outputStr.split("\n").map((line, i) => (
                <div key={i} className="flex">
                  <span className="text-muted-foreground/50 select-none w-8 text-right pr-2 border-r border-border mr-2">
                    {i + 1}
                  </span>
                  <span>{line || " "}</span>
                </div>
              ))}
            </pre>
          </div>
        );

      case "Edit":
        // Check if output looks like a diff
        if (outputStr.includes("---") || outputStr.includes("+++") || outputStr.match(/^[+-]/m)) {
          return <DiffView content={outputStr} />;
        }
        return (
          <pre className="text-xs font-mono overflow-x-auto max-h-40 p-2 bg-muted/30 rounded">
            {outputStr}
          </pre>
        );

      case "Bash":
        const exitCode = typeof output === "object" && output !== null && "exitCode" in output
          ? (output as { exitCode: number }).exitCode
          : undefined;
        const bashOutput = typeof output === "object" && output !== null && "output" in output
          ? (output as { output: string }).output
          : outputStr;
        return <TerminalOutput content={bashOutput} exitCode={exitCode} />;

      default:
        return (
          <div className="relative">
            <div className="absolute top-2 right-2">
              <CopyButton text={outputStr} />
            </div>
            <pre className="text-xs font-mono overflow-x-auto max-h-40 p-2 bg-muted/30 rounded text-foreground/70">
              {outputStr}
            </pre>
          </div>
        );
    }
  };

  const summary = getSummary();
  const statusColors = {
    pending: "text-muted-foreground",
    running: "text-primary",
    completed: "text-green-500",
    error: "text-red-500",
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-card/50 overflow-hidden transition-all duration-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
        <span
          className={`flex items-center gap-1.5 ${statusColors[toolCall.status]}`}
        >
          {toolCall.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            toolIcons[toolCall.tool] || <Code className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="font-medium">{toolCall.tool}</span>
        {summary && (
          <span className="text-muted-foreground truncate font-mono">
            {summary}
          </span>
        )}
        {toolCall.status === "completed" && (
          <Check className="h-3.5 w-3.5 text-green-500 ml-auto flex-shrink-0" />
        )}
        {toolCall.status === "error" && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 ml-auto flex-shrink-0" />
        )}
      </button>

      {/* Expandable content */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded ? "max-h-[500px]" : "max-h-0"
        }`}
      >
        <div className="border-t border-border px-3 py-3 bg-muted/10 space-y-3">
          {/* Input section */}
          {toolCall.input && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">
                  Input
                </span>
                <CopyButton text={JSON.stringify(toolCall.input, null, 2)} />
              </div>
              <pre className="text-xs text-muted-foreground font-mono overflow-x-auto bg-muted/30 p-2 rounded max-h-32">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output section */}
          {(toolCall.output || toolCall.error) && (
            <div>
              <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide block mb-1.5">
                {toolCall.error ? "Error" : "Output"}
              </span>
              {renderOutput()}
            </div>
          )}

          {/* Running state */}
          {toolCall.status === "running" && !toolCall.output && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
