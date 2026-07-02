import { useState, useMemo } from 'react';

// Paper thickness per leaf (one side of a sheet) in inches
const PAPER_STOCKS = [
  { label: '60# Uncoated Text', thicknessPerLeaf: 0.0040, centsPerSheet: 0.8 },
  { label: '70# Uncoated Text', thicknessPerLeaf: 0.0045, centsPerSheet: 1.0 },
  { label: '80# Gloss Text', thicknessPerLeaf: 0.0038, centsPerSheet: 1.1 },
  { label: '100# Gloss Text', thicknessPerLeaf: 0.0036, centsPerSheet: 1.3 },
  { label: '80# Uncoated Cover', thicknessPerLeaf: 0.0076, centsPerSheet: 1.8 },
  { label: '100# Gloss Cover', thicknessPerLeaf: 0.0091, centsPerSheet: 2.2 },
];

const COVER_STOCKS = PAPER_STOCKS.filter((s) => s.label.includes('Cover'));

const COMIC_SIZES = [
  { label: 'Standard Comic (6.625" × 10.25")', w: 6.625, h: 10.25 },
  { label: 'Digest (5.5" × 8.5")', w: 5.5, h: 8.5 },
  { label: 'Letter (8.5" × 11")', w: 8.5, h: 11 },
  { label: 'Tabloid / Magazine (8.5" × 11" spread)', w: 11, h: 8.5 },
  { label: 'Square (7" × 7")', w: 7, h: 7 },
];

const SHEET_SIZES = [
  { label: '12" × 18"', w: 12, h: 18 },
  { label: '13" × 19"', w: 13, h: 19 },
  { label: '17" × 22"', w: 17, h: 22 },
  { label: '18" × 24"', w: 18, h: 24 },
  { label: '25" × 38"', w: 25, h: 38 },
];

const CLICK_RATE = 0.045; // $ per click (one side of a sheet, color)

// ─── Utility ────────────────────────────────────────────────────────────────

function fmt$(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtIn(inches: number) { return `${inches.toFixed(4)}"` ; }
function fmtMM(inches: number) { return `${(inches * 25.4).toFixed(2)} mm`; }

type Tab = 'saddle' | 'perfectbind' | 'nup' | 'cost' | 'bleed';

// ─── Saddle Stitch Planner ───────────────────────────────────────────────────

function SaddlePlanner() {
  const [pages, setPages] = useState(32);
  const [qty, setQty] = useState(100);
  const [interiorStock, setInteriorStock] = useState(0);
  const [coverStock, setCoverStock] = useState(4);

  const rounded4 = Math.ceil(pages / 4) * 4;
  const valid = pages % 4 === 0 && pages >= 8;
  const sheets = pages / 4; // interior sheets (pages on each side, so pages/2 leaves / 2 = pages/4... wait)
  // Actually: pages = leaves × 2 (front+back). Interior sheets = pages / 4.
  // Each sheet has 4 pages (2 per side). So sheets = pages/4.
  const interiorSheets = pages / 4;
  const coverSheets = 1; // always 1 for saddle stitch

  const interiorClicks = interiorSheets * 2; // 2 sides per sheet, color
  const coverClicks = coverSheets * 2;
  const totalClicksPerBook = interiorClicks + coverClicks;

  const stock = PAPER_STOCKS[interiorStock];
  const cover = COVER_STOCKS[coverStock - 4] ?? COVER_STOCKS[0];

  const paperCentPerBook = interiorSheets * stock.centsPerSheet + coverSheets * cover.centsPerSheet;
  const clickCentPerBook = totalClicksPerBook * CLICK_RATE * 100;
  const marginalPerBook = paperCentPerBook + clickCentPerBook;
  const totalMarginal = marginalPerBook * qty;

  const maxPagesSS = 80; // practical limit for saddle stitch

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Field label="Page count (interior + cover)">
          <input type="number" min={4} max={200} step={4} value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
            style={inputStyle} />
          {!valid && pages >= 4 && (
            <div style={{ color: '#c00', fontSize: '.8rem', marginTop: '.25rem' }}>
              Must be a multiple of 4. Nearest valid: {rounded4} pages.
            </div>
          )}
          {pages < 8 && <div style={{ color: '#c00', fontSize: '.8rem', marginTop: '.25rem' }}>Minimum 8 pages.</div>}
          {pages > maxPagesSS && valid && (
            <div style={{ color: '#b45309', fontSize: '.8rem', marginTop: '.25rem' }}>
              Over {maxPagesSS} pages — consider perfect binding.
            </div>
          )}
        </Field>
        <Field label="Quantity">
          <input type="number" min={1} step={25} value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={inputStyle} />
        </Field>
        <Field label="Interior stock">
          <select value={interiorStock} onChange={(e) => setInteriorStock(Number(e.target.value))} style={inputStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Cover stock">
          <select value={coverStock} onChange={(e) => setCoverStock(Number(e.target.value))} style={inputStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i + 4}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      {valid && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
            <StatCard label="Interior sheets" value={String(interiorSheets)} sub="per book" />
            <StatCard label="Cover sheets" value="1" sub="per book" />
            <StatCard label="Color clicks" value={String(totalClicksPerBook)} sub="per book" />
            <StatCard label="Click cost" value={fmt$(clickCentPerBook)} sub="per book" />
            <StatCard label="Paper cost" value={fmt$(paperCentPerBook)} sub="per book" />
            <StatCard label="Marginal cost" value={fmt$(marginalPerBook)} sub="per book (excl. overhead)" accent="#166534" />
            <StatCard label="Total marginal" value={fmt$(totalMarginal)} sub={`for ${qty.toLocaleString()} books`} accent="#1e3a5f" />
          </div>

          <SigDiagram pages={pages} />
        </>
      )}
    </div>
  );
}

function SigDiagram({ pages }: { pages: number }) {
  const sheets = pages / 4;
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>Signature layout ({sheets} sheets, {pages} pages)</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
        {Array.from({ length: sheets }, (_, i) => {
          const s = i + 1;
          const p1 = pages - (s - 1) * 2;       // right page of back of sheet
          const p2 = (s - 1) * 2 + 1;            // left page of back of sheet
          const p3 = (s - 1) * 2 + 2;            // right page of front of sheet
          const p4 = pages - (s - 1) * 2 - 1;   // left page of front of sheet
          return (
            <div key={i} style={{
              background: 'var(--bg-alt)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '.4rem .6rem', fontSize: '.78rem', minWidth: 140,
            }}>
              <div style={{ fontWeight: 700, marginBottom: '.2rem', color: 'var(--muted)' }}>Sheet {s}</div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <span style={{ opacity: .7 }}>Front:</span>
                <span>{p4} | {p3}</span>
              </div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <span style={{ opacity: .7 }}>Back:</span>
                <span>{p2} | {p1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Perfect Bind Planner ────────────────────────────────────────────────────

function PerfectBindPlanner() {
  const [textPages, setTextPages] = useState(128);
  const [qty, setQty] = useState(100);
  const [stockIdx, setStockIdx] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);

  const valid = textPages % 2 === 0 && textPages >= 48;
  const rounded2 = Math.ceil(textPages / 2) * 2;

  const stock = PAPER_STOCKS[stockIdx];
  const cover = COVER_STOCKS[coverIdx];

  const spineInches = (textPages / 2) * stock.thicknessPerLeaf;
  const spineMM = spineInches * 25.4;
  const spineRecommended = spineInches >= 0.25;

  const textSheets = textPages / 2;
  const coverSheets = 1;
  const textClicks = textSheets * 2;
  const coverClicks = coverSheets * 2;
  const totalClicks = textClicks + coverClicks;

  const paperCents = textSheets * stock.centsPerSheet + coverSheets * cover.centsPerSheet;
  const clickCents = totalClicks * CLICK_RATE * 100;
  const marginalPerBook = paperCents + clickCents;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Field label="Text page count (must be even, min 48)">
          <input type="number" min={2} max={600} step={2} value={textPages}
            onChange={(e) => setTextPages(Number(e.target.value))}
            style={inputStyle} />
          {!valid && textPages >= 2 && (
            <div style={{ color: '#c00', fontSize: '.8rem', marginTop: '.25rem' }}>
              {textPages < 48 ? 'Minimum 48 pages for perfect binding.' : `Must be even. Nearest: ${rounded2}.`}
            </div>
          )}
        </Field>
        <Field label="Quantity">
          <input type="number" min={1} step={25} value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={inputStyle} />
        </Field>
        <Field label="Text stock">
          <select value={stockIdx} onChange={(e) => setStockIdx(Number(e.target.value))} style={inputStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Cover stock">
          <select value={coverIdx} onChange={(e) => setCoverIdx(Number(e.target.value))} style={inputStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      {valid && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
            <StatCard
              label="Spine width"
              value={fmtIn(spineInches)}
              sub={fmtMM(spineMM)}
              accent={spineRecommended ? '#166534' : '#92400e'}
            />
            {!spineRecommended && (
              <StatCard label="Warning" value="Thin spine" sub={'<0.25″ — logo may not print cleanly'} accent="#92400e" />
            )}
            <StatCard label="Text sheets" value={String(textSheets)} sub="per book" />
            <StatCard label="Color clicks" value={String(totalClicks)} sub="per book" />
            <StatCard label="Marginal cost" value={fmt$(marginalPerBook)} sub="per book" accent="#166534" />
            <StatCard label="Total marginal" value={fmt$(marginalPerBook * qty)} sub={`for ${qty.toLocaleString()} books`} accent="#1e3a5f" />
          </div>

          <SpinePreview spineIn={spineInches} />
        </>
      )}
    </div>
  );
}

function SpinePreview({ spineIn }: { spineIn: number }) {
  const spinePx = Math.max(12, spineIn * 72);
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>Cover wrap preview (proportional)</h4>
      <div style={{ display: 'flex', alignItems: 'center', height: 80, maxWidth: 500 }}>
        <div style={{ width: 70, height: 80, background: '#e2e8f0', border: '1px solid var(--border)', borderRight: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', color: '#64748b' }}>Back</div>
        <div style={{ width: spinePx, height: 80, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {spineIn >= 0.35 && <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '.65rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TITLE</span>}
        </div>
        <div style={{ width: 70, height: 80, background: '#e2e8f0', border: '1px solid var(--border)', borderLeft: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', color: '#64748b' }}>Front</div>
        <div style={{ marginLeft: '1rem', fontSize: '.85rem', color: 'var(--muted)' }}>
          Spine: {fmtIn(spineIn)} / {fmtMM(spineIn * 25.4)}
        </div>
      </div>
    </div>
  );
}

// ─── N-Up Sheet Planner ──────────────────────────────────────────────────────

function NUpPlanner() {
  const [comicSizeIdx, setComicSizeIdx] = useState(0);
  const [sheetSizeIdx, setSheetSizeIdx] = useState(1); // 13×19
  const [bleed, setBleed] = useState(0.125);
  const [gutter, setGutter] = useState(0.125);

  const comic = COMIC_SIZES[comicSizeIdx];
  const sheet = SHEET_SIZES[sheetSizeIdx];

  const { cols, rows, across, down, efficiency } = useMemo(() => {
    const pw = comic.w + bleed * 2 + gutter;
    const ph = comic.h + bleed * 2 + gutter;
    // Try portrait then landscape orientation of the page
    const tryFit = (sw: number, sh: number) => {
      const c = Math.floor((sw + gutter) / pw);
      const r = Math.floor((sh + gutter) / ph);
      return { c, r, eff: (c * r * comic.w * comic.h) / (sw * sh) };
    };
    const p1 = tryFit(sheet.w, sheet.h);
    const p2 = tryFit(sheet.h, sheet.w); // rotated sheet
    const best = p2.c * p2.r > p1.c * p1.r ? { cols: p2.c, rows: p2.r, across: 'rotated', down: 'rotated', eff: p2.eff } : { cols: p1.c, rows: p1.r, across: 'portrait', down: 'portrait', eff: p1.eff };
    return { cols: best.cols, rows: best.rows, across: best.across, down: best.down, efficiency: best.eff };
  }, [comic, sheet, bleed, gutter]);

  const nUp = cols * rows;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Field label="Finished page size">
          <select value={comicSizeIdx} onChange={(e) => setComicSizeIdx(Number(e.target.value))} style={inputStyle}>
            {COMIC_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Press sheet size">
          <select value={sheetSizeIdx} onChange={(e) => setSheetSizeIdx(Number(e.target.value))} style={inputStyle}>
            {SHEET_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label={`Bleed per edge (in)`}>
          <input type="number" min={0} max={0.5} step={0.0625} value={bleed}
            onChange={(e) => setBleed(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label={`Gutter / margin (in)`}>
          <input type="number" min={0} max={0.5} step={0.0625} value={gutter}
            onChange={(e) => setGutter(Number(e.target.value))} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
        <StatCard label="N-up" value={nUp > 0 ? `${nUp}-up` : 'Doesn\'t fit'} sub={`${cols} × ${rows}`} accent={nUp > 0 ? '#166534' : '#c00'} />
        <StatCard label="Sheet efficiency" value={nUp > 0 ? `${(efficiency * 100).toFixed(1)}%` : '—'} sub="usable area" />
        <StatCard label="Orientation" value={across === 'rotated' ? 'Sheet rotated' : 'Normal'} sub="best fit" />
      </div>

      {nUp > 0 && (
        <NUpGrid cols={cols} rows={rows} pageW={comic.w} pageH={comic.h} bleed={bleed} />
      )}
    </div>
  );
}

function NUpGrid({ cols, rows, pageW, pageH, bleed }: { cols: number; rows: number; pageW: number; pageH: number; bleed: number }) {
  const maxW = 480;
  const maxH = 300;
  const cellW = Math.min(maxW / cols, (maxH / rows) * (pageW / pageH));
  const cellH = cellW * (pageH / pageW);
  const bleedPx = (bleed / pageW) * (cellW - 8);

  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem', overflowX: 'auto' }}>
      <h4 style={{ margin: '0 0 .75rem' }}>{cols * rows}-up layout preview</h4>
      <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${cols}, ${cellW}px)`, gap: 4 }}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} style={{
            width: cellW, height: cellH, background: '#f1f5f9',
            border: '1px solid #94a3b8', position: 'relative', boxSizing: 'border-box',
          }}>
            <div style={{
              position: 'absolute', inset: bleedPx,
              border: '1px dashed #e11d48', boxSizing: 'border-box',
            }} />
            <div style={{
              position: 'absolute', inset: bleedPx + 2,
              border: '1px dashed #2563eb', boxSizing: 'border-box',
            }} />
            <div style={{ position: 'absolute', top: bleedPx + 4, left: bleedPx + 4, fontSize: '0.5rem', color: '#64748b' }}>{i + 1}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: 'var(--muted)', display: 'flex', gap: '1rem' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#e11d48', verticalAlign: 'middle' }} /> Bleed edge</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#2563eb', verticalAlign: 'middle' }} /> Safe zone / trim</span>
      </div>
    </div>
  );
}

// ─── Cost Estimator ──────────────────────────────────────────────────────────

function CostEstimator() {
  const [pages, setPages] = useState(32);
  const [qty, setQty] = useState(250);
  const [binding, setBinding] = useState<'saddle' | 'perfect'>('saddle');
  const [stockIdx, setStockIdx] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);
  const [targetMargin, setTargetMargin] = useState(55);

  const stock = PAPER_STOCKS[stockIdx];
  const cover = COVER_STOCKS[coverIdx];

  const { marginalPerBook, clicksPerBook, paperCents, validPages } = useMemo(() => {
    let textSheets = 0;
    let valid = true;
    if (binding === 'saddle') {
      valid = pages % 4 === 0 && pages >= 8;
      textSheets = pages / 4;
    } else {
      valid = pages % 2 === 0 && pages >= 48;
      textSheets = pages / 2;
    }
    const coverSheets = 1;
    const clicks = textSheets * 2 + coverSheets * 2;
    const paper = textSheets * stock.centsPerSheet + coverSheets * cover.centsPerSheet;
    const clickCost = clicks * CLICK_RATE * 100;
    return { marginalPerBook: paper + clickCost, clicksPerBook: clicks, paperCents: paper, validPages: valid };
  }, [pages, binding, stock, cover]);

  const priceAtMargin = Math.ceil(marginalPerBook / (1 - targetMargin / 100));
  const totalMarginal = marginalPerBook * qty;

  const margins = [30, 40, 50, 60, 70].map((m) => ({
    pct: m,
    price: Math.ceil(marginalPerBook / (1 - m / 100)),
  }));

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Field label="Page count">
          <input type="number" min={4} step={binding === 'saddle' ? 4 : 2} value={pages}
            onChange={(e) => setPages(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Print quantity">
          <input type="number" min={1} step={25} value={qty}
            onChange={(e) => setQty(Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Binding">
          <select value={binding} onChange={(e) => setBinding(e.target.value as 'saddle' | 'perfect')} style={inputStyle}>
            <option value="saddle">Saddle stitch</option>
            <option value="perfect">Perfect bind</option>
          </select>
        </Field>
        <Field label="Interior stock">
          <select value={stockIdx} onChange={(e) => setStockIdx(Number(e.target.value))} style={inputStyle}>
            {PAPER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Cover stock">
          <select value={coverIdx} onChange={(e) => setCoverIdx(Number(e.target.value))} style={inputStyle}>
            {COVER_STOCKS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
        <Field label={`Target gross margin: ${targetMargin}%`}>
          <input type="range" min={20} max={80} step={5} value={targetMargin}
            onChange={(e) => setTargetMargin(Number(e.target.value))} style={{ width: '100%', marginTop: '.5rem' }} />
        </Field>
      </div>

      {!validPages && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '1rem', color: '#991b1b' }}>
          Invalid page count for {binding === 'saddle' ? 'saddle stitch (must be multiple of 4, min 8)' : 'perfect binding (must be even, min 48)'}
        </div>
      )}

      {validPages && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
            <StatCard label="Clicks / book" value={String(clicksPerBook)} sub={`@ $${CLICK_RATE.toFixed(3)}/click`} />
            <StatCard label="Click cost" value={fmt$(clicksPerBook * CLICK_RATE * 100)} sub="per book" />
            <StatCard label="Paper cost" value={fmt$(paperCents)} sub="per book" />
            <StatCard label="Marginal cost" value={fmt$(marginalPerBook)} sub="per book" accent="#166534" />
            <StatCard label="Total marginal" value={fmt$(totalMarginal)} sub={`${qty.toLocaleString()} books`} accent="#1e3a5f" />
            <StatCard label={`Price at ${targetMargin}% margin`} value={fmt$(priceAtMargin)} sub="suggested retail" accent="#7c3aed" />
          </div>

          <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
            <h4 style={{ margin: '0 0 .75rem' }}>Price at various gross margins</h4>
            <table className="admin-table">
              <thead>
                <tr><th>Margin</th><th>Retail price</th><th>Gross per book</th><th>Gross {qty.toLocaleString()} books</th></tr>
              </thead>
              <tbody>
                {margins.map((m) => (
                  <tr key={m.pct} style={{ fontWeight: m.pct === targetMargin ? 700 : undefined, background: m.pct === targetMargin ? 'var(--bg-alt)' : undefined }}>
                    <td>{m.pct}%</td>
                    <td>{fmt$(m.price)}</td>
                    <td>{fmt$(m.price - marginalPerBook)}</td>
                    <td>{fmt$((m.price - marginalPerBook) * qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '.75rem 0 0', fontSize: '.8rem', color: 'var(--muted)' }}>
              Marginal cost only (clicks + paper). Does not include lease overhead of ~$1,900/mo or labor.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Bleed & Safe Zone Reference ────────────────────────────────────────────

function BleedReference() {
  const [sizeIdx, setSizeIdx] = useState(0);
  const size = COMIC_SIZES[sizeIdx];
  const bleed = 0.125;
  const safe = 0.25;

  const totalW = size.w + bleed * 2;
  const totalH = size.h + bleed * 2;

  const specs = [
    { label: 'Finished trim size', value: `${size.w}" × ${size.h}"` },
    { label: 'Bleed (each edge)', value: `0.125" (⅛")` },
    { label: 'Full bleed document size', value: `${totalW.toFixed(3)}" × ${totalH.toFixed(3)}"` },
    { label: 'Safe zone (text/logos)', value: `0.25" from trim edge` },
    { label: 'Color mode', value: 'CMYK (convert RGB before sending)' },
    { label: 'Resolution', value: '300 dpi minimum at final size' },
    { label: 'Black text', value: 'K100 only (not rich black)' },
    { label: 'Rich black (large fills)', value: 'C:60 M:40 Y:40 K:100' },
    { label: 'PDF standard', value: 'PDF/X-1a or PDF/X-4 preferred' },
    { label: 'Fonts', value: 'Embedded or outlined' },
  ];

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ maxWidth: 340 }}>
        <Field label="Page size">
          <select value={sizeIdx} onChange={(e) => setSizeIdx(Number(e.target.value))} style={inputStyle}>
            {COMIC_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
          <h4 style={{ margin: '0 0 .75rem' }}>Spec sheet</h4>
          <table className="admin-table">
            <tbody>
              {specs.map((s) => (
                <tr key={s.label}>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.label}</td>
                  <td style={{ fontWeight: 600 }}>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin-card" style={{ margin: 0, padding: '1rem 1.25rem' }}>
          <h4 style={{ margin: '0 0 .75rem' }}>Page diagram</h4>
          <BleedDiagram pageW={size.w} pageH={size.h} bleed={bleed} safe={safe} />
        </div>
      </div>
    </div>
  );
}

function BleedDiagram({ pageW, pageH, bleed, safe }: { pageW: number; pageH: number; bleed: number; safe: number }) {
  const scale = 200 / Math.max(pageW + bleed * 2, pageH + bleed * 2);
  const totalW = (pageW + bleed * 2) * scale;
  const totalH = (pageH + bleed * 2) * scale;
  const bleedPx = bleed * scale;
  const safePx = safe * scale;

  return (
    <div style={{ position: 'relative', width: totalW, height: totalH, margin: '0 auto', flexShrink: 0 }}>
      {/* Bleed box */}
      <div style={{ position: 'absolute', inset: 0, background: '#fecdd3', border: '2px solid #e11d48' }} />
      {/* Trim box */}
      <div style={{ position: 'absolute', inset: bleedPx, background: '#dbeafe', border: '2px dashed #2563eb' }} />
      {/* Safe zone */}
      <div style={{ position: 'absolute', inset: bleedPx + safePx, border: '2px dashed #16a34a', background: '#f0fdf4' }} />
      {/* Labels */}
      <div style={{ position: 'absolute', top: 2, left: 2, fontSize: '0.5rem', color: '#e11d48', fontWeight: 700 }}>BLEED</div>
      <div style={{ position: 'absolute', top: bleedPx + 2, left: bleedPx + 2, fontSize: '0.5rem', color: '#2563eb', fontWeight: 700 }}>TRIM</div>
      <div style={{ position: 'absolute', top: bleedPx + safePx + 2, left: bleedPx + safePx + 2, fontSize: '0.5rem', color: '#16a34a', fontWeight: 700 }}>SAFE</div>
    </div>
  );
}

// ─── Shared UI helpers ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '.45rem .75rem',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: '.95rem',
  boxSizing: 'border-box',
  background: 'var(--bg)',
  color: 'var(--ink)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', marginBottom: '.35rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: `1px solid var(--border)`,
      borderLeft: accent ? `4px solid ${accent}` : '1px solid var(--border)',
      borderRadius: 8,
      padding: '.75rem 1rem',
    }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '.15rem', color: accent ?? 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: '.1rem' }}>{sub}</div>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'saddle', label: 'Saddle Stitch', desc: 'Signature planner & cost' },
  { id: 'perfectbind', label: 'Perfect Bind', desc: 'Spine width & cost' },
  { id: 'nup', label: 'N-Up Layout', desc: 'Press sheet planner' },
  { id: 'cost', label: 'Cost Estimator', desc: 'Margin & pricing table' },
  { id: 'bleed', label: 'Bleed & Specs', desc: 'File prep reference' },
];

export function AdminImpose() {
  const [tab, setTab] = useState<Tab>('saddle');

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Imposition &amp; Pre-Press Tools</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.75rem' }}>
        Pre-press calculators for saddle stitch, perfect bind, n-up layout, cost estimation, and file prep specs.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '.6rem 1.1rem',
              border: 'none',
              borderBottom: tab === t.id ? '3px solid var(--brand)' : '3px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? 'var(--brand)' : 'var(--muted)',
              fontSize: '.9rem',
              transition: 'all .15s',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {t.label}
            <div style={{ fontSize: '.7rem', fontWeight: 400, color: 'var(--muted)' }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {tab === 'saddle' && <SaddlePlanner />}
      {tab === 'perfectbind' && <PerfectBindPlanner />}
      {tab === 'nup' && <NUpPlanner />}
      {tab === 'cost' && <CostEstimator />}
      {tab === 'bleed' && <BleedReference />}
    </div>
  );
}
