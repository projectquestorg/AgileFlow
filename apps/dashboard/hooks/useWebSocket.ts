"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface WebSocketOptions {
  url: string;
  sessionId?: string;
  apiKey?: string;
  onMessage?: (data: any) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketHook {
  status: ConnectionStatus;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: any) => void;
  isConnected: boolean;
}

export function useWebSocket(options: WebSocketOptions): WebSocketHook {
  const {
    url: initialUrl,
    sessionId: initialSessionId,
    apiKey: initialApiKey,
    onMessage,
    onStatusChange,
    reconnectAttempts = 3,
    reconnectDelay = 2000,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Store current connection params in refs for reconnection
  const urlRef = useRef(initialUrl);
  const sessionIdRef = useRef(initialSessionId);
  const apiKeyRef = useRef(initialApiKey);

  // Update refs when options change
  urlRef.current = initialUrl;
  sessionIdRef.current = initialSessionId;
  apiKeyRef.current = initialApiKey;

  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      updateStatus("connecting");
      setError(null);

      // Build URL with query params using current refs
      const wsUrl = new URL(urlRef.current);

      // Check for mixed content issue (HTTPS page trying to use ws://)
      if (typeof window !== "undefined" &&
          window.location.protocol === "https:" &&
          wsUrl.protocol === "ws:") {
        // Allow localhost connections even from HTTPS (some browsers permit this)
        const isLocalhost = wsUrl.hostname === "localhost" || wsUrl.hostname === "127.0.0.1";
        if (!isLocalhost) {
          throw new Error("Cannot connect to insecure WebSocket (ws://) from HTTPS page. Use wss:// or run dashboard locally.");
        }
        // Warn about potential mixed content for localhost
        console.warn("[WebSocket] Mixed content warning: connecting to ws:// from https://. Some browsers may block this.");
      }
      if (sessionIdRef.current) wsUrl.searchParams.set("sessionId", sessionIdRef.current);
      if (apiKeyRef.current) wsUrl.searchParams.set("apiKey", apiKeyRef.current);

      const ws = new WebSocket(wsUrl.toString());

      ws.onopen = () => {
        console.log("[WebSocket] Connected to", urlRef.current);
        reconnectCountRef.current = 0;
        updateStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch (err) {
          console.error("[WebSocket] Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        console.error("[WebSocket] Error:", event);
        // Provide helpful error messages
        const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
        const isInsecureWs = wsUrl.protocol === "ws:";
        if (isHttps && isInsecureWs) {
          setError("Mixed content blocked: HTTPS page cannot connect to ws://. Run 'npm run dev' locally or use 'agileflow serve --tunnel' for wss://");
        } else {
          setError("Connection failed. Is 'agileflow serve' running?");
        }
        updateStatus("error");
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Closed:", event.code, event.reason);

        if (event.code !== 1000 && reconnectCountRef.current < reconnectAttempts) {
          // Attempt reconnect
          reconnectCountRef.current++;
          console.log(
            `[WebSocket] Reconnecting (${reconnectCountRef.current}/${reconnectAttempts})...`
          );
          updateStatus("connecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          updateStatus("disconnected");
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("[WebSocket] Connection failed:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      updateStatus("error");
    }
  }, [onMessage, updateStatus, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnect");
      wsRef.current = null;
    }

    reconnectCountRef.current = 0;
    updateStatus("disconnected");
  }, [updateStatus]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("[WebSocket] Cannot send - not connected");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    connect,
    disconnect,
    send,
    isConnected: status === "connected",
  };
}
