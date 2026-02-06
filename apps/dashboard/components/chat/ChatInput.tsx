"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  ArrowUp,
  StopCircle,
  FileCode,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "./ImageUpload";
import { VoiceDictation } from "./VoiceDictation";

interface ProviderInfo {
  name: string;
  icon: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isThinking: boolean;
  disabled?: boolean;
  providerInfo: ProviderInfo;
  pendingImage: { base64: string; mimeType: string; name: string } | null;
  onImageSelect: (img: { base64: string; mimeType: string; name: string }) => void;
  onImageClear: () => void;
  onVoiceTranscript: (text: string) => void;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onCancel,
  isThinking,
  disabled,
  providerInfo,
  pendingImage,
  onImageSelect,
  onImageClear,
  onVoiceTranscript,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() || pendingImage) {
          onSend();
        }
      }
    },
    [value, pendingImage, onSend]
  );

  const canSend = (value.trim() || pendingImage) && !disabled;

  return (
    <div className="md:relative fixed bottom-10 md:bottom-auto left-0 right-0 z-20 p-3 bg-background">
      <div className="max-w-3xl mx-auto">
        {/* Pending image preview */}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-xs">
            <FileCode className="h-3 w-3 flex-shrink-0" />
            <span className="flex-1 truncate">{pendingImage.name}</span>
            <button
              onClick={onImageClear}
              className="p-0.5 hover:bg-background rounded transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Main input container */}
        <div className="relative flex flex-col rounded-2xl border border-border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message or /command..."
            rows={1}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[200px]"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center gap-1 px-2 pb-2">
            {/* Attach button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Attach</span>
              </Button>

              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-50 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-lg p-1">
                    <ImageUpload
                      onImageSelect={(img) => {
                        onImageSelect(img);
                        setShowAttachMenu(false);
                      }}
                      disabled={disabled}
                    />
                    <VoiceDictation
                      onTranscript={(text) => {
                        onVoiceTranscript(text);
                        setShowAttachMenu(false);
                      }}
                      disabled={disabled}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Provider badge */}
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground select-none">
              <span>{providerInfo.icon}</span>
              <span>{providerInfo.name}</span>
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Send / Stop button */}
            {isThinking ? (
              <Button
                variant="destructive"
                size="icon-sm"
                className="h-8 w-8 rounded-full"
                onClick={onCancel}
              >
                <StopCircle className="h-4 w-4" />
                <span className="sr-only">Stop</span>
              </Button>
            ) : (
              <Button
                size="icon-sm"
                className="h-8 w-8 rounded-full"
                onClick={onSend}
                disabled={!canSend}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
