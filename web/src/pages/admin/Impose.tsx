import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  getPdfInfo, imposeBooklet, imposeNUp, computeNUpGrid, addCropMarksOnly,
  mergePdfs, rotatePdf, flipPdf, splitPdf, overlayPdf, shufflePages, cropPdf,
  addPageNumbers, addColorBar, imposeTiledPoster, imposeTickets,
  generateBleed, addHeaderFooter, addTextWatermark, addJobSlug, addCollatingMarks, preflight,
  downloadPdf, downloadMultiple,
} from '../../lib/impose';
import type {
  PdfPageInfo, BookletOptions, NUpOptions, CropMarksOptions,
  OverlayOptions, PageNumberOptions, TicketOptions,
  HeaderFooterOptions, WatermarkOptions, JobSlugOptions, PreflightReport,
} from '../../lib/impose';

// ── Constants ────────────────────────────────────────────────────────────────

const SHEET_PRESETS = [
  { label: 'Letter (8.5×11")', w: 8.5, h: 11 },
  { label: 'Letter L (11×8.5")', w: 11, h: 8.5 },
  { label: 'Legal (8.5×14")', w: 8.5, h: 14 },
  { label: 'Tabloid (11×17")', w: 11, h: 17 },
  { label: 'Tabloid L (17×11")', w: 17, h: 11 },
  { label: 'Tabloid+ (12×18")', w: 12, h: 18 },
  { label: 'Super-B (13×19")', w: 13, h: 19 },
  { label: 'SRA3 (12.6×17.7")', w: 12.6, h: 17.7 },
];

// Local mirrors of the inline engine option shapes.
interface PosterOptions {
  tilesAcross: number; tilesDown: number;
  sheetWIn: number; sheetHIn: number;
  overlapIn: number; addMarks: boolean; markLenIn: number; markOffIn: number;
}
interface ColorBarOptions { position: 'bottom' | 'top'; heightIn: number; }
interface CropBoxOptions { top: number; right: number; bottom: number; left: number; }

// ── Types ────────────────────────────────────────────────────────────────────

type ToolEngine =
  | 'booklet' | 'nup' | 'poster' | 'cropmarks' | 'colorbar' | 'pagenumbers'
  | 'tickets' | 'merge' | 'rotate' | 'flip' | 'split' | 'overlay' | 'shuffle' | 'crop';
type Status = 'idle' | 'loading' | 'processing' | 'done' | 'error';
type TopTab = 'tools' | 'workflows' | 'calculators';
type CalcTab = 'saddle' | 'perfectbind' | 'nup' | 'cost' | 'bleed';

interface LoadedFile { name: string; bytes: Uint8Array; info: PdfPageInfo; }
interface MergeFile { name: string; bytes: Uint8Array; }

interface ToolDef {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  category: string;
  engine: ToolEngine;
  badge?: string;
  Thumb: () => React.ReactElement;
  defaultNup?: Partial<NUpOptions>;
  defaultBooklet?: Partial<BookletOptions>;
  fitSource?: boolean;   // derive fixed cell size from the loaded page (Optimal Fit)
  panelGuide?: string[];
  note?: string;
}

// ── Reusable thumbnails ───────────────────────────────────────────────────────

function gridThumb(cols: number, rows: number, o: { numbered?: boolean; accent?: string } = {}) {
  return function GridThumb() {
    const W = 200, H = 148, pad = 12, gap = 5;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const ch = (H - pad * 2 - gap * (rows - 1)) / rows;
    const cells: React.ReactElement[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = pad + c * (cw + gap), y = pad + r * (ch + gap);
      cells.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width={cw} height={ch} rx={1} fill="#f1f5f9" stroke={o.accent ?? '#94a3b8'} />
          {o.numbered && (
            <text x={x + cw / 2} y={y + ch / 2 + 5} textAnchor="middle" fill="#64748b"
              fontSize={Math.min(16, ch * 0.42)} fontWeight={600}>{r * cols + c + 1}</text>
          )}
        </g>
      );
    }
    return <svg viewBox="0 0 200 148" width="100%" height="100%">{cells}</svg>;
  };
}

const ComicThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="10" y="14" width="82" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="108" y="14" width="82" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
    <line x1="100" y1="14" x2="100" y2="134" stroke="#cbd5e1" strokeDasharray="4,2" />
    <text x="51" y="78" textAnchor="middle" fill="#64748b" fontSize="22" fontWeight="700">16</text>
    <text x="149" y="78" textAnchor="middle" fill="#64748b" fontSize="22" fontWeight="700">1</text>
    {([
      [10, 14, 1, 1], [92, 14, 1, 1], [10, 134, 1, 0], [92, 134, 1, 0],
      [108, 14, 0, 1], [190, 14, 0, 1], [108, 134, 0, 0], [190, 134, 0, 0],
    ] as [number, number, number, number][]).map(([cx, cy, isLeft, isTop], i) => (
      <g key={i}>
        <line x1={cx + (isLeft ? -10 : -2)} y1={cy} x2={cx + (isLeft ? -3 : 5)} y2={cy} stroke="#e11d48" strokeWidth="1.2" />
        <line x1={cx} y1={cy + (isTop ? -10 : -2)} x2={cx} y2={cy + (isTop ? -3 : 5)} stroke="#e11d48" strokeWidth="1.2" />
      </g>
    ))}
  </svg>
);

const BookletThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="15" y="14" width="78" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="107" y="14" width="78" height="120" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
    <line x1="100" y1="14" x2="100" y2="134" stroke="#94a3b8" strokeWidth="2" />
    <rect x="28" y="30" width="48" height="8" rx="2" fill="#cbd5e1" />
    <rect x="28" y="46" width="36" height="5" rx="1" fill="#e2e8f0" />
    <rect x="28" y="56" width="42" height="5" rx="1" fill="#e2e8f0" />
    <rect x="120" y="30" width="50" height="8" rx="2" fill="#dde1e7" />
    <rect x="120" y="46" width="40" height="5" rx="1" fill="#e2e8f0" />
    <rect x="120" y="56" width="45" height="5" rx="1" fill="#e2e8f0" />
  </svg>
);

const cardThumb = (cols: number, rows: number, badge?: string) => function CardThumb() {
  const W = 200, H = 148, pad = 14, gap = 8;
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (H - pad * 2 - gap * (rows - 1)) / rows;
  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = pad + c * (cw + gap), y = pad + r * (ch + gap);
    cells.push(
      <g key={`${r}-${c}`}>
        <rect x={x} y={y} width={cw} height={ch} rx={3} fill="#eef2ff" stroke="#818cf8" />
        <rect x={x + 4} y={y + 4} width={cw - 8} height={ch * 0.42} rx={2} fill="#c7d2fe" />
      </g>
    );
  }
  return (
    <svg viewBox="0 0 200 148" width="100%" height="100%">
      {cells}
      {badge && <text x="184" y="24" textAnchor="middle" fontSize="20">{badge}</text>}
    </svg>
  );
};

const foldThumb = (panels: number) => function FoldThumb() {
  const W = 200, H = 148, pad = 16;
  const pw = (W - pad * 2) / panels;
  const items: React.ReactElement[] = [];
  for (let i = 0; i < panels; i++) {
    const x = pad + i * pw;
    items.push(<rect key={i} x={x} y={22} width={pw} height={104} fill={i % 2 ? '#f8fafc' : '#f1f5f9'} stroke="#94a3b8" />);
    if (i < panels - 1) items.push(<line key={`f${i}`} x1={x + pw} y1={16} x2={x + pw} y2={132} stroke="#cbd5e1" strokeDasharray="3,3" />);
  }
  return <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{items}</svg>;
};

const MarksThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="32" y="18" width="136" height="112" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
    {([[32, 18, 1, 1], [168, 18, 0, 1], [32, 130, 1, 0], [168, 130, 0, 0]] as [number, number, number, number][]).map(([cx, cy, isL, isT], i) => (
      <g key={i}>
        <line x1={cx + (isL ? -18 : -2)} y1={cy} x2={cx + (isL ? -6 : 10)} y2={cy} stroke="#e11d48" strokeWidth="1.5" />
        <line x1={cx} y1={cy + (isT ? -18 : -2)} x2={cx} y2={cy + (isT ? -6 : 10)} stroke="#e11d48" strokeWidth="1.5" />
      </g>
    ))}
    <rect x="46" y="34" width="108" height="12" rx="2" fill="#cbd5e1" />
    <rect x="46" y="54" width="80" height="6" rx="1" fill="#e2e8f0" />
    <rect x="46" y="66" width="92" height="6" rx="1" fill="#e2e8f0" />
  </svg>
);

const ColorBarThumb = () => {
  const cols = ['#00b3b3', '#c800c8', '#c8c800', '#222', '#c00', '#0a0', '#06c', '#eee', '#bbb', '#888'];
  return (
    <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
      <rect x="24" y="18" width="152" height="94" rx="1" fill="#f1f5f9" stroke="#94a3b8" />
      <rect x="38" y="34" width="120" height="10" rx="2" fill="#cbd5e1" />
      <rect x="38" y="52" width="90" height="6" rx="1" fill="#e2e8f0" />
      {cols.map((c, i) => <rect key={i} x={24 + i * 15.2} y={118} width={15.2} height={14} fill={c} />)}
    </svg>
  );
};

const PageNumThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="55" y="16" width="90" height="116" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="68" y="32" width="64" height="10" rx="2" fill="#cbd5e1" />
    <rect x="68" y="50" width="44" height="6" rx="1" fill="#e2e8f0" />
    <rect x="68" y="62" width="54" height="6" rx="1" fill="#e2e8f0" />
    <circle cx="100" cy="118" r="9" fill="#dbeafe" stroke="#2563eb" />
    <text x="100" y="122" textAnchor="middle" fill="#2563eb" fontSize="10" fontWeight="700">7</text>
  </svg>
);

const MergeThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    {[0, 1, 2].map(i => (
      <g key={i} transform={`translate(${-i * 8},${i * 12})`}>
        <rect x="50" y="20" width="100" height="110" rx="2" fill={i === 0 ? '#f1f5f9' : '#e2e8f0'} stroke="#94a3b8" />
        {i === 0 && <>
          <rect x="62" y="36" width="76" height="10" rx="2" fill="#cbd5e1" />
          <rect x="62" y="54" width="58" height="6" rx="1" fill="#e2e8f0" />
        </>}
      </g>
    ))}
    <line x1="100" y1="96" x2="100" y2="116" stroke="#64748b" strokeWidth="2" />
    <path d="M96 108 L100 116 L104 108" stroke="#64748b" strokeWidth="2" fill="none" />
  </svg>
);

const RotateThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="55" y="24" width="90" height="110" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="68" y="40" width="64" height="10" rx="2" fill="#cbd5e1" />
    <path d="M148 40 C165 40 172 55 172 74 C172 93 162 106 148 110" stroke="#64748b" strokeWidth="2" fill="none" />
    <polygon points="148,40 155,30 141,30" fill="#64748b" />
  </svg>
);

const FlipThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="24" y="30" width="66" height="88" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="34" y="42" width="46" height="10" rx="2" fill="#cbd5e1" />
    <rect x="34" y="58" width="30" height="6" rx="1" fill="#e2e8f0" />
    <rect x="110" y="30" width="66" height="88" rx="2" fill="#f8fafc" stroke="#cbd5e1" transform="translate(200,0) scale(-1,1)" />
    <rect x="120" y="42" width="46" height="10" rx="2" fill="#e2e8f0" transform="translate(200,0) scale(-1,1)" />
    <line x1="100" y1="22" x2="100" y2="126" stroke="#94a3b8" strokeDasharray="4,3" />
  </svg>
);

const SplitThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="18" y="34" width="70" height="90" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="112" y="20" width="60" height="52" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="112" y="86" width="60" height="42" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <path d="M90 60 L108 40" stroke="#64748b" strokeWidth="2" fill="none" />
    <path d="M90 90 L108 104" stroke="#64748b" strokeWidth="2" fill="none" />
  </svg>
);

const OverlayThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="45" y="20" width="110" height="108" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="58" y="36" width="84" height="10" rx="2" fill="#cbd5e1" />
    <rect x="58" y="54" width="60" height="6" rx="1" fill="#e2e8f0" />
    <text x="100" y="92" textAnchor="middle" fill="#e11d48" fontSize="22" fontWeight="800"
      opacity="0.35" transform="rotate(-24 100 88)">DRAFT</text>
  </svg>
);

const ShuffleThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    {[['3', 20], ['1', 74], ['2', 128]].map(([n, x], i) => (
      <g key={i}>
        <rect x={x as number} y="42" width="52" height="64" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
        <text x={(x as number) + 26} y="80" textAnchor="middle" fill="#64748b" fontSize="20" fontWeight="700">{n}</text>
      </g>
    ))}
    <path d="M46 120 C90 140 110 140 154 120" stroke="#64748b" strokeWidth="1.5" fill="none" strokeDasharray="3,3" />
  </svg>
);

const CropToolThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="30" y="22" width="140" height="104" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="3,3" />
    <rect x="58" y="42" width="84" height="64" rx="1" fill="#f1f5f9" stroke="#334155" strokeWidth="2" />
    <line x1="58" y1="14" x2="58" y2="134" stroke="#334155" strokeWidth="1" />
    <line x1="142" y1="14" x2="142" y2="134" stroke="#334155" strokeWidth="1" />
    <line x1="22" y1="42" x2="178" y2="42" stroke="#334155" strokeWidth="1" />
    <line x1="22" y1="106" x2="178" y2="106" stroke="#334155" strokeWidth="1" />
  </svg>
);

const PosterThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    {Array.from({ length: 6 }, (_, i) => { const c = i % 3, r = Math.floor(i / 3); return (
      <rect key={i} x={20 + c * 54} y={20 + r * 56} width={50} height={52} fill={(c + r) % 2 ? '#eef2ff' : '#f1f5f9'} stroke="#94a3b8" />
    ); })}
    <path d="M40 46 Q100 10 160 46 T 160 100" stroke="#818cf8" strokeWidth="3" fill="none" opacity="0.7" />
  </svg>
);

const TicketThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    {[24, 62, 100].map((y, i) => (
      <g key={i}>
        <rect x="26" y={y} width="148" height="30" rx="3" fill="#fff7ed" stroke="#fb923c" />
        <line x1="132" y1={y} x2="132" y2={y + 30} stroke="#fb923c" strokeDasharray="3,2" />
        <rect x="36" y={y + 8} width="60" height="6" rx="1" fill="#fed7aa" />
        <text x="153" y={y + 20} textAnchor="middle" fill="#c2410c" fontSize="11" fontWeight="700">{`00${i + 1}`}</text>
      </g>
    ))}
  </svg>
);

// ── Tool catalog ─────────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  // ── Booklets & Books ──
  {
    id: 'comic', name: 'Comic Book', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Saddle-stitch 2-up for standard US comic format with creep + bleed marks.',
    tags: ['2-up', 'saddle-stitch', 'creep', '⅛″ bleed'],
    defaultBooklet: { marginIn: 0.5, gutterIn: 0, creepIn: 0.125 },
    Thumb: ComicThumb,
  },
  {
    id: 'booklet', name: 'Booklet', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Generic 2-up saddle-stitch on any press sheet. Auto-detects page size.',
    tags: ['2-up', 'auto-size', 'LTR / RTL'],
    Thumb: BookletThumb,
  },
  {
    id: 'magazine', name: 'Saddle-Stitch Magazine', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Full-size magazine imposition with wider margins for trim and grip.',
    tags: ['saddle-stitch', 'wide margin', 'creep'],
    defaultBooklet: { marginIn: 0.6, creepIn: 0.09 },
    Thumb: BookletThumb,
  },
  {
    id: 'perfectbound', name: 'Perfect-Bound Book', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Gather 2-up folios into signatures for a square, glued spine.',
    tags: ['folios', 'signatures', 'no creep'],
    defaultBooklet: { creepIn: 0, marginIn: 0.5 },
    note: 'Perfect binding gathers folded sheets (folios). Print, fold, then stack signatures in order before gluing the spine — do not nest them like saddle stitch.',
    Thumb: BookletThumb,
  },
  {
    id: 'zine', name: 'Zine', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Small self-published booklet — great for 8- to 16-page mini-comics.',
    tags: ['mini', '8–16 pp', 'saddle-stitch'],
    defaultBooklet: { marginIn: 0.35, creepIn: 0.06 },
    Thumb: BookletThumb,
  },
  {
    id: 'program', name: 'Event Program', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Folded program for shows, weddings and services — 2-up saddle-stitch.',
    tags: ['saddle-stitch', 'folded', 'events'],
    defaultBooklet: { marginIn: 0.5 },
    Thumb: BookletThumb,
  },
  {
    id: 'catalog', name: 'Catalog', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Product catalog imposition with creep for thicker page counts.',
    tags: ['saddle-stitch', 'creep', 'retail'],
    defaultBooklet: { marginIn: 0.5, creepIn: 0.15 },
    Thumb: BookletThumb,
  },
  {
    id: 'greeting', name: 'Greeting Card', category: 'Booklets & Books', engine: 'booklet',
    desc: 'Half-fold greeting card — a 4-page booklet from one folded sheet.',
    tags: ['half-fold', '4-page', 'card'],
    defaultBooklet: { marginIn: 0.25, creepIn: 0, addMarks: true },
    note: 'Supply a 4-page PDF (front, inside-left, inside-right, back). Prints one folded sheet.',
    Thumb: BookletThumb,
  },

  // ── Imposition & Layout ──
  {
    id: 'nup', name: 'N-Up Grid', category: 'Imposition & Layout', engine: 'nup',
    desc: 'Place multiple pages on a press sheet — sequential order, any rows × cols.',
    tags: ['custom grid', 'gutters', 'crop marks'],
    defaultNup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17 },
    Thumb: gridThumb(2, 2, { numbered: true }),
  },
  {
    id: 'steprepeat', name: 'Step & Repeat', category: 'Imposition & Layout', engine: 'nup',
    desc: 'One design tiled across the whole sheet — covers, stickers, cards.',
    tags: ['identical copies', 'shared marks'],
    defaultNup: { cols: 3, rows: 3, sheetWIn: 11, sheetHIn: 17, repeatFirst: true },
    Thumb: gridThumb(3, 3),
  },
  {
    id: 'cutstack', name: 'Cut & Stack', category: 'Imposition & Layout', engine: 'nup',
    desc: 'Order pages so cut piles stack into sequence — fastest way to collate.',
    tags: ['cut & stack', 'collation', 'high volume'],
    defaultNup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17, cutStack: true },
    note: 'Print all sheets, guillotine-cut the stack into piles by cell position, then set the piles on top of each other in order — pages fall into sequence.',
    Thumb: gridThumb(2, 2, { numbered: true, accent: '#818cf8' }),
  },
  {
    id: 'contact', name: 'Index / Contact Sheet', category: 'Imposition & Layout', engine: 'nup',
    desc: 'Thumbnail every page of a PDF onto proof sheets for quick review.',
    tags: ['thumbnails', 'proof', 'sequential'],
    defaultNup: { cols: 4, rows: 5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.3, gutterIn: 0.1, addMarks: false },
    Thumb: gridThumb(4, 5),
  },
  {
    id: 'optimalfit', name: 'Optimal Fit', category: 'Imposition & Layout', engine: 'nup',
    desc: 'Auto-pack as many copies of your page as fit the sheet at true size.',
    tags: ['auto n-up', 'best yield', 'true size'],
    defaultNup: { sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.125, repeatFirst: true },
    fitSource: true,
    note: 'The page is placed at its native size and packed edge-to-edge. Drop a page that already includes bleed.',
    Thumb: gridThumb(3, 4),
  },
  {
    id: 'poster', name: 'Tiled Poster', category: 'Imposition & Layout', engine: 'poster',
    desc: 'Blow one page up across several sheets to tile into a large poster.',
    tags: ['enlarge', 'tile', 'overlap'],
    Thumb: PosterThumb,
  },

  // ── Cards & Labels ──
  {
    id: 'business', name: 'Business Cards', category: 'Cards & Labels', engine: 'nup',
    desc: 'Standard 3.5×2″ cards, auto-packed with crop marks in the gutters.',
    tags: ['3.5×2″', 'auto-fit', 'crop marks'],
    defaultNup: { cellWIn: 3.5, cellHIn: 2, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 },
    Thumb: cardThumb(2, 4),
  },
  {
    id: 'trading', name: 'Trading Cards', category: 'Cards & Labels', engine: 'nup', badge: '★',
    desc: 'Standard 2.5×3.5″ trading cards — 9-up on letter with cut marks.',
    tags: ['2.5×3.5″', '9-up', 'cut marks'],
    defaultNup: { cellWIn: 2.5, cellHIn: 3.5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.125, gutterIn: 0.125 },
    note: 'Design each card at 2.5×3.5″. Drop a multi-page PDF for a mixed sheet, or pick "Same design repeated". For full-bleed art switch the sheet to 12×18″ (SRA3/tabloid+) so the ⅛″ bleed has room.',
    Thumb: cardThumb(3, 3, '★'),
  },
  {
    id: 'postcard', name: 'Postcards', category: 'Cards & Labels', engine: 'nup',
    desc: '4×6″ postcards packed onto large sheets with trim marks.',
    tags: ['4×6″', 'auto-fit', 'mailer'],
    defaultNup: { cellWIn: 6, cellHIn: 4, sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.125 },
    Thumb: cardThumb(2, 3),
  },
  {
    id: 'labels', name: 'Labels (Avery 5160)', category: 'Cards & Labels', engine: 'nup',
    desc: '30-up 2.625×1″ address labels matched to the Avery 5160 die.',
    tags: ['30-up', 'Avery 5160', 'die-cut'],
    defaultNup: { cellWIn: 2.625, cellHIn: 1, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.1875, gutterIn: 0.125, gutterYIn: 0, addMarks: false },
    note: 'Sized to the Avery 5160 sheet (3 across × 10 down). Turn off crop marks — the label stock is pre-die-cut.',
    Thumb: gridThumb(3, 10),
  },
  {
    id: 'bookmark', name: 'Bookmarks', category: 'Cards & Labels', engine: 'nup',
    desc: 'Tall 2×6″ bookmarks packed several-up with cut marks.',
    tags: ['2×6″', 'auto-fit', 'cut marks'],
    defaultNup: { cellWIn: 2, cellHIn: 6, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 },
    Thumb: cardThumb(4, 1),
  },
  {
    id: 'hangtag', name: 'Hang Tags', category: 'Cards & Labels', engine: 'nup',
    desc: '2×3.5″ product hang tags, auto-packed with trim marks.',
    tags: ['2×3.5″', 'retail', 'auto-fit'],
    defaultNup: { cellWIn: 2, cellHIn: 3.5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 },
    Thumb: cardThumb(3, 3),
  },
  {
    id: 'photo', name: 'Photo Prints', category: 'Cards & Labels', engine: 'nup',
    desc: 'Gang 4×6″ photos (or set any size) onto a sheet with cut marks.',
    tags: ['4×6″', 'gang-up', 'cut marks'],
    defaultNup: { cellWIn: 6, cellHIn: 4, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 },
    Thumb: cardThumb(1, 2),
  },
  {
    id: 'flyer', name: 'Flyers', category: 'Cards & Labels', engine: 'nup',
    desc: 'Half-page 5.5×8.5″ flyers ganged 4-up on a 12×18″ sheet with cut marks.',
    tags: ['5.5×8.5″', '4-up', 'cut marks'],
    defaultNup: { cellWIn: 5.5, cellHIn: 8.5, sheetWIn: 12, sheetHIn: 18, marginIn: 0.25, gutterIn: 0.25 },
    Thumb: cardThumb(2, 2),
  },
  {
    id: 'namebadge', name: 'Name Badges', category: 'Cards & Labels', engine: 'nup',
    desc: '8-up 3.375×2.33″ badge inserts, matched to standard clip holders.',
    tags: ['8-up', 'inserts', 'events'],
    defaultNup: { cellWIn: 3.375, cellHIn: 2.33, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.5, gutterIn: 0.125, gutterYIn: 0.1 },
    Thumb: cardThumb(2, 4),
  },
  {
    id: 'envelope', name: 'Envelopes', category: 'Cards & Labels', engine: 'nup',
    desc: 'Lay out #10 (9.5×4.125″) envelope artwork, auto-packed onto a tabloid sheet.',
    tags: ['#10', 'auto-fit', 'mailer'],
    defaultNup: { cellWIn: 9.5, cellHIn: 4.125, sheetWIn: 11, sheetHIn: 17, marginIn: 0.25, gutterIn: 0.25 },
    Thumb: cardThumb(1, 3),
  },

  // ── Folding ──
  {
    id: 'trifold', name: 'Trifold Brochure', category: 'Folding', engine: 'nup',
    desc: 'Three panels per side on a landscape sheet — classic letter-fold brochure.',
    tags: ['3 panels', 'letter-fold', '6 pages'],
    defaultNup: { cols: 3, rows: 1, sheetWIn: 11, sheetHIn: 8.5, marginIn: 0.25, gutterIn: 0 },
    panelGuide: ['Sheet 1 = outside (back cover · front cover · fold-in flap)', 'Sheet 2 = inside spread (left · middle · right)'],
    note: 'Supply 6 pages in panel order (outside L→R, then inside L→R). The fold-in panel should be ~1⁄16″ narrower in your artwork.',
    Thumb: foldThumb(3),
  },
  {
    id: 'wedding', name: 'Wedding Invitation', category: 'Folding', engine: 'nup',
    desc: 'Quarter-fold invitation — four panels on a single portrait sheet.',
    tags: ['quarter-fold', '4 panels', 'invite'],
    defaultNup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0 },
    panelGuide: ['Top-left · Top-right', 'Bottom-left · Bottom-right'],
    note: 'Supply 4 panels in reading order. Fold in half twice. Add a second 4-page file for a double-sided invite.',
    Thumb: gridThumb(2, 2),
  },
  {
    id: 'menu', name: 'Menu / Bi-fold', category: 'Folding', engine: 'booklet',
    desc: 'Single-fold menu — 4 pages on one folded sheet, 2-up saddle layout.',
    tags: ['bi-fold', '4-page', 'menu'],
    defaultBooklet: { marginIn: 0.4, creepIn: 0, addMarks: true },
    note: 'Supply a 4-page PDF (front, inside-left, inside-right, back).',
    Thumb: foldThumb(2),
  },

  // ── Tickets & Data ──
  {
    id: 'tickets', name: 'Numbered Tickets', category: 'Tickets & Data', engine: 'tickets',
    desc: 'Repeat one ticket design and stamp a running number on every copy.',
    tags: ['sequential #', 'raffle', 'stubs'],
    Thumb: TicketThumb,
  },

  // ── Marks & Prepress ──
  {
    id: 'cropmarks', name: 'Crop Marks', category: 'Marks & Prepress', engine: 'cropmarks',
    desc: 'Add trim marks and a bleed offset to any PDF without rearranging pages.',
    tags: ['marks only', 'bleed offset', 'per-page'],
    Thumb: MarksThumb,
  },
  {
    id: 'colorbar', name: 'Color Bar', category: 'Marks & Prepress', engine: 'colorbar',
    desc: 'Append a CMYK/registration color strip for press density control.',
    tags: ['CMYK strip', 'density', 'press control'],
    Thumb: ColorBarThumb,
  },
  {
    id: 'pagenumbers', name: 'Page Numbering', category: 'Marks & Prepress', engine: 'pagenumbers',
    desc: 'Stamp folio page numbers with a prefix/suffix in any corner.',
    tags: ['folios', 'prefix/suffix', 'any corner'],
    Thumb: PageNumThumb,
  },

  // ── Page & PDF Tools ──
  {
    id: 'merge', name: 'Merge PDFs', category: 'Page & PDF Tools', engine: 'merge',
    desc: 'Combine multiple PDF files into one document in any order.',
    tags: ['multiple files', 'set order'],
    Thumb: MergeThumb,
  },
  {
    id: 'split', name: 'Split PDF', category: 'Page & PDF Tools', engine: 'split',
    desc: 'Break a PDF into separate files by page ranges (e.g. 1-3, 4-6, 7).',
    tags: ['page ranges', 'multi-output'],
    Thumb: SplitThumb,
  },
  {
    id: 'rotate', name: 'Rotate', category: 'Page & PDF Tools', engine: 'rotate',
    desc: 'Rotate all pages in a PDF by 90°, 180°, or 270°.',
    tags: ['all pages', '90 / 180 / 270°'],
    Thumb: RotateThumb,
  },
  {
    id: 'flip', name: 'Flip / Mirror', category: 'Page & PDF Tools', engine: 'flip',
    desc: 'Mirror every page horizontally or vertically — handy for transfers.',
    tags: ['mirror', 'H / V', 'transfers'],
    Thumb: FlipThumb,
  },
  {
    id: 'overlay', name: 'Overlay / Watermark', category: 'Page & PDF Tools', engine: 'overlay',
    desc: 'Stamp a second PDF over every page — watermark, logo or background.',
    tags: ['watermark', 'opacity', 'tile / fill'],
    Thumb: OverlayThumb,
  },
  {
    id: 'shuffle', name: 'Shuffle Pages', category: 'Page & PDF Tools', engine: 'shuffle',
    desc: 'Reorder, duplicate or drop pages with a simple order list.',
    tags: ['reorder', 'custom order'],
    Thumb: ShuffleThumb,
  },
  {
    id: 'crop', name: 'Crop', category: 'Page & PDF Tools', engine: 'crop',
    desc: 'Trim margins off every page by setting a crop inset per edge.',
    tags: ['trim edges', 'crop box'],
    Thumb: CropToolThumb,
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

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>{children}</div>;
}

function NoteBanner({ text }: { text: string }) {
  return (
    <div style={{ padding: '.7rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '.82rem', color: '#92400e', lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

// Shared sheet-size selector used by grid-based settings.
function SheetPicker<T extends { sheetWIn: number; sheetHIn: number }>({ opts, set }: {
  opts: T; set: (k: 'sheetWIn' | 'sheetHIn', v: number) => void;
}) {
  const preset = SHEET_PRESETS.find(p => p.w === opts.sheetWIn && p.h === opts.sheetHIn);
  return (
    <>
      <Field label="Sheet preset">
        <select value={preset ? `${preset.w}x${preset.h}` : 'custom'} onChange={e => {
          const p = SHEET_PRESETS.find(s => `${s.w}x${s.h}` === e.target.value);
          if (p) { set('sheetWIn', p.w); set('sheetHIn', p.h); }
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
    </>
  );
}

// ── File drop zone ────────────────────────────────────────────────────────────

function FileDrop({ onFile, multiple = false, label = 'Drop a PDF here, or click to select' }: {
  onFile: (files: File[]) => void; multiple?: boolean; label?: string;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = useCallback((files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length) onFile(pdfs);
  }, [onFile]);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); };
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${drag ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 10, padding: '2rem 1.5rem', textAlign: 'center', cursor: 'pointer',
        background: drag ? '#fff8f8' : 'var(--bg-alt)', transition: 'all .15s',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
      <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.25rem' }}>
        PDF only — processed locally, never uploaded
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple={multiple} style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => handle(e.target.files)} />
    </div>
  );
}

function FileBar({ file, onClear, label = 'Change' }: { file: LoadedFile; onClear: () => void; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.65rem 1rem', background: 'var(--bg-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: '1.1rem' }}>📄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
          {file.info.count} page{file.info.count !== 1 ? 's' : ''} · {file.info.widthIn}″ × {file.info.heightIn}″
        </div>
      </div>
      <button className="btn secondary" style={{ padding: '.3rem .65rem', fontSize: '.8rem' }} onClick={onClear}>{label}</button>
    </div>
  );
}

// ── Booklet settings + preview ────────────────────────────────────────────────

const DEFAULT_BOOKLET: BookletOptions = {
  rtl: false, marginIn: 0.5, gutterIn: 0, creepIn: 0.125,
  addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};

function BookletSettings({ opts, onChange }: { opts: BookletOptions; onChange: (o: BookletOptions) => void }) {
  const set = <K extends keyof BookletOptions>(k: K, v: BookletOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
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
    </Grid>
  );
}

function BookletPreview({ pageCount, opts }: { pageCount: number; opts: BookletOptions }) {
  const paddedN = Math.ceil(pageCount / 4) * 4;
  const numSheets = paddedN / 4;
  const sheets = useMemo(() => Array.from({ length: numSheets }, (_, s) => {
    let aL: number, aR: number, bL: number, bR: number;
    if (!opts.rtl) { aL = paddedN - s * 2; aR = s * 2 + 1; bL = s * 2 + 2; bR = paddedN - s * 2 - 1; }
    else { aL = s * 2 + 1; aR = paddedN - s * 2; bL = paddedN - s * 2 - 1; bR = s * 2 + 2; }
    return { sheet: s + 1, aL, aR, bL, bR };
  }), [numSheets, paddedN, opts.rtl]);

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
          <thead><tr><th>Sheet</th><th>Side A (Front)</th><th>Side B (Back)</th></tr></thead>
          <tbody>
            {sheets.map(({ sheet, aL, aR, bL, bR }) => (
              <tr key={sheet}>
                <td style={{ fontWeight: 700, color: 'var(--muted)' }}>#{sheet}</td>
                <td><SpreadCell left={aL} right={aR} total={pageCount} rtl={opts.rtl} /></td>
                <td><SpreadCell left={bL} right={bR} total={pageCount} rtl={opts.rtl} /></td>
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
  const lBlank = left > total, rBlank = right > total;
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
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '.15rem .4rem', borderRadius: 4, fontSize: '.78rem',
      background: blank ? '#f1f5f9' : 'var(--bg-alt)', border: `1px solid ${blank ? '#e2e8f0' : 'var(--border)'}`,
      color: blank ? '#94a3b8' : 'var(--ink)',
    }}>
      <span style={{ fontSize: '.65rem', color: '#94a3b8' }}>{label}</span>
      {blank ? 'blank' : `p.${n}`}
    </span>
  );
}

// ── N-Up settings + preview (handles grid mode and fixed-cell card mode) ───────

const DEFAULT_NUP: NUpOptions = {
  cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17,
  marginIn: 0.25, gutterIn: 0.125, repeatFirst: false,
  addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};

function NUpSettings({ opts, onChange, cardMode }: { opts: NUpOptions; onChange: (o: NUpOptions) => void; cardMode: boolean }) {
  const set = <K extends keyof NUpOptions>(k: K, v: NUpOptions[K]) => onChange({ ...opts, [k]: v });
  const orderVal = opts.repeatFirst ? 'repeat' : opts.cutStack ? 'cutstack' : 'seq';
  const setOrder = (v: string) => onChange({ ...opts, repeatFirst: v === 'repeat', cutStack: v === 'cutstack' });

  return (
    <Grid>
      <SheetPicker opts={opts} set={set} />
      {cardMode ? (
        <>
          <Field label="Item width (in)">
            <input type="number" min={0.5} max={24} step={0.0625} value={opts.cellWIn ?? 3.5} onChange={e => set('cellWIn', +e.target.value)} style={iStyle} />
          </Field>
          <Field label="Item height (in)">
            <input type="number" min={0.5} max={24} step={0.0625} value={opts.cellHIn ?? 2} onChange={e => set('cellHIn', +e.target.value)} style={iStyle} />
          </Field>
          <Field label="Column gap (in)">
            <input type="number" min={0} max={2} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} />
          </Field>
          <Field label="Row gap (in)">
            <input type="number" min={0} max={2} step={0.0625} value={opts.gutterYIn ?? opts.gutterIn} onChange={e => set('gutterYIn', +e.target.value)} style={iStyle} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Columns">
            <input type="number" min={1} max={20} step={1} value={opts.cols} onChange={e => set('cols', +e.target.value)} style={iStyle} />
          </Field>
          <Field label="Rows">
            <input type="number" min={1} max={20} step={1} value={opts.rows} onChange={e => set('rows', +e.target.value)} style={iStyle} />
          </Field>
          <Field label="Gutter (in)" note="Between cells">
            <input type="number" min={0} max={1} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} />
          </Field>
        </>
      )}
      <Field label="Margin (in)" note="Outer edge of sheet">
        <input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Page order">
        <select value={orderVal} onChange={e => setOrder(e.target.value)} style={iStyle}>
          <option value="seq">Sequential (1, 2, 3…)</option>
          <option value="repeat">Same design repeated</option>
          <option value="cutstack">Cut &amp; stack</option>
        </select>
      </Field>
      <Field label="Crop marks">
        <Row>
          <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} />
          <span style={{ fontSize: '.85rem' }}>Add crop marks</span>
        </Row>
      </Field>
    </Grid>
  );
}

function NUpPreview({ opts, pageCount }: { opts: NUpOptions; pageCount: number }) {
  const grid = computeNUpGrid(opts);
  const perSheet = grid.cols * grid.rows;
  const numSheets = opts.repeatFirst ? 1 : Math.max(1, Math.ceil(pageCount / perSheet));
  const cellW = grid.cellWPt / 72, cellH = grid.cellHPt / 72;

  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>
        Layout: {grid.cols}×{grid.rows} ({perSheet}-up) on {opts.sheetWIn}″×{opts.sheetHIn}″
        <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--muted)', marginLeft: '.5rem' }}>
          {opts.repeatFirst ? '1 sheet' : `${numSheets} output sheet${numSheets !== 1 ? 's' : ''}`} · cell {cellW.toFixed(2)}″×{cellH.toFixed(2)}″
        </span>
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {Array.from({ length: Math.min(perSheet, opts.repeatFirst ? perSheet : pageCount) }, (_, i) => {
          const pn = opts.repeatFirst ? 1 : opts.cutStack ? i * numSheets + 1 : i + 1;
          return (
            <div key={i} style={{
              padding: '.2rem .4rem', borderRadius: 4, fontSize: '.78rem', fontWeight: 600,
              background: 'var(--bg-alt)', border: '1px solid var(--border)', minWidth: 36, textAlign: 'center',
            }}>p.{pn}</div>
          );
        })}
        {!opts.repeatFirst && pageCount > perSheet && (
          <div style={{ padding: '.2rem .4rem', color: 'var(--muted)', fontSize: '.78rem' }}>
            +{numSheets - 1} more sheet{numSheets > 2 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Poster settings ───────────────────────────────────────────────────────────

const DEFAULT_POSTER: PosterOptions = {
  tilesAcross: 2, tilesDown: 2, sheetWIn: 8.5, sheetHIn: 11,
  overlapIn: 0.5, addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};

function PosterSettings({ opts, onChange }: { opts: PosterOptions; onChange: (o: PosterOptions) => void }) {
  const set = <K extends keyof PosterOptions>(k: K, v: PosterOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <SheetPicker opts={opts} set={set} />
      <Field label="Tiles across"><input type="number" min={1} max={10} step={1} value={opts.tilesAcross} onChange={e => set('tilesAcross', +e.target.value)} style={iStyle} /></Field>
      <Field label="Tiles down"><input type="number" min={1} max={10} step={1} value={opts.tilesDown} onChange={e => set('tilesDown', +e.target.value)} style={iStyle} /></Field>
      <Field label="Overlap (in)" note="Glue margin between tiles"><input type="number" min={0} max={2} step={0.0625} value={opts.overlapIn} onChange={e => set('overlapIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Trim marks">
        <Row><input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Add trim marks</span></Row>
      </Field>
    </Grid>
  );
}

// ── Crop-marks settings ───────────────────────────────────────────────────────

const DEFAULT_CROP: CropMarksOptions = { bleedIn: 0.125, marginIn: 0.5, markLenIn: 0.25, markOffIn: 0.125 };

function CropSettings({ opts, onChange }: { opts: CropMarksOptions; onChange: (o: CropMarksOptions) => void }) {
  const set = <K extends keyof CropMarksOptions>(k: K, v: number) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Existing bleed (in)" note="Bleed already in the file"><input type="number" min={0} max={0.5} step={0.0625} value={opts.bleedIn} onChange={e => set('bleedIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Added margin (in)" note="Blank area added for marks"><input type="number" min={0.25} max={1.5} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark length (in)"><input type="number" min={0.1} max={0.5} step={0.0625} value={opts.markLenIn} onChange={e => set('markLenIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark offset (in)" note="Gap between trim and mark"><input type="number" min={0.05} max={0.25} step={0.0625} value={opts.markOffIn} onChange={e => set('markOffIn', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

// ── Color-bar settings ────────────────────────────────────────────────────────

const DEFAULT_COLORBAR: ColorBarOptions = { position: 'bottom', heightIn: 0.25 };

function ColorBarSettings({ opts, onChange }: { opts: ColorBarOptions; onChange: (o: ColorBarOptions) => void }) {
  const set = <K extends keyof ColorBarOptions>(k: K, v: ColorBarOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Position">
        <select value={opts.position} onChange={e => set('position', e.target.value as 'bottom' | 'top')} style={iStyle}>
          <option value="bottom">Bottom of page</option>
          <option value="top">Top of page</option>
        </select>
      </Field>
      <Field label="Bar height (in)"><input type="number" min={0.1} max={1} step={0.0625} value={opts.heightIn} onChange={e => set('heightIn', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

// ── Page-number settings ──────────────────────────────────────────────────────

const DEFAULT_PAGENUM: PageNumberOptions = {
  position: 'bottom-center', startAt: 1, prefix: '', suffix: '', fontSizePt: 10, marginPt: 24,
};

function PageNumberSettings({ opts, onChange }: { opts: PageNumberOptions; onChange: (o: PageNumberOptions) => void }) {
  const set = <K extends keyof PageNumberOptions>(k: K, v: PageNumberOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Position">
        <select value={opts.position} onChange={e => set('position', e.target.value as PageNumberOptions['position'])} style={iStyle}>
          <option value="bottom-center">Bottom center</option>
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="top-center">Top center</option>
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
        </select>
      </Field>
      <Field label="Start at"><input type="number" min={0} step={1} value={opts.startAt} onChange={e => set('startAt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Prefix" note='e.g. "Page "'><input type="text" value={opts.prefix} onChange={e => set('prefix', e.target.value)} style={iStyle} /></Field>
      <Field label="Suffix"><input type="text" value={opts.suffix} onChange={e => set('suffix', e.target.value)} style={iStyle} /></Field>
      <Field label="Font size (pt)"><input type="number" min={6} max={48} step={1} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge margin (pt)"><input type="number" min={4} max={96} step={1} value={opts.marginPt} onChange={e => set('marginPt', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

// ── Numbered-tickets settings ─────────────────────────────────────────────────

const DEFAULT_TICKET: TicketOptions = {
  cols: 2, rows: 5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.1,
  startNumber: 1, count: 100, prefix: 'No. ', pad: 4,
  position: 'bottom-right', fontSizePt: 10, addMarks: true, markLenIn: 0.2, markOffIn: 0.1,
};

function TicketSettings({ opts, onChange }: { opts: TicketOptions; onChange: (o: TicketOptions) => void }) {
  const set = <K extends keyof TicketOptions>(k: K, v: TicketOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <SheetPicker opts={opts} set={set} />
      <Field label="Columns"><input type="number" min={1} max={10} step={1} value={opts.cols} onChange={e => set('cols', +e.target.value)} style={iStyle} /></Field>
      <Field label="Rows"><input type="number" min={1} max={20} step={1} value={opts.rows} onChange={e => set('rows', +e.target.value)} style={iStyle} /></Field>
      <Field label="Total tickets"><input type="number" min={1} max={10000} step={1} value={opts.count} onChange={e => set('count', +e.target.value)} style={iStyle} /></Field>
      <Field label="Start number"><input type="number" min={0} step={1} value={opts.startNumber} onChange={e => set('startNumber', +e.target.value)} style={iStyle} /></Field>
      <Field label="Digits (zero-pad)"><input type="number" min={1} max={8} step={1} value={opts.pad} onChange={e => set('pad', +e.target.value)} style={iStyle} /></Field>
      <Field label="Prefix" note='e.g. "No. "'><input type="text" value={opts.prefix} onChange={e => set('prefix', e.target.value)} style={iStyle} /></Field>
      <Field label="Number position">
        <select value={opts.position} onChange={e => set('position', e.target.value as TicketOptions['position'])} style={iStyle}>
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-center">Bottom center</option>
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
          <option value="top-center">Top center</option>
        </select>
      </Field>
      <Field label="Number size (pt)"><input type="number" min={6} max={48} step={1} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Gutter (in)"><input type="number" min={0} max={1} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Crop marks">
        <Row><input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Add crop marks</span></Row>
      </Field>
    </Grid>
  );
}

// ── Rotate / Flip / Shuffle / Split / Crop-box settings ──────────────────────

function RotateSettings({ angle, onChange }: { angle: 90 | 180 | 270; onChange: (a: 90 | 180 | 270) => void }) {
  return (
    <Field label="Rotation">
      <div style={{ display: 'flex', gap: '.5rem' }}>
        {([90, 180, 270] as const).map(a => (
          <button key={a} className={`btn${angle === a ? '' : ' secondary'}`} onClick={() => onChange(a)} style={{ flex: 1 }}>{a}°</button>
        ))}
      </div>
    </Field>
  );
}

function FlipSettings({ dir, onChange }: { dir: 'h' | 'v'; onChange: (d: 'h' | 'v') => void }) {
  return (
    <Field label="Mirror axis">
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button className={`btn${dir === 'h' ? '' : ' secondary'}`} onClick={() => onChange('h')} style={{ flex: 1 }}>Horizontal ↔</button>
        <button className={`btn${dir === 'v' ? '' : ' secondary'}`} onClick={() => onChange('v')} style={{ flex: 1 }}>Vertical ↕</button>
      </div>
    </Field>
  );
}

function ShuffleSettings({ order, onChange, count }: { order: string; onChange: (s: string) => void; count: number }) {
  return (
    <Field label="Page order" note={`This PDF has ${count} page${count !== 1 ? 's' : ''}. List 1-based page numbers in the order you want. Repeat to duplicate, omit to drop.`}>
      <input type="text" value={order} onChange={e => onChange(e.target.value)} placeholder="e.g. 3, 1, 2, 2, 4" style={iStyle} />
    </Field>
  );
}

function SplitSettings({ ranges, onChange, count }: { ranges: string; onChange: (s: string) => void; count: number }) {
  return (
    <Field label="Split ranges" note={`This PDF has ${count} page${count !== 1 ? 's' : ''}. Each comma-separated range becomes its own file.`}>
      <input type="text" value={ranges} onChange={e => onChange(e.target.value)} placeholder="e.g. 1-3, 4-6, 7" style={iStyle} />
    </Field>
  );
}

function CropBoxSettings({ opts, onChange }: { opts: CropBoxOptions; onChange: (o: CropBoxOptions) => void }) {
  const set = (k: keyof CropBoxOptions, v: number) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Top inset (in)"><input type="number" min={0} max={10} step={0.0625} value={opts.top} onChange={e => set('top', +e.target.value)} style={iStyle} /></Field>
      <Field label="Right inset (in)"><input type="number" min={0} max={10} step={0.0625} value={opts.right} onChange={e => set('right', +e.target.value)} style={iStyle} /></Field>
      <Field label="Bottom inset (in)"><input type="number" min={0} max={10} step={0.0625} value={opts.bottom} onChange={e => set('bottom', +e.target.value)} style={iStyle} /></Field>
      <Field label="Left inset (in)"><input type="number" min={0} max={10} step={0.0625} value={opts.left} onChange={e => set('left', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

// ── Overlay settings ──────────────────────────────────────────────────────────

const DEFAULT_OVERLAY: OverlayOptions = { opacity: 0.3, mode: 'center' };

function OverlaySettings({ opts, onChange }: { opts: OverlayOptions; onChange: (o: OverlayOptions) => void }) {
  const set = <K extends keyof OverlayOptions>(k: K, v: OverlayOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Placement">
        <select value={opts.mode} onChange={e => set('mode', e.target.value as OverlayOptions['mode'])} style={iStyle}>
          <option value="center">Centered</option>
          <option value="fill">Fill page</option>
          <option value="tile">Tiled</option>
        </select>
      </Field>
      <Field label={`Opacity: ${Math.round(opts.opacity * 100)}%`}>
        <input type="range" min={5} max={100} step={5} value={opts.opacity * 100} onChange={e => set('opacity', +e.target.value / 100)} style={{ width: '100%', marginTop: '.5rem' }} />
      </Field>
      {opts.mode === 'tile' && (
        <>
          <Field label="Tile columns"><input type="number" min={1} max={8} step={1} value={opts.tileCols ?? 2} onChange={e => set('tileCols', +e.target.value)} style={iStyle} /></Field>
          <Field label="Tile rows"><input type="number" min={1} max={8} step={1} value={opts.tileRows ?? 2} onChange={e => set('tileRows', +e.target.value)} style={iStyle} /></Field>
        </>
      )}
    </Grid>
  );
}

// ── Merge file list ──────────────────────────────────────────────────────────

function MergeFileList({ files, onAdd, onRemove, onMove }: {
  files: MergeFile[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void; onMove: (from: number, to: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .75rem', background: 'var(--bg-alt)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--muted)', fontSize: '.8rem', minWidth: 20 }}>{i + 1}.</span>
          <span style={{ flex: 1, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 .2rem' }} onClick={() => i > 0 && onMove(i, i - 1)} disabled={i === 0}>↑</button>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 .2rem' }} onClick={() => i < files.length - 1 && onMove(i, i + 1)} disabled={i === files.length - 1}>↓</button>
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

  const cardMode = tool.engine === 'nup' && !!(tool.defaultNup?.cellWIn || tool.fitSource);

  // Per-engine settings state (initialised from the tool's presets)
  const [bookletOpts, setBookletOpts] = useState<BookletOptions>({ ...DEFAULT_BOOKLET, ...tool.defaultBooklet });
  const [nupOpts, setNupOpts] = useState<NUpOptions>({ ...DEFAULT_NUP, ...tool.defaultNup });
  const [posterOpts, setPosterOpts] = useState<PosterOptions>(DEFAULT_POSTER);
  const [cropOpts, setCropOpts] = useState<CropMarksOptions>(DEFAULT_CROP);
  const [colorBarOpts, setColorBarOpts] = useState<ColorBarOptions>(DEFAULT_COLORBAR);
  const [pageNumOpts, setPageNumOpts] = useState<PageNumberOptions>(DEFAULT_PAGENUM);
  const [ticketOpts, setTicketOpts] = useState<TicketOptions>(DEFAULT_TICKET);
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90);
  const [flipDir, setFlipDir] = useState<'h' | 'v'>('h');
  const [overlayOpts, setOverlayOpts] = useState<OverlayOptions>(DEFAULT_OVERLAY);
  const [cropBoxOpts, setCropBoxOpts] = useState<CropBoxOptions>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [shuffleOrder, setShuffleOrder] = useState('');
  const [splitRanges, setSplitRanges] = useState('');
  const [stampFile, setStampFile] = useState<MergeFile | null>(null);

  // Merge tool has its own multi-file state
  const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);
  const [mergeStatus, setMergeStatus] = useState<Status>('idle');

  const loadFile = useCallback(async (f: File) => {
    setStatus('loading'); setErrMsg('');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await getPdfInfo(bytes);
      setFile({ name: f.name, bytes, info });
      // Prefill order-list tools and derive fit-to-source cell sizes.
      const seq = Array.from({ length: info.count }, (_, i) => i + 1).join(', ');
      setShuffleOrder(seq);
      setSplitRanges(`1-${info.count}`);
      if (tool.fitSource) setNupOpts(o => ({ ...o, cellWIn: info.widthIn, cellHIn: info.heightIn }));
      setStatus('idle');
    } catch {
      setStatus('error'); setErrMsg('Could not read PDF. Make sure it is a valid, unencrypted PDF.');
    }
  }, [tool.fitSource]);

  const clearFile = () => { setFile(null); setStatus('idle'); setErrMsg(''); };

  const addMergeFiles = useCallback(async (files: File[]) => {
    const loaded = await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    setMergeFiles(prev => [...prev, ...loaded]);
  }, []);

  const loadStamp = useCallback(async (files: File[]) => {
    const f = files[0]; if (!f) return;
    setStampFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }, []);

  const process = async () => {
    if (!file) return;
    setStatus('processing'); setErrMsg('');
    try {
      const base = file.name.replace(/\.pdf$/i, '');
      let out: Uint8Array | null = null;
      let outName = `${base}-imposed.pdf`;

      switch (tool.engine) {
        case 'booklet': out = await imposeBooklet(file.bytes, bookletOpts); outName = `${base}-booklet.pdf`; break;
        case 'nup':
          out = await imposeNUp(file.bytes, nupOpts);
          outName = `${base}-${nupOpts.repeatFirst ? 'repeat' : `${tool.id}`}.pdf`; break;
        case 'poster': out = await imposeTiledPoster(file.bytes, posterOpts); outName = `${base}-poster.pdf`; break;
        case 'cropmarks': out = await addCropMarksOnly(file.bytes, cropOpts); outName = `${base}-marks.pdf`; break;
        case 'colorbar': out = await addColorBar(file.bytes, colorBarOpts); outName = `${base}-colorbar.pdf`; break;
        case 'pagenumbers': out = await addPageNumbers(file.bytes, pageNumOpts); outName = `${base}-numbered.pdf`; break;
        case 'tickets': out = await imposeTickets(file.bytes, ticketOpts); outName = `${base}-tickets.pdf`; break;
        case 'rotate': out = await rotatePdf(file.bytes, rotateAngle); outName = `${base}-rotated${rotateAngle}.pdf`; break;
        case 'flip': out = await flipPdf(file.bytes, flipDir); outName = `${base}-flipped.pdf`; break;
        case 'crop': out = await cropPdf(file.bytes, cropBoxOpts); outName = `${base}-cropped.pdf`; break;
        case 'shuffle': out = await shufflePages(file.bytes, shuffleOrder); outName = `${base}-reordered.pdf`; break;
        case 'overlay':
          if (!stampFile) { setStatus('error'); setErrMsg('Add a watermark / overlay PDF first.'); return; }
          out = await overlayPdf(file.bytes, stampFile.bytes, overlayOpts); outName = `${base}-overlay.pdf`; break;
        case 'split': {
          const parts = await splitPdf(file.bytes, splitRanges);
          if (!parts.length) { setStatus('error'); setErrMsg('No valid ranges. Use a format like 1-3, 4-6, 7.'); return; }
          downloadMultiple(parts, base);
          setStatus('done'); setTimeout(() => setStatus('idle'), 3000); return;
        }
        default: break;
      }

      if (out) downloadPdf(out, outName);
      setStatus('done'); setTimeout(() => setStatus('idle'), 3000);
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
      setMergeStatus('done'); setTimeout(() => setMergeStatus('idle'), 3000);
    } catch {
      setMergeStatus('error');
    }
  };

  const isBusy = status === 'loading' || status === 'processing';

  const processLabel = tool.engine === 'split' ? 'Split & Download'
    : tool.engine === 'tickets' ? `Generate ${ticketOpts.count} Tickets`
      : 'Process & Download';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn secondary" onClick={onBack} style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{tool.badge ? `${tool.name} ${tool.badge}` : tool.name}</h2>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{tool.desc}</div>
        </div>
      </div>

      {tool.engine === 'merge' ? (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {mergeFiles.length === 0 ? (
            <FileDrop onFile={addMergeFiles} multiple label="Drop PDFs here to merge (drop multiple at once)" />
          ) : (
            <MergeFileList
              files={mergeFiles}
              onAdd={addMergeFiles}
              onRemove={i => setMergeFiles(f => f.filter((_, j) => j !== i))}
              onMove={(from, to) => setMergeFiles(f => { const a = [...f]; const tmp = a[to]!; a[to] = a[from]!; a[from] = tmp; return a; })}
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
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {tool.note && <NoteBanner text={tool.note} />}

          {!file ? (
            <FileDrop onFile={fs => { if (fs[0]) loadFile(fs[0]); }} />
          ) : (
            <>
              <FileBar file={file} onClear={clearFile} />

              <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                <h4 style={{ margin: '0 0 .75rem' }}>Settings</h4>
                {tool.engine === 'booklet' && <BookletSettings opts={bookletOpts} onChange={setBookletOpts} />}
                {tool.engine === 'nup' && <NUpSettings opts={nupOpts} onChange={setNupOpts} cardMode={cardMode} />}
                {tool.engine === 'poster' && <PosterSettings opts={posterOpts} onChange={setPosterOpts} />}
                {tool.engine === 'cropmarks' && <CropSettings opts={cropOpts} onChange={setCropOpts} />}
                {tool.engine === 'colorbar' && <ColorBarSettings opts={colorBarOpts} onChange={setColorBarOpts} />}
                {tool.engine === 'pagenumbers' && <PageNumberSettings opts={pageNumOpts} onChange={setPageNumOpts} />}
                {tool.engine === 'tickets' && <TicketSettings opts={ticketOpts} onChange={setTicketOpts} />}
                {tool.engine === 'rotate' && <RotateSettings angle={rotateAngle} onChange={setRotateAngle} />}
                {tool.engine === 'flip' && <FlipSettings dir={flipDir} onChange={setFlipDir} />}
                {tool.engine === 'crop' && <CropBoxSettings opts={cropBoxOpts} onChange={setCropBoxOpts} />}
                {tool.engine === 'shuffle' && <ShuffleSettings order={shuffleOrder} onChange={setShuffleOrder} count={file.info.count} />}
                {tool.engine === 'split' && <SplitSettings ranges={splitRanges} onChange={setSplitRanges} count={file.info.count} />}
                {tool.engine === 'overlay' && <OverlaySettings opts={overlayOpts} onChange={setOverlayOpts} />}
              </div>

              {tool.engine === 'overlay' && (
                <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                  <h4 style={{ margin: '0 0 .75rem' }}>Overlay / watermark PDF</h4>
                  {stampFile
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span style={{ fontSize: '.85rem', flex: 1 }}>📄 {stampFile.name}</span>
                        <button className="btn secondary" style={{ padding: '.3rem .65rem', fontSize: '.8rem' }} onClick={() => setStampFile(null)}>Change</button>
                      </div>
                    : <FileDrop onFile={loadStamp} label="Drop the watermark / stamp PDF" />}
                </div>
              )}

              {tool.panelGuide && (
                <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                  <h4 style={{ margin: '0 0 .5rem' }}>Panel order</h4>
                  <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                    {tool.panelGuide.map((p, i) => <li key={i}>{p}</li>)}
                  </ol>
                </div>
              )}

              {tool.engine === 'booklet' && <BookletPreview pageCount={file.info.count} opts={bookletOpts} />}
              {tool.engine === 'nup' && <NUpPreview opts={nupOpts} pageCount={file.info.count} />}

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn" onClick={process} disabled={isBusy} style={{ fontSize: '1rem', padding: '.65rem 1.5rem' }}>
                  {status === 'processing' ? 'Processing…' : status === 'done' ? '✓ Downloaded' : processLabel}
                </button>
                {status === 'done' && <button className="btn secondary" onClick={process}>Download again</button>}
              </div>

              {status === 'error' && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{errMsg || 'Processing failed. Try again.'}</div>}
            </>
          )}

          {status === 'loading' && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Reading PDF…</div>}
          {status === 'error' && !file && <div style={{ color: '#dc2626', fontSize: '.85rem', marginTop: '-0.5rem' }}>{errMsg}</div>}
        </div>
      )}
    </div>
  );
}

// ── Tool gallery ──────────────────────────────────────────────────────────────

// ── Chained-workflow step settings ────────────────────────────────────────────

const VIOLET = '#7c3aed';

const DEFAULT_HEADERFOOTER: HeaderFooterOptions = { header: 'Document Title', footer: '', fontSizePt: 10, marginPt: 24, align: 'center' };
const DEFAULT_WATERMARK: WatermarkOptions = { text: 'PROOF', opacity: 0.22, angleDeg: 45, fontSizePt: 96 };
const DEFAULT_JOBSLUG: JobSlugOptions = { text: 'Job name · client · date', position: 'bottom', fontSizePt: 9 };

function BleedSettings({ opts, onChange }: { opts: { bleedIn: number }; onChange: (o: { bleedIn: number }) => void }) {
  return (
    <Grid>
      <Field label="Bleed per edge (in)" note="Content is scaled to overflow the trim">
        <input type="number" min={0.0625} max={0.5} step={0.0625} value={opts.bleedIn} onChange={e => onChange({ bleedIn: +e.target.value })} style={iStyle} />
      </Field>
    </Grid>
  );
}

function HeaderFooterSettings({ opts, onChange }: { opts: HeaderFooterOptions; onChange: (o: HeaderFooterOptions) => void }) {
  const set = <K extends keyof HeaderFooterOptions>(k: K, v: HeaderFooterOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Header text" note="Leave blank to skip"><input type="text" value={opts.header} onChange={e => set('header', e.target.value)} style={iStyle} /></Field>
      <Field label="Footer text" note="Leave blank to skip"><input type="text" value={opts.footer} onChange={e => set('footer', e.target.value)} style={iStyle} /></Field>
      <Field label="Alignment">
        <select value={opts.align} onChange={e => set('align', e.target.value as HeaderFooterOptions['align'])} style={iStyle}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </select>
      </Field>
      <Field label="Font size (pt)"><input type="number" min={6} max={36} step={1} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge margin (pt)"><input type="number" min={6} max={96} step={1} value={opts.marginPt} onChange={e => set('marginPt', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function WatermarkSettings({ opts, onChange }: { opts: WatermarkOptions; onChange: (o: WatermarkOptions) => void }) {
  const set = <K extends keyof WatermarkOptions>(k: K, v: WatermarkOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Watermark text"><input type="text" value={opts.text} onChange={e => set('text', e.target.value)} style={iStyle} /></Field>
      <Field label={`Opacity: ${Math.round(opts.opacity * 100)}%`}><input type="range" min={5} max={80} step={5} value={opts.opacity * 100} onChange={e => set('opacity', +e.target.value / 100)} style={{ width: '100%', marginTop: '.5rem' }} /></Field>
      <Field label="Angle (°)"><input type="number" min={-90} max={90} step={5} value={opts.angleDeg} onChange={e => set('angleDeg', +e.target.value)} style={iStyle} /></Field>
      <Field label="Font size (pt)"><input type="number" min={24} max={200} step={4} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function JobSlugSettings({ opts, onChange }: { opts: JobSlugOptions; onChange: (o: JobSlugOptions) => void }) {
  const set = <K extends keyof JobSlugOptions>(k: K, v: JobSlugOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Slug text" note="Job name, client, date, etc."><input type="text" value={opts.text} onChange={e => set('text', e.target.value)} style={iStyle} /></Field>
      <Field label="Position">
        <select value={opts.position} onChange={e => set('position', e.target.value as JobSlugOptions['position'])} style={iStyle}>
          <option value="bottom">Bottom strip</option><option value="top">Top strip</option>
        </select>
      </Field>
      <Field label="Font size (pt)"><input type="number" min={6} max={24} step={1} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function CollatingSettings({ opts, onChange }: { opts: { edge: 'left' | 'right' }; onChange: (o: { edge: 'left' | 'right' }) => void }) {
  return (
    <Grid>
      <Field label="Spine edge" note="Where the staircase of marks sits">
        <select value={opts.edge} onChange={e => onChange({ edge: e.target.value as 'left' | 'right' })} style={iStyle}>
          <option value="right">Right edge</option><option value="left">Left edge</option>
        </select>
      </Field>
    </Grid>
  );
}

function PreflightPanel({ file }: { file: LoadedFile }) {
  const [rpt, setRpt] = useState<PreflightReport | null>(null);
  useEffect(() => { let live = true; preflight(file.bytes).then(r => { if (live) setRpt(r); }); return () => { live = false; }; }, [file]);
  if (!rpt) return <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Checking…</div>;
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div style={{ fontSize: '.85rem' }}>
        {rpt.pages} page{rpt.pages !== 1 ? 's' : ''} · {rpt.widthIn}″ × {rpt.heightIn}″ · {rpt.uniformSize ? 'uniform size ✓' : 'mixed sizes'}
      </div>
      {rpt.warnings.length > 0
        ? rpt.warnings.map((w, i) => <NoteBanner key={i} text={`⚠ ${w}`} />)
        : <div style={{ fontSize: '.82rem', color: '#166534' }}>No issues found — ready to impose.</div>}
      <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Preflight only inspects; it passes the file through unchanged.</div>
    </div>
  );
}

// ── Pipeline model + runner ───────────────────────────────────────────────────

type StepKind = 'preflight' | 'booklet' | 'nup' | 'bleed' | 'colorbar' | 'cropmarks'
  | 'pagenumbers' | 'headerfooter' | 'watermark' | 'jobslug' | 'collating';

interface PipelineStep { kind: StepKind; label: string; opts: any; } // eslint-disable-line @typescript-eslint/no-explicit-any

const STEP_LABELS: Record<StepKind, string> = {
  preflight: 'Preflight', booklet: 'Impose booklet', nup: 'Impose / gang up', bleed: 'Generate bleed',
  colorbar: 'Add color bar', cropmarks: 'Add marks', pagenumbers: 'Add page numbers',
  headerfooter: 'Add header / footer', watermark: 'Add watermark', jobslug: 'Add job info', collating: 'Add collating marks',
};

const STEP_KINDS: StepKind[] = ['preflight', 'booklet', 'nup', 'bleed', 'colorbar', 'cropmarks', 'pagenumbers', 'headerfooter', 'watermark', 'jobslug', 'collating'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stepDefaults: Record<StepKind, () => any> = {
  preflight: () => ({}),
  booklet: () => ({ ...DEFAULT_BOOKLET }),
  nup: () => ({ ...DEFAULT_NUP }),
  bleed: () => ({ bleedIn: 0.125 }),
  colorbar: () => ({ ...DEFAULT_COLORBAR }),
  cropmarks: () => ({ ...DEFAULT_CROP }),
  pagenumbers: () => ({ ...DEFAULT_PAGENUM }),
  headerfooter: () => ({ ...DEFAULT_HEADERFOOTER }),
  watermark: () => ({ ...DEFAULT_WATERMARK }),
  jobslug: () => ({ ...DEFAULT_JOBSLUG }),
  collating: () => ({ edge: 'right' }),
};

async function runStep(bytes: Uint8Array, step: PipelineStep): Promise<Uint8Array> {
  switch (step.kind) {
    case 'preflight': return bytes;
    case 'booklet': return imposeBooklet(bytes, step.opts);
    case 'nup': return imposeNUp(bytes, step.opts);
    case 'bleed': return generateBleed(bytes, step.opts);
    case 'colorbar': return addColorBar(bytes, step.opts);
    case 'cropmarks': return addCropMarksOnly(bytes, step.opts);
    case 'pagenumbers': return addPageNumbers(bytes, step.opts);
    case 'headerfooter': return addHeaderFooter(bytes, step.opts);
    case 'watermark': return addTextWatermark(bytes, step.opts);
    case 'jobslug': return addJobSlug(bytes, step.opts);
    case 'collating': return addCollatingMarks(bytes, step.opts);
    default: return bytes;
  }
}

function StepSettings({ step, onChange, file }: { step: PipelineStep; onChange: (s: PipelineStep) => void; file: LoadedFile }) {
  const upd = (o: any) => onChange({ ...step, opts: o }); // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (step.kind) {
    case 'preflight': return <PreflightPanel file={file} />;
    case 'booklet': return <BookletSettings opts={step.opts} onChange={upd} />;
    case 'nup': return <NUpSettings opts={step.opts} onChange={upd} cardMode={!!step.opts.cellWIn} />;
    case 'bleed': return <BleedSettings opts={step.opts} onChange={upd} />;
    case 'colorbar': return <ColorBarSettings opts={step.opts} onChange={upd} />;
    case 'cropmarks': return <CropSettings opts={step.opts} onChange={upd} />;
    case 'pagenumbers': return <PageNumberSettings opts={step.opts} onChange={upd} />;
    case 'headerfooter': return <HeaderFooterSettings opts={step.opts} onChange={upd} />;
    case 'watermark': return <WatermarkSettings opts={step.opts} onChange={upd} />;
    case 'jobslug': return <JobSlugSettings opts={step.opts} onChange={upd} />;
    case 'collating': return <CollatingSettings opts={step.opts} onChange={upd} />;
    default: return null;
  }
}

// ── Chained-workflow catalog ──────────────────────────────────────────────────

interface WFStep { kind: StepKind; label: string; opts?: any; } // eslint-disable-line @typescript-eslint/no-explicit-any
interface WorkflowDef { id: string; name: string; desc: string; Thumb: () => React.ReactElement; steps: WFStep[]; }

const WORKFLOWS: WorkflowDef[] = [
  {
    id: 'newsletter', name: 'Newsletter + page numbers', desc: 'Booklet, then a header/footer panel and marks.',
    Thumb: BookletThumb,
    steps: [
      { kind: 'booklet', label: 'Impose booklet' },
      { kind: 'headerfooter', label: 'Add header / footer', opts: { header: 'The Newsletter', footer: 'Page', align: 'center' } },
      { kind: 'cropmarks', label: 'Add marks' },
    ],
  },
  {
    id: 'clientproof', name: 'Branded client proof', desc: 'Watermark, header/footer and a reference bar.',
    Thumb: OverlayThumb,
    steps: [
      { kind: 'watermark', label: 'Add proof watermark', opts: { text: 'PROOF' } },
      { kind: 'headerfooter', label: 'Add header / footer', opts: { header: 'CLIENT PROOF — NOT FOR PRODUCTION', footer: '', align: 'center' } },
      { kind: 'colorbar', label: 'Add reference bar' },
    ],
  },
  {
    id: 'bizcards', name: 'Business cards with bleed', desc: 'Add bleed, impose, then cut marks.',
    Thumb: cardThumb(2, 3),
    steps: [
      { kind: 'bleed', label: 'Generate bleeds', opts: { bleedIn: 0.125 } },
      { kind: 'nup', label: 'Impose cards', opts: { cellWIn: 3.75, cellHIn: 2.25, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 } },
      { kind: 'cropmarks', label: 'Add cut marks', opts: { bleedIn: 0.125 } },
    ],
  },
  {
    id: 'magazine', name: 'Magazine production', desc: 'Preflight, signatures, color bars and marks.',
    Thumb: gridThumb(2, 2),
    steps: [
      { kind: 'preflight', label: 'Preflight' },
      { kind: 'booklet', label: 'Impose signatures' },
      { kind: 'colorbar', label: 'Add color bars' },
      { kind: 'cropmarks', label: 'Add marks' },
    ],
  },
  {
    id: 'perfectbound', name: 'Perfect-bound with color bar', desc: 'Signatures, color bars, collating and trim marks.',
    Thumb: ColorBarThumb,
    steps: [
      { kind: 'booklet', label: 'Impose signatures', opts: { creepIn: 0 } },
      { kind: 'colorbar', label: 'Add color bars' },
      { kind: 'collating', label: 'Add collating marks', opts: { edge: 'right' } },
      { kind: 'cropmarks', label: 'Add trim marks' },
    ],
  },
  {
    id: 'gangrun', name: 'Gang run, full marks', desc: 'Gang items with a color bar, marks and job slug.',
    Thumb: gridThumb(3, 2),
    steps: [
      { kind: 'nup', label: 'Gang items' },
      { kind: 'colorbar', label: 'Add color bar' },
      { kind: 'cropmarks', label: 'Add all marks' },
      { kind: 'jobslug', label: 'Add job info' },
    ],
  },
];

function buildSteps(wf: WorkflowDef): PipelineStep[] {
  return wf.steps.map(s => ({ kind: s.kind, label: s.label, opts: { ...stepDefaults[s.kind](), ...(s.opts || {}) } }));
}

// ── Chained-workflow gallery ──────────────────────────────────────────────────

function WorkflowCard({ wf, onSelect }: { wf: WorkflowDef; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)',
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,.08)' : 'none', transition: 'all .15s',
      }}
    >
      <div style={{ height: 130, background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', padding: '1rem', overflow: 'hidden' }}>
        <wf.Thumb />
      </div>
      <div style={{ padding: '.85rem 1rem 1rem' }}>
        <span style={{ display: 'inline-block', padding: '.12rem .5rem', borderRadius: 4, background: '#f3f0ff', color: VIOLET, fontSize: '.66rem', fontWeight: 800, letterSpacing: '.06em', marginBottom: '.5rem' }}>
          {wf.steps.length}-STEP CHAIN
        </span>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{wf.name}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.75rem', lineHeight: 1.4 }}>{wf.desc}</div>
        <div style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '.4rem' }}>How to make this</div>
        <ol style={{ listStyle: 'none', margin: '0 0 1rem', padding: 0, display: 'grid', gap: '.3rem' }}>
          {wf.steps.map((s, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 9, background: '#f3f0ff', color: VIOLET, fontSize: '.68rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
        <button onClick={onSelect} style={{ width: '100%', padding: '.6rem', border: 'none', borderRadius: 8, background: VIOLET, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.9rem' }}>
          Make this →
        </button>
      </div>
    </div>
  );
}

function WorkflowsView({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 .35rem', fontSize: '1.15rem' }}>Chained workflows</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 1.5rem', maxWidth: 640, fontSize: '.9rem', lineHeight: 1.5 }}>
        Real multi-step recipes that show how operations stack — impose, then add a header/footer, a color
        bar or cutter marks. Click “Make this” to load the whole chain into the pipeline, ready to configure.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: '1rem' }}>
        {WORKFLOWS.map(wf => <WorkflowCard key={wf.id} wf={wf} onSelect={() => onSelect(wf.id)} />)}
      </div>
      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 .35rem', fontSize: '1.05rem' }}>Build your own</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 1rem', fontSize: '.88rem' }}>
          Start from an empty pipeline and add any operations in the order you want — each step feeds the next.
        </p>
        <button className="btn secondary" onClick={() => onSelect('__custom__')}>+ New custom workflow</button>
      </div>
    </div>
  );
}

// ── Pipeline workspace ────────────────────────────────────────────────────────

function PipelineWorkspace({ workflow, onBack }: { workflow: WorkflowDef | null; onBack: () => void }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(() => (workflow ? buildSteps(workflow) : []));
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [progress, setProgress] = useState('');
  const [addKind, setAddKind] = useState<StepKind>('cropmarks');

  const loadFile = useCallback(async (f: File) => {
    setStatus('loading'); setErrMsg('');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await getPdfInfo(bytes);
      setFile({ name: f.name, bytes, info });
      setStatus('idle');
    } catch {
      setStatus('error'); setErrMsg('Could not read PDF. Make sure it is a valid, unencrypted PDF.');
    }
  }, []);

  const updateStep = (i: number, s: PipelineStep) => setSteps(prev => prev.map((p, j) => (j === i ? s : p)));
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, j) => j !== i));
  const moveStep = (i: number, dir: -1 | 1) => setSteps(prev => {
    const a = [...prev]; const j = i + dir; if (j < 0 || j >= a.length) return a;
    const tmp = a[j]!; a[j] = a[i]!; a[i] = tmp; return a;
  });
  const addStep = () => setSteps(prev => [...prev, { kind: addKind, label: STEP_LABELS[addKind], opts: stepDefaults[addKind]() }]);

  const run = async () => {
    if (!file || !steps.length) return;
    setStatus('processing'); setErrMsg('');
    try {
      let cur = file.bytes;
      for (let i = 0; i < steps.length; i++) {
        setProgress(`Step ${i + 1}/${steps.length}: ${steps[i]!.label}…`);
        cur = await runStep(cur, steps[i]!);
      }
      const base = file.name.replace(/\.pdf$/i, '');
      downloadPdf(cur, `${base}-${workflow ? workflow.id : 'workflow'}.pdf`);
      setStatus('done'); setProgress(''); setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error'); setProgress(''); setErrMsg(e instanceof Error ? e.message : 'Pipeline failed');
    }
  };

  const isBusy = status === 'loading' || status === 'processing';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn secondary" onClick={onBack} style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{workflow ? workflow.name : 'Custom workflow'}</h2>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
            {workflow ? workflow.desc : 'Add operations in order — each step feeds the next.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {!file ? (
          <FileDrop onFile={fs => { if (fs[0]) loadFile(fs[0]); }} />
        ) : (
          <>
            <FileBar file={file} onClear={() => { setFile(null); setStatus('idle'); setErrMsg(''); }} />

            {steps.map((step, i) => (
              <div key={i} className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem', borderLeft: `4px solid ${VIOLET}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.75rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#f3f0ff', color: VIOLET, fontSize: '.75rem', fontWeight: 800 }}>{i + 1}</span>
                  <h4 style={{ margin: 0, flex: 1 }}>{step.label} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.78rem' }}>· {STEP_LABELS[step.kind]}</span></h4>
                  <button title="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)} style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: 'var(--muted)', fontSize: '1rem', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button title="Move down" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} style={{ border: 'none', background: 'none', cursor: i === steps.length - 1 ? 'default' : 'pointer', color: 'var(--muted)', fontSize: '1rem', opacity: i === steps.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button title="Remove step" onClick={() => removeStep(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.1rem' }}>×</button>
                </div>
                <StepSettings step={step} onChange={s => updateStep(i, s)} file={file} />
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <select value={addKind} onChange={e => setAddKind(e.target.value as StepKind)} style={{ ...iStyle, maxWidth: 220 }}>
                {STEP_KINDS.map(k => <option key={k} value={k}>{STEP_LABELS[k]}</option>)}
              </select>
              <button className="btn secondary" onClick={addStep}>+ Add step</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button onClick={run} disabled={isBusy || !steps.length}
                style={{ fontSize: '1rem', padding: '.65rem 1.5rem', border: 'none', borderRadius: 8, background: steps.length ? VIOLET : 'var(--border)', color: '#fff', fontWeight: 600, cursor: isBusy || !steps.length ? 'default' : 'pointer' }}>
                {status === 'processing' ? (progress || 'Running…') : status === 'done' ? '✓ Downloaded' : `Run ${steps.length} step${steps.length !== 1 ? 's' : ''} & download`}
              </button>
              {!steps.length && <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Add at least one step.</span>}
            </div>

            {status === 'error' && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{errMsg || 'Pipeline failed. Try again.'}</div>}
          </>
        )}
        {status === 'loading' && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Reading PDF…</div>}
        {status === 'error' && !file && <div style={{ color: '#dc2626', fontSize: '.85rem', marginTop: '-0.5rem' }}>{errMsg}</div>}
      </div>
    </div>
  );
}

// ── Tool gallery ──────────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'Booklets & Books', 'Imposition & Layout', 'Cards & Labels',
  'Folding', 'Tickets & Data', 'Marks & Prepress', 'Page & PDF Tools',
];

function ToolGallery({ query, onSelect }: { query: string; onSelect: (id: string) => void }) {
  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: ToolDef) => !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
      || t.tags.some(tag => tag.toLowerCase().includes(q)) || t.category.toLowerCase().includes(q);
    const map = new Map<string, ToolDef[]>();
    for (const t of TOOLS) {
      if (!match(t)) continue;
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [query]);

  if (!categories.length) {
    return <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>No tools match “{query}”.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {categories.map(([cat, tools]) => (
        <div key={cat}>
          <h3 style={{ margin: '0 0 .75rem', fontSize: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
            {cat} <span style={{ color: 'var(--border)', fontWeight: 400 }}>· {tools.length}</span>
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
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onSelect}
      style={{
        border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        background: hover ? 'var(--bg-alt)' : 'var(--bg)', cursor: 'pointer',
        transition: 'all .15s', boxShadow: hover ? '0 4px 16px rgba(0,0,0,.08)' : 'none',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      <div style={{ height: 140, background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', padding: '1rem', overflow: 'hidden' }}>
        <tool.Thumb />
      </div>
      <div style={{ padding: '.75rem 1rem 1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>
          {tool.name}{tool.badge && <span style={{ color: '#f59e0b', marginLeft: '.35rem' }}>{tool.badge}</span>}
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.5rem', lineHeight: 1.4 }}>{tool.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginBottom: '.75rem' }}>
          {tool.tags.map(tag => <Chip key={tag} label={tag} />)}
        </div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={onSelect}>Make this →</button>
      </div>
    </div>
  );
}

// ── Calculators (pre-press reference tools) ───────────────────────────────────

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
function fmt$(c: number) { return `$${(c / 100).toFixed(2)}`; }
function fmtIn(i: number) { return `${i.toFixed(4)}"`; }
function fmtMM(i: number) { return `${(i * 25.4).toFixed(2)} mm`; }

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
          <input type="number" min={4} max={200} step={4} value={pages} onChange={e => setPages(+e.target.value)} style={iStyle} />
          {!valid && pages >= 4 && <div style={{ color: '#c00', fontSize: '.8rem', marginTop: '.2rem' }}>Must be a multiple of 4, min 8.</div>}
        </CalcField>
        <CalcField label="Quantity"><input type="number" min={1} step={25} value={qty} onChange={e => setQty(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Interior stock">
          <select value={interiorStock} onChange={e => setInteriorStock(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverStock} onChange={e => setCoverStock(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      {valid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
          <StatCard label="Interior sheets" value={String(sheets)} sub="per book" />
          <StatCard label="Color clicks" value={String(clicksPerBook)} sub="per book" />
          <StatCard label="Click cost" value={fmt$(clickCents)} sub="per book" />
          <StatCard label="Paper cost" value={fmt$(paperCents)} sub="per book" />
          <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534" />
          <StatCard label="Total marginal" value={fmt$(marginal * qty)} sub={`for ${qty.toLocaleString()} books`} accent="#1e3a5f" />
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
          <input type="number" min={2} max={600} step={2} value={textPages} onChange={e => setTextPages(+e.target.value)} style={iStyle} />
          {!valid && <div style={{ color: '#c00', fontSize: '.8rem', marginTop: '.2rem' }}>{textPages < 48 ? 'Minimum 48 pages.' : 'Must be even.'}</div>}
        </CalcField>
        <CalcField label="Quantity"><input type="number" min={1} step={25} value={qty} onChange={e => setQty(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Text stock">
          <select value={stockIdx} onChange={e => setStockIdx(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverIdx} onChange={e => setCoverIdx(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      {valid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
          <StatCard label="Spine width" value={fmtIn(spineIn)} sub={fmtMM(spineIn)} accent={spineIn >= 0.25 ? '#166534' : '#92400e'} />
          <StatCard label="Text sheets" value={String(textSheets)} sub="per book" />
          <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534" />
          <StatCard label="Total marginal" value={fmt$(marginal * qty)} sub={`for ${qty.toLocaleString()}`} accent="#1e3a5f" />
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
    const pw = comic.w + bleed * 2 + gutter, ph = comic.h + bleed * 2 + gutter;
    const c = Math.floor((sheetW + gutter) / pw), r = Math.floor((sheetH + gutter) / ph);
    const c2 = Math.floor((sheetH + gutter) / pw), r2 = Math.floor((sheetW + gutter) / ph);
    if (c2 * r2 > c * r) return { cols: c2, rows: r2, nUp: c2 * r2 };
    return { cols: c, rows: r, nUp: c * r };
  }, [comic, sheetW, sheetH, bleed, gutter]);
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Page size">
          <select value={comicIdx} onChange={e => setComicIdx(+e.target.value)} style={iStyle}>
            {COMIC_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Sheet width (in)"><input type="number" min={1} max={48} step={0.25} value={sheetW} onChange={e => setSheetW(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Sheet height (in)"><input type="number" min={1} max={48} step={0.25} value={sheetH} onChange={e => setSheetH(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Bleed per edge (in)"><input type="number" min={0} max={0.5} step={0.0625} value={bleed} onChange={e => setBleed(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Gutter (in)"><input type="number" min={0} max={0.5} step={0.0625} value={gutter} onChange={e => setGutter(+e.target.value)} style={iStyle} /></CalcField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
        <StatCard label="N-up" value={nUp > 0 ? `${nUp}-up` : "Doesn't fit"} sub={`${cols} × ${rows}`} accent={nUp > 0 ? '#166534' : '#c00'} />
        <StatCard label="Sheet efficiency" value={nUp > 0 ? `${((nUp * comic.w * comic.h) / (sheetW * sheetH) * 100).toFixed(1)}%` : '—'} sub="usable area" />
      </div>
    </div>
  );
}

function CostCalc() {
  const [pages, setPages] = useState(32);
  const [qty, setQty] = useState(250);
  const [binding, setBinding] = useState<'saddle' | 'perfect'>('saddle');
  const [stockIdx, setStockIdx] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);
  const [targetMargin, setTargetMargin] = useState(55);
  const stock = PAPER_STOCKS[stockIdx]!; const cover = COVER_STOCKS[coverIdx]!;
  const valid = binding === 'saddle' ? pages % 4 === 0 && pages >= 8 : pages % 2 === 0 && pages >= 48;
  const textSheets = binding === 'saddle' ? pages / 4 : pages / 2;
  const clicks = textSheets * 2 + 2;
  const paperCents = textSheets * stock.centsPerSheet + cover.centsPerSheet;
  const marginal = paperCents + clicks * CLICK_RATE * 100;
  const priceAt = (m: number) => Math.ceil(marginal / (1 - m / 100));
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem' }}>
        <CalcField label="Page count"><input type="number" min={4} step={binding === 'saddle' ? 4 : 2} value={pages} onChange={e => setPages(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Print quantity"><input type="number" min={1} step={25} value={qty} onChange={e => setQty(+e.target.value)} style={iStyle} /></CalcField>
        <CalcField label="Binding">
          <select value={binding} onChange={e => setBinding(e.target.value as 'saddle' | 'perfect')} style={iStyle}>
            <option value="saddle">Saddle stitch</option><option value="perfect">Perfect bind</option>
          </select>
        </CalcField>
        <CalcField label="Interior stock">
          <select value={stockIdx} onChange={e => setStockIdx(+e.target.value)} style={iStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label="Cover stock">
          <select value={coverIdx} onChange={e => setCoverIdx(+e.target.value)} style={iStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
        <CalcField label={`Target margin: ${targetMargin}%`}>
          <input type="range" min={20} max={80} step={5} value={targetMargin} onChange={e => setTargetMargin(+e.target.value)} style={{ width: '100%', marginTop: '.5rem' }} />
        </CalcField>
      </div>
      {valid && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '.75rem' }}>
            <StatCard label="Marginal cost" value={fmt$(marginal)} sub="per book" accent="#166534" />
            <StatCard label={`Price at ${targetMargin}%`} value={fmt$(priceAt(targetMargin))} sub="suggested" accent="#7c3aed" />
            <StatCard label="Total marginal" value={fmt$(marginal * qty)} sub={`${qty.toLocaleString()} books`} accent="#1e3a5f" />
          </div>
          <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
            <h4 style={{ margin: '0 0 .75rem' }}>Pricing at various margins</h4>
            <table className="admin-table">
              <thead><tr><th>Margin</th><th>Retail price</th><th>Gross / book</th><th>Total gross ({qty.toLocaleString()})</th></tr></thead>
              <tbody>
                {[30, 40, 50, 60, 70].map(m => (
                  <tr key={m} style={{ fontWeight: m === targetMargin ? 700 : undefined, background: m === targetMargin ? 'var(--bg-alt)' : undefined }}>
                    <td>{m}%</td><td>{fmt$(priceAt(m))}</td><td>{fmt$(priceAt(m) - marginal)}</td><td>{fmt$((priceAt(m) - marginal) * qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '.5rem 0 0', fontSize: '.78rem', color: 'var(--muted)' }}>Marginal only (clicks + paper). Excludes lease overhead (~$1,900/mo) and labor.</p>
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
  const totalW = size.w + bleed * 2, totalH = size.h + bleed * 2;
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
  const tW = totalW * scale, tH = totalH * scale;
  const bPx = bleed * scale, sPx = safe * scale;
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ maxWidth: 300 }}>
        <CalcField label="Page size">
          <select value={sizeIdx} onChange={e => setSizeIdx(+e.target.value)} style={iStyle}>
            {COMIC_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </CalcField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
          <h4 style={{ margin: '0 0 .75rem' }}>Spec sheet</h4>
          <table className="admin-table"><tbody>
            {specs.map(([k, v]) => <tr key={k}><td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{k}</td><td style={{ fontWeight: 600 }}>{v}</td></tr>)}
          </tbody></table>
        </div>
        <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
          <h4 style={{ margin: '0 0 .75rem' }}>Page diagram</h4>
          <div style={{ position: 'relative', width: tW, height: tH, margin: '0 auto' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#fecdd3', border: '2px solid #e11d48' }} />
            <div style={{ position: 'absolute', inset: bPx, background: '#dbeafe', border: '2px dashed #2563eb' }} />
            <div style={{ position: 'absolute', inset: bPx + sPx, border: '2px dashed #16a34a', background: '#f0fdf4' }} />
            <div style={{ position: 'absolute', top: 2, left: 2, fontSize: '0.55rem', color: '#e11d48', fontWeight: 700 }}>BLEED</div>
            <div style={{ position: 'absolute', top: bPx + 2, left: bPx + 2, fontSize: '0.55rem', color: '#2563eb', fontWeight: 700 }}>TRIM</div>
            <div style={{ position: 'absolute', top: bPx + sPx + 2, left: bPx + sPx + 2, fontSize: '0.55rem', color: '#16a34a', fontWeight: 700 }}>SAFE</div>
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
            background: 'none', cursor: 'pointer', fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? 'var(--brand)' : 'var(--muted)', fontSize: '.9rem', transition: 'all .15s', borderRadius: '4px 4px 0 0',
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
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const toolDef = TOOLS.find(t => t.id === activeTool);

  const handleSelect = (id: string) => { setActiveTool(id); setTopTab('tools'); };

  const TAB_LABEL: Record<TopTab, string> = {
    tools: `Imposition Tools (${TOOLS.length})`,
    workflows: `Chained Workflows (${WORKFLOWS.length})`,
    calculators: 'Pre-Press Calculators',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1080 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Imposition &amp; Pre-Press</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.75rem' }}>
        {TOOLS.length} PDF imposition tools and {WORKFLOWS.length} chained workflows — everything runs locally in your browser, files are never uploaded. Plus pre-press calculators.
      </p>

      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {(['tools', 'workflows', 'calculators'] as TopTab[]).map(t => (
          <button key={t} onClick={() => { setTopTab(t); setActiveTool(null); setActiveWorkflow(null); }} style={{
            padding: '.6rem 1.25rem', border: 'none',
            borderBottom: topTab === t ? '3px solid var(--brand)' : '3px solid transparent',
            background: 'none', cursor: 'pointer', fontWeight: topTab === t ? 700 : 400,
            color: topTab === t ? 'var(--brand)' : 'var(--muted)', fontSize: '1rem',
          }}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {topTab === 'tools' ? (
        activeTool && toolDef ? (
          <ToolWorkspace key={toolDef.id} tool={toolDef} onBack={() => setActiveTool(null)} />
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search tools — comic, cards, watermark, fold…"
                style={{ ...iStyle, maxWidth: 380 }}
              />
            </div>
            <ToolGallery query={query} onSelect={handleSelect} />
          </>
        )
      ) : topTab === 'workflows' ? (
        activeWorkflow ? (
          <PipelineWorkspace
            key={activeWorkflow}
            workflow={activeWorkflow === '__custom__' ? null : (WORKFLOWS.find(w => w.id === activeWorkflow) ?? null)}
            onBack={() => setActiveWorkflow(null)}
          />
        ) : (
          <WorkflowsView onSelect={setActiveWorkflow} />
        )
      ) : (
        <Calculators />
      )}
    </div>
  );
}
