"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Send, Terminal, Plus, GitBranch, Folder, Bot, Settings,
  Menu, X, PanelRightOpen, PanelRightClose, Sparkles, Code, TestTube,
  FileText, Zap, ChevronDown, MessageSquare, Play, Loader2, StopCircle,
  Minus, GitCommit,
} from "lucide-react";
import { useDashboard, FileChange } from "@/hooks/useDashboard";
import {
  MessageBubble,
  ConnectionStatusBar,
  TaskPanelSkeleton,
  GitStatusSkeleton,
  ImageUpload,
  VoiceDictation,
} from "@/components/chat";
import { FileChangeRow, DiffViewer, CommitDialog } from "@/components/review";
import { TerminalPanel } from "@/components/terminal";
import { AutomationsList, InboxList, SessionsList, Session, SkillsBrowser } from "@/components/sidebar";
import { useNotifications, NotificationSettings } from "@/components/notifications";
import { Bell, Wand2, Copy, RotateCcw, Bot as AgentIcon } from "lucide-react";
import { useProvider } from "@/hooks/useProvider";
import { IRSource } from "@/lib/protocol";

// Suggestion pills for quick actions
const suggestions = [
  { icon: FileText, label: "Create a story", prompt: "/story" },
  { icon: Code, label: "Review code", prompt: "/review" },
  { icon: TestTube, label: "Run tests", prompt: "/verify" },
  { icon: Zap, label: "Quick fix", prompt: "Fix the issue in " },
];

export default function Dashboard() {
  const [message, setMessage] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showReviewPane, setShowReviewPane] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  // Multi-CLI provider support
  const { provider, providerInfo, providers, features, selectProvider } = useProvider("claude");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8765");
  const [reviewTab, setReviewTab] = useState<"staged" | "unstaged" | "all">("all");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>("session-1");
  const [showSkillsBrowser, setShowSkillsBrowser] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  // Mock sessions data for now - will be replaced with real data from useDashboard
  const [sessions] = useState<Session[]>([
    { id: "session-1", name: "Auth Refactor", type: "local", status: "active", branch: "feature/auth", messageCount: 15, lastActivity: new Date().toISOString() },
    { id: "session-2", name: "Add OAuth", type: "worktree", status: "idle", branch: "feature/oauth", messageCount: 8, lastActivity: new Date(Date.now() - 3600000).toISOString() },
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
    disconnect,
    sendMessage,
    cancelOperation,
    // Git operations
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
    // Terminal operations
    terminal,
    spawnTerminal,
    terminalInput,
    terminalResize,
    closeTerminal,
    clearTerminalOutput,
    // Automation operations
    automations,
    runAutomation,
    stopAutomation,
    // Inbox operations
    inbox,
    acceptInboxItem,
    dismissInboxItem,
    markInboxRead,
  } = useDashboard();

  // Filter files based on active tab
  const getFilteredFiles = () => {
    if (!gitStatus) return { staged: [], unstaged: [] };

    switch (reviewTab) {
      case "staged":
        return { staged: gitStatus.staged, unstaged: [] };
      case "unstaged":
        return { staged: [], unstaged: gitStatus.unstaged };
      default:
        return { staged: gitStatus.staged, unstaged: gitStatus.unstaged };
    }
  };

  const filteredFiles = getFilteredFiles();
  const hasChanges = (gitStatus?.staged.length || 0) + (gitStatus?.unstaged.length || 0) > 0;
  const hasStagedChanges = (gitStatus?.staged.length || 0) > 0;

  // Handle file selection to show diff
  const handleFileSelect = (file: FileChange, isStaged: boolean) => {
    if (selectedFile === file.path) {
      // Toggle off if already selected
      clearDiff();
      setShowDiffViewer(false);
    } else {
      requestDiff(file.path, isStaged);
      setShowDiffViewer(true);
    }
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcut: Cmd/Ctrl+J to toggle terminal
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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 bg-gradient-to-r from-background via-background to-card">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-muted rounded-lg lg:hidden transition-colors"
          >
            {showSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Image src="/banner.png" alt="AgileFlow" width={140} height={32} className="h-8 w-auto" priority />
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-muted-foreground">/</span>
            <select className="bg-transparent border-none px-1 py-1 text-sm font-medium focus:outline-none cursor-pointer hover:text-primary transition-colors">
              <option>my-project</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card/50 rounded-full border border-border">
            <span className={`h-2 w-2 rounded-full ${
              connectionStatus === "connected" ? "bg-green-500 animate-pulse" :
              connectionStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
              connectionStatus === "error" ? "bg-red-500" :
              "bg-muted-foreground"
            }`} />
            <span className="text-xs font-medium hidden sm:inline">
              {connectionStatus === "connected" ? "Connected" :
               connectionStatus === "connecting" ? "Connecting..." :
               connectionStatus === "error" ? "Error" : "Offline"}
            </span>
          </div>
          <button
            onClick={() => setShowReviewPane(!showReviewPane)}
            className="p-2 hover:bg-muted rounded-lg lg:hidden transition-colors"
          >
            {showReviewPane ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors relative"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {(showSidebar || showReviewPane) && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => { setShowSidebar(false); setShowReviewPane(false); }}
          />
        )}

        {/* Sessions Sidebar */}
        <aside className={`
          flex w-64 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm
          fixed lg:static inset-y-0 left-0 z-30 top-14
          transform transition-transform duration-300 ease-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Sessions */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
              </div>
              <SessionsList
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelect={setActiveSessionId}
                onCreate={() => {
                  addNotification("info", "Coming Soon", "Session creation will be available in a future update");
                }}
                onDelete={() => {
                  addNotification("info", "Coming Soon", "Session deletion will be available in a future update");
                }}
                onRename={(id, newName) => {
                  addNotification("success", "Session Renamed", `Session renamed to "${newName}"`);
                }}
              />
            </div>

            {/* Automations */}
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Automations</span>
                {automations.filter(a => a.status === "running").length > 0 && (
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold animate-pulse">
                    {automations.filter(a => a.status === "running").length} running
                  </span>
                )}
              </div>
              <AutomationsList
                automations={automations}
                onRun={runAutomation}
                onStop={stopAutomation}
              />
            </div>

            {/* Inbox */}
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inbox</span>
                {inbox.filter(i => i.status === "unread").length > 0 && (
                  <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
                    {inbox.filter(i => i.status === "unread").length}
                  </span>
                )}
              </div>
              <InboxList
                items={inbox}
                onAccept={acceptInboxItem}
                onDismiss={dismissInboxItem}
                onMarkRead={markInboxRead}
              />
            </div>
          </div>

          {/* Provider Selector with Capabilities */}
          <div className="border-t border-border p-4">
            <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</div>
            <div className="relative">
              <button
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className="w-full flex items-center justify-between gap-2 bg-card border border-border px-3 py-2.5 text-sm rounded-lg hover:border-primary/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{providerInfo.icon}</span>
                  <span className="font-medium">{providerInfo.name}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showProviderMenu ? 'rotate-180' : ''}`} />
              </button>

              {showProviderMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { selectProvider(p.id as IRSource); setShowProviderMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors ${
                        provider === p.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span className="text-lg">{p.icon}</span>
                      <span className="font-medium">{p.name}</span>
                      {provider === p.id && (
                        <span className="ml-auto text-primary">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Capability-based feature indicators */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {features.canSpawnAgents && (
                <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full" title="Can spawn sub-agents">
                  <AgentIcon className="h-2.5 w-2.5" />
                  Agents
                </span>
              )}
              {features.canForkThread && (
                <span className="flex items-center gap-1 text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full" title="Can fork threads">
                  <Copy className="h-2.5 w-2.5" />
                  Fork
                </span>
              )}
              {features.canRollbackThread && (
                <span className="flex items-center gap-1 text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full" title="Can rollback changes">
                  <RotateCcw className="h-2.5 w-2.5" />
                  Rollback
                </span>
              )}
              {features.hasVision && (
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full" title="Vision support">
                  Vision
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Chat Panel */}
        <main className="flex flex-1 flex-col min-w-0 bg-gradient-to-b from-background to-card/20">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {connectionStatus !== "connected" ? (
              /* Welcome State */
              <div className="flex h-full flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                  <div className="relative bg-gradient-to-br from-card to-muted p-6 rounded-2xl border border-border">
                    <Bot className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Welcome to AgileFlow
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-6 leading-relaxed">
                  Connect to your CLI to start building. Run{" "}
                  <code className="bg-muted px-2 py-0.5 text-xs sm:text-sm rounded-md font-mono text-primary">
                    agileflow serve
                  </code>{" "}
                  in your project directory.
                </p>

                {/* URL input */}
                <div className="w-full max-w-sm mb-4">
                  <label className="text-xs text-muted-foreground block mb-1.5 text-left">WebSocket URL</label>
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="ws://localhost:8765"
                    className="w-full bg-card border border-border px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-sm mb-4">{error}</div>
                )}

                <button
                  onClick={handleConnect}
                  disabled={connectionStatus === "connecting"}
                  className="bg-primary text-primary-foreground px-6 py-3 hover:opacity-90 text-sm sm:text-base rounded-lg font-medium transition-all hover:scale-105 shadow-lg shadow-primary/25 flex items-center gap-2 disabled:opacity-50"
                >
                  {connectionStatus === "connecting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Connect to CLI
                    </>
                  )}
                </button>
              </div>
            ) : messages.length === 0 ? (
              /* Empty state when connected */
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full animate-pulse" />
                  <div className="relative bg-gradient-to-br from-card to-muted p-5 rounded-2xl border border-border">
                    <MessageSquare className="h-10 w-10 text-primary/60" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">Ready to chat</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Start a conversation or use one of the suggestions below to get started.
                </p>
              </div>
            ) : (
              /* Message list */
              <div className="space-y-4 max-w-3xl mx-auto">
                {/* Connection error banner at top of messages */}
                {connectionStatus !== "connected" && (
                  <ConnectionStatusBar
                    status={connectionStatus}
                    error={error}
                    onConnect={handleConnect}
                  />
                )}

                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Thinking indicator */}
                {isThinking && !messages.some(m => m.isStreaming) && (
                  <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-3 bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Suggestion Pills */}
          {connectionStatus === "connected" && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setMessage(suggestion.prompt)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-card hover:bg-muted border border-border rounded-full text-xs sm:text-sm transition-all hover:border-primary/50 group"
                  >
                    <suggestion.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span>{suggestion.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pending Image Preview */}
          {pendingImage && (
            <div className="px-4 pb-2">
              <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
                <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${pendingImage.mimeType};base64,${pendingImage.base64}`}
                    alt={pendingImage.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pendingImage.name}</p>
                  <p className="text-xs text-muted-foreground">Image attached - will be sent with your message</p>
                </div>
                <button
                  onClick={() => setPendingImage(null)}
                  className="p-1.5 hover:bg-red-500/20 rounded text-red-500 transition-colors"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 sm:p-4 bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 max-w-3xl mx-auto">
              {/* Skills browser toggle */}
              <button
                onClick={() => setShowSkillsBrowser(!showSkillsBrowser)}
                className={`p-2 rounded-lg transition-colors ${
                  showSkillsBrowser ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"
                }`}
                disabled={connectionStatus !== "connected"}
                title="Browse skills"
              >
                <Wand2 className="h-5 w-5" />
              </button>

              {/* Image upload */}
              <ImageUpload
                onImageSelect={(img) => setPendingImage(img)}
                disabled={connectionStatus !== "connected"}
              />

              {/* Voice dictation */}
              <VoiceDictation
                onTranscript={(text) => setMessage((prev) => prev + text)}
                disabled={connectionStatus !== "connected"}
              />

              <div className="flex-1 relative">
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything or type a command..."
                  className="w-full bg-background border border-border pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary rounded-xl transition-all"
                  disabled={connectionStatus !== "connected"}
                />
              </div>
              {isThinking ? (
                <button
                  onClick={cancelOperation}
                  className="bg-red-500 text-white p-3 hover:opacity-90 rounded-xl transition-all"
                  title="Cancel"
                >
                  <StopCircle className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  className="bg-primary text-primary-foreground p-3 hover:opacity-90 disabled:opacity-50 rounded-xl transition-all hover:scale-105 shadow-lg shadow-primary/25"
                  disabled={connectionStatus !== "connected" || (!message.trim() && !pendingImage)}
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Skills Browser Panel */}
            {showSkillsBrowser && (
              <div className="max-w-3xl mx-auto mt-3 p-3 bg-card border border-border rounded-xl animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skills</span>
                  <button
                    onClick={() => setShowSkillsBrowser(false)}
                    className="p-1 hover:bg-muted rounded transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <SkillsBrowser
                  onSelectSkill={(command) => {
                    setMessage(command + " ");
                    setShowSkillsBrowser(false);
                  }}
                />
              </div>
            )}
          </div>
        </main>

        {/* Review Pane */}
        <aside className={`
          flex w-72 sm:w-80 flex-col border-l border-border bg-card/30 backdrop-blur-sm
          fixed lg:static inset-y-0 right-0 z-30 top-14
          transform transition-transform duration-300 ease-out
          ${showReviewPane ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          ${showDiffViewer && currentDiff ? 'lg:w-[500px]' : ''}
        `}>
          {/* Show Diff Viewer when a file is selected */}
          {showDiffViewer && currentDiff ? (
            <DiffViewer
              diff={currentDiff}
              onStage={() => stageFile(currentDiff.path)}
              onUnstage={() => unstageFile(currentDiff.path)}
              onRevert={() => revertFile(currentDiff.path)}
              onClose={() => {
                clearDiff();
                setShowDiffViewer(false);
              }}
            />
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border">
                {(['staged', 'unstaged', 'all'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setReviewTab(tab)}
                    className={`flex-1 px-4 py-3 text-xs sm:text-sm font-semibold transition-colors ${
                      reviewTab === tab
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab === 'staged' ? 'Staged' : tab === 'unstaged' ? 'Unstaged' : 'All'}
                    {tab === 'staged' && gitStatus && gitStatus.staged.length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
                        {gitStatus.staged.length}
                      </span>
                    )}
                    {tab === 'unstaged' && gitStatus && gitStatus.unstaged.length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                        {gitStatus.unstaged.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Stage All / Unstage All actions */}
              {hasChanges && (
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {reviewTab === 'all' ? 'All Changes' : reviewTab === 'staged' ? 'Staged Changes' : 'Unstaged Changes'}
                  </span>
                  <div className="flex items-center gap-1">
                    {(reviewTab === 'all' || reviewTab === 'unstaged') && gitStatus && gitStatus.unstaged.length > 0 && (
                      <button
                        onClick={stageAll}
                        className="px-2 py-1 text-[10px] text-green-500 hover:bg-green-500/10 rounded transition-colors flex items-center gap-1"
                        title="Stage all"
                      >
                        <Plus className="h-3 w-3" />
                        Stage All
                      </button>
                    )}
                    {(reviewTab === 'all' || reviewTab === 'staged') && gitStatus && gitStatus.staged.length > 0 && (
                      <button
                        onClick={unstageAll}
                        className="px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted rounded transition-colors flex items-center gap-1"
                        title="Unstage all"
                      >
                        <Minus className="h-3 w-3" />
                        Unstage All
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Changes */}
              <div className="flex-1 overflow-y-auto p-3">
                {connectionStatus === "connecting" ? (
                  <GitStatusSkeleton />
                ) : hasChanges ? (
                  <div className="space-y-1.5">
                    {/* Staged files */}
                    {filteredFiles.staged.length > 0 && (
                      <>
                        {reviewTab === 'all' && (
                          <div className="mb-2 mt-1">
                            <span className="text-[10px] uppercase text-green-500 font-semibold tracking-wide">
                              Staged ({filteredFiles.staged.length})
                            </span>
                          </div>
                        )}
                        {filteredFiles.staged.map((file, i) => (
                          <FileChangeRow
                            key={`staged-${i}`}
                            file={file}
                            isSelected={selectedFile === file.path}
                            isLoading={diffLoading && selectedFile === file.path}
                            isStaged={true}
                            onSelect={() => handleFileSelect(file, true)}
                            onUnstage={() => unstageFile(file.path)}
                          />
                        ))}
                      </>
                    )}

                    {/* Unstaged files */}
                    {filteredFiles.unstaged.length > 0 && (
                      <>
                        {reviewTab === 'all' && filteredFiles.staged.length > 0 && (
                          <div className="mb-2 mt-4">
                            <span className="text-[10px] uppercase text-yellow-500 font-semibold tracking-wide">
                              Unstaged ({filteredFiles.unstaged.length})
                            </span>
                          </div>
                        )}
                        {reviewTab === 'all' && filteredFiles.staged.length === 0 && (
                          <div className="mb-2 mt-1">
                            <span className="text-[10px] uppercase text-yellow-500 font-semibold tracking-wide">
                              Unstaged ({filteredFiles.unstaged.length})
                            </span>
                          </div>
                        )}
                        {filteredFiles.unstaged.map((file, i) => (
                          <FileChangeRow
                            key={`unstaged-${i}`}
                            file={file}
                            isSelected={selectedFile === file.path}
                            isLoading={diffLoading && selectedFile === file.path}
                            isStaged={false}
                            onSelect={() => handleFileSelect(file, false)}
                            onStage={() => stageFile(file.path)}
                            onRevert={() => revertFile(file.path)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-12">
                    <div className="bg-muted/30 rounded-full p-4 w-fit mx-auto mb-3">
                      <GitBranch className="h-8 w-8 opacity-30" />
                    </div>
                    <p className="font-medium">No changes detected</p>
                    <p className="text-xs mt-1 text-muted-foreground/70">Changes will appear here as you work</p>
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="border-t border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tasks</span>
                  {tasks.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {tasks.filter(t => t.status === 'completed').length}/{tasks.length}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {connectionStatus === "connecting" ? (
                    <TaskPanelSkeleton />
                  ) : tasks.length > 0 ? (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 text-sm p-2.5 rounded-lg transition-all ${
                          task.status === 'completed' ? 'bg-green-500/10 border border-green-500/20' :
                          task.status === 'in_progress' ? 'bg-primary/10 border border-primary/20 shadow-sm' :
                          'hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <span className={`h-5 w-5 flex items-center justify-center text-xs rounded-md flex-shrink-0 ${
                          task.status === 'completed' ? 'bg-green-500 text-white' :
                          task.status === 'in_progress' ? 'border-2 border-primary bg-primary/20' :
                          'border-2 border-muted-foreground/30'
                        }`}>
                          {task.status === 'completed' && '✓'}
                          {task.status === 'in_progress' && (
                            <Loader2 className="h-3 w-3 text-primary animate-spin" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`block truncate ${
                            task.status === 'completed' ? 'text-muted-foreground line-through' : 'font-medium'
                          }`}>
                            {task.subject}
                          </span>
                          {task.status === 'in_progress' && task.activeForm && (
                            <span className="text-[10px] text-primary/70">{task.activeForm}</span>
                          )}
                        </div>
                        {task.status === 'in_progress' && (
                          <Sparkles className="h-3 w-3 text-primary flex-shrink-0 animate-pulse" />
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <div className="bg-muted/30 rounded-full p-3 w-fit mx-auto mb-2">
                        <Sparkles className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground">No active tasks</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Tasks will appear as Claude works</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Story Info */}
              <div className="border-t border-border p-4">
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Story</span>
                    <span className="font-mono font-semibold">US-0042</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-yellow-500 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 bg-yellow-500 rounded-full animate-pulse" />
                      in_progress
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="font-semibold">AG-UI</span>
                  </div>
                  {gitStatus?.branch && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Branch</span>
                      <span className="font-mono font-semibold">{gitStatus.branch}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Commit Button */}
              <div className="p-4">
                <button
                  onClick={() => setShowCommitDialog(true)}
                  disabled={!hasStagedChanges}
                  className="w-full bg-primary text-primary-foreground py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
                >
                  <GitCommit className="h-4 w-4" />
                  Commit Changes...
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Commit Dialog */}
      <CommitDialog
        isOpen={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onCommit={(msg, opts) => {
          commit(msg, opts);
          setShowCommitDialog(false);
        }}
        stagedFiles={gitStatus?.staged || []}
      />

      {/* Integrated Terminal Panel */}
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

      {/* Notification Settings Modal */}
      <NotificationSettings
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />

      {/* Bottom Bar */}
      <footer className="flex h-9 items-center justify-between border-t border-border px-4 text-xs text-muted-foreground bg-card/30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`flex items-center gap-1.5 hover:text-foreground transition-colors ${showTerminal ? 'text-primary' : ''}`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-medium">Terminal</span>
          </button>
          {connectionStatus === "connected" && (
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 hover:text-red-500 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline font-medium">Disconnect</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Folder className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-mono">~/projects/my-app</span>
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            <GitBranch className="h-3.5 w-3.5" />
            {gitStatus?.branch || 'main'}
          </span>
        </div>
      </footer>
    </div>
  );
}
