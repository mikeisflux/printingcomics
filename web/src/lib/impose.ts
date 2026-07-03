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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCropMarks(page: any, rgb: any, tx: number, ty: number, tw: number, th: number, off: number, len: number) {
  const c = rgb(0, 0, 0);
  const segs: [number, number, number, number][] = [
    [tx-off-len,ty,  tx-off,ty],      [tx,ty-off-len,  tx,ty-off],
    [tx+tw+off,ty,   tx+tw+off+len,ty],[tx+tw,ty-off-len,tx+tw,ty-off],
    [tx-off-len,ty+th,tx-off,ty+th],  [tx,ty+th+off,   tx,ty+th+off+len],
    [tx+tw+off,ty+th,tx+tw+off+len,ty+th],[tx+tw,ty+th+off,tx+tw,ty+th+off+len],
  ];
  for (const [x1,y1,x2,y2] of segs)
    page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness:0.5, color:c });
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
}

export async function imposeBooklet(bytes: Uint8Array, opts: BookletOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const paddedN = Math.ceil(N / 4) * 4;
  const numSheets = paddedN / 4;
  const { width: pw, height: ph } = srcPages[0]!.getSize();
  const mPt = opts.marginIn*PT, gPt = opts.gutterIn*PT, offPt = opts.markOffIn*PT, lenPt = opts.markLenIn*PT;
  const spreadW = mPt*2 + pw*2 + gPt, spreadH = mPt*2 + ph;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  function emb(n: number) { return (n>=1&&n<=N)?embeds[n-1]!:null; }
  for (let s=0; s<numSheets; s++) {
    const creepPt = numSheets>1 ? (s/(numSheets-1))*opts.creepIn*PT : 0;
    const xL = mPt-creepPt, xR = mPt+pw+gPt+creepPt, yB = mPt;
    let aL:number,aR:number,bL:number,bR:number;
    if (!opts.rtl) { aL=paddedN-s*2; aR=s*2+1; bL=s*2+2; bR=paddedN-s*2-1; }
    else           { aL=s*2+1; aR=paddedN-s*2; bL=paddedN-s*2-1; bR=s*2+2; }
    for (const [left,right] of [[aL,aR],[bL,bR]] as [number,number][]) {
      const pg = outDoc.addPage([spreadW,spreadH]);
      const eL=emb(left), eR=emb(right);
      if (eL) pg.drawPage(eL, {x:xL,y:yB,width:pw,height:ph});
      if (eR) pg.drawPage(eR, {x:xR,y:yB,width:pw,height:ph});
      if (opts.addMarks) { drawCropMarks(pg,rgb,xL,yB,pw,ph,offPt,lenPt); drawCropMarks(pg,rgb,xR,yB,pw,ph,offPt,lenPt); }
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
  const numSheets=opts.repeatFirst?1:Math.max(1,Math.ceil(N/perSheet));
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  const off=opts.markOffIn*PT, len=opts.markLenIn*PT;
  for (let si=0; si<numSheets; si++) {
    const sheet=outDoc.addPage([shW,shH]);
    for (let r=0; r<rows; r++) {
      for (let c=0; c<cols; c++) {
        const cellIdx=r*cols+c;
        let pi:number;
        if (opts.repeatFirst) pi=0;
        else if (opts.cutStack) pi=cellIdx*numSheets+si;
        else pi=si*perSheet+cellIdx;
        if (pi>=N) continue;
        const emb=embeds[pi]; if (!emb) continue;
        const x=leftGapPt+c*(cellW+gxPt), y=shH-topGapPt-cellH-r*(cellH+gyPt);
        sheet.drawPage(emb, {x,y,width:cellW,height:cellH});
        if (opts.addMarks) drawCropMarks(sheet,rgb,x,y,cellW,cellH,off,len);
      }
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
        if (opts.addMarks) drawCropMarks(sheet,rgb,x,y,cellW,cellH,off,len);
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
}

export async function addCropMarksOnly(bytes: Uint8Array, opts: CropMarksOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  for (let i=0; i<embeds.length; i++) {
    const {width:pw,height:ph}=srcPages[i]!.getSize();
    const mPt=opts.marginIn*PT, bPt=opts.bleedIn*PT;
    const pg=outDoc.addPage([pw+mPt*2,ph+mPt*2]);
    pg.drawPage(embeds[i]!,{x:mPt,y:mPt,width:pw,height:ph});
    drawCropMarks(pg,rgb,mPt+bPt,mPt+bPt,pw-bPt*2,ph-bPt*2,opts.markOffIn*PT,opts.markLenIn*PT);
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

// ── Rotate ──────────────────────────────────────────────────────────────────

export async function rotatePdf(bytes: Uint8Array, angleDeg: 90|180|270): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  for (const pg of doc.getPages()) pg.setRotation(degrees((pg.getRotation().angle+angleDeg)%360));
  return doc.save();
}

// ── Flip / Mirror ───────────────────────────────────────────────────────────

export async function flipPdf(bytes: Uint8Array, direction: 'h'|'v'): Promise<Uint8Array> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const srcPages=srcDoc.getPages();
  const outDoc=await PDFDocument.create();
  const embeds=await outDoc.embedPages(srcPages);
  for (let i=0; i<embeds.length; i++) {
    const {width:w,height:h}=srcPages[i]!.getSize();
    const pg=outDoc.addPage([w,h]);
    if (direction==='h') {
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1,0,0,1,w,0));
    } else {
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(1,0,0,-1,0,h));
    }
    pg.drawPage(embeds[i]!,{x:0,y:0,width:w,height:h});
    pg.pushOperators(popGraphicsState());
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

// ── Overlay / Watermark ─────────────────────────────────────────────────────

export interface OverlayOptions {
  opacity: number;
  mode: 'center' | 'fill' | 'tile';
  tileRows?: number;
  tileCols?: number;
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
      pg.drawPage(emb,{x:(w-sw*scale)/2,y:(h-sh*scale)/2,width:sw*scale,height:sh*scale,opacity:opts.opacity});
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
// order: 1-indexed page numbers, e.g. [3,1,2] or "3,1,2"

export async function shufflePages(bytes: Uint8Array, orderStr: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const n=srcDoc.getPageCount();
  const order=orderStr.split(',').map(s=>parseInt(s.trim())-1).filter(i=>i>=0&&i<n);
  if (!order.length) throw new Error('No valid page numbers');
  const outDoc=await PDFDocument.create();
  const pages=await outDoc.copyPages(srcDoc,order);
  for (const pg of pages) outDoc.addPage(pg);
  return outDoc.save();
}

// ── Crop / Trim Box ─────────────────────────────────────────────────────────

export async function cropPdf(bytes: Uint8Array, opts: { top:number; right:number; bottom:number; left:number }): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  for (const pg of doc.getPages()) {
    const {width:w,height:h}=pg.getSize();
    const lPt=opts.left*PT, rPt=opts.right*PT, tPt=opts.top*PT, bPt=opts.bottom*PT;
    pg.setCropBox(lPt, bPt, w-lPt-rPt, h-tPt-bPt);
    pg.setTrimBox(lPt, bPt, w-lPt-rPt, h-tPt-bPt);
  }
  return doc.save();
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
        drawCropMarks(pg,rgb,0,0,shW,shH,off,len);
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

export async function generateBleed(bytes: Uint8Array, opts: { bleedIn: number }): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const b = opts.bleedIn * PT;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i]!.getSize();
    const pg = outDoc.addPage([w + 2 * b, h + 2 * b]);
    pg.drawPage(embeds[i]!, { x: 0, y: 0, width: w + 2 * b, height: h + 2 * b });
    pg.setTrimBox(b, b, w, h);
  }
  return outDoc.save();
}

// ── Header / Footer ─────────────────────────────────────────────────────────

export interface HeaderFooterOptions {
  header: string;
  footer: string;
  fontSizePt: number;
  marginPt: number;
  align: 'left' | 'center' | 'right';
}

export async function addHeaderFooter(bytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const bands: [string, number][] = [[opts.header, h - opts.marginPt], [opts.footer, opts.marginPt]];
    for (const [text, y] of bands) {
      if (!text) continue;
      const tw = font.widthOfTextAtSize(text, opts.fontSizePt);
      const x = opts.align === 'right' ? w - opts.marginPt - tw : opts.align === 'left' ? opts.marginPt : (w - tw) / 2;
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
    pg.drawText(opts.text || 'Job', { x: 6, y: ty, font, size: opts.fontSizePt, color: rgb(0.25, 0.25, 0.25) });
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
  qrColumn: string;   // header name to encode as a QR ('' = no QR)
  qrSizePt: number;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qrcode: any = null;
  if (qrIdx >= 0) { const mod = await import('qrcode-generator'); qrcode = (mod as unknown as { default?: unknown }).default ?? mod; }
  let idx = 0;
  for (let si = 0; si < numSheets; si++) {
    const pg = doc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (idx >= records.length) continue;
      const rec = records[idx]!; const num = opts.startNumber + idx; idx++;
      const x = mPt + c * (cellW + gPt), y = shH - mPt - cellH - r * (cellH + gPt);
      if (opts.showBorder) pg.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.8, 0.8, 0.82), borderWidth: 0.5 });
      const qrOn = !!qrcode && qrIdx >= 0;
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
      if (qrOn) drawQrCode(pg, rgb, qrcode, (rec[qrIdx] ?? '').trim(), x + cellW - qrSize - 8, y + (cellH - qrSize) / 2, qrSize);
      if (opts.autoNumber) {
        const label = `${opts.numberPrefix}${String(num).padStart(opts.numberPad, '0')}`;
        const tw = font.widthOfTextAtSize(label, opts.fontSizePt);
        pg.drawText(label, { x: qrOn ? x + 8 : x + cellW - tw - 8, y: y + 8, font, size: opts.fontSizePt, color: rgb(0.42, 0.42, 0.45) });
      }
      if (opts.addMarks) drawCropMarks(pg, rgb, x, y, cellW, cellH, off, len);
    }
  }
  return { pdf: await doc.save(), records: records.length, columns: headers };
}

// ── Zine (4 panels per side, 2 sides = 8-page booklet from 2 sheets) ────────
// Same as saddle stitch; the "zine" label and preset distinguish the use case.

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
