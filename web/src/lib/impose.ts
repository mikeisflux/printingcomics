// Browser-side PDF imposition engine — uses pdf-lib (dynamically imported so
// it doesn't bloat the initial bundle). All processing is client-side; no
// file is ever uploaded.

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

// Draw crop marks at the 4 corners of a trim box.
// All coords in PDF points (origin bottom-left).
function drawCropMarks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any, rgb: any,
  trimX: number, trimY: number, trimW: number, trimH: number,
  offsetPt: number, lenPt: number,
) {
  const o = offsetPt, l = lenPt;
  const color = rgb(0, 0, 0);
  const segs: [number, number, number, number][] = [
    [trimX - o - l, trimY,          trimX - o, trimY],           // BL-H
    [trimX,         trimY - o - l,  trimX,     trimY - o],       // BL-V
    [trimX + trimW + o, trimY,      trimX + trimW + o + l, trimY], // BR-H
    [trimX + trimW,  trimY - o - l, trimX + trimW, trimY - o],  // BR-V
    [trimX - o - l, trimY + trimH,  trimX - o, trimY + trimH],  // TL-H
    [trimX,         trimY + trimH + o, trimX, trimY + trimH + o + l], // TL-V
    [trimX + trimW + o, trimY + trimH, trimX + trimW + o + l, trimY + trimH], // TR-H
    [trimX + trimW,  trimY + trimH + o, trimX + trimW, trimY + trimH + o + l], // TR-V
  ];
  for (const [x1, y1, x2, y2] of segs) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color });
  }
}

// ── Booklet / Saddle Stitch (2-up) ───────────────────────────────────────

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
  const margPt = opts.marginIn * PT;
  const gutPt  = opts.gutterIn * PT;
  const offPt  = opts.markOffIn * PT;
  const lenPt  = opts.markLenIn * PT;

  const spreadW = margPt * 2 + pw * 2 + gutPt;
  const spreadH = margPt * 2 + ph;

  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);

  function emb(n: number) { return (n >= 1 && n <= N) ? embeds[n - 1] : null; }

  for (let s = 0; s < numSheets; s++) {
    const creepPt = numSheets > 1 ? (s / (numSheets - 1)) * opts.creepIn * PT : 0;
    const xL = margPt - creepPt;
    const xR = margPt + pw + gutPt + creepPt;
    const yB = margPt;

    let aL: number, aR: number, bL: number, bR: number;
    if (!opts.rtl) {
      aL = paddedN - s * 2;   aR = s * 2 + 1;
      bL = s * 2 + 2;         bR = paddedN - s * 2 - 1;
    } else {
      aL = s * 2 + 1;         aR = paddedN - s * 2;
      bL = paddedN - s * 2 - 1; bR = s * 2 + 2;
    }

    for (const [left, right] of [[aL, aR], [bL, bR]] as [number, number][]) {
      const pg = outDoc.addPage([spreadW, spreadH]);
      const eL = emb(left), eR = emb(right);
      if (eL) pg.drawPage(eL, { x: xL, y: yB, width: pw, height: ph });
      if (eR) pg.drawPage(eR, { x: xR, y: yB, width: pw, height: ph });
      if (opts.addMarks) {
        drawCropMarks(pg, rgb, xL, yB, pw, ph, offPt, lenPt);
        drawCropMarks(pg, rgb, xR, yB, pw, ph, offPt, lenPt);
      }
    }
  }

  return outDoc.save();
}

// ── N-Up Grid / Step & Repeat ────────────────────────────────────────────

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
}

export async function imposeNUp(bytes: Uint8Array, opts: NUpOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;

  const shW = opts.sheetWIn * PT;
  const shH = opts.sheetHIn * PT;
  const mPt = opts.marginIn * PT;
  const gPt = opts.gutterIn * PT;

  const cellW = (shW - mPt * 2 - gPt * (opts.cols - 1)) / opts.cols;
  const cellH = (shH - mPt * 2 - gPt * (opts.rows - 1)) / opts.rows;

  const perSheet = opts.cols * opts.rows;
  const numSheets = opts.repeatFirst ? 1 : Math.ceil(N / perSheet);

  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);

  for (let si = 0; si < numSheets; si++) {
    const sheet = outDoc.addPage([shW, shH]);
    for (let r = 0; r < opts.rows; r++) {
      for (let c = 0; c < opts.cols; c++) {
        const cell = r * opts.cols + c;
        const pi = opts.repeatFirst ? 0 : si * perSheet + cell;
        if (pi >= N) continue;
        const x = mPt + c * (cellW + gPt);
        const y = shH - mPt - cellH - r * (cellH + gPt);
        sheet.drawPage(embeds[pi]!, { x, y, width: cellW, height: cellH });
        if (opts.addMarks) {
          const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
          drawCropMarks(sheet, rgb, x, y, cellW, cellH, off, len);
        }
      }
    }
  }

  return outDoc.save();
}

// ── Crop Marks Only ───────────────────────────────────────────────────────

export interface CropMarksOptions {
  bleedIn: number;
  marginIn: number;
  markLenIn: number;
  markOffIn: number;
}

export async function addCropMarksOnly(bytes: Uint8Array, opts: CropMarksOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);

  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i]!.getSize();
    const mPt = opts.marginIn * PT;
    const bPt = opts.bleedIn * PT;
    const pg = outDoc.addPage([pw + mPt * 2, ph + mPt * 2]);
    pg.drawPage(embeds[i]!, { x: mPt, y: mPt, width: pw, height: ph });
    drawCropMarks(pg, rgb, mPt + bPt, mPt + bPt, pw - bPt * 2, ph - bPt * 2, opts.markOffIn * PT, opts.markLenIn * PT);
  }

  return outDoc.save();
}

// ── Merge PDFs ────────────────────────────────────────────────────────────

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const pg of copied) out.addPage(pg);
  }
  return out.save();
}

// ── Rotate ────────────────────────────────────────────────────────────────

export async function rotatePdf(bytes: Uint8Array, angleDeg: 90 | 180 | 270): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const pg of doc.getPages()) {
    pg.setRotation(degrees((pg.getRotation().angle + angleDeg) % 360));
  }
  return doc.save();
}

// ── Download helper ────────────────────────────────────────────────────────

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
