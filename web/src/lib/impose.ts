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

// ── Calendar (front/back pairing + rotate back cover) ───────────────────────
// Pairs source pages for wall/desk calendars. Full-sheet: one page per printed
// side, backs rotated 180° so a top-bound calendar reads right when flipped.
// Half-sheet: two source pages share a side (image on top, grid on the bottom),
// folded in the middle.

export interface CalendarOptions {
  halfSheet: boolean;
  rotateBack: boolean;
  addMarks: boolean; markLenIn: number; markOffIn: number; centerMarks?: boolean; markWeightPt?: number;
}

export async function imposeCalendar(bytes: Uint8Array, opts: CalendarOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = srcDoc.getPages();
  const N = pages.length;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(pages);
  const markStyle: MarkStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
  if (!opts.halfSheet) {
    for (let i = 0; i < N; i++) {
      const { width: w, height: h } = pages[i]!.getSize();
      const pg = outDoc.addPage([w, h]);
      const isBack = i % 2 === 1;
      if (opts.rotateBack && isBack) pg.drawPage(embeds[i]!, { x: w, y: h, width: w, height: h, rotate: degrees(180) });
      else pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h });
      if (opts.addMarks) drawCropMarks(pg, rgb, 0, 0, w, h, off, len, markStyle);
    }
  } else {
    const { width: w, height: h } = pages[0]!.getSize();
    for (let k = 0; k * 2 < Math.max(1, N); k++) {
      const top = k * 2, bot = k * 2 + 1;
      const pg = outDoc.addPage([w, 2 * h]);
      if (top < N) pg.drawPage(embeds[top]!, { x: 0, y: h, width: w, height: h });          // upper half
      if (bot < N) {
        if (opts.rotateBack) pg.drawPage(embeds[bot]!, { x: w, y: h, width: w, height: h, rotate: degrees(180) }); // lower half, inverted for fold
        else pg.drawPage(embeds[bot]!, { x: 0, y: 0, width: w, height: h });
      }
      if (opts.addMarks) { drawCropMarks(pg, rgb, 0, h, w, h, off, len, markStyle); drawCropMarks(pg, rgb, 0, 0, w, h, off, len, markStyle); }
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
  blend?: 'normal' | 'multiply';   // Multiply drops white areas (logos on colour)
}

export async function overlayPdf(baseBytes: Uint8Array, stampBytes: Uint8Array, opts: OverlayOptions): Promise<Uint8Array> {
  const { PDFDocument, BlendMode } = await import('pdf-lib');
  const baseDoc=await PDFDocument.load(baseBytes,{ignoreEncryption:true});
  const stampDoc=await PDFDocument.load(stampBytes,{ignoreEncryption:true});
  const stampPages=stampDoc.getPages();
  const basePages=baseDoc.getPages();
  const blendMode = opts.blend === 'multiply' ? BlendMode.Multiply : undefined;
  for (let i=0; i<basePages.length; i++) {
    const pg=basePages[i]!;
    const {width:w,height:h}=pg.getSize();
    const stamp=stampPages[i%stampPages.length]!;
    const {width:sw,height:sh}=stamp.getSize();
    const [emb]=await baseDoc.embedPages([stamp]);
    if (!emb) continue;
    const bm = blendMode ? { blendMode } : {};
    if (opts.mode==='fill') {
      pg.drawPage(emb,{x:0,y:0,width:w,height:h,opacity:opts.opacity,...bm});
    } else if (opts.mode==='center') {
      const scale=Math.min(w/sw,h/sh)*0.85;
      const dw=sw*scale, dh=sh*scale, pad=opts.paddingPt ?? 0, a=opts.anchor ?? 'mc';
      const hx = a[1]==='l' ? pad : a[1]==='r' ? w-dw-pad : (w-dw)/2;
      const vy = a[0]==='b' ? pad : a[0]==='t' ? h-dh-pad : (h-dh)/2;
      pg.drawPage(emb,{x:hx,y:vy,width:dw,height:dh,opacity:opts.opacity,...bm});
    } else {
      // tile
      const tC=opts.tileCols??2, tR=opts.tileRows??2;
      const tw=w/tC, th=h/tR;
      for (let r=0; r<tR; r++) for (let c=0; c<tC; c++)
        pg.drawPage(emb,{x:c*tw,y:r*th,width:tw,height:th,opacity:opts.opacity,...bm});
    }
  }
  return baseDoc.save();
}

// ── Distortion Compensation (flexo / gravure cylinder pre-shrink) ───────────
// Pre-shrinks artwork so that after wrapping a printing cylinder (which stretches
// the plate circumferentially) the printed result comes out at the right size.
// factorPct < 100 shrinks; the standard factor = D / (D + 2·plateThickness).

export interface DistortOptions {
  factorPct: number;                       // e.g. 97.5
  direction: 'circ' | 'cross' | 'both';    // circumferential (height) / cross-web (width) / both
  pages?: string;
}

export async function distortPdf(bytes: Uint8Array, opts: DistortOptions): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(opts.pages ?? 'all', srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const f = Math.max(0.5, Math.min(1.5, opts.factorPct / 100));
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    const on = sel.has(i + 1);
    const fw = on && (opts.direction === 'cross' || opts.direction === 'both') ? f : 1;
    const fh = on && (opts.direction === 'circ' || opts.direction === 'both') ? f : 1;
    const nw = w * fw, nh = h * fh;
    const pg = outDoc.addPage([nw, nh]);
    pg.drawPage(embeds[i]!, { x: 0, y: 0, width: nw, height: nh });
  }
  return outDoc.save();
}

// Compensation factor from cylinder geometry (all mm). Returns a percentage.
export function distortFactorFromCylinder(cylinderDiaMm: number, plateThickMm: number): number {
  if (cylinderDiaMm <= 0) return 100;
  return (cylinderDiaMm / (cylinderDiaMm + 2 * plateThickMm)) * 100;
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

export interface ColorBarOpts {
  edge: 'bottom' | 'top' | 'left' | 'right';
  heightIn: number;
  shape?: 'square' | 'circle' | 'rect';
  spot?: boolean;    // add a registration/spot patch
  pages?: string;
}

export async function addColorBar(bytes: Uint8Array, opts: ColorBarOpts): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(opts.pages ?? 'all', srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const barH = opts.heightIn * PT;
  const swatches = opts.spot ? [...COLOR_BAR_SWATCHES, { r: 0.6, g: 0.1, b: 0.5 }, { r: 0.1, g: 0.5, b: 0.4 }] : COLOR_BAR_SWATCHES;
  const shape = opts.shape ?? 'rect';
  const vertical = opts.edge === 'left' || opts.edge === 'right';
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i]!.getSize();
    if (!sel.has(i + 1)) { const pg = outDoc.addPage([pw, ph]); pg.drawPage(embeds[i]!, { x: 0, y: 0, width: pw, height: ph }); continue; }
    // Grow the page along the chosen edge; place content offset from the bar.
    const nw = vertical ? pw + barH : pw, nh = vertical ? ph : ph + barH;
    const cx = opts.edge === 'left' ? barH : 0, cy = opts.edge === 'bottom' ? barH : 0;
    const pg = outDoc.addPage([nw, nh]);
    pg.drawPage(embeds[i]!, { x: cx, y: cy, width: pw, height: ph });
    const n = swatches.length, along = vertical ? ph : pw, step = along / n;
    for (let j = 0; j < n; j++) {
      const s = swatches[j]!, col = rgb(s.r, s.g, s.b);
      const bx = opts.edge === 'left' ? 0 : opts.edge === 'right' ? pw : cx + j * step;
      const by = opts.edge === 'bottom' ? 0 : opts.edge === 'top' ? ph : cy + j * step;
      if (vertical) {
        if (shape === 'circle') pg.drawEllipse({ x: bx + barH / 2, y: by + step / 2, xScale: barH / 2 - 1, yScale: step / 2 - 1, color: col });
        else pg.drawRectangle({ x: bx, y: by, width: barH, height: shape === 'square' ? Math.min(step, barH) : step, color: col, borderWidth: 0 });
      } else {
        if (shape === 'circle') pg.drawEllipse({ x: bx + step / 2, y: by + barH / 2, xScale: step / 2 - 1, yScale: barH / 2 - 1, color: col });
        else pg.drawRectangle({ x: bx, y: by, width: shape === 'square' ? Math.min(step, barH) : step, height: barH, color: col, borderWidth: 0 });
      }
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
  mode?: 'scale' | 'solid' | 'mirror' | 'repeat';  // default 'scale'
  color?: { r: number; g: number; b: number };      // for 'solid'
  pages?: string;
}

export async function generateBleed(bytes: Uint8Array, opts: BleedOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(opts.pages ?? 'all', srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const b = opts.bleedIn * PT, mode = opts.mode ?? 'scale';
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    const emb = embeds[i]!;
    if (!sel.has(i + 1)) { const pg = outDoc.addPage([w, h]); pg.drawPage(emb, { x: 0, y: 0, width: w, height: h }); continue; }
    const pg = outDoc.addPage([w + 2 * b, h + 2 * b]);
    if (mode === 'scale') {
      pg.drawPage(emb, { x: 0, y: 0, width: w + 2 * b, height: h + 2 * b });
    } else if (mode === 'solid') {
      const col = opts.color ?? { r: 1, g: 1, b: 1 };
      pg.drawRectangle({ x: 0, y: 0, width: w + 2 * b, height: h + 2 * b, color: rgb(col.r, col.g, col.b) });
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    } else if (mode === 'repeat') {
      // repeat: extend the edge outward with un-mirrored copies (8 around + centre).
      for (const [ox, oy] of [[-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, -h], [-w, h], [w, h]] as [number, number][])
        pg.drawPage(emb, { x: b + ox, y: b + oy, width: w, height: h });
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    } else {
      // mirror: reflect the page across each edge into the bleed, then the real
      // page on top. Order: corners, edges, centre.
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
  font?: 'helvetica' | 'times' | 'courier';
  rotationDeg?: 0 | 90 | 180 | 270;   // rotate the text (e.g. spine labels)
}

export async function addHeaderFooter(bytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fontName = opts.font === 'times' ? StandardFonts.TimesRoman : opts.font === 'courier' ? StandardFonts.Courier : StandardFonts.Helvetica;
  const font = await doc.embedFont(fontName);
  const rot = opts.rotationDeg ?? 0;
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
      pg.drawText(text, { x, y, font, size: opts.fontSizePt, color: rgb(0.1, 0.1, 0.1), ...(rot ? { rotate: degrees(rot) } : {}) });
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
  color?: { r: number; g: number; b: number };   // default mid-grey
  pages?: string;                                  // default all
}

export async function addTextWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const rad = (opts.angleDeg * Math.PI) / 180;
  const c = opts.color ?? { r: 0.5, g: 0.5, b: 0.5 };
  const pages = doc.getPages();
  const sel = parsePageRange(opts.pages ?? 'all', pages.length);
  for (let i = 0; i < pages.length; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    const tw = font.widthOfTextAtSize(opts.text || 'PROOF', opts.fontSizePt);
    // Position the baseline so the text's midpoint lands at the page centre.
    const x = w / 2 - (tw / 2) * Math.cos(rad);
    const y = h / 2 - (tw / 2) * Math.sin(rad);
    pg.drawText(opts.text || 'PROOF', {
      x, y, font, size: opts.fontSizePt,
      color: rgb(c.r, c.g, c.b), opacity: opts.opacity, rotate: degrees(opts.angleDeg),
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

export interface CollatingOptions {
  edge: 'left' | 'right';
  startOffsetPt?: number;   // first mark's distance from the top (default 20)
  markWpt?: number;         // mark width  (default 9)
  markHpt?: number;         // mark height (default 14)
  smallMarks?: boolean;     // draw marks at half height
  pagesPerSig?: number;     // pages that make up one signature (default 16)
  sigsPerSet?: number;      // staircase length before it resets/wraps (default 12)
  stepPt?: number;          // vertical distance between successive marks (default = markH)
  color?: { r: number; g: number; b: number };   // primary mark colour (default black)
  color2?: { r: number; g: number; b: number };  // contrasting colour for the 2nd pass
  opacity?: number;         // default 1
  pages?: string;           // which pages to mark (default all)
}

// Collating (gathering) marks live on the spine of each *signature* — one mark
// per folded section, stepped progressively down the spine so a correctly
// gathered book block shows a clean diagonal staircase. When the staircase
// reaches `sigsPerSet` it resets to the top and the next pass is drawn in a
// contrasting colour so the two cycles stay distinguishable.
export async function addCollatingMarks(bytes: Uint8Array, opts: CollatingOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const startOff = opts.startOffsetPt ?? 20;
  const mw = opts.markWpt ?? 9;
  const baseH = opts.markHpt ?? 14;
  const mh = opts.smallMarks ? baseH / 2 : baseH;
  const pps = Math.max(1, Math.round(opts.pagesPerSig ?? 16));
  const sps = Math.max(1, Math.round(opts.sigsPerSet ?? 12));
  const step = opts.stepPt ?? baseH;
  const c1 = opts.color ?? { r: 0, g: 0, b: 0 };
  const c2 = opts.color2 ?? c1;
  const op = opts.opacity ?? 1;
  const sel = parsePageRange(opts.pages ?? 'all', n);
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    const sig = Math.floor(i / pps);      // which signature this page belongs to
    const slot = sig % sps;               // position within the staircase
    const pass = Math.floor(sig / sps);   // wrap pass (0,1,2…)
    const col = pass % 2 === 0 ? c1 : c2;
    const y = h - startOff - mh - slot * step;
    const x = opts.edge === 'right' ? w - mw : 0;
    pg.drawRectangle({ x, y, width: mw, height: mh, color: rgb(col.r, col.g, col.b), opacity: op });
  }
  return doc.save();
}

// ── OMR (Optical Mark Recognition) marks ────────────────────────────────────
// A row of black bars along one sheet edge that automated bindery equipment
// reads to trigger fold / collate / cut / stack operations. A program number
// (0…2^bits-1) is encoded across the data bars — MSB first — either as
// present/absent (`binary`) or long/short (`barheight`), with an always-on
// leading sync bar. Geometry follows the pdfpress panel: `widthPt` is the long
// readable bar length (perpendicular to the feed / into the page), `heightPt`
// the thin dimension along the feed, `spacingPt` the pitch between bars.
export interface OmrOptions {
  edge: 'top' | 'bottom' | 'left' | 'right';
  encoding: 'binary' | 'barheight';
  program: number;          // 0 … 2^bitCount − 1
  bitCount: number;         // 4 | 8 | 12 | 16
  repeats?: number;         // repeat the whole pattern down the track (default 1)
  widthPt?: number;         // readable bar length ⟂ to feed (default 14.17 = 5 mm)
  heightPt?: number;        // thin dimension along feed  (default 2.83 = 1 mm)
  spacingPt?: number;       // pitch between bars (default = widthPt)
  startOffsetPt?: number;   // offset along the track from the leading corner (default 40)
  edgeOffsetPt?: number;    // inward offset from the paper edge (default 8.5 = 3 mm)
  sync?: boolean;           // leading always-on sync/clock bar (default true)
  color?: { r: number; g: number; b: number };
  opacity?: number;
  pages?: string;
}

export async function addOmrMarks(bytes: Uint8Array, opts: OmrOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const bitCount = Math.max(1, Math.round(opts.bitCount || 8));
  const maxVal = Math.pow(2, bitCount) - 1;
  const prog = Math.max(0, Math.min(maxVal, Math.round(opts.program || 0)));
  const bits: number[] = [];
  for (let b = bitCount - 1; b >= 0; b--) bits.push((prog >> b) & 1);   // MSB first
  const repeats = Math.max(1, Math.round(opts.repeats ?? 1));
  const length = opts.widthPt ?? 14.17;   // long readable dimension (panel "Width")
  const thick = opts.heightPt ?? 2.83;    // thin dimension along feed (panel "Height")
  const pitch = opts.spacingPt ?? length;
  const startOff = opts.startOffsetPt ?? 40;
  const edgeOff = opts.edgeOffsetPt ?? 8.5;
  const sync = opts.sync !== false;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const op = opts.opacity ?? 1;
  const horiz = opts.edge === 'top' || opts.edge === 'bottom';
  const sel = parsePageRange(opts.pages ?? 'all', n);

  // slot list: optional sync (always full), then the data bits, ×repeats
  const slots: { on: boolean; full: boolean }[] = [];
  for (let r = 0; r < repeats; r++) {
    if (sync) slots.push({ on: true, full: true });
    for (const bit of bits) {
      if (opts.encoding === 'barheight') slots.push({ on: true, full: bit === 1 });
      else slots.push({ on: bit === 1, full: true });
    }
  }

  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    slots.forEach((s, k) => {
      if (!s.on) return;
      const len = s.full ? length : length * 0.45;   // readable extent (short for a 0 bar)
      const pos = startOff + k * pitch;               // position along the track
      let x: number, y: number, rw: number, rh: number;
      if (horiz) {                                    // top / bottom → track along X
        rw = thick; rh = len;
        x = pos;
        y = opts.edge === 'bottom' ? edgeOff : h - edgeOff - len;
      } else {                                        // left / right → track along Y
        rw = len; rh = thick;
        y = pos;
        x = opts.edge === 'left' ? edgeOff : w - edgeOff - len;
      }
      pg.drawRectangle({ x, y, width: rw, height: rh, color: rgb(c.r, c.g, c.b), opacity: op });
    });
  }
  return doc.save();
}

// ── Gathering marks ─────────────────────────────────────────────────────────
// The gripper-edge cousin of collating marks: one mark per *section*, stepped
// horizontally along the leading (gripper) edge instead of down the spine.
// After cutting and stacking, a correct gather shows a clean staircase across
// the stack edge. Marks sit an `edgeOffset` in from the gripper edge to clear
// the press gripper zone (10–15 mm), and reset with a contrasting colour once
// the staircase reaches `sectionsPerSet`.
export interface GatheringOptions {
  edge: 'top' | 'bottom';       // gripper (leading) edge
  startOffsetPt?: number;       // first mark's distance from the left (default 18)
  edgeOffsetPt?: number;        // inward from the gripper edge (default 8)
  markWpt?: number;             // default 6
  markHpt?: number;             // default 6
  pagesPerSection?: number;     // pages that make up one section (default 16)
  sectionsPerSet?: number;      // staircase length before it resets (default 12)
  stepPt?: number;              // horizontal distance between marks (default 8)
  color?: { r: number; g: number; b: number };
  color2?: { r: number; g: number; b: number };  // contrasting colour for the 2nd pass
  opacity?: number;
  pages?: string;
}

export async function addGatheringMarks(bytes: Uint8Array, opts: GatheringOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const startOff = opts.startOffsetPt ?? 18;
  const edgeOff = opts.edgeOffsetPt ?? 8;
  const mw = opts.markWpt ?? 6;
  const mh = opts.markHpt ?? 6;
  const pps = Math.max(1, Math.round(opts.pagesPerSection ?? 16));
  const sps = Math.max(1, Math.round(opts.sectionsPerSet ?? 12));
  const step = opts.stepPt ?? 8;
  const c1 = opts.color ?? { r: 0, g: 0, b: 0 };
  const c2 = opts.color2 ?? c1;
  const op = opts.opacity ?? 1;
  const sel = parsePageRange(opts.pages ?? 'all', n);
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { height: h } = pg.getSize();
    const sec = Math.floor(i / pps);      // which section this page belongs to
    const slot = sec % sps;               // position within the staircase
    const pass = Math.floor(sec / sps);   // wrap pass (0,1,2…)
    const col = pass % 2 === 0 ? c1 : c2;
    const x = startOff + slot * step;
    const y = opts.edge === 'top' ? h - edgeOff - mh : edgeOff;
    pg.drawRectangle({ x, y, width: mw, height: mh, color: rgb(col.r, col.g, col.b), opacity: op });
  }
  return doc.save();
}

// ── Folding marks ───────────────────────────────────────────────────────────
// Dashed tick guides in the trim margin at each fold position so the finisher
// knows where to fold. Supports the common brochure schemes plus a custom
// position list. Ticks are drawn at the ends of each fold line (top/bottom for
// vertical folds, left/right for horizontal); `fullLine` draws a light guide
// clear across the sheet instead.
export interface FoldMarksOptions {
  scheme: 'half' | 'letter' | 'zfold' | 'gate' | 'doubleparallel' | 'roll' | 'accordion' | 'custom';
  orientation: 'vertical' | 'horizontal';   // vertical folds divide the width
  panels?: number;            // accordion / roll panel count (default 4)
  positions?: string;         // custom: "33,66" (%) · "0.33,0.66" · "1/3,2/3"
  edge: 'top' | 'bottom' | 'both';           // which end(s) of the fold line get a tick
  markLenPt?: number;         // tick length from the edge (default 18)
  offsetPt?: number;          // gap between the paper edge and the tick (default 0)
  style: 'dashed' | 'solid' | 'dotted';
  weightPt?: number;          // line weight (default 0.75)
  fullLine?: boolean;         // guide line across the whole sheet instead of ticks
  color?: { r: number; g: number; b: number };
  pages?: string;
}

// Fold-line positions as fractions of the fold axis (0..1). `axisPt` is only
// needed for the roll fold, whose panels shrink so each tucks inside the last.
function foldFractions(opts: FoldMarksOptions, axisPt: number): number[] {
  const n = Math.max(2, Math.round(opts.panels ?? 4));
  const even = (k: number) => Array.from({ length: k - 1 }, (_, i) => (i + 1) / k);
  switch (opts.scheme) {
    case 'half': return [0.5];
    case 'letter': return [1 / 3, 2 / 3];
    case 'zfold': return [1 / 3, 2 / 3];
    case 'gate': return [0.25, 0.75];
    case 'doubleparallel': return [0.25, 0.5, 0.75];
    case 'accordion': return even(n);
    case 'roll': {
      // panels decrease outward→inner by a 1/16" (4.5 pt) tuck allowance
      const base = axisPt / n, d = 4.5;
      const widths = Array.from({ length: n }, (_, i) => base + ((n - 1 - i) - (n - 1) / 2) * d);
      const fr: number[] = []; let cum = 0;
      for (let i = 0; i < n - 1; i++) { cum += widths[i]!; fr.push(cum / axisPt); }
      return fr;
    }
    case 'custom':
      return (opts.positions ?? '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
        if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return (a ?? 0) / (b ?? 1); }
        const v = parseFloat(s); return isNaN(v) ? -1 : v > 1 ? v / 100 : v;   // >1 ⇒ percent
      }).filter(v => v > 0 && v < 1).sort((a, b) => a - b);
    default: return [0.5];
  }
}

export async function addFoldMarks(bytes: Uint8Array, opts: FoldMarksOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, LineCapStyle } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const len = opts.markLenPt ?? 18;
  const off = opts.offsetPt ?? 0;
  const wgt = opts.weightPt ?? 0.75;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const col = rgb(c.r, c.g, c.b);
  const dash = opts.style === 'dashed' ? [4, 3] : opts.style === 'dotted' ? [wgt, wgt * 2.5] : undefined;
  const cap = opts.style === 'dotted' ? LineCapStyle.Round : LineCapStyle.Butt;
  const wantLo = opts.edge === 'bottom' || opts.edge === 'both';   // bottom / left end
  const wantHi = opts.edge === 'top' || opts.edge === 'both';      // top / right end
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const vertical = opts.orientation === 'vertical';

  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    const axis = vertical ? w : h;
    const draw = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      pg.drawLine({ start: a, end: b, thickness: wgt, color: col, ...(dash ? { dashArray: dash } : {}), lineCap: cap });
    for (const f of foldFractions(opts, axis)) {
      const p = f * axis;
      if (vertical) {                                  // fold line runs top↕bottom at x=p
        if (opts.fullLine) { draw({ x: p, y: off }, { x: p, y: h - off }); continue; }
        if (wantHi) draw({ x: p, y: h - off }, { x: p, y: h - off - len });   // top tick
        if (wantLo) draw({ x: p, y: off }, { x: p, y: off + len });            // bottom tick
      } else {                                         // fold line runs left↔right at y=p
        if (opts.fullLine) { draw({ x: off, y: p }, { x: w - off, y: p }); continue; }
        if (wantHi) draw({ x: w - off, y: p }, { x: w - off - len, y: p });   // right tick
        if (wantLo) draw({ x: off, y: p }, { x: off + len, y: p });            // left tick
      }
    }
  }
  return doc.save();
}

// ── Lay marks ───────────────────────────────────────────────────────────────
// Press-sheet alignment guides for the operator: front lay at the gripper
// (leading) edge showing the feed direction, and side lay on the guide side
// for lateral registration. Marks sit an `offsetPt` in from each corner in the
// trim waste, drawn as an arrow (points into the sheet / feed direction), a
// plain line tick, or a crosshair.
export interface LayMarksOptions {
  markType: 'arrow' | 'line' | 'cross';
  edges: 'gripper' | 'sideguide' | 'both';
  gripperEdge?: 'top' | 'bottom';     // leading edge (default bottom)
  sideGuideSide: 'left' | 'right';    // operator / drive side
  sizePt?: number;          // mark size (default 14.17 = 5 mm)
  thicknessPt?: number;     // line weight (default 0.5)
  offsetPt?: number;        // inset from each corner (default 14.17)
  color?: { r: number; g: number; b: number };
  pages?: string;
}

export async function addLayMarks(bytes: Uint8Array, opts: LayMarksOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const size = opts.sizePt ?? 14.17;
  const t = opts.thicknessPt ?? 0.5;
  const o = opts.offsetPt ?? 14.17;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const col = rgb(c.r, c.g, c.b);
  const wantGrip = opts.edges === 'gripper' || opts.edges === 'both';
  const wantSide = opts.edges === 'sideguide' || opts.edges === 'both';
  const gripBottom = (opts.gripperEdge ?? 'bottom') === 'bottom';
  const sel = parsePageRange(opts.pages ?? 'all', n);

  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i]!;
    const { width: w, height: h } = pg.getSize();
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: col });
    // one mark: anchor (x,y) with into-sheet direction (dx,dy)
    const mark = (x: number, y: number, dx: number, dy: number) => {
      if (opts.markType === 'cross') { line(x - size / 2, y, x + size / 2, y); line(x, y - size / 2, x, y + size / 2); return; }
      const tx = x + dx * size, ty = y + dy * size;
      line(x, y, tx, ty);                                   // shaft (line + arrow)
      if (opts.markType === 'arrow') {
        const hl = size * 0.4, px = -dy, py = dx;           // perpendicular for the head
        line(tx, ty, tx - dx * hl + px * hl * 0.6, ty - dy * hl + py * hl * 0.6);
        line(tx, ty, tx - dx * hl - px * hl * 0.6, ty - dy * hl - py * hl * 0.6);
      }
    };
    if (wantGrip) {                                          // two front-lay marks on the gripper edge
      const gy = gripBottom ? o : h - o, gdy = gripBottom ? 1 : -1;
      mark(o, gy, 0, gdy); mark(w - o, gy, 0, gdy);
    }
    if (wantSide) {                                          // two side-lay marks on the guide side
      const sx = opts.sideGuideSide === 'left' ? o : w - o, sdx = opts.sideGuideSide === 'left' ? 1 : -1;
      mark(sx, o, sdx, 0); mark(sx, h - o, sdx, 0);
    }
  }
  return doc.save();
}

// ── Preflight (inspection, non-destructive) ─────────────────────────────────

export interface PreflightReport {
  pages: number;
  uniformSize: boolean;
  widthIn: number;
  heightIn: number;
  boxes: { media: string; trim: string; bleed: string; crop: string };
  fonts: { name: string; embedded: boolean }[];
  colorSpaces: string[];       // e.g. DeviceRGB, DeviceCMYK, DeviceGray, ICCBased, Separation
  images: number;
  minImagePx: number | null;   // smallest image's shorter pixel edge
  annotations: number;
  embeddedFiles: number;
  hasJavaScript: boolean;
  hasLayers: boolean;
  warnings: string[];
}

export async function preflight(bytes: Uint8Array): Promise<PreflightReport> {
  const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const warnings: string[] = [];
  if (!pages.length) warnings.push('Document has no pages.');
  const first = pages[0]?.getSize() ?? { width: 0, height: 0 };
  const uniformSize = pages.every(p => { const s = p.getSize(); return Math.abs(s.width - first.width) < 1 && Math.abs(s.height - first.height) < 1; });
  if (!uniformSize) warnings.push('Pages are not all the same size — imposition may misalign.');
  if (first.width / PT < 1 || first.height / PT < 1) warnings.push('Page size looks unusually small.');
  const boxStr = (b: { width: number; height: number }) => `${(b.width / PT).toFixed(2)}×${(b.height / PT).toFixed(2)} in`;
  const p0 = pages[0];
  const boxes = p0
    ? { media: boxStr(p0.getMediaBox()), trim: boxStr(p0.getTrimBox()), bleed: boxStr(p0.getBleedBox()), crop: boxStr(p0.getCropBox()) }
    : { media: '—', trim: '—', bleed: '—', crop: '—' };

  // Deep introspection over the whole object graph.
  const fonts: { name: string; embedded: boolean }[] = [];
  const fontSeen = new Set<string>();
  const colorSpaces = new Set<string>();
  let images = 0, minImagePx: number | null = null, annotations = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nm = (v: any) => (v instanceof PDFName ? v.asString().replace(/^\//, '') : '');
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const type = nm(dict.get(PDFName.of('Type')));
    const sub = nm(dict.get(PDFName.of('Subtype')));
    if (type === 'Font') {
      const base = nm(dict.get(PDFName.of('BaseFont'))) || '(unnamed)';
      const fd = dict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      const embedded = !!fd && (!!fd.get(PDFName.of('FontFile')) || !!fd.get(PDFName.of('FontFile2')) || !!fd.get(PDFName.of('FontFile3')));
      if (!fontSeen.has(base)) { fontSeen.add(base); fonts.push({ name: base.replace(/^[A-Z]{6}\+/, ''), embedded }); }
    }
    if (sub === 'Image') {
      images++;
      const w = Number((dict.get(PDFName.of('Width')) as any)?.asNumber?.() ?? 0);
      const h = Number((dict.get(PDFName.of('Height')) as any)?.asNumber?.() ?? 0);
      const edge = Math.min(w, h);
      if (edge > 0 && (minImagePx === null || edge < minImagePx)) minImagePx = edge;
      const cs = dict.get(PDFName.of('ColorSpace'));
      if (cs instanceof PDFName) colorSpaces.add(nm(cs));
      else if (cs instanceof PDFArray && cs.get(0) instanceof PDFName) colorSpaces.add(nm(cs.get(0)));
    }
    // Resources /ColorSpace dictionaries
    const res = dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? (type === '' && sub === '' ? dict.lookupMaybe(PDFName.of('ColorSpace'), PDFDict) : undefined);
    const csd = res?.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
    if (csd) for (const [, v] of csd.entries()) { const r = doc.context.lookupMaybe(v, PDFArray); if (r && r.get(0) instanceof PDFName) colorSpaces.add(nm(r.get(0))); }
  }
  // Count only annotations actually referenced by a page (what will print).
  for (const pg of pages) { const a = pg.node.lookupMaybe(PDFName.of('Annots'), PDFArray); if (a) annotations += a.size(); }

  const cat = doc.catalog;
  const names = cat.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embeddedFiles = (() => { const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict); const arr = ef?.lookupMaybe(PDFName.of('Names'), PDFArray); return arr ? Math.floor(arr.size() / 2) : 0; })();
  const hasJavaScript = !!names?.get(PDFName.of('JavaScript')) || !!cat.get(PDFName.of('OpenAction'));
  const hasLayers = !!cat.get(PDFName.of('OCProperties'));

  if (fonts.some(f => !f.embedded)) warnings.push(`Non-embedded font(s): ${fonts.filter(f => !f.embedded).map(f => f.name).join(', ')} — may substitute on the RIP.`);
  if (colorSpaces.has('DeviceRGB')) warnings.push('RGB content present — convert to CMYK for offset/press output.');
  if (minImagePx !== null && minImagePx < 150) warnings.push(`Low-resolution image detected (${minImagePx}px on the short edge).`);
  if (hasJavaScript) warnings.push('Document contains JavaScript — strip it for press delivery.');
  if (embeddedFiles > 0) warnings.push(`${embeddedFiles} embedded file(s) — remove before press.`);

  return {
    pages: pages.length, uniformSize,
    widthIn: Math.round((first.width / PT) * 1000) / 1000,
    heightIn: Math.round((first.height / PT) * 1000) / 1000,
    boxes, fonts, colorSpaces: [...colorSpaces], images, minImagePx, annotations, embeddedFiles, hasJavaScript, hasLayers, warnings,
  };
}

// Doable prepress cleanup (the client-side subset of a Ghostscript pass):
// rebuild + drop embedded files, layers (OCG), annotations, JavaScript, metadata.
export interface PreflightCleanOptions {
  deleteEmbeddedFiles?: boolean;
  flattenLayers?: boolean;
  removeAnnotations?: boolean;
  removeJavaScript?: boolean;
  stripMetadata?: boolean;
  pages?: string;
}
export async function preflightClean(bytes: Uint8Array, opts: PreflightCleanOptions): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  const sel = parsePageRange(opts.pages ?? 'all', pages.length);
  pages.forEach((p, i) => {
    out.addPage(p);
    if (!sel.has(i + 1)) return;
    if (opts.removeAnnotations) p.node.delete(PDFName.of('Annots'));
    if (opts.removeJavaScript) p.node.delete(PDFName.of('AA'));
  });
  const cat = out.catalog;
  if (opts.flattenLayers) cat.delete(PDFName.of('OCProperties'));
  const nd = cat.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (nd) {
    if (opts.deleteEmbeddedFiles) nd.delete(PDFName.of('EmbeddedFiles'));
    if (opts.removeJavaScript) nd.delete(PDFName.of('JavaScript'));
  }
  if (opts.removeJavaScript) cat.delete(PDFName.of('OpenAction'));
  if (opts.stripMetadata) { out.setTitle(''); out.setAuthor(''); out.setSubject(''); out.setKeywords([]); out.setProducer(''); out.setCreator(''); try { cat.delete(PDFName.of('Metadata')); } catch { /* none */ } }
  return out.save({ useObjectStreams: true });
}

// ── Gang-sheet production plan (sheet counts incl. makeready + spoilage) ─────
export interface GangPlan {
  itemsPerSheet: number;
  setsPerSheet: number;
  runSheets: number;
  makereadySheets: number;
  spoilageSheets: number;
  totalSheets: number;
}
export function computeGangPlan(distinctItems: number, itemsPerSheet: number, quantity: number, makeready = 0, spoilagePct = 0): GangPlan {
  const di = Math.max(1, Math.floor(distinctItems));
  const ips = Math.max(1, Math.floor(itemsPerSheet));
  const setsPerSheet = Math.max(1, Math.floor(ips / di));
  const runSheets = Math.max(1, Math.ceil(Math.max(1, quantity) / setsPerSheet));
  const makereadySheets = Math.max(0, Math.round(makeready));
  const spoilageSheets = Math.ceil(runSheets * Math.max(0, spoilagePct) / 100);
  return { itemsPerSheet: ips, setsPerSheet, runSheets, makereadySheets, spoilageSheets, totalSheets: runSheets + makereadySheets + spoilageSheets };
}

// ── Edit PDF (page-level editing operations) ────────────────────────────────
export type EditOp =
  | { type: 'text'; page: number; xPt: number; yPt: number; text: string; sizePt?: number; color?: { r: number; g: number; b: number }; font?: 'helvetica' | 'times' | 'courier' }
  | { type: 'box'; page: number; xPt: number; yPt: number; wPt: number; hPt: number; fill?: boolean; color?: { r: number; g: number; b: number }; opacity?: number }
  | { type: 'redact'; page: number; xPt: number; yPt: number; wPt: number; hPt: number }
  | { type: 'line'; page: number; x1: number; y1: number; x2: number; y2: number; thicknessPt?: number; color?: { r: number; g: number; b: number } }
  | { type: 'rotate'; page: number; angleDeg: number }
  | { type: 'delete'; pages: string };

export async function editPdf(bytes: Uint8Array, ops: EditOp[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fonts = {
    helvetica: await doc.embedFont(StandardFonts.Helvetica),
    times: await doc.embedFont(StandardFonts.TimesRoman),
    courier: await doc.embedFont(StandardFonts.Courier),
  };
  // draw / rotate ops first (page indices still valid), deletes last
  for (const op of ops) {
    if (op.type === 'delete') continue;
    const pg = doc.getPage(op.page - 1);
    if (!pg) continue;
    if (op.type === 'text') pg.drawText(op.text || '', { x: op.xPt, y: op.yPt, size: op.sizePt ?? 12, font: fonts[op.font ?? 'helvetica'], color: rgb(op.color?.r ?? 0, op.color?.g ?? 0, op.color?.b ?? 0) });
    else if (op.type === 'box') { const c = op.color ?? { r: 0, g: 0, b: 0 }; pg.drawRectangle({ x: op.xPt, y: op.yPt, width: op.wPt, height: op.hPt, ...(op.fill === false ? { borderColor: rgb(c.r, c.g, c.b), borderWidth: 1 } : { color: rgb(c.r, c.g, c.b) }), opacity: op.opacity ?? 1 }); }
    else if (op.type === 'redact') pg.drawRectangle({ x: op.xPt, y: op.yPt, width: op.wPt, height: op.hPt, color: rgb(0, 0, 0) });
    else if (op.type === 'line') pg.drawLine({ start: { x: op.x1, y: op.y1 }, end: { x: op.x2, y: op.y2 }, thickness: op.thicknessPt ?? 1, color: rgb(op.color?.r ?? 0, op.color?.g ?? 0, op.color?.b ?? 0) });
    else if (op.type === 'rotate') pg.setRotation(degrees((((pg.getRotation().angle + op.angleDeg) % 360) + 360) % 360));
  }
  const n = doc.getPageCount();
  const toRemove = new Set<number>();
  for (const op of ops) if (op.type === 'delete') for (const p of parsePageRange(op.pages, n)) toRemove.add(p - 1);
  [...toRemove].sort((a, b) => b - a).forEach(i => { if (doc.getPageCount() > 1) doc.removePage(i); });
  return doc.save();
}

// ── JDF / CIP4 export (Product-intent job ticket) ───────────────────────────
export interface JdfOptions {
  jobName: string;
  jobId?: string;
  productType?: string;       // e.g. Book, Brochure, BusinessCard, Flyer
  quantity: number;
  widthPt: number;            // finished trim size
  heightPt: number;
  pages?: number;
  sides?: 'OneSided' | 'TwoSidedFlipY' | 'TwoSidedFlipX';
  mediaWidthPt?: number;      // press-sheet / media size
  mediaHeightPt?: number;
  mediaType?: string;         // Paper, Board…
  binding?: 'None' | 'SaddleStitch' | 'PerfectBound' | 'CaseBound' | 'WireO' | 'Coil';
}

const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (v: number) => v.toFixed(2);

// A well-formed CIP4 JDF 1.4 Product node with layout / media / binding intents.
// Intent-level (not a full imposition RunList) — captures the job spec a MIS /
// CIP4 tool reads to schedule the job.
export function exportJdf(opts: JdfOptions): Uint8Array {
  const id = opts.jobId || ('J' + Math.abs(hashStr(opts.jobName)).toString(36).toUpperCase());
  const name = xesc(opts.jobName || 'Untitled Job');
  const prod = xesc(opts.productType || 'Unknown');
  const sides = opts.sides || 'TwoSidedFlipY';
  const bind = opts.binding && opts.binding !== 'None' ? `\n      <BindingIntent Class="Intent" Status="Available">\n        <BindingType DataType="EnumerationSpan" Preferred="${opts.binding}"/>\n      </BindingIntent>` : '';
  const mediaW = opts.mediaWidthPt ?? opts.widthPt, mediaH = opts.mediaHeightPt ?? opts.heightPt;
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<JDF xmlns="http://www.CIP4.org/JDFSchema_1_1" ID="${id}" Type="Product" JobID="${id}"
     Status="Waiting" Version="1.4" DescriptiveName="${name}" JobPartID="root"
     Agent="Printing Comics Imposition Toolkit" AgentVersion="1.2">
  <ResourcePool>
    <LayoutIntent ID="LI1" Class="Intent" Status="Available">
      <Dimensions DataType="ShapeSpan" Preferred="${f2(opts.widthPt)} ${f2(opts.heightPt)}"/>
      <Sides DataType="EnumerationSpan" Preferred="${sides}"/>
      <Pages DataType="IntegerSpan" Preferred="${opts.pages ?? 1}"/>
    </LayoutIntent>
    <MediaIntent ID="MI1" Class="Intent" Status="Available">
      <Dimensions DataType="ShapeSpan" Preferred="${f2(mediaW)} ${f2(mediaH)}"/>
      <MediaType DataType="EnumerationSpan" Preferred="${xesc(opts.mediaType || 'Paper')}"/>
    </MediaIntent>${bind}
    <ProductionIntent ID="PI1" Class="Intent" Status="Available">
      <PrintProcess DataType="NameSpan" Preferred="Digital"/>
    </ProductionIntent>
    <Component ID="COMP1" Class="Quantity" Status="Unavailable" ComponentType="FinalProduct"
               DescriptiveName="${name}" Amount="${Math.max(1, Math.round(opts.quantity))}"/>
  </ResourcePool>
  <ResourceLinkPool>
    <LayoutIntentLink rRef="LI1" Usage="Input"/>
    <MediaIntentLink rRef="MI1" Usage="Input"/>${opts.binding && opts.binding !== 'None' ? '\n    <BindingIntentLink rRef="BI1" Usage="Input"/>' : ''}
    <ComponentLink rRef="COMP1" Usage="Output" Amount="${Math.max(1, Math.round(opts.quantity))}"/>
  </ResourceLinkPool>
  <Comment Name="ProductType">${prod}</Comment>
</JDF>
`;
  return new TextEncoder().encode(xml);
}
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

// ── PDF Tools / Optimizer (optimize · decrypt · repair) ─────────────────────
// pdf-lib can rebuild + write object streams (smaller), and strip encryption on
// re-save. It cannot *write* encryption or true linearisation — those are
// surfaced honestly in the UI as unavailable client-side.
export interface OptimizeOptions {
  objectStreams?: boolean;   // pack objects into streams (smaller output)
  removeUnused?: boolean;    // rebuild into a fresh doc (drops orphaned objects)
  pages?: string;            // (kept for parity; optimize is whole-document)
}
export async function optimizePdf(bytes: Uint8Array, opts: OptimizeOptions = {}): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (opts.removeUnused !== false) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    return out.save({ useObjectStreams: opts.objectStreams !== false });
  }
  return src.save({ useObjectStreams: opts.objectStreams !== false });
}
// Strip encryption / password protection by loading (bypassing) and re-saving.
export async function decryptPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.save();
}

// ── Layers (Optional Content Groups) ────────────────────────────────────────
// Read the PDF's named OCG layers and force each one visible / hidden via the
// default configuration's /ON and /OFF arrays.
export interface PdfLayer { name: string; forcedOn: boolean; forcedOff: boolean; }

export async function readLayers(bytes: Uint8Array): Promise<PdfLayer[]> {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ocp = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  if (!ocp) return [];
  const ocgs = ocp.lookupMaybe(PDFName.of('OCGs'), PDFArray);
  if (!ocgs) return [];
  const d = ocp.lookupMaybe(PDFName.of('D'), PDFDict);
  const refsIn = (key: string) => { const a = d?.lookupMaybe(PDFName.of(key), PDFArray); const set = new Set<string>(); if (a) for (let i = 0; i < a.size(); i++) { const r = a.get(i); set.add(r.toString()); } return set; };
  const onSet = refsIn('ON'), offSet = refsIn('OFF');
  const out: PdfLayer[] = [];
  for (let i = 0; i < ocgs.size(); i++) {
    const ref = ocgs.get(i);
    const g = doc.context.lookupMaybe(ref, PDFDict);
    if (!g) continue;
    const nmObj = g.get(PDFName.of('Name'));
    const name = nmObj instanceof PDFString || nmObj instanceof PDFHexString ? nmObj.decodeText() : '(unnamed)';
    out.push({ name, forcedOn: onSet.has(ref.toString()), forcedOff: offSet.has(ref.toString()) });
  }
  return out;
}

export interface LayerState { name: string; state: 'on' | 'off' | 'default'; }
export async function setLayers(bytes: Uint8Array, states: LayerState[]): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const ocp = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  if (!ocp) return doc.save();
  const ocgs = ocp.lookupMaybe(PDFName.of('OCGs'), PDFArray);
  let d = ocp.lookupMaybe(PDFName.of('D'), PDFDict);
  if (!d) { d = ctx.obj({}); ocp.set(PDFName.of('D'), d); }
  const ensureArr = (key: string) => { let a = d!.lookupMaybe(PDFName.of(key), PDFArray); if (!a) { a = ctx.obj([]); d!.set(PDFName.of(key), a); } return a; };
  const onArr = ensureArr('ON'), offArr = ensureArr('OFF');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drop = (arr: any, refStr: string) => { for (let i = arr.size() - 1; i >= 0; i--) if (arr.get(i).toString() === refStr) arr.remove(i); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameToRef = new Map<string, any>();
  if (ocgs) for (let i = 0; i < ocgs.size(); i++) { const ref = ocgs.get(i); const g = ctx.lookupMaybe(ref, PDFDict); const nmObj = g?.get(PDFName.of('Name')); const nm = nmObj instanceof PDFString || nmObj instanceof PDFHexString ? nmObj.decodeText() : ''; if (nm) nameToRef.set(nm, ref); }
  for (const st of states) {
    const ref = nameToRef.get(st.name); if (!ref) continue;
    const rs = ref.toString();
    drop(onArr, rs); drop(offArr, rs);
    if (st.state === 'on') onArr.push(ref);
    else if (st.state === 'off') offArr.push(ref);
  }
  return doc.save();
}

// ── Custom Impose (Expert Grid): manual per-cell placement ──────────────────
export interface CustomCell { page: number | null; rotation?: 0 | 90 | 180 | 270; }
export interface CustomImposeOptions {
  cols: number; rows: number;
  sheetWIn: number; sheetHIn: number;
  sheets: (CustomCell | null)[][];   // sheets[s] = flat array of cols*rows cells (row-major, top-left first)
  gutterIn?: number; marginIn?: number;
  addMarks?: boolean;
}

export async function imposeCustomGrid(bytes: Uint8Array, opts: CustomImposeOptions): Promise<Uint8Array> {
  const { PDFDocument, degrees, rgb } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcCount = src.getPageCount();
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(src.getPages());
  const cols = Math.max(1, Math.floor(opts.cols)), rows = Math.max(1, Math.floor(opts.rows));
  const SW = opts.sheetWIn * PT, SH = opts.sheetHIn * PT;
  const margin = (opts.marginIn ?? 0.25) * PT, gutter = (opts.gutterIn ?? 0) * PT;
  const cw = (SW - 2 * margin - (cols - 1) * gutter) / cols;
  const ch = (SH - 2 * margin - (rows - 1) * gutter) / rows;
  for (const sheet of opts.sheets) {
    const pg = out.addPage([SW, SH]);
    for (let idx = 0; idx < cols * rows; idx++) {
      const cell = sheet[idx];
      if (!cell || cell.page == null || cell.page < 1 || cell.page > srcCount) continue;
      const c = idx % cols, r = Math.floor(idx / cols);
      const cx = margin + c * (cw + gutter), cy = SH - margin - (r + 1) * ch - r * gutter;   // row 0 = top
      const emb = embeds[cell.page - 1]!;
      const rot = ((cell.rotation ?? 0) % 360) as 0 | 90 | 180 | 270;
      // fit the (possibly rotated) source into the cell, centred
      const sw = emb.width, sh = emb.height;
      const rotated = rot === 90 || rot === 270;
      const fitW = rotated ? sh : sw, fitH = rotated ? sw : sh;
      const scale = Math.min(cw / fitW, ch / fitH);
      const dw = fitW * scale, dh = fitH * scale;
      const ox = cx + (cw - dw) / 2, oy = cy + (ch - dh) / 2;
      // drawPage rotates about its origin; offset so the rotated box lands at (ox,oy)
      let px = ox, py = oy;
      if (rot === 90) { px = ox + dw; }
      else if (rot === 180) { px = ox + dw; py = oy + dh; }
      else if (rot === 270) { py = oy + dh; }
      pg.drawPage(emb, { x: px, y: py, xScale: scale, yScale: scale, rotate: degrees(rot) });
      if (opts.addMarks) {
        const m = 6, blk = rgb(0, 0, 0);
        for (const [mx, my, dx, dy] of [[cx, cy, -1, -1], [cx + cw, cy, 1, -1], [cx, cy + ch, -1, 1], [cx + cw, cy + ch, 1, 1]] as [number, number, number, number][]) {
          pg.drawLine({ start: { x: mx, y: my }, end: { x: mx + dx * m, y: my }, thickness: 0.5, color: blk });
          pg.drawLine({ start: { x: mx, y: my }, end: { x: mx, y: my + dy * m }, thickness: 0.5, color: blk });
        }
      }
    }
  }
  return out.save();
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
  else if (symbology === 'datamatrix') { const dm = encodeDataMatrix(text); const cell = Math.min(w, h) / (dm.size + 4); drawModuleGrid(page, rgb, dm.matrix, x, y, cell, 2); }
  else drawQrCode(page, rgb, qrcode, text, x, y, Math.min(w, h));
}

// ── DataMatrix (ECC200) ─────────────────────────────────────────────────────
// GF(256) with primitive polynomial 0x12d, Reed-Solomon (first consecutive
// root α¹), ASCII encodation and the ISO/IEC 16022 Annex F module placement.
// Square symbols 10×10 … 26×26 (single data region).
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x12d; } for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!; })();
const gfMul = (a: number, b: number) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;

// Reed-Solomon check words for DataMatrix (generator roots α¹…α^nc).
function dmReedSolomon(data: number[], nc: number): number[] {
  const gen = new Array(nc + 1).fill(0); gen[0] = 1;
  for (let i = 1; i <= nc; i++) { gen[i] = 1; for (let j = i - 1; j > 0; j--) gen[j] = gen[j - 1] ^ gfMul(gen[j]!, GF_EXP[i]!); gen[0] = gfMul(gen[0]!, GF_EXP[i]!); }
  const ecc = new Array(nc).fill(0);
  for (const d of data) {
    const k = d ^ ecc[0];
    for (let j = 0; j < nc - 1; j++) ecc[j] = ecc[j + 1]! ^ gfMul(k, gen[nc - 1 - j]!);
    ecc[nc - 1] = gfMul(k, gen[0]!);
  }
  return ecc;
}

// ASCII encodation (digit pairs → 130+, byte → +1, extended → upper-shift).
function dmEncodeAscii(text: string): number[] {
  const b = Array.from(text, c => c.charCodeAt(0) & 0xff);
  const cw: number[] = [];
  for (let i = 0; i < b.length;) {
    const c = b[i]!;
    if (c >= 48 && c <= 57 && i + 1 < b.length && b[i + 1]! >= 48 && b[i + 1]! <= 57) { cw.push((c - 48) * 10 + (b[i + 1]! - 48) + 130); i += 2; }
    else if (c < 128) { cw.push(c + 1); i++; }
    else { cw.push(235); cw.push(c - 128 + 1); i++; }
  }
  return cw;
}

const DM_SIZES = [[10, 3, 5], [12, 5, 7], [14, 8, 10], [16, 12, 12], [18, 18, 14], [20, 22, 18], [22, 30, 20], [24, 36, 24], [26, 44, 28]];

// ISO 16022 Annex F placement: fill an nrow×ncol mapping matrix with the bit
// index (codeword*8 + bit) at each cell.
function dmPlacement(nrow: number, ncol: number): Int32Array {
  const arr = new Int32Array(nrow * ncol).fill(-1);
  const mod = (r: number, c: number, chr: number, bit: number) => {
    if (r < 0) { r += nrow; c += 4 - ((nrow + 4) % 8); }
    if (c < 0) { c += ncol; r += 4 - ((ncol + 4) % 8); }
    arr[r * ncol + c] = chr * 8 + bit;
  };
  const utah = (r: number, c: number, chr: number) => { mod(r - 2, c - 2, chr, 0); mod(r - 2, c - 1, chr, 1); mod(r - 1, c - 2, chr, 2); mod(r - 1, c - 1, chr, 3); mod(r - 1, c, chr, 4); mod(r, c - 2, chr, 5); mod(r, c - 1, chr, 6); mod(r, c, chr, 7); };
  const c1 = (chr: number) => { mod(nrow - 1, 0, chr, 0); mod(nrow - 1, 1, chr, 1); mod(nrow - 1, 2, chr, 2); mod(0, ncol - 2, chr, 3); mod(0, ncol - 1, chr, 4); mod(1, ncol - 1, chr, 5); mod(2, ncol - 1, chr, 6); mod(3, ncol - 1, chr, 7); };
  const c2 = (chr: number) => { mod(nrow - 3, 0, chr, 0); mod(nrow - 2, 0, chr, 1); mod(nrow - 1, 0, chr, 2); mod(0, ncol - 4, chr, 3); mod(0, ncol - 3, chr, 4); mod(0, ncol - 2, chr, 5); mod(0, ncol - 1, chr, 6); mod(1, ncol - 1, chr, 7); };
  const c3 = (chr: number) => { mod(nrow - 3, 0, chr, 0); mod(nrow - 2, 0, chr, 1); mod(nrow - 1, 0, chr, 2); mod(0, ncol - 2, chr, 3); mod(0, ncol - 1, chr, 4); mod(1, ncol - 1, chr, 5); mod(2, ncol - 1, chr, 6); mod(3, ncol - 1, chr, 7); };
  const c4 = (chr: number) => { mod(nrow - 1, 0, chr, 0); mod(nrow - 1, ncol - 1, chr, 1); mod(0, ncol - 3, chr, 2); mod(0, ncol - 2, chr, 3); mod(0, ncol - 1, chr, 4); mod(1, ncol - 3, chr, 5); mod(1, ncol - 2, chr, 6); mod(1, ncol - 1, chr, 7); };
  let chr = 0, r = 4, c = 0;
  do {
    if (r === nrow && c === 0) c1(chr++);
    else if (r === nrow - 2 && c === 0 && ncol % 4) c2(chr++);
    else if (r === nrow - 2 && c === 0 && ncol % 8 === 4) c3(chr++);
    else if (r === nrow + 4 && c === 2 && ncol % 8 === 0) c4(chr++);
    do { if (r < nrow && c >= 0 && arr[r * ncol + c] === -1) utah(r, c, chr++); r -= 2; c += 2; } while (r >= 0 && c < ncol);
    r += 1; c += 3;
    do { if (r >= 0 && c < ncol && arr[r * ncol + c] === -1) utah(r, c, chr++); r += 2; c -= 2; } while (r < nrow && c >= 0);
    r += 3; c += 1;
  } while (r < nrow || c < ncol);
  if (arr[(nrow - 1) * ncol + ncol - 1] === -1) { arr[(nrow - 1) * ncol + ncol - 1] = arr[(nrow - 2) * ncol + ncol - 2] = -2; } // fixed corner (dark)
  return arr;
}

export interface DataMatrixResult { size: number; matrix: boolean[][]; codewords: number[]; ecc: number[]; }

export function encodeDataMatrix(text: string): DataMatrixResult {
  let data = dmEncodeAscii(text || ' ');
  const spec = DM_SIZES.find(s => data.length <= s[1]!);
  if (!spec) throw new Error('DataMatrix: data too long (max 44 codewords / 26×26)');
  const [D, cap, nc] = spec as [number, number, number];
  if (data.length < cap) {                                  // pad: EOM then randomised 253-state
    data.push(129);
    while (data.length < cap) { const pos = data.length + 1; let v = ((149 * pos) % 253) + 1 + 129; if (v > 254) v -= 254; data.push(v); }
  }
  const all = data.concat(dmReedSolomon(data, nc));
  const nrow = D - 2, ncol = D - 2;
  const place = dmPlacement(nrow, ncol);
  // build full D×D bitmap: finder border + mapped interior
  const m: boolean[][] = Array.from({ length: D }, () => new Array(D).fill(false));
  for (let row = 0; row < D; row++) for (let col = 0; col < D; col++) {
    if (col === 0) m[row]![col] = true;                     // left solid
    else if (row === D - 1) m[row]![col] = true;            // bottom solid
    else if (row === 0) m[row]![col] = (col % 2 === 0);     // top timing
    else if (col === D - 1) m[row]![col] = ((D - 1 - row) % 2 === 0); // right timing
    else { const idx = place[(row - 1) * ncol + (col - 1)]!; m[row]![col] = idx === -2 ? true : idx >= 0 && ((all[Math.floor(idx / 8)]! >> (7 - (idx % 8))) & 1) === 1; }
  }
  return { size: D, matrix: m, codewords: data, ecc: all.slice(data.length) };
}

// Draw a boolean module grid (QR / DataMatrix) with `quiet` modules of margin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawModuleGrid(page: any, rgb: any, matrix: boolean[][], x: number, y: number, cell: number, quiet: number) {
  const n = matrix.length, total = n + quiet * 2, size = total * cell;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  const black = rgb(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!matrix[r]![c]) continue;
    page.drawRectangle({ x: x + (quiet + c) * cell, y: y + size - (quiet + r + 1) * cell, width: cell + 0.3, height: cell + 0.3, color: black });
  }
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

export interface NudgeOptions { dxIn: number; dyIn: number; rotateDeg: number; pages?: string; }

export async function nudgePdf(bytes: Uint8Array, opts: NudgeOptions): Promise<Uint8Array> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const sel = parsePageRange(opts.pages ?? 'all', pages.length);
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  const dx = opts.dxIn * PT, dy = opts.dyIn * PT, rad = (opts.rotateDeg * Math.PI) / 180;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i]!.getSize();
    const pg = out.addPage([w, h]);
    if (!sel.has(i + 1)) { pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w, height: h }); continue; }
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

export interface RepairOptions {
  reserialize?: boolean;       // always effectively on (rebuild from scratch)
  stripMetadata?: boolean;     // clear title / author / dates + XMP
  removeAnnotations?: boolean; // flatten out /Annots
  removeJavaScript?: boolean;  // drop page-level actions (doc-level JS is dropped by the rebuild)
  pages?: string;              // scope annotation / action removal (default all)
}

export async function repairPdf(bytes: Uint8Array, opts: RepairOptions = {}): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();                 // fresh doc → drops dead objects, doc-level JS, source metadata
  const pages = await out.copyPages(src, src.getPageIndices());
  const sel = parsePageRange(opts.pages ?? 'all', pages.length);
  pages.forEach((p, i) => {
    out.addPage(p);
    if (!sel.has(i + 1)) return;
    if (opts.removeAnnotations) p.node.delete(PDFName.of('Annots'));
    if (opts.removeJavaScript) p.node.delete(PDFName.of('AA'));   // page additional-actions
  });
  if (opts.stripMetadata) {
    out.setTitle(''); out.setAuthor(''); out.setSubject(''); out.setKeywords([]); out.setProducer(''); out.setCreator('');
    try { out.catalog.delete(PDFName.of('Metadata')); } catch { /* no XMP present */ }
  }
  return out.save({ useObjectStreams: true });
}

// ── Colour Effects (rasterise + filter) ─────────────────────────────────────
// Renders targeted pages to a bitmap and applies brightness / contrast /
// saturation and creative effects, then re-embeds them. Browser-only (needs a
// canvas); non-targeted pages are copied through unchanged.
export interface ColorEffectsOptions {
  brightness?: number;   // 0–200, 100 = unchanged
  contrast?: number;     // 0–200
  saturation?: number;   // 0–200, 0 = grayscale
  grayscale?: number;    // 0–100 %
  warmTone?: number;     // 0–100 % (sepia cast)
  invert?: number;       // 0–100 %
  hueRotate?: number;    // 0–360°
  dpi?: number;          // rasterise resolution (150 / 300 / 600)
  pages?: string;
}

// Pure CSS-filter string for the effect stack (also unit-testable).
export function colorEffectsFilter(o: ColorEffectsOptions): string {
  const p: string[] = [];
  p.push(`brightness(${(o.brightness ?? 100) / 100})`);
  p.push(`contrast(${(o.contrast ?? 100) / 100})`);
  p.push(`saturate(${(o.saturation ?? 100) / 100})`);
  if (o.grayscale) p.push(`grayscale(${o.grayscale / 100})`);
  if (o.warmTone) p.push(`sepia(${o.warmTone / 100})`);
  if (o.invert) p.push(`invert(${o.invert / 100})`);
  if (o.hueRotate) p.push(`hue-rotate(${o.hueRotate}deg)`);
  return p.join(' ');
}

// Is this effect stack a no-op (identity)? Used to skip needless rasterisation.
export function colorEffectsIsIdentity(o: ColorEffectsOptions): boolean {
  return (o.brightness ?? 100) === 100 && (o.contrast ?? 100) === 100 && (o.saturation ?? 100) === 100 &&
    !o.grayscale && !o.warmTone && !o.invert && !o.hueRotate;
}

export async function applyColorEffects(bytes: Uint8Array, opts: ColorEffectsOptions): Promise<Uint8Array> {
  if (typeof document === 'undefined') throw new Error('Colour Effects needs a browser (canvas rasterisation).');
  const { PDFDocument } = await import('pdf-lib');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist');
  try { pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default; } catch { /* bundler resolves worker */ }
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const dpi = opts.dpi ?? 300;
  const filter = colorEffectsFilter(opts);
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp!); continue; }
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // re-draw through a filtered context
    const fcanvas = document.createElement('canvas');
    fcanvas.width = canvas.width; fcanvas.height = canvas.height;
    const fctx = fcanvas.getContext('2d')!;
    fctx.filter = filter || 'none';
    fctx.drawImage(canvas, 0, 0);
    const dataUrl = fcanvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]!);
    const arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    const emb = await out.embedPng(arr);
    const { width: pw, height: ph } = src.getPage(i).getSize();
    const pg = out.addPage([pw, ph]);
    pg.drawImage(emb, { x: 0, y: 0, width: pw, height: ph });
  }
  return out.save();
}

// ── Colour Management (RGB → CMYK gamut simulation + gamut warning) ──────────
// A genuine gamut-aware conversion done client-side: rasterise, map each pixel
// RGB → CMYK → RGB (standard GCR model) so the output shows the CMYK-reproducible
// colour, and optionally flag out-of-gamut pixels. Note: precise device ICC
// profiles (FOGRA39, GRACoL…) require a full colour-management module; this uses
// a standard SWOP-like CMYK model — accurate enough for gamut checking and
// RGB→CMYK normalisation, and honest about not being a device-exact transform.
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1 - 1e-6) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}
// Simulated *printed* appearance of a CMYK coverage on white coated stock, via
// an 8-primary Neugebauer mix of non-ideal inks (so the gamut is genuinely
// smaller than sRGB — saturated greens/blues/reds fall outside it). K ink
// darkens the result. This is what makes gamut checking + conversion meaningful.
const NEUG: [number, number, number][] = [
  [1, 1, 1],          // white
  [0.00, 0.68, 0.94], // C
  [0.90, 0.10, 0.54], // M
  [0.99, 0.95, 0.13], // Y
  [0.16, 0.10, 0.45], // C+M  (blue)
  [0.00, 0.62, 0.30], // C+Y  (green)
  [0.92, 0.16, 0.18], // M+Y  (red)
  [0.20, 0.18, 0.16], // C+M+Y (near-black)
];
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const w = [
    (1 - c) * (1 - m) * (1 - y), c * (1 - m) * (1 - y), (1 - c) * m * (1 - y), (1 - c) * (1 - m) * y,
    c * m * (1 - y), c * (1 - m) * y, (1 - c) * m * y, c * m * y,
  ];
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 8; i++) { r += w[i]! * NEUG[i]![0]; g += w[i]! * NEUG[i]![1]; b += w[i]! * NEUG[i]![2]; }
  const kf = 1 - 0.9 * k;   // black-ink darkening
  return [r * kf, g * kf, b * kf];
}
// RGB → CMYK → RGB round-trip = the CMYK-reproducible approximation of a colour.
export function cmykRoundTrip(r: number, g: number, b: number): [number, number, number] {
  const [c, m, y, k] = rgbToCmyk(r, g, b);
  return cmykToRgb(c, m, y, k);
}
// A colour is "out of CMYK gamut" when the round-trip can't get close to it
// (saturated RGB primaries/secondaries drift the most).
export function isOutOfCmykGamut(r: number, g: number, b: number, thresh = 0.12): boolean {
  const [r2, g2, b2] = cmykRoundTrip(r, g, b);
  return Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2)) > thresh;
}
// Map one pixel per the rendering intent. Perceptual gently desaturates first
// (proportional compression); relative/absolute clip via the plain round-trip;
// saturation boosts chroma before converting.
export function mapPixelCmyk(r: number, g: number, b: number, intent: string): [number, number, number] {
  let R = r, G = g, B = b;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (intent === 'perceptual') { const f = 0.9; R = lum + (r - lum) * f; G = lum + (g - lum) * f; B = lum + (b - lum) * f; }
  else if (intent === 'saturation') { const f = 1.1; R = Math.min(1, Math.max(0, lum + (r - lum) * f)); G = Math.min(1, Math.max(0, lum + (g - lum) * f)); B = Math.min(1, Math.max(0, lum + (b - lum) * f)); }
  return cmykRoundTrip(R, G, B);
}

// Assign a destination ICC profile to the PDF as a PDF/X `/OutputIntent` — the
// real, lossless "embed the profile" operation a RIP reads (no rasterisation).
// `/N` (colorant count) is read from the ICC header's colour-space signature.
export async function assignOutputIntent(baseBytes: Uint8Array, iccBytes: Uint8Array, conditionName: string): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString } = await import('pdf-lib');
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const cs = String.fromCharCode(...iccBytes.slice(16, 20));       // 'RGB ' | 'CMYK' | 'GRAY'
  const N = cs.startsWith('CMYK') ? 4 : cs.startsWith('GRAY') ? 1 : 3;
  const iccRef = ctx.register(ctx.stream(iccBytes, { N }));
  const oi = ctx.obj({
    Type: 'OutputIntent', S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of(conditionName || 'Custom'),
    Info: PDFString.of(conditionName || 'Custom'),
    DestOutputProfile: iccRef,
  });
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(oi)]));
  return doc.save();
}

export interface ColorManageOptions {
  sourceProfile?: string;     // informational (sRGB / CMYK)
  destProfile?: string;       // informational (FOGRA39 / GRACoL / SWOP …)
  intent?: 'perceptual' | 'relative' | 'saturation' | 'absolute';
  dpi?: number;
  convert?: boolean;          // rasterise + RGB→CMYK gamut conversion
  gamutWarning?: boolean;     // paint out-of-gamut pixels a warning colour
  warningColor?: { r: number; g: number; b: number };  // default bright green
  pages?: string;
}

export async function applyColorManagement(bytes: Uint8Array, opts: ColorManageOptions): Promise<Uint8Array> {
  if (typeof document === 'undefined') throw new Error('Colour Management needs a browser (canvas rasterisation).');
  const { PDFDocument } = await import('pdf-lib');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist');
  try { pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default; } catch { /* bundler resolves worker */ }
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const dpi = opts.dpi ?? 300;
  const intent = opts.intent ?? 'perceptual';
  const warn = opts.warningColor ?? { r: 0, g: 1, b: 0 };
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp!); continue; }
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p]! / 255, g = d[p + 1]! / 255, b = d[p + 2]! / 255;
      if (opts.gamutWarning && isOutOfCmykGamut(r, g, b)) { d[p] = warn.r * 255; d[p + 1] = warn.g * 255; d[p + 2] = warn.b * 255; continue; }
      const [nr, ng, nb] = mapPixelCmyk(r, g, b, intent);
      d[p] = Math.round(nr * 255); d[p + 1] = Math.round(ng * 255); d[p + 2] = Math.round(nb * 255);
    }
    ctx.putImageData(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]!);
    const arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    const emb = await out.embedPng(arr);
    const { width: pw, height: ph } = src.getPage(i).getSize();
    out.addPage([pw, ph]).drawImage(emb, { x: 0, y: 0, width: pw, height: ph });
  }
  return out.save();
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

// ── Backdrop file (place an uploaded PDF / image behind the content) ─────────
export interface BackdropFileOptions {
  offsetXPt?: number;   // + right
  offsetYPt?: number;   // + down
  scalePct?: number;    // default 100
  opacity?: number;     // 0..1, default 1
  repeat?: boolean;     // all pages (true) vs page 1 only (false); default true
  pages?: string;
}

export async function addBackdropFile(baseBytes: Uint8Array, backdropBytes: Uint8Array, opts: BackdropFileOptions): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const srcEmbeds = await out.embedPages(pages);
  // Embed the backdrop as a PDF page or an image, exposing a common placer.
  const sig = String.fromCharCode(...backdropBytes.slice(0, 4));
  let bw0: number, bh0: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let place: (pg: any, x: number, y: number, w: number, h: number, op: number) => void;
  if (sig === '%PDF') {
    const [bd] = await out.embedPdf(backdropBytes, [0]);
    bw0 = bd!.width; bh0 = bd!.height;
    place = (pg, x, y, w, h, op) => pg.drawPage(bd!, { x, y, width: w, height: h, opacity: op });
  } else {
    const isPng = backdropBytes[0] === 0x89 && backdropBytes[1] === 0x50;
    const img = isPng ? await out.embedPng(backdropBytes) : await out.embedJpg(backdropBytes);
    bw0 = img.width; bh0 = img.height;
    place = (pg, x, y, w, h, op) => pg.drawImage(img, { x, y, width: w, height: h, opacity: op });
  }
  const scale = (opts.scalePct ?? 100) / 100;
  const op = opts.opacity ?? 1;
  const bw = bw0 * scale, bh = bh0 * scale;
  const sel = parsePageRange(opts.pages ?? 'all', pages.length);
  for (let i = 0; i < pages.length; i++) {
    const { width: w, height: h } = pages[i]!.getSize();
    const pg = out.addPage([w, h]);
    const applies = opts.repeat === false ? i === 0 : sel.has(i + 1);
    if (applies) place(pg, opts.offsetXPt ?? 0, h - bh - (opts.offsetYPt ?? 0), bw, bh, op);   // top-aligned; +Y offset = down
    pg.drawPage(srcEmbeds[i]!, { x: 0, y: 0, width: w, height: h });
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

// ── Full barcode stamp (QR / Code 128 / DataMatrix / EAN-13) ────────────────
// Bit string for Code 128 B (module widths expanded to 1/0 runs).
function code128Bits(text: string): string {
  const data = (text || ' ').replace(/[^\x20-\x7e]/g, '');
  const vals = [104];
  for (const ch of data) vals.push(ch.charCodeAt(0) - 32);
  let sum = 104; for (let i = 1; i < vals.length; i++) sum += vals[i]! * i;
  vals.push(sum % 103, 106);
  let bits = ''; for (const v of vals) { let bar = true; for (const d of C128[v]!) { bits += (bar ? '1' : '0').repeat(+d); bar = !bar; } }
  return bits;
}
function ean13Bits(text: string): string {
  let d = (text || '').replace(/\D/g, '').slice(0, 13);
  while (d.length < 12) d = '0' + d;
  if (d.length === 12) { let s = 0; for (let i = 0; i < 12; i++) s += (+d[i]!) * (i % 2 ? 3 : 1); d += String((10 - (s % 10)) % 10); }
  const parity = EAN_PARITY[+d[0]!]!;
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]!];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]!];
  return bits + '101';
}

type XYWH = { x: number; y: number; w: number; h: number };
// Rotate an axis-aligned local rect (bottom-left origin) inside a W×H box by
// 0/90/180/270°; the result stays axis-aligned.
function rotateRect(deg: number, W: number, H: number, lx: number, ly: number, w: number, h: number): XYWH {
  switch (((deg % 360) + 360) % 360) {
    case 90: return { x: H - (ly + h), y: lx, w: h, h: w };
    case 180: return { x: W - (lx + w), y: H - (ly + h), w, h };
    case 270: return { x: ly, y: W - (lx + w), w: h, h: w };
    default: return { x: lx, y: ly, w, h };
  }
}

export interface BarcodeStampOptions {
  text: string;
  symbology: 'qr' | 'code128' | 'datamatrix' | 'ean13';
  scale?: number;             // module size in points (default 3)
  quietZone?: number;         // quiet modules around the symbol (default 4)
  barHeightMm?: number;       // linear bar height (default 15)
  position: 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
  marginPt?: number;          // inset from the anchored edge (default 18)
  xOffsetPt?: number;         // + right
  yOffsetPt?: number;         // + down
  rotationDeg?: 0 | 90 | 180 | 270;
  barColor?: { r: number; g: number; b: number };
  bgColor?: { r: number; g: number; b: number };
  transparent?: boolean;      // skip the background fill
  showText?: boolean;         // human-readable value under linear codes
  pages?: string;
}

export async function addBarcodeStamp(bytes: Uint8Array, opts: BarcodeStampOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const scale = opts.scale ?? 3;
  const q = opts.quietZone ?? 4;
  const rot = opts.rotationDeg ?? 0;
  const bar = opts.barColor ?? { r: 0, g: 0, b: 0 };
  const bg = opts.bgColor ?? { r: 1, g: 1, b: 1 };
  const barCol = rgb(bar.r, bar.g, bar.b), bgCol = rgb(bg.r, bg.g, bg.b);
  const is2D = opts.symbology === 'qr' || opts.symbology === 'datamatrix';
  const sel = parsePageRange(opts.pages ?? 'all', doc.getPageCount());
  const margin = opts.marginPt ?? 18;

  // Build local (unrotated, bottom-left origin) module rects + footprint + text.
  const cells: XYWH[] = [];
  let W = 0, H = 0, label = '';
  if (is2D) {
    let grid: boolean[][];
    if (opts.symbology === 'datamatrix') grid = encodeDataMatrix(opts.text || ' ').matrix;
    else { const mod = await import('qrcode-generator'); const qrcode = (mod as unknown as { default?: any }).default ?? mod; const qr = qrcode(0, 'M'); qr.addData(opts.text || ' '); qr.make(); const n = qr.getModuleCount(); grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c))); }
    const n = grid.length, tot = n + 2 * q;
    W = H = tot * scale;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r]![c]) cells.push({ x: (q + c) * scale, y: H - (q + r + 1) * scale, w: scale + 0.3, h: scale + 0.3 });
  } else {
    const bits = opts.symbology === 'ean13' ? ean13Bits(opts.text) : code128Bits(opts.text);
    label = opts.symbology === 'ean13' ? (opts.text || '').replace(/\D/g, '').slice(0, 13) : (opts.text || '');
    const barH = (opts.barHeightMm ?? 15) * 2.83465;
    const textGap = opts.showText ? 11 : 0;
    W = (bits.length + 2 * q) * scale; H = barH + textGap;
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') cells.push({ x: (q + i) * scale, y: textGap, w: scale + 0.15, h: barH });
  }
  // footprint after rotation
  const swap = rot === 90 || rot === 270;
  const fw = swap ? H : W, fh = swap ? W : H;

  for (let p = 0; p < doc.getPageCount(); p++) {
    if (!sel.has(p + 1)) continue;
    const pg = doc.getPage(p);
    const { width: pw, height: ph } = pg.getSize();
    const hz = opts.position[1], vt = opts.position[0];
    let ax = hz === 'l' ? margin : hz === 'c' ? (pw - fw) / 2 : pw - fw - margin;
    let ay = vt === 't' ? ph - fh - margin : vt === 'm' ? (ph - fh) / 2 : margin;
    ax += opts.xOffsetPt ?? 0; ay -= opts.yOffsetPt ?? 0;
    if (!opts.transparent) pg.drawRectangle({ x: ax, y: ay, width: fw, height: fh, color: bgCol });
    for (const c of cells) { const r = rotateRect(rot, W, H, c.x, c.y, c.w, c.h); pg.drawRectangle({ x: ax + r.x, y: ay + r.y, width: r.w, height: r.h, color: barCol }); }
    if (opts.showText && !is2D && rot === 0 && label) {
      const ts = 8, tw = font.widthOfTextAtSize(label, ts);
      pg.drawText(label, { x: ax + (fw - tw) / 2, y: ay + 1, font, size: ts, color: barCol });
    }
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
  const blue = rgb(0.15, 0.4, 0.85);
  const dim = (bw: number, bh: number) => `${(bw / PT).toFixed(2)}in - ${Math.round(bw)} pt`;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const trim = pg.getTrimBox();
    const bleed = pg.getBleedBox();
    const wl = dim(trim.width, trim.height);
    const hl = `${(trim.height / PT).toFixed(2)}in - ${Math.round(trim.height)} pt`;
    pg.drawText(wl, { x: (w - font.widthOfTextAtSize(wl, 8)) / 2, y: 5, font, size: 8, color: col });
    pg.drawText(hl, { x: 11, y: h / 2 - font.widthOfTextAtSize(hl, 8) / 2, font, size: 8, color: col, rotate: degrees(90) });
    // Label the bleed size too, when it differs from the trim.
    const hasBleed = Math.abs(bleed.width - trim.width) > 1 || Math.abs(bleed.height - trim.height) > 1;
    if (hasBleed) {
      const bl = `bleed ${(bleed.width / PT).toFixed(2)}×${(bleed.height / PT).toFixed(2)}in`;
      pg.drawText(bl, { x: (w - font.widthOfTextAtSize(bl, 7)) / 2, y: h - 12, font, size: 7, color: blue });
    }
  }
  return doc.save();
}

// ── Spot-colour helpers (Separation channels for RIPs / cutters) ────────────
// Registers a `/Separation` colour space named `spotName` on the document (the
// name is what a RIP or digital cutter reads) with a DeviceRGB alternate for
// on-screen preview, wires it into the page's resources, and returns the
// resource key to reference in the content stream. Cached per document.
type SepCache = Map<string, import('pdf-lib').PDFRef>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureSeparation(PL: any, doc: any, page: any, spotName: string, preview: { r: number; g: number; b: number }, cache: SepCache): string {
  const { PDFName, PDFDict } = PL;
  const ctx = doc.context;
  let csRef = cache.get(spotName);
  if (!csRef) {
    const fnRef = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1, 1, 1], C1: [preview.r, preview.g, preview.b], N: 1 }));
    csRef = ctx.register(ctx.obj([PDFName.of('Separation'), PDFName.of(spotName), PDFName.of('DeviceRGB'), fnRef]));
    cache.set(spotName, csRef!);
  }
  const resName = ('Spot' + spotName.replace(/[^A-Za-z0-9]/g, '')) || 'SpotCS';
  page.node.normalize();
  let resources = page.node.Resources();
  if (!resources) { resources = ctx.obj({}); page.node.set(PDFName.of('Resources'), resources); }
  let csDict = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
  if (!csDict) { csDict = ctx.obj({}); resources.set(PDFName.of('ColorSpace'), csDict); }
  csDict.set(PDFName.of(resName), csRef);
  return resName;
}

// Append (or prepend) a raw content stream to a page without disturbing the
// existing content — used to lay spot-colour separations behind or in front.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addContentStream(PL: any, ctx: any, page: any, str: string, prepend: boolean): void {
  const { PDFName, PDFArray } = PL;
  const streamRef = ctx.register(ctx.stream(str));
  page.node.normalize();
  const key = PDFName.of('Contents');
  const cur = page.node.Contents();
  if (cur instanceof PDFArray) { if (prepend) cur.insert(0, streamRef); else cur.push(streamRef); }
  else if (cur) { const ref = page.node.get(key); const arr = ctx.obj(prepend ? [streamRef, ref] : [ref, streamRef]); page.node.set(key, arr); }
  else { page.node.set(key, streamRef); }
}

const F = (v: number) => v.toFixed(3);
// Vector path (no paint op) for a shape inside box (x,y,w,h).
function shapePathOps(shape: 'rectangle' | 'rounded' | 'ellipse', x: number, y: number, w: number, h: number, radius: number): string {
  if (shape === 'ellipse') {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = 0.5523 * rx, ky = 0.5523 * ry;
    return [
      `${F(cx + rx)} ${F(cy)} m`,
      `${F(cx + rx)} ${F(cy + ky)} ${F(cx + kx)} ${F(cy + ry)} ${F(cx)} ${F(cy + ry)} c`,
      `${F(cx - kx)} ${F(cy + ry)} ${F(cx - rx)} ${F(cy + ky)} ${F(cx - rx)} ${F(cy)} c`,
      `${F(cx - rx)} ${F(cy - ky)} ${F(cx - kx)} ${F(cy - ry)} ${F(cx)} ${F(cy - ry)} c`,
      `${F(cx + kx)} ${F(cy - ry)} ${F(cx + rx)} ${F(cy - ky)} ${F(cx + rx)} ${F(cy)} c`,
      'h',
    ].join('\n');
  }
  if (shape === 'rounded') {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2)), k = 0.5523 * r;
    if (r <= 0) return `${F(x)} ${F(y)} ${F(w)} ${F(h)} re`;
    return [
      `${F(x + r)} ${F(y)} m`,
      `${F(x + w - r)} ${F(y)} l`,
      `${F(x + w - r + k)} ${F(y)} ${F(x + w)} ${F(y + r - k)} ${F(x + w)} ${F(y + r)} c`,
      `${F(x + w)} ${F(y + h - r)} l`,
      `${F(x + w)} ${F(y + h - r + k)} ${F(x + w - r + k)} ${F(y + h)} ${F(x + w - r)} ${F(y + h)} c`,
      `${F(x + r)} ${F(y + h)} l`,
      `${F(x + r - k)} ${F(y + h)} ${F(x)} ${F(y + h - r + k)} ${F(x)} ${F(y + h - r)} c`,
      `${F(x)} ${F(y + r)} l`,
      `${F(x)} ${F(y + r - k)} ${F(x + r - k)} ${F(y)} ${F(x + r)} ${F(y)} c`,
      'h',
    ].join('\n');
  }
  return `${F(x)} ${F(y)} ${F(w)} ${F(h)} re`;
}
const circleOps = (cx: number, cy: number, r: number) => {
  const k = 0.5523 * r;
  return [
    `${F(cx + r)} ${F(cy)} m`,
    `${F(cx + r)} ${F(cy + k)} ${F(cx + k)} ${F(cy + r)} ${F(cx)} ${F(cy + r)} c`,
    `${F(cx - k)} ${F(cy + r)} ${F(cx - r)} ${F(cy + k)} ${F(cx - r)} ${F(cy)} c`,
    `${F(cx - r)} ${F(cy - k)} ${F(cx - k)} ${F(cy - r)} ${F(cx)} ${F(cy - r)} c`,
    `${F(cx + k)} ${F(cy - r)} ${F(cx + r)} ${F(cy - k)} ${F(cx + r)} ${F(cy)} c`,
  ].join('\n');
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boxOf(page: any, target: string, customWpt?: number, customHpt?: number): { x: number; y: number; w: number; h: number } {
  if (target === 'custom') {
    const mb = page.getMediaBox();
    const cw = customWpt ?? 216, ch = customHpt ?? 144;
    return { x: mb.x + (mb.width - cw) / 2, y: mb.y + (mb.height - ch) / 2, w: cw, h: ch };
  }
  const b = target === 'bleed' ? page.getBleedBox() : target === 'media' || target === 'flood' ? page.getMediaBox() : page.getTrimBox();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

// ── Die lines / Cut contour (spot-colour toolpath) ──────────────────────────
export interface CutContourOptions {
  shape: 'rectangle' | 'rounded' | 'ellipse';
  target: 'trim' | 'bleed' | 'media' | 'custom';
  customWpt?: number; customHpt?: number;
  spotName: string;              // e.g. 'CutContour', 'KissCut', 'Crease', 'Perf', 'ThruCut', 'DieCut'
  thicknessPt?: number;          // default 0.25
  dashed?: boolean;
  dashLenPt?: number;            // default 6
  dashGapPt?: number;            // default 3
  cornerRadiusPt?: number;       // rounded only, default 8.5
  xOffsetPt?: number;            // + = right
  yOffsetPt?: number;            // + = down
  previewColor?: { r: number; g: number; b: number };
  pages?: string;
}

export async function addCutContour(bytes: Uint8Array, opts: CutContourOptions): Promise<Uint8Array> {
  const PL = await import('pdf-lib');
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const preview = opts.previewColor ?? { r: 0.925, g: 0, b: 0.55 };   // magenta preview
  const th = opts.thicknessPt ?? 0.25;
  const cache: SepCache = new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i]!;
    const resName = ensureSeparation(PL, doc, page, opts.spotName, preview, cache);
    const b = boxOf(page, opts.target, opts.customWpt, opts.customHpt);
    const x = b.x + (opts.xOffsetPt ?? 0), y = b.y - (opts.yOffsetPt ?? 0);
    const path = shapePathOps(opts.shape, x, y, b.w, b.h, opts.cornerRadiusPt ?? 8.5);
    const dash = opts.dashed ? `[${opts.dashLenPt ?? 6} ${opts.dashGapPt ?? 3}] 0 d\n` : '';
    addContentStream(PL, doc.context, page, `\nq\n/${resName} CS\n1 SCN\n${th} w\n1 J 1 j\n${dash}${path}\nS\nQ\n`, false);
  }
  return doc.save();
}

// ── White ink / spot varnish (flood or targeted spot-colour fill) ───────────
export interface WhiteVarnishOptions {
  spotName: string;              // 'White' or 'Varnish' (or custom)
  coverage: 'flood' | 'trim' | 'bleed' | 'custom';
  customWpt?: number; customHpt?: number;
  tint?: number;                 // 0..1 (default 1)
  under?: boolean;               // white under-base (behind art) vs varnish (on top)
  xOffsetPt?: number; yOffsetPt?: number;
  previewColor?: { r: number; g: number; b: number };
  pages?: string;
}

export async function addWhiteVarnish(bytes: Uint8Array, opts: WhiteVarnishOptions): Promise<Uint8Array> {
  const PL = await import('pdf-lib');
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const preview = opts.previewColor ?? { r: 0.85, g: 0.86, b: 0.92 };
  const tint = opts.tint ?? 1;
  const cache: SepCache = new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i]!;
    const resName = ensureSeparation(PL, doc, page, opts.spotName, preview, cache);
    const b = boxOf(page, opts.coverage, opts.customWpt, opts.customHpt);
    const x = b.x + (opts.xOffsetPt ?? 0), y = b.y - (opts.yOffsetPt ?? 0);
    addContentStream(PL, doc.context, page, `\nq\n/${resName} cs\n${F(tint)} scn\n${F(x)} ${F(y)} ${F(b.w)} ${F(b.h)} re\nf\nQ\n`, !!opts.under);
  }
  return doc.save();
}

// ── Braille (Grade-1) ───────────────────────────────────────────────────────
const BRAILLE_G1: Record<string, number[]> = {
  a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4], g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4], j: [2, 4, 5],
  k: [1, 3], l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5], p: [1, 2, 3, 4], q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5], s: [2, 3, 4], t: [2, 3, 4, 5],
  u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6], x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6], z: [1, 3, 5, 6],
  ' ': [], '.': [2, 5, 6], ',': [2], '-': [3, 6], '?': [2, 3, 6], '!': [2, 3, 5], "'": [3], ';': [2, 3], ':': [2, 5],
};
type Cell = number[] | '\n';
function textToBrailleCells(text: string): Cell[] {
  const cells: Cell[] = [];
  let numberMode = false;
  for (const raw of text) {
    if (raw === '\n') { cells.push('\n'); numberMode = false; continue; }
    const ch = raw.toLowerCase();
    if (ch >= '0' && ch <= '9') {
      if (!numberMode) { cells.push([3, 4, 5, 6]); numberMode = true; }   // number sign ⠼
      const idx = ch === '0' ? 9 : ch.charCodeAt(0) - 49;                 // '1'→0 … '9'→8, '0'→9
      cells.push(BRAILLE_G1['abcdefghij'[idx]!]!);
    } else {
      numberMode = false;
      cells.push(BRAILLE_G1[ch] ?? []);                                   // unknown → blank cell
    }
  }
  return cells;
}

export interface BrailleOptions {
  text: string;
  xPt?: number; yPt?: number;    // top-left origin of the first dot (default 1" in from top-left)
  dotDiaPt?: number;             // default 4.25 (1.5 mm)
  dotPitchPt?: number;           // within-cell dot spacing (default 7.09 = 2.5 mm)
  cellSpacePt?: number;          // cell-to-cell advance (default 17.0 = 6 mm)
  lineSpacePt?: number;          // line-to-line advance (default 28.35 = 10 mm)
  spotName?: string;             // optional Separation channel (e.g. 'Varnish' / 'Emboss')
  tint?: number;
  previewColor?: { r: number; g: number; b: number };
  pages?: string;
}

export async function addBraille(bytes: Uint8Array, opts: BrailleOptions): Promise<Uint8Array> {
  const PL = await import('pdf-lib');
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? 'all', n);
  const r = (opts.dotDiaPt ?? 4.25) / 2;
  const pitch = opts.dotPitchPt ?? 7.09;
  const cellAdv = opts.cellSpacePt ?? 17.0;
  const lineAdv = opts.lineSpacePt ?? 28.35;
  const cells = textToBrailleCells(opts.text);
  const useSpot = !!opts.spotName;
  const preview = opts.previewColor ?? { r: 0.55, g: 0.55, b: 0.6 };
  const cache: SepCache = new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i]!;
    const { width, height } = page.getSize();
    const sx = opts.xPt ?? 72;
    let cx = sx, cy = (opts.yPt ?? height - 72);
    let ops = '\nq\n';
    if (useSpot) { const resName = ensureSeparation(PL, doc, page, opts.spotName!, preview, cache); ops += `/${resName} cs\n${F(opts.tint ?? 1)} scn\n`; }
    else ops += `${F(preview.r)} ${F(preview.g)} ${F(preview.b)} rg\n`;
    for (const cell of cells) {
      if (cell === '\n') { cx = sx; cy -= lineAdv; continue; }
      for (const d of cell) {
        const col = d <= 3 ? 0 : 1, row = (d - 1) % 3;
        ops += circleOps(cx + col * pitch, cy - row * pitch, r) + '\nf\n';
      }
      cx += cellAdv;
      if (cx > width - sx) { cx = sx; cy -= lineAdv; }                    // wrap at the right margin
    }
    ops += 'Q\n';
    addContentStream(PL, doc.context, page, ops, false);
  }
  return doc.save();
}

// ── Nesting (Stickers): bin-packing + optional true-shape ───────────────────
// Packs the source pages (which may be different sizes = different stickers)
// onto sheets or a roll, minimising waste. Bounding-box mode uses a skyline
// bottom-left packer with optional 90° rotation. True-shape mode rasterises each
// item's alpha outline (via pdf.js) and packs into each other's negative space.

export interface NestOptions {
  sheetWIn: number; sheetHIn: number;
  roll: boolean;            // roll media: fixed width, variable (grown) length
  paddingIn: number;        // gap between items
  marginIn: number;         // keep-away from sheet edges
  allowRotate: boolean;     // allow 90° rotation
  copies: number;           // copies per source page
  fillSheet: boolean;       // fill a sheet with copies (ignores `copies`)
  trueShape?: boolean;      // rasterise outlines + pack into negative space
  dpi?: number;             // rasterisation DPI for true-shape (default 36)
}

interface NestItem { page: number; w: number; h: number; }
interface NestPlaced { page: number; x: number; y: number; w: number; h: number; rot: boolean; }

// Skyline bottom-left: find the lowest, then leftmost, spot for a w×h box.
function skylineFind(sky: { x: number; y: number; w: number }[], w: number, h: number, sheetW: number, sheetH: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  for (let i = 0; i < sky.length; i++) {
    const x = sky[i]!.x;
    if (x + w > sheetW + 1e-6) continue;
    // max skyline height over [x, x+w]
    let y = 0, covered = 0, j = i;
    while (j < sky.length && covered < w - 1e-6) { y = Math.max(y, sky[j]!.y); covered += sky[j]!.w; j++; }
    if (covered < w - 1e-6) continue;                 // ran off the edge
    if (y + h > sheetH + 1e-6) continue;
    if (!best || y < best.y - 1e-6 || (Math.abs(y - best.y) < 1e-6 && x < best.x)) best = { x, y };
  }
  return best;
}
function skylinePlace(sky: { x: number; y: number; w: number }[], x: number, y: number, w: number, h: number) {
  const top = y + h;
  const out: { x: number; y: number; w: number }[] = [];
  for (const s of sky) {
    const sx0 = s.x, sx1 = s.x + s.w;
    if (sx1 <= x + 1e-6 || sx0 >= x + w - 1e-6) { out.push(s); continue; }   // untouched
    if (sx0 < x - 1e-6) out.push({ x: sx0, y: s.y, w: x - sx0 });            // left remainder
    if (sx1 > x + w + 1e-6) out.push({ x: x + w, y: s.y, w: sx1 - (x + w) });// right remainder
  }
  out.push({ x, y: top, w });
  out.sort((a, b) => a.x - b.x);
  // merge equal-height neighbours
  const merged: { x: number; y: number; w: number }[] = [];
  for (const s of out) { const last = merged[merged.length - 1]; if (last && Math.abs(last.y - s.y) < 1e-6 && Math.abs(last.x + last.w - s.x) < 1e-6) last.w += s.w; else merged.push({ ...s }); }
  return merged;
}

// Rasterise a page to a coarse boolean occupancy grid via pdf.js (browser only).
// grid[row][col] = true where the artwork is non-transparent. cellPt = grid cell
// size in points. Returns null if pdf.js / canvas is unavailable.
async function rasterizeOccupancy(bytes: Uint8Array, pageIndex: number, cellPt: number): Promise<boolean[][] | null> {
  try {
    if (typeof document === 'undefined') return null;   // no DOM (e.g. Node) → skip
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import('pdfjs-dist');
    try { pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default; } catch { /* bundler resolves worker */ }
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await doc.getPage(pageIndex + 1);
    const scale = 72 / cellPt;                            // one output pixel ≈ one grid cell
    const vp = page.getViewport({ scale });
    const cols = Math.max(1, Math.ceil(vp.width)), rows = Math.max(1, Math.ceil(vp.height));
    const canvas = document.createElement('canvas');
    canvas.width = cols; canvas.height = rows;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const grid: boolean[][] = [];
    for (let r = 0; r < rows; r++) { const row: boolean[] = []; for (let c = 0; c < cols; c++) row.push(data[(r * cols + c) * 4 + 3]! > 16); grid.push(row); }
    return grid;
  } catch { return null; }
}

// True-shape pack: place each item's solid cells into the sheet's free cells
// (bottom-left-first), so shapes nest into each other's negative space.
async function nestTrueShape(bytes: Uint8Array, srcPages: any[], items: NestItem[], opts: NestOptions): Promise<NestPlaced[][] | null> {
  const cellPt = Math.max(2, 72 / (opts.dpi ?? 36));     // grid resolution
  const occ: (boolean[][] | null)[] = [];
  for (let i = 0; i < srcPages.length; i++) occ[i] = await rasterizeOccupancy(bytes, i, cellPt);
  if (occ.some(o => !o)) return null;                    // rasterisation unavailable → fall back
  const pad = Math.round((opts.paddingIn * PT) / cellPt);
  const m = Math.round((opts.marginIn * PT) / cellPt);
  const SW = Math.floor((opts.sheetWIn * PT) / cellPt) - 2 * m;
  const SH = opts.roll ? 100000 : Math.floor((opts.sheetHIn * PT) / cellPt) - 2 * m;
  const rot90 = (g: boolean[][]) => { const R = g.length, C = g[0]!.length; const o: boolean[][] = Array.from({ length: C }, () => new Array(R).fill(false)); for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (g[r]![c]) o[C - 1 - c]![r] = true; return o; };
  const sheets: NestPlaced[][] = [];
  let grid: Uint8Array = new Uint8Array(SW * (opts.roll ? 4000 : SH));
  let gridH = opts.roll ? 4000 : SH;
  let placed: NestPlaced[] = [];
  const fits = (shape: boolean[][], px: number, py: number) => {
    const R = shape.length, C = shape[0]!.length;
    if (px + C > SW || py + R > gridH) return false;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (shape[r]![c]) { const gy = py + r, gx = px + c; if (grid[gy * SW + gx]) return false; }
    return true;
  };
  const stamp = (shape: boolean[][], px: number, py: number) => { const R = shape.length, C = shape[0]!.length; for (let r = -pad; r < R + pad; r++) for (let c = -pad; c < C + pad; c++) { const sr = Math.min(Math.max(r, 0), R - 1), sc = Math.min(Math.max(c, 0), C - 1); if (shape[sr]![sc]) { const gy = py + r, gx = px + c; if (gy >= 0 && gy < gridH && gx >= 0 && gx < SW) grid[gy * SW + gx] = 1; } } };
  const flush = () => { if (placed.length) sheets.push(placed); placed = []; grid = new Uint8Array(SW * gridH); };
  for (const it of items) {
    const shapes: [boolean[][], boolean][] = [[occ[it.page]!, false]];
    if (opts.allowRotate) shapes.push([rot90(occ[it.page]!), true]);
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      let best: { x: number; y: number; shape: boolean[][]; rot: boolean } | null = null;
      for (const [shape, rot] of shapes) {
        outer: for (let py = 0; py <= gridH - shape.length; py++) for (let px = 0; px <= SW - shape[0]!.length; px++) {
          if (fits(shape, px, py)) { if (!best || py < best.y || (py === best.y && px < best.x)) best = { x: px, y: py, shape, rot }; break outer; }
        }
      }
      if (best) { stamp(best.shape, best.x, best.y); const w = (best.rot ? it.h : it.w), h = (best.rot ? it.w : it.h); placed.push({ page: it.page, x: (m + best.x) * cellPt, y: best.y * cellPt, w, h, rot: best.rot }); done = true; }
      else if (opts.fillSheet) { done = true; }
      else flush();
    }
    if (opts.fillSheet && !done) break;
  }
  if (placed.length) sheets.push(placed);
  return sheets.length ? sheets : null;
}

export async function nestPdf(bytes: Uint8Array, opts: NestOptions): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  if (!srcPages.length) throw new Error('Empty PDF');
  const pad = opts.paddingIn * PT, m = opts.marginIn * PT;
  const sheetW = opts.sheetWIn * PT - 2 * m;
  const sheetH = (opts.roll ? Infinity : opts.sheetHIn * PT - 2 * m);
  // Build the item list.
  const base: NestItem[] = srcPages.map((p, i) => { const s = p.getSize(); return { page: i, w: s.width, h: s.height }; });
  const items: NestItem[] = [];
  if (opts.fillSheet) { const per = 400; for (let c = 0; c < per; c++) for (const b of base) items.push({ ...b }); }
  else { for (let c = 0; c < Math.max(1, opts.copies); c++) for (const b of base) items.push({ ...b }); }
  // Sort tallest-first for better skyline packing.
  items.sort((a, b) => b.h - a.h);

  // True-shape nesting (pdf.js) when requested; falls back to bounding-box if the
  // rasteriser is unavailable (e.g. non-browser) or nothing rasterised.
  if (opts.trueShape) {
    const ts = await nestTrueShape(bytes, srcPages, items, opts);
    if (ts) return renderNest(await PDFDocument.create(), srcPages, ts, opts, degrees);
  }

  const sheets: NestPlaced[][] = [];
  let sky: { x: number; y: number; w: number }[] = [{ x: 0, y: 0, w: sheetW }];
  let placed: NestPlaced[] = [];
  let maxTop = 0;
  const newSheet = () => { if (placed.length) sheets.push(placed); placed = []; sky = [{ x: 0, y: 0, w: sheetW }]; maxTop = 0; };
  for (const it of items) {
    const tryOrient: [number, number, boolean][] = opts.allowRotate ? [[it.w, it.h, false], [it.h, it.w, true]] : [[it.w, it.h, false]];
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      let bestPos: { x: number; y: number; w: number; h: number; rot: boolean } | null = null;
      for (const [w, h, rot] of tryOrient) {
        const wp = w + pad, hp = h + pad;
        const pos = skylineFind(sky, wp, hp, sheetW, sheetH);
        if (pos && (!bestPos || pos.y < bestPos.y)) bestPos = { x: pos.x, y: pos.y, w: wp, h: hp, rot };
      }
      if (bestPos) { placed.push({ page: it.page, x: m + bestPos.x, y: bestPos.y, w: bestPos.w - pad, h: bestPos.h - pad, rot: bestPos.rot }); sky = skylinePlace(sky, bestPos.x, bestPos.y, bestPos.w, bestPos.h); maxTop = Math.max(maxTop, bestPos.y + bestPos.h); done = true; }
      else if (opts.fillSheet) { done = true; }   // sheet full — stop adding for fill mode on this size
      else { newSheet(); }                          // start a fresh sheet and retry once
    }
    if (opts.fillSheet && !done) break;
  }
  if (placed.length) sheets.push(placed);
  if (!sheets.length) throw new Error('Nothing fit — increase sheet size or reduce item size.');
  return renderNest(await PDFDocument.create(), srcPages, sheets, opts, degrees);
}

// Render packed sheets to a PDF (shared by bounding-box + true-shape paths).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderNest(outDoc: any, srcPages: any[], sheets: NestPlaced[][], opts: NestOptions, degrees: any): Promise<Uint8Array> {
  const m = opts.marginIn * PT;
  const embeds = await outDoc.embedPages(srcPages);
  for (const sheet of sheets) {
    const usedTop = Math.max(...sheet.map(p => p.y + p.h));
    const pageH = opts.roll ? usedTop + 2 * m : opts.sheetHIn * PT;
    const pg = outDoc.addPage([opts.sheetWIn * PT, pageH]);
    for (const it of sheet) {
      const emb = embeds[it.page]!;
      const yTop = pageH - m - (it.y + it.h);   // convert top-down pack coords to PDF (bottom-up)
      if (it.rot) pg.drawPage(emb, { x: it.x + it.w, y: yTop, width: it.h, height: it.w, rotate: degrees(90) });
      else pg.drawPage(emb, { x: it.x, y: yTop, width: it.w, height: it.h });
    }
  }
  return outDoc.save();
}

// ── Download helper ─────────────────────────────────────────────────────────

export function downloadFile(bytes: Uint8Array, filename: string, mime = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function downloadPdf(bytes: Uint8Array, filename: string) {
  downloadFile(bytes, filename, 'application/pdf');
}

export function downloadMultiple(files: Uint8Array[], baseName: string) {
  files.forEach((bytes,i) => downloadPdf(bytes,`${baseName}-part${i+1}.pdf`));
}
