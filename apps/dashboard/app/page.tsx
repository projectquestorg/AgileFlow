"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Terminal, GitBranch, Folder, Bot, Settings,
  Menu, X, ChevronRight, MessageSquare, Play, Loader2, StopCircle,
  GitCommit, FileCode, ChevronDown, Circle,
} from "lucide-react";
import { useDashboard, FileChange } from "@/hooks/useDashboard";
import {
  MessageBubble,
  ImageUpload,
  VoiceDictation,
} from "@/components/chat";
import { FileChangeRow, DiffViewer, CommitDialog } from "@/components/review";
import { TerminalPanel } from "@/components/terminal";
import { AutomationsList, InboxList, SessionsList, Session } from "@/components/sidebar";
import { useNotifications, NotificationSettings } from "@/components/notifications";
import { Bell } from "lucide-react";
import { useProvider } from "@/hooks/useProvider";
import { IRSource } from "@/lib/protocol";

export default function Dashboard() {
  const [message, setMessage] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  // Mobile: sidebar and review pane hidden by default
  const [showSidebar, setShowSidebar] = useState(typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [showReviewPane, setShowReviewPane] = useState(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  const { provider, providerInfo, providers, selectProvider } = useProvider("claude");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8765");
  const [reviewTab, setReviewTab] = useState<"staged" | "unstaged" | "all">("all");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>("session-1");
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("sessions");

  const [sessions] = useState<Session[]>([
    { id: "session-1", name: "Main", type: "local", status: "active", branch: "main", messageCount: 15, lastActivity: new Date().toISOString() },
    { id: "session-2", name: "feature/auth", type: "worktree", status: "idle", branch: "feature/auth", messageCount: 8, lastActivity: new Date(Date.now() - 3600000).toISOString() },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addNotification, unreadCount } = useNotifications();

  const {
    messages,
    tasks,
    gitStatus,
    isThinking,
    connectionStatus,
    error,
    connect,
    sendMessage,
    cancelOperation,
    currentDiff,
    diffLoading,
    selectedFile,
    requestDiff,
    stageFile,
    unstageFile,
    revertFile,
    stageAll,
    unstageAll,
    commit,
    clearDiff,
    terminal,
    spawnTerminal,
    terminalInput,
    terminalResize,
    closeTerminal,
    clearTerminalOutput,
    automations,
    runAutomation,
    stopAutomation,
    inbox,
    acceptInboxItem,
    dismissInboxItem,
    markInboxRead,
  } = useDashboard();

  const getFilteredFiles = () => {
    if (!gitStatus) return { staged: [], unstaged: [] };
    switch (reviewTab) {
      case "staged": return { staged: gitStatus.staged, unstaged: [] };
      case "unstaged": return { staged: [], unstaged: gitStatus.unstaged };
      default: return { staged: gitStatus.staged, unstaged: gitStatus.unstaged };
    }
  };

  const filteredFiles = getFilteredFiles();
  const hasChanges = (gitStatus?.staged.length || 0) + (gitStatus?.unstaged.length || 0) > 0;
  const hasStagedChanges = (gitStatus?.staged.length || 0) > 0;

  const handleFileSelect = (file: FileChange, isStaged: boolean) => {
    if (selectedFile === file.path) {
      clearDiff();
      setShowDiffViewer(false);
    } else {
      requestDiff(file.path, isStaged);
      setShowDiffViewer(true);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle responsive sidebar/review pane
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setShowSidebar(false);
        setShowReviewPane(false);
      } else if (window.innerWidth < 1024) {
        setShowReviewPane(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setShowTerminal((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    sendMessage(message);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleConnect = () => {
    connect(wsUrl);
  };

  const SidebarSection = ({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) => (
    <div className="border-b border-border">
      <button
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
      >
        <span className="uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          {count !== undefined && count > 0 && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 rounded">{count}</span>
          )}
          <ChevronRight className={`h-3 w-3 transition-transform ${expandedSection === id ? "rotate-90" : ""}`} />
        </div>
      </button>
      {expandedSection === id && <div className="pb-2">{children}</div>}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground font-mono text-sm">
      {/* Header - sticky on mobile */}
      <header className="sticky top-0 z-30 flex h-12 md:h-10 items-center justify-between border-b border-border px-3 bg-card">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 md:p-1 hover:bg-muted -ml-1">
            <Menu className="h-5 w-5 md:h-4 md:w-4" />
          </button>
          <span className="text-sm md:text-xs font-bold tracking-wide">AGILEFLOW</span>
          <span className="text-muted-foreground hidden sm:inline">/</span>
          <span className="text-sm md:text-xs hidden sm:inline">my-project</span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
            <Circle className={`h-2.5 w-2.5 md:h-2 md:w-2 fill-current ${
              connectionStatus === "connected" ? "text-primary" :
              connectionStatus === "connecting" ? "text-yellow-500 animate-pulse" :
              connectionStatus === "error" ? "text-destructive" : "text-muted-foreground"
            }`} />
            <span className="text-muted-foreground hidden sm:inline">
              {connectionStatus === "connected" ? "connected" : connectionStatus}
            </span>
          </div>
          <button onClick={() => setShowNotificationSettings(true)} className="p-2 md:p-1.5 hover:bg-muted relative">
            <Bell className="h-5 w-5 md:h-4 md:w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 md:-top-0.5 md:-right-0.5 h-4 w-4 md:h-3 md:w-3 bg-primary text-[9px] md:text-[8px] font-bold flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
          <button className="p-2 md:p-1.5 hover:bg-muted"><Settings className="h-5 w-5 md:h-4 md:w-4" /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - overlay on mobile */}
        {showSidebar && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <aside className="fixed md:relative left-0 top-0 bottom-0 w-64 md:w-56 border-r border-border bg-background flex flex-col overflow-hidden z-50">
            {/* Mobile close button */}
            <div className="flex items-center justify-between p-3 border-b border-border md:hidden">
              <span className="text-xs font-bold tracking-wide">AGILEFLOW</span>
              <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Provider */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <button
                  onClick={() => setShowProviderMenu(!showProviderMenu)}
                  className="w-full flex items-center justify-between gap-2 bg-muted px-2 py-1.5 text-xs hover:bg-muted/80"
                >
                  <span className="flex items-center gap-2">
                    <span>{providerInfo.icon}</span>
                    <span>{providerInfo.name}</span>
                  </span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showProviderMenu ? "rotate-180" : ""}`} />
                </button>
                {showProviderMenu && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border z-50">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { selectProvider(p.id as IRSource); setShowProviderMenu(false); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted ${provider === p.id ? "bg-muted text-primary" : ""}`}
                      >
                        <span>{p.icon}</span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible Sections */}
            <div className="flex-1 overflow-y-auto">
              <SidebarSection id="sessions" title="Sessions" count={sessions.length}>
                <SessionsList
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelect={setActiveSessionId}
                  onCreate={() => addNotification("info", "Coming Soon", "Session creation will be available soon")}
                  onDelete={() => addNotification("info", "Coming Soon", "Session deletion will be available soon")}
                  onRename={(id, name) => addNotification("success", "Renamed", `Session renamed to "${name}"`)}
                />
              </SidebarSection>

              <SidebarSection id="automations" title="Automations" count={automations.filter(a => a.status === "running").length}>
                <AutomationsList automations={automations} onRun={runAutomation} onStop={stopAutomation} />
              </SidebarSection>

              <SidebarSection id="inbox" title="Inbox" count={inbox.filter(i => i.status === "unread").length}>
                <InboxList items={inbox} onAccept={acceptInboxItem} onDismiss={dismissInboxItem} onMarkRead={markInboxRead} />
              </SidebarSection>
            </div>

            {/* Git Status */}
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">{gitStatus?.branch || "main"}</span>
              </div>
            </div>
          </aside>
          </>
        )}

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          {connectionStatus !== "connected" ? (
            /* Connect State */
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-sm space-y-4">
                <div className="text-center mb-6">
                  <Bot className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <h2 className="text-lg font-medium">Connect to CLI</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Run <code className="bg-muted px-1">agileflow serve</code> in your project
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">WebSocket URL</label>
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="ws://localhost:8765"
                    className="w-full bg-muted border-0 px-3 py-3 text-base font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {error && <div className="text-destructive text-xs">{error}</div>}
                <button
                  onClick={handleConnect}
                  disabled={connectionStatus === "connecting"}
                  className="w-full bg-primary text-primary-foreground px-4 py-3 text-base font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {connectionStatus === "connecting" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Connecting...</>
                  ) : (
                    <><Play className="h-4 w-4" />Connect</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Ready. Type a message or command.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {isThinking && !messages.some(m => m.isStreaming) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                {pendingImage && (
                  <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 px-2 py-1.5 bg-muted text-xs">
                    <FileCode className="h-3 w-3" />
                    <span className="flex-1 truncate">{pendingImage.name}</span>
                    <button onClick={() => setPendingImage(null)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                )}
                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                  <ImageUpload onImageSelect={(img) => setPendingImage(img)} disabled={false} />
                  <VoiceDictation onTranscript={(text) => setMessage((prev) => prev + text)} disabled={false} />
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message or /command..."
                    className="flex-1 bg-muted border-0 px-3 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {isThinking ? (
                    <button onClick={cancelOperation} className="bg-destructive text-white p-3 md:p-2 hover:bg-destructive/90">
                      <StopCircle className="h-5 w-5 md:h-4 md:w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSendMessage}
                      disabled={!message.trim() && !pendingImage}
                      className="bg-primary text-primary-foreground p-3 md:p-2 hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Send className="h-5 w-5 md:h-4 md:w-4" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </main>

        {/* Right Panel - Review - overlay on mobile/tablet */}
        {showReviewPane && connectionStatus === "connected" && (
          <>
            {/* Backdrop on smaller screens */}
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setShowReviewPane(false)}
            />
            <aside className="fixed lg:relative right-0 top-0 bottom-0 w-80 lg:w-72 border-l border-border bg-background flex flex-col overflow-hidden z-50">
            {/* Mobile close button */}
            <div className="flex items-center justify-between p-3 border-b border-border lg:hidden">
              <span className="text-xs font-bold">Review</span>
              <button onClick={() => setShowReviewPane(false)} className="p-2 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {showDiffViewer && currentDiff ? (
              <DiffViewer
                diff={currentDiff}
                onStage={() => stageFile(currentDiff.path)}
                onUnstage={() => unstageFile(currentDiff.path)}
                onRevert={() => revertFile(currentDiff.path)}
                onClose={() => { clearDiff(); setShowDiffViewer(false); }}
              />
            ) : (
              <>
                {/* Tabs */}
                <div className="flex border-b border-border text-xs">
                  {(["staged", "unstaged", "all"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setReviewTab(tab)}
                      className={`flex-1 px-3 py-2 font-medium transition-colors ${
                        reviewTab === tab ? "border-b border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "staged" ? `Staged${gitStatus?.staged.length ? ` (${gitStatus.staged.length})` : ""}` :
                       tab === "unstaged" ? `Unstaged${gitStatus?.unstaged.length ? ` (${gitStatus.unstaged.length})` : ""}` :
                       "All"}
                    </button>
                  ))}
                </div>

                {/* Actions */}
                {hasChanges && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-xs">
                    <span className="text-muted-foreground">Changes</span>
                    <div className="flex gap-1">
                      {gitStatus?.unstaged.length ? (
                        <button onClick={stageAll} className="px-2 py-0.5 text-primary hover:bg-primary/10">+all</button>
                      ) : null}
                      {gitStatus?.staged.length ? (
                        <button onClick={unstageAll} className="px-2 py-0.5 text-muted-foreground hover:bg-muted">-all</button>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Files */}
                <div className="flex-1 overflow-y-auto p-2">
                  {hasChanges ? (
                    <div className="space-y-1">
                      {filteredFiles.staged.length > 0 && reviewTab === "all" && (
                        <div className="text-[10px] uppercase text-primary px-2 py-1 font-medium">Staged</div>
                      )}
                      {filteredFiles.staged.map((file, i) => (
                        <FileChangeRow
                          key={`s-${i}`}
                          file={file}
                          isSelected={selectedFile === file.path}
                          isLoading={diffLoading && selectedFile === file.path}
                          isStaged={true}
                          onSelect={() => handleFileSelect(file, true)}
                          onUnstage={() => unstageFile(file.path)}
                        />
                      ))}
                      {filteredFiles.unstaged.length > 0 && reviewTab === "all" && filteredFiles.staged.length > 0 && (
                        <div className="text-[10px] uppercase text-yellow-500 px-2 py-1 font-medium mt-2">Unstaged</div>
                      )}
                      {filteredFiles.unstaged.map((file, i) => (
                        <FileChangeRow
                          key={`u-${i}`}
                          file={file}
                          isSelected={selectedFile === file.path}
                          isLoading={diffLoading && selectedFile === file.path}
                          isStaged={false}
                          onSelect={() => handleFileSelect(file, false)}
                          onStage={() => stageFile(file.path)}
                          onRevert={() => revertFile(file.path)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      <GitBranch className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      No changes
                    </div>
                  )}
                </div>

                {/* Tasks */}
                <div className="border-t border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tasks</div>
                  {tasks.length > 0 ? (
                    <div className="space-y-1">
                      {tasks.slice(0, 5).map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-xs py-1">
                          <span className={`h-3 w-3 flex items-center justify-center text-[8px] ${
                            task.status === "completed" ? "bg-primary text-primary-foreground" :
                            task.status === "in_progress" ? "border border-primary" : "border border-muted-foreground/30"
                          }`}>
                            {task.status === "completed" && "✓"}
                          </span>
                          <span className={`flex-1 truncate ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}>
                            {task.subject}
                          </span>
                          {task.status === "in_progress" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No tasks</p>
                  )}
                </div>

                {/* Commit */}
                <div className="p-3">
                  <button
                    onClick={() => setShowCommitDialog(true)}
                    disabled={!hasStagedChanges}
                    className="w-full bg-primary text-primary-foreground py-2 text-xs font-medium hover:bg-primary/90 disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    <GitCommit className="h-3 w-3" />
                    Commit
                  </button>
                </div>
              </>
            )}
          </aside>
          </>
        )}
      </div>

      {/* Commit Dialog */}
      <CommitDialog
        isOpen={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onCommit={(msg, opts) => { commit(msg, opts); setShowCommitDialog(false); }}
        stagedFiles={gitStatus?.staged || []}
      />

      {/* Terminal */}
      <TerminalPanel
        isConnected={connectionStatus === "connected"}
        isExpanded={showTerminal}
        onToggle={() => setShowTerminal(!showTerminal)}
        onSpawn={spawnTerminal}
        onInput={terminalInput}
        onResize={terminalResize}
        onClose={closeTerminal}
        terminalOutputs={terminal.outputs}
        onOutputProcessed={clearTerminalOutput}
      />

      {/* Notification Settings */}
      <NotificationSettings isOpen={showNotificationSettings} onClose={() => setShowNotificationSettings(false)} />

      {/* Footer */}
      <footer className="flex h-10 md:h-7 items-center justify-between border-t border-border px-3 text-xs md:text-[10px] text-muted-foreground bg-card">
        <div className="flex items-center gap-1 md:gap-3">
          <button onClick={() => setShowTerminal(!showTerminal)} className={`flex items-center gap-1 p-2 md:p-0 hover:text-foreground ${showTerminal ? "text-primary" : ""}`}>
            <Terminal className="h-4 w-4 md:h-3 md:w-3" />
            <span className="hidden sm:inline">Terminal</span>
            <span className="hidden md:inline text-muted-foreground/50">⌘J</span>
          </button>
          <button onClick={() => setShowReviewPane(!showReviewPane)} className={`flex items-center gap-1 p-2 md:p-0 hover:text-foreground ${showReviewPane ? "text-primary" : ""}`}>
            <FileCode className="h-4 w-4 md:h-3 md:w-3" />
            <span className="hidden sm:inline">Review</span>
          </button>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden sm:flex items-center gap-1">
            <Folder className="h-3 w-3" />
            ~/my-project
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-4 w-4 md:h-3 md:w-3" />
            {gitStatus?.branch || "main"}
          </span>
        </div>
      </footer>
    </div>
  );
}
