"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Notification, NotificationLevel } from "./NotificationProvider";

interface NotificationToastProps {
  notification: Notification;
  onDismiss: () => void;
}

function getIcon(level: NotificationLevel) {
  switch (level) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getBorderColor(level: NotificationLevel) {
  switch (level) {
    case "success":
      return "border-l-green-500";
    case "error":
      return "border-l-red-500";
    case "warning":
      return "border-l-yellow-500";
    default:
      return "border-l-blue-500";
  }
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200); // Wait for exit animation
  };

  return (
    <div
      className={`
        pointer-events-auto
        w-80 bg-card border border-border rounded-lg shadow-lg
        border-l-4 ${getBorderColor(notification.level)}
        transform transition-all duration-200 ease-out
        ${isVisible && !isExiting ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}
      `}
      role="alert"
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5">
            {getIcon(notification.level)}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {notification.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {notification.message}
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 hover:bg-muted rounded transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Progress bar for auto-dismiss */}
        {notification.duration && notification.duration > 0 && (
          <div className="mt-2 h-0.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full bg-current ${
                notification.level === "success" ? "text-green-500" :
                notification.level === "error" ? "text-red-500" :
                notification.level === "warning" ? "text-yellow-500" :
                "text-blue-500"
              }`}
              style={{
                animation: `shrink ${notification.duration}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
