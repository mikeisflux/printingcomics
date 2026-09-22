/**
 * Shared admin UI: toasts, a styled confirm/prompt dialog, page headers, and
 * table loading/empty states.
 *
 * These replace the raw browser `alert()` / `confirm()` / `prompt()` calls
 * that used to be scattered through every admin page. Those block the whole
 * tab, can't be styled, and give no visual weight to "this deletes things".
 *
 * Usage:
 *   const toast = useToast();      toast.success('Saved'); toast.error(e.message);
 *   const confirm = useConfirm();  if (!(await confirm({ title: 'Delete order?', danger: true }))) return;
 *   const prompt = usePrompt();    const name = await prompt({ title: 'Zone name' }); if (name === null) return;
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type MouseEvent, type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-4), { id, kind, message }]);
    // Errors stay long enough to read; confirmations get out of the way.
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pc-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pc-toast ${t.kind}`} onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
            <span aria-hidden="true">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** One line a person can act on, from whatever an API call threw. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  const m = (err as any)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

// ---------------------------------------------------------------------------
// Confirm / prompt dialogs
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, and focus starts on Cancel so Enter can't destroy anything. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  body?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  confirmLabel?: string;
  /** Return a message to block submission, or null to allow it. */
  validate?: (value: string) => string | null;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (value: string | null) => void };

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogCtx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const api = useMemo<DialogApi>(() => ({
    confirm: (opts) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })),
    prompt: (opts) => new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })),
  }), []);

  const close = () => setPending(null);

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {pending?.kind === 'confirm' && (
        <ConfirmDialog opts={pending.opts} onDone={(ok) => { pending.resolve(ok); close(); }} />
      )}
      {pending?.kind === 'prompt' && (
        <PromptDialog opts={pending.opts} onDone={(v) => { pending.resolve(v); close(); }} />
      )}
    </DialogCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useConfirm must be used inside <DialogProvider>');
  return ctx.confirm;
}

export function usePrompt() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('usePrompt must be used inside <DialogProvider>');
  return ctx.prompt;
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onEscape(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onEscape]);
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEscape(useCallback(() => onDone(false), [onDone]));
  useEffect(() => { (opts.danger ? cancelRef : okRef).current?.focus(); }, [opts.danger]);

  return (
    <div className="pc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(false); }}>
      <div className="pc-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pc-dialog-title">
        <h3 id="pc-dialog-title" style={{ margin: '0 0 .5rem' }}>{opts.title}</h3>
        {opts.body && <div className="muted" style={{ fontSize: '.95rem', lineHeight: 1.55 }}>{opts.body}</div>}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button ref={cancelRef} type="button" className="btn secondary" onClick={() => onDone(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={okRef} type="button" className={`btn${opts.danger ? ' danger' : ''}`} onClick={() => onDone(true)}>
            {opts.confirmLabel ?? (opts.danger ? 'Delete' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptDialog({ opts, onDone }: { opts: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEscape(useCallback(() => onDone(null), [onDone]));
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const submit = () => {
    const msg = opts.validate?.(value) ?? null;
    if (msg) { setProblem(msg); return; }
    onDone(value);
  };

  return (
    <div className="pc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <form
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pc-dialog-title"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <h3 id="pc-dialog-title" style={{ margin: '0 0 .5rem' }}>{opts.title}</h3>
        {opts.body && <div className="muted" style={{ fontSize: '.95rem', lineHeight: 1.55 }}>{opts.body}</div>}
        {opts.label && <label style={{ marginTop: '.75rem' }}>{opts.label}</label>}
        {opts.multiline ? (
          <textarea
            ref={inputRef as any}
            rows={3}
            value={value}
            placeholder={opts.placeholder}
            onChange={(e) => { setValue(e.target.value); setProblem(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
        ) : (
          <input
            ref={inputRef as any}
            value={value}
            placeholder={opts.placeholder}
            onChange={(e) => { setValue(e.target.value); setProblem(null); }}
          />
        )}
        {problem && <div className="error" style={{ marginBottom: 0 }}>{problem}</div>}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn secondary" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="btn">{opts.confirmLabel ?? 'OK'}</button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function PageHeader({
  title, subtitle, back, actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div>
        {back && <Link className="back" to={back.to}>← {back.label}</Link>}
        <h1 style={{ margin: 0 }}>{title}</h1>
        {subtitle && <div className="muted" style={{ marginTop: '.25rem' }}>{subtitle}</div>}
      </div>
      {actions && <div className="row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="admin-empty">
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {body && <div style={{ marginTop: '.35rem', fontSize: '.95rem' }}>{body}</div>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}

/**
 * The first body row of a table while it loads or when it's empty. Separate
 * states, because "No orders yet" while the request is still in flight is a
 * lie that sends people looking for a bug.
 */
export function TableState({
  loading, count, colSpan, empty, error,
}: {
  loading: boolean; count: number; colSpan: number; empty: ReactNode; error?: string | null;
}) {
  if (error) {
    return <tr><td colSpan={colSpan}><div className="error" style={{ margin: 0 }}>{error}</div></td></tr>;
  }
  if (loading) {
    return <tr><td colSpan={colSpan} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>Loading…</td></tr>;
  }
  if (count === 0) {
    return <tr><td colSpan={colSpan}>{typeof empty === 'string' ? <EmptyState title={empty} /> : empty}</td></tr>;
  }
  return null;
}

/** Debounce a fast-changing value (search boxes) so we don't hit the API per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Row click → navigate, unless the click landed on something interactive inside the row. */
export function rowClick(go: () => void) {
  return (e: MouseEvent<HTMLTableRowElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, input, select, textarea, label')) return;
    go();
  };
}
