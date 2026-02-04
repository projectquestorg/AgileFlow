"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { NotificationToast } from "./NotificationToast";

export type NotificationLevel = "info" | "success" | "warning" | "error";
export type NotificationMode = "never" | "background" | "always";

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  duration?: number; // ms, 0 = persistent
}

interface NotificationSettings {
  mode: NotificationMode;
  soundEnabled: boolean;
  taskComplete: boolean;
  automationComplete: boolean;
  approvalNeeded: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  settings: NotificationSettings;
  unreadCount: number;
  addNotification: (level: NotificationLevel, title: string, message: string, options?: { duration?: number }) => void;
  dismissNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  requestPermission: () => Promise<boolean>;
  hasPermission: boolean;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const DEFAULT_SETTINGS: NotificationSettings = {
  mode: "background",
  soundEnabled: false,
  taskComplete: true,
  automationComplete: true,
  approvalNeeded: true,
};

const STORAGE_KEY = "agileflow-notification-settings";

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [hasPermission, setHasPermission] = useState(false);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {
      // Ignore parse errors
    }

    // Check browser notification permission
    if (typeof window !== "undefined" && "Notification" in window) {
      setHasPermission(Notification.permission === "granted");
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === "granted";
      setHasPermission(granted);
      return granted;
    } catch {
      return false;
    }
  }, []);

  const sendBrowserNotification = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (title: string, message: string, level: NotificationLevel) => {
      // Check if we should send browser notification
      if (settings.mode === "never") return;
      if (settings.mode === "background" && document.hasFocus()) return;
      if (!hasPermission) return;

      try {
        const notification = new Notification(title, {
          body: message,
          icon: "/favicon.ico",
          tag: `agileflow-${Date.now()}`,
          silent: !settings.soundEnabled,
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        // Focus window on click
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        // Browser notification failed, ignore
      }
    },
    [settings.mode, settings.soundEnabled, hasPermission]
  );

  const addNotification = useCallback(
    (level: NotificationLevel, title: string, message: string, options?: { duration?: number }) => {
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const duration = options?.duration ?? (level === "error" ? 0 : 5000);

      const notification: Notification = {
        id,
        level,
        title,
        message,
        timestamp: new Date(),
        read: false,
        duration,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep max 50

      // Send browser notification
      sendBrowserNotification(title, message, level);

      // Auto-dismiss after duration (if not persistent)
      if (duration > 0) {
        const timeout = setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== id));
          timeoutsRef.current.delete(id);
        }, duration);
        timeoutsRef.current.set(id, timeout);
      }
    },
    [sendBrowserNotification]
  );

  const dismissNotification = useCallback((id: string) => {
    // Clear auto-dismiss timeout
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    // Clear all auto-dismiss timeouts
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();
    setNotifications([]);
  }, []);

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        settings,
        unreadCount,
        addNotification,
        dismissNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        updateSettings,
        requestPermission,
        hasPermission,
      }}
    >
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {notifications.slice(0, 5).map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={() => dismissNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
