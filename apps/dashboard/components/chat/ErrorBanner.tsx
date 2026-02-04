"use client";

import { AlertCircle, RefreshCw, WifiOff, X } from "lucide-react";
import { useState } from "react";

interface ErrorBannerProps {
  type: "connection" | "error" | "warning";
  title: string;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  dismissable?: boolean;
}

export function ErrorBanner({
  type,
  title,
  message,
  onRetry,
  onDismiss,
  dismissable = true,
}: ErrorBannerProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const colors = {
    connection: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-600 dark:text-yellow-400",
      icon: WifiOff,
    },
    error: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-600 dark:text-red-400",
      icon: AlertCircle,
    },
    warning: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-600 dark:text-orange-400",
      icon: AlertCircle,
    },
  };

  const style = colors[type];
  const Icon = style.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${style.bg} ${style.border} border rounded-lg mb-4 animate-in slide-in-from-top-2 duration-300`}
    >
      <Icon className={`h-5 w-5 ${style.text} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${style.text}`}>{title}</p>
        {message && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              ${style.text} hover:bg-background/50 disabled:opacity-50`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        )}
        {dismissable && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-background/50 rounded-md transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

interface ConnectionStatusBarProps {
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string | null;
  onConnect?: () => void;
}

export function ConnectionStatusBar({
  status,
  error,
  onConnect,
}: ConnectionStatusBarProps) {
  if (status === "connected") return null;

  const configs = {
    disconnected: {
      type: "connection" as const,
      title: "Not connected",
      message: "Connect to your CLI to start chatting",
    },
    connecting: {
      type: "warning" as const,
      title: "Connecting...",
      message: "Attempting to connect to WebSocket server",
    },
    error: {
      type: "error" as const,
      title: "Connection failed",
      message: error || "Could not connect to the CLI server",
    },
  };

  const config = configs[status];

  return (
    <ErrorBanner
      type={config.type}
      title={config.title}
      message={config.message}
      onRetry={status === "error" ? onConnect : undefined}
      dismissable={false}
    />
  );
}
