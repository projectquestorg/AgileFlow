"use client";

import { useState, useCallback, useRef } from "react";
import { useWebSocket, ConnectionStatus } from "./useWebSocket";

// Message types matching dashboard-protocol.js
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: any;
  output?: any;
  error?: string;
  status: "pending" | "running" | "completed" | "error";
}

export interface Task {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface GitStatus {
  branch: string;
  staged: FileChange[];
  unstaged: FileChange[];
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
  additions?: number;
  deletions?: number;
}

export interface FileDiff {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
  staged: boolean;
}

export interface DashboardState {
  messages: Message[];
  tasks: Task[];
  gitStatus: GitStatus | null;
  isThinking: boolean;
  currentToolCall: ToolCall | null;
  currentDiff: FileDiff | null;
  diffLoading: boolean;
  selectedFile: string | null;
}

export interface DashboardHook extends DashboardState {
  connectionStatus: ConnectionStatus;
  error: string | null;
  connect: (url: string, options?: { apiKey?: string }) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  cancelOperation: () => void;
  refreshStatus: () => void;
  clearMessages: () => void;
  // Git operations
  requestDiff: (path: string, staged?: boolean) => void;
  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
  revertFile: (path: string) => void;
  stageAll: () => void;
  unstageAll: () => void;
  commit: (message: string, options?: { push?: boolean }) => void;
  clearDiff: () => void;
}

export function useDashboard(): DashboardHook {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const [currentDiff, setCurrentDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string>("ws://localhost:8765");
  const [wsApiKey, setWsApiKey] = useState<string | undefined>(undefined);

  const streamingMessageRef = useRef<string>("");
  const streamingMessageIdRef = useRef<string>("");

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case "session_state":
        // Session connected/state changed
        if (data.state === "thinking") {
          setIsThinking(true);
        } else if (data.state === "idle") {
          setIsThinking(false);
        }
        break;

      case "text":
        // Complete text message
        if (data.content) {
          const messageId = `msg_${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              role: "assistant",
              content: data.content,
              timestamp: data.timestamp || new Date().toISOString(),
            },
          ]);
        }
        if (data.done) {
          setIsThinking(false);
          streamingMessageRef.current = "";
          streamingMessageIdRef.current = "";
        }
        break;

      case "text_delta":
        // Streaming text chunk
        if (data.delta) {
          streamingMessageRef.current += data.delta;

          // Create or update streaming message
          if (!streamingMessageIdRef.current) {
            streamingMessageIdRef.current = `msg_${Date.now()}`;
            setMessages((prev) => [
              ...prev,
              {
                id: streamingMessageIdRef.current,
                role: "assistant",
                content: data.delta,
                timestamp: new Date().toISOString(),
                isStreaming: true,
              },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageIdRef.current
                  ? { ...msg, content: streamingMessageRef.current }
                  : msg
              )
            );
          }
        }

        if (data.done) {
          // Finalize streaming message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessageIdRef.current
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
          setIsThinking(false);
          streamingMessageRef.current = "";
          streamingMessageIdRef.current = "";
        }
        break;

      case "tool_start":
        // Tool call started
        const newToolCall: ToolCall = {
          id: data.id,
          tool: data.tool,
          input: data.input,
          status: "running",
        };
        setCurrentToolCall(newToolCall);

        // Add tool call to the last assistant message or create new one
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              toolCalls: [...(updated[lastIdx].toolCalls || []), newToolCall],
            };
            return updated;
          }
          return prev;
        });
        break;

      case "tool_result":
        // Tool call completed
        setCurrentToolCall(null);

        // Update tool call status in messages
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            toolCalls: msg.toolCalls?.map((tc) =>
              tc.id === data.id
                ? {
                    ...tc,
                    output: data.output,
                    error: data.error,
                    status: data.error ? "error" : "completed",
                  }
                : tc
            ),
          }))
        );
        break;

      case "task_created":
      case "task_updated":
        // Task created or updated
        if (data.task) {
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === data.task.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data.task;
              return updated;
            }
            return [...prev, data.task];
          });
        }
        break;

      case "task_list":
        // Full task list
        if (data.tasks) {
          setTasks(data.tasks);
        }
        break;

      case "git_status":
        // Git status update
        setGitStatus({
          branch: data.branch,
          staged: (data.staged || []).map((f: any) => ({
            path: f.path || f.file,
            status: f.status || "modified",
            additions: f.additions,
            deletions: f.deletions,
          })),
          unstaged: (data.unstaged || []).map((f: any) => ({
            path: f.path || f.file,
            status: f.status || "modified",
            additions: f.additions,
            deletions: f.deletions,
          })),
        });
        break;

      case "git_diff":
        // Git diff response
        setCurrentDiff({
          path: data.path,
          diff: data.diff,
          additions: data.additions || 0,
          deletions: data.deletions || 0,
          staged: data.staged || false,
        });
        setDiffLoading(false);
        break;

      case "notification":
        // TODO: Show toast notification
        console.log("[Dashboard] Notification:", data.title, data.message);
        break;

      case "error":
        console.error("[Dashboard] Error:", data.code, data.message);
        break;

      default:
        console.log("[Dashboard] Unknown message type:", data.type, data);
    }
  }, []);

  const wsUrlRef = useRef(wsUrl);
  const wsApiKeyRef = useRef(wsApiKey);

  // Keep refs in sync
  wsUrlRef.current = wsUrl;
  wsApiKeyRef.current = wsApiKey;

  const {
    status: connectionStatus,
    error,
    connect: wsConnect,
    disconnect: wsDisconnect,
    send,
    isConnected,
  } = useWebSocket({
    url: wsUrlRef.current,
    apiKey: wsApiKeyRef.current,
    onMessage: handleMessage,
  });

  const connect = useCallback(
    (url: string, options?: { apiKey?: string }) => {
      // Update refs immediately for the WebSocket hook
      wsUrlRef.current = url;
      wsApiKeyRef.current = options?.apiKey;
      setWsUrl(url);
      setWsApiKey(options?.apiKey);
      // Connect after a microtask to ensure refs are updated
      queueMicrotask(() => {
        wsConnect();
      });
    },
    [wsConnect]
  );

  const disconnect = useCallback(() => {
    wsDisconnect();
    setMessages([]);
    setTasks([]);
    setGitStatus(null);
    setIsThinking(false);
    setCurrentToolCall(null);
  }, [wsDisconnect]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!isConnected || !content.trim()) return;

      // Add user message to list
      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);

      // Send to server
      send({
        type: "message",
        content: content.trim(),
      });
    },
    [isConnected, send]
  );

  const cancelOperation = useCallback(() => {
    send({ type: "cancel" });
    setIsThinking(false);
    setCurrentToolCall(null);
  }, [send]);

  const refreshStatus = useCallback(() => {
    send({ type: "refresh", what: "status" });
    send({ type: "refresh", what: "tasks" });
  }, [send]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    streamingMessageRef.current = "";
    streamingMessageIdRef.current = "";
  }, []);

  // Git operations
  const requestDiff = useCallback(
    (path: string, staged: boolean = false) => {
      setDiffLoading(true);
      setSelectedFile(path);
      send({ type: "git_diff_request", path, staged });
    },
    [send]
  );

  const stageFile = useCallback(
    (path: string) => {
      send({ type: "git_stage", files: [path] });
    },
    [send]
  );

  const unstageFile = useCallback(
    (path: string) => {
      send({ type: "git_unstage", files: [path] });
    },
    [send]
  );

  const revertFile = useCallback(
    (path: string) => {
      send({ type: "git_revert", files: [path] });
    },
    [send]
  );

  const stageAll = useCallback(() => {
    send({ type: "git_stage", files: [] });
  }, [send]);

  const unstageAll = useCallback(() => {
    send({ type: "git_unstage", files: [] });
  }, [send]);

  const commit = useCallback(
    (message: string, options?: { push?: boolean }) => {
      send({ type: "git_commit", message, push: options?.push });
    },
    [send]
  );

  const clearDiff = useCallback(() => {
    setCurrentDiff(null);
    setSelectedFile(null);
  }, []);

  return {
    // State
    messages,
    tasks,
    gitStatus,
    isThinking,
    currentToolCall,
    currentDiff,
    diffLoading,
    selectedFile,

    // Connection
    connectionStatus,
    error,
    connect,
    disconnect,

    // Actions
    sendMessage,
    cancelOperation,
    refreshStatus,
    clearMessages,

    // Git operations
    requestDiff,
    stageFile,
    unstageFile,
    revertFile,
    stageAll,
    unstageAll,
    commit,
    clearDiff,
  };
}
