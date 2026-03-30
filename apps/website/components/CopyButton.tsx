'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { trackEvent } from '@/lib/analytics';

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {}
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {}
  return false;
}

export function CopyButton({
  label,
  copiedLabel = 'Copied',
  value,
  eventName,
  variant = 'primary',
}: {
  label: string;
  copiedLabel?: string;
  value: string;
  eventName: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant={variant}
      onClick={async () => {
        const ok = await copyToClipboard(value);
        setCopied(ok);
        if (ok) setTimeout(() => setCopied(false), 1400);
        void trackEvent(eventName, { value, ok });
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}

