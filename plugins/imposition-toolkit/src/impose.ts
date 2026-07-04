// Browser-side PDF imposition engine — uses pdf-lib (dynamically imported so
// it doesn't bloat the initial bundle). Files never leave the browser.

const PT = 72; // PDF points per inch

export interface PdfPageInfo {
  count: number;
  widthPt: number;
  heightPt: number;
  widthIn: number;
  heightIn: number;
}

export async function getPdfInfo(bytes: Uint8Array): Promise<PdfPageInfo> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (!pages.length) throw new Error('PDF has no pages');
  const { width, height } = pages[0]!.getSize();
  return {
    count: pages.length,
    widthPt: Math.round(width * 100) / 100,
    heightPt: Math.round(height * 100) / 100,
    widthIn: Math.round((width / PT) * 1000) / 1000,
    heightIn: Math.round((height / PT) * 1000) / 1000,
  };
}

// Shared printer's-mark style. `center` adds midpoint ticks on each edge;
// `weight` sets the stroke; `color` overrides black (e.g. a registration hue).
export interface MarkStyle {
  weight?: number;
  center?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  color?: any;
  dash?: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCropMarks(page: any, rgb: any, tx: number, ty: number, tw: number, th: number, off: number, len: number, style?: MarkStyle) {
  const c = style?.color ?? rgb(0, 0, 0);
  const thickness = style?.weight ?? 0.5;
  const dashArray = style?.dash;
  const segs: [number, number, number, number][] = [
    [tx-off-len,ty,  tx-off,ty],      [tx,ty-off-len,  tx,ty-off],
    [tx+tw+off,ty,   tx+tw+off+len,ty],[tx+tw,ty-off-len,tx+tw,ty-off],
    [tx-off-len,ty+th,tx-off,ty+th],  [tx,ty+th+off,   tx,ty+th+off+len],
    [tx+tw+off,ty+th,tx+tw+off+len,ty+th],[tx+tw,ty+th+off,tx+tw,ty+th+off+len],
  ];
  if (style?.center) {
    const cx = tx + tw/2, cy = ty + th/2;
    segs.push(
      [cx,ty-off-len,   cx,ty-off],           // bottom-centre
      [cx,ty+th+off,    cx,ty+th+off+len],     // top-centre
      [tx-off-len,cy,   tx-off,cy],            // left-centre
      [tx+tw+off,cy,    tx+tw+off+len,cy],     // right-centre
    );
  }
  for (const [x1,y1,x2,y2] of segs)
    page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness, color:c, ...(dashArray ? { dashArray } : {}) });
}

// ── Booklet / Saddle Stitch (2-up) ─────────────────────────────────────────

export interface BookletOptions {
  rtl: boolean;
  marginIn: number;
  gutterIn: number;
  creepIn: number;
  addMarks: boolean;
  markLenIn: number;
  markOffIn: number;
  centerMarks?: boolean;
  markWeightPt?: number;
  // 0/undefined = a single saddle-stitch. Otherwise fold into signatures of this
  // many SHEETS (×4 pages); each signature is imposed on its own and concatenated
  // — how perfect-bound and thick books are actually gathered.
  signatureSheets?: number;
}

export async function imposeBooklet(bytes: Uint8Array, opts: BookletOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const { width: pw, height: ph } = srcPages[0]!.getSize();
  const mPt = opts.marginIn*PT, gPt = opts.gutterIn*PT, offPt = opts.markOffIn*PT, lenPt = opts.markLenIn*PT;
  const spreadW = mPt*2 + pw*2 + gPt, spreadH = mPt*2 + ph;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  function emb(n: number) { return (n>=1&&n<=N)?embeds[n-1]!:null; }   // n = GLOBAL 1-indexed

  // Pages per signature: a set number of sheets (×4) for perfect binding, else the
  // whole book padded up to one saddle.
  const sigPages = opts.signatureSheets && opts.signatureSheets>0
    ? opts.signatureSheets*4
    : Math.ceil(Math.max(1,N)/4)*4;

  for (let start=1; start<=Math.max(1,N); start+=sigPages) {
    const numSheets=sigPages/4;
    for (let s=0; s<numSheets; s++) {
      const creepPt = numSheets>1 ? (s/(numSheets-1))*opts.creepIn*PT : 0;
      const xL = mPt-creepPt, xR = mPt+pw+gPt+creepPt, yB = mPt;
      // local page numbers within this signature (1..sigPages)
      let aL:number,aR:number,bL:number,bR:number;
      if (!opts.rtl) { aL=sigPages-s*2; aR=s*2+1; bL=s*2+2; bR=sigPages-s*2-1; }
      else           { aL=s*2+1; aR=sigPages-s*2; bL=sigPages-s*2-1; bR=s*2+2; }
      const g=(loc:number)=>start-1+loc;   // local → global page number
      for (const [left,right] of [[aL,aR],[bL,bR]] as [number,number][]) {
        const pg = outDoc.addPage([spreadW,spreadH]);
        const eL=emb(g(left)), eR=emb(g(right));
        if (eL) pg.drawPage(eL, {x:xL,y:yB,width:pw,height:ph});
        if (eR) pg.drawPage(eR, {x:xR,y:yB,width:pw,height:ph});
        if (opts.addMarks) { drawCropMarks(pg,rgb,xL,yB,pw,ph,offPt,lenPt,markStyle); drawCropMarks(pg,rgb,xR,yB,pw,ph,offPt,lenPt,markStyle); }
      }
    }
  }
  return outDoc.save();
}

// ── N-Up Book (multi-up signature imposition) ───────────────────────────────
// Folds multiple pages onto each side of a large press sheet so that, after
// folding + trimming, pages read sequentially. 2-up (folio) is exactly the
// saddle/perfect booklet above. 4-up (quarto) folds an 8-page signature onto a
// 2×2 grid per side, with the top row rotated 180° — the standard quarto scheme.

export interface NUpBookOptions {
  nUp: number;                 // 2 = folio, 4 = quarto (8+ falls back to folio saddle/perfect)
  sheetWIn: number; sheetHIn: number;
  marginIn: number; gutterIn: number;
  creepIn: number; rtl: boolean;
  signatureSheets: number;     // 0 = single saddle; N = perfect-bind signatures
  addMarks: boolean; markLenIn: number; markOffIn: number;
  centerMarks?: boolean; markWeightPt?: number;
}

export async function imposeNUpBook(bytes: Uint8Array, opts: NUpBookOptions): Promise<Uint8Array> {
  // Folio (2-up) is the saddle/perfect booklet already implemented + verified.
  if (opts.nUp <= 2) {
    return imposeBooklet(bytes, {
      rtl: opts.rtl, marginIn: opts.marginIn, gutterIn: opts.gutterIn, creepIn: opts.creepIn,
      addMarks: opts.addMarks, markLenIn: opts.markLenIn, markOffIn: opts.markOffIn,
      centerMarks: opts.centerMarks, markWeightPt: opts.markWeightPt, signatureSheets: opts.signatureSheets,
    });
  }
  // Quarto (4-up): 8-page signatures, 2×2 per side, top row rotated 180°.
  const { PDFDocument, rgb, degrees } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const shW = opts.sheetWIn*PT, shH = opts.sheetHIn*PT, m = opts.marginIn*PT, g = opts.gutterIn*PT;
  const cols = 2, rows = 2;
  const cellW = (shW-2*m-g)/cols, cellH = (shH-2*m-g)/rows;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const off = opts.markOffIn*PT, len = opts.markLenIn*PT;
  const sigPages = 8;
  const numSigs = Math.ceil(Math.max(1,N)/sigPages);
  // [page-in-signature (1..8), row (0=top), col (0=left), rotation]
  const FRONT: [number,number,number,number][] = [[5,0,0,180],[4,0,1,180],[8,1,0,0],[1,1,1,0]];
  const BACK:  [number,number,number,number][] = [[3,0,0,180],[6,0,1,180],[2,1,0,0],[7,1,1,0]];
  const colX = (c: number) => m + (opts.rtl ? cols-1-c : c) * (cellW+g);
  for (let sig=0; sig<numSigs; sig++) {
    for (const table of [FRONT, BACK]) {
      const page = outDoc.addPage([shW,shH]);
      for (const [p,r,c,rot] of table) {
        const gp = sig*sigPages + p;                 // 1-indexed global page
        const x = colX(c), yTop = shH - m - r*(cellH+g), yBot = yTop - cellH;
        const emb = (gp>=1 && gp<=N) ? embeds[gp-1] : null;
        if (emb) {
          if (rot === 180) page.drawPage(emb, { x: x+cellW, y: yTop, width: cellW, height: cellH, rotate: degrees(180) });
          else page.drawPage(emb, { x, y: yBot, width: cellW, height: cellH });
        }
        if (opts.addMarks) drawCropMarks(page, rgb, x, yBot, cellW, cellH, off, len, markStyle);
      }
    }
  }
  return outDoc.save();
}

// ── N-Up Grid / Step & Repeat ───────────────────────────────────────────────

export interface NUpOptions {
  cols: number;
  rows: number;
  sheetWIn: number;
  sheetHIn: number;
  marginIn: number;
  gutterIn: number;
  repeatFirst: boolean;
  addMarks: boolean;
  markLenIn: number;
  markOffIn: number;
  // Optional: place each item at a fixed physical size (cards/labels). When set,
  // cols/rows are auto-computed to fit the sheet and the grid is centered.
  cellWIn?: number;
  cellHIn?: number;
  // Optional vertical gutter (defaults to gutterIn). Lets labels use a
  // horizontal gutter with zero vertical gap (e.g. Avery 5160).
  gutterYIn?: number;
  // Cut-and-stack ordering: pages are laid out so that cutting the sheets into
  // piles by cell position and stacking them yields sequential order.
  cutStack?: boolean;
  // Center marks at each edge midpoint + configurable mark weight/colour.
  centerMarks?: boolean;
  markWeightPt?: number;
  // Bleed-aware marks: art fills the whole cell, but crop marks are drawn at the
  // trim, i.e. inset by this many inches on every side. 0 = marks at cell edge.
  bleedIn?: number;
  // Double-sided (duplex): source pages are interpreted as front,back,front,back…
  // Fronts land on odd output sheets; backs on even sheets with the column order
  // mirrored so a long-edge duplex flip lines the back up behind its front.
  duplex?: boolean;
  duplexFlip?: 'long' | 'short';
  // S-pattern (snake) fill: odd rows read right-to-left, so cutting horizontal
  // strips and stacking keeps order. Default (false) = Z-pattern (all rows L→R).
  snake?: boolean;
  // Right-to-left column order (RTL scripts / reversed strip stacking).
  rtl?: boolean;
}

// Compute the effective grid for an N-Up layout (shared by engine + preview).
export interface NUpGrid { cols: number; rows: number; cellWPt: number; cellHPt: number; leftGapPt: number; topGapPt: number; gxPt: number; gyPt: number; }
export function computeNUpGrid(opts: NUpOptions): NUpGrid {
  const shW=opts.sheetWIn*PT, shH=opts.sheetHIn*PT, mPt=opts.marginIn*PT;
  const gxPt=opts.gutterIn*PT, gyPt=(opts.gutterYIn ?? opts.gutterIn)*PT;
  const fixed = !!(opts.cellWIn && opts.cellHIn);
  if (fixed) {
    const cellW=opts.cellWIn!*PT, cellH=opts.cellHIn!*PT;
    // +1e-6 so an exact edge fit (e.g. 3 cards = 11.000") isn't lost to float error.
    const cols=Math.max(1, Math.floor((shW-2*mPt+gxPt)/(cellW+gxPt)+1e-6));
    const rows=Math.max(1, Math.floor((shH-2*mPt+gyPt)/(cellH+gyPt)+1e-6));
    const blockW=cols*cellW+(cols-1)*gxPt, blockH=rows*cellH+(rows-1)*gyPt;
    return { cols, rows, cellWPt:cellW, cellHPt:cellH, leftGapPt:(shW-blockW)/2, topGapPt:(shH-blockH)/2, gxPt, gyPt };
  }
  const cols=Math.max(1,opts.cols), rows=Math.max(1,opts.rows);
  const cellW=(shW-mPt*2-gxPt*(cols-1))/cols;
  const cellH=(shH-mPt*2-gyPt*(rows-1))/rows;
  return { cols, rows, cellWPt:cellW, cellHPt:cellH, leftGapPt:mPt, topGapPt:mPt, gxPt, gyPt };
}

export async function imposeNUp(bytes: Uint8Array, opts: NUpOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const shW=opts.sheetWIn*PT, shH=opts.sheetHIn*PT;
  const { cols, rows, cellWPt:cellW, cellHPt:cellH, leftGapPt, topGapPt, gxPt, gyPt } = computeNUpGrid(opts);
  const perSheet=cols*rows;
  const duplex=!!opts.duplex;
  // In duplex mode the source is front,back,front,back… so one "item" = 2 pages.
  const totalItems=duplex?Math.ceil(N/2):N;
  const numSheets=opts.repeatFirst?1:Math.max(1,Math.ceil(totalItems/perSheet));
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  const off=opts.markOffIn*PT, len=opts.markLenIn*PT, bl=(opts.bleedIn??0)*PT;
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const shortEdge=opts.duplexFlip==='short';

  const itemAt=(si:number, cellIdx:number):number => {
    if (opts.repeatFirst) return 0;
    if (opts.cutStack) return cellIdx*numSheets+si;
    return si*perSheet+cellIdx;
  };
  // S-pattern reverses the reading order on odd rows (which page goes in a cell).
  const cellIndexOf=(r:number, c:number):number => r*cols + ((opts.snake && r%2===1) ? cols-1-c : c);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const place=(sheet:any, itemIdx:number, r:number, c:number, isBack:boolean) => {
    const pi=duplex ? itemIdx*2+(isBack?1:0) : itemIdx;
    if (pi>=N) return;
    const emb=embeds[pi]; if (!emb) return;
    let cc=c, rr=r;
    if (opts.rtl) cc=cols-1-cc;                                   // right-to-left columns
    if (isBack) { if (shortEdge) rr=rows-1-rr; else cc=cols-1-cc; } // duplex flip mirror
    const x=leftGapPt+cc*(cellW+gxPt), y=shH-topGapPt-cellH-rr*(cellH+gyPt);
    sheet.drawPage(emb, {x,y,width:cellW,height:cellH});
    if (opts.addMarks) drawCropMarks(sheet,rgb,x+bl,y+bl,cellW-2*bl,cellH-2*bl,off,len,markStyle);
  };

  for (let si=0; si<numSheets; si++) {
    const front=outDoc.addPage([shW,shH]);
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) place(front, itemAt(si,cellIndexOf(r,c)), r, c, false);
    if (duplex) {
      const back=outDoc.addPage([shW,shH]);
      for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) place(back, itemAt(si,cellIndexOf(r,c)), r, c, true);
    }
  }
  return outDoc.save();
}

// ── Numbered Tickets (Tickets & Data) ───────────────────────────────────────
// Repeats page 1 across a grid, stamping a sequential number on each ticket.

export interface TicketOptions {
  cols: number;
  rows: number;
  sheetWIn: number;
  sheetHIn: number;
  marginIn: number;
  gutterIn: number;
  startNumber: number;
  count: number;
  prefix: string;
  pad: number;
  position: 'bottom-right'|'bottom-left'|'top-right'|'top-left'|'bottom-center'|'top-center';
  fontSizePt: number;
  addMarks: boolean;
  markLenIn: number;
  markOffIn: number;
  centerMarks?: boolean;
  markWeightPt?: number;
}

export async function imposeTickets(bytes: Uint8Array, opts: TicketOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  if (!srcPages.length) throw new Error('Empty PDF');
  const shW=opts.sheetWIn*PT, shH=opts.sheetHIn*PT, mPt=opts.marginIn*PT, gPt=opts.gutterIn*PT;
  const cols=Math.max(1,opts.cols), rows=Math.max(1,opts.rows);
  const cellW=(shW-mPt*2-gPt*(cols-1))/cols;
  const cellH=(shH-mPt*2-gPt*(rows-1))/rows;
  const perSheet=cols*rows;
  const numSheets=Math.max(1,Math.ceil(opts.count/perSheet));
  const outDoc=await PDFDocument.create();
  const [emb]=await outDoc.embedPages([srcPages[0]!]);
  const font=await outDoc.embedFont(StandardFonts.Helvetica);
  const off=opts.markOffIn*PT, len=opts.markLenIn*PT, inset=4;
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  let ticket=0;
  for (let si=0; si<numSheets; si++) {
    const sheet=outDoc.addPage([shW,shH]);
    for (let r=0; r<rows; r++) {
      for (let c=0; c<cols; c++) {
        if (ticket>=opts.count) continue;
        const num=opts.startNumber+ticket; ticket++;
        const x=mPt+c*(cellW+gPt), y=shH-mPt-cellH-r*(cellH+gPt);
        if (emb) sheet.drawPage(emb,{x,y,width:cellW,height:cellH});
        const label=`${opts.prefix}${String(num).padStart(opts.pad,'0')}`;
        const tw=font.widthOfTextAtSize(label,opts.fontSizePt);
        const tx=opts.position.includes('right')?x+cellW-tw-inset:opts.position.includes('left')?x+inset:x+(cellW-tw)/2;
        const ty=opts.position.startsWith('top')?y+cellH-opts.fontSizePt-inset:y+inset;
        sheet.drawText(label,{x:tx,y:ty,font,size:opts.fontSizePt,color:rgb(0,0,0)});
        if (opts.addMarks) drawCropMarks(sheet,rgb,x,y,cellW,cellH,off,len,markStyle);
      }
    }
  }
  return outDoc.save();
}

// ── Crop Marks Only ─────────────────────────────────────────────────────────

export interface CropMarksOptions {
  bleedIn: number;
  marginIn: number;
  markLenIn: number;
  markOffIn: number;
  centerMarks?: boolean;
  markWeightPt?: number;
  // Cutter-mark options (pdfpress "Cutter Marks"):
  cutType?: 'thru' | 'kiss' | 'crease' | 'perf';  // colour/style of the lines
  knockout?: boolean;      // white halo behind marks (for dark stock)
  overshootIn?: number;    // extend each mark past the corner
  keyMark?: boolean;       // orientation key (filled square, bottom-left)
}

export async function addCropMarksOnly(bytes: Uint8Array, opts: CropMarksOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  // Cut type sets colour + dash: thru=solid black, kiss=magenta, crease=blue
  // dashed, perf=red dashed.
  const ct = opts.cutType ?? 'thru';
  const color = ct === 'kiss' ? rgb(1, 0, 1) : ct === 'crease' ? rgb(0.15, 0.4, 0.9) : ct === 'perf' ? rgb(0.85, 0.11, 0.14) : rgb(0, 0, 0);
  const dash = ct === 'crease' ? [4, 3] : ct === 'perf' ? [2, 2] : undefined;
  const w0 = opts.markWeightPt ?? 0.5;
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: w0, color, dash };
  const overshoot = (opts.overshootIn ?? 0) * PT;
  for (let i=0; i<embeds.length; i++) {
    const {width:pw,height:ph}=srcPages[i]!.getSize();
    const mPt=opts.marginIn*PT, bPt=opts.bleedIn*PT;
    const pg=outDoc.addPage([pw+mPt*2,ph+mPt*2]);
    pg.drawPage(embeds[i]!,{x:mPt,y:mPt,width:pw,height:ph});
    const tx=mPt+bPt, ty=mPt+bPt, tw=pw-bPt*2, th=ph-bPt*2, off=opts.markOffIn*PT, len=opts.markLenIn*PT+overshoot;
    if (opts.knockout) drawCropMarks(pg,rgb,tx,ty,tw,th,off,len,{ center: !!opts.centerMarks, weight: w0 + 1.5, color: rgb(1,1,1) });
    drawCropMarks(pg,rgb,tx,ty,tw,th,off,len,markStyle);
    if (opts.keyMark) pg.drawRectangle({ x: mPt - 2, y: mPt - 2, width: 4, height: 4, color });
  }
  return outDoc.save();
}

// ── Merge PDFs ──────────────────────────────────────────────────────────────

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const out=await PDFDocument.create();
  for (const bytes of files) {
    const src=await PDFDocument.load(bytes,{ignoreEncryption:true});
    const copied=await out.copyPages(src,src.getPageIndices());
    for (const pg of copied) out.addPage(pg);
  }
  return out.save();
}

// ── Page-range selector (shared) ────────────────────────────────────────────
// Parse a range expression into a 1-indexed set of pages to process. Supports:
//   all · 1-5 · 1,3,5 · odd · even · first · last · last-2 · "1-10 odd" · "2-20 even".
export function parsePageRange(expr: string, n: number): Set<number> {
  const s = (expr ?? '').trim().toLowerCase();
  if (!s || s === 'all') return new Set(Array.from({ length: n }, (_, i) => i + 1));
  const set = new Set<number>();
  for (let tok of s.split(',')) {
    tok = tok.trim(); if (!tok) continue;
    let m: RegExpMatchArray | null;
    if (tok === 'odd') { for (let i = 1; i <= n; i += 2) set.add(i); continue; }
    if (tok === 'even') { for (let i = 2; i <= n; i += 2) set.add(i); continue; }
    if (tok === 'first') { set.add(1); continue; }
    if (tok === 'last') { set.add(n); continue; }
    if ((m = tok.match(/^last-(\d+)$/))) { const p = n - parseInt(m[1]!); if (p >= 1) set.add(p); continue; }
    if ((m = tok.match(/^(\d+)\s*-\s*(\d+)\s+(odd|even)$/))) { const a = +m[1]!, b = +m[2]!; for (let i = a; i <= b; i++) if ((i % 2 === 1) === (m[3] === 'odd')) set.add(i); continue; }
    if ((m = tok.match(/^(\d+)\s*-\s*(\d+)$/))) { const a = +m[1]!, b = +m[2]!; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i); continue; }
    const p = parseInt(tok); if (!isNaN(p)) set.add(p);
  }
  return set;
}

// ── Rotate ──────────────────────────────────────────────────────────────────
// Multiples of 90 set the page /Rotate flag; arbitrary angles are baked in by
// re-drawing the page rotated about its centre onto a grown bounding box.

export async function rotatePdf(bytes: Uint8Array, angleDeg: number, pages?: string): Promise<Uint8Array> {
  const { PDFDocument, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const sel = parsePageRange(pages ?? 'all', n);
  const norm = ((angleDeg % 360) + 360) % 360;
  if (norm % 90 === 0) {
    for (const [i, pg] of srcDoc.getPages().entries()) if (sel.has(i + 1)) pg.setRotation(degrees((pg.getRotation().angle + norm) % 360));
    return srcDoc.save();
  }
  // Arbitrary angle: rebuild, growing the box to fit the rotated content.
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const rad = (norm * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    if (!sel.has(i + 1)) { const pg = outDoc.addPage([w, h]); pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h }); continue; }
    const nw = Math.abs(w * cos) + Math.abs(h * sin), nh = Math.abs(w * sin) + Math.abs(h * cos);
    const pg = outDoc.addPage([nw, nh]);
    // translate to new centre, rotate, translate back to old centre
    const a = cos, b = sin, c = -sin, d = cos;
    const e = nw / 2 - (a * (w / 2) + c * (h / 2)), f = nh / 2 - (b * (w / 2) + d * (h / 2));
    pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
    pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h });
    pg.pushOperators(popGraphicsState());
  }
  return outDoc.save();
}

// ── Flip / Mirror ───────────────────────────────────────────────────────────

export async function flipPdf(bytes: Uint8Array, direction: 'h'|'v', pages?: string): Promise<Uint8Array> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const sel=parsePageRange(pages ?? 'all', srcPages.length);
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  for (let i=0; i<embeds.length; i++) {
    const {width:w,height:h}=srcPages[i]!.getSize();
    const pg=outDoc.addPage([w,h]);
    if (sel.has(i+1)) {
      if (direction==='h') pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1,0,0,1,w,0));
      else pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(1,0,0,-1,0,h));
      pg.drawPage(embeds[i]!,{x:0,y:0,width:w,height:h});
      pg.pushOperators(popGraphicsState());
    } else {
      pg.drawPage(embeds[i]!,{x:0,y:0,width:w,height:h});
    }
  }
  return outDoc.save();
}

// ── Split PDF ───────────────────────────────────────────────────────────────
// ranges: comma-separated, e.g. "1-3, 4-6, 7"  (1-indexed)

export async function splitPdf(bytes: Uint8Array, ranges: string): Promise<Uint8Array[]> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const n=srcDoc.getPageCount();
  const results: Uint8Array[] = [];
  for (const part of ranges.split(',').map(s=>s.trim())) {
    const m=part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start=parseInt(m[1]!)-1;
    const end=m[2]?parseInt(m[2]!)-1:start;
    const indices:number[]=[];
    for (let i=start; i<=end&&i<n; i++) indices.push(i);
    if (!indices.length) continue;
    const out=await PDFDocument.create();
    const pages=await out.copyPages(srcDoc,indices);
    for (const pg of pages) out.addPage(pg);
    results.push(await out.save());
  }
  return results;
}

// Chunk mode: split into files of `size` pages each (last may be shorter).
export async function splitPdfChunks(bytes: Uint8Array, size: number): Promise<Uint8Array[]> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const step = Math.max(1, Math.floor(size));
  const results: Uint8Array[] = [];
  for (let start = 0; start < n; start += step) {
    const indices: number[] = [];
    for (let i = start; i < start + step && i < n; i++) indices.push(i);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(srcDoc, indices);
    for (const pg of pages) out.addPage(pg);
    results.push(await out.save());
  }
  return results;
}

// ── Minimal ZIP writer (store, no compression) — dependency-free ────────────
// Bundles the split parts into a single .zip so they download as one archive.
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
export function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const local = concatBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0), name, f.data]);
    chunks.push(local);
    central.push(concatBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const cd = concatBytes(central);
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return concatBytes([...chunks, cd, end]);
}
function concatBytes(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ── Overlay / Watermark ─────────────────────────────────────────────────────

export interface OverlayOptions {
  opacity: number;
  mode: 'center' | 'fill' | 'tile';
  tileRows?: number;
  tileCols?: number;
  // 9-point anchor for 'center' mode + padding (points) from the edges.
  anchor?: 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
  paddingPt?: number;
}

export async function overlayPdf(baseBytes: Uint8Array, stampBytes: Uint8Array, opts: OverlayOptions): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const baseDoc=await PDFDocument.load(baseBytes,{ignoreEncryption:true});
  const stampDoc=await PDFDocument.load(stampBytes,{ignoreEncryption:true});
  const stampPages=stampDoc.getPages();
  const basePages=baseDoc.getPages();
  for (let i=0; i<basePages.length; i++) {
    const pg=basePages[i]!;
    const {width:w,height:h}=pg.getSize();
    const stamp=stampPages[i%stampPages.length]!;
    const {width:sw,height:sh}=stamp.getSize();
    const [emb]=await baseDoc.embedPages([stamp]);
    if (!emb) continue;
    if (opts.mode==='fill') {
      pg.drawPage(emb,{x:0,y:0,width:w,height:h,opacity:opts.opacity});
    } else if (opts.mode==='center') {
      const scale=Math.min(w/sw,h/sh)*0.85;
      const dw=sw*scale, dh=sh*scale, pad=opts.paddingPt ?? 0, a=opts.anchor ?? 'mc';
      const hx = a[1]==='l' ? pad : a[1]==='r' ? w-dw-pad : (w-dw)/2;
      const vy = a[0]==='b' ? pad : a[0]==='t' ? h-dh-pad : (h-dh)/2;
      pg.drawPage(emb,{x:hx,y:vy,width:dw,height:dh,opacity:opts.opacity});
    } else {
      // tile
      const tC=opts.tileCols??2, tR=opts.tileRows??2;
      const tw=w/tC, th=h/tR;
      for (let r=0; r<tR; r++) for (let c=0; c<tC; c++)
        pg.drawPage(emb,{x:c*tw,y:r*th,width:tw,height:th,opacity:opts.opacity});
    }
  }
  return baseDoc.save();
}

// ── Shuffle / Reorder Pages ─────────────────────────────────────────────────
// A small expression language (comma-separated at the top level):
//   3,1,2          reorder                 all             every page 1..n
//   1-5            ascending range          5-1 / last-1   descending (reverse)
//   odd  even      odd / even pages         first  last    page 1 / page n
//   4>  3<  2^     rotate 90cw / 90ccw / 180 (suffix, applies to the token)
//   B  X  _  0     insert a blank page
//   5*(1)          repeat the sub-expression 5 times
//   [odd,even]     interleave the sub-lists (a1,b1,a2,b2…)
//   group 3: 3 2 1 within each group of 3 source pages, reorder locally
// e.g. "1,2>,B,5-3", "[odd,even]", "3*(1-2)", "group 4: 4 3 2 1".

interface ShufInstr { page: number | null; rot: number }

// Split a string on top-level commas, respecting [] and () nesting.
function splitTopLevel(s: string): string[] {
  const parts: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

// Expand an expression into an ordered instruction list against an n-page doc.
export function expandShuffle(expr: string, n: number, rot = 0): ShufInstr[] {
  const out: ShufInstr[] = [];
  for (let tok of splitTopLevel(expr)) {
    tok = tok.trim(); if (!tok) continue;
    let r = rot;
    while (/[><^]$/.test(tok)) { const ch = tok.slice(-1); r = (r + (ch === '>' ? 90 : ch === '<' ? 270 : 180)) % 360; tok = tok.slice(0, -1).trim(); }
    const low = tok.toLowerCase();
    let m: RegExpMatchArray | null;
    // N*(sub) — repeat
    if ((m = tok.match(/^(\d+)\s*\*\s*\(([\s\S]*)\)$/))) {
      const times = parseInt(m[1]!), sub = expandShuffle(m[2]!, n, r);
      for (let k = 0; k < times; k++) out.push(...sub.map(x => ({ ...x })));
      continue;
    }
    // [a,b,...] — interleave
    if (tok.startsWith('[') && tok.endsWith(']')) {
      const lists = splitTopLevel(tok.slice(1, -1)).map(s => expandShuffle(s, n, r));
      const maxLen = Math.max(0, ...lists.map(l => l.length));
      for (let i = 0; i < maxLen; i++) for (const l of lists) if (i < l.length) out.push(l[i]!);
      continue;
    }
    // group N: order — reorder within each group of N source pages
    if ((m = tok.match(/^group\s+(\d+)\s*:\s*([\s\S]+)$/i))) {
      const g = Math.max(1, parseInt(m[1]!));
      const order = m[2]!.trim().split(/[\s,]+/).map(x => parseInt(x)).filter(x => !isNaN(x));
      for (let base = 0; base < n; base += g) for (const loc of order) { const p = base + loc; if (p >= 1 && p <= n) out.push({ page: p, rot: r }); }
      continue;
    }
    if (low === 'all') { for (let i = 1; i <= n; i++) out.push({ page: i, rot: r }); continue; }
    if (low === 'odd') { for (let i = 1; i <= n; i += 2) out.push({ page: i, rot: r }); continue; }
    if (low === 'even') { for (let i = 2; i <= n; i += 2) out.push({ page: i, rot: r }); continue; }
    if (low === 'first') { out.push({ page: 1, rot: r }); continue; }
    if (low === 'last') { out.push({ page: n, rot: r }); continue; }
    if (low === 'reverse' || low === 'last-1' || low === 'last-first') { for (let i = n; i >= 1; i--) out.push({ page: i, rot: r }); continue; }
    if (/^[bxBX_]$/.test(tok) || tok === '0') { out.push({ page: null, rot: r }); continue; }
    // range a-b (endpoints may be numbers or first/last/n)
    if ((m = tok.match(/^(\d+|last|first|n)\s*-\s*(\d+|last|first|n)$/i))) {
      const res = (t: string) => { const tl = t.toLowerCase(); return tl === 'last' || tl === 'n' ? n : tl === 'first' ? 1 : parseInt(t); };
      const a = res(m[1]!), b = res(m[2]!);
      if (a <= b) for (let i = a; i <= b; i++) out.push({ page: i, rot: r });
      else for (let i = a; i >= b; i--) out.push({ page: i, rot: r });
      continue;
    }
    const p = parseInt(tok);
    if (!isNaN(p)) out.push({ page: p, rot: r });
  }
  return out;
}

export async function shufflePages(bytes: Uint8Array, orderStr: string): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const ref = srcDoc.getPage(0).getSize();
  const valid = expandShuffle(orderStr, n).filter(x => x.page === null || (x.page >= 1 && x.page <= n));
  if (!valid.length) throw new Error('No valid page numbers');
  const outDoc = await PDFDocument.create();
  for (const it of valid) {
    if (it.page === null) {
      const pg = outDoc.addPage([ref.width, ref.height]);
      if (it.rot) pg.setRotation(degrees(it.rot));
    } else {
      const [pg] = await outDoc.copyPages(srcDoc, [it.page - 1]);
      if (it.rot && pg) pg.setRotation(degrees((pg.getRotation().angle + it.rot) % 360));
      if (pg) outDoc.addPage(pg);
    }
  }
  return outDoc.save();
}

// ── Crop / Trim Box ─────────────────────────────────────────────────────────

export async function cropPdf(bytes: Uint8Array, opts: { top:number; right:number; bottom:number; left:number }, pages?: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const sel=parsePageRange(pages ?? 'all', doc.getPageCount());
  for (const [i,pg] of doc.getPages().entries()) {
    if (!sel.has(i+1)) continue;
    const {width:w,height:h}=pg.getSize();
    const lPt=opts.left*PT, rPt=opts.right*PT, tPt=opts.top*PT, bPt=opts.bottom*PT;
    pg.setCropBox(lPt, bPt, w-lPt-rPt, h-tPt-bPt);
    pg.setTrimBox(lPt, bPt, w-lPt-rPt, h-tPt-bPt);
  }
  return doc.save();
}

// ── Resize / Scale ──────────────────────────────────────────────────────────
// scale: multiply every page by a percentage. fit: drop each page onto a fixed
// target sheet, preserving aspect ratio (letterboxed + centred). stretch: force
// content to exactly fill the target sheet (aspect may change).

export interface ResizeOptions {
  mode: 'scale' | 'fit' | 'stretch';
  scalePct: number;    // 'scale' — 100 = unchanged
  targetWIn: number;   // 'fit' / 'stretch'
  targetHIn: number;
}

export async function resizePdf(bytes: Uint8Array, opts: ResizeOptions, pages?: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const sel=parsePageRange(pages ?? 'all', srcPages.length);
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  for (let i=0; i<embeds.length; i++) {
    const {width:w,height:h}=srcPages[i]!.getSize();
    if (!sel.has(i+1)) { const pg=outDoc.addPage([w,h]); pg.drawPage(embeds[i]!,{x:0,y:0,width:w,height:h}); continue; }
    if (opts.mode==='scale') {
      const f=Math.max(0.01,opts.scalePct/100);
      const nw=w*f, nh=h*f;
      const pg=outDoc.addPage([nw,nh]);
      pg.drawPage(embeds[i]!,{x:0,y:0,width:nw,height:nh});
    } else {
      const tw=opts.targetWIn*PT, th=opts.targetHIn*PT;
      const pg=outDoc.addPage([tw,th]);
      if (opts.mode==='stretch') {
        pg.drawPage(embeds[i]!,{x:0,y:0,width:tw,height:th});
      } else {
        const s=Math.min(tw/w,th/h), dw=w*s, dh=h*s;
        pg.drawPage(embeds[i]!,{x:(tw-dw)/2,y:(th-dh)/2,width:dw,height:dh});
      }
    }
  }
  return outDoc.save();
}

// ── Page Numbering ──────────────────────────────────────────────────────────

export interface PageNumberOptions {
  position: 'bottom-center'|'bottom-right'|'bottom-left'|'top-center'|'top-right'|'top-left';
  startAt: number;
  prefix: string;
  suffix: string;
  fontSizePt: number;
  marginPt: number;
}

export async function addPageNumbers(bytes: Uint8Array, opts: PageNumberOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const font=await doc.embedFont(StandardFonts.Helvetica);
  for (const [i,pg] of doc.getPages().entries()) {
    const {width:w,height:h}=pg.getSize();
    const text=`${opts.prefix}${i+opts.startAt}${opts.suffix}`;
    const tw=font.widthOfTextAtSize(text,opts.fontSizePt);
    const m=opts.marginPt;
    const pos = opts.position;
    const x = pos.includes('right') ? w-tw-m : pos.includes('left') ? m : (w-tw)/2;
    const y = pos.startsWith('top') ? h-m-opts.fontSizePt : m;
    pg.drawText(text,{x,y,font,size:opts.fontSizePt,color:rgb(0,0,0)});
  }
  return doc.save();
}

// ── Color Bar ───────────────────────────────────────────────────────────────

const COLOR_BAR_SWATCHES = [
  {r:0,g:1,b:1},   // C
  {r:1,g:0,b:1},   // M
  {r:1,g:1,b:0},   // Y
  {r:0,g:0,b:0},   // K
  {r:1,g:0,b:0},   // R
  {r:0,g:1,b:0},   // G
  {r:0,g:0,b:1},   // B
  {r:1,g:1,b:1},   // W
  {r:.75,g:.75,b:.75},  // 25%
  {r:.5,g:.5,b:.5},     // 50%
  {r:.25,g:.25,b:.25},  // 75%
];

export async function addColorBar(bytes: Uint8Array, opts: { position:'bottom'|'top'; heightIn:number }): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  const barH=opts.heightIn*PT;
  for (let i=0; i<embeds.length; i++) {
    const {width:pw,height:ph}=srcPages[i]!.getSize();
    const pg=outDoc.addPage([pw,ph+barH]);
    const contentY=opts.position==='bottom'?barH:0;
    pg.drawPage(embeds[i]!,{x:0,y:contentY,width:pw,height:ph});
    const barY=opts.position==='bottom'?0:ph;
    const sw=pw/COLOR_BAR_SWATCHES.length;
    for (let j=0; j<COLOR_BAR_SWATCHES.length; j++) {
      const s=COLOR_BAR_SWATCHES[j]!;
      pg.drawRectangle({x:j*sw,y:barY,width:sw,height:barH,color:rgb(s.r,s.g,s.b),borderWidth:0});
    }
  }
  return outDoc.save();
}

// ── Tiled Poster ────────────────────────────────────────────────────────────

export async function imposeTiledPoster(bytes: Uint8Array, opts: {
  tilesAcross: number; tilesDown: number;
  sheetWIn: number; sheetHIn: number;
  overlapIn: number; addMarks: boolean;
  markLenIn: number; markOffIn: number;
  centerMarks?: boolean; markWeightPt?: number;
}): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  if (!srcPages.length) throw new Error('Empty PDF');
  const {width:cw,height:ch}=srcPages[0]!.getSize();
  const shW=opts.sheetWIn*PT, shH=opts.sheetHIn*PT;
  const overPt=opts.overlapIn*PT;
  // How much of the source content each tile covers (before overlap)
  const tileContentW=(cw+(opts.tilesAcross-1)*overPt)/opts.tilesAcross;
  const tileContentH=(ch+(opts.tilesDown-1)*overPt)/opts.tilesDown;
  // Scale: fit tile content to sheet
  const scale=Math.min(shW/tileContentW,shH/tileContentH);
  const outDoc=await PDFDocument.create();
  const [embed]=await outDoc.embedPages([srcPages[0]!]);
  if (!embed) return outDoc.save();
  const scaledW=cw*scale, scaledH=ch*scale;
  const stepW=tileContentW*scale, stepH=tileContentH*scale;
  for (let r=0; r<opts.tilesDown; r++) {
    for (let c=0; c<opts.tilesAcross; c++) {
      const pg=outDoc.addPage([shW,shH]);
      // Shift so the right portion of the scaled source appears on this tile
      const offsetX=c*stepW, offsetY=(opts.tilesDown-1-r)*stepH;
      pg.drawPage(embed,{x:-offsetX,y:-offsetY,width:scaledW,height:scaledH});
      if (opts.addMarks) {
        const off=opts.markOffIn*PT, len=opts.markLenIn*PT;
        drawCropMarks(pg,rgb,0,0,shW,shH,off,len,{ center: !!opts.centerMarks, weight: opts.markWeightPt });
      }
    }
  }
  return outDoc.save();
}

// ── Generate Bleed ──────────────────────────────────────────────────────────
// Fabricate a bleed margin on artwork that has none by scaling the content to
// overflow the trim on every edge. Ideal for full-bleed art (photos, colour
// backgrounds); the original trim is recorded in the TrimBox so downstream
// marks can find it.

export interface BleedOptions {
  bleedIn: number;
  mode?: 'scale' | 'solid' | 'mirror';  // default 'scale'
  color?: { r: number; g: number; b: number };  // for 'solid'
}

export async function generateBleed(bytes: Uint8Array, opts: BleedOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const b = opts.bleedIn * PT, mode = opts.mode ?? 'scale';
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    const emb = embeds[i]!;
    const pg = outDoc.addPage([w + 2 * b, h + 2 * b]);
    if (mode === 'scale') {
      pg.drawPage(emb, { x: 0, y: 0, width: w + 2 * b, height: h + 2 * b });
    } else if (mode === 'solid') {
      const col = opts.color ?? { r: 1, g: 1, b: 1 };
      pg.drawRectangle({ x: 0, y: 0, width: w + 2 * b, height: h + 2 * b, color: rgb(col.r, col.g, col.b) });
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    } else {
      // mirror: reflect the page across each edge into the bleed, then the real
      // page on top. Order: corners, edges, centre.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const draw = (mx: number, my: number) => {
        pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(mx < 0 ? -1 : 1, 0, 0, my < 0 ? -1 : 1, mx, my));
        pg.drawPage(emb, { x: b, y: b, width: w, height: h });
        pg.pushOperators(popGraphicsState());
      };
      const L = 2 * b, R = 2 * (b + w), B = 2 * b, T = 2 * (b + h);
      draw(L, B); draw(R, B); draw(L, T); draw(R, T);   // corners
      draw(L, 0); draw(R, 0); draw(0, B); draw(0, T);   // edges
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    }
    pg.setTrimBox(b, b, w, h);
  }
  return outDoc.save();
}

// ── Variable-token substitution (header/footer/slug) ────────────────────────
function fmtDate(d: Date, fmt: string): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return fmt.replace(/%Y/g, String(d.getFullYear())).replace(/%m/g, p2(d.getMonth() + 1)).replace(/%d/g, p2(d.getDate()))
    .replace(/%H/g, p2(d.getHours())).replace(/%M/g, p2(d.getMinutes()));
}
function applyTokens(text: string, ctx: { pageNum: number; pageCount: number; fileName?: string }): string {
  const now = new Date();
  return text
    .replace(/\[page-number(?::0*(\d+))?\]/g, (_m, pad) => pad ? String(ctx.pageNum).padStart(+pad, '0') : String(ctx.pageNum))
    .replace(/\[page-count\]/g, String(ctx.pageCount))
    .replace(/\[sheet-number\]/g, String(ctx.pageNum))
    .replace(/\[file-name\]/g, ctx.fileName ?? '')
    .replace(/\[timestamp(?::([^\]]+))?\]/g, (_m, f) => fmtDate(now, f || '%Y-%m-%d'));
}

// ── Header / Footer ─────────────────────────────────────────────────────────

export interface HeaderFooterOptions {
  header: string;
  footer: string;
  fontSizePt: number;
  marginPt: number;
  align: 'left' | 'center' | 'right';
  fileName?: string;          // for the [file-name] token
  alternate?: boolean;        // mirror left/right alignment on odd pages (book running heads)
}

export async function addHeaderFooter(bytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages(), count = pages.length;
  for (const [i, pg] of pages.entries()) {
    const { width: w, height: h } = pg.getSize();
    // On alternate mode, even (0-indexed) pages keep the alignment, odd pages mirror it.
    const align = opts.alternate && i % 2 === 1 ? (opts.align === 'left' ? 'right' : opts.align === 'right' ? 'left' : 'center') : opts.align;
    const bands: [string, number][] = [[opts.header, h - opts.marginPt], [opts.footer, opts.marginPt]];
    for (const [raw, y] of bands) {
      if (!raw) continue;
      const text = applyTokens(raw, { pageNum: i + 1, pageCount: count, fileName: opts.fileName });
      const tw = font.widthOfTextAtSize(text, opts.fontSizePt);
      const x = align === 'right' ? w - opts.marginPt - tw : align === 'left' ? opts.marginPt : (w - tw) / 2;
      pg.drawText(text, { x, y, font, size: opts.fontSizePt, color: rgb(0.1, 0.1, 0.1) });
    }
  }
  return doc.save();
}

// ── Text Watermark (proof stamp) ────────────────────────────────────────────

export interface WatermarkOptions {
  text: string;
  opacity: number;
  angleDeg: number;
  fontSizePt: number;
}

export async function addTextWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const rad = (opts.angleDeg * Math.PI) / 180;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const tw = font.widthOfTextAtSize(opts.text || 'PROOF', opts.fontSizePt);
    // Position the baseline so the text's midpoint lands at the page centre.
    const x = w / 2 - (tw / 2) * Math.cos(rad);
    const y = h / 2 - (tw / 2) * Math.sin(rad);
    pg.drawText(opts.text || 'PROOF', {
      x, y, font, size: opts.fontSizePt,
      color: rgb(0.5, 0.5, 0.5), opacity: opts.opacity, rotate: degrees(opts.angleDeg),
    });
  }
  return doc.save();
}

// ── Job Slug (job-info strip) ───────────────────────────────────────────────
// Adds a thin strip along one edge stamped with job metadata (name, date, etc.).

export interface JobSlugOptions {
  text: string;
  position: 'top' | 'bottom';
  fontSizePt: number;
  fileName?: string;   // for the [file-name] token
}

export async function addJobSlug(bytes: Uint8Array, opts: JobSlugOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const strip = opts.fontSizePt + 8;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    const pg = outDoc.addPage([w, h + strip]);
    const contentY = opts.position === 'bottom' ? strip : 0;
    pg.drawPage(embeds[i]!, { x: 0, y: contentY, width: w, height: h });
    const ty = opts.position === 'bottom' ? (strip - opts.fontSizePt) / 2 + 1 : h + (strip - opts.fontSizePt) / 2 + 1;
    const label = applyTokens(opts.text || 'Job', { pageNum: i + 1, pageCount: embeds.length, fileName: opts.fileName });
    pg.drawText(label, { x: 6, y: ty, font, size: opts.fontSizePt, color: rgb(0.25, 0.25, 0.25) });
  }
  return outDoc.save();
}

// ── Collating (spine) Marks ─────────────────────────────────────────────────
// Stepped black ticks down the spine edge, one per sheet, forming a descending
// staircase so mis-gathered signatures are obvious at a glance.

export interface CollatingOptions { edge: 'left' | 'right'; }

export async function addCollatingMarks(bytes: Uint8Array, opts: CollatingOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const markW = 9, markH = 14;
  for (let i = 0; i < n; i++) {
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    const step = n > 1 ? (h - 40 - markH) / (n - 1) : 0;
    const y = h - 20 - markH - i * step;
    const x = opts.edge === 'right' ? w - markW : 0;
    pg.drawRectangle({ x, y, width: markW, height: markH, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

// ── Preflight (inspection, non-destructive) ─────────────────────────────────

export interface PreflightReport {
  pages: number;
  uniformSize: boolean;
  widthIn: number;
  heightIn: number;
  warnings: string[];
}

export async function preflight(bytes: Uint8Array): Promise<PreflightReport> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const warnings: string[] = [];
  if (!pages.length) warnings.push('Document has no pages.');
  const first = pages[0]?.getSize() ?? { width: 0, height: 0 };
  const uniformSize = pages.every(p => {
    const s = p.getSize();
    return Math.abs(s.width - first.width) < 1 && Math.abs(s.height - first.height) < 1;
  });
  if (!uniformSize) warnings.push('Pages are not all the same size — imposition may misalign.');
  if (first.width / PT < 1 || first.height / PT < 1) warnings.push('Page size looks unusually small.');
  return {
    pages: pages.length,
    uniformSize,
    widthIn: Math.round((first.width / PT) * 1000) / 1000,
    heightIn: Math.round((first.height / PT) * 1000) / 1000,
    warnings,
  };
}

// ── Dieline generator (folding carton + presentation folder) ────────────────
// Draws a real box net: cut lines (solid), fold/crease lines (dashed), glue
// tabs and flaps, sized from dimensions. Output is a single flat sheet ready to
// print, cut and fold. No source PDF required.

export interface DielineOptions {
  kind: 'ste' | 'folder';   // straight-tuck-end carton | presentation folder
  widthIn: number;          // front panel width (W)
  heightIn: number;         // panel height (H)
  depthIn: number;          // side depth (D)
  glueIn: number;           // glue-flap width
  marginIn: number;         // sheet margin around the net
}

export async function makeDieline(opts: DielineOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const CUT = rgb(0.85, 0.11, 0.14);     // solid = cut / trim
  const CREASE = rgb(0.15, 0.4, 0.9);    // dashed = fold / crease
  const GLUE = rgb(0.6, 0.6, 0.62);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const W = opts.widthIn * PT, H = opts.heightIn * PT, D = opts.depthIn * PT;
  const g = opts.glueIn * PT, m = opts.marginIn * PT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cut = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1, color: CUT });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crease = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.75, color: CREASE, dashArray: [4, 3] });
  const poly = (pts: [number, number][]) => { for (let i = 0; i < pts.length - 1; i++) cut(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]); };

  function legend(pw: number) {
    page.drawLine({ start: { x: m, y: 18 }, end: { x: m + 22, y: 18 }, thickness: 1, color: CUT });
    page.drawText('Cut', { x: m + 28, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: m + 70, y: 18 }, end: { x: m + 92, y: 18 }, thickness: 0.75, color: CREASE, dashArray: [4, 3] });
    page.drawText('Fold / crease', { x: m + 98, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`${opts.widthIn}×${opts.heightIn}×${opts.depthIn}"`, { x: pw - m - 70, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
  }

  if (opts.kind === 'ste') {
    // Straight-tuck-end carton: [glue | front | side | back | side], tuck flaps
    // on the front (top+bottom), dust flaps on the sides.
    const tuckH = D * 0.82, dustH = D * 0.72;
    const netW = g + 2 * W + 2 * D, netH = H + 2 * tuckH;
    const pw = netW + 2 * m, ph = netH + 2 * m;
    page = doc.addPage([pw, ph]);
    const ox = m, oy = m;
    const yB = oy + tuckH, yT = yB + H;
    const x0 = ox, x1 = x0 + g, x2 = x1 + W, x3 = x2 + D, x4 = x3 + W, x5 = x4 + D;
    const ins = Math.min(W, D) * 0.14;

    // Vertical creases between panels
    for (const x of [x1, x2, x3, x4]) crease(x, yB, x, yT);
    // Body outer verticals (cut)
    cut(x0, yB, x0, yT); cut(x5, yB, x5, yT);
    // Body top & bottom edges: crease under flaps (front, sides), cut elsewhere (glue, back)
    for (const [xa, xb, isFlap] of [[x0, x1, false], [x1, x2, true], [x2, x3, true], [x3, x4, false], [x4, x5, true]] as [number, number, boolean][]) {
      (isFlap ? crease : cut)(xa, yT, xb, yT);
      (isFlap ? crease : cut)(xa, yB, xb, yB);
    }
    // Front tuck flaps (top + bottom) — trapezoid
    poly([[x1, yT], [x1 + ins, yT + tuckH], [x2 - ins, yT + tuckH], [x2, yT]]);
    poly([[x1, yB], [x1 + ins, yB - tuckH], [x2 - ins, yB - tuckH], [x2, yB]]);
    // Side dust flaps (top + bottom on both sides)
    for (const [xa, xb] of [[x2, x3], [x4, x5]] as [number, number][]) {
      poly([[xa, yT], [xa + ins, yT + dustH], [xb - ins, yT + dustH], [xb, yT]]);
      poly([[xa, yB], [xa + ins, yB - dustH], [xb - ins, yB - dustH], [xb, yB]]);
    }
    // Glue flap (left, tapered) + hatch
    poly([[x1, yB], [x0 + g * 0.35, yB + g * 0.2], [x0 + g * 0.35, yT - g * 0.2], [x1, yT]]);
    for (let yy = yB + 6; yy < yT - 6; yy += 7) page.drawLine({ start: { x: x0 + g * 0.4, y: yy }, end: { x: x1 - 3, y: yy + 4 }, thickness: 0.4, color: GLUE });
    page.drawText('GLUE', { x: x0 + g * 0.42, y: (yB + yT) / 2, font, size: 7, color: GLUE, rotate: degrees(90) });
    legend(pw);
  } else {
    // Presentation folder: back + front panels (spine crease), bottom pocket
    // flaps that fold up, with side glue tabs.
    const pocket = H * 0.38, tab = D > 0 ? Math.max(D, 24) : 24;
    const netW = 2 * W + tab, netH = H + pocket;
    const pw = netW + 2 * m, ph = netH + 2 * m;
    page = doc.addPage([pw, ph]);
    const ox = m, oy = m;
    const yB = oy + pocket, yT = yB + H;
    const xL = ox, xM = ox + W, xR = ox + 2 * W, xTab = xR + tab;

    // Outer verticals
    cut(xL, yB, xL, yT);                 // left edge
    // Spine crease between back|front
    crease(xM, yB, xM, yT);
    // Right side glue tab crease + cut
    crease(xR, yB, xR, yT);
    poly([[xR, yB], [xTab, yB + tab * 0.4], [xTab, yT - tab * 0.4], [xR, yT]]);
    // Top edge (cut across both panels)
    cut(xL, yT, xR, yT);
    // Body bottom edge = crease where pockets fold up
    crease(xL, yB, xR, yB);
    // Pocket flaps (fold up) below both panels
    for (const [xa, xb] of [[xL, xM], [xM, xR]] as [number, number][]) {
      poly([[xa, yB], [xa, yB - pocket], [xb, yB - pocket], [xb, yB]]);
      // pocket side glue tabs
      crease(xa, yB - pocket, xa, yB); crease(xb, yB - pocket, xb, yB);
    }
    page.drawText('Fold up + glue pockets', { x: xL + 6, y: oy + 4, font, size: 7, color: GLUE });
    legend(pw);
  }

  return doc.save();
}

// ── CSV data-merge (variable data) ──────────────────────────────────────────
// Parse a CSV and impose one personalized cell per record — names, codes,
// vouchers, badges — n-up across sheets, with an optional running number.

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export interface DataMergeOptions {
  cols: number;
  rows: number;
  sheetWIn: number;
  sheetHIn: number;
  marginIn: number;
  gutterIn: number;
  fontSizePt: number;
  showBorder: boolean;
  autoNumber: boolean;
  startNumber: number;
  numberPrefix: string;
  numberPad: number;
  addMarks: boolean;
  markLenIn: number;
  markOffIn: number;
  centerMarks?: boolean;
  markWeightPt?: number;
  qrColumn: string;   // header name to encode as a barcode ('' = none)
  qrSizePt: number;
  symbology?: 'qr' | 'code128' | 'ean13';   // default 'qr'
}

export interface DataMergeResult { pdf: Uint8Array; records: number; columns: string[]; }

// Draw a scannable QR code (via qrcode-generator) at (x,y) with side `size`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawQrCode(page: any, rgb: any, qrcode: any, text: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M');
  qr.addData(text || ' ');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2, total = n + quiet * 2, cell = size / total;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  const black = rgb(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    const mx = x + (quiet + c) * cell;
    const my = y + size - (quiet + r + 1) * cell;
    page.drawRectangle({ x: mx, y: my, width: cell + 0.3, height: cell + 0.3, color: black });
  }
}

// ── Linear barcodes: Code 128 (B) + EAN-13 ──────────────────────────────────
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

// Draw a bar pattern (string of module widths, first is a bar) into [x,x+w].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawBars(page: any, rgb: any, pattern: string, x: number, y: number, w: number, h: number) {
  const total = pattern.split('').reduce((a, d) => a + +d, 0);
  const mod = w / total; let cx = x; let bar = true;
  const black = rgb(0, 0, 0);
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  for (const d of pattern) { const ww = +d * mod; if (bar) page.drawRectangle({ x: cx, y, width: ww, height: h, color: black }); cx += ww; bar = !bar; }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCode128(page: any, rgb: any, text: string, x: number, y: number, w: number, h: number) {
  const data = (text || ' ').replace(/[^\x20-\x7e]/g, '');
  const vals = [104]; // Start B
  for (const ch of data) vals.push(ch.charCodeAt(0) - 32);
  let sum = 104; for (let i = 1; i < vals.length; i++) sum += vals[i]! * i;
  vals.push(sum % 103); vals.push(106); // checksum + stop
  const pattern = vals.map(v => C128[v]!).join('');
  drawBars(page, rgb, pattern, x, y, w, h);
}
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawEan13(page: any, rgb: any, text: string, x: number, y: number, w: number, h: number) {
  let d = (text || '').replace(/\D/g, '').slice(0, 13);
  while (d.length < 12) d = '0' + d;
  if (d.length === 12) { // append check digit
    let s = 0; for (let i = 0; i < 12; i++) s += (+d[i]!) * (i % 2 ? 3 : 1);
    d += String((10 - (s % 10)) % 10);
  }
  const first = +d[0]!, parity = EAN_PARITY[first]!;
  let bits = '101'; // start guard
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]!];
  bits += '01010'; // centre guard
  for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]!];
  bits += '101'; // end guard
  const mod = w / bits.length; const black = rgb(0, 0, 0);
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') page.drawRectangle({ x: x + i * mod, y, width: mod + 0.2, height: h, color: black });
}
// Unified barcode dispatcher. qrcode is only needed for the 'qr' symbology.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawBarcode(page: any, rgb: any, qrcode: any, symbology: string, text: string, x: number, y: number, w: number, h: number) {
  if (symbology === 'code128') drawCode128(page, rgb, text, x, y, w, h);
  else if (symbology === 'ean13') drawEan13(page, rgb, text, x, y, w, h);
  else drawQrCode(page, rgb, qrcode, text, x, y, Math.min(w, h));
}

export async function imposeDataMerge(csvText: string, opts: DataMergeOptions): Promise<DataMergeResult> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const table = parseCSV(csvText);
  if (table.length < 2) throw new Error('CSV needs a header row and at least one record.');
  const headers = table[0]!.map(h => h.trim());
  const records = table.slice(1);
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT, mPt = opts.marginIn * PT, gPt = opts.gutterIn * PT;
  const cols = Math.max(1, opts.cols), rows = Math.max(1, opts.rows);
  const cellW = (shW - 2 * mPt - gPt * (cols - 1)) / cols;
  const cellH = (shH - 2 * mPt - gPt * (rows - 1)) / rows;
  const perSheet = cols * rows;
  const numSheets = Math.max(1, Math.ceil(records.length / perSheet));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
  const qrIdx = opts.qrColumn ? headers.indexOf(opts.qrColumn) : -1;
  const sym = opts.symbology ?? 'qr';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qrcode: any = null;
  if (qrIdx >= 0 && sym === 'qr') { const mod = await import('qrcode-generator'); qrcode = (mod as unknown as { default?: unknown }).default ?? mod; }
  let idx = 0;
  for (let si = 0; si < numSheets; si++) {
    const pg = doc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (idx >= records.length) continue;
      const rec = records[idx]!; const num = opts.startNumber + idx; idx++;
      const x = mPt + c * (cellW + gPt), y = shH - mPt - cellH - r * (cellH + gPt);
      if (opts.showBorder) pg.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.8, 0.8, 0.82), borderWidth: 0.5 });
      const qrOn = qrIdx >= 0 && (sym !== 'qr' || !!qrcode);
      const qrSize = qrOn ? Math.max(28, Math.min(opts.qrSizePt, cellH - 16, cellW * 0.5)) : 0;
      const maxChars = qrOn ? 20 : 34;
      let ty = y + cellH - opts.fontSizePt - 8;
      for (let f = 0; f < headers.length && f < 6; f++) {
        const val = (rec[f] ?? '').trim();
        if (!val) continue;
        const size = f === 0 ? opts.fontSizePt + 2 : opts.fontSizePt;
        pg.drawText(val.length > maxChars ? val.slice(0, maxChars - 1) + '…' : val, { x: x + 8, y: ty, font: f === 0 ? bold : font, size, color: rgb(0.1, 0.1, 0.1) });
        ty -= size + 4;
        if (ty < y + 14) break;
      }
      if (qrOn) {
        const val = (rec[qrIdx] ?? '').trim();
        if (sym === 'qr') drawBarcode(pg, rgb, qrcode, 'qr', val, x + cellW - qrSize - 8, y + (cellH - qrSize) / 2, qrSize, qrSize);
        else { const bw = Math.min(cellW - 16, qrSize * 2.2), bh = qrSize * 0.6; drawBarcode(pg, rgb, null, sym, val, x + cellW - bw - 8, y + (cellH - bh) / 2, bw, bh); }
      }
      if (opts.autoNumber) {
        const label = `${opts.numberPrefix}${String(num).padStart(opts.numberPad, '0')}`;
        const tw = font.widthOfTextAtSize(label, opts.fontSizePt);
        pg.drawText(label, { x: qrOn ? x + 8 : x + cellW - tw - 8, y: y + 8, font, size: opts.fontSizePt, color: rgb(0.42, 0.42, 0.45) });
      }
      if (opts.addMarks) drawCropMarks(pg, rgb, x, y, cellW, cellH, off, len, { center: !!opts.centerMarks, weight: opts.markWeightPt });
    }
  }
  return { pdf: await doc.save(), records: records.length, columns: headers };
}

// ── Zine (4 panels per side, 2 sides = 8-page booklet from 2 sheets) ────────
// Same as saddle stitch; the "zine" label and preset distinguish the use case.

// ── Registration Marks ──────────────────────────────────────────────────────
// Standalone press registration targets (crosshair or bullseye) at the corners
// and edge midpoints — used to align colour separations on press.

export interface RegMarkOptions { marginIn: number; sizeIn: number; style: 'target' | 'crosshair'; }

export async function addRegistrationMarks(bytes: Uint8Array, opts: RegMarkOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const black = rgb(0, 0, 0);
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const m = opts.marginIn * PT, r = (opts.sizeIn * PT) / 2;
    const spots: [number, number][] = [
      [m, m], [w - m, m], [m, h - m], [w - m, h - m],
      [w / 2, m], [w / 2, h - m], [m, h / 2], [w - m, h / 2],
    ];
    for (const [cx, cy] of spots) {
      pg.drawLine({ start: { x: cx - r * 1.5, y: cy }, end: { x: cx + r * 1.5, y: cy }, thickness: 0.5, color: black });
      pg.drawLine({ start: { x: cx, y: cy - r * 1.5 }, end: { x: cx, y: cy + r * 1.5 }, thickness: 0.5, color: black });
      if (opts.style === 'target') {
        pg.drawEllipse({ x: cx, y: cy, xScale: r, yScale: r, borderColor: black, borderWidth: 0.5 });
        pg.drawEllipse({ x: cx, y: cy, xScale: r * 0.5, yScale: r * 0.5, borderColor: black, borderWidth: 0.5 });
      }
    }
  }
  return doc.save();
}

// ── Insert Pages ────────────────────────────────────────────────────────────
// Insert blank pages (page-1 size) either before a given page, or after every
// N pages (e.g. to interleave slip-sheets).

export interface InsertOptions { mode: 'at' | 'everyN'; position: number; everyN: number; count: number; }

export async function insertPages(bytes: Uint8Array, opts: InsertOptions): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const { width, height } = src.getPage(0).getSize();
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  const blanks = Math.max(1, opts.count);
  const addBlanks = () => { for (let b = 0; b < blanks; b++) out.addPage([width, height]); };
  if (opts.mode === 'everyN') {
    const N = Math.max(1, opts.everyN);
    for (let i = 0; i < n; i++) { out.addPage(copied[i]!); if ((i + 1) % N === 0 && i < n - 1) addBlanks(); }
  } else {
    const pos = Math.min(Math.max(1, opts.position), n + 1); // insert before this 1-indexed page
    for (let i = 0; i < n; i++) { if (i === pos - 1) addBlanks(); out.addPage(copied[i]!); }
    if (pos - 1 >= n) addBlanks();
  }
  return out.save();
}

// ── Mix / Interleave two PDFs ───────────────────────────────────────────────
// Weave pages from two documents: A1,B1,A2,B2… Ideal for combining single-sided
// front & back scans into one duplex-ordered file. reverseB flips the back stack.

export async function mixPdfs(aBytes: Uint8Array, bBytes: Uint8Array, reverseB = false): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const A = await PDFDocument.load(aBytes, { ignoreEncryption: true });
  const B = await PDFDocument.load(bBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const ca = await out.copyPages(A, A.getPageIndices());
  let cb = await out.copyPages(B, B.getPageIndices());
  if (reverseB) cb = cb.reverse();
  const max = Math.max(ca.length, cb.length);
  for (let i = 0; i < max; i++) { if (i < ca.length) out.addPage(ca[i]!); if (i < cb.length) out.addPage(cb[i]!); }
  return out.save();
}

// ── Nudge ───────────────────────────────────────────────────────────────────
// Shift every page's content by a small offset and/or rotate it about its centre
// — a press fudge for plate mis-registration or trim drift.

export interface NudgeOptions { dxIn: number; dyIn: number; rotateDeg: number; }

export async function nudgePdf(bytes: Uint8Array, opts: NudgeOptions): Promise<Uint8Array> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  const dx = opts.dxIn * PT, dy = opts.dyIn * PT, rad = (opts.rotateDeg * Math.PI) / 180;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i]!.getSize();
    const pg = out.addPage([w, h]);
    const cos = Math.cos(rad), sin = Math.sin(rad), cx = w / 2, cy = h / 2;
    // Combined matrix: translate(cx+dx,cy+dy) · rotate · translate(-cx,-cy)
    const a = cos, b = sin, c = -sin, d = cos;
    const e = cx + dx - (a * cx + c * cy), f = cy + dy - (b * cx + d * cy);
    pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
    pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h });
    pg.pushOperators(popGraphicsState());
  }
  return out.save();
}

// ── PDF Repair / Normalize ──────────────────────────────────────────────────
// Rebuild the document from scratch — drops broken incremental-update cruft and
// dead objects, and re-writes a clean cross-reference table.

export async function repairPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: true });
}

// ── Backdrop ────────────────────────────────────────────────────────────────
// Paint a solid colour behind every page's content — turns transparent /
// borderless art onto a coloured stock, or flattens knockouts to a base.

export interface BackdropOptions { r: number; g: number; b: number; }

export async function addBackdrop(bytes: Uint8Array, opts: BackdropOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i]!.getSize();
    const pg = out.addPage([w, h]);
    pg.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(opts.r, opts.g, opts.b) });
    pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h });
  }
  return out.save();
}

// ── QR / Barcode stamp (standalone) ─────────────────────────────────────────
// Stamp a scannable QR encoding a fixed string (URL, vCard, code) on every page.

export interface QrStampOptions {
  text: string; sizePt: number; position: 'br' | 'bl' | 'tr' | 'tl' | 'center'; marginPt: number;
  symbology?: 'qr' | 'code128' | 'ean13';   // default 'qr'
}

export async function addQrStamp(bytes: Uint8Array, opts: QrStampOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const sym = opts.symbology ?? 'qr';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qrcode: any = null;
  if (sym === 'qr') { const mod = await import('qrcode-generator'); qrcode = (mod as unknown as { default?: any }).default ?? mod; }
  const s = opts.sizePt, m = opts.marginPt;
  // Linear barcodes are ~2.5× wider than tall; QR is square.
  const bw = sym === 'qr' ? s : s * 2.4, bh = s;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const x = opts.position === 'center' ? (w - bw) / 2 : opts.position.includes('l') ? m : w - bw - m;
    const y = opts.position === 'center' ? (h - bh) / 2 : opts.position.includes('t') ? h - bh - m : m;
    drawBarcode(pg, rgb, qrcode, sym, opts.text || ' ', x, y, bw, bh);
  }
  return doc.save();
}

// ── Dimensions ──────────────────────────────────────────────────────────────
// Annotate each page with its trim size (inches + points) along the bottom and
// left edges — a quick check tool before imposing.

export async function addDimensions(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const col = rgb(0.85, 0.11, 0.14);
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const wl = `${(w / PT).toFixed(2)}in - ${Math.round(w)} pt`;
    const hl = `${(h / PT).toFixed(2)}in - ${Math.round(h)} pt`;
    const ww = font.widthOfTextAtSize(wl, 8);
    pg.drawText(wl, { x: (w - ww) / 2, y: 5, font, size: 8, color: col });
    pg.drawText(hl, { x: 11, y: h / 2 - font.widthOfTextAtSize(hl, 8) / 2, font, size: 8, color: col, rotate: degrees(90) });
  }
  return doc.save();
}

// ── Download helper ─────────────────────────────────────────────────────────

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob=new Blob([bytes as BlobPart],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export function downloadMultiple(files: Uint8Array[], baseName: string) {
  files.forEach((bytes,i) => downloadPdf(bytes,`${baseName}-part${i+1}.pdf`));
}
