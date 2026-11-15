/**
 * /resources/file-check — drop a PDF, pick the format and which file it is,
 * and get the same checklist our uploads are held to: a green tick or a red
 * cross per rule, with what to fix. The file is checked on our server and
 * deleted the moment the check finishes; nothing is stored.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResourcePage, Section, Callout, RelatedLinks } from './ResourceLayout';
import { useSeo } from '../../lib/seo';
import { api } from '../../api/client';
import { formatFileSize, uploadWithProgress } from '../../lib/print-files';

interface Format { key: string; label: string; trimW: number; trimH: number; pageW: number; pageH: number; templateUrl: string | null }
interface Check { id: string; label: string; status: 'pass' | 'fail' | 'info'; detail: string; reason?: string }
interface Result {
  report: { ok: boolean; headline: string; pages: number | null; pageSize: string | null; version: string | null; checks: Check[]; reasons: string[] };
  file: { name: string; size: number };
  kind: string;
  format: { key: string; label: string; templateUrl: string | null } | null;
  help: string;
  deleted: boolean;
}

const KINDS = [
  { key: 'interior', label: 'Interior PDF', hint: 'every interior page, no covers' },
  { key: 'cover', label: 'Cover PDF', hint: '4 pages: front, inside front, inside back, back' },
  { key: 'artwork', label: 'Print artwork', hint: 'one page: an art print or card' },
];

const fmt = (n: number) => String(Number(n.toFixed(3)));

export function FileCheck() {
  useSeo({ title: 'File Checker — Is my PDF print-ready?', description: 'Upload a cover, interior or art-print PDF and get a pass/fail checklist: page size and bleed, page count, flattened transparency, masks, RGB color, image resolution, fonts and PDF version. Files are deleted the moment the check finishes.' });
  const [formats, setFormats] = useState<Format[]>([]);
  const [format, setFormat] = useState('standard');
  const [custom, setCustom] = useState('');
  const [kind, setKind] = useState('interior');
  const [pages, setPages] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { api.get<{ formats: Format[] }>('/file-check/formats').then((r) => setFormats(r.formats)).catch(() => undefined); }, []);
  const chosen = formats.find((f) => f.key === format) ?? null;

  async function send(file: File | null | undefined) {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      fd.append('format', format);
      if (format === 'custom') fd.append('customSize', custom);
      if (kind === 'interior' && pages.trim()) fd.append('expectedPages', pages.trim());
      setResult(await uploadWithProgress<Result>('/api/file-check', fd, setProgress));
    } catch (e: any) {
      setError(e?.message ?? 'The check could not run. Please try again.');
    } finally { setBusy(false); }
  }

  const failed = result?.report.checks.filter((c) => c.status === 'fail') ?? [];

  return (
    <ResourcePage
      eyebrow="Resources"
      title="File Checker"
      intro="Drop your PDF here and get the same checklist our upload runs: page size and bleed, page count, flattened transparency, masks, RGB color, image resolution, fonts and PDF version. Green means it will clear; red tells you exactly what to fix."
    >
      <Section id="check" title="Check a file">
        <div style={{ display: 'grid', gap: '.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '1rem' }}>
          <label style={{ display: 'grid', gap: '.3rem' }}>
            <span style={{ fontWeight: 700 }}>Which file is this?</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="fc-kind">
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label} — {k.hint}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '.3rem' }}>
            <span style={{ fontWeight: 700 }}>Format (trim size)</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} data-testid="fc-format">
              {formats.map((f) => <option key={f.key} value={f.key}>{f.label} — {fmt(f.trimW)} × {fmt(f.trimH)} in (page {fmt(f.pageW)} × {fmt(f.pageH)} with bleed)</option>)}
              <option value="custom">Another size…</option>
            </select>
          </label>
          {format === 'custom' && (
            <label style={{ display: 'grid', gap: '.3rem' }}>
              <span style={{ fontWeight: 700 }}>Trim size (width × height, inches)</span>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 7 × 10" />
            </label>
          )}
          {kind === 'interior' && (
            <label style={{ display: 'grid', gap: '.3rem' }}>
              <span style={{ fontWeight: 700 }}>Interior page count (optional)</span>
              <input type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="as ordered, e.g. 24" />
            </label>
          )}
        </div>

        <label
          data-testid="fc-drop"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void send(e.dataTransfer.files?.[0]); }}
          style={{ display: 'block', border: `2px dashed ${dragging ? '#C61A22' : '#c9c9cf'}`, borderRadius: 12, padding: '2rem 1.25rem', textAlign: 'center', background: dragging ? '#fff5f5' : '#fafafa', cursor: busy ? 'wait' : 'pointer' }}
        >
          <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={(e) => { void send(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{busy ? `Checking… ${progress < 100 ? `${progress}% uploaded` : 'reading every page'}` : 'Drop a PDF here, or click to choose one'}</div>
          <div className="muted" style={{ fontSize: '.88rem', marginTop: '.35rem' }}>
            {chosen ? `Checking as a ${KINDS.find((k) => k.key === kind)?.label} for ${chosen.label}: every page ${fmt(chosen.pageW)} × ${fmt(chosen.pageH)} in.` : 'Pick the file type and format above.'}
          </div>
        </label>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.6rem' }}>
          <strong>Private.</strong> Your file is sent to our server only to be read, and is deleted the moment the check finishes. It is not saved, not attached to anything, and nobody looks at it.
        </p>
        {error && <div className="error" style={{ marginTop: '.75rem' }} data-testid="fc-error">{error}</div>}

        {result && (
          <div data-testid="fc-result" style={{ marginTop: '1.25rem', border: `2px solid ${result.report.ok ? '#16a34a' : '#C61A22'}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '.9rem 1.1rem', background: result.report.ok ? '#f0fdf4' : '#fff5f5', display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ fontSize: '1.6rem', color: result.report.ok ? '#16a34a' : '#C61A22', fontWeight: 800 }}>{result.report.ok ? '✓' : '✗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }} data-testid="fc-headline">{result.report.headline}</div>
                <div className="muted" style={{ fontSize: '.85rem' }}>
                  {result.file.name} · {formatFileSize(result.file.size)}{result.report.pages ? ` · ${result.report.pages} page${result.report.pages === 1 ? '' : 's'}` : ''}{result.report.pageSize ? ` · ${result.report.pageSize}` : ''}{result.report.version ? ` · PDF ${result.report.version}` : ''} · checked and deleted
                </div>
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {result.report.checks.map((c) => (
                <li key={c.id} data-testid={`fc-check-${c.id}`} data-status={c.status} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr', gap: '.6rem', padding: '.7rem 1.1rem', borderTop: '1px solid #eee', alignItems: 'start' }}>
                  <span aria-label={c.status} style={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, color: c.status === 'pass' ? '#16a34a' : c.status === 'fail' ? '#C61A22' : '#6b7280' }}>
                    {c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : 'ⓘ'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.label}</div>
                    <div style={{ fontSize: '.88rem', color: c.status === 'fail' ? '#7f1d1d' : '#444', lineHeight: 1.5 }}>{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
            {failed.length > 0 && (
              <div style={{ padding: '.9rem 1.1rem', borderTop: '1px solid #eee', background: '#fafafa', fontSize: '.9rem' }}>
                <strong>How to fix it:</strong>{' '}
                {failed.some((c) => ['transparency', 'masks', 'page_wrappers', 'pdf_version', 'image_format', 'fonts', 'low_resolution', 'corrupted', 'color_mode'].includes(c.reason ?? '')) && <><Link to="/resources/file-prep#flat">Flat files: no transparency, no masks</Link> · </>}
                {failed.some((c) => ['wrong_size', 'no_bleed', 'spreads', 'wrong_orientation', 'mixed_page_sizes', 'crop_marks'].includes(c.reason ?? '')) && <>{result.format?.templateUrl ? <><a href={result.format.templateUrl}>Download the {result.format.label} template</a> · </> : null}<Link to="/resources/templates">Templates</Link> · </>}
                <Link to="/resources/file-prep">File Prep guide</Link>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section id="what" title="What the checker looks at">
        <p>Every one of these is a rule a file can fail on its own, so the checker is exact about them. The art itself is confirmed by a person at prepress.</p>
        <ul style={{ lineHeight: 1.6 }}>
          <li><strong>Page size and bleed.</strong> Every page is the trim plus 0.125&Prime; on every side, upright, single pages, all the same size, no crop marks.</li>
          <li><strong>Page count.</strong> A Cover PDF is exactly 4 pages; an interior matches the count you ordered (or a multiple of 4).</li>
          <li><strong>Flat content.</strong> No soft masks, transparency groups, blend modes or partial opacity; no stencil or image masks; pages drawn directly, not wrapped in a form with a clipping mask.</li>
          <li><strong>Images.</strong> 300 ppi at the printed size (minimum 250), 8-bit, no JPEG 2000 or JBIG2.</li>
          <li><strong>Color.</strong> RGB (sRGB) throughout: no CMYK, no spot colors. Converting to CMYK yourself clips the colors to an offset-press gamut before we ever see them, and the Fiery then faithfully prints that smaller gamut, so the result is flat and dull. Hand us RGB and the RIP uses the full gamut of the press.</li>
          <li><strong>Fonts</strong> embedded or outlined. <strong>PDF version</strong> 1.4 or lower (the PDF/X-3 preset). Every resource a page draws is present in the file.</li>
        </ul>
        <Callout kind="tip" title="Make it pass first time">
          Build on the <Link to="/resources/templates">template</Link> for your size, keep it in RGB, and export with the PDF/X-3 preset, transparency flattened. The <Link to="/resources/file-prep#flat">File Prep guide</Link> has the settings for each app.
        </Callout>
      </Section>

      <RelatedLinks links={[{ to: '/resources/file-prep', label: 'File Prep guide' }, { to: '/resources/templates', label: 'Templates' }, { to: '/resources/make-a-comic', label: 'Make a Comic guide' }, { to: '/contact', label: 'Ask a question' }]} />
    </ResourcePage>
  );
}
