"use client";

import { useState, useCallback, useRef } from "react";
import { Image as ImageIcon, X, Upload, Loader2 } from "lucide-react";

interface ImageUploadProps {
  onImageSelect: (imageData: { base64: string; mimeType: string; name: string }) => void;
  disabled?: boolean;
}

interface UploadedImage {
  base64: string;
  mimeType: string;
  name: string;
  preview: string;
}

export function ImageUpload({ onImageSelect, disabled }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingImage, setPendingImage] = useState<UploadedImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      return;
    }

    setIsProcessing(true);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix to get just the base64
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Create preview URL
      const preview = URL.createObjectURL(file);

      const imageData: UploadedImage = {
        base64,
        mimeType: file.type,
        name: file.name,
        preview,
      };

      setPendingImage(imageData);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith("image/"));

    if (imageFile) {
      processFile(imageFile);
    }
  }, [disabled, processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, [processFile]);

  const handleAttach = useCallback(() => {
    if (pendingImage) {
      onImageSelect({
        base64: pendingImage.base64,
        mimeType: pendingImage.mimeType,
        name: pendingImage.name,
      });
      // Revoke object URL to free memory
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }
  }, [pendingImage, onImageSelect]);

  const handleClear = useCallback(() => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }
  }, [pendingImage]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      {/* Image button / Drop zone */}
      {!pendingImage ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative transition-all
            ${isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
          `}
        >
          <button
            onClick={openFilePicker}
            disabled={disabled || isProcessing}
            className={`
              p-2 rounded-lg transition-colors
              ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"}
              ${isProcessing ? "animate-pulse" : ""}
            `}
            title="Attach image (drag & drop supported)"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg border-2 border-dashed border-primary z-10">
              <Upload className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      ) : (
        /* Preview card */
        <div className="flex items-center gap-2 px-2 py-1.5 bg-card border border-border rounded-lg">
          <div className="relative h-8 w-8 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.preview}
              alt={pendingImage.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{pendingImage.name}</p>
            <p className="text-[10px] text-muted-foreground">
              Click send to attach
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleAttach}
              className="p-1 hover:bg-green-500/20 rounded text-green-500 transition-colors"
              title="Confirm attachment"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleClear}
              className="p-1 hover:bg-red-500/20 rounded text-red-500 transition-colors"
              title="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
