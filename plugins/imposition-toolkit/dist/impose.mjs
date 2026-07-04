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
  const dashArray = style?.dash;
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
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: c, ...dashArray ? { dashArray } : {} });
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
async function imposeNUpBook(bytes, opts) {
  if (opts.nUp <= 2) {
    return imposeBooklet(bytes, {
      rtl: opts.rtl,
      marginIn: opts.marginIn,
      gutterIn: opts.gutterIn,
      creepIn: opts.creepIn,
      addMarks: opts.addMarks,
      markLenIn: opts.markLenIn,
      markOffIn: opts.markOffIn,
      centerMarks: opts.centerMarks,
      markWeightPt: opts.markWeightPt,
      signatureSheets: opts.signatureSheets
    });
  }
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const N = srcPages.length;
  const shW = opts.sheetWIn * PT, shH = opts.sheetHIn * PT, m = opts.marginIn * PT, g = opts.gutterIn * PT;
  const cols = 2, rows = 2;
  const cellW = (shW - 2 * m - g) / cols, cellH = (shH - 2 * m - g) / rows;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
  const sigPages = 8;
  const numSigs = Math.ceil(Math.max(1, N) / sigPages);
  const FRONT = [[5, 0, 0, 180], [4, 0, 1, 180], [8, 1, 0, 0], [1, 1, 1, 0]];
  const BACK = [[3, 0, 0, 180], [6, 0, 1, 180], [2, 1, 0, 0], [7, 1, 1, 0]];
  const colX = (c) => m + (opts.rtl ? cols - 1 - c : c) * (cellW + g);
  for (let sig = 0; sig < numSigs; sig++) {
    for (const table of [FRONT, BACK]) {
      const page = outDoc.addPage([shW, shH]);
      for (const [p, r, c, rot] of table) {
        const gp = sig * sigPages + p;
        const x = colX(c), yTop = shH - m - r * (cellH + g), yBot = yTop - cellH;
        const emb = gp >= 1 && gp <= N ? embeds[gp - 1] : null;
        if (emb) {
          if (rot === 180) page.drawPage(emb, { x: x + cellW, y: yTop, width: cellW, height: cellH, rotate: degrees(180) });
          else page.drawPage(emb, { x, y: yBot, width: cellW, height: cellH });
        }
        if (opts.addMarks) drawCropMarks(page, rgb, x, yBot, cellW, cellH, off, len, markStyle);
      }
    }
  }
  return outDoc.save();
}
async function imposeCalendar(bytes, opts) {
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = srcDoc.getPages();
  const N = pages.length;
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(pages);
  const markStyle = { center: !!opts.centerMarks, weight: opts.markWeightPt };
  const off = opts.markOffIn * PT, len = opts.markLenIn * PT;
  if (!opts.halfSheet) {
    for (let i = 0; i < N; i++) {
      const { width: w, height: h } = pages[i].getSize();
      const pg = outDoc.addPage([w, h]);
      const isBack = i % 2 === 1;
      if (opts.rotateBack && isBack) pg.drawPage(embeds[i], { x: w, y: h, width: w, height: h, rotate: degrees(180) });
      else pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
      if (opts.addMarks) drawCropMarks(pg, rgb, 0, 0, w, h, off, len, markStyle);
    }
  } else {
    const { width: w, height: h } = pages[0].getSize();
    for (let k = 0; k * 2 < Math.max(1, N); k++) {
      const top = k * 2, bot = k * 2 + 1;
      const pg = outDoc.addPage([w, 2 * h]);
      if (top < N) pg.drawPage(embeds[top], { x: 0, y: h, width: w, height: h });
      if (bot < N) {
        if (opts.rotateBack) pg.drawPage(embeds[bot], { x: w, y: h, width: w, height: h, rotate: degrees(180) });
        else pg.drawPage(embeds[bot], { x: 0, y: 0, width: w, height: h });
      }
      if (opts.addMarks) {
        drawCropMarks(pg, rgb, 0, h, w, h, off, len, markStyle);
        drawCropMarks(pg, rgb, 0, 0, w, h, off, len, markStyle);
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
  const cellIndexOf = (r, c) => r * cols + (opts.snake && r % 2 === 1 ? cols - 1 - c : c);
  const place = (sheet, itemIdx, r, c, isBack) => {
    const pi = duplex ? itemIdx * 2 + (isBack ? 1 : 0) : itemIdx;
    if (pi >= N) return;
    const emb = embeds[pi];
    if (!emb) return;
    let cc = c, rr = r;
    if (opts.rtl) cc = cols - 1 - cc;
    if (isBack) {
      if (shortEdge) rr = rows - 1 - rr;
      else cc = cols - 1 - cc;
    }
    const x = leftGapPt + cc * (cellW + gxPt), y = shH - topGapPt - cellH - rr * (cellH + gyPt);
    sheet.drawPage(emb, { x, y, width: cellW, height: cellH });
    if (opts.addMarks) drawCropMarks(sheet, rgb, x + bl, y + bl, cellW - 2 * bl, cellH - 2 * bl, off, len, markStyle);
  };
  for (let si = 0; si < numSheets; si++) {
    const front = outDoc.addPage([shW, shH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place(front, itemAt(si, cellIndexOf(r, c)), r, c, false);
    if (duplex) {
      const back = outDoc.addPage([shW, shH]);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place(back, itemAt(si, cellIndexOf(r, c)), r, c, true);
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
  const ct = opts.cutType ?? "thru";
  const color = ct === "kiss" ? rgb(1, 0, 1) : ct === "crease" ? rgb(0.15, 0.4, 0.9) : ct === "perf" ? rgb(0.85, 0.11, 0.14) : rgb(0, 0, 0);
  const dash = ct === "crease" ? [4, 3] : ct === "perf" ? [2, 2] : void 0;
  const w0 = opts.markWeightPt ?? 0.5;
  const markStyle = { center: !!opts.centerMarks, weight: w0, color, dash };
  const overshoot = (opts.overshootIn ?? 0) * PT;
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i].getSize();
    const mPt = opts.marginIn * PT, bPt = opts.bleedIn * PT;
    const pg = outDoc.addPage([pw + mPt * 2, ph + mPt * 2]);
    pg.drawPage(embeds[i], { x: mPt, y: mPt, width: pw, height: ph });
    const tx = mPt + bPt, ty = mPt + bPt, tw = pw - bPt * 2, th = ph - bPt * 2, off = opts.markOffIn * PT, len = opts.markLenIn * PT + overshoot;
    if (opts.knockout) drawCropMarks(pg, rgb, tx, ty, tw, th, off, len, { center: !!opts.centerMarks, weight: w0 + 1.5, color: rgb(1, 1, 1) });
    drawCropMarks(pg, rgb, tx, ty, tw, th, off, len, markStyle);
    if (opts.keyMark) pg.drawRectangle({ x: mPt - 2, y: mPt - 2, width: 4, height: 4, color });
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
function parsePageRange(expr, n) {
  const s = (expr ?? "").trim().toLowerCase();
  if (!s || s === "all") return new Set(Array.from({ length: n }, (_, i) => i + 1));
  const set = /* @__PURE__ */ new Set();
  for (let tok of s.split(",")) {
    tok = tok.trim();
    if (!tok) continue;
    let m;
    if (tok === "odd") {
      for (let i = 1; i <= n; i += 2) set.add(i);
      continue;
    }
    if (tok === "even") {
      for (let i = 2; i <= n; i += 2) set.add(i);
      continue;
    }
    if (tok === "first") {
      set.add(1);
      continue;
    }
    if (tok === "last") {
      set.add(n);
      continue;
    }
    if (m = tok.match(/^last-(\d+)$/)) {
      const p2 = n - parseInt(m[1]);
      if (p2 >= 1) set.add(p2);
      continue;
    }
    if (m = tok.match(/^(\d+)\s*-\s*(\d+)\s+(odd|even)$/)) {
      const a = +m[1], b = +m[2];
      for (let i = a; i <= b; i++) if (i % 2 === 1 === (m[3] === "odd")) set.add(i);
      continue;
    }
    if (m = tok.match(/^(\d+)\s*-\s*(\d+)$/)) {
      const a = +m[1], b = +m[2];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
      continue;
    }
    const p = parseInt(tok);
    if (!isNaN(p)) set.add(p);
  }
  return set;
}
async function rotatePdf(bytes, angleDeg, pages) {
  const { PDFDocument, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const sel = parsePageRange(pages ?? "all", n);
  const norm = (angleDeg % 360 + 360) % 360;
  if (norm % 90 === 0) {
    for (const [i, pg] of srcDoc.getPages().entries()) if (sel.has(i + 1)) pg.setRotation(degrees((pg.getRotation().angle + norm) % 360));
    return srcDoc.save();
  }
  const srcPages = srcDoc.getPages();
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const rad = norm * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    if (!sel.has(i + 1)) {
      const pg2 = outDoc.addPage([w, h]);
      pg2.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
      continue;
    }
    const nw = Math.abs(w * cos) + Math.abs(h * sin), nh = Math.abs(w * sin) + Math.abs(h * cos);
    const pg = outDoc.addPage([nw, nh]);
    const a = cos, b = sin, c = -sin, d = cos;
    const e = nw / 2 - (a * (w / 2) + c * (h / 2)), f = nh / 2 - (b * (w / 2) + d * (h / 2));
    pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
    pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
    pg.pushOperators(popGraphicsState());
  }
  return outDoc.save();
}
async function flipPdf(bytes, direction, pages) {
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(pages ?? "all", srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const pg = outDoc.addPage([w, h]);
    if (sel.has(i + 1)) {
      if (direction === "h") pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, 1, w, 0));
      else pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, h));
      pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
      pg.pushOperators(popGraphicsState());
    } else {
      pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
    }
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
async function splitPdfChunks(bytes, size) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = srcDoc.getPageCount();
  const step = Math.max(1, Math.floor(size));
  const results = [];
  for (let start = 0; start < n; start += step) {
    const indices = [];
    for (let i = start; i < start + step && i < n; i++) indices.push(i);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(srcDoc, indices);
    for (const pg of pages) out.addPage(pg);
    results.push(await out.save());
  }
  return results;
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return ~c >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => new Uint8Array([n & 255, n >> 8 & 255]);
  const u32 = (n) => new Uint8Array([n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255]);
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const local = concatBytes([u32(67324752), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0), name, f.data]);
    chunks.push(local);
    central.push(concatBytes([u32(33639248), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const cd = concatBytes(central);
  const end = concatBytes([u32(101010256), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return concatBytes([...chunks, cd, end]);
}
function concatBytes(arrs) {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
async function overlayPdf(baseBytes, stampBytes, opts) {
  const { PDFDocument, BlendMode } = await import("pdf-lib");
  const baseDoc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const stampDoc = await PDFDocument.load(stampBytes, { ignoreEncryption: true });
  const stampPages = stampDoc.getPages();
  const basePages = baseDoc.getPages();
  const blendMode = opts.blend === "multiply" ? BlendMode.Multiply : void 0;
  for (let i = 0; i < basePages.length; i++) {
    const pg = basePages[i];
    const { width: w, height: h } = pg.getSize();
    const stamp = stampPages[i % stampPages.length];
    const { width: sw, height: sh } = stamp.getSize();
    const [emb] = await baseDoc.embedPages([stamp]);
    if (!emb) continue;
    const bm = blendMode ? { blendMode } : {};
    if (opts.mode === "fill") {
      pg.drawPage(emb, { x: 0, y: 0, width: w, height: h, opacity: opts.opacity, ...bm });
    } else if (opts.mode === "center") {
      const scale = Math.min(w / sw, h / sh) * 0.85;
      const dw = sw * scale, dh = sh * scale, pad = opts.paddingPt ?? 0, a = opts.anchor ?? "mc";
      const hx = a[1] === "l" ? pad : a[1] === "r" ? w - dw - pad : (w - dw) / 2;
      const vy = a[0] === "b" ? pad : a[0] === "t" ? h - dh - pad : (h - dh) / 2;
      pg.drawPage(emb, { x: hx, y: vy, width: dw, height: dh, opacity: opts.opacity, ...bm });
    } else {
      const tC = opts.tileCols ?? 2, tR = opts.tileRows ?? 2;
      const tw = w / tC, th = h / tR;
      for (let r = 0; r < tR; r++) for (let c = 0; c < tC; c++)
        pg.drawPage(emb, { x: c * tw, y: r * th, width: tw, height: th, opacity: opts.opacity, ...bm });
    }
  }
  return baseDoc.save();
}
async function distortPdf(bytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(opts.pages ?? "all", srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const f = Math.max(0.5, Math.min(1.5, opts.factorPct / 100));
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const on = sel.has(i + 1);
    const fw = on && (opts.direction === "cross" || opts.direction === "both") ? f : 1;
    const fh = on && (opts.direction === "circ" || opts.direction === "both") ? f : 1;
    const nw = w * fw, nh = h * fh;
    const pg = outDoc.addPage([nw, nh]);
    pg.drawPage(embeds[i], { x: 0, y: 0, width: nw, height: nh });
  }
  return outDoc.save();
}
function distortFactorFromCylinder(cylinderDiaMm, plateThickMm) {
  if (cylinderDiaMm <= 0) return 100;
  return cylinderDiaMm / (cylinderDiaMm + 2 * plateThickMm) * 100;
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
async function cropPdf(bytes, opts, pages) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const sel = parsePageRange(pages ?? "all", doc.getPageCount());
  for (const [i, pg] of doc.getPages().entries()) {
    if (!sel.has(i + 1)) continue;
    const { width: w, height: h } = pg.getSize();
    const lPt = opts.left * PT, rPt = opts.right * PT, tPt = opts.top * PT, bPt = opts.bottom * PT;
    pg.setCropBox(lPt, bPt, w - lPt - rPt, h - tPt - bPt);
    pg.setTrimBox(lPt, bPt, w - lPt - rPt, h - tPt - bPt);
  }
  return doc.save();
}
async function resizePdf(bytes, opts, pages) {
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(pages ?? "all", srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    if (!sel.has(i + 1)) {
      const pg = outDoc.addPage([w, h]);
      pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
      continue;
    }
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
  const sel = parsePageRange(opts.pages ?? "all", srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const barH = opts.heightIn * PT;
  const swatches = opts.spot ? [...COLOR_BAR_SWATCHES, { r: 0.6, g: 0.1, b: 0.5 }, { r: 0.1, g: 0.5, b: 0.4 }] : COLOR_BAR_SWATCHES;
  const shape = opts.shape ?? "rect";
  const vertical = opts.edge === "left" || opts.edge === "right";
  for (let i = 0; i < embeds.length; i++) {
    const { width: pw, height: ph } = srcPages[i].getSize();
    if (!sel.has(i + 1)) {
      const pg2 = outDoc.addPage([pw, ph]);
      pg2.drawPage(embeds[i], { x: 0, y: 0, width: pw, height: ph });
      continue;
    }
    const nw = vertical ? pw + barH : pw, nh = vertical ? ph : ph + barH;
    const cx = opts.edge === "left" ? barH : 0, cy = opts.edge === "bottom" ? barH : 0;
    const pg = outDoc.addPage([nw, nh]);
    pg.drawPage(embeds[i], { x: cx, y: cy, width: pw, height: ph });
    const n = swatches.length, along = vertical ? ph : pw, step = along / n;
    for (let j = 0; j < n; j++) {
      const s = swatches[j], col = rgb(s.r, s.g, s.b);
      const bx = opts.edge === "left" ? 0 : opts.edge === "right" ? pw : cx + j * step;
      const by = opts.edge === "bottom" ? 0 : opts.edge === "top" ? ph : cy + j * step;
      if (vertical) {
        if (shape === "circle") pg.drawEllipse({ x: bx + barH / 2, y: by + step / 2, xScale: barH / 2 - 1, yScale: step / 2 - 1, color: col });
        else pg.drawRectangle({ x: bx, y: by, width: barH, height: shape === "square" ? Math.min(step, barH) : step, color: col, borderWidth: 0 });
      } else {
        if (shape === "circle") pg.drawEllipse({ x: bx + step / 2, y: by + barH / 2, xScale: step / 2 - 1, yScale: barH / 2 - 1, color: col });
        else pg.drawRectangle({ x: bx, y: by, width: shape === "square" ? Math.min(step, barH) : step, height: barH, color: col, borderWidth: 0 });
      }
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
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const sel = parsePageRange(opts.pages ?? "all", srcPages.length);
  const outDoc = await PDFDocument.create();
  const embeds = await outDoc.embedPages(srcPages);
  const b = opts.bleedIn * PT, mode = opts.mode ?? "scale";
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = srcPages[i].getSize();
    const emb = embeds[i];
    if (!sel.has(i + 1)) {
      const pg2 = outDoc.addPage([w, h]);
      pg2.drawPage(emb, { x: 0, y: 0, width: w, height: h });
      continue;
    }
    const pg = outDoc.addPage([w + 2 * b, h + 2 * b]);
    if (mode === "scale") {
      pg.drawPage(emb, { x: 0, y: 0, width: w + 2 * b, height: h + 2 * b });
    } else if (mode === "solid") {
      const col = opts.color ?? { r: 1, g: 1, b: 1 };
      pg.drawRectangle({ x: 0, y: 0, width: w + 2 * b, height: h + 2 * b, color: rgb(col.r, col.g, col.b) });
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    } else if (mode === "repeat") {
      for (const [ox, oy] of [[-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, -h], [-w, h], [w, h]])
        pg.drawPage(emb, { x: b + ox, y: b + oy, width: w, height: h });
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    } else {
      const draw = (mx, my) => {
        pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(mx < 0 ? -1 : 1, 0, 0, my < 0 ? -1 : 1, mx, my));
        pg.drawPage(emb, { x: b, y: b, width: w, height: h });
        pg.pushOperators(popGraphicsState());
      };
      const L = 2 * b, R = 2 * (b + w), B = 2 * b, T = 2 * (b + h);
      draw(L, B);
      draw(R, B);
      draw(L, T);
      draw(R, T);
      draw(L, 0);
      draw(R, 0);
      draw(0, B);
      draw(0, T);
      pg.drawPage(emb, { x: b, y: b, width: w, height: h });
    }
    pg.setTrimBox(b, b, w, h);
  }
  return outDoc.save();
}
function fmtDate(d, fmt) {
  const p2 = (n) => String(n).padStart(2, "0");
  return fmt.replace(/%Y/g, String(d.getFullYear())).replace(/%m/g, p2(d.getMonth() + 1)).replace(/%d/g, p2(d.getDate())).replace(/%H/g, p2(d.getHours())).replace(/%M/g, p2(d.getMinutes()));
}
function applyTokens(text, ctx) {
  const now = /* @__PURE__ */ new Date();
  return text.replace(/\[page-number(?::0*(\d+))?\]/g, (_m, pad) => pad ? String(ctx.pageNum).padStart(+pad, "0") : String(ctx.pageNum)).replace(/\[page-count\]/g, String(ctx.pageCount)).replace(/\[sheet-number\]/g, String(ctx.pageNum)).replace(/\[file-name\]/g, ctx.fileName ?? "").replace(/\[timestamp(?::([^\]]+))?\]/g, (_m, f) => fmtDate(now, f || "%Y-%m-%d"));
}
async function addHeaderFooter(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fontName = opts.font === "times" ? StandardFonts.TimesRoman : opts.font === "courier" ? StandardFonts.Courier : StandardFonts.Helvetica;
  const font = await doc.embedFont(fontName);
  const rot = opts.rotationDeg ?? 0;
  const pages = doc.getPages(), count = pages.length;
  for (const [i, pg] of pages.entries()) {
    const { width: w, height: h } = pg.getSize();
    const align = opts.alternate && i % 2 === 1 ? opts.align === "left" ? "right" : opts.align === "right" ? "left" : "center" : opts.align;
    const bands = [[opts.header, h - opts.marginPt], [opts.footer, opts.marginPt]];
    for (const [raw, y] of bands) {
      if (!raw) continue;
      const text = applyTokens(raw, { pageNum: i + 1, pageCount: count, fileName: opts.fileName });
      const tw = font.widthOfTextAtSize(text, opts.fontSizePt);
      const x = align === "right" ? w - opts.marginPt - tw : align === "left" ? opts.marginPt : (w - tw) / 2;
      pg.drawText(text, { x, y, font, size: opts.fontSizePt, color: rgb(0.1, 0.1, 0.1), ...rot ? { rotate: degrees(rot) } : {} });
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
    const label = applyTokens(opts.text || "Job", { pageNum: i + 1, pageCount: embeds.length, fileName: opts.fileName });
    pg.drawText(label, { x: 6, y: ty, font, size: opts.fontSizePt, color: rgb(0.25, 0.25, 0.25) });
  }
  return outDoc.save();
}
async function addCollatingMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
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
  const sel = parsePageRange(opts.pages ?? "all", n);
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    const sig = Math.floor(i / pps);
    const slot = sig % sps;
    const pass = Math.floor(sig / sps);
    const col = pass % 2 === 0 ? c1 : c2;
    const y = h - startOff - mh - slot * step;
    const x = opts.edge === "right" ? w - mw : 0;
    pg.drawRectangle({ x, y, width: mw, height: mh, color: rgb(col.r, col.g, col.b), opacity: op });
  }
  return doc.save();
}
async function addOmrMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const bitCount = Math.max(1, Math.round(opts.bitCount || 8));
  const maxVal = Math.pow(2, bitCount) - 1;
  const prog = Math.max(0, Math.min(maxVal, Math.round(opts.program || 0)));
  const bits = [];
  for (let b = bitCount - 1; b >= 0; b--) bits.push(prog >> b & 1);
  const repeats = Math.max(1, Math.round(opts.repeats ?? 1));
  const length = opts.widthPt ?? 14.17;
  const thick = opts.heightPt ?? 2.83;
  const pitch = opts.spacingPt ?? length;
  const startOff = opts.startOffsetPt ?? 40;
  const edgeOff = opts.edgeOffsetPt ?? 8.5;
  const sync = opts.sync !== false;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const op = opts.opacity ?? 1;
  const horiz = opts.edge === "top" || opts.edge === "bottom";
  const sel = parsePageRange(opts.pages ?? "all", n);
  const slots = [];
  for (let r = 0; r < repeats; r++) {
    if (sync) slots.push({ on: true, full: true });
    for (const bit of bits) {
      if (opts.encoding === "barheight") slots.push({ on: true, full: bit === 1 });
      else slots.push({ on: bit === 1, full: true });
    }
  }
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    slots.forEach((s, k) => {
      if (!s.on) return;
      const len = s.full ? length : length * 0.45;
      const pos = startOff + k * pitch;
      let x, y, rw, rh;
      if (horiz) {
        rw = thick;
        rh = len;
        x = pos;
        y = opts.edge === "bottom" ? edgeOff : h - edgeOff - len;
      } else {
        rw = len;
        rh = thick;
        y = pos;
        x = opts.edge === "left" ? edgeOff : w - edgeOff - len;
      }
      pg.drawRectangle({ x, y, width: rw, height: rh, color: rgb(c.r, c.g, c.b), opacity: op });
    });
  }
  return doc.save();
}
async function addGatheringMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
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
  const sel = parsePageRange(opts.pages ?? "all", n);
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { height: h } = pg.getSize();
    const sec = Math.floor(i / pps);
    const slot = sec % sps;
    const pass = Math.floor(sec / sps);
    const col = pass % 2 === 0 ? c1 : c2;
    const x = startOff + slot * step;
    const y = opts.edge === "top" ? h - edgeOff - mh : edgeOff;
    pg.drawRectangle({ x, y, width: mw, height: mh, color: rgb(col.r, col.g, col.b), opacity: op });
  }
  return doc.save();
}
function foldFractions(opts, axisPt) {
  const n = Math.max(2, Math.round(opts.panels ?? 4));
  const even = (k) => Array.from({ length: k - 1 }, (_, i) => (i + 1) / k);
  switch (opts.scheme) {
    case "half":
      return [0.5];
    case "letter":
      return [1 / 3, 2 / 3];
    case "zfold":
      return [1 / 3, 2 / 3];
    case "gate":
      return [0.25, 0.75];
    case "doubleparallel":
      return [0.25, 0.5, 0.75];
    case "accordion":
      return even(n);
    case "roll": {
      const base = axisPt / n, d = 4.5;
      const widths = Array.from({ length: n }, (_, i) => base + (n - 1 - i - (n - 1) / 2) * d);
      const fr = [];
      let cum = 0;
      for (let i = 0; i < n - 1; i++) {
        cum += widths[i];
        fr.push(cum / axisPt);
      }
      return fr;
    }
    case "custom":
      return (opts.positions ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        if (s.includes("/")) {
          const [a, b] = s.split("/").map(Number);
          return (a ?? 0) / (b ?? 1);
        }
        const v = parseFloat(s);
        return isNaN(v) ? -1 : v > 1 ? v / 100 : v;
      }).filter((v) => v > 0 && v < 1).sort((a, b) => a - b);
    default:
      return [0.5];
  }
}
async function addFoldMarks(bytes, opts) {
  const { PDFDocument, rgb, LineCapStyle } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const len = opts.markLenPt ?? 18;
  const off = opts.offsetPt ?? 0;
  const wgt = opts.weightPt ?? 0.75;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const col = rgb(c.r, c.g, c.b);
  const dash = opts.style === "dashed" ? [4, 3] : opts.style === "dotted" ? [wgt, wgt * 2.5] : void 0;
  const cap = opts.style === "dotted" ? LineCapStyle.Round : LineCapStyle.Butt;
  const wantLo = opts.edge === "bottom" || opts.edge === "both";
  const wantHi = opts.edge === "top" || opts.edge === "both";
  const sel = parsePageRange(opts.pages ?? "all", n);
  const vertical = opts.orientation === "vertical";
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    const axis = vertical ? w : h;
    const draw = (a, b) => pg.drawLine({ start: a, end: b, thickness: wgt, color: col, ...dash ? { dashArray: dash } : {}, lineCap: cap });
    for (const f of foldFractions(opts, axis)) {
      const p = f * axis;
      if (vertical) {
        if (opts.fullLine) {
          draw({ x: p, y: off }, { x: p, y: h - off });
          continue;
        }
        if (wantHi) draw({ x: p, y: h - off }, { x: p, y: h - off - len });
        if (wantLo) draw({ x: p, y: off }, { x: p, y: off + len });
      } else {
        if (opts.fullLine) {
          draw({ x: off, y: p }, { x: w - off, y: p });
          continue;
        }
        if (wantHi) draw({ x: w - off, y: p }, { x: w - off - len, y: p });
        if (wantLo) draw({ x: off, y: p }, { x: off + len, y: p });
      }
    }
  }
  return doc.save();
}
async function addLayMarks(bytes, opts) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const size = opts.sizePt ?? 14.17;
  const t = opts.thicknessPt ?? 0.5;
  const o = opts.offsetPt ?? 14.17;
  const c = opts.color ?? { r: 0, g: 0, b: 0 };
  const col = rgb(c.r, c.g, c.b);
  const wantGrip = opts.edges === "gripper" || opts.edges === "both";
  const wantSide = opts.edges === "sideguide" || opts.edges === "both";
  const gripBottom = (opts.gripperEdge ?? "bottom") === "bottom";
  const sel = parsePageRange(opts.pages ?? "all", n);
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    const line = (x1, y1, x2, y2) => pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: col });
    const mark = (x, y, dx, dy) => {
      if (opts.markType === "cross") {
        line(x - size / 2, y, x + size / 2, y);
        line(x, y - size / 2, x, y + size / 2);
        return;
      }
      const tx = x + dx * size, ty = y + dy * size;
      line(x, y, tx, ty);
      if (opts.markType === "arrow") {
        const hl = size * 0.4, px = -dy, py = dx;
        line(tx, ty, tx - dx * hl + px * hl * 0.6, ty - dy * hl + py * hl * 0.6);
        line(tx, ty, tx - dx * hl - px * hl * 0.6, ty - dy * hl - py * hl * 0.6);
      }
    };
    if (wantGrip) {
      const gy = gripBottom ? o : h - o, gdy = gripBottom ? 1 : -1;
      mark(o, gy, 0, gdy);
      mark(w - o, gy, 0, gdy);
    }
    if (wantSide) {
      const sx = opts.sideGuideSide === "left" ? o : w - o, sdx = opts.sideGuideSide === "left" ? 1 : -1;
      mark(sx, o, sdx, 0);
      mark(sx, h - o, sdx, 0);
    }
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
const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
function drawBars(page, rgb, pattern, x, y, w, h) {
  const total = pattern.split("").reduce((a, d) => a + +d, 0);
  const mod = w / total;
  let cx = x;
  let bar = true;
  const black = rgb(0, 0, 0);
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  for (const d of pattern) {
    const ww = +d * mod;
    if (bar) page.drawRectangle({ x: cx, y, width: ww, height: h, color: black });
    cx += ww;
    bar = !bar;
  }
}
function drawCode128(page, rgb, text, x, y, w, h) {
  const data = (text || " ").replace(/[^\x20-\x7e]/g, "");
  const vals = [104];
  for (const ch of data) vals.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103);
  vals.push(106);
  const pattern = vals.map((v) => C128[v]).join("");
  drawBars(page, rgb, pattern, x, y, w, h);
}
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
function drawEan13(page, rgb, text, x, y, w, h) {
  let d = (text || "").replace(/\D/g, "").slice(0, 13);
  while (d.length < 12) d = "0" + d;
  if (d.length === 12) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += +d[i] * (i % 2 ? 3 : 1);
    d += String((10 - s % 10) % 10);
  }
  const first = +d[0], parity = EAN_PARITY[first];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? EAN_L : EAN_G)[+d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]];
  bits += "101";
  const mod = w / bits.length;
  const black = rgb(0, 0, 0);
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  for (let i = 0; i < bits.length; i++) if (bits[i] === "1") page.drawRectangle({ x: x + i * mod, y, width: mod + 0.2, height: h, color: black });
}
function drawBarcode(page, rgb, qrcode, symbology, text, x, y, w, h) {
  if (symbology === "code128") drawCode128(page, rgb, text, x, y, w, h);
  else if (symbology === "ean13") drawEan13(page, rgb, text, x, y, w, h);
  else drawQrCode(page, rgb, qrcode, text, x, y, Math.min(w, h));
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
  const sym = opts.symbology ?? "qr";
  let qrcode = null;
  if (qrIdx >= 0 && sym === "qr") {
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
      const qrOn = qrIdx >= 0 && (sym !== "qr" || !!qrcode);
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
      if (qrOn) {
        const val = (rec[qrIdx] ?? "").trim();
        if (sym === "qr") drawBarcode(pg, rgb, qrcode, "qr", val, x + cellW - qrSize - 8, y + (cellH - qrSize) / 2, qrSize, qrSize);
        else {
          const bw = Math.min(cellW - 16, qrSize * 2.2), bh = qrSize * 0.6;
          drawBarcode(pg, rgb, null, sym, val, x + cellW - bw - 8, y + (cellH - bh) / 2, bw, bh);
        }
      }
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
  const sel = parsePageRange(opts.pages ?? "all", pages.length);
  const out = await PDFDocument.create();
  const embeds = await out.embedPages(pages);
  const dx = opts.dxIn * PT, dy = opts.dyIn * PT, rad = opts.rotateDeg * Math.PI / 180;
  for (let i = 0; i < embeds.length; i++) {
    const { width: w, height: h } = pages[i].getSize();
    const pg = out.addPage([w, h]);
    if (!sel.has(i + 1)) {
      pg.drawPage(embeds[i], { x: 0, y: 0, width: w, height: h });
      continue;
    }
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
  const sym = opts.symbology ?? "qr";
  let qrcode = null;
  if (sym === "qr") {
    const mod = await import("qrcode-generator");
    qrcode = mod.default ?? mod;
  }
  const s = opts.sizePt, m = opts.marginPt;
  const bw = sym === "qr" ? s : s * 2.4, bh = s;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const x = opts.position === "center" ? (w - bw) / 2 : opts.position.includes("l") ? m : w - bw - m;
    const y = opts.position === "center" ? (h - bh) / 2 : opts.position.includes("t") ? h - bh - m : m;
    drawBarcode(pg, rgb, qrcode, sym, opts.text || " ", x, y, bw, bh);
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
function skylineFind(sky, w, h, sheetW, sheetH) {
  let best = null;
  for (let i = 0; i < sky.length; i++) {
    const x = sky[i].x;
    if (x + w > sheetW + 1e-6) continue;
    let y = 0, covered = 0, j = i;
    while (j < sky.length && covered < w - 1e-6) {
      y = Math.max(y, sky[j].y);
      covered += sky[j].w;
      j++;
    }
    if (covered < w - 1e-6) continue;
    if (y + h > sheetH + 1e-6) continue;
    if (!best || y < best.y - 1e-6 || Math.abs(y - best.y) < 1e-6 && x < best.x) best = { x, y };
  }
  return best;
}
function skylinePlace(sky, x, y, w, h) {
  const top = y + h;
  const out = [];
  for (const s of sky) {
    const sx0 = s.x, sx1 = s.x + s.w;
    if (sx1 <= x + 1e-6 || sx0 >= x + w - 1e-6) {
      out.push(s);
      continue;
    }
    if (sx0 < x - 1e-6) out.push({ x: sx0, y: s.y, w: x - sx0 });
    if (sx1 > x + w + 1e-6) out.push({ x: x + w, y: s.y, w: sx1 - (x + w) });
  }
  out.push({ x, y: top, w });
  out.sort((a, b) => a.x - b.x);
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - s.y) < 1e-6 && Math.abs(last.x + last.w - s.x) < 1e-6) last.w += s.w;
    else merged.push({ ...s });
  }
  return merged;
}
async function rasterizeOccupancy(bytes, pageIndex, cellPt) {
  try {
    if (typeof document === "undefined") return null;
    const pdfjs = await import("pdfjs-dist");
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    } catch {
    }
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await doc.getPage(pageIndex + 1);
    const scale = 72 / cellPt;
    const vp = page.getViewport({ scale });
    const cols = Math.max(1, Math.ceil(vp.width)), rows = Math.max(1, Math.ceil(vp.height));
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp, background: "rgba(0,0,0,0)" }).promise;
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(data[(r * cols + c) * 4 + 3] > 16);
      grid.push(row);
    }
    return grid;
  } catch {
    return null;
  }
}
async function nestTrueShape(bytes, srcPages, items, opts) {
  const cellPt = Math.max(2, 72 / (opts.dpi ?? 36));
  const occ = [];
  for (let i = 0; i < srcPages.length; i++) occ[i] = await rasterizeOccupancy(bytes, i, cellPt);
  if (occ.some((o) => !o)) return null;
  const pad = Math.round(opts.paddingIn * PT / cellPt);
  const m = Math.round(opts.marginIn * PT / cellPt);
  const SW = Math.floor(opts.sheetWIn * PT / cellPt) - 2 * m;
  const SH = opts.roll ? 1e5 : Math.floor(opts.sheetHIn * PT / cellPt) - 2 * m;
  const rot90 = (g) => {
    const R = g.length, C = g[0].length;
    const o = Array.from({ length: C }, () => new Array(R).fill(false));
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (g[r][c]) o[C - 1 - c][r] = true;
    return o;
  };
  const sheets = [];
  let grid = new Uint8Array(SW * (opts.roll ? 4e3 : SH));
  let gridH = opts.roll ? 4e3 : SH;
  let placed = [];
  const fits = (shape, px, py) => {
    const R = shape.length, C = shape[0].length;
    if (px + C > SW || py + R > gridH) return false;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (shape[r][c]) {
      const gy = py + r, gx = px + c;
      if (grid[gy * SW + gx]) return false;
    }
    return true;
  };
  const stamp = (shape, px, py) => {
    const R = shape.length, C = shape[0].length;
    for (let r = -pad; r < R + pad; r++) for (let c = -pad; c < C + pad; c++) {
      const sr = Math.min(Math.max(r, 0), R - 1), sc = Math.min(Math.max(c, 0), C - 1);
      if (shape[sr][sc]) {
        const gy = py + r, gx = px + c;
        if (gy >= 0 && gy < gridH && gx >= 0 && gx < SW) grid[gy * SW + gx] = 1;
      }
    }
  };
  const flush = () => {
    if (placed.length) sheets.push(placed);
    placed = [];
    grid = new Uint8Array(SW * gridH);
  };
  for (const it of items) {
    const shapes = [[occ[it.page], false]];
    if (opts.allowRotate) shapes.push([rot90(occ[it.page]), true]);
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      let best = null;
      for (const [shape, rot] of shapes) {
        outer: for (let py = 0; py <= gridH - shape.length; py++) for (let px = 0; px <= SW - shape[0].length; px++) {
          if (fits(shape, px, py)) {
            if (!best || py < best.y || py === best.y && px < best.x) best = { x: px, y: py, shape, rot };
            break outer;
          }
        }
      }
      if (best) {
        stamp(best.shape, best.x, best.y);
        const w = best.rot ? it.h : it.w, h = best.rot ? it.w : it.h;
        placed.push({ page: it.page, x: (m + best.x) * cellPt, y: best.y * cellPt, w, h, rot: best.rot });
        done = true;
      } else if (opts.fillSheet) {
        done = true;
      } else flush();
    }
    if (opts.fillSheet && !done) break;
  }
  if (placed.length) sheets.push(placed);
  return sheets.length ? sheets : null;
}
async function nestPdf(bytes, opts) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  if (!srcPages.length) throw new Error("Empty PDF");
  const pad = opts.paddingIn * PT, m = opts.marginIn * PT;
  const sheetW = opts.sheetWIn * PT - 2 * m;
  const sheetH = opts.roll ? Infinity : opts.sheetHIn * PT - 2 * m;
  const base = srcPages.map((p, i) => {
    const s = p.getSize();
    return { page: i, w: s.width, h: s.height };
  });
  const items = [];
  if (opts.fillSheet) {
    const per = 400;
    for (let c = 0; c < per; c++) for (const b of base) items.push({ ...b });
  } else {
    for (let c = 0; c < Math.max(1, opts.copies); c++) for (const b of base) items.push({ ...b });
  }
  items.sort((a, b) => b.h - a.h);
  if (opts.trueShape) {
    const ts = await nestTrueShape(bytes, srcPages, items, opts);
    if (ts) return renderNest(await PDFDocument.create(), srcPages, ts, opts, degrees);
  }
  const sheets = [];
  let sky = [{ x: 0, y: 0, w: sheetW }];
  let placed = [];
  let maxTop = 0;
  const newSheet = () => {
    if (placed.length) sheets.push(placed);
    placed = [];
    sky = [{ x: 0, y: 0, w: sheetW }];
    maxTop = 0;
  };
  for (const it of items) {
    const tryOrient = opts.allowRotate ? [[it.w, it.h, false], [it.h, it.w, true]] : [[it.w, it.h, false]];
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      let bestPos = null;
      for (const [w, h, rot] of tryOrient) {
        const wp = w + pad, hp = h + pad;
        const pos = skylineFind(sky, wp, hp, sheetW, sheetH);
        if (pos && (!bestPos || pos.y < bestPos.y)) bestPos = { x: pos.x, y: pos.y, w: wp, h: hp, rot };
      }
      if (bestPos) {
        placed.push({ page: it.page, x: m + bestPos.x, y: bestPos.y, w: bestPos.w - pad, h: bestPos.h - pad, rot: bestPos.rot });
        sky = skylinePlace(sky, bestPos.x, bestPos.y, bestPos.w, bestPos.h);
        maxTop = Math.max(maxTop, bestPos.y + bestPos.h);
        done = true;
      } else if (opts.fillSheet) {
        done = true;
      } else {
        newSheet();
      }
    }
    if (opts.fillSheet && !done) break;
  }
  if (placed.length) sheets.push(placed);
  if (!sheets.length) throw new Error("Nothing fit \u2014 increase sheet size or reduce item size.");
  return renderNest(await PDFDocument.create(), srcPages, sheets, opts, degrees);
}
async function renderNest(outDoc, srcPages, sheets, opts, degrees) {
  const m = opts.marginIn * PT;
  const embeds = await outDoc.embedPages(srcPages);
  for (const sheet of sheets) {
    const usedTop = Math.max(...sheet.map((p) => p.y + p.h));
    const pageH = opts.roll ? usedTop + 2 * m : opts.sheetHIn * PT;
    const pg = outDoc.addPage([opts.sheetWIn * PT, pageH]);
    for (const it of sheet) {
      const emb = embeds[it.page];
      const yTop = pageH - m - (it.y + it.h);
      if (it.rot) pg.drawPage(emb, { x: it.x + it.w, y: yTop, width: it.h, height: it.w, rotate: degrees(90) });
      else pg.drawPage(emb, { x: it.x, y: yTop, width: it.w, height: it.h });
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
  addBackdrop,
  addCollatingMarks,
  addColorBar,
  addCropMarksOnly,
  addDimensions,
  addFoldMarks,
  addGatheringMarks,
  addHeaderFooter,
  addJobSlug,
  addLayMarks,
  addOmrMarks,
  addPageNumbers,
  addQrStamp,
  addRegistrationMarks,
  addTextWatermark,
  computeNUpGrid,
  cropPdf,
  distortFactorFromCylinder,
  distortPdf,
  downloadMultiple,
  downloadPdf,
  expandShuffle,
  flipPdf,
  generateBleed,
  getPdfInfo,
  imposeBooklet,
  imposeCalendar,
  imposeDataMerge,
  imposeNUp,
  imposeNUpBook,
  imposeTickets,
  imposeTiledPoster,
  insertPages,
  makeDieline,
  makeZip,
  mergePdfs,
  mixPdfs,
  nestPdf,
  nudgePdf,
  overlayPdf,
  parsePageRange,
  preflight,
  repairPdf,
  resizePdf,
  rotatePdf,
  shufflePages,
  splitPdf,
  splitPdfChunks
};
