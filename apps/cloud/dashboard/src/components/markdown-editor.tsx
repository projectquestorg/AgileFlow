import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PencilIcon } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useAction } from '@/lib/hooks';
import { ActionStatus, Chip, Notice, SafeMarkdown, StateBox } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface EditorDoc {
  body: string;
  version: number;
  contentHash: string;
  complete: boolean;
}

/**
 * Markdown editor with preview. Editing is only offered once the complete body
 * is loaded; saves send expectedVersion + priorContentHash; conflicts keep the draft.
 */
export function MarkdownEditor({
  label,
  doc: initial,
  canEdit,
  reload,
  save,
  onSaved,
  dirtyKey,
}: {
  label: string;
  doc: EditorDoc;
  canEdit: boolean;
  reload: () => Promise<EditorDoc>;
  save: (body: string, base: { version: number; contentHash: string }, requestId: string) => Promise<any>;
  onSaved?: (r: any) => void;
  dirtyKey: string;
}) {
  const { setDirty } = useApp();
  const [doc, setDoc] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const action = useAction();

  // Take server updates only while not editing.
  useEffect(() => {
    if (draft === null) setDoc(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.version, initial.contentHash, initial.body]);

  useEffect(() => {
    setDirty(dirtyKey, draft !== null);
    return () => setDirty(dirtyKey, false);
  }, [draft, dirtyKey, setDirty]);

  const doSave = async () => {
    if (draft === null) return;
    try {
      const r = await action.run((rid) => save(draft, { version: doc.version, contentHash: doc.contentHash }, rid), { success: 'Saved.' });
      finishSave(r);
    } catch {
      /* shown */
    }
  };
  const finishSave = (r: any) => {
    setDoc((d) => ({ ...d, body: draft ?? d.body, version: r.data.version, contentHash: r.data.contentHash ?? d.contentHash }));
    setDraft(null);
    setTheirs(null);
    toast(`${label} saved (version ${r.data.version}).`);
    onSaved?.(r);
  };

  const conflict = action.status === 'error' && action.error instanceof ApiError && action.error.code === 'VERSION_CONFLICT';

  if (draft === null) {
    return (
      <section aria-label={label} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Version {doc.version}</span>
          {canEdit ? (
            <Button variant="outline" size="sm" disabled={!doc.complete} onClick={() => { action.reset(); setDraft(doc.body); }}>
              <PencilIcon data-icon="inline-start" />
              Edit {label}
            </Button>
          ) : (
            <Chip tone="dashed">read only</Chip>
          )}
        </div>
        {!doc.complete ? <StateBox title="Loading full content" message="The editor is enabled after the complete body is loaded." /> : null}
        {doc.body.trim() ? <SafeMarkdown>{doc.body}</SafeMarkdown> : <p className="text-sm text-muted-foreground">Empty.</p>}
      </section>
    );
  }

  return (
    <section aria-label={`Editing ${label}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Editing {label}</span>
        <span className="text-sm text-muted-foreground">{draft !== doc.body ? 'Unsaved changes' : 'No changes'}</span>
      </div>
      {theirs !== null ? (
        <Notice title="Merging">
          <p>The latest saved version (version {doc.version}) is shown below. Copy what you need into your draft; saving replaces it with your draft.</p>
          <Textarea readOnly value={theirs} aria-label="Latest saved Markdown" className="mt-2 min-h-40 font-mono text-xs" />
        </Notice>
      ) : null}
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Field>
            <FieldLabel htmlFor={`${dirtyKey}-md`} className="sr-only">
              {label} Markdown
            </FieldLabel>
            <Textarea id={`${dirtyKey}-md`} value={draft} spellCheck onChange={(e) => setDraft(e.target.value)} className="min-h-80 font-mono text-sm" />
          </Field>
        </TabsContent>
        <TabsContent value="preview">
          <div className="min-h-80 rounded-lg border p-4">{draft.trim() ? <SafeMarkdown>{draft}</SafeMarkdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap gap-2">
        <Button onClick={doSave} disabled={action.pending}>
          Save
        </Button>
        <Button variant="outline" onClick={() => (draft === doc.body ? (setDraft(null), setTheirs(null)) : setConfirmDiscard(true))}>
          Cancel
        </Button>
      </div>
      {conflict ? (
        <Notice
          role="alert"
          title="Someone else saved a newer version"
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => { const d = await reload(); setDoc(d); setDraft(null); setTheirs(null); action.reset(); }}>
                Reload (discard my draft)
              </Button>
              <Button size="sm" onClick={async () => { const d = await reload(); setDoc(d); setTheirs(d.body); action.reset(); }}>
                Load latest and merge
              </Button>
            </div>
          }
        >
          {action.error?.message} Your draft is still here.
        </Notice>
      ) : (
        <ActionStatus action={action} onRetried={finishSave} />
      )}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your draft of the {label} will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDraft(null); setTheirs(null); setConfirmDiscard(false); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
