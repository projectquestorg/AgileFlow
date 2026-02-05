"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Terminal, GitBranch, Folder, Bot, Settings,
  ChevronRight, MessageSquare, Play, Loader2, StopCircle,
  GitCommit, FileCode, ChevronDown, Circle,
} from "lucide-react";
import { useDashboard, FileChange } from "@/hooks/useDashboard";
import {
  MessageBubble,
  ImageUpload,
  VoiceDictation,
  QuestionDialog,
} from "@/components/chat";
import { FileChangeRow, DiffViewer, CommitDialog } from "@/components/review";
import { TerminalPanel } from "@/components/terminal";
import { AutomationsList, InboxList, SessionsList, Session } from "@/components/sidebar";
import { useNotifications, NotificationSettings } from "@/components/notifications";
import { Bell, X } from "lucide-react";
import { useProvider } from "@/hooks/useProvider";
import { IRSource } from "@/lib/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";

export default function Dashboard() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardContent />
    </SidebarProvider>
  );
}

function DashboardContent() {
  const [message, setMessage] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
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
    pendingQuestion,
    answerQuestion,
    dismissQuestion,
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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
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
    <SidebarGroup>
      <SidebarGroupLabel
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className="cursor-pointer hover:bg-sidebar-accent"
      >
        <span className="uppercase tracking-wider text-[10px]">{title}</span>
        <div className="flex items-center gap-2 ml-auto">
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">{count}</Badge>
          )}
          <ChevronRight className={`h-3 w-3 transition-transform ${expandedSection === id ? "rotate-90" : ""}`} />
        </div>
      </SidebarGroupLabel>
      {expandedSection === id && <SidebarGroupContent>{children}</SidebarGroupContent>}
    </SidebarGroup>
  );

  return (
    <>
      {/* Left Sidebar */}
      <Sidebar collapsible="offcanvas" className="border-r border-border">
        <SidebarHeader className="border-b border-border">
          <div className="relative">
            <Button
              variant="secondary"
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className="w-full justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-2">
                <span>{providerInfo.icon}</span>
                <span>{providerInfo.name}</span>
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showProviderMenu ? "rotate-180" : ""}`} />
            </Button>
            {showProviderMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 overflow-hidden">
                {providers.map((p) => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    onClick={() => { selectProvider(p.id as IRSource); setShowProviderMenu(false); }}
                    className={`w-full justify-start gap-2 rounded-none text-xs ${provider === p.id ? "bg-accent text-primary" : ""}`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
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
        </SidebarContent>

        <SidebarFooter className="border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
            <GitBranch className="h-3 w-3" />
            <span className="font-mono">{gitStatus?.branch || "main"}</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-12 md:h-10 items-center justify-between border-b border-border px-3 bg-card">
          <div className="flex items-center gap-2 md:gap-3">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm md:text-xs font-semibold tracking-wide">AGILEFLOW</span>
            <span className="text-muted-foreground hidden sm:inline">/</span>
            <span className="text-sm md:text-xs text-muted-foreground hidden sm:inline">my-project</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
              <Circle className={`h-2.5 w-2.5 md:h-2 md:w-2 fill-current ${
                connectionStatus === "connected" ? "text-green-500" :
                connectionStatus === "connecting" ? "text-yellow-500 animate-pulse" :
                connectionStatus === "error" ? "text-destructive" : "text-muted-foreground"
              }`} />
              <span className="text-muted-foreground hidden sm:inline">
                {connectionStatus === "connected" ? "connected" : connectionStatus}
              </span>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowNotificationSettings(true)} className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[8px] flex items-center justify-center">{unreadCount}</Badge>
              )}
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Main Chat Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-background">
            {connectionStatus !== "connected" ? (
              /* Connect State */
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-sm space-y-4">
                  <div className="text-center mb-6">
                    <Bot className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Connect to CLI</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Run <code className="bg-muted px-1.5 py-0.5 rounded-md text-xs">agileflow serve</code> in your project
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">WebSocket URL</label>
                    <Input
                      type="text"
                      value={wsUrl}
                      onChange={(e) => setWsUrl(e.target.value)}
                      placeholder="ws://localhost:8765"
                      className="font-mono"
                    />
                  </div>
                  {error && <div className="text-destructive text-sm">{error}</div>}
                  <Button
                    onClick={handleConnect}
                    disabled={connectionStatus === "connecting"}
                    className="w-full"
                    size="lg"
                  >
                    {connectionStatus === "connecting" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Connecting...</>
                    ) : (
                      <><Play className="h-4 w-4" />Connect</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 pb-32 md:pb-4">
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
                <div className="md:relative fixed bottom-10 md:bottom-auto left-0 right-0 z-20 border-t border-border p-3 bg-background">
                  {pendingImage && (
                    <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-xs">
                      <FileCode className="h-3 w-3" />
                      <span className="flex-1 truncate">{pendingImage.name}</span>
                      <Button variant="ghost" size="icon-xs" onClick={() => setPendingImage(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 max-w-3xl mx-auto">
                    <ImageUpload onImageSelect={(img) => setPendingImage(img)} disabled={false} />
                    <VoiceDictation onTranscript={(text) => setMessage((prev) => prev + text)} disabled={false} />
                    <Input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Message or /command..."
                      className="flex-1"
                    />
                    {isThinking ? (
                      <Button variant="destructive" size="icon" onClick={cancelOperation}>
                        <StopCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={!message.trim() && !pendingImage}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>

          {/* Right Panel - Review */}
          {showReviewPane && connectionStatus === "connected" && (
            <>
              <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => setShowReviewPane(false)}
              />
              <aside className="fixed lg:relative right-0 top-0 bottom-0 w-80 lg:w-72 border-l border-border bg-background flex flex-col overflow-hidden z-50">
                {/* Mobile close */}
                <div className="flex items-center justify-between p-3 border-b border-border lg:hidden">
                  <span className="text-sm font-semibold">Review</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowReviewPane(false)}>
                    <X className="h-4 w-4" />
                  </Button>
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
                        <Button
                          key={tab}
                          variant="ghost"
                          onClick={() => setReviewTab(tab)}
                          className={`flex-1 rounded-none text-xs font-medium h-9 ${
                            reviewTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {tab === "staged" ? `Staged${gitStatus?.staged.length ? ` (${gitStatus.staged.length})` : ""}` :
                           tab === "unstaged" ? `Unstaged${gitStatus?.unstaged.length ? ` (${gitStatus.unstaged.length})` : ""}` :
                           "All"}
                        </Button>
                      ))}
                    </div>

                    {/* Actions */}
                    {hasChanges && (
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-xs">
                        <span className="text-muted-foreground">Changes</span>
                        <div className="flex gap-1">
                          {gitStatus?.unstaged.length ? (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-primary" onClick={stageAll}>+all</Button>
                          ) : null}
                          {gitStatus?.staged.length ? (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={unstageAll}>-all</Button>
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
                        <div className="text-center py-8 text-sm text-muted-foreground">
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
                              <span className={`h-4 w-4 rounded-sm flex items-center justify-center text-[8px] ${
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
                      <Button
                        onClick={() => setShowCommitDialog(true)}
                        disabled={!hasStagedChanges}
                        className="w-full"
                      >
                        <GitCommit className="h-3.5 w-3.5" />
                        Commit
                      </Button>
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

        {/* Question Dialog */}
        {pendingQuestion && (
          <QuestionDialog
            question={pendingQuestion}
            onAnswer={answerQuestion}
            onDismiss={dismissQuestion}
          />
        )}

        {/* Footer */}
        <footer className="md:relative fixed bottom-0 left-0 right-0 z-20 flex h-10 md:h-8 items-center justify-between border-t border-border px-3 text-xs text-muted-foreground bg-card">
          <div className="flex items-center gap-1 md:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTerminal(!showTerminal)}
              className={`h-7 gap-1.5 text-xs ${showTerminal ? "text-primary" : "text-muted-foreground"}`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Terminal</span>
              <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">⌘J</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReviewPane(!showReviewPane)}
              className={`h-7 gap-1.5 text-xs ${showReviewPane ? "text-primary" : "text-muted-foreground"}`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Review</span>
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:flex items-center gap-1.5">
              <Folder className="h-3 w-3" />
              ~/my-project
            </span>
            <Separator orientation="vertical" className="h-3.5 hidden sm:block" />
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              {gitStatus?.branch || "main"}
            </span>
          </div>
        </footer>
      </SidebarInset>
    </>
  );
}
