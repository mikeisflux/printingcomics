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
function drawCropMarks(page, rgb, tx, ty, tw, th, off, len, style) {
  const c = style?.color ?? rgb(0, 0, 0);
  const thickness = style?.weight ?? 0.5;
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
  if (style?.center) {
    const cx = tx + tw / 2, cy = ty + th / 2;
    segs.push(
      [cx, ty - off - len, cx, ty - off],
      // bottom-centre
      [cx, ty + th + off, cx, ty + th + off + len],
      // top-centre
      [tx - off - len, cy, tx - off, cy],
      // left-centre
      [tx + tw + off, cy, tx + tw + off + len, cy]
      // right-centre
    );
  }
  for (const [x1, y1, x2, y2] of segs)
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: c });
}
async function imposeBooklet(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const { width: pw, height: ph } = srcPages[0].getSize();
  const mPt = opts.marginIn * PT, gPt = opts.gutterIn * PT, offPt = opts.markOffIn * PT, lenPt = opts.markLenIn * PT;
  const spreadW = mPt * 2 + pw * 2 + gPt, spreadH = mPt * 2 + ph;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  function emb(n) {
    return n >= 1 && n <= N ? embeds[n - 1] : null;
  }
  const sigPages = opts.signatureSheets && opts.signatureSheets > 0 ? opts.signatureSheets * 4 : Math.ceil(Math.max(1, N) / 4) * 4;
  for (let start = 1; start <= Math.max(1, N); start += sigPages) {
    const numSheets = sigPages / 4;
    for (let s = 0; s < numSheets; s++) {
      const creepPt = numSheets > 1 ? s / (numSheets - 1) * opts.creepIn * PT : 0;
      const xL = mPt - creepPt, xR = mPt + pw + gPt + creepPt, yB = mPt;
      let aL, aR, bL, bR;
      if (!opts.rtl) {
        aL = sigPages - s * 2;
        aR = s * 2 + 1;
        bL = s * 2 + 2;
        bR = sigPages - s * 2 - 1;
      } else {
        aL = s * 2 + 1;
        aR = sigPages - s * 2;
        bL = sigPages - s * 2 - 1;
        bR = s * 2 + 2;
      }
      const g = (loc) => start - 1 + loc;
      for (const [left, right] of [[aL, aR], [bL, bR]]) {
        const pg = outDoc.addPage([spreadW, spreadH]);
        const eL = emb(g(left)), eR = emb(g(right));
        if (eL) pg.drawPage(eL, { x: xL, y: yB, width: pw, height: ph });
        if (eR) pg.drawPage(eR, { x: xR, y: yB, width: pw, height: ph });
        if (opts.addMarks) {
          drawCropMarks(pg, rgb, xL, yB, pw, ph, offPt, lenPt, markStyle);
          drawCropMarks(pg, rgb, xR, yB, pw, ph, offPt, lenPt, markStyle);
        }
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
  const duplex = !!opts.duplex;
  const totalItems = duplex ? Math.ceil(N / 2) : N;
  const numSheets = opts.repeatFirst ? 1 : Math.max(1, Math.ceil(totalItems / perSheet));
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT, bl = (opts.bleedIn ?? 0) * PT;
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const shortEdge = opts.duplexFlip === "short";
  const itemAt = (si, cellIdx) => {
    if (opts.repeatFirst) return 0;
    if (opts.cutStack) return cellIdx * numSheets + si;
    return si * perSheet + cellIdx;
  };
  const place = (sheet, itemIdx, r, c, isBack) => {
    const pi = duplex ? itemIdx * 2 + (isBack ? 1 : 0) : itemIdx;
    if (pi >= N) return;
    const emb = embeds[pi];
    if (!emb) return;
    let cc = c, rr = r;
    if (isBack) {
      if (shortEdge) rr = rows - 1 - r;
      else cc = cols - 1 - c;
    }
    const x = leftGapPt + cc * (cellW + gxPt), y = shH - topGapPt - cellH - rr * (cellH + gyPt);
    sheet.drawPage(emb, { x, y, width: cellW, height: cellH });
    if (opts.addMarks) drawCropMarks(sheet, rgb, x + bl, y + bl, cellW - 2 * bl, cellH - 2 * bl, off, len, markStyle);
  };
  for (let si = 0; si < numSheets; si++) {
    const front = outDoc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place(front, itemAt(si, r * cols + c), r, c, false);
    if (duplex) {
      const back = outDoc.addPage([shW, shH]);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place(back, itemAt(si, r * cols + c), r, c, true);
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
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
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
        if (opts.addMarks) drawCropMarks(sheet, rgb, x, y, cellW, cellH, off, len, markStyle);
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
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i].getSize();
    const mPt = opts.marginIn * PT, bPt = opts.bleedIn * PT;
    const pg = outDoc.addPage([pw + mPt * 2, ph + mPt * 2]);
    pg.drawPage(embeds[i], { x: mPt, y: mPt, width: pw, height: ph });
    drawCropMarks(pg, rgb, mPt + bPt, mPt + bPt, pw - bPt * 2, ph - bPt * 2, opts.markOffIn * PT, opts.markLenIn * PT, markStyle);
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
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}
function expandShuffle(expr, n, rot = 0) {
  const out = [];
  for (let tok of splitTopLevel(expr)) {
    tok = tok.trim();
    if (!tok) continue;
    let r = rot;
    while (/[><^]$/.test(tok)) {
      const ch = tok.slice(-1);
      r = (r + (ch === ">" ? 90 : ch === "<" ? 270 : 180)) % 360;
      tok = tok.slice(0, -1).trim();
    }
    const low = tok.toLowerCase();
    let m;
    if (m = tok.match(/^(\d+)\s*\*\s*\(([\s\S]*)\)$/)) {
      const times = parseInt(m[1]), sub = expandShuffle(m[2], n, r);
      for (let k = 0; k < times; k++) out.push(...sub.map((x) => ({ ...x })));
      continue;
    }
    if (tok.startsWith("[") && tok.endsWith("]")) {
      const lists = splitTopLevel(tok.slice(1, -1)).map((s) => expandShuffle(s, n, r));
      const maxLen = Math.max(0, ...lists.map((l) => l.length));
      for (let i = 0; i < maxLen; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
      continue;
    }
    if (m = tok.match(/^group\s+(\d+)\s*:\s*([\s\S]+)$/i)) {
      const g = Math.max(1, parseInt(m[1]));
      const order = m[2].trim().split(/[\s,]+/).map((x) => parseInt(x)).filter((x) => !isNaN(x));
      for (let base = 0; base < n; base += g) for (const loc of order) {
        const p2 = base + loc;
        if (p2 >= 1 && p2 <= n) out.push({ page: p2, rot: r });
      }
      continue;
    }
    if (low === "all") {
      for (let i = 1; i <= n; i++) out.push({ page: i, rot: r });
      continue;
    }
    if (low === "odd") {
      for (let i = 1; i <= n; i += 2) out.push({ page: i, rot: r });
      continue;
    }
    if (low === "even") {
      for (let i = 2; i <= n; i += 2) out.push({ page: i, rot: r });
      continue;
    }
    if (low === "first") {
      out.push({ page: 1, rot: r });
      continue;
    }
    if (low === "last") {
      out.push({ page: n, rot: r });
      continue;
    }
    if (low === "reverse" || low === "last-1" || low === "last-first") {
      for (let i = n; i >= 1; i--) out.push({ page: i, rot: r });
      continue;
    }
    if (/^[bxBX_]$/.test(tok) || tok === "0") {
      out.push({ page: null, rot: r });
      continue;
    }
    if (m = tok.match(/^(\d+|last|first|n)\s*-\s*(\d+|last|first|n)$/i)) {
      const res = (t) => {
        const tl = t.toLowerCase();
        return tl === "last" || tl === "n" ? n : tl === "first" ? 1 : parseInt(t);
      };
      const a = res(m[1]), b = res(m[2]);
      if (a <= b) for (let i = a; i <= b; i++) out.push({ page: i, rot: r });
      else for (let i = a; i >= b; i--) out.push({ page: i, rot: r });
      continue;
    }
    const p = parseInt(tok);
    if (!isNaN(p)) out.push({ page: p, rot: r });
  }
  return out;
}
async function shufflePages(bytes, orderStr) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const ref = srcDoc.getPage(0).getSize();
  const valid = expandShuffle(orderStr, n).filter((x) => x.page === null || x.page >= 1 && x.page <= n);
  if (!valid.length) throw new Error("No valid page numbers");
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
async function resizePdf(bytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    if (opts.mode === "scale") {
      const f = Math.max(0.01, opts.scalePct / 100);
      const nw = w * f, nh = h * f;
      const pg = outDoc.addPage([nw, nh]);
      pg.drawPage(embeds[i], { x: 0, y: 0, width: nw, height: nh });
    } else {
      const tw = opts.targetWIn * PT, th = opts.targetHIn * PT;
      const pg = outDoc.addPage([tw, th]);
      if (opts.mode === "stretch") {
        pg.drawPage(embeds[i], { x: 0, y: 0, width: tw, height: th });
      } else {
        const s = Math.min(tw / w, th / h), dw = w * s, dh = h * s;
        pg.drawPage(embeds[i], { x: (tw - dw) / 2, y: (th - dh) / 2, width: dw, height: dh });
      }
    }
  }
  return outDoc.save();
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
        drawCropMarks(pg, rgb, 0, 0, shW, shH, off, len, { center: !!opts.centerMarks, weight: opts.markWeightPt });
      }
    }
  }
  return outDoc.save();
}
async function generateBleed(bytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const b = opts.bleedIn * PT;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const pg = outDoc.addPage([w + 2 * b, h + 2 * b]);
    pg.drawPage(embeds[i], { x: 0, y: 0, width: w + 2 * b, height: h + 2 * b });
    pg.setTrimBox(b, b, w, h);
  }
  return outDoc.save();
}
async function addHeaderFooter(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const bands = [[opts.header, h - opts.marginPt], [opts.footer, opts.marginPt]];
    for (const [text, y] of bands) {
      if (!text) continue;
      const tw = font.widthOfTextAtSize(text, opts.fontSizePt);
      const x = opts.align === "right" ? w - opts.marginPt - tw : opts.align === "left" ? opts.marginPt : (w - tw) / 2;
      pg.drawText(text, { x, y, font, size: opts.fontSizePt, color: rgb(0.1, 0.1, 0.1) });
    }
  }
  return doc.save();
}
async function addTextWatermark(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const rad = opts.angleDeg * Math.PI / 180;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const tw = font.widthOfTextAtSize(opts.text || "PROOF", opts.fontSizePt);
    const x = w / 2 - tw / 2 * Math.cos(rad);
    const y = h / 2 - tw / 2 * Math.sin(rad);
    pg.drawText(opts.text || "PROOF", {
      x,
      y,
      font,
      size: opts.fontSizePt,
      color: rgb(0.5, 0.5, 0.5),
      opacity: opts.opacity,
      rotate: degrees(opts.angleDeg)
    });
  }
  return doc.save();
}
async function addJobSlug(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const strip = opts.fontSizePt + 8;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const pg = outDoc.addPage([w, h + strip]);
    const contentY = opts.position === "bottom" ? strip : 0;
    pg.drawPage(embeds[i], { x: 0, y: contentY, width: w, height: h });
    const ty = opts.position === "bottom" ? (strip - opts.fontSizePt) / 2 + 1 : h + (strip - opts.fontSizePt) / 2 + 1;
    pg.drawText(opts.text || "Job", { x: 6, y: ty, font, size: opts.fontSizePt, color: rgb(0.25, 0.25, 0.25) });
  }
  return outDoc.save();
}
async function addCollatingMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const markW = 9, markH = 14;
  for (let i = 0; i < n; i++) {
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    const step = n > 1 ? (h - 40 - markH) / (n - 1) : 0;
    const y = h - 20 - markH - i * step;
    const x = opts.edge === "right" ? w - markW : 0;
    pg.drawRectangle({ x, y, width: markW, height: markH, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
async function preflight(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const warnings = [];
  if (!pages.length) warnings.push("Document has no pages.");
  const first = pages[0]?.getSize() ?? { width: 0, height: 0 };
  const uniformSize = pages.every((p) => {
    const s = p.getSize();
    return Math.abs(s.width - first.width) < 1 && Math.abs(s.height - first.height) < 1;
  });
  if (!uniformSize) warnings.push("Pages are not all the same size \u2014 imposition may misalign.");
  if (first.width / PT < 1 || first.height / PT < 1) warnings.push("Page size looks unusually small.");
  return {
    pages: pages.length,
    uniformSize,
    widthIn: Math.round(first.width / PT * 1e3) / 1e3,
    heightIn: Math.round(first.height / PT * 1e3) / 1e3,
    warnings
  };
}
async function makeDieline(opts) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const CUT = rgb(0.85, 0.11, 0.14);
  const CREASE = rgb(0.15, 0.4, 0.9);
  const GLUE = rgb(0.6, 0.6, 0.62);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const W = opts.widthIn * PT, H = opts.heightIn * PT, D = opts.depthIn * PT;
  const g = opts.glueIn * PT, m = opts.marginIn * PT;
  let page;
  const cut = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1, color: CUT });
  const crease = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.75, color: CREASE, dashArray: [4, 3] });
  const poly = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) cut(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  };
  function legend(pw) {
    page.drawLine({ start: { x: m, y: 18 }, end: { x: m + 22, y: 18 }, thickness: 1, color: CUT });
    page.drawText("Cut", { x: m + 28, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: m + 70, y: 18 }, end: { x: m + 92, y: 18 }, thickness: 0.75, color: CREASE, dashArray: [4, 3] });
    page.drawText("Fold / crease", { x: m + 98, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`${opts.widthIn}\xD7${opts.heightIn}\xD7${opts.depthIn}"`, { x: pw - m - 70, y: 15, font, size: 8, color: rgb(0.3, 0.3, 0.3) });
  }
  if (opts.kind === "ste") {
    const tuckH = D * 0.82, dustH = D * 0.72;
    const netW = g + 2 * W + 2 * D, netH = H + 2 * tuckH;
    const pw = netW + 2 * m, ph = netH + 2 * m;
    page = doc.addPage([pw, ph]);
    const ox = m, oy = m;
    const yB = oy + tuckH, yT = yB + H;
    const x0 = ox, x1 = x0 + g, x2 = x1 + W, x3 = x2 + D, x4 = x3 + W, x5 = x4 + D;
    const ins = Math.min(W, D) * 0.14;
    for (const x of [x1, x2, x3, x4]) crease(x, yB, x, yT);
    cut(x0, yB, x0, yT);
    cut(x5, yB, x5, yT);
    for (const [xa, xb, isFlap] of [[x0, x1, false], [x1, x2, true], [x2, x3, true], [x3, x4, false], [x4, x5, true]]) {
      (isFlap ? crease : cut)(xa, yT, xb, yT);
      (isFlap ? crease : cut)(xa, yB, xb, yB);
    }
    poly([[x1, yT], [x1 + ins, yT + tuckH], [x2 - ins, yT + tuckH], [x2, yT]]);
    poly([[x1, yB], [x1 + ins, yB - tuckH], [x2 - ins, yB - tuckH], [x2, yB]]);
    for (const [xa, xb] of [[x2, x3], [x4, x5]]) {
      poly([[xa, yT], [xa + ins, yT + dustH], [xb - ins, yT + dustH], [xb, yT]]);
      poly([[xa, yB], [xa + ins, yB - dustH], [xb - ins, yB - dustH], [xb, yB]]);
    }
    poly([[x1, yB], [x0 + g * 0.35, yB + g * 0.2], [x0 + g * 0.35, yT - g * 0.2], [x1, yT]]);
    for (let yy = yB + 6; yy < yT - 6; yy += 7) page.drawLine({ start: { x: x0 + g * 0.4, y: yy }, end: { x: x1 - 3, y: yy + 4 }, thickness: 0.4, color: GLUE });
    page.drawText("GLUE", { x: x0 + g * 0.42, y: (yB + yT) / 2, font, size: 7, color: GLUE, rotate: degrees(90) });
    legend(pw);
  } else {
    const pocket = H * 0.38, tab = D > 0 ? Math.max(D, 24) : 24;
    const netW = 2 * W + tab, netH = H + pocket;
    const pw = netW + 2 * m, ph = netH + 2 * m;
    page = doc.addPage([pw, ph]);
    const ox = m, oy = m;
    const yB = oy + pocket, yT = yB + H;
    const xL = ox, xM = ox + W, xR = ox + 2 * W, xTab = xR + tab;
    cut(xL, yB, xL, yT);
    crease(xM, yB, xM, yT);
    crease(xR, yB, xR, yT);
    poly([[xR, yB], [xTab, yB + tab * 0.4], [xTab, yT - tab * 0.4], [xR, yT]]);
    cut(xL, yT, xR, yT);
    crease(xL, yB, xR, yB);
    for (const [xa, xb] of [[xL, xM], [xM, xR]]) {
      poly([[xa, yB], [xa, yB - pocket], [xb, yB - pocket], [xb, yB]]);
      crease(xa, yB - pocket, xa, yB);
      crease(xb, yB - pocket, xb, yB);
    }
    page.drawText("Fold up + glue pockets", { x: xL + 6, y: oy + 4, font, size: 7, color: GLUE });
    legend(pw);
  }
  return doc.save();
}
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function drawQrCode(page, rgb, qrcode, text, x, y, size) {
  const qr = qrcode(0, "M");
  qr.addData(text || " ");
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
async function imposeDataMerge(csvText, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const table = parseCSV(csvText);
  if (table.length < 2) throw new Error("CSV needs a header row and at least one record.");
  const headers = table[0].map((h) => h.trim());
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
  let qrcode = null;
  if (qrIdx >= 0) {
    const mod = await import("qrcode-generator");
    qrcode = mod.default ?? mod;
  }
  let idx = 0;
  for (let si = 0; si < numSheets; si++) {
    const pg = doc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (idx >= records.length) continue;
      const rec = records[idx];
      const num = opts.startNumber + idx;
      idx++;
      const x = mPt + c * (cellW + gPt), y = shH - mPt - cellH - r * (cellH + gPt);
      if (opts.showBorder) pg.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.8, 0.8, 0.82), borderWidth: 0.5 });
      const qrOn = !!qrcode && qrIdx >= 0;
      const qrSize = qrOn ? Math.max(28, Math.min(opts.qrSizePt, cellH - 16, cellW * 0.5)) : 0;
      const maxChars = qrOn ? 20 : 34;
      let ty = y + cellH - opts.fontSizePt - 8;
      for (let f = 0; f < headers.length && f < 6; f++) {
        const val = (rec[f] ?? "").trim();
        if (!val) continue;
        const size = f === 0 ? opts.fontSizePt + 2 : opts.fontSizePt;
        pg.drawText(val.length > maxChars ? val.slice(0, maxChars - 1) + "\u2026" : val, { x: x + 8, y: ty, font: f === 0 ? bold : font, size, color: rgb(0.1, 0.1, 0.1) });
        ty -= size + 4;
        if (ty < y + 14) break;
      }
      if (qrOn) drawQrCode(pg, rgb, qrcode, (rec[qrIdx] ?? "").trim(), x + cellW - qrSize - 8, y + (cellH - qrSize) / 2, qrSize);
      if (opts.autoNumber) {
        const label = `${opts.numberPrefix}${String(num).padStart(opts.numberPad, "0")}`;
        const tw = font.widthOfTextAtSize(label, opts.fontSizePt);
        pg.drawText(label, { x: qrOn ? x + 8 : x + cellW - tw - 8, y: y + 8, font, size: opts.fontSizePt, color: rgb(0.42, 0.42, 0.45) });
      }
      if (opts.addMarks) drawCropMarks(pg, rgb, x, y, cellW, cellH, off, len, { center: !!opts.centerMarks, weight: opts.markWeightPt });
    }
  }
  return { pdf: await doc.save(), records: records.length, columns: headers };
}
async function addRegistrationMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const black = rgb(0, 0, 0);
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const m = opts.marginIn * PT, r = opts.sizeIn * PT / 2;
    const spots = [
      [m, m],
      [w - m, m],
      [m, h - m],
      [w - m, h - m],
      [w / 2, m],
      [w / 2, h - m],
      [m, h / 2],
      [w - m, h / 2]
    ];
    for (const [cx, cy] of spots) {
      pg.drawLine({ start: { x: cx - r * 1.5, y: cy }, end: { x: cx + r * 1.5, y: cy }, thickness: 0.5, color: black });
      pg.drawLine({ start: { x: cx, y: cy - r * 1.5 }, end: { x: cx, y: cy + r * 1.5 }, thickness: 0.5, color: black });
      if (opts.style === "target") {
        pg.drawEllipse({ x: cx, y: cy, xScale: r, yScale: r, borderColor: black, borderWidth: 0.5 });
        pg.drawEllipse({ x: cx, y: cy, xScale: r * 0.5, yScale: r * 0.5, borderColor: black, borderWidth: 0.5 });
      }
    }
  }
  return doc.save();
}
async function insertPages(bytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const { width, height } = src.getPage(0).getSize();
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  const blanks = Math.max(1, opts.count);
  const addBlanks = () => {
    for (let b = 0; b < blanks; b++) out.addPage([width, height]);
  };
  if (opts.mode === "everyN") {
    const N = Math.max(1, opts.everyN);
    for (let i = 0; i < n; i++) {
      out.addPage(copied[i]);
      if ((i + 1) % N === 0 && i < n - 1) addBlanks();
    }
  } else {
    const pos = Math.min(Math.max(1, opts.position), n + 1);
    for (let i = 0; i < n; i++) {
      if (i === pos - 1) addBlanks();
      out.addPage(copied[i]);
    }
    if (pos - 1 >= n) addBlanks();
  }
  return out.save();
}
async function mixPdfs(aBytes, bBytes, reverseB = false) {
  const { PDFDocument } = await import("pdf-lib");
  const A = await PDFDocument.load(aBytes, { ignoreEncryption: true });
  const B = await PDFDocument.load(bBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const ca = await out.copyPages(A, A.getPageIndices());
  let cb = await out.copyPages(B, B.getPageIndices());
  if (reverseB) cb = cb.reverse();
  const max = Math.max(ca.length, cb.length);
  for (let i = 0; i < max; i++) {
    if (i < ca.length) out.addPage(ca[i]);
    if (i < cb.length) out.addPage(cb[i]);
  }
  return out.save();
}
async function nudgePdf(bytes, opts) {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  const dx = opts.dxIn * PT, dy = opts.dyIn * PT, rad = opts.rotateDeg * Math.PI / 180;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i].getSize();
    const pg = out.addPage([w, h]);
    const cos = Math.cos(rad), sin = Math.sin(rad), cx = w / 2, cy = h / 2;
    const a = cos, b = sin, c = -sin, d = cos;
    const e = cx + dx - (a * cx + c * cy), f = cy + dy - (b * cx + d * cy);
    pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
    pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
    pg.pushOperators(popGraphicsState());
  }
  return out.save();
}
async function repairPdf(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: true });
}
async function addBackdrop(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i].getSize();
    const pg = out.addPage([w, h]);
    pg.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(opts.r, opts.g, opts.b) });
    pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
  }
  return out.save();
}
async function addQrStamp(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const mod = await import("qrcode-generator");
  const qrcode = mod.default ?? mod;
  const s = opts.sizePt, m = opts.marginPt;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const x = opts.position === "center" ? (w - s) / 2 : opts.position.includes("l") ? m : w - s - m;
    const y = opts.position === "center" ? (h - s) / 2 : opts.position.includes("t") ? h - s - m : m;
    drawQrCode(pg, rgb, qrcode, opts.text || " ", x, y, s);
  }
  return doc.save();
}
async function addDimensions(bytes) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
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
  addBackdrop,
  addCollatingMarks,
  addColorBar,
  addCropMarksOnly,
  addDimensions,
  addHeaderFooter,
  addJobSlug,
  addPageNumbers,
  addQrStamp,
  addRegistrationMarks,
  addTextWatermark,
  computeNUpGrid,
  cropPdf,
  downloadMultiple,
  downloadPdf,
  expandShuffle,
  flipPdf,
  generateBleed,
  getPdfInfo,
  imposeBooklet,
  imposeDataMerge,
  imposeNUp,
  imposeTickets,
  imposeTiledPoster,
  insertPages,
  makeDieline,
  mergePdfs,
  mixPdfs,
  nudgePdf,
  overlayPdf,
  preflight,
  repairPdf,
  resizePdf,
  rotatePdf,
  shufflePages,
  splitPdf
};
