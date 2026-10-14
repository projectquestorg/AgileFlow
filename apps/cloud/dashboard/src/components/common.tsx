import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckIcon, CopyIcon, RotateCwIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError, type ApiWarning } from '@/lib/api';
import { fmtTime, relTime } from '@/lib/constants';
import { isRetryable, type Action, type LoadState } from '@/lib/hooks';
import { useApp } from '@/lib/app-context';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

// ------------------------------------------------------------------ badges

type Tone = 'strong' | 'solid' | 'warn' | 'dashed' | 'plain';

/** Status badges are achromatic: they differ by fill, outline, weight and label. */
const STATUS_TONE: Record<string, Tone> = {
  done: 'strong', applied: 'strong', accepted: 'strong', completed: 'strong', approved: 'strong', committed: 'strong',
  'in-progress': 'solid', 'in-review': 'solid', running: 'solid', applying: 'solid', active: 'solid', planning: 'solid', 'awaiting-review': 'solid', ready: 'solid',
  blocked: 'warn', failed: 'warn', rejected: 'warn', conflict: 'warn',
  cancelled: 'dashed', superseded: 'dashed', revoked: 'dashed', unsupported: 'dashed', unknown: 'dashed', expired: 'dashed', archived: 'dashed',
};

export function Chip({ children, tone = 'plain', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  const variant = tone === 'strong' ? 'default' : tone === 'solid' ? 'secondary' : 'outline';
  return (
    <Badge
      title={title}
      variant={variant}
      className={cn(tone === 'dashed' && 'border-dashed text-muted-foreground', tone === 'warn' && 'border-foreground/60 font-semibold uppercase tracking-wide', className)}
    >
      {children}
    </Badge>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status || 'unknown';
  return <Chip tone={STATUS_TONE[s] ?? 'plain'}>{s}</Chip>;
}

export function TimeAgo({ iso }: { iso?: string | null }) {
  if (!iso) return <span className="text-muted-foreground">never</span>;
  return (
    <time dateTime={iso} title={fmtTime(iso)}>
      {relTime(iso)}
    </time>
  );
}

// ------------------------------------------------------------------ states

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-8 flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-8 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function StateBox({ title, message, children }: { title: string; message?: ReactNode; children?: ReactNode }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {message ? <EmptyDescription>{message}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent className="flex-row flex-wrap justify-center">{children}</EmptyContent> : null}
    </Empty>
  );
}

export function Notice({ title, children, action, role }: { title?: ReactNode; children?: ReactNode; action?: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <Alert role={role}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}

/** Map an API error to the right designed state. */
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const retryBtn = retry ? (
    <Button variant="outline" onClick={retry}>
      <RotateCwIcon data-icon="inline-start" />
      Retry
    </Button>
  ) : null;
  if (!(error instanceof ApiError)) return <StateBox title="Something went wrong" message={String((error as Error)?.message ?? error)}>{retryBtn}</StateBox>;
  switch (error.code) {
    case 'FORBIDDEN':
    case 'SCOPE_REQUIRED':
      return <StateBox title="Permission denied" message={`${error.message} Ask a workspace administrator if you need access.`} />;
    case 'NOT_FOUND':
      return (
        <StateBox title="Not found" message={error.message}>
          <Button variant="outline" render={<Link to="/" />} nativeButton={false}>
            Back to projects
          </Button>
        </StateBox>
      );
    case 'VERSION_CONFLICT':
      return <StateBox title="Changed elsewhere" message={error.message}>{retryBtn}</StateBox>;
    case 'UNAUTHENTICATED':
      return (
        <StateBox title="Signed out" message="Your session expired. Sign in again to continue.">
          <Button render={<Link to="/signin" />} nativeButton={false}>
            Sign in
          </Button>
        </StateBox>
      );
    default:
      return <StateBox title={error.code === 'NETWORK' ? 'Offline' : 'Could not load'} message={error.message}>{retryBtn}</StateBox>;
  }
}

/** Render loading / error / data for a `useLoad` state. */
export function Loaded<T>({ state, children, label }: { state: LoadState<T>; children: (data: T) => ReactNode; label?: string }) {
  if (state.data === undefined && state.error) return <ErrorState error={state.error} retry={state.reload} />;
  if (state.data === undefined) return <Loading label={label} />;
  return (
    <>
      {state.error ? (
        <div className="mb-4">
          <Notice title="Could not refresh" role="alert" action={<Button size="sm" variant="outline" onClick={state.reload}>Retry</Button>}>
            {(state.error as Error).message} Showing the last loaded data.
          </Notice>
        </div>
      ) : null}
      {children(state.data)}
    </>
  );
}

export function WarningsList({ warnings }: { warnings?: ApiWarning[] | null }) {
  if (!warnings?.length) return null;
  return (
    <Alert role="status">
      <AlertTitle>Warnings</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {warnings.map((w, i) => (
            <li key={i}>
              <span className="font-mono text-xs">{w.code}</span>: {w.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Inline status for a `useAction` mutation, with an idempotent Retry (same requestId). */
export function ActionStatus({ action, onRetried, hideErrorCodes = [] }: { action: Action; onRetried?: (r: any) => void; hideErrorCodes?: string[] }) {
  if (action.status === 'idle') return null;
  if (action.status === 'pending')
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Saving...
      </div>
    );
  if (action.status === 'ok')
    return action.success || action.warnings?.length ? (
      <div className="flex flex-col gap-2">
        {action.success ? (
          <p role="status" className="text-sm text-muted-foreground">
            {action.success}
          </p>
        ) : null}
        <WarningsList warnings={action.warnings} />
      </div>
    ) : null;
  const err = action.error as ApiError;
  if (err instanceof ApiError && hideErrorCodes.includes(err.code)) return null;
  return (
    <Alert role="alert">
      <AlertTitle>{err instanceof ApiError ? err.code : 'Error'}</AlertTitle>
      <AlertDescription>{err?.message}</AlertDescription>
      {isRetryable(err) ? (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => action.retry(onRetried)}>
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

// ------------------------------------------------------------------ select

const NONE = '__none__';
export type Opt = string | readonly [string, string];

/** shadcn Select with string values; an empty-string value is supported. */
export function SimpleSelect({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  id,
  size,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly Opt[];
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const items = options.map((o) => {
    const [v, label] = typeof o === 'string' ? [o, o] : o;
    return { value: v === '' ? NONE : v, label };
  });
  return (
    <Select items={items} value={value === '' ? NONE : value} onValueChange={(v) => onChange(v === NONE || v == null ? '' : String(v))} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn('w-full min-w-28', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- markdown

const httpOnly = (url: string) => (/^https?:\/\//i.test(url) ? url : '');

/** Safe Markdown: raw HTML is not rendered, links are http(s) only, checkboxes are inert, images become links. */
export function SafeMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('md', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={httpOnly}
        components={{
          // Shift headings so document content never adds a second page-level h1.
          h1: ({ children: c }) => <h2>{c}</h2>,
          h2: ({ children: c }) => <h3>{c}</h3>,
          h3: ({ children: c }) => <h4>{c}</h4>,
          a: ({ href, children: c }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer">{c}</a> : <span>{c}</span>),
          img: ({ src, alt }) => (typeof src === 'string' && src ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || src}</a> : <span>{alt}</span>),
          input: ({ type, checked }) => (type === 'checkbox' ? <input type="checkbox" checked={!!checked} disabled readOnly /> : null),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

export function excerpt(md: string, max = 600) {
  if (md.length <= max) return md;
  const cut = md.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('\n'), max * 0.6))}\n\n...`;
}

// ---------------------------------------------------------------- copy/snippet

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const { announce } = useApp();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
          announce('Copied to clipboard');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2000);
      }}
    >
      {state === 'copied' ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy manually' : label}
    </Button>
  );
}

export function Snippet({ title, text, description }: { title: string; text: string; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <CopyButton text={text} />
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <pre tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring rounded-md bg-muted p-3 font-mono text-xs">
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** A "Load more" footer; `more` returns whether more remain. */
export function LoadMoreButton({ more, label = 'Load more', onDone }: { more: () => Promise<boolean>; label?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const again = await more();
            if (!again) {
              setDone(true);
              onDone?.();
            }
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? 'Loading...' : label}
      </Button>
      {err ? (
        <span role="alert" className="text-sm text-muted-foreground">
          {err}
        </span>
      ) : null}
    </div>
  );
}

export function WorkLink({ pid, id, children }: { pid: string; id: string; children?: ReactNode }) {
  return (
    <Link className="underline-offset-4 hover:underline" to={`/p/${encodeURIComponent(pid)}/work/${encodeURIComponent(id)}`}>
      {children ?? id}
    </Link>
  );
}

export function IdList({ pid, ids, none }: { pid: string; ids?: string[] | null; none: string }) {
  if (!ids?.length) return <span className="text-muted-foreground">{none}</span>;
  return (
    <>
      {ids.map((d, i) => (
        <span key={d}>
          {i ? ', ' : ''}
          <WorkLink pid={pid} id={d} />
        </span>
      ))}
    </>
  );
}
