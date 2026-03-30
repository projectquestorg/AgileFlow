'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { trackEvent } from '@/lib/analytics';

type Variant = 'primary' | 'secondary' | 'ghost';

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-ink text-white hover:bg-black/90 shadow-hairline border border-black/5',
  secondary:
    'bg-white text-ink hover:bg-black/[0.03] border border-border shadow-hairline',
  ghost: 'bg-transparent text-ink hover:bg-black/[0.03] border border-transparent',
};

export function Button({
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  children,
  target,
  rel,
  eventName,
  eventProps,
}: {
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
  eventName?: string;
  eventProps?: Record<string, unknown>;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium tracking-tightish transition duration-200 ease-quiet focus-ring';
  const sizeStyles = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';
  const cls = cn(base, sizeStyles, variantStyles[variant], className);

  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        target={target}
        rel={rel}
        onClick={() => {
          if (eventName) void trackEvent(eventName, eventProps);
          onClick?.();
        }}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (eventName) void trackEvent(eventName, eventProps);
        onClick?.();
      }}
      className={cls}
    >
      {children}
    </button>
  );
}
