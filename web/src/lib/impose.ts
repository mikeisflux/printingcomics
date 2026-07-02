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
    const cols=Math.max(1, Math.floor((shW-2*mPt+gxPt)/(cellW+gxPt)));
    const rows=Math.max(1, Math.floor((shH-2*mPt+gyPt)/(cellH+gyPt)));
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
