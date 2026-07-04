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
  const c = opts.color ?? { r: 0.5, g: 0.5, b: 0.5 };
  const pages = doc.getPages();
  const sel = parsePageRange(opts.pages ?? "all", pages.length);
  for (let i = 0; i < pages.length; i++) {
    if (!sel.has(i + 1)) continue;
    const pg = pages[i];
    const { width: w, height: h } = pg.getSize();
    const tw = font.widthOfTextAtSize(opts.text || "PROOF", opts.fontSizePt);
    const x = w / 2 - tw / 2 * Math.cos(rad);
    const y = h / 2 - tw / 2 * Math.sin(rad);
    pg.drawText(opts.text || "PROOF", {
      x,
      y,
      font,
      size: opts.fontSizePt,
      color: rgb(c.r, c.g, c.b),
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
  else if (symbology === "datamatrix") {
    const dm = encodeDataMatrix(text);
    const cell = Math.min(w, h) / (dm.size + 4);
    drawModuleGrid(page, rgb, dm.matrix, x, y, cell, 2);
  } else drawQrCode(page, rgb, qrcode, text, x, y, Math.min(w, h));
}
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 301;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
function dmReedSolomon(data, nc) {
  const gen = new Array(nc + 1).fill(0);
  gen[0] = 1;
  for (let i = 1; i <= nc; i++) {
    gen[i] = 1;
    for (let j = i - 1; j > 0; j--) gen[j] = gen[j - 1] ^ gfMul(gen[j], GF_EXP[i]);
    gen[0] = gfMul(gen[0], GF_EXP[i]);
  }
  const ecc = new Array(nc).fill(0);
  for (const d of data) {
    const k = d ^ ecc[0];
    for (let j = 0; j < nc - 1; j++) ecc[j] = ecc[j + 1] ^ gfMul(k, gen[nc - 1 - j]);
    ecc[nc - 1] = gfMul(k, gen[0]);
  }
  return ecc;
}
function dmEncodeAscii(text) {
  const b = Array.from(text, (c) => c.charCodeAt(0) & 255);
  const cw = [];
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    if (c >= 48 && c <= 57 && i + 1 < b.length && b[i + 1] >= 48 && b[i + 1] <= 57) {
      cw.push((c - 48) * 10 + (b[i + 1] - 48) + 130);
      i += 2;
    } else if (c < 128) {
      cw.push(c + 1);
      i++;
    } else {
      cw.push(235);
      cw.push(c - 128 + 1);
      i++;
    }
  }
  return cw;
}
const DM_SIZES = [[10, 3, 5], [12, 5, 7], [14, 8, 10], [16, 12, 12], [18, 18, 14], [20, 22, 18], [22, 30, 20], [24, 36, 24], [26, 44, 28]];
function dmPlacement(nrow, ncol) {
  const arr = new Int32Array(nrow * ncol).fill(-1);
  const mod = (r2, c5, chr2, bit) => {
    if (r2 < 0) {
      r2 += nrow;
      c5 += 4 - (nrow + 4) % 8;
    }
    if (c5 < 0) {
      c5 += ncol;
      r2 += 4 - (ncol + 4) % 8;
    }
    arr[r2 * ncol + c5] = chr2 * 8 + bit;
  };
  const utah = (r2, c5, chr2) => {
    mod(r2 - 2, c5 - 2, chr2, 0);
    mod(r2 - 2, c5 - 1, chr2, 1);
    mod(r2 - 1, c5 - 2, chr2, 2);
    mod(r2 - 1, c5 - 1, chr2, 3);
    mod(r2 - 1, c5, chr2, 4);
    mod(r2, c5 - 2, chr2, 5);
    mod(r2, c5 - 1, chr2, 6);
    mod(r2, c5, chr2, 7);
  };
  const c1 = (chr2) => {
    mod(nrow - 1, 0, chr2, 0);
    mod(nrow - 1, 1, chr2, 1);
    mod(nrow - 1, 2, chr2, 2);
    mod(0, ncol - 2, chr2, 3);
    mod(0, ncol - 1, chr2, 4);
    mod(1, ncol - 1, chr2, 5);
    mod(2, ncol - 1, chr2, 6);
    mod(3, ncol - 1, chr2, 7);
  };
  const c2 = (chr2) => {
    mod(nrow - 3, 0, chr2, 0);
    mod(nrow - 2, 0, chr2, 1);
    mod(nrow - 1, 0, chr2, 2);
    mod(0, ncol - 4, chr2, 3);
    mod(0, ncol - 3, chr2, 4);
    mod(0, ncol - 2, chr2, 5);
    mod(0, ncol - 1, chr2, 6);
    mod(1, ncol - 1, chr2, 7);
  };
  const c3 = (chr2) => {
    mod(nrow - 3, 0, chr2, 0);
    mod(nrow - 2, 0, chr2, 1);
    mod(nrow - 1, 0, chr2, 2);
    mod(0, ncol - 2, chr2, 3);
    mod(0, ncol - 1, chr2, 4);
    mod(1, ncol - 1, chr2, 5);
    mod(2, ncol - 1, chr2, 6);
    mod(3, ncol - 1, chr2, 7);
  };
  const c4 = (chr2) => {
    mod(nrow - 1, 0, chr2, 0);
    mod(nrow - 1, ncol - 1, chr2, 1);
    mod(0, ncol - 3, chr2, 2);
    mod(0, ncol - 2, chr2, 3);
    mod(0, ncol - 1, chr2, 4);
    mod(1, ncol - 3, chr2, 5);
    mod(1, ncol - 2, chr2, 6);
    mod(1, ncol - 1, chr2, 7);
  };
  let chr = 0, r = 4, c = 0;
  do {
    if (r === nrow && c === 0) c1(chr++);
    else if (r === nrow - 2 && c === 0 && ncol % 4) c2(chr++);
    else if (r === nrow - 2 && c === 0 && ncol % 8 === 4) c3(chr++);
    else if (r === nrow + 4 && c === 2 && ncol % 8 === 0) c4(chr++);
    do {
      if (r < nrow && c >= 0 && arr[r * ncol + c] === -1) utah(r, c, chr++);
      r -= 2;
      c += 2;
    } while (r >= 0 && c < ncol);
    r += 1;
    c += 3;
    do {
      if (r >= 0 && c < ncol && arr[r * ncol + c] === -1) utah(r, c, chr++);
      r += 2;
      c -= 2;
    } while (r < nrow && c >= 0);
    r += 3;
    c += 1;
  } while (r < nrow || c < ncol);
  if (arr[(nrow - 1) * ncol + ncol - 1] === -1) {
    arr[(nrow - 1) * ncol + ncol - 1] = arr[(nrow - 2) * ncol + ncol - 2] = -2;
  }
  return arr;
}
function encodeDataMatrix(text) {
  let data = dmEncodeAscii(text || " ");
  const spec = DM_SIZES.find((s) => data.length <= s[1]);
  if (!spec) throw new Error("DataMatrix: data too long (max 44 codewords / 26\xD726)");
  const [D, cap, nc] = spec;
  if (data.length < cap) {
    data.push(129);
    while (data.length < cap) {
      const pos = data.length + 1;
      let v = 149 * pos % 253 + 1 + 129;
      if (v > 254) v -= 254;
      data.push(v);
    }
  }
  const all = data.concat(dmReedSolomon(data, nc));
  const nrow = D - 2, ncol = D - 2;
  const place = dmPlacement(nrow, ncol);
  const m = Array.from({ length: D }, () => new Array(D).fill(false));
  for (let row = 0; row < D; row++) for (let col = 0; col < D; col++) {
    if (col === 0) m[row][col] = true;
    else if (row === D - 1) m[row][col] = true;
    else if (row === 0) m[row][col] = col % 2 === 0;
    else if (col === D - 1) m[row][col] = (D - 1 - row) % 2 === 0;
    else {
      const idx = place[(row - 1) * ncol + (col - 1)];
      m[row][col] = idx === -2 ? true : idx >= 0 && (all[Math.floor(idx / 8)] >> 7 - idx % 8 & 1) === 1;
    }
  }
  return { size: D, matrix: m, codewords: data, ecc: all.slice(data.length) };
}
function drawModuleGrid(page, rgb, matrix, x, y, cell, quiet) {
  const n = matrix.length, total = n + quiet * 2, size = total * cell;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  const black = rgb(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!matrix[r][c]) continue;
    page.drawRectangle({ x: x + (quiet + c) * cell, y: y + size - (quiet + r + 1) * cell, width: cell + 0.3, height: cell + 0.3, color: black });
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
async function repairPdf(bytes, opts = {}) {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  const sel = parsePageRange(opts.pages ?? "all", pages.length);
  pages.forEach((p, i) => {
    out.addPage(p);
    if (!sel.has(i + 1)) return;
    if (opts.removeAnnotations) p.node.delete(PDFName.of("Annots"));
    if (opts.removeJavaScript) p.node.delete(PDFName.of("AA"));
  });
  if (opts.stripMetadata) {
    out.setTitle("");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);
    out.setProducer("");
    out.setCreator("");
    try {
      out.catalog.delete(PDFName.of("Metadata"));
    } catch {
    }
  }
  return out.save({ useObjectStreams: true });
}
function colorEffectsFilter(o) {
  const p = [];
  p.push(`brightness(${(o.brightness ?? 100) / 100})`);
  p.push(`contrast(${(o.contrast ?? 100) / 100})`);
  p.push(`saturate(${(o.saturation ?? 100) / 100})`);
  if (o.grayscale) p.push(`grayscale(${o.grayscale / 100})`);
  if (o.warmTone) p.push(`sepia(${o.warmTone / 100})`);
  if (o.invert) p.push(`invert(${o.invert / 100})`);
  if (o.hueRotate) p.push(`hue-rotate(${o.hueRotate}deg)`);
  return p.join(" ");
}
function colorEffectsIsIdentity(o) {
  return (o.brightness ?? 100) === 100 && (o.contrast ?? 100) === 100 && (o.saturation ?? 100) === 100 && !o.grayscale && !o.warmTone && !o.invert && !o.hueRotate;
}
async function applyColorEffects(bytes, opts) {
  if (typeof document === "undefined") throw new Error("Colour Effects needs a browser (canvas rasterisation).");
  const { PDFDocument } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  } catch {
  }
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const sel = parsePageRange(opts.pages ?? "all", n);
  const dpi = opts.dpi ?? 300;
  const filter = colorEffectsFilter(opts);
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) {
      const [cp] = await out.copyPages(src, [i]);
      out.addPage(cp);
      continue;
    }
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const fcanvas = document.createElement("canvas");
    fcanvas.width = canvas.width;
    fcanvas.height = canvas.height;
    const fctx = fcanvas.getContext("2d");
    fctx.filter = filter || "none";
    fctx.drawImage(canvas, 0, 0);
    const dataUrl = fcanvas.toDataURL("image/png");
    const bin = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    const emb = await out.embedPng(arr);
    const { width: pw, height: ph } = src.getPage(i).getSize();
    const pg = out.addPage([pw, ph]);
    pg.drawImage(emb, { x: 0, y: 0, width: pw, height: ph });
  }
  return out.save();
}
function rgbToCmyk(r, g, b) {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1 - 1e-6) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}
const NEUG = [
  [1, 1, 1],
  // white
  [0, 0.68, 0.94],
  // C
  [0.9, 0.1, 0.54],
  // M
  [0.99, 0.95, 0.13],
  // Y
  [0.16, 0.1, 0.45],
  // C+M  (blue)
  [0, 0.62, 0.3],
  // C+Y  (green)
  [0.92, 0.16, 0.18],
  // M+Y  (red)
  [0.2, 0.18, 0.16]
  // C+M+Y (near-black)
];
function cmykToRgb(c, m, y, k) {
  const w = [
    (1 - c) * (1 - m) * (1 - y),
    c * (1 - m) * (1 - y),
    (1 - c) * m * (1 - y),
    (1 - c) * (1 - m) * y,
    c * m * (1 - y),
    c * (1 - m) * y,
    (1 - c) * m * y,
    c * m * y
  ];
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 8; i++) {
    r += w[i] * NEUG[i][0];
    g += w[i] * NEUG[i][1];
    b += w[i] * NEUG[i][2];
  }
  const kf = 1 - 0.9 * k;
  return [r * kf, g * kf, b * kf];
}
function cmykRoundTrip(r, g, b) {
  const [c, m, y, k] = rgbToCmyk(r, g, b);
  return cmykToRgb(c, m, y, k);
}
function isOutOfCmykGamut(r, g, b, thresh = 0.12) {
  const [r2, g2, b2] = cmykRoundTrip(r, g, b);
  return Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2)) > thresh;
}
function mapPixelCmyk(r, g, b, intent) {
  let R = r, G = g, B = b;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (intent === "perceptual") {
    const f = 0.9;
    R = lum + (r - lum) * f;
    G = lum + (g - lum) * f;
    B = lum + (b - lum) * f;
  } else if (intent === "saturation") {
    const f = 1.1;
    R = Math.min(1, Math.max(0, lum + (r - lum) * f));
    G = Math.min(1, Math.max(0, lum + (g - lum) * f));
    B = Math.min(1, Math.max(0, lum + (b - lum) * f));
  }
  return cmykRoundTrip(R, G, B);
}
async function assignOutputIntent(baseBytes, iccBytes, conditionName) {
  const { PDFDocument, PDFName, PDFString } = await import("pdf-lib");
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const cs = String.fromCharCode(...iccBytes.slice(16, 20));
  const N = cs.startsWith("CMYK") ? 4 : cs.startsWith("GRAY") ? 1 : 3;
  const iccRef = ctx.register(ctx.stream(iccBytes, { N }));
  const oi = ctx.obj({
    Type: "OutputIntent",
    S: "GTS_PDFX",
    OutputConditionIdentifier: PDFString.of(conditionName || "Custom"),
    Info: PDFString.of(conditionName || "Custom"),
    DestOutputProfile: iccRef
  });
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([ctx.register(oi)]));
  return doc.save();
}
async function applyColorManagement(bytes, opts) {
  if (typeof document === "undefined") throw new Error("Colour Management needs a browser (canvas rasterisation).");
  const { PDFDocument } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  } catch {
  }
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = src.getPageCount();
  const sel = parsePageRange(opts.pages ?? "all", n);
  const dpi = opts.dpi ?? 300;
  const intent = opts.intent ?? "perceptual";
  const warn = opts.warningColor ?? { r: 0, g: 1, b: 0 };
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) {
      const [cp] = await out.copyPages(src, [i]);
      out.addPage(cp);
      continue;
    }
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
      if (opts.gamutWarning && isOutOfCmykGamut(r, g, b)) {
        d[p] = warn.r * 255;
        d[p + 1] = warn.g * 255;
        d[p + 2] = warn.b * 255;
        continue;
      }
      const [nr, ng, nb] = mapPixelCmyk(r, g, b, intent);
      d[p] = Math.round(nr * 255);
      d[p + 1] = Math.round(ng * 255);
      d[p + 2] = Math.round(nb * 255);
    }
    ctx.putImageData(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const bin = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    const emb = await out.embedPng(arr);
    const { width: pw, height: ph } = src.getPage(i).getSize();
    out.addPage([pw, ph]).drawImage(emb, { x: 0, y: 0, width: pw, height: ph });
  }
  return out.save();
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
async function addBackdropFile(baseBytes, backdropBytes, opts) {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const srcEmbeds = await out.embedPages(pages);
  const sig = String.fromCharCode(...backdropBytes.slice(0, 4));
  let bw0, bh0;
  let place;
  if (sig === "%PDF") {
    const [bd] = await out.embedPdf(backdropBytes, [0]);
    bw0 = bd.width;
    bh0 = bd.height;
    place = (pg, x, y, w, h, op2) => pg.drawPage(bd, { x, y, width: w, height: h, opacity: op2 });
  } else {
    const isPng = backdropBytes[0] === 137 && backdropBytes[1] === 80;
    const img = isPng ? await out.embedPng(backdropBytes) : await out.embedJpg(backdropBytes);
    bw0 = img.width;
    bh0 = img.height;
    place = (pg, x, y, w, h, op2) => pg.drawImage(img, { x, y, width: w, height: h, opacity: op2 });
  }
  const scale = (opts.scalePct ?? 100) / 100;
  const op = opts.opacity ?? 1;
  const bw = bw0 * scale, bh = bh0 * scale;
  const sel = parsePageRange(opts.pages ?? "all", pages.length);
  for (let i = 0; i < pages.length; i++) {
    const { width: w, height: h } = pages[i].getSize();
    const pg = out.addPage([w, h]);
    const applies = opts.repeat === false ? i === 0 : sel.has(i + 1);
    if (applies) place(pg, opts.offsetXPt ?? 0, h - bh - (opts.offsetYPt ?? 0), bw, bh, op);
    pg.drawPage(srcEmbeds[i], { x: 0, y: 0, width: w, height: h });
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
function code128Bits(text) {
  const data = (text || " ").replace(/[^\x20-\x7e]/g, "");
  const vals = [104];
  for (const ch of data) vals.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, 106);
  let bits = "";
  for (const v of vals) {
    let bar = true;
    for (const d of C128[v]) {
      bits += (bar ? "1" : "0").repeat(+d);
      bar = !bar;
    }
  }
  return bits;
}
function ean13Bits(text) {
  let d = (text || "").replace(/\D/g, "").slice(0, 13);
  while (d.length < 12) d = "0" + d;
  if (d.length === 12) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += +d[i] * (i % 2 ? 3 : 1);
    d += String((10 - s % 10) % 10);
  }
  const parity = EAN_PARITY[+d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? EAN_L : EAN_G)[+d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]];
  return bits + "101";
}
function rotateRect(deg, W, H, lx, ly, w, h) {
  switch ((deg % 360 + 360) % 360) {
    case 90:
      return { x: H - (ly + h), y: lx, w: h, h: w };
    case 180:
      return { x: W - (lx + w), y: H - (ly + h), w, h };
    case 270:
      return { x: ly, y: W - (lx + w), w: h, h: w };
    default:
      return { x: lx, y: ly, w, h };
  }
}
async function addBarcodeStamp(bytes, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const scale = opts.scale ?? 3;
  const q = opts.quietZone ?? 4;
  const rot = opts.rotationDeg ?? 0;
  const bar = opts.barColor ?? { r: 0, g: 0, b: 0 };
  const bg = opts.bgColor ?? { r: 1, g: 1, b: 1 };
  const barCol = rgb(bar.r, bar.g, bar.b), bgCol = rgb(bg.r, bg.g, bg.b);
  const is2D = opts.symbology === "qr" || opts.symbology === "datamatrix";
  const sel = parsePageRange(opts.pages ?? "all", doc.getPageCount());
  const margin = opts.marginPt ?? 18;
  const cells = [];
  let W = 0, H = 0, label = "";
  if (is2D) {
    let grid;
    if (opts.symbology === "datamatrix") grid = encodeDataMatrix(opts.text || " ").matrix;
    else {
      const mod = await import("qrcode-generator");
      const qrcode = mod.default ?? mod;
      const qr = qrcode(0, "M");
      qr.addData(opts.text || " ");
      qr.make();
      const n2 = qr.getModuleCount();
      grid = Array.from({ length: n2 }, (_, r) => Array.from({ length: n2 }, (_2, c) => qr.isDark(r, c)));
    }
    const n = grid.length, tot = n + 2 * q;
    W = H = tot * scale;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c]) cells.push({ x: (q + c) * scale, y: H - (q + r + 1) * scale, w: scale + 0.3, h: scale + 0.3 });
  } else {
    const bits = opts.symbology === "ean13" ? ean13Bits(opts.text) : code128Bits(opts.text);
    label = opts.symbology === "ean13" ? (opts.text || "").replace(/\D/g, "").slice(0, 13) : opts.text || "";
    const barH = (opts.barHeightMm ?? 15) * 2.83465;
    const textGap = opts.showText ? 11 : 0;
    W = (bits.length + 2 * q) * scale;
    H = barH + textGap;
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") cells.push({ x: (q + i) * scale, y: textGap, w: scale + 0.15, h: barH });
  }
  const swap = rot === 90 || rot === 270;
  const fw = swap ? H : W, fh = swap ? W : H;
  for (let p = 0; p < doc.getPageCount(); p++) {
    if (!sel.has(p + 1)) continue;
    const pg = doc.getPage(p);
    const { width: pw, height: ph } = pg.getSize();
    const hz = opts.position[1], vt = opts.position[0];
    let ax = hz === "l" ? margin : hz === "c" ? (pw - fw) / 2 : pw - fw - margin;
    let ay = vt === "t" ? ph - fh - margin : vt === "m" ? (ph - fh) / 2 : margin;
    ax += opts.xOffsetPt ?? 0;
    ay -= opts.yOffsetPt ?? 0;
    if (!opts.transparent) pg.drawRectangle({ x: ax, y: ay, width: fw, height: fh, color: bgCol });
    for (const c of cells) {
      const r = rotateRect(rot, W, H, c.x, c.y, c.w, c.h);
      pg.drawRectangle({ x: ax + r.x, y: ay + r.y, width: r.w, height: r.h, color: barCol });
    }
    if (opts.showText && !is2D && rot === 0 && label) {
      const ts = 8, tw = font.widthOfTextAtSize(label, ts);
      pg.drawText(label, { x: ax + (fw - tw) / 2, y: ay + 1, font, size: ts, color: barCol });
    }
  }
  return doc.save();
}
async function addDimensions(bytes) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const col = rgb(0.85, 0.11, 0.14);
  const blue = rgb(0.15, 0.4, 0.85);
  const dim = (bw, bh) => `${(bw / PT).toFixed(2)}in - ${Math.round(bw)} pt`;
  for (const pg of doc.getPages()) {
    const { width: w, height: h } = pg.getSize();
    const trim = pg.getTrimBox();
    const bleed = pg.getBleedBox();
    const wl = dim(trim.width, trim.height);
    const hl = `${(trim.height / PT).toFixed(2)}in - ${Math.round(trim.height)} pt`;
    pg.drawText(wl, { x: (w - font.widthOfTextAtSize(wl, 8)) / 2, y: 5, font, size: 8, color: col });
    pg.drawText(hl, { x: 11, y: h / 2 - font.widthOfTextAtSize(hl, 8) / 2, font, size: 8, color: col, rotate: degrees(90) });
    const hasBleed = Math.abs(bleed.width - trim.width) > 1 || Math.abs(bleed.height - trim.height) > 1;
    if (hasBleed) {
      const bl = `bleed ${(bleed.width / PT).toFixed(2)}\xD7${(bleed.height / PT).toFixed(2)}in`;
      pg.drawText(bl, { x: (w - font.widthOfTextAtSize(bl, 7)) / 2, y: h - 12, font, size: 7, color: blue });
    }
  }
  return doc.save();
}
function ensureSeparation(PL, doc, page, spotName, preview, cache) {
  const { PDFName, PDFDict } = PL;
  const ctx = doc.context;
  let csRef = cache.get(spotName);
  if (!csRef) {
    const fnRef = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1, 1, 1], C1: [preview.r, preview.g, preview.b], N: 1 }));
    csRef = ctx.register(ctx.obj([PDFName.of("Separation"), PDFName.of(spotName), PDFName.of("DeviceRGB"), fnRef]));
    cache.set(spotName, csRef);
  }
  const resName = "Spot" + spotName.replace(/[^A-Za-z0-9]/g, "") || "SpotCS";
  page.node.normalize();
  let resources = page.node.Resources();
  if (!resources) {
    resources = ctx.obj({});
    page.node.set(PDFName.of("Resources"), resources);
  }
  let csDict = resources.lookupMaybe(PDFName.of("ColorSpace"), PDFDict);
  if (!csDict) {
    csDict = ctx.obj({});
    resources.set(PDFName.of("ColorSpace"), csDict);
  }
  csDict.set(PDFName.of(resName), csRef);
  return resName;
}
function addContentStream(PL, ctx, page, str, prepend) {
  const { PDFName, PDFArray } = PL;
  const streamRef = ctx.register(ctx.stream(str));
  page.node.normalize();
  const key = PDFName.of("Contents");
  const cur = page.node.Contents();
  if (cur instanceof PDFArray) {
    if (prepend) cur.insert(0, streamRef);
    else cur.push(streamRef);
  } else if (cur) {
    const ref = page.node.get(key);
    const arr = ctx.obj(prepend ? [streamRef, ref] : [ref, streamRef]);
    page.node.set(key, arr);
  } else {
    page.node.set(key, streamRef);
  }
}
const F = (v) => v.toFixed(3);
function shapePathOps(shape, x, y, w, h, radius) {
  if (shape === "ellipse") {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = 0.5523 * rx, ky = 0.5523 * ry;
    return [
      `${F(cx + rx)} ${F(cy)} m`,
      `${F(cx + rx)} ${F(cy + ky)} ${F(cx + kx)} ${F(cy + ry)} ${F(cx)} ${F(cy + ry)} c`,
      `${F(cx - kx)} ${F(cy + ry)} ${F(cx - rx)} ${F(cy + ky)} ${F(cx - rx)} ${F(cy)} c`,
      `${F(cx - rx)} ${F(cy - ky)} ${F(cx - kx)} ${F(cy - ry)} ${F(cx)} ${F(cy - ry)} c`,
      `${F(cx + kx)} ${F(cy - ry)} ${F(cx + rx)} ${F(cy - ky)} ${F(cx + rx)} ${F(cy)} c`,
      "h"
    ].join("\n");
  }
  if (shape === "rounded") {
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
      "h"
    ].join("\n");
  }
  return `${F(x)} ${F(y)} ${F(w)} ${F(h)} re`;
}
const circleOps = (cx, cy, r) => {
  const k = 0.5523 * r;
  return [
    `${F(cx + r)} ${F(cy)} m`,
    `${F(cx + r)} ${F(cy + k)} ${F(cx + k)} ${F(cy + r)} ${F(cx)} ${F(cy + r)} c`,
    `${F(cx - k)} ${F(cy + r)} ${F(cx - r)} ${F(cy + k)} ${F(cx - r)} ${F(cy)} c`,
    `${F(cx - r)} ${F(cy - k)} ${F(cx - k)} ${F(cy - r)} ${F(cx)} ${F(cy - r)} c`,
    `${F(cx + k)} ${F(cy - r)} ${F(cx + r)} ${F(cy - k)} ${F(cx + r)} ${F(cy)} c`
  ].join("\n");
};
function boxOf(page, target, customWpt, customHpt) {
  if (target === "custom") {
    const mb = page.getMediaBox();
    const cw = customWpt ?? 216, ch = customHpt ?? 144;
    return { x: mb.x + (mb.width - cw) / 2, y: mb.y + (mb.height - ch) / 2, w: cw, h: ch };
  }
  const b = target === "bleed" ? page.getBleedBox() : target === "media" || target === "flood" ? page.getMediaBox() : page.getTrimBox();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
async function addCutContour(bytes, opts) {
  const PL = await import("pdf-lib");
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? "all", n);
  const preview = opts.previewColor ?? { r: 0.925, g: 0, b: 0.55 };
  const th = opts.thicknessPt ?? 0.25;
  const cache = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i];
    const resName = ensureSeparation(PL, doc, page, opts.spotName, preview, cache);
    const b = boxOf(page, opts.target, opts.customWpt, opts.customHpt);
    const x = b.x + (opts.xOffsetPt ?? 0), y = b.y - (opts.yOffsetPt ?? 0);
    const path = shapePathOps(opts.shape, x, y, b.w, b.h, opts.cornerRadiusPt ?? 8.5);
    const dash = opts.dashed ? `[${opts.dashLenPt ?? 6} ${opts.dashGapPt ?? 3}] 0 d
` : "";
    addContentStream(PL, doc.context, page, `
q
/${resName} CS
1 SCN
${th} w
1 J 1 j
${dash}${path}
S
Q
`, false);
  }
  return doc.save();
}
async function addWhiteVarnish(bytes, opts) {
  const PL = await import("pdf-lib");
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? "all", n);
  const preview = opts.previewColor ?? { r: 0.85, g: 0.86, b: 0.92 };
  const tint = opts.tint ?? 1;
  const cache = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i];
    const resName = ensureSeparation(PL, doc, page, opts.spotName, preview, cache);
    const b = boxOf(page, opts.coverage, opts.customWpt, opts.customHpt);
    const x = b.x + (opts.xOffsetPt ?? 0), y = b.y - (opts.yOffsetPt ?? 0);
    addContentStream(PL, doc.context, page, `
q
/${resName} cs
${F(tint)} scn
${F(x)} ${F(y)} ${F(b.w)} ${F(b.h)} re
f
Q
`, !!opts.under);
  }
  return doc.save();
}
const BRAILLE_G1 = {
  a: [1],
  b: [1, 2],
  c: [1, 4],
  d: [1, 4, 5],
  e: [1, 5],
  f: [1, 2, 4],
  g: [1, 2, 4, 5],
  h: [1, 2, 5],
  i: [2, 4],
  j: [2, 4, 5],
  k: [1, 3],
  l: [1, 2, 3],
  m: [1, 3, 4],
  n: [1, 3, 4, 5],
  o: [1, 3, 5],
  p: [1, 2, 3, 4],
  q: [1, 2, 3, 4, 5],
  r: [1, 2, 3, 5],
  s: [2, 3, 4],
  t: [2, 3, 4, 5],
  u: [1, 3, 6],
  v: [1, 2, 3, 6],
  w: [2, 4, 5, 6],
  x: [1, 3, 4, 6],
  y: [1, 3, 4, 5, 6],
  z: [1, 3, 5, 6],
  " ": [],
  ".": [2, 5, 6],
  ",": [2],
  "-": [3, 6],
  "?": [2, 3, 6],
  "!": [2, 3, 5],
  "'": [3],
  ";": [2, 3],
  ":": [2, 5]
};
function textToBrailleCells(text) {
  const cells = [];
  let numberMode = false;
  for (const raw of text) {
    if (raw === "\n") {
      cells.push("\n");
      numberMode = false;
      continue;
    }
    const ch = raw.toLowerCase();
    if (ch >= "0" && ch <= "9") {
      if (!numberMode) {
        cells.push([3, 4, 5, 6]);
        numberMode = true;
      }
      const idx = ch === "0" ? 9 : ch.charCodeAt(0) - 49;
      cells.push(BRAILLE_G1["abcdefghij"[idx]]);
    } else {
      numberMode = false;
      cells.push(BRAILLE_G1[ch] ?? []);
    }
  }
  return cells;
}
async function addBraille(bytes, opts) {
  const PL = await import("pdf-lib");
  const { PDFDocument } = PL;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const n = pages.length;
  const sel = parsePageRange(opts.pages ?? "all", n);
  const r = (opts.dotDiaPt ?? 4.25) / 2;
  const pitch = opts.dotPitchPt ?? 7.09;
  const cellAdv = opts.cellSpacePt ?? 17;
  const lineAdv = opts.lineSpacePt ?? 28.35;
  const cells = textToBrailleCells(opts.text);
  const useSpot = !!opts.spotName;
  const preview = opts.previewColor ?? { r: 0.55, g: 0.55, b: 0.6 };
  const cache = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    if (!sel.has(i + 1)) continue;
    const page = pages[i];
    const { width, height } = page.getSize();
    const sx = opts.xPt ?? 72;
    let cx = sx, cy = opts.yPt ?? height - 72;
    let ops = "\nq\n";
    if (useSpot) {
      const resName = ensureSeparation(PL, doc, page, opts.spotName, preview, cache);
      ops += `/${resName} cs
${F(opts.tint ?? 1)} scn
`;
    } else ops += `${F(preview.r)} ${F(preview.g)} ${F(preview.b)} rg
`;
    for (const cell of cells) {
      if (cell === "\n") {
        cx = sx;
        cy -= lineAdv;
        continue;
      }
      for (const d of cell) {
        const col = d <= 3 ? 0 : 1, row = (d - 1) % 3;
        ops += circleOps(cx + col * pitch, cy - row * pitch, r) + "\nf\n";
      }
      cx += cellAdv;
      if (cx > width - sx) {
        cx = sx;
        cy -= lineAdv;
      }
    }
    ops += "Q\n";
    addContentStream(PL, doc.context, page, ops, false);
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
  addBackdropFile,
  addBarcodeStamp,
  addBraille,
  addCollatingMarks,
  addColorBar,
  addCropMarksOnly,
  addCutContour,
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
  addWhiteVarnish,
  applyColorEffects,
  applyColorManagement,
  assignOutputIntent,
  cmykRoundTrip,
  cmykToRgb,
  colorEffectsFilter,
  colorEffectsIsIdentity,
  computeNUpGrid,
  cropPdf,
  distortFactorFromCylinder,
  distortPdf,
  downloadMultiple,
  downloadPdf,
  encodeDataMatrix,
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
  isOutOfCmykGamut,
  makeDieline,
  makeZip,
  mapPixelCmyk,
  mergePdfs,
  mixPdfs,
  nestPdf,
  nudgePdf,
  overlayPdf,
  parsePageRange,
  preflight,
  repairPdf,
  resizePdf,
  rgbToCmyk,
  rotatePdf,
  shufflePages,
  splitPdf,
  splitPdfChunks
};
