const PT = 72;
async function getPdfInfo(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (!pages.length) throw new Error("PDF has no pages");
  const { width, height } = pages[0].getSize();
  return {
    count: pages.length,
    widthPt: Math.round(width * 100) / 100,
    heightPt: Math.round(height * 100) / 100,
    widthIn: Math.round(width / PT * 1e3) / 1e3,
    heightIn: Math.round(height / PT * 1e3) / 1e3
  };
}
function drawCropMarks(page, rgb, tx, ty, tw, th, off, len) {
  const c = rgb(0, 0, 0);
  const segs = [
    [tx - off - len, ty, tx - off, ty],
    [tx, ty - off - len, tx, ty - off],
    [tx + tw + off, ty, tx + tw + off + len, ty],
    [tx + tw, ty - off - len, tx + tw, ty - off],
    [tx - off - len, ty + th, tx - off, ty + th],
    [tx, ty + th + off, tx, ty + th + off + len],
    [tx + tw + off, ty + th, tx + tw + off + len, ty + th],
    [tx + tw, ty + th + off, tx + tw, ty + th + off + len]
  ];
  for (const [x1, y1, x2, y2] of segs)
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: c });
}
async function imposeBooklet(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const paddedN = Math.ceil(N / 4) * 4;
  const numSheets = paddedN / 4;
  const { width: pw, height: ph } = srcPages[0].getSize();
  const mPt = opts.marginIn * PT, gPt = opts.gutterIn * PT, offPt = opts.markOffIn * PT, lenPt = opts.markLenIn * PT;
  const spreadW = mPt * 2 + pw * 2 + gPt, spreadH = mPt * 2 + ph;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  function emb(n) {
    return n >= 1 && n <= N ? embeds[n - 1] : null;
  }
  for (let s = 0; s < numSheets; s++) {
    const creepPt = numSheets > 1 ? s / (numSheets - 1) * opts.creepIn * PT : 0;
    const xL = mPt - creepPt, xR = mPt + pw + gPt + creepPt, yB = mPt;
    let aL, aR, bL, bR;
    if (!opts.rtl) {
      aL = paddedN - s * 2;
      aR = s * 2 + 1;
      bL = s * 2 + 2;
      bR = paddedN - s * 2 - 1;
    } else {
      aL = s * 2 + 1;
      aR = paddedN - s * 2;
      bL = paddedN - s * 2 - 1;
      bR = s * 2 + 2;
    }
    for (const [left, right] of [[aL, aR], [bL, bR]]) {
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
function computeNUpGrid(opts) {
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT, mPt = opts.marginIn * PT;
  const gxPt = opts.gutterIn * PT, gyPt = (opts.gutterYIn ?? opts.gutterIn) * PT;
  const fixed = !!(opts.cellWIn && opts.cellHIn);
  if (fixed) {
    const cellW2 = opts.cellWIn * PT, cellH2 = opts.cellHIn * PT;
    const cols2 = Math.max(1, Math.floor((shW - 2 * mPt + gxPt) / (cellW2 + gxPt) + 1e-6));
    const rows2 = Math.max(1, Math.floor((shH - 2 * mPt + gyPt) / (cellH2 + gyPt) + 1e-6));
    const blockW = cols2 * cellW2 + (cols2 - 1) * gxPt, blockH = rows2 * cellH2 + (rows2 - 1) * gyPt;
    return { cols: cols2, rows: rows2, cellWPt: cellW2, cellHPt: cellH2, leftGapPt: (shW - blockW) / 2, topGapPt: (shH - blockH) / 2, gxPt, gyPt };
  }
  const cols = Math.max(1, opts.cols), rows = Math.max(1, opts.rows);
  const cellW = (shW - mPt * 2 - gxPt * (cols - 1)) / cols;
  const cellH = (shH - mPt * 2 - gyPt * (rows - 1)) / rows;
  return { cols, rows, cellWPt: cellW, cellHPt: cellH, leftGapPt: mPt, topGapPt: mPt, gxPt, gyPt };
}
async function imposeNUp(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT;
  const { cols, rows, cellWPt: cellW, cellHPt: cellH, leftGapPt, topGapPt, gxPt, gyPt } = computeNUpGrid(opts);
  const perSheet = cols * rows;
  const numSheets = opts.repeatFirst ? 1 : Math.max(1, Math.ceil(N / perSheet));
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
  for (let si = 0; si < numSheets; si++) {
    const sheet = outDoc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIdx = r * cols + c;
        let pi;
        if (opts.repeatFirst) pi = 0;
        else if (opts.cutStack) pi = cellIdx * numSheets + si;
        else pi = si * perSheet + cellIdx;
        if (pi >= N) continue;
        const emb = embeds[pi];
        if (!emb) continue;
        const x = leftGapPt + c * (cellW + gxPt), y = shH - topGapPt - cellH - r * (cellH + gyPt);
        sheet.drawPage(emb, { x, y, width: cellW, height: cellH });
        if (opts.addMarks) drawCropMarks(sheet, rgb, x, y, cellW, cellH, off, len);
      }
    }
  }
  return outDoc.save();
}
async function imposeTickets(bytes, opts) {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  if (!srcPages.length) throw new Error("Empty PDF");
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT, mPt = opts.marginIn * PT, gPt = opts.gutterIn * PT;
  const cols = Math.max(1, opts.cols), rows = Math.max(1, opts.rows);
  const cellW = (shW - mPt * 2 - gPt * (cols - 1)) / cols;
  const cellH = (shH - mPt * 2 - gPt * (rows - 1)) / rows;
  const perSheet = cols * rows;
  const numSheets = Math.max(1, Math.ceil(opts.count / perSheet));
  const outDoc = await PDFDocument.create();
  const [emb] = await outDoc.embedPages([srcPages[0]]);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT, inset = 4;
  let ticket = 0;
  for (let si = 0; si < numSheets; si++) {
    const sheet = outDoc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (ticket >= opts.count) continue;
        const num = opts.startNumber + ticket;
        ticket++;
        const x = mPt + c * (cellW + gPt), y = shH - mPt - cellH - r * (cellH + gPt);
        if (emb) sheet.drawPage(emb, { x, y, width: cellW, height: cellH });
        const label = `${opts.prefix}${String(num).padStart(opts.pad, "0")}`;
        const tw = font.widthOfTextAtSize(label, opts.fontSizePt);
        const tx = opts.position.includes("right") ? x + cellW - tw - inset : opts.position.includes("left") ? x + inset : x + (cellW - tw) / 2;
        const ty = opts.position.startsWith("top") ? y + cellH - opts.fontSizePt - inset : y + inset;
        sheet.drawText(label, { x: tx, y: ty, font, size: opts.fontSizePt, color: rgb(0, 0, 0) });
        if (opts.addMarks) drawCropMarks(sheet, rgb, x, y, cellW, cellH, off, len);
      }
    }
  }
  return outDoc.save();
}
async function addCropMarksOnly(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i].getSize();
    const mPt = opts.marginIn * PT, bPt = opts.bleedIn * PT;
    const pg = outDoc.addPage([pw + mPt * 2, ph + mPt * 2]);
    pg.drawPage(embeds[i], { x: mPt, y: mPt, width: pw, height: ph });
    drawCropMarks(pg, rgb, mPt + bPt, mPt + bPt, pw - bPt * 2, ph - bPt * 2, opts.markOffIn * PT, opts.markLenIn * PT);
  }
  return outDoc.save();
}
async function mergePdfs(files) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const pg of copied) out.addPage(pg);
  }
  return out.save();
}
async function rotatePdf(bytes, angleDeg) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const pg of doc.getPages()) pg.setRotation(degrees((pg.getRotation().angle + angleDeg) % 360));
  return doc.save();
}
async function flipPdf(bytes, direction) {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const pg = outDoc.addPage([w, h]);
    if (direction === "h") {
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, 1, w, 0));
    } else {
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, h));
    }
    pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
    pg.pushOperators(popGraphicsState());
  }
  return outDoc.save();
}
async function splitPdf(bytes, ranges) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const results = [];
  for (const part of ranges.split(",").map((s) => s.trim())) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start = parseInt(m[1]) - 1;
    const end = m[2] ? parseInt(m[2]) - 1 : start;
    const indices = [];
    for (let i = start; i <= end && i < n; i++) indices.push(i);
    if (!indices.length) continue;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(srcDoc, indices);
    for (const pg of pages) out.addPage(pg);
    results.push(await out.save());
  }
  return results;
}
async function overlayPdf(baseBytes, stampBytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const baseDoc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const stampDoc = await PDFDocument.load(stampBytes, { ignoreEncryption: true });
  const stampPages = stampDoc.getPages();
  const basePages = baseDoc.getPages();
  for (let i = 0; i < basePages.length; i++) {
    const pg = basePages[i];
    const { width: w, height: h } = pg.getSize();
    const stamp = stampPages[i % stampPages.length];
    const { width: sw, height: sh } = stamp.getSize();
    const [emb] = await baseDoc.embedPages([stamp]);
    if (!emb) continue;
    if (opts.mode === "fill") {
      pg.drawPage(emb, { x: 0, y: 0, width: w, height: h, opacity: opts.opacity });
    } else if (opts.mode === "center") {
      const scale = Math.min(w / sw, h / sh) * 0.85;
      pg.drawPage(emb, { x: (w - sw * scale) / 2, y: (h - sh * scale) / 2, width: sw * scale, height: sh * scale, opacity: opts.opacity });
    } else {
      const tC = opts.tileCols ?? 2, tR = opts.tileRows ?? 2;
      const tw = w / tC, th = h / tR;
      for (let r = 0; r < tR; r++) for (let c = 0; c < tC; c++)
        pg.drawPage(emb, { x: c * tw, y: r * th, width: tw, height: th, opacity: opts.opacity });
    }
  }
  return baseDoc.save();
}
async function shufflePages(bytes, orderStr) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const order = orderStr.split(",").map((s) => parseInt(s.trim()) - 1).filter((i) => i >= 0 && i < n);
  if (!order.length) throw new Error("No valid page numbers");
  const outDoc = await PDFDocument.create();
  const pages = await outDoc.copyPages(srcDoc, order);
  for (const pg of pages) outDoc.addPage(pg);
  return outDoc.save();
}
async function cropPdf(bytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const lPt = opts.left * PT, rPt = opts.right * PT, tPt = opts.top * PT, bPt = opts.bottom * PT;
    pg.setCropBox(lPt, bPt, w - lPt - rPt, h - tPt - bPt);
    pg.setTrimBox(lPt, bPt, w - lPt - rPt, h - tPt - bPt);
  }
  return doc.save();
}
async function addPageNumbers(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, pg] of doc.getPages().entries()) {
    const { width: w, height: h } = pg.getSize();
    const text = `${opts.prefix}${i + opts.startAt}${opts.suffix}`;
    const tw = font.widthOfTextAtSize(text, opts.fontSizePt);
    const m = opts.marginPt;
    const pos = opts.position;
    const x = pos.includes("right") ? w - tw - m : pos.includes("left") ? m : (w - tw) / 2;
    const y = pos.startsWith("top") ? h - m - opts.fontSizePt : m;
    pg.drawText(text, { x, y, font, size: opts.fontSizePt, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
const COLOR_BAR_SWATCHES = [
  { r: 0, g: 1, b: 1 },
  // C
  { r: 1, g: 0, b: 1 },
  // M
  { r: 1, g: 1, b: 0 },
  // Y
  { r: 0, g: 0, b: 0 },
  // K
  { r: 1, g: 0, b: 0 },
  // R
  { r: 0, g: 1, b: 0 },
  // G
  { r: 0, g: 0, b: 1 },
  // B
  { r: 1, g: 1, b: 1 },
  // W
  { r: 0.75, g: 0.75, b: 0.75 },
  // 25%
  { r: 0.5, g: 0.5, b: 0.5 },
  // 50%
  { r: 0.25, g: 0.25, b: 0.25 }
  // 75%
];
async function addColorBar(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const barH = opts.heightIn * PT;
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i].getSize();
    const pg = outDoc.addPage([pw, ph + barH]);
    const contentY = opts.position === "bottom" ? barH : 0;
    pg.drawPage(embeds[i], { x: 0, y: contentY, width: pw, height: ph });
    const barY = opts.position === "bottom" ? 0 : ph;
    const sw = pw / COLOR_BAR_SWATCHES.length;
    for (let j = 0; j < COLOR_BAR_SWATCHES.length; j++) {
      const s = COLOR_BAR_SWATCHES[j];
      pg.drawRectangle({ x: j * sw, y: barY, width: sw, height: barH, color: rgb(s.r, s.g, s.b), borderWidth: 0 });
    }
  }
  return outDoc.save();
}
async function imposeTiledPoster(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  if (!srcPages.length) throw new Error("Empty PDF");
  const { width: cw, height: ch } = srcPages[0].getSize();
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT;
  const overPt = opts.overlapIn * PT;
  const tileContentW = (cw + (opts.tilesAcross - 1) * overPt) / opts.tilesAcross;
  const tileContentH = (ch + (opts.tilesDown - 1) * overPt) / opts.tilesDown;
  const scale = Math.min(shW / tileContentW, shH / tileContentH);
  const outDoc = await PDFDocument.create();
  const [embed] = await outDoc.embedPages([srcPages[0]]);
  if (!embed) return outDoc.save();
  const scaledW = cw * scale, scaledH = ch * scale;
  const stepW = tileContentW * scale, stepH = tileContentH * scale;
  for (let r = 0; r < opts.tilesDown; r++) {
    for (let c = 0; c < opts.tilesAcross; c++) {
      const pg = outDoc.addPage([shW, shH]);
      const offsetX = c * stepW, offsetY = (opts.tilesDown - 1 - r) * stepH;
      pg.drawPage(embed, { x: -offsetX, y: -offsetY, width: scaledW, height: scaledH });
      if (opts.addMarks) {
        const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
        drawCropMarks(pg, rgb, 0, 0, shW, shH, off, len);
      }
    }
  }
  return outDoc.save();
}
function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
}
function downloadMultiple(files, baseName) {
  files.forEach((bytes, i) => downloadPdf(bytes, `${baseName}-part${i + 1}.pdf`));
}
export {
  addColorBar,
  addCropMarksOnly,
  addPageNumbers,
  computeNUpGrid,
  cropPdf,
  downloadMultiple,
  downloadPdf,
  flipPdf,
  getPdfInfo,
  imposeBooklet,
  imposeNUp,
  imposeTickets,
  imposeTiledPoster,
  mergePdfs,
  overlayPdf,
  rotatePdf,
  shufflePages,
  splitPdf
};
