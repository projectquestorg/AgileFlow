"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Minus,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  X,
  FileText,
} from "lucide-react";
import { FileDiff } from "@/hooks/useDashboard";

interface DiffHunk {
  header: string;
  startLineOld: number;
  startLineNew: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "context" | "addition" | "deletion" | "header";
  content: string;
  lineNumOld?: number;
  lineNumNew?: number;
}

interface DiffViewerProps {
  diff: FileDiff;
  onStage?: () => void;
  onUnstage?: () => void;
  onRevert?: () => void;
  onClose?: () => void;
  onComment?: (lineNum: number, content: string) => void;
  onOpenLine?: (path: string, line: number) => void;
}

// Parse diff into hunks
function parseDiff(diff: string): DiffHunk[] {
  const lines = diff.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let lineNumOld = 0;
  let lineNumNew = 0;

  for (const line of lines) {
    // Skip file headers
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      continue;
    }

    // Hunk header: @@ -start,count +start,count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      lineNumOld = parseInt(hunkMatch[1], 10);
      lineNumNew = parseInt(hunkMatch[2], 10);
      currentHunk = {
        header: line,
        startLineOld: lineNumOld,
        startLineNew: lineNumNew,
        lines: [{ type: "header", content: line }],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "addition",
        content: line.slice(1),
        lineNumNew: lineNumNew++,
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "deletion",
        content: line.slice(1),
        lineNumOld: lineNumOld++,
      });
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1) || "",
        lineNumOld: lineNumOld++,
        lineNumNew: lineNumNew++,
      });
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

// Copy button
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-muted rounded transition-colors"
      title="Copy diff"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

// Single diff line
function DiffLineView({
  line,
  showCommentButton,
  onComment,
  onClickLine,
}: {
  line: DiffLine;
  showCommentButton?: boolean;
  onComment?: () => void;
  onClickLine?: (lineNum: number) => void;
}) {
  const [hovered, setHovered] = useState(false);

  if (line.type === "header") {
    return (
      <div className="flex items-center bg-blue-500/10 text-blue-400 font-mono text-xs px-2 py-1">
        <span className="text-muted-foreground/30 w-8 text-right pr-2 select-none">
          ···
        </span>
        <span className="text-muted-foreground/30 w-8 text-right pr-2 select-none border-r border-border mr-2">
          ···
        </span>
        <span className="truncate">{line.content}</span>
      </div>
    );
  }

  const bgColor =
    line.type === "addition"
      ? "bg-green-500/10"
      : line.type === "deletion"
      ? "bg-red-500/10"
      : "";

  const textColor =
    line.type === "addition"
      ? "text-green-400"
      : line.type === "deletion"
      ? "text-red-400"
      : "text-foreground/70";

  const prefix =
    line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " ";

  return (
    <div
      className={`flex items-stretch font-mono text-xs ${bgColor} group relative`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Line numbers */}
      <span
        className={`text-muted-foreground/30 w-8 text-right pr-2 select-none flex-shrink-0 py-0.5 ${
          onClickLine && line.lineNumOld ? "cursor-pointer hover:text-primary" : ""
        }`}
        onClick={onClickLine && line.lineNumOld ? () => onClickLine(line.lineNumOld!) : undefined}
      >
        {line.lineNumOld || ""}
      </span>
      <span
        className={`text-muted-foreground/30 w-8 text-right pr-2 select-none border-r border-border mr-2 flex-shrink-0 py-0.5 ${
          onClickLine && line.lineNumNew ? "cursor-pointer hover:text-primary" : ""
        }`}
        onClick={onClickLine && line.lineNumNew ? () => onClickLine(line.lineNumNew!) : undefined}
      >
        {line.lineNumNew || ""}
      </span>

      {/* Prefix */}
      <span className={`${textColor} w-4 flex-shrink-0 py-0.5`}>{prefix}</span>

      {/* Content */}
      <span className={`${textColor} flex-1 whitespace-pre py-0.5`}>
        {line.content || " "}
      </span>

      {/* Comment button */}
      {showCommentButton && hovered && onComment && (
        <button
          onClick={onComment}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-primary text-primary-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add comment"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Diff hunk component
function DiffHunkView({
  hunk,
  index,
  onStageHunk,
  onRevertHunk,
  onComment,
  onClickLine,
}: {
  hunk: DiffHunk;
  index: number;
  onStageHunk?: () => void;
  onRevertHunk?: () => void;
  onComment?: (lineNum: number) => void;
  onClickLine?: (lineNum: number) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      {/* Hunk header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 border-b border-border">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span className="font-mono">Hunk {index + 1}</span>
        </button>

        <div className="flex items-center gap-1">
          {onStageHunk && (
            <button
              onClick={onStageHunk}
              className="px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded transition-colors"
            >
              Stage Hunk
            </button>
          )}
          {onRevertHunk && (
            <button
              onClick={onRevertHunk}
              className="px-2 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors"
            >
              Revert Hunk
            </button>
          )}
        </div>
      </div>

      {/* Lines */}
      {!isCollapsed && (
        <div className="overflow-x-auto">
          {hunk.lines.map((line, i) => (
            <DiffLineView
              key={i}
              line={line}
              showCommentButton={line.type !== "header"}
              onComment={
                line.lineNumNew && onComment
                  ? () => onComment(line.lineNumNew!)
                  : undefined
              }
              onClickLine={onClickLine}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffViewer({
  diff,
  onStage,
  onUnstage,
  onRevert,
  onClose,
  onComment,
  onOpenLine,
}: DiffViewerProps) {
  const hunks = useMemo(() => parseDiff(diff.diff), [diff.diff]);
  const fileName = diff.path.split("/").pop() || diff.path;

  // Handle inline comment
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");

  const handleSubmitComment = () => {
    if (commentLine && commentText.trim() && onComment) {
      onComment(commentLine, commentText);
      setCommentLine(null);
      setCommentText("");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-mono text-sm font-medium truncate">
            {fileName}
          </span>
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            <span className="text-green-500 flex items-center">
              <Plus className="h-3 w-3" />
              {diff.additions}
            </span>
            <span className="text-red-500 flex items-center">
              <Minus className="h-3 w-3" />
              {diff.deletions}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CopyButton text={diff.diff} />
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto p-4">
        {hunks.length > 0 ? (
          <>
            {hunks.map((hunk, i) => (
              <DiffHunkView
                key={i}
                hunk={hunk}
                index={i}
                onStageHunk={!diff.staged ? onStage : undefined}
                onRevertHunk={!diff.staged ? onRevert : undefined}
                onComment={(lineNum) => setCommentLine(lineNum)}
                onClickLine={onOpenLine ? (lineNum) => onOpenLine(diff.path, lineNum) : undefined}
              />
            ))}

            {/* Inline comment input */}
            {commentLine !== null && (
              <div className="mt-4 border border-primary/50 rounded-lg p-3 bg-card">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Add comment at line {commentLine}</span>
                </div>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setCommentLine(null);
                      setCommentText("");
                    }}
                    className="px-3 py-1.5 text-xs hover:bg-muted rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitComment}
                    disabled={!commentText.trim()}
                    className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No diff available</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card/50">
        <div className="text-xs text-muted-foreground">
          {diff.staged ? "Staged" : "Unstaged"} changes
        </div>
        <div className="flex items-center gap-2">
          {diff.staged ? (
            onUnstage && (
              <button
                onClick={onUnstage}
                className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                Unstage
              </button>
            )
          ) : (
            <>
              {onRevert && (
                <button
                  onClick={onRevert}
                  className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  Revert
                </button>
              )}
              {onStage && (
                <button
                  onClick={onStage}
                  className="px-3 py-1.5 text-xs bg-green-500 text-white hover:bg-green-600 rounded-lg transition-colors"
                >
                  Stage
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
