"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  GitCommit,
  Upload,
  FileText,
  Plus,
  Minus,
  Loader2,
} from "lucide-react";
import { FileChange } from "@/hooks/useDashboard";

interface CommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, options?: { push?: boolean }) => void;
  stagedFiles: FileChange[];
  isCommitting?: boolean;
}

// Common commit prefixes for quick selection
const commitPrefixes = [
  { label: "feat", description: "A new feature" },
  { label: "fix", description: "A bug fix" },
  { label: "docs", description: "Documentation changes" },
  { label: "style", description: "Code style changes" },
  { label: "refactor", description: "Code refactoring" },
  { label: "test", description: "Adding tests" },
  { label: "chore", description: "Maintenance tasks" },
];

export function CommitDialog({
  isOpen,
  onClose,
  onCommit,
  stagedFiles,
  isCommitting = false,
}: CommitDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSummary("");
      setDescription("");
      setPushAfterCommit(false);
      setSelectedPrefix(null);
    }
  }, [isOpen]);

  // Calculate total additions/deletions
  const stats = stagedFiles.reduce(
    (acc, file) => ({
      additions: acc.additions + (file.additions || 0),
      deletions: acc.deletions + (file.deletions || 0),
    }),
    { additions: 0, deletions: 0 }
  );

  // Handle prefix selection
  const handlePrefixSelect = (prefix: string) => {
    if (selectedPrefix === prefix) {
      setSelectedPrefix(null);
      // Remove prefix from summary if present
      if (summary.startsWith(`${prefix}: `)) {
        setSummary(summary.slice(prefix.length + 2));
      }
    } else {
      setSelectedPrefix(prefix);
      // Add prefix to summary if not present
      if (!summary.startsWith(`${prefix}: `)) {
        const cleanSummary = summary.replace(/^[a-z]+: /, "");
        setSummary(`${prefix}: ${cleanSummary}`);
      }
    }
  };

  // Handle commit
  const handleCommit = () => {
    const fullMessage = description
      ? `${summary}\n\n${description}`
      : summary;

    onCommit(fullMessage, { push: pushAfterCommit });
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to commit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (summary.trim() && stagedFiles.length > 0) {
        handleCommit();
      }
    }
    // Escape to close
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <GitCommit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Commit Changes</h2>
              <p className="text-xs text-muted-foreground">
                {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""}{" "}
                staged
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Commit type prefixes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {commitPrefixes.map((prefix) => (
                <button
                  key={prefix.label}
                  onClick={() => handlePrefixSelect(prefix.label)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    selectedPrefix === prefix.label
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-border hover:border-primary/50"
                  }`}
                  title={prefix.description}
                >
                  {prefix.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Summary <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description of changes"
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={72}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                Keep it short and descriptive
              </span>
              <span
                className={`text-[10px] ${
                  summary.length > 60 ? "text-yellow-500" : "text-muted-foreground"
                }`}
              >
                {summary.length}/72
              </span>
            </div>
          </div>

          {/* Description textarea */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Description{" "}
              <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about the changes..."
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={3}
            />
          </div>

          {/* Files list */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Files to commit
            </label>
            <div className="bg-muted/20 rounded-lg border border-border max-h-32 overflow-y-auto">
              {stagedFiles.length > 0 ? (
                stagedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-mono truncate flex-1">{file.path}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {file.additions !== undefined && file.additions > 0 && (
                        <span className="text-green-500 flex items-center">
                          <Plus className="h-2.5 w-2.5" />
                          {file.additions}
                        </span>
                      )}
                      {file.deletions !== undefined && file.deletions > 0 && (
                        <span className="text-red-500 flex items-center">
                          <Minus className="h-2.5 w-2.5" />
                          {file.deletions}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No files staged. Stage files first.
                </div>
              )}
            </div>
            {(stats.additions > 0 || stats.deletions > 0) && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="text-muted-foreground">Total:</span>
                <span className="text-green-500 flex items-center">
                  <Plus className="h-3 w-3" />
                  {stats.additions}
                </span>
                <span className="text-red-500 flex items-center">
                  <Minus className="h-3 w-3" />
                  {stats.deletions}
                </span>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={pushAfterCommit}
                onChange={(e) => setPushAfterCommit(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm">Push after commit</span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10">
          <div className="text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              ⌘
            </kbd>{" "}
            +{" "}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              Enter
            </kbd>{" "}
            to commit
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={!summary.trim() || stagedFiles.length === 0 || isCommitting}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 font-medium shadow-lg shadow-primary/25"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Committing...
                </>
              ) : (
                <>
                  <GitCommit className="h-4 w-4" />
                  {pushAfterCommit ? "Commit & Push" : "Commit"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
