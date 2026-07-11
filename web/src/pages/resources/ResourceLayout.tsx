import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared building blocks for the long-form resource pages
 * (Templates, Make a Comic, File Prep). Keeps a single consistent look —
 * brand-red accents, generous spacing, printable-guide feel.
 */

const MAXW = 940;

export function ResourcePage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-alt, #f7f7f8)' }}>
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(180deg, #1a1a1f 0%, #2a2130 100%)',
          color: '#fff',
          padding: '3.5rem 1rem 3rem',
        }}
      >
        <div className="container" style={{ maxWidth: MAXW }}>
          {eyebrow && (
            <div
              style={{
                textTransform: 'uppercase',
                letterSpacing: '.12em',
                fontSize: '.78rem',
                fontWeight: 700,
                color: 'var(--brand-light, #dd1d26)',
                marginBottom: '.6rem',
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1 style={{ margin: 0, fontSize: '2.4rem', lineHeight: 1.1 }}>{title}</h1>
          {intro && (
            <p style={{ marginTop: '1rem', marginBottom: 0, fontSize: '1.15rem', opacity: 0.85, maxWidth: 680 }}>
              {intro}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="container" style={{ maxWidth: MAXW, padding: '2.5rem 1rem 4rem' }}>
        {children}
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: '5rem', marginBottom: '2.75rem' }}>
      <h2
        style={{
          fontSize: '1.6rem',
          margin: '0 0 1rem',
          paddingBottom: '.5rem',
          borderBottom: '3px solid var(--brand, #C61A22)',
          display: 'inline-block',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  tip:  { bg: '#eef9f0', border: '#1c9b4b', icon: '✅', label: 'Tip' },
  warn: { bg: '#fdf3e7', border: '#e08a00', icon: '⚠️', label: 'Watch out' },
  info: { bg: '#eef4fd', border: '#1e74fc', icon: 'ℹ️', label: 'Good to know' },
  note: { bg: '#f4f0f7', border: '#7a4fa3', icon: '📌', label: 'Note' },
};

export function Callout({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'tip' | 'warn' | 'info' | 'note';
  title?: string;
  children: ReactNode;
}) {
  const s = CALLOUT_STYLES[kind] ?? CALLOUT_STYLES.info!;
  return (
    <div
      style={{
        background: s.bg,
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 8,
        padding: '1rem 1.15rem',
        margin: '1.25rem 0',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>
        <span aria-hidden="true" style={{ marginRight: '.4rem' }}>{s.icon}</span>
        {title ?? s.label}
      </div>
      <div style={{ fontSize: '.95rem', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function Figure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <figure
      style={{
        margin: '1.5rem 0',
        background: '#fff',
        border: '1px solid var(--border, #e3e3e6)',
        borderRadius: 12,
        padding: '1.25rem',
        boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.06))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>{children}</div>
      {caption && (
        <figcaption style={{ marginTop: '.85rem', textAlign: 'center', fontSize: '.85rem', color: 'var(--ink-muted, #5a5a5a)' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function CardGrid({ children, min = 240 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: '1rem',
        margin: '1.25rem 0',
      }}
    >
      {children}
    </div>
  );
}

export function DownloadCard({
  title,
  meta,
  href,
  children,
  cta = 'Download PDF',
}: {
  title: string;
  meta?: string;
  href: string;
  children?: ReactNode;
  cta?: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border, #e3e3e6)',
        borderRadius: 12,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '.5rem',
        boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.06))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
        <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>📄</span>
        <div>
          <div style={{ fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
          {meta && <div style={{ fontSize: '.8rem', color: 'var(--ink-muted, #5a5a5a)' }}>{meta}</div>}
        </div>
      </div>
      {children && <div style={{ fontSize: '.88rem', color: 'var(--ink-muted, #5a5a5a)', flex: 1 }}>{children}</div>}
      <a className="btn" href={href} download style={{ marginTop: '.35rem', textAlign: 'center' }}>
        ↓ {cta}
      </a>
    </div>
  );
}

export function SpecTable({ headers, rows }: { headers?: string[]; rows: ReactNode[][] }) {
  const cell: CSSProperties = { padding: '.6rem .8rem', borderBottom: '1px solid var(--border, #e3e3e6)', textAlign: 'left', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', margin: '1.25rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border, #e3e3e6)', borderRadius: 8, fontSize: '.92rem' }}>
        {headers && (
          <thead>
            <tr style={{ background: 'var(--bg-alt, #f2f2f4)' }}>
              {headers.map((h, i) => (
                <th key={i} style={{ ...cell, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{ ...cell, fontWeight: j === 0 ? 600 : 400 }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0', display: 'grid', gap: '.55rem' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', lineHeight: 1.5 }}>
          <span aria-hidden="true" style={{ color: 'var(--brand, #C61A22)', fontWeight: 800, flexShrink: 0 }}>✓</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: '1.25rem 0', display: 'grid', gap: '1rem', counterReset: 'step' }}>
      {items.map((it, i) => (
        <li
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '.9rem',
            alignItems: 'start',
            background: '#fff',
            border: '1px solid var(--border, #e3e3e6)',
            borderRadius: 10,
            padding: '1rem 1.15rem',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--brand, #C61A22)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, flexShrink: 0,
            }}
          >
            {i + 1}
          </span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '.25rem' }}>{it.title}</div>
            <div style={{ fontSize: '.95rem', lineHeight: 1.55, color: 'var(--ink-muted, #444)' }}>{it.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A row of quick-jump / related-page links shown at the foot of a page. */
export function RelatedLinks({ links }: { links: { to: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginTop: '2rem' }}>
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="btn secondary">{l.label}</Link>
      ))}
    </div>
  );
}
