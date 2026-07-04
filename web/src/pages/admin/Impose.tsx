import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  getPdfInfo, imposeBooklet, imposeNUpBook, imposeCalendar, imposeNUp, computeNUpGrid, addCropMarksOnly,
  mergePdfs, rotatePdf, flipPdf, splitPdf, splitPdfChunks, makeZip, overlayPdf, shufflePages, cropPdf, resizePdf,
  addPageNumbers, addColorBar, imposeTiledPoster, imposeTickets,
  generateBleed, addHeaderFooter, addTextWatermark, addJobSlug, addCollatingMarks, addOmrMarks, addGatheringMarks, addFoldMarks, addLayMarks,
  addCutContour, addWhiteVarnish, addBraille, addBarcodeStamp, addBackdropFile, applyColorEffects, applyColorManagement, assignOutputIntent,
  preflight, preflightClean, computeGangPlan, readLayers, setLayers, imposeCustomGrid, optimizePdf, decryptPdf,
  editPdf, exportJdf,
  makeDieline, imposeDataMerge, downloadPdf, downloadFile, downloadMultiple,
  addRegistrationMarks, insertPages, mixPdfs, nudgePdf, repairPdf, addBackdrop, addQrStamp, addDimensions,
  distortPdf, distortFactorFromCylinder, nestPdf,
} from '../../lib/impose';
import type {
  PdfPageInfo, BookletOptions, NUpOptions, CropMarksOptions,
  OverlayOptions, PageNumberOptions, TicketOptions, ResizeOptions,
  HeaderFooterOptions, WatermarkOptions, JobSlugOptions, PreflightReport, DielineOptions, DataMergeOptions,
  RegMarkOptions, InsertOptions, NudgeOptions, BackdropOptions, QrStampOptions, NUpBookOptions, BleedOptions, DistortOptions, CalendarOptions, NestOptions,
  CollatingOptions, OmrOptions, GatheringOptions, FoldMarksOptions, LayMarksOptions,
  CutContourOptions, WhiteVarnishOptions, BrailleOptions, BarcodeStampOptions, BackdropFileOptions,
  ColorEffectsOptions, ColorManageOptions, RepairOptions,
  PreflightCleanOptions, PdfLayer, LayerState, CustomImposeOptions, CustomCell, OptimizeOptions, EditOp, JdfOptions,
} from '../../lib/impose';

// ── Constants ────────────────────────────────────────────────────────────────

const SHEET_PRESETS = [
  { label: 'Letter (8.5×11")', w: 8.5, h: 11 },
  { label: 'Letter L (11×8.5")', w: 11, h: 8.5 },
  { label: 'Legal (8.5×14")', w: 8.5, h: 14 },
  { label: 'Ledger / Tabloid (11×17")', w: 11, h: 17 },
  { label: 'Tabloid L (17×11")', w: 17, h: 11 },
  { label: 'Tabloid+ (12×18")', w: 12, h: 18 },
  { label: 'Super-B (13×19")', w: 13, h: 19 },
  { label: 'Super-B L (19×13")', w: 19, h: 13 },
  { label: 'A6 (105×148 mm)', w: 4.13, h: 5.83 },
  { label: 'A5 (148×210 mm)', w: 5.83, h: 8.27 },
  { label: 'A4 (210×297 mm)', w: 8.27, h: 11.69 },
  { label: 'A4 L (297×210 mm)', w: 11.69, h: 8.27 },
  { label: 'A3 (297×420 mm)', w: 11.69, h: 16.54 },
  { label: 'SRA4 (225×320 mm)', w: 8.86, h: 12.6 },
  { label: 'SRA3 (320×450 mm)', w: 12.6, h: 17.72 },
  { label: 'B4 JIS (257×364 mm)', w: 10.12, h: 14.33 },
  { label: 'Executive (7.25×10.5")', w: 7.25, h: 10.5 },
  { label: 'Half-Letter (5.5×8.5")', w: 5.5, h: 8.5 },
  { label: 'Album (12×12")', w: 12, h: 12 },
];

// Local mirrors of the inline engine option shapes.
interface PosterOptions {
  tilesAcross: number; tilesDown: number;
  sheetWIn: number; sheetHIn: number;
  overlapIn: number; addMarks: boolean; markLenIn: number; markOffIn: number;
  centerMarks?: boolean; markWeightPt?: number;
}
interface ColorBarOptions { edge: 'bottom' | 'top' | 'left' | 'right'; heightIn: number; shape?: 'square' | 'circle' | 'rect'; spot?: boolean; pages?: string; }
interface CropBoxOptions { top: number; right: number; bottom: number; left: number; }

// ── Types ────────────────────────────────────────────────────────────────────

type ToolEngine =
  | 'booklet' | 'nup' | 'poster' | 'cropmarks' | 'colorbar' | 'pagenumbers'
  | 'tickets' | 'merge' | 'rotate' | 'flip' | 'split' | 'overlay' | 'shuffle' | 'crop'
  | 'bleed' | 'preflight' | 'dieline' | 'datamerge' | 'resize'
  | 'watermark' | 'headerfooter' | 'slug' | 'collating' | 'registration'
  | 'insert' | 'mix' | 'nudge' | 'repair' | 'backdrop' | 'qrstamp' | 'dimensions' | 'nupbook' | 'distort' | 'calendar' | 'nest' | 'omr' | 'gathering' | 'foldmarks' | 'laymarks'
  | 'cutcontour' | 'whitevarnish' | 'braille' | 'barcode' | 'backdropfile' | 'coloreffects' | 'colormanage'
  | 'layers' | 'customgrid' | 'pdftools' | 'editpdf' | 'jdf';
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
  preset?: string;       // "Loads the ready-to-use {preset}" line on the card
  Thumb: () => React.ReactElement;
  defaultNup?: Partial<NUpOptions>;
  defaultBooklet?: Partial<BookletOptions>;
  defaultPoster?: Partial<PosterOptions>;
  defaultTicket?: Partial<TicketOptions>;
  fitSource?: boolean;   // derive fixed cell size from the loaded page (Optimal Fit)
  panelGuide?: string[];
  note?: string;
  dielineKind?: 'ste' | 'folder';
}

// ── Reusable thumbnails ───────────────────────────────────────────────────────

// A white "paper sheet" backdrop (with a soft shadow) that most thumbnails sit
// on, so they read as floating paper on the dark gallery cards.
function Sheet({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <rect x={19} y={14} width={168} height={128} rx={6} fill="rgba(0,0,0,0.30)" />
      <rect x={16} y={10} width={168} height={128} rx={6} fill="#ffffff" stroke="#e2e8f0" />
      {children}
    </>
  );
}

function gridThumb(cols: number, rows: number, o: { numbered?: boolean; accent?: string } = {}) {
  return function GridThumb() {
    const sx = 16, sy = 10, sw = 168, sh = 128, pad = 11, gap = 5;
    const cw = (sw - pad * 2 - gap * (cols - 1)) / cols;
    const ch = (sh - pad * 2 - gap * (rows - 1)) / rows;
    const cells: React.ReactElement[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = sx + pad + c * (cw + gap), y = sy + pad + r * (ch + gap);
      cells.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width={cw} height={ch} rx={1.5} fill="#f8fafc" stroke={o.accent ?? '#cbd5e1'} />
          {o.numbered && (
            <text x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle" fill="#94a3b8"
              fontSize={Math.min(15, ch * 0.42)} fontWeight={600}>{r * cols + c + 1}</text>
          )}
        </g>
      );
    }
    return <svg viewBox="0 0 200 148" width="100%" height="100%"><Sheet>{cells}</Sheet></svg>;
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
  const sx = 16, sy = 10, sw = 168, sh = 128, pad = 11, gap = 7;
  const cw = (sw - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (sh - pad * 2 - gap * (rows - 1)) / rows;
  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = sx + pad + c * (cw + gap), y = sy + pad + r * (ch + gap);
    cells.push(
      <g key={`${r}-${c}`}>
        <rect x={x} y={y} width={cw} height={ch} rx={3} fill="#f5f3ff" stroke="#c4b5fd" />
        <rect x={x + 5} y={y + 5} width={Math.max(6, cw * 0.55)} height={4} rx={2} fill="#a78bfa" />
        {ch > 22 && <rect x={x + 5} y={y + 12} width={Math.max(6, cw * 0.78)} height={3} rx={1.5} fill="#ddd6fe" />}
      </g>
    );
  }
  return (
    <svg viewBox="0 0 200 148" width="100%" height="100%">
      <Sheet>{cells}</Sheet>
      {badge && <text x={sx + sw - 12} y={sy + 20} textAnchor="middle" fontSize="18">{badge}</text>}
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

const ResizeThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="34" y="30" width="132" height="88" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="3,3" />
    <rect x="58" y="48" width="70" height="52" rx="2" fill="#f1f5f9" stroke="#334155" strokeWidth="2" />
    <path d="M128 100 L156 118" stroke="#64748b" strokeWidth="2" />
    <polygon points="156,118 146,116 152,108" fill="#64748b" />
    <path d="M58 48 L34 30" stroke="#64748b" strokeWidth="2" />
    <polygon points="34,30 44,32 38,40" fill="#64748b" />
  </svg>
);

const A = '#7c3aed';
const frame = <rect x="52" y="22" width="96" height="104" rx="3" fill="#f1f5f9" stroke="#94a3b8" />;
const RegThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {([[70,40],[130,40],[70,108],[130,108]] as [number,number][]).map(([x,y],i)=>(<g key={i}>
      <line x1={x-9} y1={y} x2={x+9} y2={y} stroke={A} strokeWidth="1.4" /><line x1={x} y1={y-9} x2={x} y2={y+9} stroke={A} strokeWidth="1.4" />
      <circle cx={x} cy={y} r="5" stroke={A} strokeWidth="1.4" fill="none" /></g>))}
  </svg>
);
const InsertThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="34" y="34" width="52" height="80" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="114" y="34" width="52" height="80" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="90" y="34" width="20" height="80" rx="2" fill="#ede9fe" stroke={A} strokeDasharray="3,3" />
    <path d="M100 58 v32 M90 74 h20" stroke={A} strokeWidth="2" />
  </svg>
);
const MixThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    {[30,64,98,132].map((y,i)=>(<rect key={i} x="60" y={y-6} width="80" height="20" rx="2" fill={i%2?'#ede9fe':'#f1f5f9'} stroke={i%2?A:'#94a3b8'} />))}
  </svg>
);
const NudgeThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="60" y="34" width="80" height="80" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="3,3" />
    <rect x="74" y="44" width="80" height="80" rx="2" fill="#ede9fe" stroke={A} strokeWidth="2" />
    <path d="M50 74 h18 M120 128 v-18" stroke={A} strokeWidth="2" />
  </svg>
);
const RepairThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <path d="M118 52 l14 14 -8 8 -14-14 a10 10 0 0 1 8-8z" fill="#ede9fe" stroke={A} strokeWidth="1.6" />
    <path d="M116 66 l-30 30 8 8 30-30" stroke={A} strokeWidth="3" />
  </svg>
);
const BackdropThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="46" y="26" width="108" height="96" rx="3" fill="#ede9fe" stroke={A} />
    <rect x="66" y="44" width="68" height="60" rx="2" fill="#fff" stroke="#94a3b8" />
  </svg>
);
const QrThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {([[64,34],[64,52],[82,34],[110,34],[128,34],[110,52],[64,82],[64,100],[82,100],[110,82],[128,100],[110,100]] as [number,number][]).map(([x,y],i)=>(
      <rect key={i} x={x} y={y} width="14" height="14" fill={A} />))}
  </svg>
);
const ColorEffectsThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <defs><linearGradient id="ceg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f472b6" /><stop offset="0.5" stopColor="#a78bfa" /><stop offset="1" stopColor="#38bdf8" /></linearGradient></defs>
    <rect x="62" y="34" width="76" height="80" rx="4" fill="url(#ceg)" />
    <circle cx="100" cy="74" r="16" fill="#fff" opacity="0.85" /><circle cx="100" cy="74" r="16" fill="none" stroke="#fff" />
  </svg>
);
const ColorManageThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <circle cx="86" cy="66" r="24" fill="#f87171" opacity="0.8" />
    <circle cx="114" cy="66" r="24" fill="#34d399" opacity="0.8" />
    <circle cx="100" cy="90" r="24" fill="#60a5fa" opacity="0.8" />
  </svg>
);
const DimThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="56" y="34" width="88" height="72" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <path d="M56 118 h88 M56 114 v8 M144 114 v8" stroke={A} strokeWidth="1.4" />
    <path d="M40 34 v72 M36 34 h8 M36 106 h8" stroke={A} strokeWidth="1.4" />
  </svg>
);
const CollateThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {[34,52,70,88].map((y,i)=>(<rect key={i} x="52" y={y} width="10" height="12" fill={A} transform={`translate(${i*3},0)`} />))}
  </svg>
);
const OmrThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {/* a row of OMR bars along the bottom edge; program 0b1011010 pattern */}
    {[0,1,0,1,1,0,1,0].map((b,i)=>(<rect key={i} x={60+i*10} y={110} width="4" height={b?16:8} fill={b?'#111':'#cbd5e1'} />))}
    <rect x={52} y={110} width="4" height="16" fill={A} />
  </svg>
);
const GatherThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {/* horizontal staircase of gripper-edge marks along the top */}
    {[0,1,2,3].map(i=>(<rect key={i} x={62+i*16} y={28} width="12" height="10" fill={A} transform={`translate(0,${i*3})`} />))}
  </svg>
);
const FoldMarksThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {/* dashed fold-tick guides at 1/3 and 2/3 */}
    {[84,116].map((x,i)=>(<g key={i}>
      <line x1={x} y1={22} x2={x} y2={40} stroke={A} strokeWidth="1.5" strokeDasharray="4,3" />
      <line x1={x} y1={108} x2={x} y2={126} stroke={A} strokeWidth="1.5" strokeDasharray="4,3" />
    </g>))}
  </svg>
);
const LayThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {/* front-lay arrows on the gripper (bottom) + side-lay arrow on the left */}
    <g stroke={A} strokeWidth="1.5">
      <line x1={70} y1={122} x2={70} y2={106} /><line x1={70} y1={106} x2={66} y2={112} /><line x1={70} y1={106} x2={74} y2={112} />
      <line x1={130} y1={122} x2={130} y2={106} /><line x1={130} y1={106} x2={126} y2={112} /><line x1={130} y1={106} x2={134} y2={112} />
      <line x1={58} y1={74} x2={74} y2={74} /><line x1={74} y1={74} x2={68} y2={70} /><line x1={74} y1={74} x2={68} y2={78} />
    </g>
  </svg>
);
const CutContourThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <rect x="62" y="34" width="76" height="80" rx="10" fill="none" stroke="#e5228a" strokeWidth="1.5" strokeDasharray="5,3" />
    <text x="100" y="80" textAnchor="middle" fill="#94a3b8" fontSize="10">cut</text>
  </svg>
);
const WhiteVarnishThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <rect x="58" y="30" width="84" height="88" rx="3" fill="#c7d2fe" opacity="0.65" />
    <path d="M100 44 l10 20 -20 0 z" fill="#fff" stroke="#818cf8" strokeWidth="1.2" />
    <circle cx="100" cy="72" r="9" fill="#fff" stroke="#818cf8" strokeWidth="1.2" />
  </svg>
);
const BrailleThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    {/* three braille cells (2×3 dot grids) */}
    {[70, 100, 130].map((ox, ci) => (
      <g key={ci}>
        {([[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]] as [number, number][]).map((p, di) => {
          const on = [[0,1,3],[0,1,2,3],[0,3]][ci]!.includes(di);
          return <circle key={di} cx={ox + p[0] * 12} cy={44 + p[1] * 12} r="3.4" fill={on ? A : '#e2e8f0'} />;
        })}
      </g>
    ))}
  </svg>
);
const HFThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">{frame}
    <rect x="64" y="32" width="72" height="8" rx="2" fill={A} /><rect x="64" y="108" width="72" height="8" rx="2" fill={A} />
    <rect x="64" y="58" width="72" height="6" rx="1" fill="#cbd5e1" /><rect x="64" y="72" width="52" height="6" rx="1" fill="#e2e8f0" />
  </svg>
);
const SlugThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="46" y="26" width="108" height="88" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
    <rect x="46" y="114" width="108" height="14" fill="#ede9fe" stroke={A} />
    <rect x="52" y="118" width="60" height="5" rx="1" fill={A} />
  </svg>
);
const DistortThumb = () => (
  <svg viewBox="0 0 200 148" fill="none" width="100%" height="100%">
    <rect x="60" y="24" width="80" height="100" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="3,3" />
    <rect x="62" y="40" width="76" height="68" rx="2" fill="#ede9fe" stroke={A} strokeWidth="2" />
    <path d="M100 20 v-8 M100 128 v8" stroke={A} strokeWidth="2" />
    <path d="M92 16 l8 -6 8 6 M92 132 l8 6 8 -6" stroke={A} strokeWidth="2" fill="none" />
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

const NestThumb = () => (
  <svg viewBox="0 0 200 148" width="100%" height="100%">
    <Sheet>
      {/* irregular shapes packed tight to show true-shape nesting */}
      <circle cx={48} cy={46} r={22} fill="#ecfeff" stroke="#22d3ee" />
      <polygon points="88,26 118,34 112,66 82,62" fill="#f0fdfa" stroke="#2dd4bf" />
      <path d="M138 28 l26 6 -6 26 -22 -4 z" fill="#f5f3ff" stroke="#a78bfa" />
      <polygon points="26,78 54,72 62,102 34,110" fill="#fef2f2" stroke="#fb7185" />
      <circle cx={92} cy={98} r={20} fill="#fefce8" stroke="#facc15" />
      <path d="M128 76 l34 4 4 30 -30 6 -10 -22 z" fill="#eff6ff" stroke="#60a5fa" />
    </Sheet>
  </svg>
);

// ── Tool catalog ─────────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  // ── Imposition & layout ──
  {
    id: 'standardsizes', name: 'Standard Sizes', preset: 'Standard Sizes grid', category: 'Imposition & layout', engine: 'nup',
    desc: '19 presets: Letter, A4, SRA3 and more.',
    tags: ['Any sheet — presets or custom', 'auto-fit n-up grid', 'crop + center marks'],
    defaultNup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11 }, Thumb: gridThumb(2, 2, { numbered: true }),
  },
  {
    id: 'cutstack', name: 'Cut & Stack', preset: 'Cut & Stack', category: 'Imposition & layout', engine: 'nup',
    desc: 'Sequential numbers across cut stacks.',
    tags: ['Cut-and-stack (shingled)', 'guillotine-ready stacks', 'sequential per stack'],
    defaultNup: { cols: 2, rows: 3, sheetWIn: 11, sheetHIn: 17, cutStack: true },
    note: 'Print all sheets, guillotine into piles by cell position, then stack the piles — pages fall into sequence.',
    Thumb: gridThumb(2, 3, { numbered: true, accent: '#818cf8' }),
  },
  {
    id: 'expertgrid', name: 'Expert Grid', preset: 'Custom impose grid', category: 'Imposition & layout', engine: 'nup',
    desc: 'Full control over rows, gutters and margins.',
    tags: ['Per-cell rows · gutters · margins', 'independent creep + gutters', 'manual grid'],
    defaultNup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17 }, Thumb: gridThumb(2, 2),
  },
  {
    id: 'optimalfit', name: 'Optimal Fit', preset: 'Auto-fit grid', category: 'Imposition & layout', engine: 'nup',
    desc: 'Pack the most pages per sheet.',
    tags: ['Auto-scale n-up grid', 'fill the sheet edge-to-edge', 'more copies per sheet'],
    defaultNup: { sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.125, repeatFirst: true }, fitSource: true,
    note: 'The page is placed at its native size and packed edge-to-edge. Drop a page that already includes bleed.',
    Thumb: gridThumb(4, 5),
  },
  {
    id: 'gangsheet', name: 'Gang Sheet', preset: 'Gang sheet', category: 'Imposition & layout', engine: 'nup',
    desc: 'Many jobs on one press sheet.',
    tags: ['Many jobs / one sheet', 'work-and-turn or sheetwise', 'shared gutters + marks'],
    defaultNup: { cols: 3, rows: 3, sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.2 },
    note: 'Each page of the dropped PDF is ganged onto the sheet. For different jobs, merge them into one PDF first (Page & PDF tools → Merge).',
    Thumb: gridThumb(3, 3),
  },
  {
    id: 'contact', name: 'Index Print', preset: 'Photo contact sheet (8-up)', category: 'Imposition & layout', engine: 'nup',
    desc: 'A contact sheet of every page.',
    tags: ['8-up contact sheet', 'thumbnail grid', 'filename captions'],
    defaultNup: { cols: 4, rows: 5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.3, gutterIn: 0.1, addMarks: false },
    Thumb: gridThumb(4, 3, { numbered: true }),
  },
  {
    id: 'photo', name: 'Photo Prints', preset: 'Full-bleed photo cards (4×6)', category: 'Imposition & layout', engine: 'nup',
    desc: 'Many photos ganged on one sheet.',
    tags: ['2-up 4×6 in', 'Letter sheet', '⅛ in bleed', 'step-and-repeat'],
    defaultNup: { cellWIn: 6, cellHIn: 4, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(3, 3),
  },
  {
    id: 'flyer', name: 'Flyers', preset: '2-sided A5 flyer', category: 'Imposition & layout', engine: 'nup',
    desc: 'Multiple flyers up per sheet.',
    tags: ['2-up A5 · Letter sheet', 'double-sided', 'auto turn'],
    defaultNup: { cellWIn: 5.5, cellHIn: 8.5, sheetWIn: 12, sheetHIn: 18, marginIn: 0.25, gutterIn: 0.25 }, Thumb: cardThumb(2, 2),
  },

  // ── Booklets & books ──
  {
    id: 'nupbook', name: 'N-up Book', preset: 'N-up book', category: 'Booklets & books', engine: 'nupbook',
    desc: 'Multi-up signature imposition — 2-up folio or 4-up quarto, folded to read in order.',
    tags: ['2-up folio / 4-up quarto', 'perfect or nested', 'true fold imposition'],
    Thumb: gridThumb(2, 2, { numbered: true }),
  },
  {
    id: 'booklet', name: 'Booklet', preset: 'Booklet', category: 'Booklets & books', engine: 'booklet',
    desc: 'Saddle-stitch & perfect-bound spreads.',
    tags: ['Saddle-stitch printer spreads', 'auto page shuffle', 'creep + duplex'], Thumb: BookletThumb,
  },
  {
    id: 'magazine', name: 'Saddle-Stitch Magazine', preset: 'Saddle-Stitch A4 Magazine', category: 'Booklets & books', engine: 'booklet',
    desc: 'Stapled magazines & booklets.',
    tags: ['2-up A4 on A3', 'saddle-stitch booklet', 'CMYK color bar'],
    defaultBooklet: { marginIn: 0.6, creepIn: 0.09 }, Thumb: BookletThumb,
  },
  {
    id: 'perfectbound', name: 'Perfect-Bound Book', preset: 'Perfect Bound Trade Paperback (4-up)', category: 'Booklets & books', engine: 'booklet',
    desc: 'Squared-spine books & catalogs.',
    tags: ['4-up A5', 'perfect binding', '14.4 pt spine gutter', 'duplex'],
    defaultBooklet: { creepIn: 0, marginIn: 0.5 },
    note: 'Perfect binding gathers folded signatures; stack them in order before gluing the spine.', Thumb: BookletThumb,
  },
  {
    id: 'zine', name: 'Zine', preset: 'One-Sheet 8-Page Zine', category: 'Booklets & books', engine: 'booklet',
    desc: '8-page zine from a single sheet.',
    tags: ['8 panels / one sheet', 'single fold-and-cut', 'auto-rotated panels'],
    defaultBooklet: { marginIn: 0.35, creepIn: 0.06 }, Thumb: BookletThumb,
  },
  {
    id: 'program', name: 'Event Program', preset: 'Playbill / Theater Program', category: 'Booklets & books', engine: 'booklet',
    desc: 'Folded, stapled event programs.',
    tags: ['2-up A5 on A4', 'saddle-stitch', 'trim-ready (no marks)'],
    defaultBooklet: { marginIn: 0.5 }, Thumb: BookletThumb,
  },
  {
    id: 'catalog', name: 'Catalog', preset: 'Digest Magazine (5.5×8.5")', category: 'Booklets & books', engine: 'booklet',
    desc: 'Perfect-bound product catalogs.',
    tags: ['4-up nested digest 5.5×8.5 in', 'Tabloid sheet', 'inward creep', 'duplex'],
    defaultBooklet: { marginIn: 0.5, creepIn: 0.15 }, Thumb: BookletThumb,
  },
  {
    id: 'comic', name: 'Comic / Manga', preset: 'US Comic Book (6.625×10.25")', category: 'Booklets & books', engine: 'booklet',
    desc: 'Left- or right-to-left bound comic booklets.',
    tags: ['2-up 6.625×10.25 in', 'Tabloid sheet', 'saddle-stitch', '⅛ in bleed'],
    defaultBooklet: { marginIn: 0.5, gutterIn: 0, creepIn: 0.125 }, Thumb: ComicThumb,
  },
  {
    id: 'notebook', name: 'Notebook', preset: 'A5 Pocket Book', category: 'Booklets & books', engine: 'booklet',
    desc: 'Lined notebooks & journals.',
    tags: ['2-up A5 on A4', 'saddle-stitch', '⅛ in bleed'],
    defaultBooklet: { marginIn: 0.4, creepIn: 0.08 }, Thumb: BookletThumb,
  },
  {
    id: 'flipbook', name: 'Flip Book', preset: 'Frame grid', category: 'Booklets & books', engine: 'nup',
    desc: 'Frames imposed many-up to print and bind.',
    tags: ['12-up frame grid', 'sequential cut order', 'cut marks + bleed'],
    defaultNup: { cols: 4, rows: 3, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.1, cutStack: true },
    Thumb: gridThumb(4, 3, { numbered: true }),
  },

  // ── Cards & labels ──
  {
    id: 'business', name: 'Business Cards', preset: '10-Up Business Cards', category: 'Cards & labels', engine: 'nup',
    desc: 'Gang multiple cards per sheet.',
    tags: ['10-up (2×5)', '3.5×2 in', 'Letter sheet', '⅛ in bleed', 'crop in gutters', 'duplex'],
    defaultNup: { cellWIn: 3.5, cellHIn: 2, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(2, 4),
  },
  {
    id: 'trading', name: 'Trading Cards', preset: '9-Up Trading Cards', category: 'Cards & labels', engine: 'nup', badge: '★',
    desc: 'Standard 2.5×3.5" trading cards, 9-up on letter.',
    tags: ['9-up (3×3)', '2.5×3.5 in', 'Letter sheet', 'cut marks'],
    defaultNup: { cellWIn: 2.5, cellHIn: 3.5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.125, gutterIn: 0.125 },
    note: 'Design each card at 2.5×3.5". For full-bleed art switch the sheet to 12×18".', Thumb: cardThumb(3, 3, '★'),
  },
  {
    id: 'stickers', name: 'Stickers', preset: 'Kiss-cut sticker sheet', category: 'Cards & labels', engine: 'nup',
    desc: 'Die-cut sticker sheets, ganged up.',
    tags: ['Nest on sheet or roll', 'shape detection', 'kiss-cut / contour die lines'],
    defaultNup: { cols: 3, rows: 3, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.2, repeatFirst: true }, Thumb: gridThumb(3, 3),
  },
  {
    id: 'steprepeat', name: 'Step & Repeat', preset: 'Step & Repeat grid', category: 'Cards & labels', engine: 'nup',
    desc: 'One design, repeated across the sheet.',
    tags: ['Step-and-repeat n-up', 'identical copies', 'shared gutters + crop marks'],
    defaultNup: { cols: 3, rows: 3, sheetWIn: 11, sheetHIn: 17, repeatFirst: true }, Thumb: gridThumb(3, 3),
  },
  {
    id: 'calendar', name: 'Calendar', preset: 'Desk Calendar (Tent Style)', category: 'Cards & labels', engine: 'calendar',
    desc: 'Build print-ready calendar layouts.',
    tags: ['Half-sheet calendar pages', 'Letter landscape', 'spine gutter', 'outward creep'],
    defaultBooklet: { marginIn: 0.5, creepIn: 0.1 }, Thumb: BookletThumb,
  },
  {
    id: 'postcard', name: 'Postcards', preset: 'Full-Bleed Postcards (4-up + Bleed)', category: 'Cards & labels', engine: 'nup',
    desc: 'Gang postcards with cut gaps.',
    tags: ['4-up 4×6 in', 'Tabloid sheet', '⅛ in bleed', 'crop + center marks', 'duplex'],
    defaultNup: { cellWIn: 6, cellHIn: 4, sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(2, 3),
  },
  {
    id: 'labels', name: 'Labels', preset: 'Mailing Labels (Avery 5160 style)', category: 'Cards & labels', engine: 'nup',
    desc: 'Die-cut label sheets & rolls.',
    tags: ['30-up (Avery 5160)', '1×2.625 in', 'Letter sheet', 'trim-ready'],
    defaultNup: { cellWIn: 2.625, cellHIn: 1, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.1875, gutterIn: 0.125, gutterYIn: 0, addMarks: false },
    note: 'Sized to the Avery 5160 die (3 across × 10 down). Marks off — the stock is pre-die-cut.', Thumb: gridThumb(3, 10),
  },
  {
    id: 'bookmark', name: 'Bookmarks', preset: 'Bookmarks (6-up)', category: 'Cards & labels', engine: 'nup',
    desc: 'Step-and-repeat bookmark strips.',
    tags: ['6-up (3×2)', '2×6 in', 'Letter sheet', 'crop in gutters', 'duplex'],
    defaultNup: { cellWIn: 2, cellHIn: 6, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(4, 1),
  },
  {
    id: 'hangtag', name: 'Hang Tags', preset: 'Hang Tags 8-Up (2.5×4")', category: 'Cards & labels', engine: 'nup',
    desc: 'Product tags, ganged & punched.',
    tags: ['8-up (2×4)', '2.5×4 in', 'Tabloid sheet', '⅛ in bleed', 'die-cut contour'],
    defaultNup: { cellWIn: 2, cellHIn: 3.5, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(3, 3),
  },
  {
    id: 'coasters', name: 'Coasters', preset: 'Square Coasters (4-up)', category: 'Cards & labels', engine: 'nup',
    desc: 'Round & square drink coasters.',
    tags: ['4-up 3.5 in', 'Tabloid sheet', 'contour die-cut', 'nested fill'],
    defaultNup: { cellWIn: 3.5, cellHIn: 3.5, sheetWIn: 11, sheetHIn: 17, marginIn: 0.25, gutterIn: 0.25 }, Thumb: cardThumb(2, 2),
  },
  {
    id: 'letterhead', name: 'Letterhead', preset: 'Letterhead Gang Run', category: 'Cards & labels', engine: 'nup',
    desc: 'Branded business letterheads.',
    tags: ['Gang multiple clients', 'Tabloid sheet', 'CMYK color bar', 'cut marks per job'],
    defaultNup: { cellWIn: 8.5, cellHIn: 11, sheetWIn: 17, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.25 }, Thumb: cardThumb(2, 1),
  },
  {
    id: 'complimentslip', name: 'Compliment Slips', preset: 'Compliment Slips (DL 3-up)', category: 'Cards & labels', engine: 'nup',
    desc: 'DL slips ganged 3-up.',
    tags: ['DL 3-up (1×3)', '210×99 mm', 'SRA4 oversize', '⅛ in bleed', 'crop in gutters'],
    defaultNup: { cellWIn: 8.27, cellHIn: 3.9, sheetWIn: 8.86, sheetHIn: 12.6, marginIn: 0.25, gutterIn: 0.1 }, Thumb: cardThumb(1, 3),
  },
  {
    id: 'ncrpads', name: 'NCR Pads', preset: 'NCR Form (3-Part Carbon)', category: 'Cards & labels', engine: 'nup',
    desc: 'Carbonless multi-part forms.',
    tags: ['3-part carbonless', 'white / pink / yellow', 'Letter sheet', 'collated set'],
    defaultNup: { cellWIn: 8.5, cellHIn: 11, sheetWIn: 17, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.25 },
    note: 'Print one set per colour stock (white / pink / yellow), then collate into pads.', Thumb: cardThumb(2, 1),
  },
  {
    id: 'envelope', name: 'Envelopes', preset: 'Envelope Flats 4-Up (#10)', category: 'Cards & labels', engine: 'nup',
    desc: 'Printed envelope flats.',
    tags: ['4-up #10 flats', '9.5×4.125 in', 'Letter sheet', 'crop marks'],
    defaultNup: { cellWIn: 9.5, cellHIn: 4.125, sheetWIn: 11, sheetHIn: 17, marginIn: 0.25, gutterIn: 0.25 }, Thumb: cardThumb(1, 3),
  },

  // ── Folding ──
  {
    id: 'trifold', name: 'Trifold Brochure', preset: 'Tri-Fold Brochure 2-Up', category: 'Folding', engine: 'nup',
    desc: 'Roll-fold & gate-fold leaflets.',
    tags: ['Tri-fold brochure', 'front + back flats (duplex)', '⅛ in bleed', 'crop + center marks'],
    defaultNup: { cols: 3, rows: 1, sheetWIn: 11, sheetHIn: 8.5, marginIn: 0.25, gutterIn: 0 },
    panelGuide: ['Sheet 1 = outside (back cover · front cover · fold-in flap)', 'Sheet 2 = inside spread (left · middle · right)'],
    note: 'Supply 6 pages in panel order (outside L→R, then inside L→R).', Thumb: foldThumb(3),
  },
  {
    id: 'zfold', name: 'Folded Brochure', preset: 'Z-Fold Accordion (6-Panel, Tabloid)', category: 'Folding', engine: 'nup',
    desc: 'Roll-fold, Z-fold & gate-fold.',
    tags: ['Z-fold accordion, 6 panels', 'Tabloid sheet', 'crop marks', 'duplex'],
    defaultNup: { cols: 4, rows: 1, sheetWIn: 17, sheetHIn: 11, marginIn: 0.25, gutterIn: 0 },
    note: 'Supply panels in accordion order; folds alternate direction.', Thumb: foldThumb(4),
  },
  {
    id: 'greeting', name: 'Greeting Card', preset: 'Greeting Card (A5 Fold)', category: 'Folding', engine: 'booklet',
    desc: 'Folded cards with full bleed.',
    tags: ['2-up A5 single fold', 'Letter landscape', 'single saddle', 'trim-ready'],
    defaultBooklet: { marginIn: 0.25, creepIn: 0, addMarks: true },
    note: 'Supply a 4-page PDF (front, inside-left, inside-right, back).', Thumb: foldThumb(2),
  },
  {
    id: 'menu', name: 'Menu', preset: 'Bi-Fold Restaurant Menu', category: 'Folding', engine: 'booklet',
    desc: 'Folded & bi-fold menus.',
    tags: ['Bi-fold, 4-panel menu', 'Tabloid sheet', '⅛ in bleed', 'crop + center marks', 'duplex'],
    defaultBooklet: { marginIn: 0.4, creepIn: 0, addMarks: true },
    note: 'Supply a 4-page PDF (front, inside-left, inside-right, back).', Thumb: foldThumb(2),
  },
  {
    id: 'wedding', name: 'Wedding Invitation', preset: '2-Up Invitation Cards (5×7")', category: 'Folding', engine: 'nup',
    desc: 'Folded invites & suites.',
    tags: ['2-up 5×7 in', 'Letter sheet', '⅛ in bleed', 'crop in gutters', 'duplex'],
    defaultNup: { cellWIn: 5, cellHIn: 7, sheetWIn: 13, sheetHIn: 19, marginIn: 0.25, gutterIn: 0.125 }, Thumb: cardThumb(2, 2),
  },
  {
    id: 'presfolder', name: 'Presentation Folder', preset: 'Presentation Folder Dieline (A4 Pocket)', category: 'Folding', engine: 'dieline', dielineKind: 'folder',
    desc: 'Die-cut folders with pockets.',
    tags: ['back + front panels', 'fold-up pockets', 'glue tabs', 'cut + crease dieline'],
    note: 'Generates the folder dieline (cut + crease lines) from your dimensions — no source file needed.', Thumb: cardThumb(1, 1),
  },

  // ── Large & specialty ──
  {
    id: 'poster', name: 'Tiled Poster', preset: 'Tiled Poster (A4 tiles to A0)', category: 'Large & specialty', engine: 'poster',
    desc: 'Big posters from small sheets.',
    tags: ['A0 across 8 A4 tiles', '4×2 grid', 'crop + center marks'],
    defaultPoster: { tilesAcross: 4, tilesDown: 2, sheetWIn: 8.27, sheetHIn: 11.69, overlapIn: 0.5 }, Thumb: PosterThumb,
  },
  {
    id: 'banner', name: 'Banner', preset: 'Banner Tiles 4-Up (24×36" panels)', category: 'Large & specialty', engine: 'poster',
    desc: 'Wide banners tiled across sheets.',
    tags: ['96×36 in banner', '4×1 tiles of 24×36', 'wide-format'],
    defaultPoster: { tilesAcross: 4, tilesDown: 1, sheetWIn: 24, sheetHIn: 36, overlapIn: 0.5 }, Thumb: PosterThumb,
  },
  {
    id: 'featherflag', name: 'Feather Flags', preset: 'Feather Flag (Soft Signage)', category: 'Large & specialty', engine: 'nup',
    desc: 'Feather & teardrop flag signage.',
    tags: ['700×2300 mm medium flag', 'single panel · dye-sub', 'edge-to-edge, no marks'],
    defaultNup: { cols: 1, rows: 1, sheetWIn: 27.5, sheetHIn: 90.5, marginIn: 0, gutterIn: 0, addMarks: false },
    note: 'Scales your artwork to the flag size, 1-up, full-bleed.', Thumb: cardThumb(1, 1),
  },
  {
    id: 'rollerbanner', name: 'Roller Banner', preset: 'Retractable Banner (33×80")', category: 'Large & specialty', engine: 'nup',
    desc: 'Retractable pull-up banner stands.',
    tags: ['33×80 in pull-up', 'single portrait panel', 'scale to stand size'],
    defaultNup: { cols: 1, rows: 1, sheetWIn: 33, sheetHIn: 80, marginIn: 0, gutterIn: 0, addMarks: false },
    note: 'Scales your artwork to the stand size, 1-up.', Thumb: cardThumb(1, 1),
  },
  {
    id: 'packaging', name: 'Packaging Dieline', preset: 'Folding Carton Dieline', category: 'Large & specialty', engine: 'dieline', dielineKind: 'ste',
    desc: 'Boxes, cartons & custom shapes.',
    tags: ['Folding-carton dieline', 'tuck + dust flaps', 'fold + glue panels', 'cut + crease lines'],
    note: 'Generates a folding-carton box net (cut + crease + glue) from your Width × Height × Depth — no source file needed.', Thumb: cardThumb(1, 1),
  },
  {
    id: 'boxcarton', name: 'Box / Carton', preset: 'Folding Carton — Straight Tuck End', category: 'Large & specialty', engine: 'dieline', dielineKind: 'ste',
    desc: 'Folding-carton dielines.',
    tags: ['Straight-tuck carton dieline', 'tuck + glue flaps', 'W × H × D', 'cut + crease lines'],
    note: 'Generates a straight-tuck-end carton net (cut + crease + glue) from your dimensions.', Thumb: cardThumb(1, 1),
  },

  // ── Tickets & data ──
  {
    id: 'tickets', name: 'Variable Data Printing', preset: 'Event Tickets (CSV merge)', category: 'Tickets & data', engine: 'datamerge',
    desc: 'Serialize tickets, vouchers, badges and labels.',
    tags: ['CSV → one cell per row', 'sequential numbering', 'scannable QR per row'],
    defaultNup: { cols: 2, rows: 5, sheetWIn: 8.5, sheetHIn: 11 }, Thumb: TicketThumb,
  },
  {
    id: 'raffle', name: 'Raffle Tickets', preset: 'Raffle Tickets (numbered)', category: 'Tickets & data', engine: 'tickets',
    desc: 'Numbered, cut-and-stack tickets.',
    tags: ['Numbered per stub', 'sequential raffle #', 'perforated n-up'],
    defaultTicket: { cols: 1, rows: 5, sheetWIn: 8.5, sheetHIn: 11, prefix: 'No. ', pad: 5 }, Thumb: TicketThumb,
  },
  {
    id: 'coupons', name: 'Coupons', preset: 'Gift Vouchers (CSV merge)', category: 'Tickets & data', engine: 'datamerge',
    desc: 'Serialized coupons & vouchers.',
    tags: ['Unique code per voucher', 'name merge from CSV', 'QR per voucher'],
    defaultNup: { cols: 2, rows: 4, sheetWIn: 8.5, sheetHIn: 11 }, Thumb: TicketThumb,
  },
  {
    id: 'namebadge', name: 'Name Badges', preset: 'Conference Badges (CSV merge)', category: 'Tickets & data', engine: 'datamerge',
    desc: 'Personalized event badges.',
    tags: ['Name + company from CSV', 'spreadsheet merge', 'n-up imposed'],
    defaultNup: { cols: 2, rows: 4, sheetWIn: 8.5, sheetHIn: 11 }, Thumb: cardThumb(2, 4),
  },

  // ── Marks & prepress ──
  {
    id: 'bleedmarks', name: 'Bleed & Crop Marks', preset: 'BleedMaker', category: 'Marks & prepress', engine: 'bleed',
    desc: 'Print edge-to-edge with confidence.',
    tags: ['Add bleed to artwork', 'scale or mirror-extend', 'set bleed amount'], Thumb: CropToolThumb,
  },
  {
    id: 'cropmarks', name: 'Cutter Marks', preset: 'Cutter Marks', category: 'Marks & prepress', engine: 'cropmarks',
    desc: 'Registration & cutter guides on every tile.',
    tags: ['Crop + registration marks', 'die-cut paths (Thru / Kiss-cut)', 'key marks'], Thumb: MarksThumb,
  },
  {
    id: 'colorbar', name: 'Color Bar & Header', preset: 'Color Bar', category: 'Marks & prepress', engine: 'colorbar',
    desc: 'Running headers, footers and control strips.',
    tags: ['CMYK + spot color bar', 'registration crosshairs', 'slug header'],
    note: 'Adds the CMYK/registration control strip. For running headers/footers, chain the Header/Footer step in a workflow.', Thumb: ColorBarThumb,
  },
  {
    id: 'pagenumbers', name: 'Page Numbering & Bates', preset: 'Page Numbering', category: 'Marks & prepress', engine: 'pagenumbers',
    desc: 'Sequential & Bates stamps on every page.',
    tags: ['Page numbers / Bates', 'tokens [page] / [count]', 'any margin + rotation'], Thumb: PageNumThumb,
  },
  {
    id: 'preflight', name: 'Preflight Inspector', preset: 'Preflight Inspector', category: 'Marks & prepress', engine: 'preflight',
    desc: 'Catch print problems before output.',
    tags: ['Page boxes + fonts', 'DPI, color + hairlines', 'issue rail + marked proof'], Thumb: PageNumThumb,
  },

  // ── Page & PDF tools ──
  {
    id: 'merge', name: 'Merge PDFs', preset: 'Merge', category: 'Page & PDF tools', engine: 'merge',
    desc: 'Combine multiple PDF files into one document in any order.',
    tags: ['multiple files', 'set order'], Thumb: MergeThumb,
  },
  {
    id: 'split', name: 'Split PDF', preset: 'Split', category: 'Page & PDF tools', engine: 'split',
    desc: 'Break a PDF into separate files by page ranges (e.g. 1-3, 4-6, 7).',
    tags: ['page ranges', 'multi-output'], Thumb: SplitThumb,
  },
  {
    id: 'rotate', name: 'Rotate', preset: 'Rotate', category: 'Page & PDF tools', engine: 'rotate',
    desc: 'Rotate all pages in a PDF by 90°, 180°, or 270°.',
    tags: ['all pages', '90 / 180 / 270°'], Thumb: RotateThumb,
  },
  {
    id: 'flip', name: 'Flip / Mirror', preset: 'Flip', category: 'Page & PDF tools', engine: 'flip',
    desc: 'Mirror every page horizontally or vertically — handy for transfers.',
    tags: ['mirror', 'H / V', 'transfers'], Thumb: FlipThumb,
  },
  {
    id: 'overlay', name: 'Overlay / Watermark', preset: 'Overlay', category: 'Page & PDF tools', engine: 'overlay',
    desc: 'Stamp a second PDF over every page — watermark, logo or background.',
    tags: ['watermark', 'opacity', 'tile / fill'], Thumb: OverlayThumb,
  },
  {
    id: 'shuffle', name: 'Shuffle Pages', preset: 'Shuffle', category: 'Page & PDF tools', engine: 'shuffle',
    desc: 'Reorder, duplicate or drop pages with a simple order list.',
    tags: ['reorder', 'custom order'], Thumb: ShuffleThumb,
  },
  {
    id: 'crop', name: 'Crop', preset: 'Crop', category: 'Page & PDF tools', engine: 'crop',
    desc: 'Trim margins off every page by setting a crop inset per edge.',
    tags: ['trim edges', 'crop box'], Thumb: CropToolThumb,
  },
  {
    id: 'resize', name: 'Resize / Scale', preset: 'Resize', category: 'Page & PDF tools', engine: 'resize',
    desc: 'Scale pages by a percentage, or drop them onto a fixed paper size (fit or stretch).',
    tags: ['scale %', 'fit to paper', 'stretch'], Thumb: ResizeThumb,
  },
  {
    id: 'insertpages', name: 'Insert Pages', preset: 'Insert Pages', category: 'Page & PDF tools', engine: 'insert',
    desc: 'Insert blank pages before a chosen page, or after every N pages (slip-sheets).',
    tags: ['blank pages', 'slip-sheets', 'every N'], Thumb: InsertThumb,
  },
  {
    id: 'mix', name: 'Mix / Interleave', preset: 'Mix', category: 'Page & PDF tools', engine: 'mix',
    desc: 'Weave two PDFs together (A1, B1, A2, B2…) — combine single-sided front & back scans.',
    tags: ['interleave', 'two files', 'ABAB'], Thumb: MixThumb,
  },
  {
    id: 'nudge', name: 'Nudge', preset: 'Nudge', category: 'Page & PDF tools', engine: 'nudge',
    desc: 'Shift page content by a small offset and/or rotate it about the centre — fix mis-registration.',
    tags: ['shift', 'micro-rotate', 'press fudge'], Thumb: NudgeThumb,
  },
  {
    id: 'distort', name: 'Distortion Comp.', preset: 'Distortion Compensation', category: 'Large & specialty', engine: 'distort',
    desc: 'Pre-shrink artwork for flexo / gravure cylinder stretch so it prints at the right size.',
    tags: ['flexo / gravure', 'cylinder pre-distort', 'circumferential'], Thumb: DistortThumb,
  },
  {
    id: 'repair', name: 'PDF Repair', preset: 'PDF Repair', category: 'Page & PDF tools', engine: 'repair',
    desc: 'Rebuild a PDF from scratch — drops broken cross-references and dead objects, and optionally strips metadata, annotations and JavaScript.',
    tags: ['normalize', 'rebuild', 'fix xref'], Thumb: RepairThumb,
  },
  {
    id: 'coloreffects', name: 'Color Effects', preset: 'Color Effects', category: 'Page & PDF tools', engine: 'coloreffects',
    desc: 'Apply brightness / contrast / saturation and grayscale / warm / invert / hue effects by rasterising the targeted pages. Runs in the browser.',
    tags: ['colour grade', 'grayscale / sepia', 'rasterise'], Thumb: ColorEffectsThumb,
  },
  {
    id: 'colormanage', name: 'Color Management', preset: 'Color Management', category: 'Large & specialty', engine: 'colormanage',
    desc: 'Embed a destination ICC profile as a PDF/X OutputIntent, and/or convert pages to the CMYK-reproducible gamut with an out-of-gamut warning.',
    tags: ['ICC / OutputIntent', 'RGB→CMYK', 'gamut warning'], Thumb: ColorManageThumb,
  },
  {
    id: 'layers', name: 'Layers', preset: 'Layers', category: 'Page & PDF tools', engine: 'layers',
    desc: 'Show or hide named PDF layers (Optional Content Groups) in the output — force each layer on, off, or leave at its default.',
    tags: ['OCG layers', 'toggle visibility', 'selective output'], Thumb: () => (<svg viewBox="0 0 200 148" width="100%" height="100%">{frame}<g fill="none" stroke={A} strokeWidth="2">{[0,1,2].map(i=>(<polygon key={i} points={`100,${44+i*14} 138,${58+i*14} 100,${72+i*14} 62,${58+i*14}`} fill={i===0?'#ede9fe':'none'} />))}</g></svg>),
  },
  {
    id: 'customgrid', name: 'Custom Impose', preset: 'Custom Impose (Expert Grid)', category: 'Imposition & layout', engine: 'customgrid',
    desc: 'Full manual control — define a column×row grid and assign any source page to any cell with per-cell rotation. The escape hatch for non-standard signatures.',
    tags: ['expert grid', 'per-cell placement', 'manual imposition'], Thumb: gridThumb(2, 2, { numbered: true, accent: A }),
  },
  {
    id: 'pdftools', name: 'PDF Tools', preset: 'PDF Optimizer', category: 'Page & PDF tools', engine: 'pdftools',
    desc: 'Optimize (shrink), decrypt (remove password), or repair a PDF. Encryption and linearization need a server-side pass and are flagged as such.',
    tags: ['optimize / shrink', 'decrypt', 'repair'], Thumb: RepairThumb,
  },
  {
    id: 'editpdf', name: 'Edit PDF', preset: 'Edit PDF', category: 'Page & PDF tools', engine: 'editpdf',
    desc: 'Apply page edits — add text, redact (opaque box), draw boxes/lines, rotate individual pages, and delete pages.',
    tags: ['annotate', 'redact', 'rotate / delete pages'], Thumb: () => (<svg viewBox="0 0 200 148" width="100%" height="100%">{frame}<rect x="64" y="40" width="72" height="9" rx="2" fill="#cbd5e1" /><rect x="64" y="58" width="52" height="9" rx="2" fill="#111" /><rect x="64" y="76" width="60" height="9" rx="2" fill="#cbd5e1" /><path d="M120 96 l14 -14 8 8 -14 14 -10 2 z" fill="#fde68a" stroke={A} strokeWidth="1.5" /></svg>),
  },
  {
    id: 'jdf', name: 'JDF / CIP4 Export', preset: 'JDF / CIP4 Export', category: 'Large & specialty', engine: 'jdf',
    desc: 'Export a CIP4 JDF 1.4 Product-intent job ticket (.jdf XML) describing the finished size, media, quantity, sides and binding for MIS / prepress scheduling.',
    tags: ['JDF 1.4', 'CIP4', 'job ticket'], Thumb: () => (<svg viewBox="0 0 200 148" width="100%" height="100%">{frame}<text x="100" y="70" textAnchor="middle" fontFamily="monospace" fontSize="13" fill={A}>&lt;JDF/&gt;</text><rect x="64" y="86" width="72" height="6" rx="1" fill="#cbd5e1" /><rect x="64" y="98" width="52" height="6" rx="1" fill="#cbd5e1" /></svg>),
  },
  {
    id: 'registration', name: 'Registration Marks', preset: 'Registration Marks', category: 'Marks & prepress', engine: 'registration',
    desc: 'Add press registration targets (bullseye + crosshair) at the corners and edge midpoints.',
    tags: ['target', 'crosshair', 'colour align'], Thumb: RegThumb,
  },
  {
    id: 'watermark', name: 'Watermark', preset: 'Watermark', category: 'Marks & prepress', engine: 'watermark',
    desc: 'Stamp a diagonal text watermark (PROOF, DRAFT, CONFIDENTIAL) across every page.',
    tags: ['proof', 'draft', 'diagonal text'], Thumb: OverlayThumb,
  },
  {
    id: 'headerfooter', name: 'Header / Footer', preset: 'Header / Footer', category: 'Marks & prepress', engine: 'headerfooter',
    desc: 'Add a running header and/or footer line to every page, aligned left, centre or right.',
    tags: ['running head', 'footer', 'title'], Thumb: HFThumb,
  },
  {
    id: 'slug', name: 'Slugline', preset: 'Slugline', category: 'Marks & prepress', engine: 'slug',
    desc: 'Add a thin job-info strip (name, date, notes) along the top or bottom edge.',
    tags: ['job info', 'slug strip', 'metadata'], Thumb: SlugThumb,
  },
  {
    id: 'collating', name: 'Collating Marks', preset: 'Collating Marks', category: 'Marks & prepress', engine: 'collating',
    desc: 'Stepped spine ticks that form a descending staircase so mis-gathered signatures show at a glance.',
    tags: ['gather marks', 'spine', 'signatures'], Thumb: CollateThumb,
  },
  {
    id: 'omr', name: 'OMR Marks', preset: 'OMR Marks', category: 'Marks & prepress', engine: 'omr',
    desc: 'Add optical machine-readable bars along a sheet edge that automated bindery equipment reads to trigger fold / collate / cut / stack.',
    tags: ['optical marks', 'bindery automation', 'fold/collate/cut'], Thumb: OmrThumb,
  },
  {
    id: 'gathering', name: 'Gathering Marks', preset: 'Gathering Marks', category: 'Marks & prepress', engine: 'gathering',
    desc: 'Gripper-edge marks that step across the leading edge so a mis-gathered sheet stack shows a broken staircase — a front-of-press QC check.',
    tags: ['gripper edge', 'gather QC', 'sheet sequence'], Thumb: GatherThumb,
  },
  {
    id: 'foldmarks', name: 'Folding Marks', preset: 'Folding Marks', category: 'Marks & prepress', engine: 'foldmarks',
    desc: 'Dashed fold-tick guides in the trim margin for half / letter / Z / gate / double-parallel / roll / accordion / custom fold schemes.',
    tags: ['fold guides', 'brochure', 'tri-fold / Z / gate'], Thumb: FoldMarksThumb,
  },
  {
    id: 'laymarks', name: 'Lay Marks', preset: 'Lay Marks', category: 'Marks & prepress', engine: 'laymarks',
    desc: 'Press-sheet alignment guides — front lay at the gripper edge and side lay on the guide side — as arrow, line or crosshair marks.',
    tags: ['front lay', 'side lay', 'press alignment'], Thumb: LayThumb,
  },
  {
    id: 'cutcontour', name: 'Die Lines', preset: 'Cut Contour', category: 'Marks & prepress', engine: 'cutcontour',
    desc: 'Draw a die-line path (rectangle / rounded / ellipse) on a real spot-colour channel (CutContour, KissCut, Crease, Perf, DieCut) that RIPs and digital cutters read as a toolpath.',
    tags: ['cut contour', 'kiss-cut / thru-cut', 'spot colour'], Thumb: CutContourThumb,
  },
  {
    id: 'whitevarnish', name: 'White / Varnish', preset: 'White / Varnish', category: 'Marks & prepress', engine: 'whitevarnish',
    desc: 'Add a white-ink under-base or spot-varnish / gloss layer as a named Separation spot colour — flood, trim, bleed or custom coverage.',
    tags: ['white ink', 'spot varnish', 'under-base / gloss'], Thumb: WhiteVarnishThumb,
  },
  {
    id: 'braille', name: 'Braille', preset: 'Braille', category: 'Marks & prepress', engine: 'braille',
    desc: 'Add raised Grade-1 (uncontracted) Braille dots at ADA metrics, optionally on an emboss / varnish spot channel.',
    tags: ['Grade-1 braille', 'ADA', 'raised dots'], Thumb: BrailleThumb,
  },
  {
    id: 'qrstamp', name: 'Barcode / QR', preset: 'Barcode / QR', category: 'Marks & prepress', engine: 'barcode',
    desc: 'Stamp a QR, Code 128, DataMatrix (ECC200) or EAN-13 barcode — scale, quiet zone, 9-point position, rotation, colours and human-readable text.',
    tags: ['QR / DataMatrix', 'Code 128 / EAN-13', 'scannable'], Thumb: QrThumb,
  },
  {
    id: 'backdropfile', name: 'Backdrop', preset: 'Backdrop', category: 'Marks & prepress', engine: 'backdropfile',
    desc: 'Place an uploaded PDF or image behind your page content — pre-printed stationery, textured stock or a brand frame — with scale, offset, opacity and repeat.',
    tags: ['background layer', 'stationery', 'underlay'], Thumb: BackdropThumb,
  },
  {
    id: 'backdrop', name: 'Background Fill', preset: 'Background Fill', category: 'Marks & prepress', engine: 'backdrop',
    desc: 'Paint a solid colour behind every page — put borderless art onto a coloured stock.',
    tags: ['background', 'flatten', 'coloured stock'], Thumb: BackdropThumb,
  },
  {
    id: 'dimensions', name: 'Dimensions', preset: 'Dimensions', category: 'Marks & prepress', engine: 'dimensions',
    desc: 'Annotate each page with its exact trim size in inches and points — a quick pre-impose check.',
    tags: ['measure', 'trim size', 'inspect'], Thumb: DimThumb,
  },
  {
    id: 'nest', name: 'Nesting / Stickers', preset: 'True-Shape Nesting', category: 'Cards & labels', engine: 'nest',
    desc: 'Pack many die-cut shapes onto a sheet or roll with the least waste — skyline bin-packing, optional true-shape (contour-aware) mode.',
    tags: ['sticker gang', 'bin-pack', 'true-shape nest', 'roll or sheet'], Thumb: NestThumb,
  },
];

// ── Templates ─────────────────────────────────────────────────────────────────
// Named, industry-organized presets. Each opens one of the tools above with a
// specific set of option overrides pre-applied — the pdfpress "Templates" idea.

interface TemplatePreset {
  nup?: Partial<NUpOptions>;
  booklet?: Partial<BookletOptions>;
  poster?: Partial<PosterOptions>;
  ticket?: Partial<TicketOptions>;
  resize?: Partial<ResizeOptions>;
}

interface TemplateDef {
  id: string;
  name: string;
  industry: string;
  toolId: string;      // which tool this template opens
  specs: string;       // one-line size/finish summary
  preset?: TemplatePreset;
}

const TEMPLATE_INDUSTRIES = [
  'Commercial Print', 'Packaging', 'Publishing', 'Large Format', 'Office', 'Variable Data', 'Real Estate',
];

const TEMPLATES: TemplateDef[] = [
  // ── Commercial Print ──
  { id: "t000-10-up-business-cards", name: "10-Up Business Cards", industry: "Commercial Print", toolId: "business", specs: "Standard US business cards (3.5×2\") ganged 10-up on Letter with bleeds and crop marks.", preset: { nup: { cellWIn: 3.5, cellHIn: 2.0, sheetWIn: 8.5, sheetHIn: 11, bleedIn: 0.125, addMarks: true } } },
  { id: "t001-14-up-business-cards-tabloid", name: "14-Up Business Cards (Tabloid)", industry: "Commercial Print", toolId: "business", specs: "Production-run business cards ganged 14-up on 11×17\" tabloid for commercial offset.", preset: { nup: { cols: 2, rows: 7, sheetWIn: 11.0, sheetHIn: 17.0, addMarks: true } } },
  { id: "t002-2-up-door-hangers", name: "2-Up Door Hangers", industry: "Commercial Print", toolId: "gangsheet", specs: "Standard door hangers (3.875×8.75\") ganged 2-up on Letter with trim marks.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t003-2-up-gift-certificates-5-7", name: "2-Up Gift Certificates (5×7\")", industry: "Commercial Print", toolId: "coupons", specs: "5×7\" gift certificates, 2-up on Letter stock with crop marks." },
  { id: "t004-2-up-invitation-cards-5-7", name: "2-Up Invitation Cards (5×7\")", industry: "Commercial Print", toolId: "wedding", specs: "Wedding/event invitations (5×7\") printed 2-up on Letter with premium bleeds.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, bleedIn: 0.125, addMarks: true } } },
  { id: "t005-2-up-notepad-sheets", name: "2-Up Notepad Sheets", industry: "Commercial Print", toolId: "ncrpads", specs: "Half-letter notepads (5.5×8.5\") printed 2-up on Letter (laid landscape) for padding.", preset: { nup: { cols: 2, rows: 1, sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  { id: "t006-2-up-postcards-4-6", name: "2-Up Postcards (4×6\")", industry: "Commercial Print", toolId: "postcard", specs: "USPS-standard 4×6\" postcards, 2-up on Letter for desktop or short-run digital.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t007-2-up-rack-cards-4-9", name: "2-Up Rack Cards (4×9\")", industry: "Commercial Print", toolId: "postcard", specs: "Standard rack cards for brochure holders, 2-up on tabloid stock.", preset: { nup: { cellWIn: 4.0, cellHIn: 9.0, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t008-3-up-door-hangers", name: "3-Up Door Hangers", industry: "Commercial Print", toolId: "gangsheet", specs: "3.5×8.5\" door hangers ganged 3-up across on Tabloid for die-cutting.", preset: { nup: { cols: 1, rows: 3, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t009-4-up-rack-cards-3-5-7", name: "4-Up Rack Cards (3.5×7\")", industry: "Commercial Print", toolId: "postcard", specs: "Vertical rack cards ganged 4-up on Tabloid. Standard tourism and retail display size (Letter cannot h…", preset: { nup: { cellWIn: 3.5, cellHIn: 7.0, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t010-4-up-ticket-strips", name: "4-Up Ticket Strips", industry: "Commercial Print", toolId: "raffle", specs: "Event/raffle tickets (8×2.5\") stacked 4-up on Letter with perforation marks." },
  { id: "t011-bi-fold-restaurant-menu", name: "Bi-Fold Restaurant Menu", industry: "Commercial Print", toolId: "menu", specs: "Standard bi-fold menu on Tabloid. Print both sides, fold in half for 4-panel menu." },
  { id: "t012-business-card-8-up-step-repeat", name: "Business Card 8-Up (Step & Repeat)", industry: "Commercial Print", toolId: "business", specs: "8-up step-and-repeat business cards using Expert Grid. All slots print the same card for maximum thro…", preset: { nup: { cols: 2, rows: 4, sheetWIn: 8.5, sheetHIn: 11, repeatFirst: true, addMarks: true } } },
  { id: "t013-business-cards-with-qr-code", name: "Business Cards with QR Code", industry: "Commercial Print", toolId: "business", specs: "10-up business cards on Letter with a QR code on the back — links to website or vCard.", preset: { nup: { sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t014-business-checks-3-up", name: "Business Checks (3-Up)", industry: "Commercial Print", toolId: "ncrpads", specs: "Standard 3-up business checks on Letter stock. MICR-safe layout with perforation marks.", preset: { nup: { cols: 1, rows: 3, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t015-cd-tray-card-2-up", name: "CD Tray Card 2-Up", industry: "Commercial Print", toolId: "gangsheet", specs: "Standard CD jewel case tray cards (4.75×4.75\") ganged 2-up on Letter.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t016-certificate-2-up", name: "Certificate 2-Up", industry: "Commercial Print", toolId: "flyer", specs: "Award or training certificates 2-up on tabloid for desktop proofing or short-run printing.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t017-compliment-slips-dl-3-up", name: "Compliment Slips (DL 3-Up)", industry: "Commercial Print", toolId: "complimentslip", specs: "DL compliment slips (210×99 mm) ganged 3-up, centered on an oversized SRA4 sheet with crop marks in t…", preset: { nup: { cols: 1, rows: 3, sheetWIn: 8.86, sheetHIn: 12.6, addMarks: true } } },
  { id: "t018-coupon-sheets-10-up", name: "Coupon Sheets (10-Up)", industry: "Commercial Print", toolId: "coupons", specs: "3.5×2\" coupons ganged 10-up on Letter with perforation-ready marks." },
  { id: "t019-eddm-postcard-6-25-9", name: "EDDM Postcard (6.25×9\")", industry: "Commercial Print", toolId: "postcard", specs: "USPS Every Door Direct Mail oversized postcard on 13×19\" stock.", preset: { nup: { cellWIn: 6.25, cellHIn: 9.0, sheetWIn: 13.0, sheetHIn: 19.0, addMarks: true } } },
  { id: "t020-folder-insert-tabloid", name: "Folder Insert (Tabloid)", industry: "Commercial Print", toolId: "presfolder", specs: "Presentation folder insert (9×12\") centered on tabloid with trim marks." },
  { id: "t021-full-bleed-brochure-booklet", name: "Full-Bleed Brochure Booklet", industry: "Commercial Print", toolId: "trifold", specs: "Add 3mm bleed to brochure pages, then impose as saddle-stitch booklet on Tabloid.", preset: { nup: { sheetWIn: 11, sheetHIn: 17, bleedIn: 0.125, addMarks: true } } },
  { id: "t022-full-bleed-postcards-4-up-bleed", name: "Full-Bleed Postcards (4-Up + Bleed)", industry: "Commercial Print", toolId: "postcard", specs: "Add 1/8″ bleed to postcard artwork missing bleeds, then gang 4-up on Letter with crop marks.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, bleedIn: 0.125, addMarks: true } } },
  { id: "t023-gatefold-brochure-4-panel-letter", name: "Gatefold Brochure (4-Panel, Letter)", industry: "Commercial Print", toolId: "zfold", specs: "4-panel gatefold marketing brochure on Letter landscape. Two inner panels fold inward to meet at center.", preset: { nup: { sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  { id: "t024-loyalty-punch-cards-10-up", name: "Loyalty/Punch Cards (10-Up)", industry: "Commercial Print", toolId: "business", specs: "Standard business-card-size loyalty/punch cards, 10-up on Letter with crop marks.", preset: { nup: { cellWIn: 3.5, cellHIn: 2.0, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t025-ncr-form-3-part-carbon", name: "NCR Form (3-Part Carbon)", industry: "Commercial Print", toolId: "ncrpads", specs: "3-part carbonless form on Letter. Each part prints on separate sheet for collating.", preset: { nup: { sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t026-perfect-bound-a5-signatures", name: "Perfect Bound A5 Signatures", industry: "Commercial Print", toolId: "perfectbound", specs: "4-up perfect-bound book signatures for A5 trade paperbacks on A4 landscape.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t027-photo-contact-sheet-8-up", name: "Photo Contact Sheet (8-Up)", industry: "Commercial Print", toolId: "contact", specs: "Photographer's proof sheet with 8 images (2×4) on Letter. Quick client review layout.", preset: { nup: { cols: 2, rows: 4, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t028-postcard-2-up-work-turn", name: "Postcard 2-Up (Work & Turn)", industry: "Commercial Print", toolId: "postcard", specs: "2-up work-and-turn postcard imposition. Front and back print on the same sheet – flip along the short…", preset: { nup: { cols: 1, rows: 2, duplex: true, addMarks: true, duplexFlip: "long" } } },
  { id: "t029-proof-sheet-with-proof-watermark", name: "Proof Sheet with PROOF Watermark", industry: "Commercial Print", toolId: "contact", specs: "2-up proofing layout on Tabloid with a diagonal PROOF watermark — prevents client from using proofs a…", preset: { nup: { sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t030-rsvp-cards-4-up-3-5-5", name: "RSVP Cards (4-Up, 3.5×5\")", industry: "Commercial Print", toolId: "wedding", specs: "Response/RSVP cards (3.5×5\") printed 4-up on Letter with crop marks.", preset: { nup: { cellWIn: 3.5, cellHIn: 5.0, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t031-saddle-stitch-a4-magazine", name: "Saddle-Stitch A4 Magazine", industry: "Commercial Print", toolId: "magazine", specs: "32-page A4 magazine signatures on A3 landscape sheets for commercial offset.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t032-saddle-stitch-a5-booklet", name: "Saddle-Stitch A5 Booklet", industry: "Commercial Print", toolId: "booklet", specs: "Creates print-ready A5 saddle-stitched booklets from A5 source pages on A4 landscape sheets." },
  { id: "t033-shingled-3-up-cut-stack", name: "Shingled 3-Up (Cut & Stack)", industry: "Commercial Print", toolId: "cutstack", specs: "Classic cut-and-stack imposition for sequentially ordered pieces. Cut the stack into 3 strips and the…", preset: { nup: { cols: 1, rows: 3, cutStack: true, addMarks: true } } },
  { id: "t034-square-coasters-4-up", name: "Square Coasters (4-Up)", industry: "Commercial Print", toolId: "coasters", specs: "4\" square drink coasters printed 4-up on Tabloid stock with crop marks for die cutting.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t035-step-and-repeat-flyer", name: "Step-and-Repeat Flyer", industry: "Commercial Print", toolId: "flyer", specs: "Fill a sheet with sequential flyer pages, auto-scaled to fit. Ideal for different-content handouts.", preset: { nup: { repeatFirst: true, addMarks: true } } },
  { id: "t036-tear-off-flyer-with-tabs", name: "Tear-Off Flyer with Tabs", industry: "Commercial Print", toolId: "magazine", specs: "Community bulletin flyer with tear-off contact tabs designed into the bottom of the artwork, placed 1…" },
  { id: "t037-tent-card-2-up", name: "Tent Card 2-Up", industry: "Commercial Print", toolId: "zfold", specs: "Fold-in-half table tent cards (4.25×5.5\" finished), 2-up on Letter for double-sided printing.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, duplex: true, addMarks: true, duplexFlip: "long" } } },
  { id: "t038-tri-fold-brochure-letter", name: "Tri-Fold Brochure (Letter)", industry: "Commercial Print", toolId: "trifold", specs: "Standard tri-fold brochure on Letter stock. 6 panels (3 front, 3 back) with fold marks.", preset: { nup: { sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t039-tri-fold-brochure-2-up", name: "Tri-Fold Brochure 2-Up", industry: "Commercial Print", toolId: "trifold", specs: "Imposes two copies of each finished tri-fold brochure side on tabloid/A3-style duplex sheets.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 11, sheetHIn: 17, duplex: true, addMarks: true, duplexFlip: "long" } } },
  { id: "t040-tri-fold-event-program", name: "Tri-Fold Event Program", industry: "Commercial Print", toolId: "trifold", specs: "Tri-fold event or church program on Letter landscape. 6 panels with fold marks.", preset: { nup: { sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  { id: "t041-wall-calendar-signatures", name: "Wall Calendar Signatures", industry: "Commercial Print", toolId: "perfectbound", specs: "Coil-bound wall calendar with back cover rotation on tabloid landscape.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t042-z-fold-accordion-6-panel-tabloid", name: "Z-Fold Accordion (6-Panel, Tabloid)", industry: "Commercial Print", toolId: "zfold", specs: "6-panel accordion-style brochure on 11×17\" tabloid. Zigzag folds, ~5.67\" per panel (17/3).", preset: { nup: { sheetWIn: 11.0, sheetHIn: 17.0, addMarks: true } } },
  // ── Packaging ──
  { id: "t043-bakery-tray-liner-1-up", name: "Bakery Tray Liner (1-Up)", industry: "Packaging", toolId: "packaging", specs: "Bakery/deli tray liners printed 1-up on Tabloid (two 10.5″ liners cannot stack on a 17″ sheet)." },
  { id: "t044-blister-card-4-up", name: "Blister Card 4-Up", industry: "Packaging", toolId: "packaging", specs: "Retail blister packaging cards (3.5×5\") ganged 4-up on Tabloid with dieline paths." },
  { id: "t045-box-flat-with-bleed-prep", name: "Box Flat with Bleed Prep", industry: "Packaging", toolId: "boxcarton", specs: "Add 5mm bleed to a box dieline flat, then resize to fit press sheet — ready for die-cutting." },
  { id: "t046-cd-dvd-jewel-case-wrap", name: "CD/DVD Jewel Case Wrap", industry: "Packaging", toolId: "packaging", specs: "Optical disc jewel case wrap (9.5×4.72\") on Tabloid with trim marks." },
  { id: "t047-candle-wraps-4-up", name: "Candle Wraps (4-Up)", industry: "Packaging", toolId: "labels", specs: "Candle label wraps (3×8\") printed 4-up on Tabloid for wrapping round candles.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t048-candy-bar-wrappers-3-up", name: "Candy Bar Wrappers (3-Up)", industry: "Packaging", toolId: "packaging", specs: "Candy bar wraps (7.5×5.5\") placed 3-up on a 13×19″ press sheet for wrapping and gluing." },
  { id: "t049-envelope-flats-4-up-10", name: "Envelope Flats 4-Up (#10)", industry: "Packaging", toolId: "envelope", specs: "Standard #10 envelope flats (9.5×4.125\") ganged 4-up on Tabloid with dieline paths.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t050-hang-tags-8-up-2-5-4", name: "Hang Tags 8-Up (2.5×4\")", industry: "Packaging", toolId: "hangtag", specs: "Retail garment hang tags ganged 8-up on Tabloid with die-cut contour paths.", preset: { nup: { cols: 2, rows: 4, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t051-lp-record-sleeve-insert", name: "LP Record Sleeve Insert", industry: "Packaging", toolId: "stickers", specs: "12×12\" vinyl record sleeve insert, 1-up on 13×19\" stock (12″ square cannot fit 2-up on a 13×19″ sheet).", preset: { nup: { sheetWIn: 13.0, sheetHIn: 19.0, addMarks: true } } },
  { id: "t052-pizza-box-lid-13-19", name: "Pizza Box Lid (13×19\")", industry: "Packaging", toolId: "boxcarton", specs: "10×10\" pizza box lid flat, 1-up on 13×19\" stock with trim marks (10″ square cannot fit 2-up)." },
  { id: "t053-poly-bag-headers-6-up", name: "Poly Bag Headers (6-Up)", industry: "Packaging", toolId: "packaging", specs: "Retail poly bag header cards (4×2.5\") printed 6-up on Letter with hang-hole marks." },
  { id: "t054-pouch-flats-2-up-tabloid", name: "Pouch Flats (2-Up Tabloid)", industry: "Packaging", toolId: "packaging", specs: "Stand-up pouch flats (6×9\") printed 2-up on landscape Tabloid for heat-seal pouches." },
  { id: "t055-seed-packets-6-up", name: "Seed Packets (6-Up)", industry: "Packaging", toolId: "envelope", specs: "Small seed packets (3×4.5\") ganged 6-up on Tabloid with crop marks (Letter cannot hold 3 rows of 4.5″…", preset: { nup: { cols: 2, rows: 3, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t056-shopping-bag-flat-2-up", name: "Shopping Bag Flat 2-Up", industry: "Packaging", toolId: "packaging", specs: "Retail shopping bag flats 2-up on Tabloid with fold and die-cut paths." },
  { id: "t057-soap-band-wraps-8-up", name: "Soap Band Wraps (8-Up)", industry: "Packaging", toolId: "packaging", specs: "Narrow soap bands (1.5×6\") ganged 8-up on Tabloid for bar soap wrapping (Letter cannot hold two 6″ ro…" },
  { id: "t058-soap-bar-wrap-4-up", name: "Soap Bar Wrap 4-Up", industry: "Packaging", toolId: "packaging", specs: "Body care product wraps (3×4\") ganged 4-up on Letter." },
  { id: "t059-tube-label-wrap-4-up", name: "Tube Label Wrap (4-Up)", industry: "Packaging", toolId: "labels", specs: "Cosmetic tube label wraps (6×2.5\") printed 4-up on a 13×19″ sheet for roll-on application.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 13.0, sheetHIn: 19.0, addMarks: true } } },
  { id: "t060-wine-bottle-label-6-up", name: "Wine Bottle Label 6-Up", industry: "Packaging", toolId: "labels", specs: "Standard wine bottle labels (3.5×4\") ganged 6-up on Tabloid with trim marks.", preset: { nup: { cols: 2, rows: 3, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  // ── Publishing ──
  { id: "t061-16-page-church-bulletin-a4", name: "16-Page Church Bulletin (A4)", industry: "Publishing", toolId: "magazine", specs: "Saddle-stitched A4 bulletin on A3 landscape. Standard for weekly church programs." },
  { id: "t062-a5-pocket-book", name: "A5 Pocket Book", industry: "Publishing", toolId: "notebook", specs: "A5 (148×210mm) pocket paperback using saddle-stitch binding on A4 landscape." },
  { id: "t063-a5-saddle-stitch-2-up-on-sra3", name: "A5 Saddle-Stitch 2-Up on SRA3", industry: "Publishing", toolId: "booklet", specs: "Commercial A5 saddle-stitch workflow: impose each booklet side on SRA4, then repeat two copies on SRA3." },
  { id: "t064-children-s-book-8-5-square", name: "Children's Book (8.5\" Square)", industry: "Publishing", toolId: "booklet", specs: "Square-format picture book on Tabloid landscape with saddle-stitch binding." },
  { id: "t065-coloring-book-letter", name: "Coloring Book (Letter)", industry: "Publishing", toolId: "zine", specs: "US Letter coloring book with saddle-stitch binding. Single-sided interior (back pages blank)." },
  { id: "t066-concert-program-a5", name: "Concert Program (A5)", industry: "Publishing", toolId: "program", specs: "A5 saddle-stitched concert or theater program. 12-16 pages typical, fits in pocket." },
  { id: "t067-desk-calendar-tent-style", name: "Desk Calendar (Tent Style)", industry: "Publishing", toolId: "calendar", specs: "Desk tent calendar on Letter landscape with half-sheet layout." },
  { id: "t068-digest-magazine-5-5-8-5", name: "Digest Magazine (5.5×8.5\")", industry: "Publishing", toolId: "magazine", specs: "Reader's Digest-size magazine signatures. 4-up saddle-stitch on Tabloid.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t069-hymnal-songbook-a5", name: "Hymnal / Songbook (A5)", industry: "Publishing", toolId: "perfectbound", specs: "A5 hymnal or songbook with perfect binding on A4 stock. For churches and choirs.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t070-instruction-booklet-a6-4-up", name: "Instruction Booklet (A6 4-Up)", industry: "Publishing", toolId: "program", specs: "Small product instruction booklet. 4-up nested on A4 for cost-effective production." },
  { id: "t071-instruction-manual-a5", name: "Instruction Manual (A5)", industry: "Publishing", toolId: "program", specs: "A5 product instruction booklet, saddle-stitched on A4. Compact format for product packaging." },
  { id: "t072-landscape-wall-calendar", name: "Landscape Wall Calendar", industry: "Publishing", toolId: "calendar", specs: "Coil-bound wall calendar with back cover rotation on Tabloid landscape." },
  { id: "t073-lay-flat-photo-book-12-12", name: "Lay-Flat Photo Book (12×12\")", industry: "Publishing", toolId: "perfectbound", specs: "Square photo album with zero creep for lay-flat binding on 24×12\" stock.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t074-manga-rtl-comic-booklet", name: "Manga / RTL Comic Booklet", industry: "Publishing", toolId: "comic", specs: "Right-to-left saddle-stitched booklet for manga, Arabic, and Hebrew comics on B5 landscape.", preset: { booklet: { rtl: true } } },
  { id: "t075-memorial-funeral-program", name: "Memorial / Funeral Program", industry: "Publishing", toolId: "program", specs: "Half-letter memorial program, saddle-stitched on Letter landscape. Single fold, 4-8 pages." },
  { id: "t076-memorial-service-program", name: "Memorial Service Program", industry: "Publishing", toolId: "program", specs: "Half-letter bi-fold memorial program. 4 pages — cover, obituary spread, back." },
  { id: "t077-newsletter-4-page-single-fold", name: "Newsletter 4-Page (Single Fold)", industry: "Publishing", toolId: "gangsheet", specs: "Simple 4-page newsletter — one sheet folded in half on Letter landscape.", preset: { nup: { sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  { id: "t078-one-sheet-8-page-zine", name: "One-Sheet 8-Page Zine", industry: "Publishing", toolId: "zine", specs: "Classic fold-and-cut mini zine from 8 panels on one sheet. Print one-sided, cut the center slit, and…" },
  { id: "t079-perfect-bound-trade-paperback-4-up", name: "Perfect Bound Trade Paperback (4-Up)", industry: "Publishing", toolId: "perfectbound", specs: "4-up signatures for A5 perfect-bound trade paperbacks. Standard for novels, manuals, and catalogs.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t080-photo-book-landscape-a4", name: "Photo Book (Landscape A4)", industry: "Publishing", toolId: "perfectbound", specs: "Landscape A4 photo book with perfect binding. Full-bleed photo spreads.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t081-playbill-theater-program", name: "Playbill / Theater Program", industry: "Publishing", toolId: "program", specs: "A5 saddle-stitched theater program booklet on A4 stock." },
  { id: "t082-pocket-book-a6-from-a5", name: "Pocket Book (A6 from A5)", industry: "Publishing", toolId: "notebook", specs: "Small-format pocket book in A6 with 2-up perfect binding." },
  { id: "t083-pocket-digest-5-8", name: "Pocket Digest (5×8\")", industry: "Publishing", toolId: "perfectbound", specs: "5×8\" digest-size booklet using perfect binding. Common for literary journals and anthologies.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t084-quarter-letter-zine", name: "Quarter-Letter Zine", industry: "Publishing", toolId: "zine", specs: "Micro-zine at 4.25×5.5\" using 4-up saddle-stitch on Letter. Cut, fold, staple." },
  { id: "t085-recipe-book-letter", name: "Recipe Book (Letter)", industry: "Publishing", toolId: "perfectbound", specs: "US Letter recipe book with perfect binding. Ideal for cookbooks and recipe collections.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t086-saddle-stitch-a6-mini-booklet-8-up", name: "Saddle-Stitch A6 Mini Booklet (8-Up)", industry: "Publishing", toolId: "zine", specs: "8-up mini booklet for A6 saddle-stitched inserts and leaflets on A4." },
  { id: "t087-square-catalog-8-8", name: "Square Catalog (8×8\")", industry: "Publishing", toolId: "catalog", specs: "8×8\" square product catalog with saddle-stitch binding. Popular for retail and portfolio." },
  { id: "t088-student-planner-4-up", name: "Student Planner (4-Up)", industry: "Publishing", toolId: "perfectbound", specs: "A6 student planner pages imposed 4-up on A4 for perfect binding. 52+ weeks.", preset: { booklet: { signatureSheets: 4 } } },
  { id: "t089-us-comic-book-6-625-10-25", name: "US Comic Book (6.625×10.25\")", industry: "Publishing", toolId: "comic", specs: "Standard US comic book format on Tabloid with saddle-stitch binding." },
  { id: "t090-wedding-program", name: "Wedding Program", industry: "Publishing", toolId: "wedding", specs: "Half-letter (5.5×8.5\") wedding program booklet, saddle-stitched on Letter landscape.", preset: { nup: { sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  // ── Large Format ──
  { id: "t091-2-up-movie-posters-27-40", name: "2-Up Movie Posters (27×40\")", industry: "Large Format", toolId: "poster", specs: "Standard one-sheet cinema posters ganged 2-up on 54×40\" wide-format stock.", preset: { poster: { tilesAcross: 2, tilesDown: 1 } } },
  { id: "t092-4-up-18-24-posters", name: "4-Up 18×24\" Posters", industry: "Large Format", toolId: "poster", specs: "Four 18×24\" posters ganged on a 36×48\" sheet for screen printing or large-format digital.", preset: { poster: { tilesAcross: 4, tilesDown: 1 } } },
  { id: "t093-a-frame-sign-inserts", name: "A-Frame Sign Inserts", industry: "Large Format", toolId: "rollerbanner", specs: "Sidewalk A-frame sign inserts at 24×36\" with double-sided printing.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 24.0, sheetHIn: 36.0 } } },
  { id: "t094-banner-tiles-4-up-24-36-panels", name: "Banner Tiles 4-Up (24×36\" panels)", industry: "Large Format", toolId: "banner", specs: "Four 24×36\" banner panels on a single 96×36\" wide-format sheet for trade show displays.", preset: { poster: { tilesAcross: 4, tilesDown: 1 } } },
  { id: "t095-bus-shelter-poster-46-67", name: "Bus Shelter Poster (46×67\")", industry: "Large Format", toolId: "rollerbanner", specs: "Standard bus shelter/transit advertising poster at 46×67\" for backlit display.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 46.0, sheetHIn: 67.0 } } },
  { id: "t096-canvas-wrap-print-tiling", name: "Canvas Wrap Print Tiling", industry: "Large Format", toolId: "poster", specs: "Gallery-wrap canvas tiles auto-scaled in a 2×2 grid for large art prints." },
  { id: "t097-fabric-banner-24-72", name: "Fabric Banner (24×72\")", industry: "Large Format", toolId: "rollerbanner", specs: "Vertical fabric banner at 24×72\" for dye-sublimation printing.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 24.0, sheetHIn: 72.0 } } },
  { id: "t098-feather-flag-soft-signage", name: "Feather Flag (Soft Signage)", industry: "Large Format", toolId: "featherflag", specs: "Single-panel feather / teardrop flag artwork scaled to a Medium print area (700×2300 mm) for dye-subl…", preset: { nup: { cols: 1, rows: 1, addMarks: false } } },
  { id: "t099-floor-graphics-24-24", name: "Floor Graphics (24×24\")", industry: "Large Format", toolId: "stickers", specs: "Square floor decals at 24×24\" for retail wayfinding and promotional graphics.", preset: { nup: { cellWIn: 24.0, cellHIn: 24.0, addMarks: true } } },
  { id: "t100-menu-board-tabloid", name: "Menu Board (Tabloid)", industry: "Large Format", toolId: "menu", specs: "Restaurant menu board at 11×17\" Tabloid with color bar for print verification." },
  { id: "t101-real-estate-signs-24-36", name: "Real Estate Signs (24×36\")", industry: "Large Format", toolId: "rollerbanner", specs: "Large real estate signs at 24×36\" for property listings and open house signage.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 24.0, sheetHIn: 36.0 } } },
  { id: "t102-retractable-banner-33-80", name: "Retractable Banner (33×80\")", industry: "Large Format", toolId: "rollerbanner", specs: "Standard retractable/roll-up banner at 33×80\" for trade shows and events.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 33.0, sheetHIn: 80.0 } } },
  { id: "t103-step-and-repeat-photo-print", name: "Step-and-Repeat Photo Print", industry: "Large Format", toolId: "photo", specs: "Fill a sheet with identical photos. Perfect for passport photos, photo booth strips, and proofing.", preset: { nup: { repeatFirst: true, addMarks: true } } },
  { id: "t104-street-pole-banner-24-60", name: "Street Pole Banner (24×60\")", industry: "Large Format", toolId: "rollerbanner", specs: "Standard street/light pole banner at 24×60\" with bleed for pole pocket.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 24.0, sheetHIn: 60.0 } } },
  { id: "t105-table-runner-30-72", name: "Table Runner (30×72\")", industry: "Large Format", toolId: "rollerbanner", specs: "Conference table runner at 30×72\" for 6ft tables. Resized for large-format output.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 30.0, sheetHIn: 72.0 } } },
  { id: "t106-tiled-poster-a4-tiles-to-a0", name: "Tiled Poster (A4 tiles to A0)", industry: "Large Format", toolId: "poster", specs: "Tiles a large poster across multiple sheets. Each source page fills one cell in an 4×2 grid." },
  { id: "t107-trade-show-display-graphics", name: "Trade Show Display Graphics", industry: "Large Format", toolId: "poster", specs: "Exhibition pop-up display panels on 48×96\" wide-format with color bar for proofing." },
  { id: "t108-window-clings-a3", name: "Window Clings (A3)", industry: "Large Format", toolId: "rollerbanner", specs: "A3 (297×420mm) window cling graphics for storefront and vehicle windows.", preset: { nup: { cols: 1, rows: 1, addMarks: false } } },
  { id: "t109-yard-sign-24-18", name: "Yard Sign (24×18\")", industry: "Large Format", toolId: "rollerbanner", specs: "Standard coroplast yard sign at 24×18\" landscape for real estate, political, and event signage.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 24.0, sheetHIn: 18.0 } } },
  { id: "t110-yard-signs-18-24", name: "Yard Signs (18×24\")", industry: "Large Format", toolId: "rollerbanner", specs: "Corrugated yard signs at 18×24\" for real estate, political campaigns, and event signage.", preset: { nup: { cols: 1, rows: 1, addMarks: false, sheetWIn: 18.0, sheetHIn: 24.0 } } },
  // ── Office ──
  { id: "t111-2-sided-a5-flyer", name: "2-Sided A5 Flyer", industry: "Office", toolId: "flyer", specs: "Quick double-sided A5 flyer from your desktop printer. No marks, no bleeds — just fold or cut.", preset: { nup: { sheetWIn: 5.83, sheetHIn: 8.27, duplex: true, bleedIn: 0.125, addMarks: false, duplexFlip: "long" } } },
  { id: "t112-2-up-proofing-on-tabloid", name: "2-Up Proofing on Tabloid", industry: "Office", toolId: "overlay", specs: "Proof Letter-size artwork 2-up on Tabloid with crop marks to verify bleed and trim." },
  { id: "t113-4-up-index-cards-3-5", name: "4-Up Index Cards (3×5\")", industry: "Office", toolId: "trading", specs: "Study flashcards or index cards, 4-up on Letter for cutting.", preset: { nup: { cellWIn: 3.0, cellHIn: 5.0, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t114-add-page-numbers", name: "Add Page Numbers", industry: "Office", toolId: "pagenumbers", specs: "Adds \"Page X of Y\" to every page. Simple and universal — works with any PDF." },
  { id: "t115-binder-spine-labels-10-up", name: "Binder Spine Labels (10-Up)", industry: "Office", toolId: "labels", specs: "1\" binder spine labels printed 10-up on Letter. Standard 3-ring binder spine width.", preset: { nup: { cols: 2, rows: 5, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t116-bookmarks-6-up", name: "Bookmarks (6-Up)", industry: "Office", toolId: "bookmark", specs: "Standard bookmarks (2×6\") printed 6-up on Letter stock.", preset: { nup: { cols: 2, rows: 3, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t117-certificates-2-up", name: "Certificates (2-Up)", industry: "Office", toolId: "flyer", specs: "Half-letter classroom certificates printed 2-up on Letter for quick teacher printing.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t118-confidential-watermark", name: "Confidential Watermark", industry: "Office", toolId: "overlay", specs: "Red CONFIDENTIAL watermark for sensitive documents — visible but non-destructive." },
  { id: "t119-desk-name-plates-4-up", name: "Desk Name Plates (4-Up)", industry: "Office", toolId: "zfold", specs: "Folding desk name plates (8×2\" flat) printed 4-up on Letter.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t120-door-signs-2-up", name: "Door Signs (2-Up)", industry: "Office", toolId: "zfold", specs: "Do Not Disturb / office door signs (4×10\") printed 2-up on Letter.", preset: { nup: { cellWIn: 4.0, cellHIn: 10.0, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t121-draft-watermark", name: "Draft Watermark", industry: "Office", toolId: "overlay", specs: "Stamp a diagonal DRAFT watermark on every page — prevents accidental use of unfinished documents." },
  { id: "t122-emergency-contact-cards-10-up", name: "Emergency Contact Cards (10-Up)", industry: "Office", toolId: "business", specs: "Wallet-size emergency contact cards (3.5×2\") printed 10-up on Letter.", preset: { nup: { cols: 2, rows: 5, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t123-flash-cards-12-up", name: "Flash Cards (12-Up)", industry: "Office", toolId: "trading", specs: "Study flash cards (3.5×2\") printed 12-up on Letter. Perfect for students and educators.", preset: { nup: { cols: 3, rows: 4, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t124-full-bleed-photo-cards-4-6", name: "Full-Bleed Photo Cards (4×6)", industry: "Office", toolId: "wedding", specs: "Add bleed to borderless photo cards, then print 2-up on Letter — perfect for holiday cards or invitat…", preset: { nup: { cellWIn: 4.0, cellHIn: 6.0, sheetWIn: 8.5, sheetHIn: 11, bleedIn: 0.125, addMarks: true } } },
  { id: "t125-greeting-card-a5-fold", name: "Greeting Card (A5 Fold)", industry: "Office", toolId: "greeting", specs: "Single-fold greeting card on Letter landscape. Print, fold in half, done." },
  { id: "t126-half-sheet-handout-2-up", name: "Half-Sheet Handout 2-Up", industry: "Office", toolId: "flyer", specs: "Two half-letter handouts per sheet. Perfect for meeting agendas, sign-up sheets, and flyers.", preset: { nup: { cols: 1, rows: 2, sheetWIn: 5.5, sheetHIn: 8.5, addMarks: true } } },
  { id: "t127-interleave-two-documents", name: "Interleave Two Documents", industry: "Office", toolId: "shuffle", specs: "Merges pages from two PDFs in alternating order (A1, B1, A2, B2...). Great for double-sided printing…" },
  { id: "t128-luggage-tags-6-up", name: "Luggage Tags (6-Up)", industry: "Office", toolId: "hangtag", specs: "Luggage tags (2.5×4.25\") printed 6-up on Letter with crop marks for die cutting.", preset: { nup: { cols: 2, rows: 3, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t129-mailing-labels-avery-5160-style", name: "Mailing Labels (Avery 5160 Style)", industry: "Office", toolId: "labels", specs: "Address labels nested on Letter. Compatible with Avery 5160 and similar 30-up label sheets.", preset: { nup: { sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t130-mini-booklet-a7-zine", name: "Mini Booklet (A7 Zine)", industry: "Office", toolId: "zine", specs: "DIY mini zine using 4-up saddle-stitch on A4. Cut, fold, staple — instant pocket booklet." },
  { id: "t131-name-badges-8-up", name: "Name Badges (8-Up)", industry: "Office", toolId: "namebadge", specs: "Conference name badges (3.5×2.25\") printed 8-up on Letter for badge holders." },
  { id: "t132-parking-permits-4-up", name: "Parking Permits (4-Up)", industry: "Office", toolId: "hangtag", specs: "Parking permits / hang tags (3.5×5\") printed 4-up on Letter stock.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t133-place-cards-8-up", name: "Place Cards (8-Up)", industry: "Office", toolId: "wedding", specs: "Event place cards (3.5×2\") printed 8-up on Letter. Fold in half for tent-style seating cards.", preset: { nup: { cols: 2, rows: 4, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t134-proof-booklet-with-watermark", name: "Proof Booklet with Watermark", industry: "Office", toolId: "booklet", specs: "Saddle-stitch booklet on Letter with a PROOF watermark — for client review copies." },
  { id: "t135-raffle-tickets-8-up", name: "Raffle Tickets (8-Up)", industry: "Office", toolId: "raffle", specs: "Numbered raffle tickets (2×5.5\") printed 8-up on Letter with perforation marks." },
  { id: "t136-recipe-cards-4-6-4-up", name: "Recipe Cards (4×6\", 4-Up)", industry: "Office", toolId: "postcard", specs: "Standard recipe cards (4×6\") printed 4-up on Tabloid. Double-sided for ingredients + instructions.", preset: { nup: { cellWIn: 4.0, cellHIn: 6.0, sheetWIn: 11, sheetHIn: 17, duplex: true, addMarks: true, duplexFlip: "long" } } },
  { id: "t137-rotate-all-pages-landscape", name: "Rotate All Pages Landscape", industry: "Office", toolId: "rotate", specs: "Rotates all pages 90° clockwise. Useful for converting portrait scans to landscape." },
  { id: "t138-shipping-labels-6-up", name: "Shipping Labels (6-Up)", industry: "Office", toolId: "labels", specs: "Shipping/mailing labels (4×3.33\") printed 6-up on Letter. Fits standard label sheets.", preset: { nup: { cols: 2, rows: 3, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t139-tent-cards-4-up", name: "Tent Cards (4-Up)", industry: "Office", toolId: "zfold", specs: "Table tent cards (5×5\" flat, folds to 5×2.5\") printed 4-up on Letter.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t140-visitor-passes-10-up", name: "Visitor Passes (10-Up)", industry: "Office", toolId: "business", specs: "Business-card-size visitor passes (3.5×2\") printed 10-up on Letter stock.", preset: { nup: { cols: 2, rows: 5, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  // ── Variable Data ──
  { id: "t141-asset-tags-datamatrix", name: "Asset Tags (DataMatrix)", industry: "Variable Data", toolId: "namebadge", specs: "Compact DataMatrix asset tags, 10-up on Letter for inventory tracking." },
  { id: "t142-conference-badges-qr", name: "Conference Badges (QR)", industry: "Variable Data", toolId: "namebadge", specs: "Name badges with unique QR codes from CSV, 4-up on A4." },
  { id: "t143-event-tickets-qr-code", name: "Event Tickets (QR Code)", industry: "Variable Data", toolId: "tickets", specs: "QR code tickets from CSV data, 2-up on Letter sheets for easy cutting." },
  { id: "t144-gift-vouchers-qr-code", name: "Gift Vouchers (QR Code)", industry: "Variable Data", toolId: "coupons", specs: "Gift vouchers with unique QR redemption codes, 2-up on A4." },
  { id: "t145-loyalty-cards-code-128", name: "Loyalty Cards (Code 128)", industry: "Variable Data", toolId: "coupons", specs: "Loyalty/membership cards with unique Code 128 barcodes, 10-up on Letter." },
  { id: "t146-parking-permits-qr-code", name: "Parking Permits (QR Code)", industry: "Variable Data", toolId: "hangtag", specs: "Parking permits with unique QR validation codes, 4-up on Letter.", preset: { nup: { sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t147-product-labels-ean-13", name: "Product Labels (EAN-13)", industry: "Variable Data", toolId: "tickets", specs: "EAN-13 retail barcodes from CSV, 12-up on A4 for product labelling." },
  { id: "t148-raffle-tickets-numbered", name: "Raffle Tickets (Numbered)", industry: "Variable Data", toolId: "raffle", specs: "Code 128 barcode raffle tickets from CSV, 4-up on Letter." },
  { id: "t149-shipping-labels-code-128", name: "Shipping Labels (Code 128)", industry: "Variable Data", toolId: "tickets", specs: "Shipping labels with unique Code 128 barcodes, 10-up on Letter." },
  { id: "t150-wristbands-qr-code", name: "Wristbands (QR Code)", industry: "Variable Data", toolId: "coupons", specs: "Event wristbands with unique QR codes, 8-up on Letter." },
  // ── Real Estate ──
  { id: "t151-just-listed-flyer-2-up-8-5-5-5", name: "Just-Listed Flyer 2-Up (8.5×5.5\")", industry: "Real Estate", toolId: "flyer", specs: "Half-sheet landscape just-listed flyers, 2-up on Letter for feature sheets and open-house handouts.", preset: { nup: { cols: 2, rows: 1, sheetWIn: 11, sheetHIn: 8.5, addMarks: true } } },
  { id: "t152-just-listed-flyer-4-up-4-25-5-5", name: "Just-Listed Flyer 4-Up (4.25×5.5\")", industry: "Real Estate", toolId: "flyer", specs: "Quarter-sheet just-listed flyers, 4-up on Letter — the cheapest way to print open-house handouts.", preset: { nup: { cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, addMarks: true } } },
  { id: "t153-just-sold-postcard-4-up-4-6", name: "Just-Sold Postcard 4-Up (4×6\")", industry: "Real Estate", toolId: "postcard", specs: "USPS-standard 4×6\" just-sold / farming postcards, 4-up on Tabloid for short-run direct mail.", preset: { nup: { cellWIn: 4.0, cellHIn: 6.0, sheetWIn: 11, sheetHIn: 17, addMarks: true } } },
  { id: "t154-open-house-yard-sign-2-up-18-24", name: "Open-House Yard Sign 2-Up (18×24\")", industry: "Real Estate", toolId: "rollerbanner", specs: "Two 18×24\" open-house / for-sale yard signs ganged on a 36×24\" large-format sheet.", preset: { nup: { cols: 2, rows: 1, sheetWIn: 36.0, sheetHIn: 24.0, addMarks: false } } },
  { id: "t155-property-brochure-tri-fold-2-up", name: "Property Brochure Tri-Fold 2-Up", industry: "Real Estate", toolId: "trifold", specs: "Imposes two copies of each finished property brochure side on tabloid duplex sheets with tri-fold cre…", preset: { nup: { cols: 1, rows: 2, sheetWIn: 11, sheetHIn: 17, duplex: true, addMarks: true, duplexFlip: "long" } } },
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
    <div style={{ padding: '.7rem 1rem', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: 8, fontSize: '.82rem', color: 'var(--ink)', lineHeight: 1.5 }}>
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

function FileDrop({ onFile, multiple = false, label = 'Drop a PDF here, or click to select', accept = 'application/pdf,.pdf', sublabel = 'PDF only — processed locally, never uploaded', match }: {
  onFile: (files: File[]) => void; multiple?: boolean; label?: string; accept?: string; sublabel?: string; match?: (f: File) => boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
  const handle = useCallback((files: FileList | null) => {
    if (!files) return;
    const ok = Array.from(files).filter(match ?? isPdf);
    if (ok.length) onFile(ok);
  }, [onFile, match]);
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
        background: 'var(--bg-alt)', transition: 'all .15s',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
      <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.25rem' }}>{sublabel}</div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
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

// Shared "extra marks" controls — center marks + line weight. Appears wherever
// crop/trim marks are enabled, driven by the engine's MarkStyle.
function MarkExtras<T extends { addMarks: boolean; centerMarks?: boolean; markWeightPt?: number }>(
  { opts, onChange }: { opts: T; onChange: (o: T) => void },
) {
  if (!opts.addMarks) return null;
  return (
    <>
      <Field label="Center marks" note="Ticks at each edge midpoint">
        <Row>
          <input type="checkbox" checked={!!opts.centerMarks} onChange={e => onChange({ ...opts, centerMarks: e.target.checked })} />
          <span style={{ fontSize: '.85rem' }}>Add center marks</span>
        </Row>
      </Field>
      <Field label="Mark weight (pt)" note="Stroke thickness">
        <input type="number" min={0.25} max={3} step={0.25} value={opts.markWeightPt ?? 0.5} onChange={e => onChange({ ...opts, markWeightPt: +e.target.value })} style={iStyle} />
      </Field>
    </>
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
      <Field label="Binding / signatures" note="How the book is gathered">
        <select value={opts.signatureSheets && opts.signatureSheets > 0 ? String(opts.signatureSheets) : '0'} onChange={e => set('signatureSheets', +e.target.value)} style={iStyle}>
          <option value="0">Single saddle-stitch</option>
          <option value="1">Perfect-bound — 4-pg signatures</option>
          <option value="2">Perfect-bound — 8-pg signatures</option>
          <option value="4">Perfect-bound — 16-pg signatures</option>
          <option value="8">Perfect-bound — 32-pg signatures</option>
        </select>
      </Field>
      <Field label="Crop marks">
        <Row>
          <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} />
          <span style={{ fontSize: '.85rem' }}>Add crop marks</span>
        </Row>
      </Field>
      <MarkExtras opts={opts} onChange={onChange} />
    </Grid>
  );
}

const DEFAULT_NUPBOOK: NUpBookOptions = {
  nUp: 4, sheetWIn: 11, sheetHIn: 17, marginIn: 0.25, gutterIn: 0, creepIn: 0,
  rtl: false, signatureSheets: 0, addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
};

function NUpBookSettings({ opts, onChange }: { opts: NUpBookOptions; onChange: (o: NUpBookOptions) => void }) {
  const set = <K extends keyof NUpBookOptions>(k: K, v: NUpBookOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="N-up (fold scheme)" note="Pages per sheet side">
        <select value={opts.nUp} onChange={e => set('nUp', +e.target.value)} style={iStyle}>
          <option value={2}>2-up — folio (1 fold)</option>
          <option value={4}>4-up — quarto (2 folds)</option>
        </select>
      </Field>
      <SheetPicker opts={opts} set={set} />
      <Field label="Binding">
        <select value={opts.signatureSheets > 0 ? String(opts.signatureSheets) : '0'} onChange={e => set('signatureSheets', +e.target.value)} style={iStyle}>
          <option value="0">Nested (saddle-stitch)</option>
          <option value="1">Perfect-bound — 1-sheet signatures</option>
          <option value="2">Perfect-bound — 2-sheet signatures</option>
          <option value="4">Perfect-bound — 4-sheet signatures</option>
        </select>
      </Field>
      <Field label="Reading direction">
        <select value={opts.rtl ? 'rtl' : 'ltr'} onChange={e => set('rtl', e.target.value === 'rtl')} style={iStyle}>
          <option value="ltr">Left-to-right</option>
          <option value="rtl">Right-to-left (manga)</option>
        </select>
      </Field>
      <Field label="Margin (in)"><input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Binding gutter (in)"><input type="number" min={0} max={0.5} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} /></Field>
      {opts.nUp <= 2 && (
        <Field label="Creep (in)" note="Only for 2-up nested"><input type="number" min={0} max={0.5} step={0.0625} value={opts.creepIn} onChange={e => set('creepIn', +e.target.value)} style={iStyle} /></Field>
      )}
      <Field label="Crop marks">
        <Row><input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Add crop marks</span></Row>
      </Field>
      <MarkExtras opts={opts} onChange={onChange} />
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        2-up folds one sheet in half (saddle/perfect). 4-up quarto folds an 8-page signature onto a 2×2 grid per side (top row rotates 180° so it reads correctly after folding + trimming).
      </div>
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
      <Field label="Fill pattern" note="Z = all rows L→R; S = snake">
        <select value={opts.snake ? 's' : 'z'} onChange={e => set('snake', e.target.value === 's')} style={iStyle}>
          <option value="z">Z-pattern</option>
          <option value="s">S-pattern (snake)</option>
        </select>
      </Field>
      <Field label="Direction">
        <Row><input type="checkbox" checked={!!opts.rtl} onChange={e => set('rtl', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Right-to-left columns</span></Row>
      </Field>
      <Field label="Sides" note="Duplex reads source as front,back,front,back…">
        <select value={opts.duplex ? (opts.duplexFlip === 'short' ? 'short' : 'long') : 'single'} onChange={e => onChange({ ...opts, duplex: e.target.value !== 'single', duplexFlip: e.target.value === 'short' ? 'short' : 'long' })} style={iStyle}>
          <option value="single">Single-sided</option>
          <option value="long">Double-sided — long-edge flip</option>
          <option value="short">Double-sided — short-edge flip</option>
        </select>
      </Field>
      {cardMode && (
        <Field label="Bleed (in)" note="Art fills cell; marks drawn at trim">
          <input type="number" min={0} max={0.5} step={0.0625} value={opts.bleedIn ?? 0} onChange={e => set('bleedIn', +e.target.value)} style={iStyle} />
        </Field>
      )}
      <Field label="Crop marks">
        <Row>
          <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} />
          <span style={{ fontSize: '.85rem' }}>Add crop marks</span>
        </Row>
      </Field>
      <MarkExtras opts={opts} onChange={onChange} />
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

// ── Live imposition canvas (pdfpress-style preview) ───────────────────────────

const CELL_COLORS = ['#e5484d', '#22c55e', '#3b82f6', '#f5d90a', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#64748b', '#14b8a6', '#a855f7', '#ef4444'];
const MM_PER_IN = 25.4;
function fmtDim(inch: number, unit: 'in' | 'mm' | 'pt'): string {
  return unit === 'mm' ? (inch * MM_PER_IN).toFixed(1) : unit === 'pt' ? String(Math.round(inch * 72)) : inch.toFixed(2);
}

// A single numbered/coloured cell.
function Cell({ x, y, w, h, n, blank }: { x: number; y: number; w: number; h: number; n: number; blank: boolean }) {
  const fs = Math.min(w, h) * 0.42;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={blank ? '#ffffff' : CELL_COLORS[(n - 1) % CELL_COLORS.length]} stroke={blank ? '#e2e8f0' : 'none'} strokeWidth={blank ? 0.01 : 0} />
      {!blank && <text x={x + w / 2} y={y + h / 2} fontSize={fs} fontWeight={800} fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui, sans-serif">{n}</text>}
    </g>
  );
}

// Corner crop-mark ticks (+ optional center marks) around a cell, in inches.
function CellMarks({ x, y, w, h, off, len, center }: { x: number; y: number; w: number; h: number; off: number; len: number; center?: boolean }) {
  const L: [number, number, number, number][] = [
    [x - off - len, y, x - off, y], [x, y - off - len, x, y - off],
    [x + w + off, y, x + w + off + len, y], [x + w, y - off - len, x + w, y - off],
    [x - off - len, y + h, x - off, y + h], [x, y + h + off, x, y + h + off + len],
    [x + w + off, y + h, x + w + off + len, y + h], [x + w, y + h + off, x + w, y + h + off + len],
  ];
  if (center) {
    const cx = x + w / 2, cy = y + h / 2;
    L.push([cx, y - off - len, cx, y - off], [cx, y + h + off, cx, y + h + off + len], [x - off - len, cy, x - off, cy], [x + w + off, cy, x + w + off + len, cy]);
  }
  return <>{L.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth={0.01} />)}</>;
}

// The imposition preview for a given engine + settings + current output sheet.
function ImpositionCanvas({
  engine, nupOpts, bookletOpts, nupBookOpts, posterOpts, ticketOpts, pageCount, unit, sheetLabel, sheetIndex, onSheetCount, zoom,
}: {
  engine: ToolEngine; nupOpts: NUpOptions; bookletOpts: BookletOptions; nupBookOpts: NUpBookOptions; posterOpts: PosterOptions; ticketOpts: TicketOptions;
  pageCount: number; unit: 'in' | 'mm' | 'pt'; sheetLabel: string; sheetIndex: number; onSheetCount: (n: number) => void; zoom: number;
}) {
  // Build the geometry for the CURRENT output sheet.
  let shW = 8.5, shH = 11, cells: { x: number; y: number; w: number; h: number; n: number; blank: boolean }[] = [];
  let marks: { x: number; y: number; w: number; h: number }[] = [];
  let sheetCount = 1, addMarks = false, centerMarks = false, off = 0.06, len = 0.12, bleed = 0;

  if (engine === 'nup' || engine === 'tickets' || engine === 'datamerge') {
    const o = nupOpts;
    shW = o.sheetWIn; shH = o.sheetHIn;
    const g = computeNUpGrid(o);
    const perSheet = g.cols * g.rows;
    const duplex = !!o.duplex;
    const total = engine === 'tickets' ? ticketOpts.count : duplex ? Math.ceil(pageCount / 2) : pageCount;
    const frontSheets = o.repeatFirst ? 1 : Math.max(1, Math.ceil(total / perSheet));
    sheetCount = duplex ? frontSheets * 2 : frontSheets;
    addMarks = !!o.addMarks; centerMarks = !!o.centerMarks; off = o.markOffIn; len = o.markLenIn; bleed = o.bleedIn ?? 0;
    const si = Math.min(sheetIndex, sheetCount - 1);
    const isBack = duplex && si % 2 === 1;
    const fsi = duplex ? Math.floor(si / 2) : si;
    const lg = g.leftGapPt / 72, tg = g.topGapPt / 72, cw = g.cellWPt / 72, ch = g.cellHPt / 72, gx = g.gxPt / 72, gy = g.gyPt / 72;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const cellIdx = r * g.cols + c;
      const itemIdx = o.repeatFirst ? 0 : o.cutStack ? cellIdx * frontSheets + fsi : fsi * perSheet + cellIdx;
      let n: number, blank = false;
      if (engine === 'tickets') { n = itemIdx < total ? ticketOpts.startNumber + itemIdx : 0; blank = itemIdx >= total; }
      else { const pg = duplex ? itemIdx * 2 + (isBack ? 1 : 0) + 1 : itemIdx + 1; n = pg; blank = pg > pageCount; }
      let cc = c; if (isBack) cc = (o.duplexFlip === 'short') ? c : g.cols - 1 - c;
      const x = lg + cc * (cw + gx), y = tg + r * (ch + gy);
      cells.push({ x, y, w: cw, h: ch, n: n || 1, blank });
      if (addMarks) marks.push({ x: x + bleed, y: y + bleed, w: cw - 2 * bleed, h: ch - 2 * bleed });
    }
  } else if (engine === 'booklet') {
    const o = bookletOpts;
    // A booklet output sheet-side is a 2-up spread. Show the current spread.
    const N = Math.max(1, pageCount);
    const sig = o.signatureSheets && o.signatureSheets > 0 ? o.signatureSheets * 4 : Math.ceil(N / 4) * 4;
    const sigs = Math.ceil(N / sig);
    sheetCount = sigs * (sig / 4) * 2; // 2 sides per sheet
    const si = Math.min(sheetIndex, sheetCount - 1);
    const sidesPerSig = (sig / 4) * 2;
    const sigNo = Math.floor(si / sidesPerSig), sideInSig = si % sidesPerSig;
    const sheetNo = Math.floor(sideInSig / 2), isBack = sideInSig % 2 === 1;
    let aL: number, aR: number;
    if (!o.rtl) { if (!isBack) { aL = sig - sheetNo * 2; aR = sheetNo * 2 + 1; } else { aL = sheetNo * 2 + 2; aR = sig - sheetNo * 2 - 1; } }
    else { if (!isBack) { aL = sheetNo * 2 + 1; aR = sig - sheetNo * 2; } else { aL = sig - sheetNo * 2 - 1; aR = sheetNo * 2 + 2; } }
    const start = sigNo * sig;
    const pw = pageCount ? 1 : 1;
    // spread = 2 pages side by side; each page uses source page aspect (assume 3:4-ish -> use square-ish)
    shW = 2 * 4.25 + 0.25; shH = 6.5;
    addMarks = !!o.addMarks; centerMarks = !!o.centerMarks; off = o.markOffIn; len = o.markLenIn;
    const cw = 4.25, ch = 6.0, m = 0.25, gut = o.gutterIn;
    void pw;
    const pairs: [number, number][] = [[start + aL, m], [start + aR, m + cw + gut]];
    for (const [gp, x] of pairs) {
      const blank = gp > pageCount || gp < 1;
      cells.push({ x, y: 0.25, w: cw, h: ch, n: gp, blank });
      if (addMarks) marks.push({ x, y: 0.25, w: cw, h: ch });
    }
  } else if (engine === 'nupbook') {
    const o = nupBookOpts;
    if (o.nUp <= 2) {
      // Folio spread (same as booklet preview).
      const N = Math.max(1, pageCount), sig = o.signatureSheets > 0 ? o.signatureSheets * 4 : Math.ceil(N / 4) * 4;
      sheetCount = Math.ceil(N / sig) * (sig / 4) * 2;
      const si = Math.min(sheetIndex, sheetCount - 1), sheetNo = Math.floor((si % ((sig / 4) * 2)) / 2), isBack = si % 2 === 1;
      let aL: number, aR: number;
      if (!isBack) { aL = sig - sheetNo * 2; aR = sheetNo * 2 + 1; } else { aL = sheetNo * 2 + 2; aR = sig - sheetNo * 2 - 1; }
      shW = 2 * 4.25 + 0.25; shH = 6.5;
      for (const [gp, x] of [[aL, 0.25], [aR, 4.5]] as [number, number][]) cells.push({ x, y: 0.25, w: 4.25, h: 6, n: gp, blank: gp > pageCount });
    } else {
      // Quarto (4-up) — 2×2 per side, top row reads rotated 180°.
      shW = o.sheetWIn; shH = o.sheetHIn;
      const sigPages = 8, numSigs = Math.ceil(Math.max(1, pageCount) / sigPages);
      sheetCount = numSigs * 2;
      const si = Math.min(sheetIndex, sheetCount - 1), sigNo = Math.floor(si / 2), isBack = si % 2 === 1;
      const m = o.marginIn, g = o.gutterIn, cw = (shW - 2 * m - g) / 2, chh = (shH - 2 * m - g) / 2;
      addMarks = !!o.addMarks; centerMarks = !!o.centerMarks; off = o.markOffIn; len = o.markLenIn;
      const FRONT: [number, number, number][] = [[5, 0, 0], [4, 0, 1], [8, 1, 0], [1, 1, 1]];
      const BACK: [number, number, number][] = [[3, 0, 0], [6, 0, 1], [2, 1, 0], [7, 1, 1]];
      for (const [p, r, c] of (isBack ? BACK : FRONT)) {
        const gp = sigNo * sigPages + p, cc = o.rtl ? 1 - c : c;
        const x = m + cc * (cw + g), y = m + r * (chh + g);
        cells.push({ x, y, w: cw, h: chh, n: gp, blank: gp > pageCount });
        if (addMarks) marks.push({ x, y, w: cw, h: chh });
      }
    }
  } else if (engine === 'poster') {
    const o = posterOpts;
    shW = o.sheetWIn; shH = o.sheetHIn;
    sheetCount = o.tilesAcross * o.tilesDown;
    const si = Math.min(sheetIndex, sheetCount - 1);
    cells.push({ x: 0.15, y: 0.15, w: shW - 0.3, h: shH - 0.3, n: si + 1, blank: false });
  } else {
    // Generic single-page representation for transform/marks tools.
    shW = 5; shH = 6.5; sheetCount = Math.max(1, pageCount || 1);
    cells.push({ x: 0.2, y: 0.2, w: shW - 0.4, h: shH - 0.4, n: Math.min(sheetIndex + 1, sheetCount), blank: false });
  }

  useEffect(() => { onSheetCount(sheetCount); }, [sheetCount, onSheetCount]);

  // Fit into a sensible pixel box; zoom scales it.
  const pad = 0.35;
  const vbW = shW + pad * 2, vbH = shH + pad * 2;
  const basePx = 460 * zoom;
  const aspect = vbW / vbH;
  const pxW = aspect >= 1 ? basePx : basePx * aspect;
  const pxH = aspect >= 1 ? basePx / aspect : basePx;

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas-bg)', borderRadius: 12, overflow: 'auto', minHeight: 420 }}>
      <svg width={pxW} height={pxH} viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`} style={{ display: 'block', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.28))' }}>
        <rect x={0} y={0} width={shW} height={shH} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.012} />
        {cells.map((c, i) => <Cell key={i} {...c} />)}
        {marks.map((m, i) => <CellMarks key={i} {...m} off={off} len={len} center={centerMarks} />)}
      </svg>
      <SheetStepper index={sheetIndex} count={sheetCount} label={sheetLabel} wIn={shW} hIn={shH} unit={unit} />
    </div>
  );
}

function SheetStepper({ index, count, label, wIn, hIn, unit }: { index: number; count: number; label: string; wIn: number; hIn: number; unit: 'in' | 'mm' | 'pt' }) {
  return (
    <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.35rem .6rem', borderRadius: 999, background: 'rgba(17,17,24,0.86)', color: '#e5e7eb', fontSize: '.72rem', fontWeight: 600, boxShadow: '0 4px 14px rgba(0,0,0,.3)' }}>
      <span style={{ opacity: .8 }}>SHEET {index + 1}</span>
      <span style={{ padding: '.05rem .4rem', borderRadius: 4, background: 'rgba(255,255,255,.12)', letterSpacing: '.04em' }}>{count} total</span>
      <span style={{ opacity: .55 }}>·</span>
      <span style={{ color: VIOLET }}>◱</span>
      <span>{fmtDim(wIn, unit)} × {fmtDim(hIn, unit)} <span style={{ opacity: .6 }}>{unit}</span></span>
      <span style={{ opacity: .5, marginLeft: '.15rem', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
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
      <MarkExtras opts={opts} onChange={onChange} />
    </Grid>
  );
}

// ── Crop-marks settings ───────────────────────────────────────────────────────

const DEFAULT_CROP: CropMarksOptions = { bleedIn: 0.125, marginIn: 0.5, markLenIn: 0.25, markOffIn: 0.125 };

function CropSettings({ opts, onChange }: { opts: CropMarksOptions; onChange: (o: CropMarksOptions) => void }) {
  const set = <K extends keyof CropMarksOptions>(k: K, v: CropMarksOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Existing bleed (in)" note="Bleed already in the file"><input type="number" min={0} max={0.5} step={0.0625} value={opts.bleedIn} onChange={e => set('bleedIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Added margin (in)" note="Blank area added for marks"><input type="number" min={0.25} max={1.5} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark length (in)"><input type="number" min={0.1} max={0.5} step={0.0625} value={opts.markLenIn} onChange={e => set('markLenIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark offset (in)" note="Gap between trim and mark"><input type="number" min={0.05} max={0.25} step={0.0625} value={opts.markOffIn} onChange={e => set('markOffIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Cut type" note="Colour / line style">
        <select value={opts.cutType ?? 'thru'} onChange={e => set('cutType', e.target.value as CropMarksOptions['cutType'])} style={iStyle}>
          <option value="thru">Thru-cut (black)</option>
          <option value="kiss">Kiss-cut (magenta)</option>
          <option value="crease">Crease (blue dashed)</option>
          <option value="perf">Perf (red dashed)</option>
        </select>
      </Field>
      <Field label="Overshoot (in)" note="Extend marks past the corner"><input type="number" min={0} max={0.25} step={0.01} value={opts.overshootIn ?? 0} onChange={e => set('overshootIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Knockout"><Row><input type="checkbox" checked={!!opts.knockout} onChange={e => set('knockout', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>White halo (dark stock)</span></Row></Field>
      <Field label="Key mark"><Row><input type="checkbox" checked={!!opts.keyMark} onChange={e => set('keyMark', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Orientation key</span></Row></Field>
      <MarkExtras opts={{ ...opts, addMarks: true }} onChange={o => onChange({ ...opts, centerMarks: o.centerMarks, markWeightPt: o.markWeightPt })} />
    </Grid>
  );
}

// ── Color-bar settings ────────────────────────────────────────────────────────

const DEFAULT_COLORBAR: ColorBarOptions = { edge: 'bottom', heightIn: 0.25, shape: 'rect', spot: false, pages: 'all' };

function ColorBarSettings({ opts, onChange }: { opts: ColorBarOptions; onChange: (o: ColorBarOptions) => void }) {
  const set = <K extends keyof ColorBarOptions>(k: K, v: ColorBarOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Edge">
        <select value={opts.edge} onChange={e => set('edge', e.target.value as ColorBarOptions['edge'])} style={iStyle}>
          <option value="bottom">Bottom</option><option value="top">Top</option><option value="left">Left</option><option value="right">Right</option>
        </select>
      </Field>
      <Field label="Bar size (in)"><input type="number" min={0.1} max={1} step={0.0625} value={opts.heightIn} onChange={e => set('heightIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Patch shape">
        <select value={opts.shape ?? 'rect'} onChange={e => set('shape', e.target.value as ColorBarOptions['shape'])} style={iStyle}>
          <option value="rect">Rectangle</option><option value="square">Square</option><option value="circle">Circle</option>
        </select>
      </Field>
      <Field label="Spot patches"><Row><input type="checkbox" checked={!!opts.spot} onChange={e => set('spot', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Add spot / registration patches</span></Row></Field>
      <Field label="Pages" note="all · 1-5 · odd · last"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
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
      <MarkExtras opts={opts} onChange={onChange} />
    </Grid>
  );
}

// ── Rotate / Flip / Shuffle / Split / Crop-box settings ──────────────────────

function RotateSettings({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  return (
    <Grid>
      <Field label="Quick rotate">
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {([90, 180, 270] as const).map(a => (
            <button key={a} className={`btn${angle === a ? '' : ' secondary'}`} onClick={() => onChange(a)} style={{ flex: 1 }}>{a}°</button>
          ))}
        </div>
      </Field>
      <Field label="Custom angle (deg)" note="Non-90° grows the page box to fit">
        <input type="number" min={-360} max={360} step={1} value={angle} onChange={e => onChange(+e.target.value)} style={iStyle} />
      </Field>
    </Grid>
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
  const chip: React.CSSProperties = { padding: '.28rem .6rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--ink)', cursor: 'pointer', fontSize: '.76rem', fontWeight: 600 };
  const quick: [string, string][] = [['Reverse all', 'reverse'], ['Odd only', 'odd'], ['Even only', 'even'], ['Interleave', '[odd,even]'], ['All', 'all']];
  return (
    <div>
      <Field label="Page order" note={`This PDF has ${count} page${count !== 1 ? 's' : ''}.`}>
        <input type="text" value={order} onChange={e => onChange(e.target.value)} placeholder="e.g. 1, 2>, B, 5-3" style={iStyle} />
      </Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.55rem' }}>
        <span style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase', alignSelf: 'center' }}>Quick:</span>
        {quick.map(([label, expr]) => <button key={label} style={chip} onClick={() => onChange(expr)}>{label}</button>)}
      </div>
      <div style={{ marginTop: '.7rem', fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--ink)' }}>Expression syntax</strong><br />
        <code>3,1,2</code> reorder · <code>all</code> · <code>odd</code> · <code>even</code> · <code>first</code> · <code>last</code><br />
        <code>1-5</code> range · <code>5-1</code> / <code>reverse</code> / <code>last-1</code> descending<br />
        <code>4&gt;</code> 90°cw · <code>3&lt;</code> 90°ccw · <code>2^</code> 180° · <code>B</code>/<code>X</code>/<code>_</code> blank<br />
        <code>5*(1)</code> repeat · <code>[odd,even]</code> interleave · <code>group 3: 3 2 1</code> per-group
      </div>
    </div>
  );
}

function SplitSettings({ ranges, onChange, count, mode, onMode, chunk, onChunk, zip, onZip }: {
  ranges: string; onChange: (s: string) => void; count: number;
  mode: 'ranges' | 'chunk'; onMode: (m: 'ranges' | 'chunk') => void; chunk: number; onChunk: (n: number) => void; zip: boolean; onZip: (b: boolean) => void;
}) {
  const files = mode === 'chunk' ? Math.max(1, Math.ceil(count / Math.max(1, chunk))) : ranges.split(',').filter(s => s.trim()).length;
  return (
    <Grid>
      <Field label="Split mode">
        <select value={mode} onChange={e => onMode(e.target.value as 'ranges' | 'chunk')} style={iStyle}>
          <option value="ranges">By ranges</option>
          <option value="chunk">Fixed chunk size</option>
        </select>
      </Field>
      {mode === 'ranges'
        ? <Field label="Ranges" note={`${count} pages — each comma range = one file`}><input type="text" value={ranges} onChange={e => onChange(e.target.value)} placeholder="e.g. 1-3, 4-6, 7" style={iStyle} /></Field>
        : <Field label="Pages per file" note={`${count} pages → ${files} file${files !== 1 ? 's' : ''}`}><input type="number" min={1} max={Math.max(1, count)} step={1} value={chunk} onChange={e => onChunk(+e.target.value)} style={iStyle} /></Field>}
      <Field label="Output">
        <Row><input type="checkbox" checked={zip} onChange={e => onZip(e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Download as one .zip archive</span></Row>
      </Field>
    </Grid>
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

// ── Resize settings ───────────────────────────────────────────────────────────

const DEFAULT_RESIZE: ResizeOptions = { mode: 'scale', scalePct: 100, targetWIn: 8.5, targetHIn: 11 };

function ResizeSettings({ opts, onChange }: { opts: ResizeOptions; onChange: (o: ResizeOptions) => void }) {
  const set = <K extends keyof ResizeOptions>(k: K, v: ResizeOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Resize mode">
        <select value={opts.mode} onChange={e => set('mode', e.target.value as ResizeOptions['mode'])} style={iStyle}>
          <option value="scale">Scale by percentage</option>
          <option value="fit">Fit to paper (keep aspect)</option>
          <option value="stretch">Stretch to paper (fill)</option>
        </select>
      </Field>
      {opts.mode === 'scale' ? (
        <Field label="Scale (%)" note="100 = unchanged">
          <input type="number" min={1} max={800} step={1} value={opts.scalePct} onChange={e => set('scalePct', +e.target.value)} style={iStyle} />
        </Field>
      ) : (
        <>
          <SheetPicker opts={{ sheetWIn: opts.targetWIn, sheetHIn: opts.targetHIn }} set={(k, v) => set(k === 'sheetWIn' ? 'targetWIn' : 'targetHIn', v)} />
          <Field label="Target width (in)"><input type="number" min={0.5} max={60} step={0.0625} value={opts.targetWIn} onChange={e => set('targetWIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Target height (in)"><input type="number" min={0.5} max={60} step={0.0625} value={opts.targetHIn} onChange={e => set('targetHIn', +e.target.value)} style={iStyle} /></Field>
        </>
      )}
    </Grid>
  );
}

// ── Registration / Insert / Nudge / Backdrop / QR settings ────────────────────

const DEFAULT_REGMARK: RegMarkOptions = { marginIn: 0.25, sizeIn: 0.18, style: 'target' };
const DEFAULT_INSERT: InsertOptions = { mode: 'at', position: 1, everyN: 1, count: 1 };
const DEFAULT_NUDGE: NudgeOptions = { dxIn: 0, dyIn: 0, rotateDeg: 0 };
const DEFAULT_BACKDROP: BackdropOptions = { r: 1, g: 1, b: 1 };
const DEFAULT_QRSTAMP: QrStampOptions = { text: 'https://', sizePt: 72, position: 'br', marginPt: 18 };
const DEFAULT_COLLATING: CollatingOptions = {
  edge: 'left', startOffsetPt: 18, markWpt: 6, markHpt: 6, smallMarks: false,
  pagesPerSig: 16, sigsPerSet: 12, stepPt: 8,
  color: { r: 0, g: 0, b: 0 }, color2: { r: 0, g: 0.6, b: 0.9 }, opacity: 1, pages: 'all',
};
const DEFAULT_OMR: OmrOptions = {
  edge: 'bottom', encoding: 'binary', program: 1, bitCount: 8, repeats: 1,
  widthPt: 14.17, heightPt: 2.83, spacingPt: 14.17, startOffsetPt: 40, edgeOffsetPt: 8.5,
  sync: true, color: { r: 0, g: 0, b: 0 }, opacity: 1, pages: 'all',
};
const DEFAULT_GATHERING: GatheringOptions = {
  edge: 'top', startOffsetPt: 18, edgeOffsetPt: 8, markWpt: 6, markHpt: 6,
  pagesPerSection: 16, sectionsPerSet: 12, stepPt: 8,
  color: { r: 0, g: 0, b: 0 }, color2: { r: 0, g: 0.6, b: 0.9 }, opacity: 1, pages: 'all',
};
const DEFAULT_FOLDMARKS: FoldMarksOptions = {
  scheme: 'letter', orientation: 'vertical', panels: 4, positions: '33,66',
  edge: 'both', markLenPt: 18, offsetPt: 0, style: 'dashed', weightPt: 0.75, fullLine: false,
  color: { r: 0, g: 0, b: 0 }, pages: 'all',
};
const DEFAULT_LAYMARKS: LayMarksOptions = {
  markType: 'arrow', edges: 'both', gripperEdge: 'bottom', sideGuideSide: 'left',
  sizePt: 14.17, thicknessPt: 0.5, offsetPt: 14.17, color: { r: 0, g: 0, b: 0 }, pages: 'all',
};
const DEFAULT_CUTCONTOUR: CutContourOptions = {
  shape: 'rectangle', target: 'trim', spotName: 'CutContour', thicknessPt: 0.25,
  dashed: false, dashLenPt: 6, dashGapPt: 3, cornerRadiusPt: 8.5, xOffsetPt: 0, yOffsetPt: 0,
  previewColor: { r: 0.925, g: 0, b: 0.55 }, pages: 'all',
};
const DEFAULT_WHITEVARNISH: WhiteVarnishOptions = {
  spotName: 'White', coverage: 'flood', tint: 1, under: true, xOffsetPt: 0, yOffsetPt: 0,
  previewColor: { r: 0.85, g: 0.86, b: 0.92 }, pages: 'all',
};
const DEFAULT_BRAILLE: BrailleOptions = {
  text: 'hello', xPt: 72, dotDiaPt: 4.25, dotPitchPt: 7.09, cellSpacePt: 17, lineSpacePt: 28.35,
  previewColor: { r: 0.55, g: 0.55, b: 0.6 }, pages: 'all',
};
const DEFAULT_BARCODE: BarcodeStampOptions = {
  text: 'Hello World', symbology: 'qr', scale: 3, quietZone: 4, barHeightMm: 15,
  position: 'br', marginPt: 18, xOffsetPt: 0, yOffsetPt: 0, rotationDeg: 0,
  barColor: { r: 0, g: 0, b: 0 }, bgColor: { r: 1, g: 1, b: 1 }, transparent: false, showText: true, pages: 'all',
};
const DEFAULT_BACKDROPFILE: BackdropFileOptions = {
  offsetXPt: 0, offsetYPt: 0, scalePct: 100, opacity: 100, repeat: true, pages: 'all',
};
const DEFAULT_COLOREFFECTS: ColorEffectsOptions = {
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0, warmTone: 0, invert: 0, hueRotate: 0, dpi: 300, pages: 'all',
};
const DEFAULT_REPAIR: RepairOptions = {
  reserialize: true, stripMetadata: false, removeAnnotations: false, removeJavaScript: true, pages: 'all',
};
const DEFAULT_COLORMANAGE: ColorManageOptions = {
  sourceProfile: 'sRGB', destProfile: '', intent: 'perceptual', dpi: 300, gamutWarning: false, pages: 'all',
};
const DEFAULT_CUSTOMGRID: { cols: number; rows: number; sheetWIn: number; sheetHIn: number; gutterIn: number; marginIn: number; addMarks: boolean; assign: string } = {
  cols: 2, rows: 2, sheetWIn: 8.5, sheetHIn: 11, gutterIn: 0, marginIn: 0.25, addMarks: false, assign: 'sequential',
};
const DEFAULT_PDFTOOLS: { operation: 'optimize' | 'linearize' | 'encrypt' | 'decrypt' | 'repair'; objectStreams: boolean; removeUnused: boolean } = {
  operation: 'optimize', objectStreams: true, removeUnused: true,
};
const DEFAULT_JDF: JdfOptions = {
  jobName: 'Untitled Job', productType: 'Brochure', quantity: 500,
  widthPt: 612, heightPt: 792, pages: 1, sides: 'TwoSidedFlipY',
  mediaWidthPt: 936, mediaHeightPt: 1368, mediaType: 'Paper', binding: 'None',
};

const hexToRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1]!, 16) / 255, g: parseInt(m[2]!, 16) / 255, b: parseInt(m[3]!, 16) / 255 } : { r: 1, g: 1, b: 1 };
};
const rgbToHex = (c: BackdropOptions) => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

function RegistrationSettings({ opts, onChange }: { opts: RegMarkOptions; onChange: (o: RegMarkOptions) => void }) {
  const set = <K extends keyof RegMarkOptions>(k: K, v: RegMarkOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Mark style">
        <select value={opts.style} onChange={e => set('style', e.target.value as RegMarkOptions['style'])} style={iStyle}>
          <option value="target">Target (bullseye + crosshair)</option>
          <option value="crosshair">Crosshair only</option>
        </select>
      </Field>
      <Field label="Distance from edge (in)"><input type="number" min={0.1} max={1} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark size (in)"><input type="number" min={0.08} max={0.5} step={0.01} value={opts.sizeIn} onChange={e => set('sizeIn', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function InsertSettings({ opts, onChange }: { opts: InsertOptions; onChange: (o: InsertOptions) => void }) {
  const set = <K extends keyof InsertOptions>(k: K, v: InsertOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Where">
        <select value={opts.mode} onChange={e => set('mode', e.target.value as InsertOptions['mode'])} style={iStyle}>
          <option value="at">Before a specific page</option>
          <option value="everyN">After every N pages</option>
        </select>
      </Field>
      {opts.mode === 'at'
        ? <Field label="Before page #"><input type="number" min={1} step={1} value={opts.position} onChange={e => set('position', +e.target.value)} style={iStyle} /></Field>
        : <Field label="Every N pages"><input type="number" min={1} step={1} value={opts.everyN} onChange={e => set('everyN', +e.target.value)} style={iStyle} /></Field>}
      <Field label="Blank pages to insert"><input type="number" min={1} max={20} step={1} value={opts.count} onChange={e => set('count', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function NudgeSettings({ opts, onChange }: { opts: NudgeOptions; onChange: (o: NudgeOptions) => void }) {
  const set = <K extends keyof NudgeOptions>(k: K, v: NudgeOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Shift right (in)" note="Negative = left"><input type="number" min={-2} max={2} step={0.01} value={opts.dxIn} onChange={e => set('dxIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Shift up (in)" note="Negative = down"><input type="number" min={-2} max={2} step={0.01} value={opts.dyIn} onChange={e => set('dyIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Rotate (deg)" note="About page centre"><input type="number" min={-15} max={15} step={0.1} value={opts.rotateDeg} onChange={e => set('rotateDeg', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages" note="all · 1-5 · odd · last"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function BackdropSettings({ opts, onChange }: { opts: BackdropOptions; onChange: (o: BackdropOptions) => void }) {
  return (
    <Grid>
      <Field label="Backdrop colour" note="Painted behind every page">
        <input type="color" value={rgbToHex(opts)} onChange={e => onChange(hexToRgb(e.target.value))} style={{ ...iStyle, height: 38, padding: 2 }} />
      </Field>
    </Grid>
  );
}

function QrStampSettings({ opts, onChange }: { opts: QrStampOptions; onChange: (o: QrStampOptions) => void }) {
  const set = <K extends keyof QrStampOptions>(k: K, v: QrStampOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Symbology">
        <select value={opts.symbology ?? 'qr'} onChange={e => set('symbology', e.target.value as QrStampOptions['symbology'])} style={iStyle}>
          <option value="qr">QR code</option>
          <option value="code128">Code 128</option>
          <option value="ean13">EAN-13</option>
        </select>
      </Field>
      <Field label={(opts.symbology ?? 'qr') === 'ean13' ? 'Digits (12–13)' : 'Encoded text / URL'}>
        <input type="text" value={opts.text} onChange={e => set('text', e.target.value)} placeholder={(opts.symbology ?? 'qr') === 'ean13' ? '5901234123457' : 'https://example.com'} style={iStyle} />
      </Field>
      <Field label="Position">
        <select value={opts.position} onChange={e => set('position', e.target.value as QrStampOptions['position'])} style={iStyle}>
          <option value="br">Bottom right</option><option value="bl">Bottom left</option>
          <option value="tr">Top right</option><option value="tl">Top left</option><option value="center">Center</option>
        </select>
      </Field>
      <Field label="Size (pt)"><input type="number" min={24} max={288} step={4} value={opts.sizePt} onChange={e => set('sizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge margin (pt)"><input type="number" min={0} max={96} step={2} value={opts.marginPt} onChange={e => set('marginPt', +e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

// ── Distortion Compensation settings ──────────────────────────────────────────

interface DistortUi { mode: 'cylinder' | 'custom'; cylinderDiaMm: number; plateThickMm: number; customPct: number; direction: 'circ' | 'cross' | 'both'; }
const DEFAULT_DISTORT: DistortUi = { mode: 'cylinder', cylinderDiaMm: 150, plateThickMm: 1.7, customPct: 97.5, direction: 'circ' };
function distortFactor(ui: DistortUi): number {
  return ui.mode === 'custom' ? ui.customPct : distortFactorFromCylinder(ui.cylinderDiaMm, ui.plateThickMm);
}

function DistortSettings({ opts, onChange }: { opts: DistortUi; onChange: (o: DistortUi) => void }) {
  const set = <K extends keyof DistortUi>(k: K, v: DistortUi[K]) => onChange({ ...opts, [k]: v });
  const pct = distortFactor(opts);
  return (
    <Grid>
      <Field label="Calculation mode">
        <select value={opts.mode} onChange={e => set('mode', e.target.value as DistortUi['mode'])} style={iStyle}>
          <option value="cylinder">From cylinder geometry</option>
          <option value="custom">Known factor (%)</option>
        </select>
      </Field>
      {opts.mode === 'cylinder' ? (
        <>
          <Field label="Cylinder diameter (mm)"><input type="number" min={10} max={800} step={1} value={opts.cylinderDiaMm} onChange={e => set('cylinderDiaMm', +e.target.value)} style={iStyle} /></Field>
          <Field label="Plate thickness (mm)" note="Common: 1.14 / 1.70 / 2.84"><input type="number" min={0.1} max={5} step={0.01} value={opts.plateThickMm} onChange={e => set('plateThickMm', +e.target.value)} style={iStyle} /></Field>
        </>
      ) : (
        <Field label="Distortion factor (%)" note="Below 100 shrinks"><input type="number" min={80} max={100} step={0.1} value={opts.customPct} onChange={e => set('customPct', +e.target.value)} style={iStyle} /></Field>
      )}
      <Field label="Direction">
        <select value={opts.direction} onChange={e => set('direction', e.target.value as DistortUi['direction'])} style={iStyle}>
          <option value="circ">Circumferential (height)</option>
          <option value="cross">Cross-web (width)</option>
          <option value="both">Both axes</option>
        </select>
      </Field>
      <div style={{ gridColumn: '1 / -1', padding: '.5rem .75rem', borderRadius: 8, background: 'var(--accent-soft)', fontSize: '.82rem', color: VIOLET, fontWeight: 700 }}>
        Compensation factor: {pct.toFixed(3)}% <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(artwork pre-shrunk to this on the {opts.direction === 'cross' ? 'width' : opts.direction === 'both' ? 'both axes' : 'height'})</span>
      </div>
    </Grid>
  );
}

// ── Nesting settings ──────────────────────────────────────────────────────────

const DEFAULT_NEST: NestOptions = { sheetWIn: 8.5, sheetHIn: 11, roll: false, paddingIn: 0.08, marginIn: 0.25, allowRotate: true, copies: 20, fillSheet: true, trueShape: false, dpi: 36 };

function NestSettings({ opts, onChange }: { opts: NestOptions; onChange: (o: NestOptions) => void }) {
  const set = <K extends keyof NestOptions>(k: K, v: NestOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Media">
        <select value={opts.roll ? 'roll' : 'sheet'} onChange={e => set('roll', e.target.value === 'roll')} style={iStyle}>
          <option value="sheet">Stacked sheets</option>
          <option value="roll">Roll (variable length)</option>
        </select>
      </Field>
      <SheetPicker opts={opts} set={set} />
      <Field label="Quantity">
        <select value={opts.fillSheet ? 'fill' : 'copies'} onChange={e => set('fillSheet', e.target.value === 'fill')} style={iStyle}>
          <option value="fill">Fill the sheet</option>
          <option value="copies">Copy count</option>
        </select>
      </Field>
      {!opts.fillSheet && <Field label="Copies (per design)"><input type="number" min={1} max={2000} step={1} value={opts.copies} onChange={e => set('copies', +e.target.value)} style={iStyle} /></Field>}
      <Field label="Item padding (in)"><input type="number" min={0} max={0.5} step={0.01} value={opts.paddingIn} onChange={e => set('paddingIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Sheet margin (in)"><input type="number" min={0} max={1} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Rotation"><Row><input type="checkbox" checked={opts.allowRotate} onChange={e => set('allowRotate', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Allow 90° rotation</span></Row></Field>
      <Field label="Nesting"><Row><input type="checkbox" checked={!!opts.trueShape} onChange={e => set('trueShape', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>True-shape (pack into negative space)</span></Row></Field>
      {opts.trueShape && <Field label="Detail (DPI)" note="Higher = tighter but slower"><input type="number" min={12} max={150} step={6} value={opts.dpi ?? 36} onChange={e => set('dpi', +e.target.value)} style={iStyle} /></Field>}
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Packs each source page (different sizes = different stickers) as tightly as it can. <strong>True-shape</strong> rasterises the artwork outline and nests items into each other's negative space (best for irregular die-cut shapes); leave it off for fast rectangular bin-packing.
      </div>
    </Grid>
  );
}

// ── Calendar settings ─────────────────────────────────────────────────────────

const DEFAULT_CALENDAR: CalendarOptions = { halfSheet: false, rotateBack: true, addMarks: false, markLenIn: 0.2, markOffIn: 0.1 };

function CalendarSettings({ opts, onChange }: { opts: CalendarOptions; onChange: (o: CalendarOptions) => void }) {
  const set = <K extends keyof CalendarOptions>(k: K, v: CalendarOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Page layout">
        <select value={opts.halfSheet ? 'half' : 'full'} onChange={e => set('halfSheet', e.target.value === 'half')} style={iStyle}>
          <option value="full">Full sheet (one page per side)</option>
          <option value="half">Half sheet (image + grid, fold)</option>
        </select>
      </Field>
      <Field label="Back cover"><Row><input type="checkbox" checked={opts.rotateBack} onChange={e => set('rotateBack', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Rotate back 180° (top-bound hanging)</span></Row></Field>
      <Field label="Crop marks"><Row><input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Add crop marks</span></Row></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Pairs consecutive pages for wall/desk calendars. Full-sheet prints one page per side and rotates the back so it hangs the right way up; half-sheet stacks image + month grid on one sheet to fold. Source is typically 13 pages (cover + 12 months).
      </div>
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
      <Field label="Blend mode" note="Multiply drops white areas">
        <select value={opts.blend ?? 'normal'} onChange={e => set('blend', e.target.value as OverlayOptions['blend'])} style={iStyle}>
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
        </select>
      </Field>
      <Field label={`Opacity: ${Math.round(opts.opacity * 100)}%`}>
        <input type="range" min={5} max={100} step={5} value={opts.opacity * 100} onChange={e => set('opacity', +e.target.value / 100)} style={{ width: '100%', marginTop: '.5rem' }} />
      </Field>
      {opts.mode === 'center' && (
        <>
          <Field label="Anchor (9-point)">
            <select value={opts.anchor ?? 'mc'} onChange={e => set('anchor', e.target.value as OverlayOptions['anchor'])} style={iStyle}>
              <option value="tl">Top left</option><option value="tc">Top center</option><option value="tr">Top right</option>
              <option value="ml">Middle left</option><option value="mc">Center</option><option value="mr">Middle right</option>
              <option value="bl">Bottom left</option><option value="bc">Bottom center</option><option value="br">Bottom right</option>
            </select>
          </Field>
          <Field label="Padding (pt)"><input type="number" min={0} max={144} step={2} value={opts.paddingPt ?? 0} onChange={e => set('paddingPt', +e.target.value)} style={iStyle} /></Field>
        </>
      )}
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

// Dieline generator tool — needs no source file; draws a box net from dims.
function DielineTool({ tool }: { tool: ToolDef }) {
  const [opts, setOpts] = useState<DielineOptions>({
    kind: tool.dielineKind ?? 'ste', widthIn: 3, heightIn: 5, depthIn: 1.5, glueIn: 0.5, marginIn: 0.5,
  });
  const [status, setStatus] = useState<Status>('idle');
  const set = (k: keyof DielineOptions, v: number) => setOpts(o => ({ ...o, [k]: v }));
  const gen = async () => {
    setStatus('processing');
    try {
      downloadPdf(await makeDieline(opts), `${tool.id}-dieline.pdf`);
      setStatus('done'); setTimeout(() => setStatus('idle'), 3000);
    } catch { setStatus('error'); }
  };
  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <NoteBanner text={opts.kind === 'folder'
        ? 'Generates a presentation-folder dieline: back + front panels, fold-up pockets and glue tabs.'
        : 'Generates a folding-carton dieline: front / side / back / side panels with tuck flaps, dust flaps and a glue seam.'} />
      <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
        <h4 style={{ margin: '0 0 .75rem' }}>Box dimensions (inches)</h4>
        <Grid>
          <Field label="Width (front)"><input type="number" min={0.5} max={40} step={0.125} value={opts.widthIn} onChange={e => set('widthIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Height"><input type="number" min={0.5} max={40} step={0.125} value={opts.heightIn} onChange={e => set('heightIn', +e.target.value)} style={iStyle} /></Field>
          <Field label={opts.kind === 'folder' ? 'Spine / tab depth' : 'Depth (side)'}><input type="number" min={0.25} max={20} step={0.125} value={opts.depthIn} onChange={e => set('depthIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Glue flap"><input type="number" min={0.25} max={2} step={0.0625} value={opts.glueIn} onChange={e => set('glueIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Sheet margin"><input type="number" min={0.1} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
        </Grid>
        <div style={{ marginTop: '.75rem', fontSize: '.78rem', color: 'var(--muted)' }}>
          Solid red = cut / trim · dashed blue = fold / crease. Print at 100%, cut the solid lines, score the dashed, fold and glue.
        </div>
      </div>
      <div>
        <button className="btn" onClick={gen} disabled={status === 'processing'} style={{ fontSize: '1rem', padding: '.65rem 1.5rem' }}>
          {status === 'processing' ? 'Generating…' : status === 'done' ? '✓ Downloaded' : 'Generate dieline & download'}
        </button>
      </div>
      {status === 'error' && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>Could not generate the dieline.</div>}
    </div>
  );
}

const SAMPLE_CSV = `Name,Company,Code
Ada Lovelace,Analytical Ltd,VIP-0001
Grace Hopper,US Navy,VIP-0002
Alan Turing,Bletchley Park,VIP-0003
Katherine Johnson,NASA,VIP-0004`;

// CSV data-merge tool — no template PDF; each row becomes an imposed cell.
function DataMergeTool({ tool }: { tool: ToolDef }) {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [opts, setOpts] = useState<DataMergeOptions>({
    cols: tool.defaultNup?.cols ?? 2, rows: tool.defaultNup?.rows ?? 4,
    sheetWIn: tool.defaultNup?.sheetWIn ?? 8.5, sheetHIn: tool.defaultNup?.sheetHIn ?? 11,
    marginIn: 0.35, gutterIn: 0.15, fontSizePt: 11, showBorder: true,
    autoNumber: true, startNumber: 1, numberPrefix: 'No. ', numberPad: 4,
    addMarks: true, markLenIn: 0.2, markOffIn: 0.1, qrColumn: '', qrSizePt: 70,
  });
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState('');
  const set = <K extends keyof DataMergeOptions>(k: K, v: DataMergeOptions[K]) => setOpts(o => ({ ...o, [k]: v }));
  const recordCount = Math.max(0, csv.trim().split('\n').filter(l => l.trim()).length - 1);
  const headers = useMemo(() => (csv.split('\n')[0] ?? '').split(',').map(h => h.trim()).filter(Boolean), [csv]);
  const loadCsv = useCallback((files: File[]) => { const f = files[0]; if (f) f.text().then(setCsv); }, []);

  const gen = async () => {
    setStatus('processing'); setErrMsg('');
    try {
      const res = await imposeDataMerge(csv, opts);
      downloadPdf(res.pdf, `${tool.id}-merge.pdf`);
      setInfo(`${res.records} records · ${res.columns.join(' · ')}`);
      setStatus('done'); setTimeout(() => setStatus('idle'), 4000);
    } catch (e) { setStatus('error'); setErrMsg(e instanceof Error ? e.message : 'Merge failed'); }
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <NoteBanner text="Paste or drop a CSV — the first row is the header; each following row becomes one imposed cell (first column bold). Add a running number and/or a scannable QR from any column. Everything stays in your browser." />
      <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
        <h4 style={{ margin: '0 0 .5rem' }}>CSV data <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.8rem' }}>· {recordCount} record{recordCount !== 1 ? 's' : ''}</span></h4>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={7}
          style={{ ...iStyle, fontFamily: 'ui-monospace, monospace', fontSize: '.82rem', resize: 'vertical' }} />
        <div style={{ marginTop: '.5rem' }}>
          <FileDrop onFile={loadCsv} label="…or drop a .csv file"
            accept=".csv,text/csv,text/plain" sublabel="CSV only — processed locally, never uploaded"
            match={f => /\.csv$/i.test(f.name) || f.type.includes('csv') || f.type === 'text/plain'} />
        </div>
      </div>
      <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
        <h4 style={{ margin: '0 0 .75rem' }}>Layout</h4>
        <Grid>
          <SheetPicker opts={opts} set={set} />
          <Field label="Columns"><input type="number" min={1} max={10} step={1} value={opts.cols} onChange={e => set('cols', +e.target.value)} style={iStyle} /></Field>
          <Field label="Rows"><input type="number" min={1} max={20} step={1} value={opts.rows} onChange={e => set('rows', +e.target.value)} style={iStyle} /></Field>
          <Field label="Margin (in)"><input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Gutter (in)"><input type="number" min={0} max={1} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} /></Field>
          <Field label="Font size (pt)"><input type="number" min={6} max={24} step={1} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
          <Field label="Number prefix"><input type="text" value={opts.numberPrefix} onChange={e => set('numberPrefix', e.target.value)} style={iStyle} /></Field>
          <Field label="Barcode from column" note="Encodes each row's value">
            <select value={opts.qrColumn} onChange={e => set('qrColumn', e.target.value)} style={iStyle}>
              <option value="">— none —</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
          {opts.qrColumn && <Field label="Symbology">
            <select value={opts.symbology ?? 'qr'} onChange={e => set('symbology', e.target.value as DataMergeOptions['symbology'])} style={iStyle}>
              <option value="qr">QR code</option><option value="code128">Code 128</option><option value="ean13">EAN-13</option>
            </select>
          </Field>}
          {opts.qrColumn && <Field label="Barcode size (pt)"><input type="number" min={28} max={200} step={2} value={opts.qrSizePt} onChange={e => set('qrSizePt', +e.target.value)} style={iStyle} /></Field>}
          <Field label="Options">
            <Row>
              <input type="checkbox" checked={opts.autoNumber} onChange={e => set('autoNumber', e.target.checked)} /><span style={{ fontSize: '.82rem' }}>Number</span>
              <input type="checkbox" checked={opts.showBorder} onChange={e => set('showBorder', e.target.checked)} /><span style={{ fontSize: '.82rem' }}>Border</span>
              <input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.82rem' }}>Marks</span>
            </Row>
          </Field>
        </Grid>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button className="btn" onClick={gen} disabled={status === 'processing' || recordCount < 1} style={{ fontSize: '1rem', padding: '.65rem 1.5rem' }}>
          {status === 'processing' ? 'Merging…' : status === 'done' ? '✓ Downloaded' : `Merge ${recordCount} record${recordCount !== 1 ? 's' : ''} & download`}
        </button>
        {status === 'done' && info && <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>{info}</span>}
      </div>
      {status === 'error' && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{errMsg}</div>}
    </div>
  );
}

// Persistent left tool rail — the four pdfpress groups, searchable, with the
// tool thumbnails as icons. Switching does not lose the loaded file.
type RailGroup = 'Layout' | 'Transform' | 'Enhance' | 'Advanced';
const GROUP_OF: Record<string, RailGroup> = {
  'Imposition & layout': 'Layout', 'Booklets & books': 'Layout', 'Cards & labels': 'Layout', 'Folding': 'Layout',
  'Page & PDF tools': 'Transform',
  'Marks & prepress': 'Enhance', 'Tickets & data': 'Enhance',
  'Large & specialty': 'Advanced',
};
const RAIL_ORDER: RailGroup[] = ['Layout', 'Transform', 'Enhance', 'Advanced'];

function ToolRail({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const m = new Map<RailGroup, ToolDef[]>();
    for (const t of TOOLS) {
      if (ql && !t.name.toLowerCase().includes(ql) && !t.tags.some(tag => tag.toLowerCase().includes(ql))) continue;
      const g = GROUP_OF[t.category] ?? 'Layout';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(t);
    }
    return RAIL_ORDER.filter(g => m.has(g)).map(g => [g, m.get(g)!] as const);
  }, [q]);

  return (
    <nav style={{ width: 232, flexShrink: 0, position: 'sticky', top: '1rem', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.9rem', padding: '.85rem .75rem', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tools…" style={{ ...iStyle, padding: '.4rem .6rem', fontSize: '.82rem' }} />
      {groups.map(([g, tools]) => (
        <div key={g}>
          <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '.09em', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 .35rem .25rem' }}>{g}</div>
          <div style={{ display: 'grid', gap: 2 }}>
            {tools.map(t => {
              const active = t.id === activeId;
              return (
                <button key={t.id} onClick={() => onSelect(t.id)} title={t.desc} style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.32rem .45rem', borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%',
                  border: '1px solid ' + (active ? VIOLET : 'transparent'), background: active ? 'var(--accent-soft)' : 'transparent', color: active ? VIOLET : 'var(--ink)',
                  fontSize: '.8rem', fontWeight: active ? 700 : 500,
                }}>
                  <span style={{ width: 22, height: 17, flexShrink: 0, borderRadius: 3, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><t.Thumb /></span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ToolWorkspace({ tool, preset, file, onFile, onSelectTool, onBack }: { tool: ToolDef; preset?: TemplatePreset; file: LoadedFile | null; onFile: (f: LoadedFile | null) => void; onSelectTool: (id: string) => void; onBack: () => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');

  // A preset that specifies an explicit column count means "grid mode" — the
  // template wants an exact cols×rows, so any fixed cell size inherited from the
  // tool default must be dropped (otherwise it would silently override the grid).
  const gridPreset = preset?.nup?.cols != null;
  const cardMode = tool.engine === 'nup' && !gridPreset && !!(tool.defaultNup?.cellWIn || preset?.nup?.cellWIn || tool.fitSource);

  // Per-engine settings state (initialised from the tool's presets, then any
  // template overrides layered on top).
  const [bookletOpts, setBookletOpts] = useState<BookletOptions>({ ...DEFAULT_BOOKLET, ...tool.defaultBooklet, ...preset?.booklet });
  const [nupBookOpts, setNupBookOpts] = useState<NUpBookOptions>({ ...DEFAULT_NUPBOOK, ...(preset?.booklet ? { rtl: preset.booklet.rtl } : {}) });
  const [nupOpts, setNupOpts] = useState<NUpOptions>(() => {
    const merged = { ...DEFAULT_NUP, ...tool.defaultNup, ...preset?.nup };
    if (gridPreset) { delete (merged as Partial<NUpOptions>).cellWIn; delete (merged as Partial<NUpOptions>).cellHIn; }
    return merged;
  });
  const [posterOpts, setPosterOpts] = useState<PosterOptions>({ ...DEFAULT_POSTER, ...tool.defaultPoster, ...preset?.poster });
  const [cropOpts, setCropOpts] = useState<CropMarksOptions>(DEFAULT_CROP);
  const [bleedOpts, setBleedOpts] = useState<BleedOptions>({ bleedIn: 0.125, mode: 'scale', color: { r: 1, g: 1, b: 1 } });
  const [colorBarOpts, setColorBarOpts] = useState<ColorBarOptions>(DEFAULT_COLORBAR);
  const [pageNumOpts, setPageNumOpts] = useState<PageNumberOptions>(DEFAULT_PAGENUM);
  const [ticketOpts, setTicketOpts] = useState<TicketOptions>({ ...DEFAULT_TICKET, ...tool.defaultTicket, ...preset?.ticket });
  const [rotateAngle, setRotateAngle] = useState<number>(90);
  const [flipDir, setFlipDir] = useState<'h' | 'v'>('h');
  const [pageRange, setPageRange] = useState('all');
  const [splitMode, setSplitMode] = useState<'ranges' | 'chunk'>('ranges');
  const [splitChunk, setSplitChunk] = useState(4);
  const [splitZip, setSplitZip] = useState(true);
  const [distortOpts, setDistortOpts] = useState<DistortUi>(DEFAULT_DISTORT);
  const [calendarOpts, setCalendarOpts] = useState<CalendarOptions>(DEFAULT_CALENDAR);
  const [nestOpts, setNestOpts] = useState<NestOptions>(DEFAULT_NEST);
  const [overlayOpts, setOverlayOpts] = useState<OverlayOptions>(DEFAULT_OVERLAY);
  const [cropBoxOpts, setCropBoxOpts] = useState<CropBoxOptions>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [resizeOpts, setResizeOpts] = useState<ResizeOptions>({ ...DEFAULT_RESIZE, ...preset?.resize });
  const [watermarkOpts, setWatermarkOpts] = useState<WatermarkOptions>(DEFAULT_WATERMARK);
  const [headerFooterOpts, setHeaderFooterOpts] = useState<HeaderFooterOptions>(DEFAULT_HEADERFOOTER);
  const [slugOpts, setSlugOpts] = useState<JobSlugOptions>({ text: 'Job • ' + new Date().toISOString().slice(0, 10), position: 'bottom', fontSizePt: 8 });
  const [collatingOpts, setCollatingOpts] = useState<CollatingOptions>(DEFAULT_COLLATING);
  const [omrOpts, setOmrOpts] = useState<OmrOptions>(DEFAULT_OMR);
  const [gatheringOpts, setGatheringOpts] = useState<GatheringOptions>(DEFAULT_GATHERING);
  const [foldMarksOpts, setFoldMarksOpts] = useState<FoldMarksOptions>(DEFAULT_FOLDMARKS);
  const [layMarksOpts, setLayMarksOpts] = useState<LayMarksOptions>(DEFAULT_LAYMARKS);
  const [cutContourOpts, setCutContourOpts] = useState<CutContourOptions>(DEFAULT_CUTCONTOUR);
  const [whiteVarnishOpts, setWhiteVarnishOpts] = useState<WhiteVarnishOptions>(DEFAULT_WHITEVARNISH);
  const [brailleOpts, setBrailleOpts] = useState<BrailleOptions>(DEFAULT_BRAILLE);
  const [regOpts, setRegOpts] = useState<RegMarkOptions>(DEFAULT_REGMARK);
  const [insertOpts, setInsertOpts] = useState<InsertOptions>(DEFAULT_INSERT);
  const [nudgeOpts, setNudgeOpts] = useState<NudgeOptions>(DEFAULT_NUDGE);
  const [backdropOpts, setBackdropOpts] = useState<BackdropOptions>(DEFAULT_BACKDROP);
  const [qrStampOpts, setQrStampOpts] = useState<QrStampOptions>(DEFAULT_QRSTAMP);
  const [barcodeOpts, setBarcodeOpts] = useState<BarcodeStampOptions>(DEFAULT_BARCODE);
  const [backdropFileOpts, setBackdropFileOpts] = useState<BackdropFileOptions>(DEFAULT_BACKDROPFILE);
  const [colorEffectsOpts, setColorEffectsOpts] = useState<ColorEffectsOptions>(DEFAULT_COLOREFFECTS);
  const [repairOpts, setRepairOpts] = useState<RepairOptions>(DEFAULT_REPAIR);
  const [colorManageOpts, setColorManageOpts] = useState<ColorManageOptions>(DEFAULT_COLORMANAGE);
  const [layerStates, setLayerStates] = useState<Record<string, 'on' | 'off' | 'default'>>({});
  const [customGridOpts, setCustomGridOpts] = useState<typeof DEFAULT_CUSTOMGRID>(DEFAULT_CUSTOMGRID);
  const [pdfToolsOpts, setPdfToolsOpts] = useState<typeof DEFAULT_PDFTOOLS>(DEFAULT_PDFTOOLS);
  const [editOps, setEditOps] = useState<EditOp[]>([]);
  const [jdfOpts, setJdfOpts] = useState<JdfOptions>(DEFAULT_JDF);
  const [mixReverse, setMixReverse] = useState(false);
  // Initialise order-list tools from the (possibly already-loaded) file so they
  // are correct even when this tool was reached by switching in the rail.
  const [shuffleOrder, setShuffleOrder] = useState(() => file ? Array.from({ length: file.info.count }, (_, i) => i + 1).join(', ') : '');
  const [splitRanges, setSplitRanges] = useState(() => file ? `1-${file.info.count}` : '');
  const [stampFile, setStampFile] = useState<MergeFile | null>(null);

  // Merge tool has its own multi-file state
  const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);
  const [mergeStatus, setMergeStatus] = useState<Status>('idle');

  const loadFile = useCallback(async (f: File) => {
    setStatus('loading'); setErrMsg('');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await getPdfInfo(bytes);
      onFile({ name: f.name, bytes, info });
      // Prefill order-list tools and derive fit-to-source cell sizes.
      const seq = Array.from({ length: info.count }, (_, i) => i + 1).join(', ');
      setShuffleOrder(seq);
      setSplitRanges(`1-${info.count}`);
      if (tool.fitSource) setNupOpts(o => ({ ...o, cellWIn: info.widthIn, cellHIn: info.heightIn }));
      setStatus('idle');
    } catch {
      setStatus('error'); setErrMsg('Could not read PDF. Make sure it is a valid, unencrypted PDF.');
    }
  }, [tool.fitSource, onFile]);

  const clearFile = () => { onFile(null); setStatus('idle'); setErrMsg(''); };

  const addMergeFiles = useCallback(async (files: File[]) => {
    const loaded = await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    setMergeFiles(prev => [...prev, ...loaded]);
  }, []);

  const loadStamp = useCallback(async (files: File[]) => {
    const f = files[0]; if (!f) return;
    setStampFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }, []);

  // Sheet-navigation + canvas state
  const [sheetIndex, setSheetIndex] = useState(0);
  const [sheetCount, setSheetCount] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [unit, setUnit] = useState<'in' | 'mm' | 'pt'>('in');
  useEffect(() => { setSheetIndex(0); }, [tool.id]);

  // Run the active engine and return the produced PDF (or 'multi' for Split which
  // downloads its own parts, or null if it bailed with an error).
  const generate = async (): Promise<{ bytes: Uint8Array; name: string } | 'multi' | null> => {
    if (!file) return null;
    const base = file.name.replace(/\.pdf$/i, '');
    let out: Uint8Array | null = null;
    let outName = `${base}-imposed.pdf`;
    switch (tool.engine) {
        case 'booklet': out = await imposeBooklet(file.bytes, bookletOpts); outName = `${base}-booklet.pdf`; break;
        case 'nupbook': out = await imposeNUpBook(file.bytes, nupBookOpts); outName = `${base}-nupbook-${nupBookOpts.nUp}up.pdf`; break;
        case 'calendar': out = await imposeCalendar(file.bytes, calendarOpts); outName = `${base}-calendar.pdf`; break;
        case 'nest': out = await nestPdf(file.bytes, nestOpts); outName = `${base}-nested.pdf`; break;
        case 'nup':
          out = await imposeNUp(file.bytes, nupOpts);
          outName = `${base}-${nupOpts.repeatFirst ? 'repeat' : `${tool.id}`}.pdf`; break;
        case 'poster': out = await imposeTiledPoster(file.bytes, posterOpts); outName = `${base}-poster.pdf`; break;
        case 'cropmarks': out = await addCropMarksOnly(file.bytes, cropOpts); outName = `${base}-marks.pdf`; break;
        case 'bleed': out = await generateBleed(file.bytes, bleedOpts); outName = `${base}-bleed.pdf`; break;
        case 'preflight': return null; // inspection only — no output
        case 'colorbar': out = await addColorBar(file.bytes, colorBarOpts); outName = `${base}-colorbar.pdf`; break;
        case 'pagenumbers': out = await addPageNumbers(file.bytes, pageNumOpts); outName = `${base}-numbered.pdf`; break;
        case 'tickets': out = await imposeTickets(file.bytes, ticketOpts); outName = `${base}-tickets.pdf`; break;
        case 'rotate': out = await rotatePdf(file.bytes, rotateAngle, pageRange); outName = `${base}-rotated${rotateAngle}.pdf`; break;
        case 'flip': out = await flipPdf(file.bytes, flipDir, pageRange); outName = `${base}-flipped.pdf`; break;
        case 'crop': out = await cropPdf(file.bytes, cropBoxOpts, pageRange); outName = `${base}-cropped.pdf`; break;
        case 'resize': out = await resizePdf(file.bytes, resizeOpts, pageRange); outName = `${base}-resized.pdf`; break;
        case 'shuffle': out = await shufflePages(file.bytes, shuffleOrder); outName = `${base}-reordered.pdf`; break;
        case 'overlay':
          if (!stampFile) throw new Error('Add a watermark / overlay PDF first.');
          out = await overlayPdf(file.bytes, stampFile.bytes, overlayOpts); outName = `${base}-overlay.pdf`; break;
        case 'watermark': out = await addTextWatermark(file.bytes, watermarkOpts); outName = `${base}-watermark.pdf`; break;
        case 'headerfooter': out = await addHeaderFooter(file.bytes, { ...headerFooterOpts, fileName: file.name }); outName = `${base}-headerfooter.pdf`; break;
        case 'slug': out = await addJobSlug(file.bytes, { ...slugOpts, fileName: file.name }); outName = `${base}-slug.pdf`; break;
        case 'collating': out = await addCollatingMarks(file.bytes, collatingOpts); outName = `${base}-collated.pdf`; break;
        case 'omr': out = await addOmrMarks(file.bytes, omrOpts); outName = `${base}-omr.pdf`; break;
        case 'gathering': out = await addGatheringMarks(file.bytes, gatheringOpts); outName = `${base}-gathered.pdf`; break;
        case 'foldmarks': out = await addFoldMarks(file.bytes, foldMarksOpts); outName = `${base}-foldmarks.pdf`; break;
        case 'laymarks': out = await addLayMarks(file.bytes, layMarksOpts); outName = `${base}-laymarks.pdf`; break;
        case 'cutcontour': out = await addCutContour(file.bytes, cutContourOpts); outName = `${base}-diecut.pdf`; break;
        case 'whitevarnish': out = await addWhiteVarnish(file.bytes, whiteVarnishOpts); outName = `${base}-spot.pdf`; break;
        case 'braille': out = await addBraille(file.bytes, brailleOpts); outName = `${base}-braille.pdf`; break;
        case 'registration': out = await addRegistrationMarks(file.bytes, regOpts); outName = `${base}-regmarks.pdf`; break;
        case 'insert': out = await insertPages(file.bytes, insertOpts); outName = `${base}-inserted.pdf`; break;
        case 'nudge': out = await nudgePdf(file.bytes, nudgeOpts); outName = `${base}-nudged.pdf`; break;
        case 'repair': out = await repairPdf(file.bytes, repairOpts); outName = `${base}-repaired.pdf`; break;
        case 'coloreffects': out = await applyColorEffects(file.bytes, colorEffectsOpts); outName = `${base}-graded.pdf`; break;
        case 'colormanage': {
          let res = file.bytes;
          if (colorManageOpts.convert || colorManageOpts.gamutWarning) res = await applyColorManagement(res, colorManageOpts);
          if (stampFile) res = await assignOutputIntent(res, stampFile.bytes, colorManageOpts.destProfile || 'Custom');
          else if (!colorManageOpts.convert && !colorManageOpts.gamutWarning) throw new Error('Upload an ICC profile to assign, or enable Convert / Gamut warning.');
          out = res; outName = `${base}-color.pdf`; break;
        }
        case 'backdrop': out = await addBackdrop(file.bytes, backdropOpts); outName = `${base}-backdrop.pdf`; break;
        case 'layers': out = await setLayers(file.bytes, Object.entries(layerStates).map(([name, state]) => ({ name, state }))); outName = `${base}-layers.pdf`; break;
        case 'customgrid': {
          const { cols, rows, sheetWIn, sheetHIn, gutterIn, marginIn, addMarks, assign } = customGridOpts;
          const n = file.info.count, per = cols * rows, numSheets = Math.max(1, Math.ceil(n / per));
          const sheets: (CustomCell | null)[][] = [];
          for (let s = 0; s < numSheets; s++) {
            const cells: (CustomCell | null)[] = [];
            for (let c = 0; c < per; c++) {
              const seq = s * per + c;
              let page: number | null = assign === 'repeat' ? 1 : assign === 'reverse' ? (seq < n ? n - seq : null) : (seq < n ? seq + 1 : null);
              if (assign === 'saddle') { const half = Math.ceil(n / 2); page = c % 2 === 0 ? (seq < n ? n - Math.floor(seq / 2) : null) : (Math.floor(seq / 2) + 1 <= half ? Math.floor(seq / 2) + 1 : null); }
              cells.push(page && page >= 1 && page <= n ? { page, rotation: 0 } : null);
            }
            sheets.push(cells);
          }
          out = await imposeCustomGrid(file.bytes, { cols, rows, sheetWIn, sheetHIn, gutterIn, marginIn, addMarks, sheets });
          outName = `${base}-custom.pdf`; break;
        }
        case 'pdftools': {
          const op = pdfToolsOpts.operation;
          if (op === 'optimize') out = await optimizePdf(file.bytes, { objectStreams: pdfToolsOpts.objectStreams, removeUnused: pdfToolsOpts.removeUnused });
          else if (op === 'decrypt') out = await decryptPdf(file.bytes);
          else if (op === 'repair') out = await repairPdf(file.bytes, {});
          else throw new Error(op === 'encrypt' ? 'Writing encryption is not available in the browser engine — use a desktop/server tool.' : 'Linearisation is not available in the browser engine — use Optimize, or a server-side qpdf pass.');
          outName = `${base}-${op}.pdf`; break;
        }
        case 'qrstamp': out = await addQrStamp(file.bytes, qrStampOpts); outName = `${base}-qr.pdf`; break;
        case 'barcode': out = await addBarcodeStamp(file.bytes, barcodeOpts); outName = `${base}-barcode.pdf`; break;
        case 'backdropfile':
          if (!stampFile) throw new Error('Upload the backdrop PDF / image first.');
          out = await addBackdropFile(file.bytes, stampFile.bytes, { ...backdropFileOpts, opacity: (backdropFileOpts.opacity ?? 100) / 100 });
          outName = `${base}-backdrop.pdf`; break;
        case 'dimensions': out = await addDimensions(file.bytes); outName = `${base}-dimensions.pdf`; break;
        case 'editpdf': out = await editPdf(file.bytes, editOps); outName = `${base}-edited.pdf`; break;
        case 'jdf': out = exportJdf({ ...jdfOpts, widthPt: file.info.widthPt, heightPt: file.info.heightPt, pages: file.info.count }); outName = `${base}.jdf`; break;
        case 'distort': out = await distortPdf(file.bytes, { factorPct: distortFactor(distortOpts), direction: distortOpts.direction, pages: pageRange }); outName = `${base}-distort.pdf`; break;
        case 'mix':
          if (!stampFile) throw new Error('Add the second PDF to interleave first.');
          out = await mixPdfs(file.bytes, stampFile.bytes, mixReverse); outName = `${base}-interleaved.pdf`; break;
        case 'split': {
          const parts = splitMode === 'chunk' ? await splitPdfChunks(file.bytes, splitChunk) : await splitPdf(file.bytes, splitRanges);
          if (!parts.length) throw new Error('No valid ranges. Use a format like 1-3, 4-6, 7.');
          if (splitZip && parts.length > 1) {
            const zip = makeZip(parts.map((p, i) => ({ name: `${base}-part${i + 1}.pdf`, data: p })));
            downloadPdf(zip, `${base}-split.zip`);
          } else {
            downloadMultiple(parts, base);
          }
          return 'multi';
        }
        default: break;
      }
      return out ? { bytes: out, name: outName } : null;
  };

  const process = async () => {
    if (!file) return;
    setStatus('processing'); setErrMsg('');
    try {
      const r = await generate();
      if (r === null) { setStatus('idle'); return; }
      if (r !== 'multi') downloadFile(r.bytes, r.name, r.name.endsWith('.jdf') ? 'application/vnd.cip4-jdf+xml' : 'application/pdf');
      setStatus('done'); setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error'); setErrMsg(e instanceof Error ? e.message : 'Processing failed');
    }
  };

  // Print: generate the output and open it in a new tab for the browser print dialog.
  const printOut = async () => {
    if (!file) return;
    setStatus('processing'); setErrMsg('');
    try {
      const r = await generate();
      if (!r || r === 'multi') { setStatus('idle'); return; }
      const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'application/pdf' }));
      const w = window.open(url);
      if (w) w.addEventListener('load', () => { try { w.print(); } catch { /* popup blocked */ } });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus('idle');
    } catch (e) {
      setStatus('error'); setErrMsg(e instanceof Error ? e.message : 'Print failed');
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
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      <ToolRail activeId={tool.id} onSelect={onSelectTool} />
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn secondary" onClick={onBack} style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>← Gallery</button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{tool.badge ? `${tool.name} ${tool.badge}` : tool.name}</h2>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{tool.desc}</div>
        </div>
      </div>

      {tool.engine === 'dieline' ? (
        <DielineTool tool={tool} />
      ) : tool.engine === 'datamerge' ? (
        <DataMergeTool tool={tool} />
      ) : tool.engine === 'merge' ? (
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
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* LEFT — options sidebar */}
              <aside style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 300 }}>
              <FileBar file={file} onClear={clearFile} />

              <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                <h4 style={{ margin: '0 0 .75rem' }}>{tool.engine === 'preflight' ? 'Preflight report' : 'Settings'}</h4>
                {tool.engine === 'booklet' && <BookletSettings opts={bookletOpts} onChange={setBookletOpts} />}
                {tool.engine === 'nupbook' && <NUpBookSettings opts={nupBookOpts} onChange={setNupBookOpts} />}
                {tool.engine === 'calendar' && <CalendarSettings opts={calendarOpts} onChange={setCalendarOpts} />}
                {tool.engine === 'nest' && <NestSettings opts={nestOpts} onChange={setNestOpts} />}
                {tool.engine === 'nup' && <NUpSettings opts={nupOpts} onChange={setNupOpts} cardMode={cardMode} />}
                {tool.engine === 'poster' && <PosterSettings opts={posterOpts} onChange={setPosterOpts} />}
                {tool.engine === 'cropmarks' && <CropSettings opts={cropOpts} onChange={setCropOpts} />}
                {tool.engine === 'bleed' && <BleedSettings opts={bleedOpts} onChange={setBleedOpts} />}
                {tool.engine === 'preflight' && <PreflightPanel file={file} />}
                {tool.engine === 'colorbar' && <ColorBarSettings opts={colorBarOpts} onChange={setColorBarOpts} />}
                {tool.engine === 'pagenumbers' && <PageNumberSettings opts={pageNumOpts} onChange={setPageNumOpts} />}
                {tool.engine === 'tickets' && <TicketSettings opts={ticketOpts} onChange={setTicketOpts} />}
                {tool.engine === 'rotate' && <RotateSettings angle={rotateAngle} onChange={setRotateAngle} />}
                {tool.engine === 'flip' && <FlipSettings dir={flipDir} onChange={setFlipDir} />}
                {tool.engine === 'crop' && <CropBoxSettings opts={cropBoxOpts} onChange={setCropBoxOpts} />}
                {tool.engine === 'resize' && <ResizeSettings opts={resizeOpts} onChange={setResizeOpts} />}
                {tool.engine === 'distort' && <DistortSettings opts={distortOpts} onChange={setDistortOpts} />}
                {(tool.engine === 'rotate' || tool.engine === 'flip' || tool.engine === 'crop' || tool.engine === 'resize' || tool.engine === 'distort') && (
                  <div style={{ marginTop: '.75rem' }}>
                    <Field label="Pages" note="all · 1-5 · odd · even · last · last-2">
                      <input type="text" value={pageRange} onChange={e => setPageRange(e.target.value)} placeholder="all" style={iStyle} />
                    </Field>
                  </div>
                )}
                {tool.engine === 'shuffle' && <ShuffleSettings order={shuffleOrder} onChange={setShuffleOrder} count={file.info.count} />}
                {tool.engine === 'split' && <SplitSettings ranges={splitRanges} onChange={setSplitRanges} count={file.info.count} mode={splitMode} onMode={setSplitMode} chunk={splitChunk} onChunk={setSplitChunk} zip={splitZip} onZip={setSplitZip} />}
                {tool.engine === 'overlay' && <OverlaySettings opts={overlayOpts} onChange={setOverlayOpts} />}
                {tool.engine === 'watermark' && <WatermarkSettings opts={watermarkOpts} onChange={setWatermarkOpts} />}
                {tool.engine === 'headerfooter' && <HeaderFooterSettings opts={headerFooterOpts} onChange={setHeaderFooterOpts} />}
                {tool.engine === 'slug' && <JobSlugSettings opts={slugOpts} onChange={setSlugOpts} />}
                {tool.engine === 'collating' && <CollatingSettings opts={collatingOpts} onChange={setCollatingOpts} />}
                {tool.engine === 'omr' && <OmrSettings opts={omrOpts} onChange={setOmrOpts} />}
                {tool.engine === 'gathering' && <GatheringSettings opts={gatheringOpts} onChange={setGatheringOpts} />}
                {tool.engine === 'foldmarks' && <FoldMarksSettings opts={foldMarksOpts} onChange={setFoldMarksOpts} />}
                {tool.engine === 'laymarks' && <LayMarksSettings opts={layMarksOpts} onChange={setLayMarksOpts} />}
                {tool.engine === 'cutcontour' && <CutContourSettings opts={cutContourOpts} onChange={setCutContourOpts} />}
                {tool.engine === 'whitevarnish' && <WhiteVarnishSettings opts={whiteVarnishOpts} onChange={setWhiteVarnishOpts} />}
                {tool.engine === 'braille' && <BrailleSettings opts={brailleOpts} onChange={setBrailleOpts} />}
                {tool.engine === 'registration' && <RegistrationSettings opts={regOpts} onChange={setRegOpts} />}
                {tool.engine === 'insert' && <InsertSettings opts={insertOpts} onChange={setInsertOpts} />}
                {tool.engine === 'nudge' && <NudgeSettings opts={nudgeOpts} onChange={setNudgeOpts} />}
                {tool.engine === 'backdrop' && <BackdropSettings opts={backdropOpts} onChange={setBackdropOpts} />}
                {tool.engine === 'qrstamp' && <QrStampSettings opts={qrStampOpts} onChange={setQrStampOpts} />}
                {tool.engine === 'barcode' && <BarcodeSettings opts={barcodeOpts} onChange={setBarcodeOpts} />}
                {tool.engine === 'backdropfile' && <BackdropFileSettings opts={backdropFileOpts} onChange={setBackdropFileOpts} />}
                {tool.engine === 'mix' && (
                  <Row><input type="checkbox" checked={mixReverse} onChange={e => setMixReverse(e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Reverse the second file (backs scanned in reverse)</span></Row>
                )}
                {tool.engine === 'repair' && <RepairSettings opts={repairOpts} onChange={setRepairOpts} />}
                {tool.engine === 'coloreffects' && <ColorEffectsSettings opts={colorEffectsOpts} onChange={setColorEffectsOpts} />}
                {tool.engine === 'colormanage' && <ColorManageSettings opts={colorManageOpts} onChange={setColorManageOpts} />}
                {tool.engine === 'layers' && file && <LayersPanel file={file} states={layerStates} onChange={setLayerStates} />}
                {tool.engine === 'customgrid' && <CustomGridSettings opts={customGridOpts} onChange={setCustomGridOpts} />}
                {tool.engine === 'pdftools' && <PdfToolsSettings opts={pdfToolsOpts} onChange={setPdfToolsOpts} />}
                {tool.engine === 'editpdf' && <EditPdfSettings ops={editOps} onChange={setEditOps} />}
                {tool.engine === 'jdf' && <JdfSettings opts={jdfOpts} onChange={setJdfOpts} file={file} />}
                {tool.engine === 'dimensions' && (
                  <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Stamps each page with its exact trim and bleed size (inches + points) along the edges. No options needed.
                  </p>
                )}
              </div>

              {(tool.engine === 'overlay' || tool.engine === 'mix' || tool.engine === 'backdropfile' || tool.engine === 'colormanage') && (
                <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
                  <h4 style={{ margin: '0 0 .75rem' }}>{tool.engine === 'mix' ? 'Second PDF (interleave)' : tool.engine === 'backdropfile' ? 'Backdrop file (PDF / image)' : tool.engine === 'colormanage' ? 'ICC profile (.icc / .icm) — optional' : 'Overlay / watermark PDF'}</h4>
                  {stampFile
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span style={{ fontSize: '.85rem', flex: 1 }}>📄 {stampFile.name}</span>
                        <button className="btn secondary" style={{ padding: '.3rem .65rem', fontSize: '.8rem' }} onClick={() => setStampFile(null)}>Change</button>
                      </div>
                    : <FileDrop onFile={loadStamp} label={tool.engine === 'mix' ? 'Drop the second PDF (the backs)' : tool.engine === 'backdropfile' ? 'Drop the backdrop PDF or image' : tool.engine === 'colormanage' ? 'Drop the ICC profile to embed as an OutputIntent' : 'Drop the watermark / stamp PDF'} />}
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

              {tool.engine !== 'preflight' && (
                <button className="btn" onClick={process} disabled={isBusy} style={{ fontSize: '1rem', padding: '.7rem 1.5rem' }}>
                  {status === 'processing' ? 'Processing…' : status === 'done' ? '✓ Downloaded' : processLabel}
                </button>
              )}
              {status === 'error' && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{errMsg || 'Processing failed. Try again.'}</div>}
              </aside>

              {/* RIGHT — live preview canvas + toolbar */}
              <main style={{ flex: 1, minWidth: 340, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                <CanvasToolbar
                  unit={unit} onUnit={setUnit} zoom={zoom} onZoom={setZoom}
                  sheetIndex={sheetIndex} sheetCount={sheetCount} onSheet={setSheetIndex}
                  onPrint={printOut} onDownload={process} busy={isBusy} status={status}
                />
                <ImpositionCanvas
                  engine={tool.engine} nupOpts={nupOpts} bookletOpts={bookletOpts} nupBookOpts={nupBookOpts} posterOpts={posterOpts}
                  ticketOpts={ticketOpts} pageCount={file.info.count} unit={unit}
                  sheetLabel={tool.engine === 'nup' || tool.engine === 'tickets'
                    ? `${nupOpts.sheetWIn}×${nupOpts.sheetHIn}` : tool.engine === 'poster' ? `${posterOpts.sheetWIn}×${posterOpts.sheetHIn}` : tool.engine === 'nupbook' ? `${nupBookOpts.sheetWIn}×${nupBookOpts.sheetHIn}` : 'sheet'}
                  sheetIndex={sheetIndex} onSheetCount={setSheetCount} zoom={zoom}
                />
              </main>
            </div>
          )}

          {status === 'loading' && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Reading PDF…</div>}
          {status === 'error' && !file && <div style={{ color: '#dc2626', fontSize: '.85rem', marginTop: '-0.5rem' }}>{errMsg}</div>}
        </div>
      )}
      </div>
    </div>
  );
}

// Top toolbar over the preview canvas: unit selector, zoom, sheet navigation,
// Print + Download — mirrors the pdfpress workspace bar.
function CanvasToolbar({ unit, onUnit, zoom, onZoom, sheetIndex, sheetCount, onSheet, onPrint, onDownload, busy, status }: {
  unit: 'in' | 'mm' | 'pt'; onUnit: (u: 'in' | 'mm' | 'pt') => void; zoom: number; onZoom: (z: number) => void;
  sheetIndex: number; sheetCount: number; onSheet: (i: number) => void;
  onPrint: () => void; onDownload: () => void; busy: boolean; status: Status;
}) {
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--ink)', cursor: 'pointer', fontSize: '.9rem' };
  const SQRT2 = Math.SQRT2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '.25rem', padding: 3, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-alt)' }}>
        {(['in', 'mm', 'pt'] as const).map(u => (
          <button key={u} onClick={() => onUnit(u)} style={{ padding: '.2rem .55rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, background: unit === u ? VIOLET : 'transparent', color: unit === u ? '#fff' : 'var(--muted)' }}>{u}</button>
        ))}
      </div>
      <button style={btn} title="Zoom out" onClick={() => onZoom(Math.max(0.4, zoom / SQRT2))}>−</button>
      <span style={{ fontSize: '.78rem', color: 'var(--muted)', minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
      <button style={btn} title="Zoom in" onClick={() => onZoom(Math.min(4, zoom * SQRT2))}>+</button>
      <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 .15rem' }} />
      <button style={btn} title="Previous sheet" disabled={sheetIndex <= 0} onClick={() => onSheet(Math.max(0, sheetIndex - 1))}>‹</button>
      <span style={{ fontSize: '.78rem', color: 'var(--muted)', minWidth: 70, textAlign: 'center' }}>Sheet {sheetIndex + 1}/{sheetCount}</span>
      <button style={btn} title="Next sheet" disabled={sheetIndex >= sheetCount - 1} onClick={() => onSheet(Math.min(sheetCount - 1, sheetIndex + 1))}>›</button>
      <div style={{ flex: 1 }} />
      <button className="btn secondary" onClick={onPrint} disabled={busy} style={{ padding: '.4rem .9rem', fontSize: '.82rem' }}>🖨 Print</button>
      <button className="btn" onClick={onDownload} disabled={busy} style={{ padding: '.4rem 1rem', fontSize: '.82rem' }}>
        {status === 'processing' ? '…' : status === 'done' ? '✓ Saved' : '↓ Download'}
      </button>
    </div>
  );
}

// ── Tool gallery ──────────────────────────────────────────────────────────────

// ── Chained-workflow step settings ────────────────────────────────────────────

const VIOLET = '#7c3aed';

// Gallery theme palettes, applied as CSS custom properties on the page shell so
// every child (and the .btn/.admin-card classes) adapts. Default is dark, to
// match the reference gallery.
const THEMES: Record<'light' | 'dark', React.CSSProperties> = {
  light: { '--bg': '#ffffff', '--bg-alt': '#f7f5f2', '--ink': '#1a1a1a', '--muted': '#5a5a5a', '--border': '#e6e3df', '--accent-soft': '#f3f0ff', '--canvas-bg': '#eef0f3' } as React.CSSProperties,
  dark: { '--bg': '#0b0b12', '--bg-alt': '#15151f', '--ink': '#f3f4f6', '--muted': '#9ca3af', '--border': '#2a2a37', '--accent-soft': 'rgba(139,92,246,0.18)', '--canvas-bg': '#0f1017' } as React.CSSProperties,
};

const DEFAULT_HEADERFOOTER: HeaderFooterOptions = { header: 'Document Title', footer: '', fontSizePt: 10, marginPt: 24, align: 'center' };
const DEFAULT_WATERMARK: WatermarkOptions = { text: 'DRAFT', opacity: 0.15, angleDeg: 45, fontSizePt: 72, color: { r: 0.53, g: 0.53, b: 0.53 }, pages: 'all' };
const DEFAULT_JOBSLUG: JobSlugOptions = { text: 'Job name · client · date', position: 'bottom', fontSizePt: 9 };

function BleedSettings({ opts, onChange }: { opts: BleedOptions; onChange: (o: BleedOptions) => void }) {
  const set = <K extends keyof BleedOptions>(k: K, v: BleedOptions[K]) => onChange({ ...opts, [k]: v });
  const col = opts.color ?? { r: 1, g: 1, b: 1 };
  const hex = '#' + [col.r, col.g, col.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return (
    <Grid>
      <Field label="Bleed per edge (in)">
        <input type="number" min={0.0625} max={0.5} step={0.0625} value={opts.bleedIn} onChange={e => set('bleedIn', +e.target.value)} style={iStyle} />
      </Field>
      <Field label="Method">
        <select value={opts.mode ?? 'scale'} onChange={e => set('mode', e.target.value as BleedOptions['mode'])} style={iStyle}>
          <option value="scale">Scale (enlarge content)</option>
          <option value="mirror">Mirror edge</option>
          <option value="repeat">Repeat edge</option>
          <option value="solid">Solid colour</option>
        </select>
      </Field>
      {opts.mode === 'solid' && (
        <Field label="Bleed colour">
          <input type="color" value={hex} onChange={e => { const m = /#(..)(..)(..)/.exec(e.target.value)!; set('color', { r: parseInt(m[1]!, 16) / 255, g: parseInt(m[2]!, 16) / 255, b: parseInt(m[3]!, 16) / 255 }); }} style={{ ...iStyle, height: 38, padding: 2 }} />
        </Field>
      )}
      <Field label="Pages" note="all · 1-5 · odd · last"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
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
      <Field label="Font family">
        <select value={opts.font ?? 'helvetica'} onChange={e => set('font', e.target.value as HeaderFooterOptions['font'])} style={iStyle}>
          <option value="helvetica">Helvetica</option><option value="times">Times Roman</option><option value="courier">Courier</option>
        </select>
      </Field>
      <Field label="Rotation">
        <select value={String(opts.rotationDeg ?? 0)} onChange={e => set('rotationDeg', +e.target.value as HeaderFooterOptions['rotationDeg'])} style={iStyle}>
          <option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option>
        </select>
      </Field>
      <Field label="Edge margin (pt)"><input type="number" min={6} max={96} step={1} value={opts.marginPt} onChange={e => set('marginPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Alternate sides"><Row><input type="checkbox" checked={!!opts.alternate} onChange={e => set('alternate', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Mirror on odd pages (book heads)</span></Row></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Tokens: <code>[page-number]</code> · <code>[page-number:0001]</code> · <code>[page-count]</code> · <code>[file-name]</code> · <code>[timestamp:%Y-%m-%d]</code>
      </div>
    </Grid>
  );
}

function WatermarkSettings({ opts, onChange }: { opts: WatermarkOptions; onChange: (o: WatermarkOptions) => void }) {
  const set = <K extends keyof WatermarkOptions>(k: K, v: WatermarkOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Presets">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['DRAFT', 'CONFIDENTIAL', 'PROOF', 'COPY', 'SAMPLE', 'DO NOT COPY'].map(p => (
            <button key={p} className="btn secondary" style={{ padding: '.25rem .5rem', fontSize: '.72rem' }} onClick={() => set('text', p)}>{p}</button>
          ))}
        </div>
      </Field>
      <Field label="Watermark text"><input type="text" value={opts.text} onChange={e => set('text', e.target.value)} style={iStyle} /></Field>
      <Field label="Font size (pt)"><input type="number" min={24} max={200} step={4} value={opts.fontSizePt} onChange={e => set('fontSizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Colour"><input type="color" value={rgbToHex(opts.color ?? { r: 0.53, g: 0.53, b: 0.53 })} onChange={e => set('color', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label={`Opacity: ${Math.round(opts.opacity * 100)}%`}><input type="range" min={5} max={80} step={5} value={opts.opacity * 100} onChange={e => set('opacity', +e.target.value / 100)} style={{ width: '100%', marginTop: '.5rem' }} /></Field>
      <Field label="Angle (°)" note="45 diagonal · 0 horizontal · 90 vertical"><input type="number" min={-90} max={360} step={5} value={opts.angleDeg} onChange={e => set('angleDeg', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
    </Grid>
  );
}

function BarcodeSettings({ opts, onChange }: { opts: BarcodeStampOptions; onChange: (o: BarcodeStampOptions) => void }) {
  const set = <K extends keyof BarcodeStampOptions>(k: K, v: BarcodeStampOptions[K]) => onChange({ ...opts, [k]: v });
  const is2D = opts.symbology === 'qr' || opts.symbology === 'datamatrix';
  return (
    <Grid>
      <Field label="Symbology">
        <select value={opts.symbology} onChange={e => set('symbology', e.target.value as BarcodeStampOptions['symbology'])} style={iStyle}>
          <option value="qr">QR Code — URLs, text</option>
          <option value="code128">Code 128 — alphanumeric IDs</option>
          <option value="datamatrix">DataMatrix — compact 2D</option>
          <option value="ean13">EAN-13 — retail (12 digits)</option>
        </select>
      </Field>
      <Field label="Data" note={opts.symbology === 'ean13' ? '12 digits (check auto)' : 'value to encode'}><input type="text" value={opts.text} onChange={e => set('text', e.target.value)} style={iStyle} /></Field>
      <Field label="Scale (module pt)" note="module size / bar width"><input type="number" min={1} max={12} step={0.5} value={opts.scale ?? 3} onChange={e => set('scale', +e.target.value)} style={iStyle} /></Field>
      <Field label="Quiet zone (modules)"><input type="number" min={0} max={12} step={1} value={opts.quietZone ?? 4} onChange={e => set('quietZone', +e.target.value)} style={iStyle} /></Field>
      {!is2D && <Field label="Bar height (mm)"><input type="number" min={3} max={40} step={1} value={opts.barHeightMm ?? 15} onChange={e => set('barHeightMm', +e.target.value)} style={iStyle} /></Field>}
      {!is2D && <Field label="Human-readable text"><Row><input type="checkbox" checked={!!opts.showText} onChange={e => set('showText', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Show value under bars</span></Row></Field>}
      <Field label="Position">
        <select value={opts.position} onChange={e => set('position', e.target.value as BarcodeStampOptions['position'])} style={iStyle}>
          {[['tl', 'Top-left'], ['tc', 'Top-centre'], ['tr', 'Top-right'], ['ml', 'Mid-left'], ['mc', 'Centre'], ['mr', 'Mid-right'], ['bl', 'Bottom-left'], ['bc', 'Bottom-centre'], ['br', 'Bottom-right']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Margin (pt)"><input type="number" min={0} max={144} step={1} value={opts.marginPt ?? 18} onChange={e => set('marginPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="X offset (pt)"><input type="number" step={1} value={opts.xOffsetPt ?? 0} onChange={e => set('xOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Y offset (pt)"><input type="number" step={1} value={opts.yOffsetPt ?? 0} onChange={e => set('yOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Rotation">
        <select value={opts.rotationDeg ?? 0} onChange={e => set('rotationDeg', +e.target.value as BarcodeStampOptions['rotationDeg'])} style={iStyle}>
          {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}°</option>)}
        </select>
      </Field>
      <Field label="Bar colour"><input type="color" value={rgbToHex(opts.barColor ?? { r: 0, g: 0, b: 0 })} onChange={e => set('barColor', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Background"><input type="color" value={rgbToHex(opts.bgColor ?? { r: 1, g: 1, b: 1 })} onChange={e => set('bgColor', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Transparent bg"><Row><input type="checkbox" checked={!!opts.transparent} onChange={e => set('transparent', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>No background panel</span></Row></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Stamps the same barcode on every page (or a page range). <strong>DataMatrix</strong> is a real ECC200 encode (Reed-Solomon + Annex F placement). Print black on white and don't scale after generating. For a unique barcode per CSV row, use the <em>Variable Data</em> tool.
      </div>
    </Grid>
  );
}

function BackdropFileSettings({ opts, onChange }: { opts: BackdropFileOptions; onChange: (o: BackdropFileOptions) => void }) {
  const set = <K extends keyof BackdropFileOptions>(k: K, v: BackdropFileOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Repeat"><Row><input type="checkbox" checked={opts.repeat !== false} onChange={e => set('repeat', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Across all pages (else page 1 only)</span></Row></Field>
      <Field label="Offset X (pt)" note="+ right"><input type="number" step={1} value={opts.offsetXPt ?? 0} onChange={e => set('offsetXPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Offset Y (pt)" note="+ down"><input type="number" step={1} value={opts.offsetYPt ?? 0} onChange={e => set('offsetYPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Scale (%)"><input type="number" min={10} max={400} step={1} value={opts.scalePct ?? 100} onChange={e => set('scalePct', +e.target.value)} style={iStyle} /></Field>
      <Field label="Opacity (%)"><input type="number" min={0} max={100} step={1} value={opts.opacity ?? 100} onChange={e => set('opacity', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Places the uploaded PDF or image <strong>behind</strong> your page content (the opposite of Overlay). Upload it in the <em>Backdrop file</em> box below. Good for pre-printed stationery, textured stock and brand frames — match or exceed the page size to avoid white edges.
      </div>
    </Grid>
  );
}

function ColorEffectsSettings({ opts, onChange }: { opts: ColorEffectsOptions; onChange: (o: ColorEffectsOptions) => void }) {
  const set = <K extends keyof ColorEffectsOptions>(k: K, v: ColorEffectsOptions[K]) => onChange({ ...opts, [k]: v });
  const slider = (label: string, k: keyof ColorEffectsOptions, min: number, max: number, val: number, suffix = '') => (
    <Field label={`${label}: ${val}${suffix}`}><input type="range" min={min} max={max} value={val} onChange={e => set(k, +e.target.value)} style={{ width: '100%', marginTop: '.4rem' }} /></Field>
  );
  return (
    <Grid>
      {slider('Brightness', 'brightness', 0, 200, opts.brightness ?? 100)}
      {slider('Contrast', 'contrast', 0, 200, opts.contrast ?? 100)}
      {slider('Saturation', 'saturation', 0, 200, opts.saturation ?? 100)}
      {slider('Grayscale', 'grayscale', 0, 100, opts.grayscale ?? 0, '%')}
      {slider('Warm tone', 'warmTone', 0, 100, opts.warmTone ?? 0, '%')}
      {slider('Invert', 'invert', 0, 100, opts.invert ?? 0, '%')}
      {slider('Hue rotate', 'hueRotate', 0, 360, opts.hueRotate ?? 0, '°')}
      <Field label="Rasterize DPI">
        <select value={opts.dpi ?? 300} onChange={e => set('dpi', +e.target.value)} style={iStyle}>
          {[150, 300, 600].map(d => <option key={d} value={d}>{d} DPI</option>)}
        </select>
      </Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <Row><button className="btn secondary" style={{ padding: '.3rem .7rem', fontSize: '.8rem' }} onClick={() => onChange({ ...DEFAULT_COLOREFFECTS })}>Reset all</button></Row>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Applies brightness / contrast / saturation and creative effects by <strong>rasterising</strong> the targeted pages (vector text/paths become a bitmap at the chosen DPI). For press-accurate colour-space conversion use <em>Color Management</em> instead. Runs in the browser.
      </div>
    </Grid>
  );
}

function RepairSettings({ opts, onChange }: { opts: RepairOptions; onChange: (o: RepairOptions) => void }) {
  const set = <K extends keyof RepairOptions>(k: K, v: RepairOptions[K]) => onChange({ ...opts, [k]: v });
  const chk = (label: string, k: keyof RepairOptions, note: string, disabled = false) => (
    <Field label={label}><Row><input type="checkbox" disabled={disabled} checked={disabled ? true : !!opts[k]} onChange={e => set(k, e.target.checked as RepairOptions[typeof k])} /><span style={{ fontSize: '.85rem' }}>{note}</span></Row></Field>
  );
  return (
    <Grid>
      {chk('Re-serialize', 'reserialize', 'Rebuild xref + streams (always on)', true)}
      {chk('Strip metadata', 'stripMetadata', 'Remove title / author / dates + XMP')}
      {chk('Remove annotations', 'removeAnnotations', 'Flatten out comments / stamps / links')}
      {chk('Remove JavaScript', 'removeJavaScript', 'Strip embedded scripts & page actions')}
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Re-writes the PDF from scratch — fixes broken cross-references, stream lengths and object numbering that make RIPs reject a file. The rebuild alone already drops dead objects, document-level JavaScript and source metadata.
      </div>
    </Grid>
  );
}

const ICC_DEST = ['', 'FOGRA39 (EU coated)', 'GRACoL 2006 (US sheetfed)', 'SWOP (US web)', 'Japan Color 2001 Coated'];

function ColorManageSettings({ opts, onChange }: { opts: ColorManageOptions; onChange: (o: ColorManageOptions) => void }) {
  const set = <K extends keyof ColorManageOptions>(k: K, v: ColorManageOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Source profile">
        <select value={opts.sourceProfile} onChange={e => set('sourceProfile', e.target.value)} style={iStyle}>
          <option value="sRGB">sRGB (built-in)</option><option value="CMYK">CMYK (already device)</option>
        </select>
      </Field>
      <Field label="Destination profile">
        <select value={opts.destProfile} onChange={e => set('destProfile', e.target.value)} style={iStyle}>
          {ICC_DEST.map(p => <option key={p} value={p}>{p || 'None (RGB→CMYK model)'}</option>)}
        </select>
      </Field>
      <Field label="Rendering intent">
        <select value={opts.intent} onChange={e => set('intent', e.target.value as ColorManageOptions['intent'])} style={iStyle}>
          <option value="perceptual">Perceptual (photos)</option>
          <option value="relative">Relative colorimetric (logos)</option>
          <option value="saturation">Saturation (charts)</option>
          <option value="absolute">Absolute colorimetric (proof)</option>
        </select>
      </Field>
      <Field label="Rasterize DPI">
        <select value={opts.dpi ?? 300} onChange={e => set('dpi', +e.target.value)} style={iStyle}>
          {[150, 300, 600].map(d => <option key={d} value={d}>{d} DPI</option>)}
        </select>
      </Field>
      <Field label="Convert to CMYK"><Row><input type="checkbox" checked={!!opts.convert} onChange={e => set('convert', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Rasterise + map to CMYK gamut</span></Row></Field>
      <Field label="Gamut warning"><Row><input type="checkbox" checked={!!opts.gamutWarning} onChange={e => set('gamutWarning', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Flag out-of-gamut colours (green)</span></Row></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Two independent actions: <strong>assign a profile</strong> — upload an ICC below and it is embedded as a PDF/X <em>OutputIntent</em> (lossless, vectors intact, what a RIP reads); and <strong>convert / gamut-check</strong> — rasterise and map to the CMYK-reproducible gamut (RGB→CMYK→RGB via an 8-primary ink model), optionally flagging out-of-gamut colours. A device-exact ICC transform needs a full CMM; the pixel conversion uses a standard CMYK model — genuine for gamut checking and RGB→CMYK normalisation.
      </div>
    </Grid>
  );
}

function LayersPanel({ file, states, onChange }: { file: LoadedFile; states: Record<string, 'on' | 'off' | 'default'>; onChange: (s: Record<string, 'on' | 'off' | 'default'>) => void }) {
  const [layers, setLayers2] = useState<PdfLayer[] | null>(null);
  useEffect(() => { let live = true; readLayers(file.bytes).then(l => { if (live) setLayers2(l); }); return () => { live = false; }; }, [file]);
  if (!layers) return <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Reading layers…</div>;
  if (!layers.length) return (
    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--muted)', fontSize: '.85rem', lineHeight: 1.6 }}>
      <div style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>▤</div>
      <strong>No layers detected</strong><br />
      This PDF has no named layers (OCGs). Layers created by upstream tools (or authored in InDesign/Illustrator) appear here with a three-state toggle.
    </div>
  );
  const cycle = (name: string) => { const cur = states[name] ?? 'default'; const next = cur === 'default' ? 'on' : cur === 'on' ? 'off' : 'default'; onChange({ ...states, [name]: next }); };
  const label = (s: string) => s === 'on' ? 'On (force visible)' : s === 'off' ? 'Off (force hidden)' : 'Default';
  const col = (s: string) => s === 'on' ? '#16a34a' : s === 'off' ? '#dc2626' : 'var(--muted)';
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      {layers.map(l => {
        const s = states[l.name] ?? (l.forcedOff ? 'off' : l.forcedOn ? 'on' : 'default');
        return (
          <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.5rem .7rem', border: '1px solid var(--border)', borderRadius: 6 }}>
            <span style={{ flex: 1, fontSize: '.88rem' }}>{l.name}</span>
            <button className="btn secondary" style={{ padding: '.25rem .6rem', fontSize: '.76rem', color: col(s) }} onClick={() => cycle(l.name)}>{label(s)}</button>
          </div>
        );
      })}
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>Click a layer to cycle Default → On → Off. <em>Off</em> force-hides the layer in the output; <em>On</em> force-shows it. Not all RIPs honour layer visibility — test with yours.</div>
    </div>
  );
}

function CustomGridSettings({ opts, onChange }: { opts: typeof DEFAULT_CUSTOMGRID; onChange: (o: typeof DEFAULT_CUSTOMGRID) => void }) {
  const set = <K extends keyof typeof DEFAULT_CUSTOMGRID>(k: K, v: (typeof DEFAULT_CUSTOMGRID)[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Columns"><input type="number" min={1} max={12} value={opts.cols} onChange={e => set('cols', +e.target.value)} style={iStyle} /></Field>
      <Field label="Rows"><input type="number" min={1} max={12} value={opts.rows} onChange={e => set('rows', +e.target.value)} style={iStyle} /></Field>
      <SheetPicker opts={opts} set={set as never} />
      <Field label="Gutter (in)"><input type="number" min={0} max={2} step={0.0625} value={opts.gutterIn} onChange={e => set('gutterIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Margin (in)"><input type="number" min={0} max={2} step={0.0625} value={opts.marginIn} onChange={e => set('marginIn', +e.target.value)} style={iStyle} /></Field>
      <Field label="Page fill" note="Auto-assign strategy">
        <select value={opts.assign} onChange={e => set('assign', e.target.value)} style={iStyle}>
          <option value="sequential">Sequential (1,2,3…)</option>
          <option value="reverse">Reverse (last→first)</option>
          <option value="repeat">Repeat page 1</option>
          <option value="saddle">Saddle-stitch pairs</option>
        </select>
      </Field>
      <Field label="Crop marks"><Row><input type="checkbox" checked={opts.addMarks} onChange={e => set('addMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Per-cell corner marks</span></Row></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Full manual control: a <strong>{opts.cols}×{opts.rows}</strong> grid ({opts.cols * opts.rows} cells/sheet). The fill strategy assigns source pages to cells with per-cell rotation; each output page is one sheet. For non-standard signatures this is the escape hatch when no automated tool fits.
      </div>
    </Grid>
  );
}

function PdfToolsSettings({ opts, onChange }: { opts: typeof DEFAULT_PDFTOOLS; onChange: (o: typeof DEFAULT_PDFTOOLS) => void }) {
  const set = <K extends keyof typeof DEFAULT_PDFTOOLS>(k: K, v: (typeof DEFAULT_PDFTOOLS)[K]) => onChange({ ...opts, [k]: v });
  const unavailable = opts.operation === 'encrypt' || opts.operation === 'linearize';
  return (
    <Grid>
      <Field label="Operation">
        <select value={opts.operation} onChange={e => set('operation', e.target.value as typeof DEFAULT_PDFTOOLS['operation'])} style={iStyle}>
          <option value="optimize">Optimize (shrink)</option>
          <option value="decrypt">Decrypt (remove password)</option>
          <option value="repair">Repair (rebuild)</option>
          <option value="linearize">Linearize (fast web view)</option>
          <option value="encrypt">Encrypt (password)</option>
        </select>
      </Field>
      {opts.operation === 'optimize' && <>
        <Field label="Recompress + object streams"><Row><input type="checkbox" checked={opts.objectStreams} onChange={e => set('objectStreams', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Pack objects (smaller)</span></Row></Field>
        <Field label="Remove unreferenced objects"><Row><input type="checkbox" checked={opts.removeUnused} onChange={e => set('removeUnused', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Drop orphaned objects</span></Row></Field>
      </>}
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: unavailable ? '#b45309' : 'var(--muted)', lineHeight: 1.5 }}>
        {opts.operation === 'optimize' && 'Rebuilds the PDF and packs objects into object streams — drops orphaned objects and re-writes a lean cross-reference table. Typical savings on unoptimised files; already-lean PDFs change little.'}
        {opts.operation === 'decrypt' && 'Removes password protection / encryption by re-saving the document unencrypted. You must be able to open the file (supply the password in your viewer first if needed).'}
        {opts.operation === 'repair' && 'Re-writes the whole PDF structure — fixes broken xref tables, stream lengths and object numbering that make viewers/RIPs reject a file.'}
        {opts.operation === 'linearize' && '⚠ Linearisation (fast web view) reorders the byte stream and is not available in the browser engine — it needs a server-side pass (e.g. qpdf/Ghostscript). Use Optimize to shrink instead.'}
        {opts.operation === 'encrypt' && '⚠ Writing encryption is not available in the browser engine (pdf-lib cannot author encryption). Encrypt with a desktop tool or a server-side pass. Decrypt (removing protection) is supported here.'}
      </div>
    </Grid>
  );
}

function EditPdfSettings({ ops, onChange }: { ops: EditOp[]; onChange: (o: EditOp[]) => void }) {
  const upd = (i: number, patch: any) => onChange(ops.map((o, j) => j === i ? { ...o, ...patch } as EditOp : o)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const del = (i: number) => onChange(ops.filter((_, j) => j !== i));
  const add = (op: EditOp) => onChange([...ops, op]);
  const num = (v: number, on: (n: number) => void, w = 62) => <input type="number" value={v} onChange={e => on(+e.target.value)} style={{ ...iStyle, width: w, padding: '.25rem .4rem' }} />;
  return (
    <div style={{ display: 'grid', gap: '.6rem' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {([['+ Text', { type: 'text', page: 1, xPt: 72, yPt: 72, text: 'Text', sizePt: 12 }],
        ['+ Redact', { type: 'redact', page: 1, xPt: 72, yPt: 72, wPt: 144, hPt: 20 }],
        ['+ Box', { type: 'box', page: 1, xPt: 72, yPt: 72, wPt: 100, hPt: 60, fill: false, color: { r: 0.9, g: 0, b: 0 } }],
        ['+ Line', { type: 'line', page: 1, x1: 72, y1: 72, x2: 200, y2: 72, thicknessPt: 1 }],
        ['+ Rotate', { type: 'rotate', page: 1, angleDeg: 90 }],
        ['+ Delete', { type: 'delete', pages: 'last' }]] as [string, EditOp][]).map(([label, op]) => (
          <button key={label} className="btn secondary" style={{ padding: '.25rem .55rem', fontSize: '.74rem' }} onClick={() => add(op)}>{label}</button>
        ))}
      </div>
      {ops.length === 0 && <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Add edit operations above. Coordinates are in points from the <strong>bottom-left</strong> corner (72 pt = 1 in).</div>}
      {ops.map((op, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '.5rem .6rem', display: 'grid', gap: '.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', color: VIOLET, flex: 1 }}>{op.type}</span>
            {op.type !== 'delete' && <label style={{ fontSize: '.75rem', color: 'var(--muted)' }}>page {num((op as any).page, n => upd(i, { page: n }), 46)}</label>}
            <button className="btn secondary" style={{ padding: '.15rem .45rem', fontSize: '.72rem' }} onClick={() => del(i)}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '.75rem', color: 'var(--muted)' }}>
            {op.type === 'text' && <>x {num(op.xPt, n => upd(i, { xPt: n }))} y {num(op.yPt, n => upd(i, { yPt: n }))} size {num(op.sizePt ?? 12, n => upd(i, { sizePt: n }), 46)}<input value={op.text} onChange={e => upd(i, { text: e.target.value })} style={{ ...iStyle, flex: 1, minWidth: 120, padding: '.25rem .4rem' }} /></>}
            {(op.type === 'redact' || op.type === 'box') && <>x {num(op.xPt, n => upd(i, { xPt: n }))} y {num(op.yPt, n => upd(i, { yPt: n }))} w {num(op.wPt, n => upd(i, { wPt: n }))} h {num(op.hPt, n => upd(i, { hPt: n }))}{op.type === 'box' && <label><input type="checkbox" checked={op.fill ?? false} onChange={e => upd(i, { fill: e.target.checked })} /> fill</label>}</>}
            {op.type === 'line' && <>x1 {num(op.x1, n => upd(i, { x1: n }))} y1 {num(op.y1, n => upd(i, { y1: n }))} x2 {num(op.x2, n => upd(i, { x2: n }))} y2 {num(op.y2, n => upd(i, { y2: n }))} w {num(op.thicknessPt ?? 1, n => upd(i, { thicknessPt: n }), 46)}</>}
            {op.type === 'rotate' && <>by {num(op.angleDeg, n => upd(i, { angleDeg: n }), 56)}°</>}
            {op.type === 'delete' && <>pages <input value={op.pages} onChange={e => upd(i, { pages: e.target.value })} style={{ ...iStyle, width: 120, padding: '.25rem .4rem' }} /> <span>(all · 1-5 · odd · last)</span></>}
          </div>
        </div>
      ))}
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>Applies each operation in order — annotate text, redact (opaque black box), draw boxes/lines, rotate or delete pages. Operations run before deletions so page numbers stay stable.</div>
    </div>
  );
}

const JDF_PRODUCTS = ['Brochure', 'Book', 'BusinessCard', 'Flyer', 'Poster', 'Postcard', 'Label', 'Folder', 'Magazine', 'Catalog', 'Unknown'];

function JdfSettings({ opts, onChange, file }: { opts: JdfOptions; onChange: (o: JdfOptions) => void; file: LoadedFile | null }) {
  const set = <K extends keyof JdfOptions>(k: K, v: JdfOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Job name"><input type="text" value={opts.jobName} onChange={e => set('jobName', e.target.value)} style={iStyle} /></Field>
      <Field label="Job ID" note="blank = auto"><input type="text" value={opts.jobId ?? ''} onChange={e => set('jobId', e.target.value || undefined)} style={iStyle} /></Field>
      <Field label="Product type">
        <select value={opts.productType} onChange={e => set('productType', e.target.value)} style={iStyle}>{JDF_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}</select>
      </Field>
      <Field label="Quantity"><input type="number" min={1} value={opts.quantity} onChange={e => set('quantity', +e.target.value)} style={iStyle} /></Field>
      <Field label="Sides">
        <select value={opts.sides} onChange={e => set('sides', e.target.value as JdfOptions['sides'])} style={iStyle}>
          <option value="OneSided">One-sided</option><option value="TwoSidedFlipY">Two-sided (flip long)</option><option value="TwoSidedFlipX">Two-sided (flip short)</option>
        </select>
      </Field>
      <Field label="Binding">
        <select value={opts.binding} onChange={e => set('binding', e.target.value as JdfOptions['binding'])} style={iStyle}>
          {['None', 'SaddleStitch', 'PerfectBound', 'CaseBound', 'WireO', 'Coil'].map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Media width (pt)"><input type="number" value={opts.mediaWidthPt ?? 936} onChange={e => set('mediaWidthPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Media height (pt)"><input type="number" value={opts.mediaHeightPt ?? 1368} onChange={e => set('mediaHeightPt', +e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Exports a CIP4 <strong>JDF 1.4</strong> Product-intent job ticket (.jdf XML) that MIS / prepress systems read to schedule the job. Finished size ({file ? `${(file.info.widthPt / 72).toFixed(2)}×${(file.info.heightPt / 72).toFixed(2)} in, ${file.info.count} pages` : 'from the loaded PDF'}) and media size are written as intent dimensions in points.
      </div>
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
      <div style={{ gridColumn: '1 / -1', fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Tokens: <code>[page-number]</code> · <code>[file-name]</code> · <code>[timestamp:%Y-%m-%d]</code>
      </div>
    </Grid>
  );
}

function CollatingSettings({ opts, onChange }: { opts: CollatingOptions; onChange: (o: CollatingOptions) => void }) {
  const set = <K extends keyof CollatingOptions>(k: K, v: CollatingOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Spine side" note="Binding edge the marks sit on">
        <select value={opts.edge} onChange={e => set('edge', e.target.value as CollatingOptions['edge'])} style={iStyle}>
          <option value="left">Left edge</option><option value="right">Right edge</option>
        </select>
      </Field>
      <Field label="Start offset (from top, pt)"><input type="number" min={0} max={400} step={1} value={opts.startOffsetPt ?? 18} onChange={e => set('startOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark width (pt)"><input type="number" min={1} max={40} step={1} value={opts.markWpt ?? 6} onChange={e => set('markWpt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark height (pt)"><input type="number" min={1} max={40} step={1} value={opts.markHpt ?? 6} onChange={e => set('markHpt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Small marks"><Row><input type="checkbox" checked={!!opts.smallMarks} onChange={e => set('smallMarks', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Half height</span></Row></Field>
      <Field label="Pages / signature">
        <select value={opts.pagesPerSig ?? 16} onChange={e => set('pagesPerSig', +e.target.value)} style={iStyle}>
          {[4, 8, 16, 32].map(v => <option key={v} value={v}>{v}pp</option>)}
        </select>
      </Field>
      <Field label="Signatures / set" note="Staircase resets (wraps) after this many">
        <select value={opts.sigsPerSet ?? 12} onChange={e => set('sigsPerSet', +e.target.value)} style={iStyle}>
          {[8, 12, 16, 24, 32].map(v => <option key={v} value={v}>{v} sigs</option>)}
        </select>
      </Field>
      <Field label="Step size (pt)" note="Vertical distance between marks"><input type="number" min={1} max={60} step={1} value={opts.stepPt ?? 8} onChange={e => set('stepPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark colour"><input type="color" value={rgbToHex(opts.color ?? { r: 0, g: 0, b: 0 })} onChange={e => set('color', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Wrap colour" note="2nd-pass (contrasting)"><input type="color" value={rgbToHex(opts.color2 ?? { r: 0, g: 0.6, b: 0.9 })} onChange={e => set('color2', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Opacity"><input type="number" min={0.1} max={1} step={0.05} value={opts.opacity ?? 1} onChange={e => set('opacity', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages" note="all · 1-5 · odd · even · last"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        One mark per <strong>signature</strong> (page ÷ pages-per-signature), stepped down the spine. When the staircase reaches <em>signatures / set</em> it resets to the top and switches to the wrap colour so the two passes stay distinguishable — a break in the staircase reveals a mis-gathered book.
      </div>
    </Grid>
  );
}

function OmrSettings({ opts, onChange }: { opts: OmrOptions; onChange: (o: OmrOptions) => void }) {
  const set = <K extends keyof OmrOptions>(k: K, v: OmrOptions[K]) => onChange({ ...opts, [k]: v });
  const maxVal = Math.pow(2, opts.bitCount || 8) - 1;
  const bits = Array.from({ length: opts.bitCount || 8 }, (_, i) => (Math.max(0, Math.min(maxVal, opts.program)) >> ((opts.bitCount || 8) - 1 - i)) & 1);
  return (
    <Grid>
      <Field label="Edge" note="Must match the machine's sensor">
        <select value={opts.edge} onChange={e => set('edge', e.target.value as OmrOptions['edge'])} style={iStyle}>
          <option value="top">Top</option><option value="bottom">Bottom</option>
          <option value="left">Left</option><option value="right">Right</option>
        </select>
      </Field>
      <Field label="Encoding">
        <select value={opts.encoding} onChange={e => set('encoding', e.target.value as OmrOptions['encoding'])} style={iStyle}>
          <option value="binary">Binary (present = 1, absent = 0)</option>
          <option value="barheight">Bar height (long = 1, short = 0)</option>
        </select>
      </Field>
      <Field label="Program number" note={`0 – ${maxVal}`}><input type="number" min={0} max={maxVal} step={1} value={opts.program} onChange={e => set('program', Math.max(0, Math.min(maxVal, +e.target.value)))} style={iStyle} /></Field>
      <Field label="Bit count">
        <select value={opts.bitCount} onChange={e => set('bitCount', +e.target.value)} style={iStyle}>
          {[4, 8, 12, 16].map(v => <option key={v} value={v}>{v}-bit</option>)}
        </select>
      </Field>
      <Field label="Pattern (MSB→LSB)">
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', fontSize: '.72rem' }}>
          {opts.sync && <span title="sync bar" style={{ width: 12, height: 16, background: '#7c3aed', borderRadius: 2, display: 'inline-block' }} />}
          {bits.map((b, i) => <span key={i} style={{ width: 12, height: 16, background: b ? '#111' : 'transparent', border: '1px solid var(--border)', borderRadius: 2, display: 'inline-block' }} />)}
          <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{bits.join('')}</span>
        </div>
      </Field>
      <Field label="Repeats" note="Repeat the pattern down the edge"><input type="number" min={1} max={20} step={1} value={opts.repeats ?? 1} onChange={e => set('repeats', +e.target.value)} style={iStyle} /></Field>
      <Field label="Sync bar"><Row><input type="checkbox" checked={opts.sync !== false} onChange={e => set('sync', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Leading always-on mark</span></Row></Field>
      <Field label="Bar length (pt)" note="Readable length ⟂ to feed"><input type="number" min={2} max={80} step={0.5} value={opts.widthPt ?? 14.17} onChange={e => set('widthPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Bar width (pt)" note="Thin dimension along feed"><input type="number" min={0.5} max={20} step={0.25} value={opts.heightPt ?? 2.83} onChange={e => set('heightPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Spacing / pitch (pt)"><input type="number" min={2} max={80} step={0.5} value={opts.spacingPt ?? 14.17} onChange={e => set('spacingPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Start offset (pt)"><input type="number" min={0} max={400} step={1} value={opts.startOffsetPt ?? 40} onChange={e => set('startOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge offset (pt)" note="Inward from the paper edge"><input type="number" min={0} max={80} step={0.5} value={opts.edgeOffsetPt ?? 8.5} onChange={e => set('edgeOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Encodes the program number as a bar sequence read by automated bindery equipment to trigger fold / collate / cut / stack. Marks must be solid black at 100% density; the edge must match the machine's sensor position. Confirm the exact spec with your finishing vendor — patterns are manufacturer-specific.
      </div>
    </Grid>
  );
}

function GatheringSettings({ opts, onChange }: { opts: GatheringOptions; onChange: (o: GatheringOptions) => void }) {
  const set = <K extends keyof GatheringOptions>(k: K, v: GatheringOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Gripper edge" note="Leading edge of the press sheet">
        <select value={opts.edge} onChange={e => set('edge', e.target.value as GatheringOptions['edge'])} style={iStyle}>
          <option value="top">Top</option><option value="bottom">Bottom</option>
        </select>
      </Field>
      <Field label="Start offset (from left, pt)"><input type="number" min={0} max={600} step={1} value={opts.startOffsetPt ?? 18} onChange={e => set('startOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge offset (pt)" note="Clear the gripper zone (10–15 mm)"><input type="number" min={0} max={80} step={0.5} value={opts.edgeOffsetPt ?? 8} onChange={e => set('edgeOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark width (pt)"><input type="number" min={1} max={40} step={1} value={opts.markWpt ?? 6} onChange={e => set('markWpt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark height (pt)"><input type="number" min={1} max={40} step={1} value={opts.markHpt ?? 6} onChange={e => set('markHpt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages / section">
        <select value={opts.pagesPerSection ?? 16} onChange={e => set('pagesPerSection', +e.target.value)} style={iStyle}>
          {[4, 8, 16, 32].map(v => <option key={v} value={v}>{v}pp</option>)}
        </select>
      </Field>
      <Field label="Sections / set" note="Staircase resets after this many">
        <select value={opts.sectionsPerSet ?? 12} onChange={e => set('sectionsPerSet', +e.target.value)} style={iStyle}>
          {[8, 12, 16, 24, 32].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="Step size (pt)" note="Horizontal distance between marks"><input type="number" min={1} max={60} step={1} value={opts.stepPt ?? 8} onChange={e => set('stepPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Mark colour"><input type="color" value={rgbToHex(opts.color ?? { r: 0, g: 0, b: 0 })} onChange={e => set('color', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Wrap colour" note="2nd-pass (contrasting)"><input type="color" value={rgbToHex(opts.color2 ?? { r: 0, g: 0.6, b: 0.9 })} onChange={e => set('color2', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Opacity"><input type="number" min={0.1} max={1} step={0.05} value={opts.opacity ?? 1} onChange={e => set('opacity', +e.target.value)} style={iStyle} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        The gripper-edge cousin of collating marks: one mark per <strong>section</strong>, stepped <em>horizontally</em> along the leading edge (kept clear of the gripper zone). A clean staircase across the cut stack confirms correct gathering; the pattern resets and switches to the wrap colour every <em>sections / set</em>.
      </div>
    </Grid>
  );
}

function FoldMarksSettings({ opts, onChange }: { opts: FoldMarksOptions; onChange: (o: FoldMarksOptions) => void }) {
  const set = <K extends keyof FoldMarksOptions>(k: K, v: FoldMarksOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Fold scheme">
        <select value={opts.scheme} onChange={e => set('scheme', e.target.value as FoldMarksOptions['scheme'])} style={iStyle}>
          <option value="half">Half fold (bi-fold)</option>
          <option value="letter">Letter / tri-fold</option>
          <option value="zfold">Z-fold</option>
          <option value="gate">Gate fold</option>
          <option value="doubleparallel">Double parallel</option>
          <option value="roll">Roll fold</option>
          <option value="accordion">Accordion (N panels)</option>
          <option value="custom">Custom positions</option>
        </select>
      </Field>
      <Field label="Fold direction">
        <select value={opts.orientation} onChange={e => set('orientation', e.target.value as FoldMarksOptions['orientation'])} style={iStyle}>
          <option value="vertical">Vertical folds (divide width)</option>
          <option value="horizontal">Horizontal folds (divide height)</option>
        </select>
      </Field>
      {(opts.scheme === 'accordion' || opts.scheme === 'roll') && <Field label="Panels"><input type="number" min={2} max={12} step={1} value={opts.panels ?? 4} onChange={e => set('panels', +e.target.value)} style={iStyle} /></Field>}
      {opts.scheme === 'custom' && <Field label="Positions" note='"33,66" (%) · "1/3,2/3"'><input type="text" value={opts.positions ?? ''} onChange={e => set('positions', e.target.value)} style={iStyle} /></Field>}
      <Field label="Tick placement">
        <select value={opts.edge} onChange={e => set('edge', e.target.value as FoldMarksOptions['edge'])} style={iStyle}>
          <option value="both">Both ends</option>
          <option value="top">Top / right end</option>
          <option value="bottom">Bottom / left end</option>
        </select>
      </Field>
      <Field label="Line style">
        <select value={opts.style} onChange={e => set('style', e.target.value as FoldMarksOptions['style'])} style={iStyle}>
          <option value="dashed">Dashed</option><option value="solid">Solid</option><option value="dotted">Dotted</option>
        </select>
      </Field>
      <Field label="Tick length (pt)"><input type="number" min={2} max={200} step={1} value={opts.markLenPt ?? 18} onChange={e => set('markLenPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Edge offset (pt)"><input type="number" min={0} max={80} step={0.5} value={opts.offsetPt ?? 0} onChange={e => set('offsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Line weight (pt)"><input type="number" min={0.25} max={5} step={0.25} value={opts.weightPt ?? 0.75} onChange={e => set('weightPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Full guide line"><Row><input type="checkbox" checked={!!opts.fullLine} onChange={e => set('fullLine', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Across whole sheet</span></Row></Field>
      <Field label="Colour"><input type="color" value={rgbToHex(opts.color ?? { r: 0, g: 0, b: 0 })} onChange={e => set('color', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Dashed tick guides in the trim margin at each fold. <strong>Vertical</strong> folds divide the width (brochure panels); <strong>horizontal</strong> divide the height. Roll fold shrinks each panel so it tucks inside the previous; use <em>Custom</em> for exact positions.
      </div>
    </Grid>
  );
}

function LayMarksSettings({ opts, onChange }: { opts: LayMarksOptions; onChange: (o: LayMarksOptions) => void }) {
  const set = <K extends keyof LayMarksOptions>(k: K, v: LayMarksOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Mark type">
        <select value={opts.markType} onChange={e => set('markType', e.target.value as LayMarksOptions['markType'])} style={iStyle}>
          <option value="arrow">Arrow</option><option value="line">Line</option><option value="cross">Cross</option>
        </select>
      </Field>
      <Field label="Edges">
        <select value={opts.edges} onChange={e => set('edges', e.target.value as LayMarksOptions['edges'])} style={iStyle}>
          <option value="both">Both (front + side lay)</option>
          <option value="gripper">Gripper (front lay)</option>
          <option value="sideguide">Side guide (side lay)</option>
        </select>
      </Field>
      <Field label="Gripper edge" note="Leading edge (feeds first)">
        <select value={opts.gripperEdge ?? 'bottom'} onChange={e => set('gripperEdge', e.target.value as 'top' | 'bottom')} style={iStyle}>
          <option value="bottom">Bottom</option><option value="top">Top</option>
        </select>
      </Field>
      <Field label="Side guide side">
        <select value={opts.sideGuideSide} onChange={e => set('sideGuideSide', e.target.value as LayMarksOptions['sideGuideSide'])} style={iStyle}>
          <option value="left">Left</option><option value="right">Right</option>
        </select>
      </Field>
      <Field label="Mark size (pt)"><input type="number" min={2} max={80} step={0.5} value={opts.sizePt ?? 14.17} onChange={e => set('sizePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Line thickness (pt)"><input type="number" min={0.25} max={5} step={0.25} value={opts.thicknessPt ?? 0.5} onChange={e => set('thicknessPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Offset from corner (pt)"><input type="number" min={0} max={120} step={0.5} value={opts.offsetPt ?? 14.17} onChange={e => set('offsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Colour"><input type="color" value={rgbToHex(opts.color ?? { r: 0, g: 0, b: 0 })} onChange={e => set('color', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Front lay marks the gripper (leading) edge feed direction; side lay marks the guide side for lateral registration. Lay marks belong on the imposed <strong>press sheet</strong> — after imposition the gripper margin exists; on un-imposed pages the marks land inside the trim.
      </div>
    </Grid>
  );
}

const SPOT_NAMES = ['CutContour', 'Through-cut', 'ThruCut', 'Crease', 'Perf', 'KissCut', 'DieCut'];

function CutContourSettings({ opts, onChange }: { opts: CutContourOptions; onChange: (o: CutContourOptions) => void }) {
  const set = <K extends keyof CutContourOptions>(k: K, v: CutContourOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Shape">
        <select value={opts.shape} onChange={e => set('shape', e.target.value as CutContourOptions['shape'])} style={iStyle}>
          <option value="rectangle">Rectangle</option><option value="rounded">Rounded rectangle</option><option value="ellipse">Ellipse</option>
        </select>
      </Field>
      <Field label="Target box" note="Which PDF box the die line follows">
        <select value={opts.target} onChange={e => set('target', e.target.value as CutContourOptions['target'])} style={iStyle}>
          <option value="trim">Trim</option><option value="bleed">Bleed</option><option value="media">Media</option><option value="custom">Custom</option>
        </select>
      </Field>
      {opts.target === 'custom' && <>
        <Field label="Custom width (pt)"><input type="number" min={1} step={1} value={opts.customWpt ?? 216} onChange={e => set('customWpt', +e.target.value)} style={iStyle} /></Field>
        <Field label="Custom height (pt)"><input type="number" min={1} step={1} value={opts.customHpt ?? 144} onChange={e => set('customHpt', +e.target.value)} style={iStyle} /></Field>
      </>}
      <Field label="Spot colour name" note="Layer name sent to the RIP / cutter">
        <input list="spotnames" value={opts.spotName} onChange={e => set('spotName', e.target.value)} style={iStyle} />
        <datalist id="spotnames">{SPOT_NAMES.map(s => <option key={s} value={s} />)}</datalist>
      </Field>
      {opts.shape === 'rounded' && <Field label="Corner radius (pt)"><input type="number" min={0} max={120} step={0.5} value={opts.cornerRadiusPt ?? 8.5} onChange={e => set('cornerRadiusPt', +e.target.value)} style={iStyle} /></Field>}
      <Field label="Thickness (pt)"><input type="number" min={0.1} max={5} step={0.05} value={opts.thicknessPt ?? 0.25} onChange={e => set('thicknessPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Dashed"><Row><input type="checkbox" checked={!!opts.dashed} onChange={e => set('dashed', e.target.checked)} /><span style={{ fontSize: '.85rem' }}>Dashed / dotted line</span></Row></Field>
      {opts.dashed && <>
        <Field label="Dash length (pt)"><input type="number" min={0.5} max={40} step={0.5} value={opts.dashLenPt ?? 6} onChange={e => set('dashLenPt', +e.target.value)} style={iStyle} /></Field>
        <Field label="Dash gap (pt)"><input type="number" min={0.5} max={40} step={0.5} value={opts.dashGapPt ?? 3} onChange={e => set('dashGapPt', +e.target.value)} style={iStyle} /></Field>
      </>}
      <Field label="X offset (pt)" note="+ right"><input type="number" step={0.5} value={opts.xOffsetPt ?? 0} onChange={e => set('xOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Y offset (pt)" note="+ down"><input type="number" step={0.5} value={opts.yOffsetPt ?? 0} onChange={e => set('yOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Preview colour" note="Output uses the spot channel"><input type="color" value={rgbToHex(opts.previewColor ?? { r: 0.925, g: 0, b: 0.55 })} onChange={e => set('previewColor', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Adds a vector die-line path on a real <strong>Separation</strong> spot channel (named above) so a RIP or digital cutter reads it as a toolpath, not artwork. The preview colour is on-screen only. For a closed cut set the shape to enclose the trim; run Preflight to confirm the path is closed before sending to the die maker.
      </div>
    </Grid>
  );
}

function WhiteVarnishSettings({ opts, onChange }: { opts: WhiteVarnishOptions; onChange: (o: WhiteVarnishOptions) => void }) {
  const set = <K extends keyof WhiteVarnishOptions>(k: K, v: WhiteVarnishOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Spot colour name">
        <input list="wvnames" value={opts.spotName} onChange={e => set('spotName', e.target.value)} style={iStyle} />
        <datalist id="wvnames"><option value="White" /><option value="Varnish" /><option value="Gloss" /><option value="Matte" /></datalist>
      </Field>
      <Field label="Coverage">
        <select value={opts.coverage} onChange={e => set('coverage', e.target.value as WhiteVarnishOptions['coverage'])} style={iStyle}>
          <option value="flood">Flood (whole page)</option><option value="trim">Trim box</option><option value="bleed">Bleed box</option><option value="custom">Custom</option>
        </select>
      </Field>
      {opts.coverage === 'custom' && <>
        <Field label="Custom width (pt)"><input type="number" min={1} step={1} value={opts.customWpt ?? 216} onChange={e => set('customWpt', +e.target.value)} style={iStyle} /></Field>
        <Field label="Custom height (pt)"><input type="number" min={1} step={1} value={opts.customHpt ?? 144} onChange={e => set('customHpt', +e.target.value)} style={iStyle} /></Field>
      </>}
      <Field label="Layer order">
        <select value={opts.under ? 'under' : 'over'} onChange={e => set('under', e.target.value === 'under')} style={iStyle}>
          <option value="under">Under-base (behind art — white)</option>
          <option value="over">On top (varnish / gloss)</option>
        </select>
      </Field>
      <Field label="Tint" note="0–1 ink density"><input type="number" min={0} max={1} step={0.05} value={opts.tint ?? 1} onChange={e => set('tint', +e.target.value)} style={iStyle} /></Field>
      <Field label="X offset (pt)"><input type="number" step={0.5} value={opts.xOffsetPt ?? 0} onChange={e => set('xOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Y offset (pt)"><input type="number" step={0.5} value={opts.yOffsetPt ?? 0} onChange={e => set('yOffsetPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Preview colour"><input type="color" value={rgbToHex(opts.previewColor ?? { r: 0.85, g: 0.86, b: 0.92 })} onChange={e => set('previewColor', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Lays a named <strong>Separation</strong> layer (White ink or spot Varnish) as a spot-colour fill. <em>Under-base</em> prints behind the artwork (white ink for clear/metallic/dark stock); <em>on top</em> is a gloss/matte varnish over the art. The preview colour is on-screen only.
      </div>
    </Grid>
  );
}

function BrailleSettings({ opts, onChange }: { opts: BrailleOptions; onChange: (o: BrailleOptions) => void }) {
  const set = <K extends keyof BrailleOptions>(k: K, v: BrailleOptions[K]) => onChange({ ...opts, [k]: v });
  return (
    <Grid>
      <Field label="Text" note="Grade-1 (letter-for-letter)"><input type="text" value={opts.text} onChange={e => set('text', e.target.value)} style={iStyle} /></Field>
      <Field label="X position (pt)"><input type="number" step={1} value={opts.xPt ?? 72} onChange={e => set('xPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Y position (pt)" note="From bottom; blank = 1″ from top"><input type="number" step={1} value={opts.yPt ?? 0} onChange={e => set('yPt', e.target.value === '' ? undefined as unknown as number : +e.target.value)} style={iStyle} /></Field>
      <Field label="Dot diameter (pt)" note="1.5 mm ≈ 4.25"><input type="number" min={1} max={12} step={0.25} value={opts.dotDiaPt ?? 4.25} onChange={e => set('dotDiaPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Dot pitch (pt)" note="within a cell, 2.5 mm ≈ 7.09"><input type="number" min={2} max={20} step={0.25} value={opts.dotPitchPt ?? 7.09} onChange={e => set('dotPitchPt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Cell spacing (pt)" note="6 mm ≈ 17"><input type="number" min={4} max={40} step={0.5} value={opts.cellSpacePt ?? 17} onChange={e => set('cellSpacePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Line spacing (pt)" note="10 mm ≈ 28.35"><input type="number" min={6} max={60} step={0.5} value={opts.lineSpacePt ?? 28.35} onChange={e => set('lineSpacePt', +e.target.value)} style={iStyle} /></Field>
      <Field label="Spot channel" note="blank = visible ink"><input list="brspots" value={opts.spotName ?? ''} onChange={e => set('spotName', e.target.value || undefined)} style={iStyle} /><datalist id="brspots"><option value="Varnish" /><option value="Emboss" /><option value="Braille" /></datalist></Field>
      <Field label="Preview colour"><input type="color" value={rgbToHex(opts.previewColor ?? { r: 0.55, g: 0.55, b: 0.6 })} onChange={e => set('previewColor', hexToRgb(e.target.value))} style={{ ...iStyle, padding: 2, height: 34 }} /></Field>
      <Field label="Pages"><input type="text" value={opts.pages ?? 'all'} onChange={e => set('pages', e.target.value)} style={iStyle} /></Field>
      <div style={{ gridColumn: '1 / -1', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Places <strong>Grade-1</strong> (uncontracted) Braille as raised dots at ADA metrics (1.5 mm dots, 2.5 mm within-cell, 6 mm cell, 10 mm line). Digits get an automatic number sign. Target a spot channel (Emboss / Varnish) for a raised-dot plate, or leave blank to draw visible dots.
      </div>
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
  | 'pagenumbers' | 'headerfooter' | 'watermark' | 'jobslug' | 'collating'
  | 'gathering' | 'foldmarks' | 'registration' | 'cutcontour' | 'nest' | 'resize'
  | 'rotate' | 'shuffle' | 'flip' | 'dimensions' | 'barcode' | 'qrstamp'
  | 'optimize' | 'repair' | 'colormanage' | 'distort' | 'passthrough';

interface PipelineStep { kind: StepKind; label: string; opts: any; } // eslint-disable-line @typescript-eslint/no-explicit-any

const STEP_LABELS: Record<StepKind, string> = {
  preflight: 'Preflight', booklet: 'Impose booklet', nup: 'Impose / gang up', bleed: 'Generate bleed',
  colorbar: 'Add color bar', cropmarks: 'Add marks', pagenumbers: 'Add page numbers',
  headerfooter: 'Add header / footer', watermark: 'Add watermark', jobslug: 'Add job info', collating: 'Add collating marks',
  gathering: 'Add gathering marks', foldmarks: 'Add fold marks', registration: 'Add registration', cutcontour: 'Add die lines',
  nest: 'Nest / gang', resize: 'Scale to size', rotate: 'Rotate pages', shuffle: 'Cut-and-stack shuffle', flip: 'Flip / tumble',
  dimensions: 'Add dimensions', barcode: 'Add barcodes', qrstamp: 'Generate QR', optimize: 'Optimize', repair: 'Repair',
  colormanage: 'Color convert', distort: 'Apply distortion', passthrough: 'Prep step',
};

const STEP_KINDS: StepKind[] = ['preflight', 'booklet', 'nup', 'bleed', 'colorbar', 'cropmarks', 'pagenumbers', 'headerfooter', 'watermark', 'jobslug', 'collating', 'gathering', 'foldmarks', 'registration', 'cutcontour', 'nest', 'resize', 'rotate', 'shuffle', 'flip', 'barcode', 'qrstamp', 'optimize', 'repair'];

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
  gathering: () => ({ ...DEFAULT_GATHERING }),
  foldmarks: () => ({ ...DEFAULT_FOLDMARKS }),
  registration: () => ({ marginIn: 0.25, sizeIn: 0.15, style: 'target' }),
  cutcontour: () => ({ ...DEFAULT_CUTCONTOUR }),
  nest: () => ({ ...DEFAULT_NEST }),
  resize: () => ({ mode: 'scale', scalePct: 100 }),
  rotate: () => ({ angleDeg: 90 }),
  shuffle: () => ({ order: 'all' }),
  flip: () => ({ direction: 'h' }),
  dimensions: () => ({}),
  barcode: () => ({ ...DEFAULT_BARCODE }),
  qrstamp: () => ({ ...DEFAULT_QRSTAMP }),
  optimize: () => ({ objectStreams: true, removeUnused: true }),
  repair: () => ({}),
  colormanage: () => ({ ...DEFAULT_COLORMANAGE, convert: true }),
  distort: () => ({}),
  passthrough: () => ({}),
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
    case 'gathering': return addGatheringMarks(bytes, step.opts);
    case 'foldmarks': return addFoldMarks(bytes, step.opts);
    case 'registration': return addRegistrationMarks(bytes, step.opts);
    case 'cutcontour': return addCutContour(bytes, { spotName: 'CutContour', shape: 'rectangle', target: 'trim', ...step.opts });
    case 'nest': return nestPdf(bytes, step.opts);
    case 'resize': return resizePdf(bytes, step.opts);
    case 'rotate': return rotatePdf(bytes, step.opts.angleDeg ?? 90);
    case 'shuffle': return shufflePages(bytes, step.opts.order ?? 'all');
    case 'flip': return flipPdf(bytes, step.opts.direction ?? 'h');
    case 'dimensions': return addDimensions(bytes);
    case 'barcode': return addBarcodeStamp(bytes, step.opts);
    case 'qrstamp': return addQrStamp(bytes, step.opts);
    case 'optimize': return optimizePdf(bytes, step.opts);
    case 'repair': return repairPdf(bytes, step.opts);
    case 'colormanage': return applyColorManagement(bytes, step.opts);
    case 'passthrough': case 'distort': return bytes;
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
interface WorkflowDef { id: string; name: string; desc: string; Thumb: () => React.ReactElement; steps: WFStep[]; cat?: string; input?: string; tip?: string; tags?: string[]; }

// Production-recipe catalog (68 named pipelines) → WorkflowDef. `s(kind,label)`
// builds a step; a per-category default thumbnail keeps the data compact.
const CAT_THUMB: Record<string, () => React.ReactElement> = {
  'Booklets & Books': BookletThumb, 'Cards & Flat': cardThumb(2, 3), 'Labels & Stickers': gridThumb(3, 3),
  'Packaging': cardThumb(1, 1), 'Large Format': PosterThumb, 'Production Marks': MarksThumb,
  'Calendars & Specialty': BookletThumb, 'Ganging & Optimization': gridThumb(3, 2), 'Transform & Prep': RepairThumb,
};
const s = (kind: StepKind, label: string, opts?: any): WFStep => ({ kind, label, ...(opts ? { opts } : {}) }); // eslint-disable-line @typescript-eslint/no-explicit-any
function recipe(cat: string, id: string, name: string, desc: string, steps: WFStep[], input: string, tip: string, tags: string[]): WorkflowDef {
  return { id, name, desc, cat, input, tip, tags, steps, Thumb: CAT_THUMB[cat] ?? MarksThumb };
}
const RECIPES: WorkflowDef[] = [
  // ── Booklets & Books ──
  recipe('Booklets & Books', 'r-saddle', 'Saddle-Stitch Booklet', 'Standard saddle-stitched booklet — the most common short-run binding.', [s('preflight', 'Preflight'), s('booklet', 'Impose booklet'), s('cropmarks', 'Add trim marks')], 'Single PDF, sequential pages, count a multiple of 4, 3mm bleed.', 'Keep page count ≤ 64 for saddle-stitch; enable creep on stock heavier than 100gsm.', ['saddle-stitch', 'booklet', 'binding']),
  recipe('Booklets & Books', 'r-saddle-bleed', 'Saddle-Stitch with Bleeds', 'Saddle-stitch with synthetic bleed generation for artwork delivered without bleeds.', [s('preflight', 'Preflight'), s('bleed', 'Generate bleeds', { bleedIn: 0.125, mode: 'mirror' }), s('booklet', 'Impose booklet'), s('cropmarks', 'Add marks')], 'PDF at trim size (no bleed). Page count a multiple of 4.', 'Synthetic bleeds are a rescue technique, not a replacement for real bleeds — flag it on the job ticket.', ['saddle-stitch', 'bleed', 'no-bleed']),
  recipe('Booklets & Books', 'r-a5-sra3', 'A5 Saddle-Stitch 2-Up on SRA3', 'Impose A5 on SRA4 flats, then repeat two copies on SRA3.', [s('preflight', 'Preflight A5 pages'), s('booklet', 'Impose SRA4 booklet flats'), s('nup', 'Repeat 2-up on SRA3', { cols: 2, rows: 1, sheetWIn: 12.6, sheetHIn: 17.72 })], 'A5 portrait PDF, sequential reading order, preferably 3mm bleed.', 'Use Grid step-and-repeat (adapts to any booklet page count); SRA4 is exactly half of SRA3.', ['a5', 'sra3', '2-up']),
  recipe('Booklets & Books', 'r-perfect', 'Perfect-Bound Book', 'PUR/hot-melt perfect binding for books with 48+ pages.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures', { creepIn: 0 }), s('collating', 'Add collating marks'), s('cropmarks', 'Add trim marks')], 'Single PDF, sequential, 3mm bleed, CMYK. Count divisible by 8/16/32.', 'Leave 5mm extra at the spine edge for PUR milling; confirm signature count with your bindery.', ['perfect-binding', 'PUR', 'signatures']),
  recipe('Booklets & Books', 'r-perfect-cb', 'Perfect-Bound with Color Bar', 'Perfect-bound signatures with inline color bars for press density control.', [s('booklet', 'Impose signatures', { creepIn: 0 }), s('colorbar', 'Add color bars'), s('collating', 'Add collating marks'), s('cropmarks', 'Add trim marks')], 'CMYK PDF, 3mm bleed, page count divisible by 16.', 'Color bars need ≥ 8mm of non-image area along the gripper edge — verify plate size.', ['perfect-binding', 'color-bar', 'offset']),
  recipe('Booklets & Books', 'r-casebound', 'Case-Bound (Hardcover) Book', 'Smyth-sewn case-bound book with signature imposition and spine marks.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures'), s('gathering', 'Add gathering marks'), s('cropmarks', 'Add trim marks')], 'Text-block PDF, sequential, 3mm bleed, CMYK. Cover supplied separately.', 'Case-bound needs a separate cover imposition; add 3mm to the spine-side bleed for Smyth-sewing.', ['case-bound', 'hardcover', 'smyth-sewn']),
  recipe('Booklets & Books', 'r-zine', 'Zine / Mini Booklet', 'Small-format DIY zine from a single sheet (8-page or 16-page fold).', [s('resize', 'Scale pages'), s('booklet', 'Impose as booklet'), s('foldmarks', 'Add fold marks')], '8-page or 16-page PDF at final reading size.', 'For a single-sheet 8-page zine, print duplex, cut a centre slit and fold — verify with a paper dummy.', ['zine', 'mini-booklet', 'fold']),
  recipe('Booklets & Books', 'r-comic', 'Comic Book Signatures', 'Comic/graphic novel imposed in saddle-stitch or perfect-bound signatures.', [s('preflight', 'Preflight'), s('colormanage', 'Convert to CMYK'), s('booklet', 'Impose booklet'), s('cropmarks', 'Add trim marks')], 'Sequential pages at comic trim size + 3mm bleed. RGB or CMYK.', 'US comic trim is 6.625×10.25"; manga is typically B6 (128×182mm). Confirm with the publisher spec.', ['comic', 'graphic-novel', 'manga']),
  recipe('Booklets & Books', 'r-childrens', "Children's Book", 'Full-color picture book with heavy stock and case binding.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures'), s('colorbar', 'Add color bars'), s('cropmarks', 'Add trim marks')], 'Full-color CMYK PDF, min 300 DPI, 5mm bleed for board books.', "Board books need special imposition — each 'page' is two laminated sheets; confirm with the bindery.", ['childrens-book', 'picture-book', 'case-bound']),
  recipe('Booklets & Books', 'r-photobook', 'Photo Book', 'Lay-flat photo book with flush-mount or perfect binding.', [s('preflight', 'Preflight'), s('colormanage', 'Color convert'), s('booklet', 'Impose signatures'), s('cropmarks', 'Add trim marks')], 'High-res CMYK or sRGB PDF with 3mm bleed. Even page count.', 'Lay-flat requires page pairs printed as spreads — a gutter gap will ruin panoramic photos.', ['photo-book', 'lay-flat', 'flush-mount']),
  recipe('Booklets & Books', 'r-magazine', 'Magazine Production', 'Full commercial magazine with saddle-stitch or perfect binding and press marks.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures'), s('colorbar', 'Add color bars'), s('cropmarks', 'Add marks')], 'Complete magazine PDF, sequential, CMYK, 3mm bleed, fonts embedded.', 'Ads from multiple sources have inconsistent color — verify TIC does not exceed 340% for heatset web.', ['magazine', 'web-offset', 'commercial']),
  recipe('Booklets & Books', 'r-catalog', 'Catalog Signatures', 'Multi-signature catalog for perfect binding on commercial presses.', [s('booklet', 'Impose signatures'), s('gathering', 'Add gathering marks'), s('collating', 'Add collating marks'), s('cropmarks', 'Add trim marks')], 'CMYK PDF, page count divisible by signature size, 3mm bleed.', 'Large catalogs (200+ pages) benefit from 32-up if your press handles the sheet — fewer signatures = fewer errors.', ['catalog', 'signatures', 'gathering']),
  recipe('Booklets & Books', 'r-annual', 'Annual Report', 'Corporate annual report with mixed content and premium finishing.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures'), s('colorbar', 'Add color bars'), s('cropmarks', 'Add marks')], 'CMYK + spot color PDF, 3mm bleed, fonts embedded, transparency flattened.', 'If it mixes coated and uncoated stocks, impose each stock type separately and coordinate signature order.', ['annual-report', 'corporate', 'spot-color']),

  // ── Cards & Flat ──
  recipe('Cards & Flat', 'r-bizcard', 'Business Cards', 'Standard multi-up business card layout on a press sheet.', [s('nup', 'Impose cards', { cellWIn: 3.5, cellHIn: 2, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.25, gutterIn: 0.125 }), s('cropmarks', 'Add cut marks')], 'Business card PDF at trim size with 3mm bleed. Duplex as pages 1 & 2.', 'Standard sizes: 3.5×2" (US), 85×55mm (EU), 91×55mm (AU/NZ). Pull bleeds from the document.', ['business-cards', 'multi-up', 'cutting']),
  recipe('Cards & Flat', 'r-bizcard-nb', 'Business Cards (No-Bleed Rescue)', 'Business cards from artwork delivered without bleeds.', [s('bleed', 'Generate bleeds', { bleedIn: 0.125, mode: 'mirror' }), s('nup', 'Impose cards', { cellWIn: 3.5, cellHIn: 2, sheetWIn: 8.5, sheetHIn: 11 }), s('cropmarks', 'Add cut marks')], 'Business card PDF at exact trim size, no bleed.', 'Synthetic bleeds on edge-to-edge photos show mirrored artefacts — request proper bleeds when possible.', ['business-cards', 'no-bleed', 'rescue']),
  recipe('Cards & Flat', 'r-postcard', 'Postcards', 'Multi-up postcards (4×6 or A6) on press sheets.', [s('nup', 'Impose postcards', { cellWIn: 6, cellHIn: 4, sheetWIn: 13, sheetHIn: 19 }), s('cropmarks', 'Add marks')], 'Postcard PDF at trim size, front and back pages, 3mm bleed.', 'USPS requires min 3.5×5" and specific barcode clear zones for mailable postcards.', ['postcards', 'direct-mail', 'multi-up']),
  recipe('Cards & Flat', 'r-greeting', 'Greeting Cards', 'Folded greeting cards imposed for duplex printing and fold finishing.', [s('booklet', 'Impose as booklet'), s('foldmarks', 'Add fold marks'), s('cropmarks', 'Add trim marks')], '4-page PDF in reading order at final folded size with 3mm bleed.', 'Greeting cards are typically 4 pages (front, inside-L, inside-R, back) — the booklet tool reorders spreads.', ['greeting-cards', 'folded', 'score']),
  recipe('Cards & Flat', 'r-playing', 'Playing Cards', 'Full deck of playing cards imposed for sheet-fed printing.', [s('nup', 'Grid layout', { cols: 5, rows: 4, sheetWIn: 13, sheetHIn: 19 }), s('registration', 'Add registration'), s('cropmarks', 'Add cut marks')], '54 cards as individual pages, poker size (63×88mm) with 3mm bleed.', 'Playing cards need exact front-to-back registration or the back pattern reveals the face at the edges.', ['playing-cards', 'die-cut', 'registration']),
  recipe('Cards & Flat', 'r-doorhanger', 'Door Hangers', 'Multi-up door hangers with a die-cut hook hole.', [s('nup', 'Grid layout'), s('cutcontour', 'Add die contour'), s('cropmarks', 'Add marks')], 'Door hanger PDF at trim size with die-cut hook area marked. 3mm bleed.', 'Standard door hanger is 4.25×11". Use the cut-contour tool to define the hook die precisely.', ['door-hangers', 'die-cut', 'multi-up']),
  recipe('Cards & Flat', 'r-rackcard', 'Rack Cards', '4×9 inch rack cards imposed for multi-up printing.', [s('nup', 'Impose rack cards', { cellWIn: 4, cellHIn: 9, sheetWIn: 13, sheetHIn: 19 }), s('cropmarks', 'Add marks')], 'Rack card PDF at 4×9" trim size with 3mm bleed.', 'Rack cards have a narrow aspect — run the grain parallel to the long edge for stiffness.', ['rack-cards', 'display', 'multi-up']),
  recipe('Cards & Flat', 'r-numticket', 'Numbered Tickets', 'Sequential numbered tickets with cut-and-stack imposition.', [s('shuffle', 'Shuffle for cut-and-stack'), s('nup', 'Grid layout'), s('cropmarks', 'Add marks')], 'PDF with one page per ticket, sequentially numbered. Count divisible by grid cells.', 'Cut-and-stack numbering needs the shuffle order to match your guillotine cut sequence — verify with a test sheet.', ['tickets', 'numbered', 'cut-and-stack']),
  recipe('Cards & Flat', 'r-vdticket', 'Variable Data Tickets', 'Tickets with variable data (barcodes, names, seats) imposed efficiently.', [s('barcode', 'Add barcodes'), s('nup', 'Grid layout'), s('cropmarks', 'Add marks')], 'PDF with one ticket per page, each containing unique variable data.', 'Variable data tickets need each barcode unique and scannable — verify readability at final printed size.', ['tickets', 'VDP', 'barcode']),
  recipe('Cards & Flat', 'r-wedding', 'Wedding Invitations', 'Premium invitations with RSVP cards and envelopes imposed together.', [s('passthrough', 'Merge components'), s('nest', 'Gang on sheet'), s('cropmarks', 'Add marks')], 'Separate PDFs for each suite component (invite, RSVP, details), each at trim size with bleed.', 'Wedding suites often include multiple card sizes — gang them so all pieces print in the same pass with identical color.', ['wedding', 'gang', 'suite']),

  // ── Labels & Stickers ──
  recipe('Labels & Stickers', 'r-sticker-sheet', 'Sticker Sheets', 'Full sticker sheets with kiss-cut contours for peel-and-stick.', [s('nest', 'Nest stickers'), s('cutcontour', 'Add die lines', { spotName: 'KissCut', dashed: true }), s('registration', 'Add registration')], 'Individual sticker artwork as separate pages. 1mm bleed around each.', 'Kiss-cut depth penetrates the vinyl/paper but NOT the liner; keep ≥ 3mm padding for plotter tracking.', ['stickers', 'kiss-cut', 'nesting']),
  recipe('Labels & Stickers', 'r-diecut-sticker', 'Die-Cut Stickers', 'Individual die-cut stickers (through-cut, no backing sheet).', [s('nest', 'Nest stickers'), s('cutcontour', 'Add thru-cut contour', { spotName: 'ThruCut' }), s('cropmarks', 'Add marks')], 'Individual sticker designs, one per page, at final size with 1mm bleed.', 'Thru-cut on vinyl needs a slightly oversized cut path (0.5mm offset) to avoid white borders from misregistration.', ['die-cut', 'stickers', 'thru-cut']),
  recipe('Labels & Stickers', 'r-productlabel', 'Product Labels', 'Multi-up product labels for bottles, jars and boxes.', [s('nup', 'Grid layout'), s('colorbar', 'Add color bar'), s('cutcontour', 'Add die marks')], 'Label PDF at flat die size with 2mm bleed. CMYK + spot if brand-critical.', 'Labels for curved surfaces (bottles) need distortion compensation — confirm values with the applicator vendor.', ['product-labels', 'bottles', 'brand']),
  recipe('Labels & Stickers', 'r-shipping', 'Shipping Labels', 'Shipping labels (4×6") on self-adhesive A4/Letter sheets.', [s('nup', 'Grid layout', { cellWIn: 6, cellHIn: 4 }), s('barcode', 'Add barcodes')], '4×6" label PDF per shipment, one page per label.', 'Shipping labels are usually thermal-printed; for offset/digital use a label-stock template and align to the die exactly.', ['shipping', 'barcode', 'logistics']),
  recipe('Labels & Stickers', 'r-address', 'Address Labels', 'Avery-style address labels on standard label sheets.', [s('nup', 'Grid layout', { cellWIn: 2.625, cellHIn: 1, sheetWIn: 8.5, sheetHIn: 11, marginIn: 0.1875, addMarks: false }), s('cropmarks', 'Add guides', { markLenIn: 0.1 })], 'Individual label content, one per page, at the Avery cell size.', 'Pre-die-cut label stock needs exact registration — test-print on plain paper and hold against a sheet first.', ['address-labels', 'Avery', 'mail-merge']),
  recipe('Labels & Stickers', 'r-vinyl', 'Vinyl Stickers', 'Outdoor-rated vinyl stickers with laminate overprint and contour cut.', [s('nest', 'Nest on material'), s('cutcontour', 'Add cut contour'), s('registration', 'Add registration')], 'Sticker artwork on transparent background (PNG/PDF) at final size.', 'For outdoor vinyl add a 2mm white border to prevent edge peel; use solvent or UV-cure inks only.', ['vinyl', 'outdoor', 'contour-cut']),
  recipe('Labels & Stickers', 'r-qrlabel', 'QR Code Labels', 'Unique QR code labels for product tracking or authentication.', [s('qrstamp', 'Generate QR codes'), s('nup', 'Grid layout'), s('cropmarks', 'Add marks')], 'One QR code per page, or a data file for batch generation. Label size specified.', 'QR codes need min 15mm at print resolution; add error-correction level H (30%) for labels that may get scratched.', ['QR-code', 'labels', 'tracking']),
  recipe('Labels & Stickers', 'r-coaster', 'Coasters', 'Printed coasters (round or square) imposed for die cutting.', [s('nup', 'Grid layout'), s('cutcontour', 'Add die contour', { shape: 'ellipse' }), s('cropmarks', 'Add marks')], 'Coaster artwork at die size (typically 95mm round/square) with 3mm bleed.', 'Coaster board (1.4mm pulpboard) absorbs ink differently — reduce TIC to 280% and expect color shift.', ['coasters', 'die-cut', 'pulpboard']),

  // ── Packaging ──
  recipe('Packaging', 'r-box', 'Box Layout', 'Folding carton box flat (die-line) with artwork positioned for die cutting.', [s('passthrough', 'Apply die template'), s('cutcontour', 'Add cut contour'), s('cropmarks', 'Add marks')], 'Flat artwork matching the die-line exactly. Die-line supplied as a separate overlay PDF.', "Always work from the die-maker's approved CAD file — even 0.5mm off can jam the gluing machine.", ['box', 'folding-carton', 'die-line']),
  recipe('Packaging', 'r-labelwrap', 'Label Wrap', 'Wraparound labels for bottles/cans/tubes with distortion compensation.', [s('distort', 'Apply distortion'), s('nup', 'Multi-up layout'), s('cropmarks', 'Add marks')], 'Flat label artwork at unwrapped dimensions with 2mm bleed. Specify diameter.', 'distortion% = (thickness / (diameter/2 + thickness)) × 100. Round containers need only circumferential distortion.', ['label-wrap', 'bottle', 'distortion']),
  recipe('Packaging', 'r-corrugated', 'Corrugated Packaging', 'Large-format corrugated box or display printed on flatbed or flexo.', [s('distort', 'Flexo distortion'), s('colormanage', 'Color convert'), s('cropmarks', 'Add marks')], 'Artwork on the corrugated die flat. Spot colors preferred. Verify flute direction.', 'Corrugated print is low resolution (65-100 LPI) — simplify halftones, min type 8pt, avoid reverses < 10pt.', ['corrugated', 'flexo', 'large-format']),
  recipe('Packaging', 'r-bag', 'Bag Layout', 'Paper or poly bag printed flat and imposed for production.', [s('passthrough', 'Apply bag template'), s('nup', 'Multi-up'), s('cropmarks', 'Add marks')], 'Flat bag artwork with fold lines marked. Gusset panels if applicable.', 'Bag printing wraps around fold edges; side gusset panels are often printed in mirror — verify with a folding dummy.', ['bag', 'poly-bag', 'packaging']),
  recipe('Packaging', 'r-sleeve', 'Sleeve / Band', 'Shrink sleeves or belly bands for product packaging.', [s('distort', 'Shrink distortion'), s('nup', 'Multi-up layout'), s('registration', 'Add registration')], 'Flat sleeve artwork at pre-shrink dimensions. Specify shrink material and container.', 'Shrink sleeves distort differently circumferentially vs vertically — get the exact shrink ratios from your converter.', ['sleeve', 'shrink-sleeve', 'gravure']),
  recipe('Packaging', 'r-envelope', 'Envelope Layout', 'Printed envelopes imposed for flatbed or rotary die cutting.', [s('passthrough', 'Apply envelope template'), s('nup', 'Multi-up'), s('cutcontour', 'Add die lines')], 'Envelope artwork on the flat die layout with fold flaps. Die template as overlay.', 'Envelope flaps must be oriented for the fold direction — print on the inside of the flap if the design wraps the seal.', ['envelope', 'die-cut', 'mail']),

  // ── Large Format ──
  recipe('Large Format', 'r-poster', 'Poster Tiling', 'Large poster split into printable tiles with overlap for assembly.', [s('passthrough', 'Split into tiles'), s('cropmarks', 'Add marks')], 'Single-page PDF at full poster size (e.g. 24×36" or A0). 150-300 DPI.', 'Use 10-15mm overlap between tiles; align the tile grid to avoid splitting faces/text across a seam.', ['poster', 'tiling', 'assembly']),
  recipe('Large Format', 'r-banner', 'Banner Printing', 'Wide-format banners with tiling for roll-fed printers.', [s('resize', 'Scale to size'), s('passthrough', 'Tile if needed'), s('cropmarks', 'Add marks')], 'Single PDF at final banner size or at 1/4 scale. Specify dimensions.', 'Banners viewed at 3+ metres need only 72-100 DPI; vinyl banners need a 25mm hemming allowance.', ['banner', 'wide-format', 'vinyl']),
  recipe('Large Format', 'r-signage', 'Signage Repeat', 'Repeated signage (shelf talkers, aisle signs) ganged on large-format sheets.', [s('nup', 'Step-and-repeat'), s('cropmarks', 'Add cut marks')], 'Single sign PDF at trim size with 3mm bleed. Specify substrate sheet dimensions.', 'For rigid substrates add 3mm bleed beyond the cut; the CNC router kerf is 2-3mm — account for it in gutters.', ['signage', 'step-and-repeat', 'rigid']),
  recipe('Large Format', 'r-tradeshow', 'Trade Show Panels', 'Multi-panel trade show displays split for separate printing and assembly.', [s('passthrough', 'Split into panels'), s('resize', 'Scale panels'), s('cropmarks', 'Add guides')], 'Full continuous artwork at the assembled display size. Specify frame system + panel count.', 'Trade-show frame systems have pockets that add 25-50mm per side — get exact frame specs before sizing panels.', ['trade-show', 'panels', 'display']),
  recipe('Large Format', 'r-floor', 'Floor Graphics', 'Floor decals and wayfinding graphics with contour cutting.', [s('resize', 'Scale to size'), s('cutcontour', 'Add cut contour'), s('registration', 'Add registration')], 'Floor graphic artwork at final size. Include 10mm bleed for contour shapes.', 'Floor graphics must be laminated with anti-slip overlaminate (ASTM D2047) — always specify the laminate.', ['floor-graphics', 'contour-cut', 'safety']),
  recipe('Large Format', 'r-vehicle', 'Vehicle Wrap', 'Vehicle wrap panels split for contour-cut application.', [s('passthrough', 'Split into panels'), s('resize', 'Verify scale'), s('cropmarks', 'Add panel marks')], 'Full vehicle artwork on a professional template. Panels pre-separated or as one flat.', 'Vehicle wraps need 50-75mm extra per panel for wrapping edges — use a professional template, not hand-measured.', ['vehicle-wrap', 'vinyl', 'large-format']),

  // ── Production Marks ──
  recipe('Production Marks', 'r-fullmarks', 'Full Press Marks', 'Complete press mark set for commercial offset production.', [s('cropmarks', 'Crop & fold marks'), s('registration', 'Registration targets'), s('colorbar', 'Color control bar'), s('jobslug', 'Job info slug')], 'Already-imposed press sheet PDF ready for mark application.', 'Standard mark set for any commercial offset job — place marks ≥ 3mm from trim and keep them from overlapping.', ['press-marks', 'offset', 'registration']),
  recipe('Production Marks', 'r-digitalready', 'Digital Press Ready', 'Mark set optimized for digital presses (HP Indigo, Xerox iGen).', [s('cropmarks', 'Trim marks'), s('colorbar', 'Color bar')], 'Imposed PDF, any tool. CMYK with transparency flattened.', 'Digital presses have built-in registration — focus on color bars and trim marks to keep the DFE file simple.', ['digital-press', 'HP-Indigo', 'Xerox']),
  recipe('Production Marks', 'r-offsetready', 'Offset Press Ready', 'Full offset press preparation with all required finishing marks.', [s('cropmarks', 'Full trim marks'), s('registration', 'Registration marks'), s('colorbar', 'Color bar'), s('passthrough', 'Lay marks')], 'Imposed press-sheet PDF, CMYK, transparency flattened, fonts embedded.', 'Verify the plate accommodates all marks — on CTP workflows marks are often added by the CTP software.', ['offset', 'CTP', 'commercial-print']),
  recipe('Production Marks', 'r-saddlefinish', 'Saddle-Stitch Finishing Marks', 'Finishing marks specifically for saddle-stitch bindery operations.', [s('cropmarks', 'Trim marks'), s('foldmarks', 'Fold marks'), s('collating', 'Collating marks')], 'Imposed saddle-stitch signatures, ready for finishing marks.', 'The saddle-stitch line reads collating marks optically — ensure high contrast and consistent placement.', ['saddle-stitch', 'finishing', 'collating']),
  recipe('Production Marks', 'r-pbfinish', 'Perfect Bind Finishing Marks', 'Finishing marks for perfect binding with gathering verification.', [s('cropmarks', 'Trim marks'), s('gathering', 'Gathering marks'), s('passthrough', 'OMR marks')], 'Imposed perfect-bind signatures with known signature thickness.', 'OMR and gathering marks serve different purposes — gathering is visual, OMR is machine-verified. Use both on high-volume runs.', ['perfect-bind', 'gathering', 'OMR']),
  recipe('Production Marks', 'r-diecutmarks', 'Die-Cut Production Marks', 'Complete die-cutting mark set for labels, stickers and packaging.', [s('cutcontour', 'Die contour'), s('registration', 'Registration marks'), s('cropmarks', 'Sheet marks')], 'Artwork with die-line paths on separate spot-color layers, imposed on the press sheet.', 'Use industry layer naming: CutContour, KissCut, Crease, Perforation — automated cutters recognise these from the metadata.', ['die-cut', 'contour', 'packaging']),
  recipe('Production Marks', 'r-proofwm', 'Watermarked Proof', 'Draft proof with watermark and job info for client approval.', [s('watermark', 'Add watermark', { text: 'PROOF', opacity: 0.15 }), s('jobslug', 'Add proof info')], 'Any PDF at any stage. This is a proofing overlay, not production output.', 'Always watermark proofs before sending to clients — an unwatermarked proof has reached press in every shop.', ['proof', 'watermark', 'approval']),
  recipe('Production Marks', 'r-brandedproof', 'Branded Proof', "Client proof with your shop's branding, job info and color patches.", [s('watermark', 'Add proof watermark', { text: 'PROOF' }), s('headerfooter', 'Add header/footer'), s('colorbar', 'Add reference bar')], 'PDF to be proofed, at any stage of production.', "Include your shop's ICC profile name in the footer so the client can identify the proofing condition.", ['proof', 'branded', 'approval']),

  // ── Calendars & Specialty ──
  recipe('Calendars & Specialty', 'r-wallcal', 'Wall Calendar', '12-month wall calendar with saddle-stitch or wire-o binding.', [s('passthrough', 'Generate calendar'), s('booklet', 'Impose for binding'), s('cropmarks', 'Add marks')], '13-page PDF (cover + 12 months) in landscape with 3mm bleed.', 'Wall calendars need a hanging hole — add a drill mark top-center; wire-o is preferred so pages lay flat.', ['calendar', 'wall-calendar', 'wire-o']),
  recipe('Calendars & Specialty', 'r-deskcal', 'Desk Calendar', 'Desk tent calendar with fold-and-stand construction.', [s('passthrough', 'Generate calendar'), s('nup', 'Impose as cards'), s('foldmarks', 'Add fold marks')], '13-page PDF at the flat (unfolded) desk size with 3mm bleed.', 'Desk calendars fold in half to stand — the base half is usually blank; ensure front/back align for the fold.', ['calendar', 'desk-calendar', 'tent']),
  recipe('Calendars & Specialty', 'r-planner', 'Planner / Diary', 'Wire-o or perfect-bound planner with weekly/daily layouts.', [s('preflight', 'Preflight'), s('booklet', 'Impose signatures'), s('cropmarks', 'Add marks')], 'Complete planner PDF, sequential, 3mm bleed. Count divisible by signature size.', 'Wire-o planners need a 12mm margin on the bind side for wire holes; perfect-bound need 5mm spine milling.', ['planner', 'diary', 'wire-o']),
  recipe('Calendars & Specialty', 'r-menu', 'Restaurant Menu', 'Folded restaurant menu (bi-fold, tri-fold, or booklet).', [s('booklet', 'Impose as booklet'), s('foldmarks', 'Add fold marks'), s('cropmarks', 'Add trim marks')], 'Menu PDF in reading-order pages, final folded size with 3mm bleed.', 'Menus on heavy stock (300gsm+) must be scored before folding or the paper cracks — add scoring marks.', ['menu', 'restaurant', 'score']),
  recipe('Calendars & Specialty', 'r-newsletter', 'Newsletter', 'Folded newsletter (4-8 pages) for mailing or distribution.', [s('booklet', 'Impose booklet'), s('headerfooter', 'Add mailing panel'), s('cropmarks', 'Add marks')], '4-page or 8-page newsletter PDF in reading order, folded size, 3mm bleed.', 'For self-mailers the address panel must meet USPS regulations: clear zone around the barcode, correct fold-edge placement.', ['newsletter', 'self-mailer', 'mailing']),
  recipe('Calendars & Specialty', 'r-envprod', 'Envelope Production', 'Printed envelopes imposed and prepared for envelope-making machinery.', [s('passthrough', 'Apply die template'), s('nup', 'Multi-up'), s('cropmarks', 'Add marks')], 'Flat envelope artwork on the die-maker template with fold flaps.', 'Window envelopes need the window precisely registered to the letter fold — test with the actual insert.', ['envelope', 'die-cut', 'production']),

  // ── Ganging & Optimization ──
  recipe('Ganging & Optimization', 'r-mixedgang', 'Mixed Gang Run', 'Multiple different jobs ganged on a single press sheet for cost efficiency.', [s('passthrough', 'Merge jobs'), s('nest', 'Gang on sheet'), s('cropmarks', 'Add marks')], 'Multiple job PDFs at their individual trim sizes with bleed. Same stock and coating.', 'Gang runs share ink density — group items with similar color requirements (e.g. all warm tones together).', ['gang', 'multi-job', 'cost-saving']),
  recipe('Ganging & Optimization', 'r-gangfull', 'Gang Run with Full Marks', 'Ganged production sheet with complete finishing marks for commercial press.', [s('nest', 'Gang items'), s('colorbar', 'Add color bar'), s('cropmarks', 'Add all marks'), s('jobslug', 'Add job info')], 'Multiple production-ready PDFs, trimmed to final size with 3mm bleed. Same substrate.', 'Number each ganged item in the slug so the cutter operator can verify all pieces after cutting.', ['gang', 'full-marks', 'commercial']),
  recipe('Ganging & Optimization', 'r-expertcustom', 'Expert Custom Imposition', 'Fully custom imposition using Expert Grid for non-standard layouts.', [s('passthrough', 'Custom grid layout'), s('cropmarks', 'Add marks')], 'Source pages ready for custom positioning. Know your press sheet size and grid requirements.', 'Expert Grid is the escape hatch for layouts no standard tool handles — plan your grid on paper first.', ['expert', 'custom', 'imposition']),
  recipe('Ganging & Optimization', 'r-expertfinish', 'Expert Grid with Finishing', 'Custom Expert Grid imposition with full finishing marks.', [s('passthrough', 'Custom layout'), s('colorbar', 'Add color bar'), s('cropmarks', 'Add marks'), s('registration', 'Add registration')], 'Source pages and a detailed imposition plan (grid spec, gutter widths, rotations).', 'Verify finishing marks do not overlap the grid cells — custom gutters may be narrower than the mark footprint.', ['expert', 'finishing', 'production']),
  recipe('Ganging & Optimization', 'r-cutstacknum', 'Cut-and-Stack Numbering', 'Sequential numbering with cut-and-stack page ordering for tickets, NCR or raffle books.', [s('shuffle', 'Cut-and-stack shuffle'), s('nup', 'Grid layout'), s('cropmarks', 'Add marks')], 'PDF with one page per numbered item, sequentially numbered. Count = grid cells × sheet count.', 'The shuffle order MUST match your cutting sequence (top-to-bottom then left-to-right). Verify a test sheet first.', ['cut-and-stack', 'numbering', 'NCR']),

  // ── Transform & Prep ──
  recipe('Transform & Prep', 'r-printready', 'Print-Ready Preparation', 'Standard pre-flight and preparation workflow for incoming files.', [s('preflight', 'Preflight check'), s('colormanage', 'Color convert'), s('optimize', 'Optimize')], 'Any incoming PDF from a client or designer. No specific format required.', 'First-pass workflow for every incoming file — run preflight first, then convert and optimize. Never skip preflight.', ['preflight', 'print-ready', 'first-pass']),
  recipe('Transform & Prep', 'r-preflightfix', 'Preflight and Fix', 'Identify and repair common PDF issues before production.', [s('preflight', 'Identify issues'), s('repair', 'Repair PDF'), s('optimize', 'Optimize')], 'Problematic PDF that crashes, shows errors, or renders incorrectly.', 'If repair fails the file may be too damaged — re-save as PDF/X in Acrobat, or distill from PostScript as a last resort.', ['preflight', 'repair', 'troubleshoot']),
  recipe('Transform & Prep', 'r-multimerge', 'Multi-File Merge', 'Merge multiple source files into a single document for unified processing.', [s('passthrough', 'Merge files'), s('resize', 'Normalize size')], 'Multiple PDFs to be combined. Specify the desired page order.', 'Merge order becomes page order — double-check the sequence; convert to a common color profile before merging.', ['merge', 'multi-file', 'consolidate']),
  recipe('Transform & Prep', 'r-duplex', 'Duplex Interleave', 'Interleave separate front and back files for duplex printing.', [s('passthrough', 'Interleave fronts and backs'), s('resize', 'Normalize dimensions')], 'Two PDFs: one with all fronts, one with all backs. Both must have the same page count.', 'If the back file is in reverse order (common from scanning), reverse it first — one page off cascades through the whole job.', ['duplex', 'interleave', 'two-sided']),
  recipe('Transform & Prep', 'r-worktumble', 'Work and Tumble', 'Flip backup for the work-and-tumble duplex printing method.', [s('flip', 'Flip for tumble', { direction: 'v' }), s('cropmarks', 'Add marks')], 'Imposed front-side sheet ready for tumble backup creation.', 'Work-and-tumble flips along the short edge; work-and-turn along the long edge — the wrong flip mirrors the backs.', ['work-and-tumble', 'duplex', 'flip']),
  recipe('Transform & Prep', 'r-landscape', 'Landscape Rotation', 'Rotate pages from portrait to landscape (or vice versa) for press feed direction.', [s('rotate', 'Rotate pages', { angleDeg: 90 }), s('passthrough', 'Verify dimensions')], 'PDF with pages in the wrong orientation for the target press.', 'Confirm rotation direction (CW vs CCW) with a test page — the wrong rotation puts the gripper edge on the wrong side.', ['rotate', 'landscape', 'orientation']),
  recipe('Transform & Prep', 'r-flexo', 'Flexo Distortion', 'Pre-distort artwork for flexographic plate mounting on cylinders.', [s('distort', 'Apply distortion'), s('colormanage', 'Convert to flexo profile'), s('registration', 'Add registration')], 'Artwork at 1:1 undistorted size. Specify plate thickness and cylinder repeat length.', 'D% = (plate thickness × π / repeat length) × 100. Always get these values from the plate maker.', ['flexo', 'distortion', 'plate']),
];

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

// Base chained workflows + the 68 production recipes, rendered together.
const ALL_WORKFLOWS: WorkflowDef[] = [...WORKFLOWS, ...RECIPES];
const RECIPE_CATS = ['Booklets & Books', 'Cards & Flat', 'Labels & Stickers', 'Packaging', 'Large Format', 'Production Marks', 'Calendars & Specialty', 'Ganging & Optimization', 'Transform & Prep'];

function buildSteps(wf: WorkflowDef): PipelineStep[] {
  return wf.steps.map(st => ({ kind: st.kind, label: st.label, opts: { ...stepDefaults[st.kind](), ...(st.opts || {}) } }));
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
        <span style={{ display: 'inline-block', padding: '.12rem .5rem', borderRadius: 4, background: 'var(--accent-soft)', color: VIOLET, fontSize: '.66rem', fontWeight: 800, letterSpacing: '.06em', marginBottom: '.5rem' }}>
          {wf.steps.length}-STEP CHAIN
        </span>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{wf.name}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.75rem', lineHeight: 1.4 }}>{wf.desc}</div>
        <div style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '.4rem' }}>How to make this</div>
        <ol style={{ listStyle: 'none', margin: '0 0 1rem', padding: 0, display: 'grid', gap: '.3rem' }}>
          {wf.steps.map((s, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 9, background: 'var(--accent-soft)', color: VIOLET, fontSize: '.68rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
        {wf.tip && (
          <div style={{ display: 'flex', gap: '.4rem', padding: '.55rem .7rem', marginBottom: '.75rem', borderRadius: 6, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)', fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.45 }}>
            <span style={{ color: '#3b82f6' }}>💡</span><span>{wf.tip}</span>
          </div>
        )}
        {wf.input && <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: '.6rem', lineHeight: 1.45 }}><strong style={{ color: 'var(--fg)' }}>Input:</strong> {wf.input}</div>}
        {wf.tags && wf.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.85rem' }}>
            {wf.tags.map(t => <span key={t} style={{ fontSize: '.66rem', padding: '.1rem .4rem', borderRadius: 4, background: 'var(--bg-alt)', color: 'var(--muted)' }}>{t}</span>)}
          </div>
        )}
        <button onClick={onSelect} style={{ width: '100%', padding: '.6rem', border: 'none', borderRadius: 8, background: VIOLET, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.9rem' }}>
          Make this →
        </button>
      </div>
    </div>
  );
}

function WorkflowChains({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <section>
      <SectionHeading title="Production recipes" count={ALL_WORKFLOWS.length} />
      <p style={{ color: 'var(--muted)', margin: '-0.5rem 0 1.5rem', maxWidth: 720, fontSize: '.9rem', lineHeight: 1.5 }}>
        Step-by-step workflows for common print products, authored from a prepress perspective. Click “Make this”
        to load the whole chain into the pipeline, ready to configure and run.
      </p>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '.75rem' }}>Starter chains</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '1rem' }}>
          {WORKFLOWS.map(wf => <WorkflowCard key={wf.id} wf={wf} onSelect={() => onSelect(wf.id)} />)}
        </div>
      </div>
      {RECIPE_CATS.map(cat => {
        const items = RECIPES.filter(r => r.cat === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: '.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>{cat} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({items.length})</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '1rem' }}>
              {items.map(wf => <WorkflowCard key={wf.id} wf={wf} onSelect={() => onSelect(wf.id)} />)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function WorkflowBuilderSection({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <section>
      <SectionHeading title="Workflow" />
      <p style={{ color: 'var(--muted)', margin: '-0.5rem 0 1rem', maxWidth: 680, fontSize: '.9rem', lineHeight: 1.5 }}>
        Build your own pipeline — start empty and add any operations in the order you want. Each step feeds
        the next, then exports one print-ready PDF.
      </p>
      <button
        onClick={() => onSelect('__custom__')}
        style={{ padding: '.65rem 1.25rem', border: `1px solid ${VIOLET}`, borderRadius: 8, background: 'transparent', color: VIOLET, fontWeight: 700, cursor: 'pointer', fontSize: '.9rem' }}
      >
        + New custom workflow
      </button>
    </section>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: 'var(--accent-soft)', color: VIOLET, fontSize: '.75rem', fontWeight: 800 }}>{i + 1}</span>
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
  'Imposition & layout', 'Booklets & books', 'Cards & labels',
  'Folding', 'Large & specialty', 'Tickets & data', 'Marks & prepress', 'Page & PDF tools',
];

// Section heading used across the one-page gallery (tools + workflows).
function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', margin: '0 0 1.25rem', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink)' }}>{title}</h3>
      {count != null && <span style={{ color: 'var(--muted)', fontSize: '.85rem', fontWeight: 600 }}>{count}</span>}
    </div>
  );
}

function ToolGallery({ query, filter, onSelect }: { query: string; filter: string | null; onSelect: (id: string) => void }) {
  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: ToolDef) => (!q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
      || t.tags.some(tag => tag.toLowerCase().includes(q)) || t.category.toLowerCase().includes(q))
      && (!filter || t.category === filter);
    const map = new Map<string, ToolDef[]>();
    for (const t of TOOLS) {
      if (!match(t)) continue;
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [query, filter]);

  if (!categories.length) {
    return <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>No tools match {query ? `“${query}”` : 'this filter'}.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '2.75rem' }}>
      {categories.map(([cat, tools]) => (
        <section key={cat}>
          <SectionHeading title={cat} count={tools.length} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '1rem' }}>
            {tools.map(t => <ToolCard key={t.id} tool={t} onSelect={() => onSelect(t.id)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Template gallery ──────────────────────────────────────────────────────────

function TemplateGallery({ query, onSelect }: { query: string; onSelect: (tpl: TemplateDef) => void }) {
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: TemplateDef) => !q || t.name.toLowerCase().includes(q)
      || t.specs.toLowerCase().includes(q) || t.industry.toLowerCase().includes(q);
    const map = new Map<string, TemplateDef[]>();
    for (const t of TEMPLATES) {
      if (!match(t)) continue;
      if (!map.has(t.industry)) map.set(t.industry, []);
      map.get(t.industry)!.push(t);
    }
    return TEMPLATE_INDUSTRIES.filter(i => map.has(i)).map(i => [i, map.get(i)!] as const);
  }, [query]);

  if (!groups.length) {
    return <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>No templates match {query ? `“${query}”` : 'this filter'}.</div>;
  }

  return (
    <section>
      <SectionHeading title="Templates" count={TEMPLATES.length} />
      <p style={{ margin: '-.5rem 0 1.75rem', color: 'var(--muted)', fontSize: '.9rem', maxWidth: 640 }}>
        Ready-made, industry-grouped presets. Pick one and it opens the matching tool with the sheet,
        bleed, gutters and finishing marks already dialled in — just drop your file and export.
      </p>
      <div style={{ display: 'grid', gap: '2.25rem' }}>
        {groups.map(([industry, items]) => (
          <div key={industry}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.09em', color: VIOLET, textTransform: 'uppercase', marginBottom: '.85rem' }}>
              {industry} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {items.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px,1fr))', gap: '.75rem' }}>
              {items.map(t => <TemplateCard key={t.id} tpl={t} onSelect={() => onSelect(t)} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateCard({ tpl, onSelect }: { tpl: TemplateDef; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  const tool = TOOLS.find(t => t.id === tpl.toolId);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onSelect}
      style={{
        display: 'flex', flexDirection: 'column', gap: '.55rem', padding: '.85rem .9rem', cursor: 'pointer',
        borderRadius: 10, border: `1px solid ${hover ? VIOLET : 'var(--border)'}`, background: 'var(--bg-alt)',
        boxShadow: hover ? '0 6px 18px rgba(124,58,237,0.14)' : 'none', transition: 'all .13s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
        <div style={{ width: 40, height: 30, flexShrink: 0, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-alt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tool ? <tool.Thumb /> : null}
        </div>
        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--ink)', lineHeight: 1.2 }}>{tpl.name}</div>
      </div>
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>{tpl.specs}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '.35rem' }}>
        <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>via {tool?.name ?? tpl.toolId}</span>
        <span style={{ fontSize: '.76rem', fontWeight: 700, color: VIOLET }}>{hover ? 'Open →' : 'Use'}</span>
      </div>
    </div>
  );
}

// Generic "how to make this" steps shown on every ready-to-use tool card.
function toolHowTo(tool: ToolDef): string[] {
  return [
    'Drop or select your PDF',
    `Loads ${tool.preset ?? tool.name}, pre-configured`,
    'Adjust the sheet, bleed, gutters & marks if needed',
    'Preview, then export a print-ready PDF',
  ];
}

function ReadyBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '.12rem .5rem', borderRadius: 4, background: 'var(--accent-soft)', color: VIOLET, fontSize: '.62rem', fontWeight: 800, letterSpacing: '.06em', marginBottom: '.5rem' }}>
      <span style={{ fontSize: '.7rem', lineHeight: 1 }}>•</span> READY TO USE
    </span>
  );
}

function HowToList({ steps }: { steps: string[] }) {
  return (
    <>
      <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', margin: '.25rem 0 .4rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
        <span style={{ color: VIOLET }}>✓</span> How to make this
      </div>
      <ol style={{ listStyle: 'none', margin: '0 0 1rem', padding: 0, display: 'grid', gap: '.3rem' }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.35 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 8, background: 'var(--accent-soft)', color: VIOLET, fontSize: '.62rem', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </>
  );
}

function ToolCard({ tool, onSelect }: { tool: ToolDef; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onSelect}
      style={{
        border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: 'var(--bg)', cursor: 'pointer',
        transition: 'all .15s', boxShadow: hover ? '0 6px 20px rgba(0,0,0,.1)' : 'none',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ height: 150, background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', padding: '1.25rem', overflow: 'hidden' }}>
        <tool.Thumb />
      </div>
      <div style={{ padding: '.9rem 1.1rem 1.1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <ReadyBadge />
        <div style={{ fontWeight: 700, marginBottom: '.2rem', fontSize: '1.02rem' }}>
          {tool.name}{tool.badge && <span style={{ color: '#f59e0b', marginLeft: '.35rem' }}>{tool.badge}</span>}
        </div>
        <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: '.7rem', lineHeight: 1.4 }}>{tool.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.85rem' }}>
          {tool.tags.map(tag => <Chip key={tag} label={tag} />)}
        </div>
        <HowToList steps={toolHowTo(tool)} />
        <button
          onClick={onSelect}
          style={{ marginTop: 'auto', width: '100%', padding: '.6rem', border: 'none', borderRadius: 8, background: VIOLET, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.9rem' }}
        >
          Make this →
        </button>
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

const GALLERY_CHIPS = ['All', 'Templates', 'Chained workflows', ...CATEGORY_ORDER, 'Workflow', 'Calculators'];

const HOW_TO_STEPS: [string, string][] = [
  ['01', 'Drop or select your PDF'],
  ['02', 'Pick a layout or tool'],
  ['03', 'Set the sheet, bleed, gutters & marks — or load a template'],
  ['04', 'Preview live and export a print-ready PDF'],
];

export function AdminImpose() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TemplateDef | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  // Loaded file lives here so it survives switching tools via the rail.
  const [file, setFile] = useState<LoadedFile | null>(null);
  const toolDef = TOOLS.find(t => t.id === activeTool);

  const handleSelect = (id: string) => { setActiveTemplate(null); setActiveTool(id); };
  const handleSelectTemplate = (tpl: TemplateDef) => { setActiveTemplate(tpl); setActiveTool(tpl.toolId); };

  const shell = (node: React.ReactNode, wide = false) => (
    <div style={{ ...THEMES[theme], background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' } as React.CSSProperties}>
      <div style={{ padding: wide ? '1.25rem 1.5rem 3rem' : '2rem 2rem 4rem', maxWidth: wide ? 1680 : 1120, margin: '0 auto' }}>{node}</div>
    </div>
  );

  // A tool or workflow workspace takes over the whole page (full desktop width).
  if (activeTool && toolDef) {
    const preset = activeTemplate && activeTemplate.toolId === toolDef.id ? activeTemplate.preset : undefined;
    return shell(
      <ToolWorkspace
        key={toolDef.id + (activeTemplate?.id ?? '')}
        tool={toolDef}
        preset={preset}
        file={file}
        onFile={setFile}
        onSelectTool={handleSelect}
        onBack={() => { setActiveTool(null); setActiveTemplate(null); }}
      />,
      true,
    );
  }
  if (activeWorkflow) {
    return shell(
      <PipelineWorkspace
        key={activeWorkflow}
        workflow={activeWorkflow === '__custom__' ? null : (ALL_WORKFLOWS.find(w => w.id === activeWorkflow) ?? null)}
        onBack={() => setActiveWorkflow(null)}
      />
    );
  }

  const searching = query.trim().length > 0;
  let content: React.ReactNode;
  if (searching) {
    content = (
      <div style={{ display: 'grid', gap: '2.75rem' }}>
        <ToolGallery query={query} filter={null} onSelect={handleSelect} />
        <TemplateGallery query={query} onSelect={handleSelectTemplate} />
      </div>
    );
  } else if (filter === 'Calculators') {
    content = <Calculators />;
  } else if (filter === 'Templates') {
    content = <TemplateGallery query="" onSelect={handleSelectTemplate} />;
  } else if (filter === 'Chained workflows') {
    content = <WorkflowChains onSelect={setActiveWorkflow} />;
  } else if (filter === 'Workflow') {
    content = <WorkflowBuilderSection onSelect={setActiveWorkflow} />;
  } else if (filter === 'All') {
    content = (
      <div style={{ display: 'grid', gap: '2.75rem' }}>
        <WorkflowChains onSelect={setActiveWorkflow} />
        <TemplateGallery query="" onSelect={handleSelectTemplate} />
        <ToolGallery query="" filter={null} onSelect={handleSelect} />
        <WorkflowBuilderSection onSelect={setActiveWorkflow} />
      </div>
    );
  } else {
    content = <ToolGallery query="" filter={filter} onSelect={handleSelect} />;
  }

  return shell(
    <>
      {/* Theme toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <button onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          style={{ padding: '.35rem .8rem', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '.8rem' }}>
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 2.25rem' }}>
        <div style={{ color: VIOLET, fontSize: '.7rem', fontWeight: 800, letterSpacing: '.14em', marginBottom: '.75rem' }}>IMPOSITION GALLERY</div>
        <h1 style={{ fontSize: '2.1rem', margin: '0 0 .75rem', lineHeight: 1.15 }}>See what you can make — and exactly how</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.55, margin: '0 0 1.35rem' }}>
          Browse {TOOLS.length} real imposition and prepress tools, {TEMPLATES.length} ready-made templates,
          and {ALL_WORKFLOWS.length} production recipes. Each shows the result and the exact steps to create it —
          right in your browser, never uploaded.
        </p>
        <button
          onClick={() => { setFilter('Templates'); setQuery(''); }}
          style={{ padding: '.6rem 1.25rem', border: `1px solid ${VIOLET}`, borderRadius: 8, background: 'var(--accent-soft)', color: VIOLET, fontWeight: 700, cursor: 'pointer', fontSize: '.9rem' }}
        >
          Browse all {TEMPLATES.length} templates →
        </button>
      </div>

      {/* How-to strip */}
      <div className="admin-card" style={{ margin: '0 0 2rem', padding: '1.1rem 1.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '.09em', color: VIOLET, textTransform: 'uppercase' }}>How to make this</div>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Every template is a ready-made imposition recipe. Pick one, drop your file, and export.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: '1.25rem' }}>
          {HOW_TO_STEPS.map(([n, t]) => (
            <div key={n} style={{ borderLeft: `2px solid ${VIOLET}`, paddingLeft: '.85rem' }}>
              <div style={{ color: VIOLET, fontWeight: 800, fontSize: '.8rem', marginBottom: '.3rem' }}>{n}</div>
              <div style={{ fontSize: '.85rem', color: 'var(--ink)', lineHeight: 1.35 }}>{t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
        {GALLERY_CHIPS.map(c => {
          const active = !searching && filter === c;
          return (
            <button key={c} onClick={() => { setFilter(c); setQuery(''); }} style={{
              padding: '.4rem .9rem', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem', fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? VIOLET : 'var(--border)'}`, background: active ? VIOLET : 'transparent',
              color: active ? '#fff' : 'var(--muted)', transition: 'all .12s',
            }}>{c}</button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '2.25rem', display: 'flex', justifyContent: 'center' }}>
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${TOOLS.length} tools — comic, cards, watermark, fold…`}
          style={{ ...iStyle, maxWidth: 440 }}
        />
      </div>

      {content}
    </>
  );
}
