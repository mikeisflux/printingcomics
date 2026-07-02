import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  getPdfInfo, imposeBooklet, imposeNUp, addCropMarksOnly,
  mergePdfs, rotatePdf, downloadPdf,
} from '../../lib/impose';
import type {
  PdfPageInfo, BookletOptions, NUpOptions, CropMarksOptions,
} from '../../lib/impose';

// ── Constants ────────────────────────────────────────────────────────────────

const SHEET_PRESETS = [
  { label: 'Tabloid (11×17")', w: 11, h: 17 },
  { label: 'Tabloid+ (12×18")', w: 12, h: 18 },
  { label: 'Super-B (13×19")', w: 13, h: 19 },
  { label: 'Letter (8.5×11")', w: 8.5, h: 11 },
  { label: 'Legal (8.5×14")', w: 8.5, h: 14 },
  { label: 'SRA3 (12.6×17.7")', w: 12.6, h: 17.7 },
];

// ── Types ────────────────────────────────────────────────────────────────────

type ToolId = 'comic' | 'booklet' | 'nup' | 'steprepeat' | 'cropmarks' | 'merge' | 'rotate';
type Status = 'idle' | 'loading' | 'processing' | 'done' | 'error';
type TopTab = 'tools' | 'calculators';
type CalcTab = 'saddle' | 'perfectbind' | 'nup' | 'cost' | 'bleed';

interface LoadedFile { name: string; bytes: Uint8Array; info: PdfPageInfo; }
interface MergeFile { name: string; bytes: Uint8Array; }

// ── Tool catalog ─────────────────────────────────────────────────────────────

interface ToolDef {
  id: ToolId;
  name: string;
  desc: string;
  tags: string[];
  category: string;
  Thumb: () => React.ReactElement;
}

const TOOLS: ToolDef[] = [
  {
    id: 'comic', name: 'Comic Book', category: 'Booklets',
    desc: 'Saddle-stitch 2-up for standard US comic format (6.625″×10.25″)',
    tags: ['2-up', 'tabloid sheet', 'saddle-stitch', '⅛″ bleed preset'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        <rect x="10" y="14" width="82" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
        <rect x="108" y="14" width="82" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
        <line x1="100" y1="14" x2="100" y2="134" stroke="#cbd5e1" strokeDasharray="4,2" />
        <text x="51" y="78" textAnchor="middle" fill="#64748b" fontSize="22" fontWeight="700">16</text>
        <text x="149" y="78" textAnchor="middle" fill="#64748b" fontSize="22" fontWeight="700">1</text>
        {([
          [10,14,1,1],[92,14,1,1],[10,134,1,0],[92,134,1,0],
          [108,14,0,1],[190,14,0,1],[108,134,0,0],[190,134,0,0]
        ] as [number,number,number,number][]).map(([cx,cy,isLeft,isTop],i)=>(
          <g key={i}>
            <line x1={cx+(isLeft?-10:-2)} y1={cy} x2={cx+(isLeft?-3:5)} y2={cy} stroke="#e11d48" strokeWidth="1.2"/>
            <line x1={cx} y1={cy+(isTop?-10:-2)} x2={cx} y2={cy+(isTop?-3:5)} stroke="#e11d48" strokeWidth="1.2"/>
          </g>
        ))}
      </svg>
    ),
  },
  {
    id: 'booklet', name: 'Booklet', category: 'Booklets',
    desc: 'Generic 2-up saddle-stitch on any press sheet. Auto-detects page size.',
    tags: ['2-up', 'auto-size', 'creep', 'LTR or RTL'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        <rect x="15" y="14" width="78" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
        <rect x="107" y="14" width="78" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
        <line x1="100" y1="14" x2="100" y2="134" stroke="#94a3b8" strokeWidth="2" />
        <rect x="28" y="30" width="48" height="8" rx="2" fill="#cbd5e1" />
        <rect x="28" y="46" width="36" height="5" rx="1" fill="#e2e8f0" />
        <rect x="28" y="56" width="42" height="5" rx="1" fill="#e2e8f0" />
        <rect x="28" y="66" width="34" height="5" rx="1" fill="#e2e8f0" />
        <rect x="120" y="30" width="50" height="8" rx="2" fill="#dde1e7" />
        <rect x="120" y="46" width="40" height="5" rx="1" fill="#e2e8f0" />
        <rect x="120" y="56" width="45" height="5" rx="1" fill="#e2e8f0" />
        <text x="54" y="126" textAnchor="middle" fill="#94a3b8" fontSize="10">p.2</text>
        <text x="146" y="126" textAnchor="middle" fill="#94a3b8" fontSize="10">p.15</text>
      </svg>
    ),
  },
  {
    id: 'nup', name: 'N-Up Grid', category: 'Layout',
    desc: 'Place multiple pages on a press sheet — sequential order, any rows×cols.',
    tags: ['custom sheet', 'rows × cols', 'gutters', 'crop marks'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        {Array.from({length:8},(_,i)=>{const c=i%4,r=Math.floor(i/4); return (
          <g key={i}>
            <rect x={8+c*48} y={12+r*62} width={43} height={57} rx="1" fill="#f1f5f9" stroke="#94a3b8"/>
            <text x={29.5+c*48} y={46+r*62} textAnchor="middle" fill="#64748b" fontSize="16">{i+1}</text>
          </g>
        );})}
      </svg>
    ),
  },
  {
    id: 'steprepeat', name: 'Step & Repeat', category: 'Layout',
    desc: 'One design tiled across the whole sheet — covers, stickers, cards.',
    tags: ['identical copies', 'step-and-repeat', 'shared marks'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        {Array.from({length:6},(_,i)=>{const c=i%3,r=Math.floor(i/3); return (
          <g key={i}>
            <rect x={12+c*62} y={10+r*66} width={56} height={60} rx="1" fill="#f1f5f9" stroke="#94a3b8"/>
            <rect x={20+c*62} y={20+r*66} width={40} height="10" rx="2" fill="#cbd5e1"/>
            <rect x={20+c*62} y={36+r*66} width={28} height="6" rx="1" fill="#e2e8f0"/>
            <circle cx={40+c*62} cy={56+r*66} r="7" fill="#dde1e7"/>
          </g>
        );})}
      </svg>
    ),
  },
  {
    id: 'cropmarks', name: 'Crop Marks', category: 'Marks',
    desc: 'Add trim marks and bleed offset to any PDF without rearranging pages.',
    tags: ['marks only', 'bleed offset', 'per-page', 'no reorder'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        <rect x="32" y="18" width="136" height="112" rx="1" fill="#f1f5f9" stroke="#94a3b8"/>
        {([
          [32,18,1,1],[168,18,0,1],[32,130,1,0],[168,130,0,0]
        ] as [number,number,number,number][]).map(([cx,cy,isL,isT],i)=>(
          <g key={i}>
            <line x1={cx+(isL?-18:-2)} y1={cy} x2={cx+(isL?-6:10)} y2={cy} stroke="#e11d48" strokeWidth="1.5"/>
            <line x1={cx} y1={cy+(isT?-18:-2)} x2={cx} y2={cy+(isT?-6:10)} stroke="#e11d48" strokeWidth="1.5"/>
          </g>
        ))}
        <rect x="46" y="34" width="108" height="12" rx="2" fill="#cbd5e1"/>
        <rect x="46" y="54" width="80" height="6" rx="1" fill="#e2e8f0"/>
        <rect x="46" y="66" width="92" height="6" rx="1" fill="#e2e8f0"/>
        <rect x="46" y="78" width="70" height="6" rx="1" fill="#e2e8f0"/>
      </svg>
    ),
  },
  {
    id: 'merge', name: 'Merge PDFs', category: 'PDF Tools',
    desc: 'Combine multiple PDF files into one document in any order.',
    tags: ['multiple files', 'single output', 'set order'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        {[0,1,2].map(i=>(
          <g key={i} transform={`translate(${-i*8},${i*12})`}>
            <rect x="50" y="20" width="100" height="110" rx="2" fill={i===0?'#f1f5f9':'#e2e8f0'} stroke="#94a3b8"/>
            {i===0&&<>
              <rect x="62" y="36" width="76" height="10" rx="2" fill="#cbd5e1"/>
              <rect x="62" y="54" width="58" height="6" rx="1" fill="#e2e8f0"/>
              <rect x="62" y="66" width="64" height="6" rx="1" fill="#e2e8f0"/>
            </>}
          </g>
        ))}
        <path d="M96 108 L100 116 L104 108" stroke="#64748b" strokeWidth="2" fill="none"/>
        <line x1="100" y1="96" x2="100" y2="116" stroke="#64748b" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    id: 'rotate', name: 'Rotate', category: 'PDF Tools',
    desc: 'Rotate all pages in a PDF by 90°, 180°, or 270°.',
    tags: ['all pages', '90/180/270°', 'fix orientation'],
    Thumb: () => (
      <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
        <rect x="55" y="24" width="90" height="110" rx="2" fill="#f1f5f9" stroke="#94a3b8"/>
        <rect x="68" y="40" width="64" height="10" rx="2" fill="#cbd5e1"/>
        <rect x="68" y="58" width="44" height="6" rx="1" fill="#e2e8f0"/>
        <path d="M148 40 C165 40 172 55 172 74 C172 93 162 106 148 110" stroke="#64748b" strokeWidth="2" fill="none"/>
        <polygon points="148,40 155,30 141,30" fill="#64748b"/>
      </svg>
    ),
  },
];

// ── Shared UI primitives ─────────────────────────────────────────────────────

const iStyle: React.CSSProperties = {
  width: '100%', padding: '.4rem .65rem', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: '.9rem', boxSizing: 'border-box',
  background: 'var(--bg)', color: 'var(--ink)',
};

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginBottom: '.3rem' }}>
        {label}
      </label>
      {children}
      {note && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: '.2rem' }}>{note}</div>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>{children}</div>;
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '.15rem .5rem', borderRadius: 4, background: 'var(--bg-alt)', border: '1px solid var(--border)', fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)' }}>
      {label}
    </span>
  );
}

// ── File drop zone ────────────────────────────────────────────────────────────

function FileDrop({
  onFile, multiple = false, label = 'Drop a PDF here, or click to select',
}: {
  onFile: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback((files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length) onFile(pdfs);
  }, [onFile]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false);
    handle(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${drag ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 10, padding: '2rem 1.5rem',
        textAlign: 'center', cursor: 'pointer',
        background: drag ? '#fff8f8' : 'var(--bg-alt)',
        transition: 'all .15s',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
      <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.25rem' }}>
        PDF only — processed locally, never uploaded
      </div>
      <input
        ref={inputRef} type="file" accept="application/pdf,.pdf"
        multiple={multiple} style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => handle(e.target.files)}
      />
    </div>
  );
}

// ── File info bar ─────────────────────────────────────────────────────────────

function FileBar({ file, onClear }: { file: LoadedFile; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.65rem 1rem', background: 'var(--bg-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: '1.1rem' }}>📄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
          {file.info.count} page{file.info.count !== 1 ? 's' : ''} · {file.info.widthIn}″ × {file.info.heightIn}″
        </div>
      </div>
      <button className="btn secondary" style={{ padding: '.3rem .65rem', fontSize: '.8rem' }} onClick={onClear}>
        Change
      </button>
    </div>
  );
}

// ── Booklet imposition settings + preview ─────────────────────────────────────

const DEFAULT_BOOKLET: BookletOptions = {
  rtl: false, marginIn: 0.5, gutterIn: 0, creepIn: 0.125,
  addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};

function BookletSettings({ opts, onChange }: { opts: BookletOptions; onChange: (o: BookletOptions) => void }) {
  const set = <K extends keyof BookletOptions>(k: K, v: BookletOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>
      <Field label="Binding direction">
        <select value={opts.rtl ? 'rtl' : 'ltr'} onChange={e => set('rtl', e.target.value === 'rtl')} style={iStyle}>
          <option value="ltr">Left-to-right (LTR)</option>
          <option value="rtl">Right-to-left (RTL / Manga)</option>
        </select>
      </Field>
      <Field label="Sheet margin (in)" note="Space around spread for crop marks">
        <input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Spine gutter (in)" note="Extra space at fold (usually 0)">
        <input type="number" min={0} max={0.5} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Creep compensation (in)" note="Total shift across all sheets">
        <input type="number" min={0} max={0.5} step={0.0625} value={opts.creepIn} onChange={e => set('creepIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Crop marks">
        <Row>
          <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} />
          <span style={{ fontSize: '.85rem' }}>Add crop marks</span>
        </Row>
      </Field>
    </div>
  );
}

function BookletPreview({ pageCount, opts }: { pageCount: number; opts: BookletOptions }) {
  const paddedN = Math.ceil(pageCount / 4) * 4;
  const numSheets = paddedN / 4;
  const sheets = useMemo(() => {
    return Array.from({ length: numSheets }, (_, s) => {
      let aL: number, aR: number, bL: number, bR: number;
      if (!opts.rtl) {
        aL = paddedN - s * 2; aR = s * 2 + 1;
        bL = s * 2 + 2;       bR = paddedN - s * 2 - 1;
      } else {
        aL = s * 2 + 1; aR = paddedN - s * 2;
        bL = paddedN - s * 2 - 1; bR = s * 2 + 2;
      }
      return { sheet: s + 1, aL, aR, bL, bR };
    });
  }, [numSheets, paddedN, opts.rtl]);

  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>
        Press order — {numSheets} sheet{numSheets !== 1 ? 's' : ''}, {paddedN} pages
        {paddedN > pageCount && <span style={{ color: '#92400e', fontWeight: 400, fontSize: '.8rem', marginLeft: '.5rem' }}>
          ({paddedN - pageCount} blank padding page{paddedN - pageCount > 1 ? 's' : ''})
        </span>}
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table" style={{ minWidth: 480 }}>
          <thead>
            <tr><th>Sheet</th><th>Side A (Front)</th><th>Side B (Back)</th></tr>
          </thead>
          <tbody>
            {sheets.map(({ sheet, aL, aR, bL, bR }) => (
              <tr key={sheet}>
                <td style={{ fontWeight: 700, color: 'var(--muted)' }}>#{sheet}</td>
                <td>
                  <SpreadCell left={aL} right={aR} total={pageCount} rtl={opts.rtl} />
                </td>
                <td>
                  <SpreadCell left={bL} right={bR} total={pageCount} rtl={opts.rtl} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '.75rem 0 0', fontSize: '.78rem', color: 'var(--muted)' }}>
        Print duplex, short-edge flip (tumble). Stack sheets, fold, and saddle-stitch.
      </p>
    </div>
  );
}

function SpreadCell({ left, right, total, rtl }: { left: number; right: number; total: number; rtl: boolean }) {
  const lBlank = left > total;
  const rBlank = right > total;
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <PageBadge n={rtl ? right : left} blank={rtl ? rBlank : lBlank} label={rtl ? 'R' : 'L'} />
      <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>|</span>
      <PageBadge n={rtl ? left : right} blank={rtl ? lBlank : rBlank} label={rtl ? 'L' : 'R'} />
    </div>
  );
}

function PageBadge({ n, blank, label }: { n: number; blank: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '.15rem .4rem', borderRadius: 4, fontSize: '.78rem',
      background: blank ? '#f1f5f9' : 'var(--bg-alt)',
      border: `1px solid ${blank ? '#e2e8f0' : 'var(--border)'}`,
      color: blank ? '#94a3b8' : 'var(--ink)',
    }}>
      <span style={{ fontSize: '.65rem', color: '#94a3b8' }}>{label}</span>
      {blank ? 'blank' : `p.${n}`}
    </span>
  );
}

// ── N-Up / Step & Repeat settings + preview ───────────────────────────────────

const DEFAULT_NUP: NUpOptions = {
  cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17,
  marginIn: 0.25, gutterIn: 0.125, repeatFirst: false,
  addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};
const DEFAULT_STEP: NUpOptions = { ...DEFAULT_NUP, repeatFirst: true };

function NUpSettings({ opts, onChange, stepMode }: { opts: NUpOptions; onChange: (o: NUpOptions) => void; stepMode: boolean }) {
  const set = <K extends keyof NUpOptions>(k: K, v: NUpOptions[K]) => onChange({ ...opts, [k]: v });
  const preset = SHEET_PRESETS.find(p => p.w === opts.sheetWIn && p.h === opts.sheetHIn);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>
      <Field label="Sheet preset">
        <select value={preset ? `${preset.w}x${preset.h}` : 'custom'} onChange={e => {
          const p = SHEET_PRESETS.find(s => `${s.w}x${s.h}` === e.target.value);
          if (p) set('sheetWIn', p.w), set('sheetHIn', p.h);
        }} style={iStyle}>
          {SHEET_PRESETS.map(p => <option key={p.label} value={`${p.w}x${p.h}`}>{p.label}</option>)}
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Sheet width (in)">
        <input type="number" min={1} max={48} step={0.25} value={opts.sheetWIn} onChange={e => set('sheetWIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Sheet height (in)">
        <input type="number" min={1} max={48} step={0.25} value={opts.sheetHIn} onChange={e => set('sheetHIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Columns">
        <input type="number" min={1} max={20} step={1} value={opts.cols} onChange={e => set('cols', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Rows">
        <input type="number" min={1} max={20} step={1} value={opts.rows} onChange={e => set('rows', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Margin (in)" note="Outer edge of sheet">
        <input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Gutter (in)" note="Between cells">
        <input type="number" min={0} max={1} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} />
      </Field>
      {!stepMode && (
        <Field label="Page order">
          <select value={opts.repeatFirst ? 'repeat' : 'seq'} onChange={e => set('repeatFirst', e.target.value === 'repeat')} style={iStyle}>
            <option value="seq">Sequential (1, 2, 3, 4…)</option>
            <option value="repeat">Step & Repeat (page 1 only)</option>
          </select>
        </Field>
      )}
      <Field label="Crop marks">
        <Row>
          <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} />
          <span style={{ fontSize: '.85rem' }}>Add crop marks</span>
        </Row>
      </Field>
    </div>
  );
}

function NUpPreview({ opts, pageCount }: { opts: NUpOptions; pageCount: number }) {
  const perSheet = opts.cols * opts.rows;
  const numSheets = opts.repeatFirst ? 1 : Math.ceil(pageCount / perSheet);
  const cellW = (opts.sheetWIn - opts.marginIn * 2 - opts.gutterIn * (opts.cols - 1)) / opts.cols;
  const cellH = (opts.sheetHIn - opts.marginIn * 2 - opts.gutterIn * (opts.rows - 1)) / opts.rows;

  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>
        Layout: {opts.cols}×{opts.rows} ({perSheet}-up) on {opts.sheetWIn}″×{opts.sheetHIn}″
        <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--muted)', marginLeft: '.5rem' }}>
          {numSheets} output sheet{numSheets !== 1 ? 's' : ''} · cell {cellW.toFixed(2)}″×{cellH.toFixed(2)}″
        </span>
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {Array.from({ length: Math.min(perSheet, pageCount) }, (_, i) => {
          const pn = opts.repeatFirst ? 1 : i + 1;
          return (
            <div key={i} style={{
              padding: '.2rem .4rem', borderRadius: 4, fontSize: '.78rem', fontWeight: 600,
              background: 'var(--bg-alt)', border: '1px solid var(--border)', minWidth: 36, textAlign: 'center',
            }}>p.{pn}</div>
          );
        })}
        {!opts.repeatFirst && pageCount > perSheet && (
          <div style={{ padding: '.2rem .4rem', color: 'var(--muted)', fontSize: '.78rem' }}>
            +{Math.ceil(pageCount / perSheet) - 1} more sheet{Math.ceil(pageCount / perSheet) > 2 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Crop Marks settings + preview ─────────────────────────────────────────────

const DEFAULT_CROP: CropMarksOptions = {
  bleedIn: 0.125, marginIn: 0.5, markLenIn: 0.25, markOffIn: 0.125,
};

function CropSettings({ opts, onChange }: { opts: CropMarksOptions; onChange: (o: CropMarksOptions) => void }) {
  const set = <K extends keyof CropMarksOptions>(k: K, v: number) => onChange({ ...opts, [k]: v });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>
      <Field label="Existing bleed (in)" note="How much bleed is already in the file">
        <input type="number" min={0} max={0.5} step={0.0625} value={opts.bleedIn} onChange={e => set('bleedIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Added margin (in)" note="Extra blank area around page for marks">
        <input type="number" min={0.25} max={1.5} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Mark length (in)">
        <input type="number" min={0.1} max={0.5} step={0.0625} value={opts.markLenIn} onChange={e => set('markLenIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Mark offset (in)" note="Gap between trim and mark start">
        <input type="number" min={0.05} max={0.25} step={0.0625} value={opts.markOffIn} onChange={e => set('markOffIn', +e.target.value)} style={iStyle} />
      </Field>
    </div>
  );
}

// ── Rotate settings ──────────────────────────────────────────────────────────

function RotateSettings({ angle, onChange }: { angle: 90|180|270; onChange: (a: 90|180|270) => void }) {
  return (
    <Field label="Rotation">
      <div style={{ display: 'flex', gap: '.5rem' }}>
        {([90,180,270] as const).map(a => (
          <button key={a} className={`btn${angle === a ? '' : ' secondary'}`}
            onClick={() => onChange(a)} style={{ flex: 1 }}>
            {a}°
          </button>
        ))}
      </div>
    </Field>
  );
}

// ── Merge file list ──────────────────────────────────────────────────────────

function MergeFileList({ files, onAdd, onRemove, onMove }: {
  files: MergeFile[];
  onAdd: (f: File[]) => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .75rem', background: 'var(--bg-alt)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--muted)', fontSize: '.8rem', minWidth: 20 }}>{i+1}.</span>
          <span style={{ flex: 1, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 .2rem' }} onClick={() => i > 0 && onMove(i, i-1)} disabled={i===0}>↑</button>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 .2rem' }} onClick={() => i < files.length-1 && onMove(i, i+1)} disabled={i===files.length-1}>↓</button>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: '0 .2rem' }} onClick={() => onRemove(i)}>×</button>
        </div>
      ))}
      <FileDrop onFile={onAdd} multiple label="Add more PDFs" />
    </div>
  );
}

// ── Tool workspace ────────────────────────────────────────────────────────────

function ToolWorkspace({ tool, onBack }: { tool: ToolDef; onBack: () => void }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Tool-specific settings
  const [bookletOpts, setBookletOpts] = useState<BookletOptions>(
    tool.id === 'comic'
      ? { ...DEFAULT_BOOKLET, marginIn: 0.5, gutterIn: 0, creepIn: 0.125 }
      : DEFAULT_BOOKLET
  );
  const [nupOpts, setNupOpts] = useState<NUpOptions>(
    tool.id === 'steprepeat' ? DEFAULT_STEP : DEFAULT_NUP
  );
  const [cropOpts, setCropOpts] = useState<CropMarksOptions>(DEFAULT_CROP);
  const [rotateAngle, setRotateAngle] = useState<90|180|270>(90);

  // Merge tool has its own multi-file state
  const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);
  const [mergeStatus, setMergeStatus] = useState<Status>('idle');

  const loadFile = useCallback(async (f: File) => {
    setStatus('loading');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await getPdfInfo(bytes);
      setFile({ name: f.name, bytes, info });
      setStatus('idle');
    } catch {
      setStatus('error'); setErrMsg('Could not read PDF. Make sure it is a valid, unencrypted PDF.');
    }
  }, []);

  const clearFile = () => { setFile(null); setStatus('idle'); setErrMsg(''); };

  const addMergeFiles = useCallback(async (files: File[]) => {
    const loaded = await Promise.all(files.map(async f => ({
      name: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })));
    setMergeFiles(prev => [...prev, ...loaded]);
  }, []);

  const process = async () => {
    if (!file) return;
    setStatus('processing');
    try {
      let out: Uint8Array;
      const base = file.name.replace(/\.pdf$/i, '');
      let outName = base + '-imposed.pdf';

      if (tool.id === 'comic' || tool.id === 'booklet') {
        out = await imposeBooklet(file.bytes, bookletOpts);
        outName = `${base}-booklet.pdf`;
      } else if (tool.id === 'nup' || tool.id === 'steprepeat') {
        out = await imposeNUp(file.bytes, nupOpts);
        outName = `${base}-${tool.id === 'steprepeat' ? 'step-repeat' : `${nupOpts.cols}x${nupOpts.rows}up`}.pdf`;
      } else if (tool.id === 'cropmarks') {
        out = await addCropMarksOnly(file.bytes, cropOpts);
        outName = `${base}-marks.pdf`;
      } else if (tool.id === 'rotate') {
        out = await rotatePdf(file.bytes, rotateAngle);
        outName = `${base}-rotated${rotateAngle}.pdf`;
      } else {
        out = file.bytes;
      }

      downloadPdf(out, outName);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error'); setErrMsg(e instanceof Error ? e.message : 'Processing failed');
    }
  };

  const processMerge = async () => {
    if (mergeFiles.length < 2) return;
    setMergeStatus('processing');
    try {
      const out = await mergePdfs(mergeFiles.map(f => f.bytes));
      downloadPdf(out, 'merged.pdf');
      setMergeStatus('done');
      setTimeout(() => setMergeStatus('idle'), 3000);
    } catch (e) {
      setMergeStatus('error');
    }
  };

  const isBusy = status === 'loading' || status === 'processing';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn secondary" onClick={onBack} style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>
          ← Back
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{tool.name}</h2>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{tool.desc}</div>
        </div>
      </div>

      {/* MERGE: special multi-file UI */}
      {tool.id === 'merge' ? (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {mergeFiles.length === 0 ? (
            <FileDrop onFile={addMergeFiles} multiple label="Drop PDFs here to merge (drop multiple at once)" />
          ) : (
            <MergeFileList
              files={mergeFiles}
              onAdd={addMergeFiles}
              onRemove={i => setMergeFiles(f => f.filter((_, j) => j !== i))}
              onMove={(from, to) => setMergeFiles(f => {
                const a = [...f]; const tmp = a[to]!; a[to] = a[from]!; a[from] = tmp; return a;
              })}
            />
          )}
          {mergeFiles.length >= 2 && (
            <button className="btn" onClick={processMerge} disabled={mergeStatus === 'processing'} style={{ alignSelf: 'flex-start' }}>
              {mergeStatus === 'processing' ? 'Merging…' : mergeStatus === 'done' ? 'Downloaded ✓' : `Merge ${mergeFiles.length} PDFs & Download`}
            </button>
          )}
          {mergeStatus === 'error' && <div style={{ color: 'red', fontSize: '.85rem' }}>Merge failed. Try again.</div>}
        </div>
      ) : (
        /* All other tools: single-file UI */
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {!file ? (
            <FileDrop onFile={fs => { if (fs[0]) loadFile(fs[0]); }} />
          ) : (
            <>
              <FileBar file={file} onClear={clearFile} />

              {/* Tool settings */}
              <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                <h4 style={{ margin: '0 0 .75rem' }}>Settings</h4>
                {(tool.id === 'comic' || tool.id === 'booklet') && (
                  <BookletSettings opts={bookletOpts} onChange={setBookletOpts} />
                )}
                {(tool.id === 'nup' || tool.id === 'steprepeat') && (
                  <NUpSettings opts={nupOpts} onChange={setNupOpts} stepMode={tool.id === 'steprepeat'} />
                )}
                {tool.id === 'cropmarks' && (
                  <CropSettings opts={cropOpts} onChange={setCropOpts} />
                )}
                {tool.id === 'rotate' && (
                  <RotateSettings angle={rotateAngle} onChange={setRotateAngle} />
                )}
              </div>

              {/* Preview */}
              {(tool.id === 'comic' || tool.id === 'booklet') && (
                <BookletPreview pageCount={file.info.count} opts={bookletOpts} />
              )}
              {(tool.id === 'nup' || tool.id === 'steprepeat') && (
                <NUpPreview opts={nupOpts} pageCount={file.info.count} />
              )}

              {/* Process button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn" onClick={process} disabled={isBusy} style={{ fontSize: '1rem', padding: '.65rem 1.5rem' }}>
                  {status === 'processing' ? 'Processing…'
                   : status === 'done' ? '✓ Downloaded'
                   : `Process & Download`}
                </button>
                {status === 'done' && <button className="btn secondary" onClick={process}>Download again</button>}
              </div>

              {status === 'error' && (
                <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{errMsg || 'Processing failed. Try again.'}</div>
              )}
            </>
          )}

          {status === 'loading' && (
            <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Reading PDF…</div>
          )}
          {status === 'error' && !file && (
            <div style={{ color: '#dc2626', fontSize: '.85rem', marginTop: '-0.5rem' }}>{errMsg}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool gallery ──────────────────────────────────────────────────────────────

function ToolGallery({ onSelect }: { onSelect: (id: ToolId) => void }) {
  const categories = useMemo(() => {
    const map = new Map<string, ToolDef[]>();
    for (const t of TOOLS) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, []);

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {Array.from(categories.entries()).map(([cat, tools]) => (
        <div key={cat}>
          <h3 style={{ margin: '0 0 .75rem', fontSize: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
            {cat}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: '.75rem' }}>
            {tools.map(t => <ToolCard key={t.id} tool={t} onSelect={() => onSelect(t.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCard({ tool, onSelect }: { tool: ToolDef; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        background: hover ? 'var(--bg-alt)' : 'var(--bg)', cursor: 'pointer',
        transition: 'all .15s', boxShadow: hover ? '0 4px 16px rgba(0,0,0,.08)' : 'none',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div style={{ height: 140, background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', padding: '1rem', overflow: 'hidden' }}>
        <tool.Thumb />
      </div>
      {/* Body */}
      <div style={{ padding: '.75rem 1rem 1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{tool.name}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.5rem', lineHeight: 1.4 }}>{tool.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginBottom: '.75rem' }}>
          {tool.tags.map(tag => <Chip key={tag} label={tag} />)}
        </div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={onSelect}>
          Make this →
        </button>
      </div>
    </div>
  );
}

// ── Calculators (existing pre-press reference tools) ──────────────────────────

const PAPER_STOCKS = [
  { label: '60# Uncoated Text', thicknessPerLeaf: 0.0040, centsPerSheet: 0.8 },
  { label: '70# Uncoated Text', thicknessPerLeaf: 0.0045, centsPerSheet: 1.0 },
  { label: '80# Gloss Text', thicknessPerLeaf: 0.0038, centsPerSheet: 1.1 },
  { label: '100# Gloss Text', thicknessPerLeaf: 0.0036, centsPerSheet: 1.3 },
  { label: '80# Uncoated Cover', thicknessPerLeaf: 0.0076, centsPerSheet: 1.8 },
  { label: '100# Gloss Cover', thicknessPerLeaf: 0.0091, centsPerSheet: 2.2 },
];
const COVER_STOCKS = PAPER_STOCKS.slice(4);
const COMIC_SIZES = [
  { label: 'Standard Comic (6.625″×10.25″)', w: 6.625, h: 10.25 },
  { label: 'Digest (5.5″×8.5″)', w: 5.5, h: 8.5 },
  { label: 'Letter (8.5″×11″)', w: 8.5, h: 11 },
  { label: 'Square (7″×7″)', w: 7, h: 7 },
];
const CLICK_RATE = 0.045;
function fmt$(c: number) { return `$${(c/100).toFixed(2)}`; }
function fmtIn(i: number) { return `${i.toFixed(4)}"`; }
function fmtMM(i: number) { return `${(i*25.4).toFixed(2)} mm`; }

function CalcField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', marginBottom: '.35rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
      {children}
    </div>
  );
}
function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: `1px solid var(--border)`, borderLeft: accent ? `4px solid ${accent}` : '1px solid var(--border)', borderRadius: 8, padding: '.75rem 1rem' }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '.15rem', color: accent ?? 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: '.1rem' }}>{sub}</div>}
    </div>
  );
}

function SaddlePlanner() {
  const [pages, setPages] = useState(32);
  const [qty, setQty] = useState(100);
  const [interiorStock, setInteriorStock] = useState(0);
  const [coverStock, setCoverStock] = useState(0);
  const valid = pages % 4 === 0 && pages >= 8;
  const sheets = pages / 4;
  const stock = PAPER_STOCKS[interiorStock]!;
  const cover = COVER_STOCKS[coverStock]!;
  const clicksPerBook = sheets * 2 + 2;
  const paperCents = sheets * stock.centsPerSheet + cover.centsPerSheet;
  const clickCents = clicksPerBook * CLICK_RATE * 100;
  const marginal = paperCents + clickCents;
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Page count (mult of 4)">
          <input type="number" min={4} max={200} step={4} value={pages} onChange={e=>setPages(+e.target.value)} style={iStyle}/>
          {!valid&&pages>=4&&<div style={{color:'#c00',fontSize:'.8rem',marginTop:'.2rem'}}>Must be a multiple of 4, min 8.</div>}
        </CalcField>
        <CalcField label="Quantity"><input type="number" min={1} step={25} value={qty} onChange={e=>setQty(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Interior stock">
          <select value={interiorStock} onChange={e=>setInteriorStock(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverStock} onChange={e=>setCoverStock(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      {valid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
          <StatCard label="Interior sheets" value={String(sheets)} sub="per book"/>
          <StatCard label="Color clicks" value={String(clicksPerBook)} sub="per book"/>
          <StatCard label="Click cost" value={fmt$(clickCents)} sub="per book"/>
          <StatCard label="Paper cost" value={fmt$(paperCents)} sub="per book"/>
          <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534"/>
          <StatCard label="Total marginal" value={fmt$(marginal*qty)} sub={`for ${qty.toLocaleString()} books`} accent="#1e3a5f"/>
        </div>
      )}
    </div>
  );
}

function PerfectBindPlanner() {
  const [textPages, setTextPages] = useState(128);
  const [qty, setQty] = useState(100);
  const [stockIdx, setStockIdx] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);
  const valid = textPages % 2 === 0 && textPages >= 48;
  const stock = PAPER_STOCKS[stockIdx]!;
  const cover = COVER_STOCKS[coverIdx]!;
  const spineIn = (textPages / 2) * stock.thicknessPerLeaf;
  const textSheets = textPages / 2;
  const marginal = textSheets * stock.centsPerSheet + cover.centsPerSheet + (textSheets * 2 + 2) * CLICK_RATE * 100;
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Text page count (min 48)">
          <input type="number" min={2} max={600} step={2} value={textPages} onChange={e=>setTextPages(+e.target.value)} style={iStyle}/>
          {!valid&&<div style={{color:'#c00',fontSize:'.8rem',marginTop:'.2rem'}}>{textPages<48?'Minimum 48 pages.':'Must be even.'}</div>}
        </CalcField>
        <CalcField label="Quantity"><input type="number" min={1} step={25} value={qty} onChange={e=>setQty(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Text stock">
          <select value={stockIdx} onChange={e=>setStockIdx(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverIdx} onChange={e=>setCoverIdx(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      {valid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
          <StatCard label="Spine width" value={fmtIn(spineIn)} sub={fmtMM(spineIn)} accent={spineIn>=0.25?'#166534':'#92400e'}/>
          <StatCard label="Text sheets" value={String(textSheets)} sub="per book"/>
          <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534"/>
          <StatCard label="Total marginal" value={fmt$(marginal*qty)} sub={`for ${qty.toLocaleString()}`} accent="#1e3a5f"/>
        </div>
      )}
    </div>
  );
}

function NUpCalc() {
  const [comicIdx, setComicIdx] = useState(0);
  const [sheetW, setSheetW] = useState(13);
  const [sheetH, setSheetH] = useState(19);
  const [bleed, setBleed] = useState(0.125);
  const [gutter, setGutter] = useState(0.125);
  const comic = COMIC_SIZES[comicIdx]!;
  const { cols, rows, nUp } = useMemo(() => {
    const pw = comic.w + bleed*2 + gutter, ph = comic.h + bleed*2 + gutter;
    const c = Math.floor((sheetW+gutter)/pw), r = Math.floor((sheetH+gutter)/ph);
    const c2 = Math.floor((sheetH+gutter)/pw), r2 = Math.floor((sheetW+gutter)/ph);
    if (c2*r2 > c*r) return { cols: c2, rows: r2, nUp: c2*r2 };
    return { cols: c, rows: r, nUp: c*r };
  }, [comic, sheetW, sheetH, bleed, gutter]);
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Page size">
          <select value={comicIdx} onChange={e=>setComicIdx(+e.target.value)} style={iStyle}>
            {COMIC_SIZES.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Sheet width (in)"><input type="number" min={1} max={48} step={0.25} value={sheetW} onChange={e=>setSheetW(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Sheet height (in)"><input type="number" min={1} max={48} step={0.25} value={sheetH} onChange={e=>setSheetH(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Bleed per edge (in)"><input type="number" min={0} max={0.5} step={0.0625} value={bleed} onChange={e=>setBleed(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Gutter (in)"><input type="number" min={0} max={0.5} step={0.0625} value={gutter} onChange={e=>setGutter(+e.target.value)} style={iStyle}/></CalcField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
        <StatCard label="N-up" value={nUp > 0 ? `${nUp}-up` : "Doesn't fit"} sub={`${cols} × ${rows}`} accent={nUp>0?'#166534':'#c00'}/>
        <StatCard label="Sheet efficiency" value={nUp>0?`${((nUp*comic.w*comic.h)/(sheetW*sheetH)*100).toFixed(1)}%`:'—'} sub="usable area"/>
      </div>
    </div>
  );
}

function CostCalc() {
  const [pages, setPages] = useState(32);
  const [qty, setQty] = useState(250);
  const [binding, setBinding] = useState<'saddle'|'perfect'>('saddle');
  const [stockIdx, setStockIdx] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);
  const [targetMargin, setTargetMargin] = useState(55);
  const stock = PAPER_STOCKS[stockIdx]!; const cover = COVER_STOCKS[coverIdx]!;
  const valid = binding==='saddle' ? pages%4===0&&pages>=8 : pages%2===0&&pages>=48;
  const textSheets = binding==='saddle' ? pages/4 : pages/2;
  const clicks = textSheets*2 + 2;
  const paperCents = textSheets*stock.centsPerSheet + cover.centsPerSheet;
  const marginal = paperCents + clicks*CLICK_RATE*100;
  const priceAt = (m: number) => Math.ceil(marginal/(1-m/100));
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Page count"><input type="number" min={4} step={binding==='saddle'?4:2} value={pages} onChange={e=>setPages(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Print quantity"><input type="number" min={1} step={25} value={qty} onChange={e=>setQty(+e.target.value)} style={iStyle}/></CalcField>
        <CalcField label="Binding">
          <select value={binding} onChange={e=>setBinding(e.target.value as 'saddle'|'perfect')} style={iStyle}>
            <option value="saddle">Saddle stitch</option><option value="perfect">Perfect bind</option>
          </select>
        </CalcField>
        <CalcField label="Interior stock">
          <select value={stockIdx} onChange={e=>setStockIdx(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverIdx} onChange={e=>setCoverIdx(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label={`Target margin: ${targetMargin}%`}>
          <input type="range" min={20} max={80} step={5} value={targetMargin} onChange={e=>setTargetMargin(+e.target.value)} style={{width:'100%',marginTop:'.5rem'}}/>
        </CalcField>
      </div>
      {valid && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
            <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534"/>
            <StatCard label={`Price at ${targetMargin}%`} value={fmt$(priceAt(targetMargin))} sub="suggested" accent="#7c3aed"/>
            <StatCard label="Total marginal" value={fmt$(marginal*qty)} sub={`${qty.toLocaleString()} books`} accent="#1e3a5f"/>
          </div>
          <div className="admin-card" style={{margin:0,padding:'1rem 1.25rem'}}>
            <h4 style={{margin:'0 0 .75rem'}}>Pricing at various margins</h4>
            <table className="admin-table">
              <thead><tr><th>Margin</th><th>Retail price</th><th>Gross / book</th><th>Total gross ({qty.toLocaleString()})</th></tr></thead>
              <tbody>
                {[30,40,50,60,70].map(m=>(
                  <tr key={m} style={{fontWeight:m===targetMargin?700:undefined,background:m===targetMargin?'var(--bg-alt)':undefined}}>
                    <td>{m}%</td><td>{fmt$(priceAt(m))}</td><td>{fmt$(priceAt(m)-marginal)}</td><td>{fmt$((priceAt(m)-marginal)*qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{margin:'.5rem 0 0',fontSize:'.78rem',color:'var(--muted)'}}>Marginal only (clicks + paper). Excludes lease overhead (~$1,900/mo) and labor.</p>
          </div>
        </>
      )}
    </div>
  );
}

function BleedRef() {
  const [sizeIdx, setSizeIdx] = useState(0);
  const size = COMIC_SIZES[sizeIdx]!;
  const bleed = 0.125, safe = 0.25;
  const totalW = size.w + bleed*2, totalH = size.h + bleed*2;
  const specs = [
    ['Finished trim size', `${size.w}″ × ${size.h}″`],
    ['Full bleed document size', `${totalW.toFixed(3)}″ × ${totalH.toFixed(3)}″`],
    ['Bleed (each edge)', '0.125″ (⅛″)'],
    ['Safe zone (text/logos)', '0.25″ from trim edge'],
    ['Color mode', 'CMYK — convert RGB before sending'],
    ['Resolution', '300 dpi minimum at final size'],
    ['Black text', 'K100 only (not rich black)'],
    ['Rich black (large fills)', 'C:60 M:40 Y:40 K:100'],
    ['PDF standard', 'PDF/X-1a or PDF/X-4 preferred'],
    ['Fonts', 'Embedded or outlined'],
  ];
  const scale = 180 / Math.max(totalW, totalH);
  const tW = totalW*scale, tH = totalH*scale;
  const bPx = bleed*scale, sPx = safe*scale;
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ maxWidth: 300 }}>
        <CalcField label="Page size">
          <select value={sizeIdx} onChange={e=>setSizeIdx(+e.target.value)} style={iStyle}>
            {COMIC_SIZES.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <div className="admin-card" style={{margin:0,padding:'1rem 1.25rem'}}>
          <h4 style={{margin:'0 0 .75rem'}}>Spec sheet</h4>
          <table className="admin-table"><tbody>
            {specs.map(([k,v])=><tr key={k}><td style={{color:'var(--muted)',whiteSpace:'nowrap'}}>{k}</td><td style={{fontWeight:600}}>{v}</td></tr>)}
          </tbody></table>
        </div>
        <div className="admin-card" style={{margin:0,padding:'1rem 1.25rem'}}>
          <h4 style={{margin:'0 0 .75rem'}}>Page diagram</h4>
          <div style={{position:'relative',width:tW,height:tH,margin:'0 auto'}}>
            <div style={{position:'absolute',inset:0,background:'#fecdd3',border:'2px solid #e11d48'}}/>
            <div style={{position:'absolute',inset:bPx,background:'#dbeafe',border:'2px dashed #2563eb'}}/>
            <div style={{position:'absolute',inset:bPx+sPx,border:'2px dashed #16a34a',background:'#f0fdf4'}}/>
            <div style={{position:'absolute',top:2,left:2,fontSize:'0.55rem',color:'#e11d48',fontWeight:700}}>BLEED</div>
            <div style={{position:'absolute',top:bPx+2,left:bPx+2,fontSize:'0.55rem',color:'#2563eb',fontWeight:700}}>TRIM</div>
            <div style={{position:'absolute',top:bPx+sPx+2,left:bPx+sPx+2,fontSize:'0.55rem',color:'#16a34a',fontWeight:700}}>SAFE</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Calculators() {
  const [tab, setTab] = useState<CalcTab>('saddle');
  const TABS: { id: CalcTab; label: string; desc: string }[] = [
    { id: 'saddle', label: 'Saddle Stitch', desc: 'Signature planner & cost' },
    { id: 'perfectbind', label: 'Perfect Bind', desc: 'Spine width & cost' },
    { id: 'nup', label: 'N-Up Fit', desc: 'Press sheet planner' },
    { id: 'cost', label: 'Cost Estimator', desc: 'Margin & pricing table' },
    { id: 'bleed', label: 'Bleed & Specs', desc: 'File prep reference' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 0, marginBottom: '2rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '.6rem 1.1rem', border: 'none',
            borderBottom: tab === t.id ? '3px solid var(--brand)' : '3px solid transparent',
            background: 'none', cursor: 'pointer',
            fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? 'var(--brand)' : 'var(--muted)',
            fontSize: '.9rem', transition: 'all .15s', borderRadius: '4px 4px 0 0',
          }}>
            {t.label}
            <div style={{ fontSize: '.7rem', fontWeight: 400, color: 'var(--muted)' }}>{t.desc}</div>
          </button>
        ))}
      </div>
      {tab === 'saddle' && <SaddlePlanner />}
      {tab === 'perfectbind' && <PerfectBindPlanner />}
      {tab === 'nup' && <NUpCalc />}
      {tab === 'cost' && <CostCalc />}
      {tab === 'bleed' && <BleedRef />}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export function AdminImpose() {
  const [topTab, setTopTab] = useState<TopTab>('tools');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const toolDef = TOOLS.find(t => t.id === activeTool);

  const handleSelect = (id: ToolId) => {
    setActiveTool(id);
    setTopTab('tools');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1080 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Imposition &amp; Pre-Press</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.75rem' }}>
        Real PDF imposition tools — processed locally, never uploaded. Plus pre-press calculators.
      </p>

      {/* Top tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {(['tools', 'calculators'] as TopTab[]).map(t => (
          <button key={t} onClick={() => { setTopTab(t); if (t !== 'tools') setActiveTool(null); }} style={{
            padding: '.6rem 1.25rem', border: 'none',
            borderBottom: topTab === t ? '3px solid var(--brand)' : '3px solid transparent',
            background: 'none', cursor: 'pointer',
            fontWeight: topTab === t ? 700 : 400,
            color: topTab === t ? 'var(--brand)' : 'var(--muted)',
            fontSize: '1rem', textTransform: 'capitalize',
          }}>
            {t === 'tools' ? 'Imposition Tools' : 'Pre-Press Calculators'}
          </button>
        ))}
      </div>

      {topTab === 'tools' ? (
        activeTool && toolDef ? (
          <ToolWorkspace tool={toolDef} onBack={() => setActiveTool(null)} />
        ) : (
          <ToolGallery onSelect={handleSelect} />
        )
      ) : (
        <Calculators />
      )}
    </div>
  );
}
