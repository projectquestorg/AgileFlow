"use client";

import { Bell, BellOff, Volume2, VolumeX, Check } from "lucide-react";
import { useNotifications, NotificationMode } from "./NotificationProvider";

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const modeOptions: { value: NotificationMode; label: string; description: string }[] = [
  {
    value: "always",
    label: "Always",
    description: "Show notifications even when focused",
  },
  {
    value: "background",
    label: "Background only",
    description: "Only when tab is not focused",
  },
  {
    value: "never",
    label: "Never",
    description: "Disable browser notifications",
  },
];

export function NotificationSettings({ isOpen, onClose }: NotificationSettingsProps) {
  const {
    settings,
    updateSettings,
    hasPermission,
    requestPermission,
  } = useNotifications();

  if (!isOpen) return null;

  const handleModeChange = async (mode: NotificationMode) => {
    if (mode !== "never" && !hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        // Permission denied, revert to never
        updateSettings({ mode: "never" });
        return;
      }
    }
    updateSettings({ mode });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Notification Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Permission status */}
          {!hasPermission && settings.mode !== "never" && (
            <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <BellOff className="h-4 w-4 text-yellow-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-500">
                  Notifications blocked
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable browser notifications for this site
                </p>
              </div>
              <button
                onClick={requestPermission}
                className="px-3 py-1.5 text-xs font-medium bg-yellow-500 text-yellow-950 rounded-md hover:opacity-90 transition-opacity"
              >
                Enable
              </button>
            </div>
          )}

          {/* Notification mode */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Browser Notifications
            </label>
            <div className="mt-2 space-y-2">
              {modeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleModeChange(option.value)}
                  className={`w-full flex items-center gap-3 p-3 text-left rounded-lg border transition-all ${
                    settings.mode === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    settings.mode === option.value
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`}>
                    {settings.mode === option.value && (
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Sound toggle */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sound
            </label>
            <button
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              className={`w-full mt-2 flex items-center gap-3 p-3 text-left rounded-lg border transition-all ${
                settings.soundEnabled
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {settings.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {settings.soundEnabled ? "Sound enabled" : "Sound disabled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Play sound with notifications
                </p>
              </div>
              <div className={`h-6 w-11 rounded-full transition-colors ${
                settings.soundEnabled ? "bg-primary" : "bg-muted"
              }`}>
                <div className={`h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${
                  settings.soundEnabled ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </div>
            </button>
          </div>

          {/* Notification types */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Notify me when
            </label>
            <div className="mt-2 space-y-2">
              {[
                { key: "taskComplete" as const, label: "Task completes", desc: "Background task finished" },
                { key: "automationComplete" as const, label: "Automation completes", desc: "Scheduled automation finished" },
                { key: "approvalNeeded" as const, label: "Approval needed", desc: "PR ready for review" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => updateSettings({ [item.key]: !settings[item.key] })}
                  className={`w-full flex items-center gap-3 p-3 text-left rounded-lg border transition-all ${
                    settings[item.key]
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                    settings[item.key]
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`}>
                    {settings[item.key] && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
