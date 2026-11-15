import {
  ResourcePage,
  Section,
  Callout,
  Figure,
  CardGrid,
  SpecTable,
  Checklist,
  Steps,
  RelatedLinks,
} from './ResourceLayout';
import { Link } from 'react-router-dom';
import { useSeo } from '../../lib/seo';

/* Printing Comics — File Prep / prepress guide.
 * Graphics are hand-authored inline SVG (no external assets). Palette below. */
const RED = '#C61A22';
const INK = '#1a1a1a';
const MUTED = '#888';
const BLUE = '#1e74fc';
const LIGHT = '#f2f2f4';

const svgStyle = { width: '100%', height: 'auto', display: 'block' } as const;
const codeStyle = { background: LIGHT, padding: '0 .28rem', borderRadius: 3, fontSize: '.9em' } as const;

/* ------------------------------------------------------------------ */
/* Diagram 1 — Bleed, trim & safe area                                 */
/* ------------------------------------------------------------------ */
function BleedDiagram() {
  return (
    <svg
      viewBox="0 0 600 470"
      role="img"
      aria-label="Nested boundaries: bleed on the outside, trim in the middle, safe area inside"
      style={{ ...svgStyle, maxWidth: 600 }}
    >
      {/* bleed zone (outer) */}
      <rect x={90} y={55} width={420} height={350} fill="#fbeaea" stroke={RED} strokeWidth={2} strokeDasharray="7 5" />
      {/* trim (final cut) */}
      <rect x={110} y={75} width={380} height={310} fill="#ffffff" stroke={INK} strokeWidth={2} />
      {/* safe / live area (inner) */}
      <rect x={150} y={115} width={300} height={230} fill="#eef4fd" stroke={BLUE} strokeWidth={2} strokeDasharray="7 5" />

      <text x={90} y={44} fill={RED} fontSize={13} fontWeight={700}>Bleed edge — extend art out to here</text>

      {/* 0.125 in dimension (bleed to trim) */}
      <line x1={250} y1={55} x2={250} y2={75} stroke={RED} strokeWidth={1.5} />
      <line x1={244} y1={55} x2={256} y2={55} stroke={RED} strokeWidth={1.5} />
      <line x1={244} y1={75} x2={256} y2={75} stroke={RED} strokeWidth={1.5} />
      <text x={240} y={70} fill={RED} fontSize={12} textAnchor="end">0.125"</text>

      {/* 0.25 in dimension (trim to safe) */}
      <line x1={350} y1={75} x2={350} y2={115} stroke={BLUE} strokeWidth={1.5} />
      <line x1={344} y1={75} x2={356} y2={75} stroke={BLUE} strokeWidth={1.5} />
      <line x1={344} y1={115} x2={356} y2={115} stroke={BLUE} strokeWidth={1.5} />
      <text x={360} y={100} fill={BLUE} fontSize={12} textAnchor="start">0.25"</text>

      {/* centre labels */}
      <text x={300} y={222} fill={BLUE} fontSize={15} fontWeight={700} textAnchor="middle">Safe / live area</text>
      <text x={300} y={244} fill={INK} fontSize={12} textAnchor="middle">keep text and key art inside</text>
      <text x={300} y={300} fill={MUTED} fontSize={11} textAnchor="middle">backgrounds run to the red edge</text>

      {/* legend */}
      <line x1={92} y1={432} x2={120} y2={432} stroke={RED} strokeWidth={2} strokeDasharray="7 5" />
      <text x={126} y={436} fill={INK} fontSize={12}>Bleed  +0.125"</text>
      <line x1={250} y1={432} x2={278} y2={432} stroke={INK} strokeWidth={2} />
      <text x={284} y={436} fill={INK} fontSize={12}>Trim (cut line)</text>
      <line x1={400} y1={432} x2={428} y2={432} stroke={BLUE} strokeWidth={2} strokeDasharray="7 5" />
      <text x={434} y={436} fill={INK} fontSize={12}>Safe  −0.25"</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Diagram 2 — Resolution: crisp vs pixelated                          */
/* ------------------------------------------------------------------ */
function ResolutionDiagram() {
  // Blocky circle for the "72 ppi" tile — 11 cols x 8 rows.
  const pix = [
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  ];
  const B = 20;
  const X0 = 370;
  const Y0 = 50;
  const cols = 11;
  const rows = 8;

  return (
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="The same circle at 300 ppi looks crisp; at 72 ppi it looks blocky"
      style={{ ...svgStyle, maxWidth: 640 }}
    >
      {/* left — crisp */}
      <rect x={50} y={40} width={230} height={180} rx={6} fill={LIGHT} stroke={INK} strokeWidth={1.5} />
      <circle cx={140} cy={120} r={55} fill="none" stroke={RED} strokeWidth={8} />
      <line x1={98} y1={172} x2={182} y2={70} stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <text x={165} y={250} fill={INK} fontSize={15} fontWeight={700} textAnchor="middle">300 ppi</text>
      <text x={165} y={270} fill={MUTED} fontSize={12} textAnchor="middle">sharp at final print size</text>

      <text x={320} y={126} fill={MUTED} fontSize={16} fontWeight={700} textAnchor="middle">vs</text>

      {/* right — pixelated */}
      <rect x={360} y={40} width={230} height={180} rx={6} fill={LIGHT} stroke={INK} strokeWidth={1.5} />
      {pix.flatMap((row, r) =>
        row.map((v, c) =>
          v ? <rect key={`px-${r}-${c}`} x={X0 + c * B} y={Y0 + r * B} width={B} height={B} fill={RED} /> : null,
        ),
      )}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`gv-${i}`} x1={X0 + i * B} y1={Y0} x2={X0 + i * B} y2={Y0 + rows * B} stroke={MUTED} strokeWidth={0.6} opacity={0.55} />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <line key={`gh-${j}`} x1={X0} y1={Y0 + j * B} x2={X0 + cols * B} y2={Y0 + j * B} stroke={MUTED} strokeWidth={0.6} opacity={0.55} />
      ))}
      <text x={475} y={250} fill={INK} fontSize={15} fontWeight={700} textAnchor="middle">72 ppi</text>
      <text x={475} y={270} fill={MUTED} fontSize={12} textAnchor="middle">blocky and soft on press</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Diagram 3 — RGB in, the Fiery RIP converts; black done right          */
/* ------------------------------------------------------------------ */
function ColorDiagram() {
  const channels = [
    { x: 73, fill: '#e53935', letter: 'R', name: 'Red' },
    { x: 201, fill: '#43a047', letter: 'G', name: 'Green' },
    { x: 329, fill: '#1e74fc', letter: 'B', name: 'Blue' },
  ];

  return (
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="Keep files in sRGB: the Fiery RIP converts to ink with the full gamut of the press. A file converted to CMYK first has been clipped to an offset gamut and prints flat."
      style={{ ...svgStyle, maxWidth: 640 }}
    >
      <text x={320} y={26} fill={INK} fontSize={14} fontWeight={700} textAnchor="middle">Hand us sRGB — the RIP converts to ink with the full press gamut</text>

      {channels.map((k) => (
        <g key={k.letter}>
          <rect x={k.x} y={40} width={110} height={60} rx={6} fill={k.fill} stroke={INK} strokeWidth={1} />
          <text x={k.x + 55} y={70} fill="#ffffff" fontSize={22} fontWeight={800} textAnchor="middle" dominantBaseline="central">
            {k.letter}
          </text>
          <text x={k.x + 55} y={120} fill={MUTED} fontSize={12} textAnchor="middle">{k.name}</text>
        </g>
      ))}
      <rect x={457} y={40} width={110} height={60} rx={6} fill="#ffffff" stroke={INK} strokeWidth={1} strokeDasharray="4 3" />
      <text x={512} y={62} fill={INK} fontSize={12} fontWeight={700} textAnchor="middle">Fiery RIP</text>
      <text x={512} y={80} fill={MUTED} fontSize={11} textAnchor="middle">converts to ink</text>
      <text x={512} y={120} fill={MUTED} fontSize={12} textAnchor="middle">calibrated, once</text>

      <line x1={40} y1={140} x2={600} y2={140} stroke="#e3e3e6" strokeWidth={1} />

      {/* the right way */}
      <text x={40} y={166} fill={INK} fontSize={14} fontWeight={700}>Right: RGB file → RIP → press</text>
      <rect x={48} y={180} width={52} height={34} rx={4} fill="#12e0ff" stroke={INK} strokeWidth={1} />
      <text x={112} y={198} fill={INK} fontSize={20} textAnchor="middle" dominantBaseline="central">→</text>
      <rect x={124} y={180} width={52} height={34} rx={4} fill="#1fc8e3" stroke={INK} strokeWidth={1} />
      <text x={74} y={232} fill={MUTED} fontSize={10} textAnchor="middle">your sRGB</text>
      <text x={150} y={232} fill={MUTED} fontSize={10} textAnchor="middle">on paper</text>
      <text x={48} y={262} fill={INK} fontSize={12}>Converted once, with our profiles,</text>
      <text x={48} y={278} fill={INK} fontSize={12}>using the full gamut of the press.</text>

      <line x1={326} y1={162} x2={326} y2={300} stroke="#e3e3e6" strokeWidth={1} />

      {/* the wrong way */}
      <text x={340} y={166} fill={RED} fontSize={14} fontWeight={700}>Wrong: converted to CMYK first</text>
      <rect x={344} y={180} width={44} height={34} rx={4} fill="#12e0ff" stroke={INK} strokeWidth={1} />
      <text x={398} y={198} fill={INK} fontSize={16} textAnchor="middle" dominantBaseline="central">→</text>
      <rect x={408} y={180} width={44} height={34} rx={4} fill="#3fb0bf" stroke={INK} strokeWidth={1} />
      <text x={462} y={198} fill={INK} fontSize={16} textAnchor="middle" dominantBaseline="central">→</text>
      <rect x={472} y={180} width={44} height={34} rx={4} fill="#6f9ea5" stroke={INK} strokeWidth={1} />
      <text x={366} y={232} fill={MUTED} fontSize={10} textAnchor="middle">your sRGB</text>
      <text x={430} y={232} fill={MUTED} fontSize={10} textAnchor="middle">your CMYK</text>
      <text x={494} y={232} fill={MUTED} fontSize={10} textAnchor="middle">RIP again</text>
      <text x={340} y={262} fill={INK} fontSize={12}>Clipped to an offset gamut: flat and dull.</text>
      <text x={340} y={278} fill={INK} fontSize={12}>Our upload refuses CMYK files.</text>

      <text x={320} y={326} fill={RED} fontSize={12.5} fontWeight={700} textAnchor="middle">
        Black: plain R0 G0 B0 for text and lines — the RIP builds the rich black for solids.
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Diagram 4 — Cover spread: back | spine | front                      */
/* ------------------------------------------------------------------ */
function CoverSpreadDiagram() {
  return (
    <svg
      viewBox="0 0 700 400"
      role="img"
      aria-label="A perfect-bound cover laid out as one back, spine and front spread with bleed all around"
      style={{ ...svgStyle, maxWidth: 700 }}
    >
      {/* bleed around the whole spread */}
      <rect x={50} y={70} width={600} height={250} fill="#fbeaea" stroke={RED} strokeWidth={2} strokeDasharray="7 5" />
      {/* trim spread */}
      <rect x={70} y={90} width={560} height={210} fill="#ffffff" stroke={INK} strokeWidth={2} />
      {/* spine strip */}
      <rect x={328} y={90} width={44} height={210} fill="#eef4fd" />
      {/* fold lines */}
      <line x1={328} y1={90} x2={328} y2={300} stroke={BLUE} strokeWidth={1.5} strokeDasharray="6 4" />
      <line x1={372} y1={90} x2={372} y2={300} stroke={BLUE} strokeWidth={1.5} strokeDasharray="6 4" />

      <text x={50} y={58} fill={RED} fontSize={13} fontWeight={700}>0.125" bleed around the whole spread</text>
      <text x={328} y={84} fill={BLUE} fontSize={11} textAnchor="middle">fold</text>
      <text x={372} y={84} fill={BLUE} fontSize={11} textAnchor="middle">fold</text>

      <text x={199} y={200} fill={INK} fontSize={16} fontWeight={700} textAnchor="middle" dominantBaseline="central">BACK COVER</text>
      <text x={501} y={200} fill={INK} fontSize={16} fontWeight={700} textAnchor="middle" dominantBaseline="central">FRONT COVER</text>
      <text x={350} y={200} fill={BLUE} fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="central" transform="rotate(-90 350 200)">SPINE</text>

      <text x={350} y={330} fill={INK} fontSize={12} textAnchor="middle">Spine width = page count + paper weight</text>
      <text x={350} y={348} fill={MUTED} fontSize={11} textAnchor="middle">ask us for your exact width / template</text>
      <text x={350} y={378} fill={RED} fontSize={12.5} fontWeight={700} textAnchor="middle">Submit as ONE PDF — back • spine • front</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Diagram 5 — Binding: saddle stitch vs perfect bind                  */
/* ------------------------------------------------------------------ */
function BindingDiagram() {
  return (
    <svg
      viewBox="0 0 700 340"
      role="img"
      aria-label="Saddle-stitch signatures are folded and stapled; perfect binding glues single sheets into a flat spine"
      style={{ ...svgStyle, maxWidth: 700 }}
    >
      <line x1={350} y1={30} x2={350} y2={300} stroke="#e3e3e6" strokeWidth={1} />
      <text x={175} y={40} fill={INK} fontSize={14} fontWeight={700} textAnchor="middle">SADDLE STITCH</text>
      <text x={525} y={40} fill={INK} fontSize={14} fontWeight={700} textAnchor="middle">PERFECT BIND</text>

      {/* saddle: open, nested, stapled at the fold */}
      <polygon points="80,150 175,120 175,175 80,205" fill={LIGHT} stroke={INK} strokeWidth={2} />
      <polygon points="175,120 270,150 270,205 175,175" fill="#eef4fd" stroke={INK} strokeWidth={2} />
      <line x1={175} y1={120} x2={175} y2={175} stroke={INK} strokeWidth={2.5} />
      <line x1={92} y1={152} x2={168} y2={125} stroke={MUTED} strokeWidth={1} opacity={0.75} />
      <line x1={104} y1={157} x2={166} y2={132} stroke={MUTED} strokeWidth={1} opacity={0.75} />
      <line x1={258} y1={152} x2={182} y2={125} stroke={MUTED} strokeWidth={1} opacity={0.75} />
      <line x1={246} y1={157} x2={184} y2={132} stroke={MUTED} strokeWidth={1} opacity={0.75} />
      <rect x={170} y={133} width={10} height={4} rx={1} fill={INK} />
      <rect x={170} y={158} width={10} height={4} rx={1} fill={INK} />
      <text x={175} y={112} fill={MUTED} fontSize={11} textAnchor="middle">staples at the fold</text>

      <text x={175} y={252} fill={INK} fontSize={13} fontWeight={700} textAnchor="middle">Fold and staple at the spine</text>
      <text x={175} y={274} fill={MUTED} fontSize={12} textAnchor="middle">sheets nested and folded together</text>
      <text x={175} y={300} fill={RED} fontSize={14} fontWeight={800} textAnchor="middle">Pages in multiples of 4</text>

      {/* perfect: single sheets glued into a flat spine */}
      <line x1={430} y1={120} x2={640} y2={120} stroke={INK} strokeWidth={2.5} />
      <line x1={430} y1={240} x2={640} y2={240} stroke={INK} strokeWidth={2.5} />
      <rect x={430} y={120} width={18} height={120} fill={RED} />
      {Array.from({ length: 14 }, (_, i) => (
        <line key={`sheet-${i}`} x1={448} y1={126 + i * 8} x2={635} y2={126 + i * 8} stroke={INK} strokeWidth={1} opacity={0.7} />
      ))}
      <text x={439} y={112} fill={MUTED} fontSize={11} textAnchor="middle">glue</text>

      <text x={525} y={252} fill={INK} fontSize={13} fontWeight={700} textAnchor="middle">Single sheets glued at a flat spine</text>
      <text x={525} y={274} fill={MUTED} fontSize={12} textAnchor="middle">stacked, not folded</text>
      <text x={525} y={300} fill={RED} fontSize={14} fontWeight={800} textAnchor="middle">Pages in multiples of 2</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export function FilePrep() {
  useSeo({ title: 'File Prep — How to Set Up Your Comic Book Print Files', description: 'Bleed, trim, safe area, resolution, color and PDF export settings for printing comic books and graphic novels.' });
  const appTips = [
    {
      name: 'Photoshop',
      body: 'Set the canvas to your with-bleed size at 300 ppi in RGB Color (sRGB). Flatten Image, then Save As ▸ Photoshop PDF with the PDF/X-3 preset — no CMYK conversion.',
    },
    {
      name: 'Illustrator',
      body: 'Set a 0.125 in bleed in Document Setup and keep File ▸ Document Color Mode ▸ RGB. Outline or embed fonts, then Save As PDF using the PDF/X-3 preset with Use Document Bleed Settings on.',
    },
    {
      name: 'InDesign',
      body: 'Start the document with a 0.125 in bleed and RGB images. File ▸ Export ▸ Adobe PDF (Print), choose [PDF/X-3:2002], set Color Conversion to No Color Conversion, and enable Use Document Bleed under Marks and Bleeds.',
    },
    {
      name: 'Clip Studio Paint',
      body: 'Turn on the bleed/crop guides and work at 300–600 ppi. File ▸ Export ▸ .pdf with layers merged. CSP exports RGB, which is exactly what we want — do not convert to CMYK.',
    },
    {
      name: 'Procreate',
      body: 'Create the canvas at your with-bleed size and 300 ppi up front — resolution cannot be added later. Share ▸ PDF (flattened). Procreate is RGB only, which is exactly what we want.',
    },
    {
      name: 'Affinity (Photo / Designer / Publisher)',
      body: 'Set the document to RGB/8 (sRGB) with a 0.125 in bleed. File ▸ Export ▸ PDF ▸ PDF/X-3, enable Bleed, leave the color space as RGB, and embed fonts or convert text to curves.',
    },
  ];

  return (
    <ResourcePage
      eyebrow="File Prep"
      title="File preparation and prepress guide"
      intro="Everything you need to hand off files that print exactly the way you drew them — bleed and safe area, resolution, RGB color (yes, RGB), covers and spine, binding math, and a clean flattened PDF export."
    >
      <Callout kind="info" title="Start here">
        New to print? Pair this guide with our{' '}
        <Link to="/resources/templates">pre-sized templates</Link> and the{' '}
        <Link to="/resources/make-a-comic">Make a Comic guide</Link>. The templates already carry trim, bleed and
        safe guides for every format, so most of the setup below is handled for you.
      </Callout>

      {/* 1 --------------------------------------------------------------- */}
      <Section id="quick-start" title="Quick-start checklist">
        <p>
          A print-ready file is one we can send straight to the press with no surprises. If you can tick every box
          below, you are ready to upload.
        </p>
        <Checklist
          items={[
            'Build your document at the exact trim size for your chosen format, plus 0.125 in bleed on all four sides.',
            'Extend backgrounds and full-bleed art out to the bleed edge; keep text and key art at least 0.25 in inside the trim.',
            'Work at 300 ppi for color/greyscale, or 600–1200 ppi for bitmap line art, at final print size.',
            'Keep everything in RGB (sRGB, 8-bit) — do not convert to CMYK, and no spot colors. Our Fiery RIP converts from RGB and uses the full gamut of the press.',
            'Use plain black (R0 G0 B0) for small text and fine lines; the RIP builds the rich black for large solids.',
            'Embed every font, or outline/flatten type before export.',
            'Flatten transparency, layers and blend modes; never set white to overprint.',
            'Export one flattened PDF for the interior and one for the cover. The PDF/X-3 preset (PDF 1.3/1.4, RGB allowed) is the target; no live transparency or masks.',
            'Match the page count to your binding: multiples of 4 for saddle stitch, multiples of 2 for perfect/glue bind.',
            'Name files clearly (e.g. MyComic_interior.pdf, MyComic_cover.pdf) and double-check the page order.',
          ]}
        />
        <Callout kind="tip">
          Working from one of our templates? Trim, bleed and safe guides are already in place — you can skip straight
          to color and export.
        </Callout>
      </Section>

      {/* 2 --------------------------------------------------------------- */}
      <Section id="bleed-trim-safe" title="Bleed, trim and safe area">
        <p>
          Three nested boundaries govern every page. <strong>Bleed</strong> is extra art beyond the cut,{' '}
          <strong>trim</strong> is where the blade actually falls, and the <strong>safe area</strong> is where your
          important content has to stay. Presses and guillotines move by a hair from sheet to sheet, so the bleed
          absorbs the wiggle and the safe margin keeps nothing critical near the edge.
        </p>
        <Figure caption="Bleed (red, outer) extends 0.125 in past the trim (black). Keep text and key art inside the safe area (blue), 0.25 in in from the trim.">
          <BleedDiagram />
        </Figure>
        <SpecTable
          headers={['Zone', 'What it is', 'Your rule']}
          rows={[
            ['Bleed', 'The 0.125 in band beyond the trim that gets cut away', 'Run backgrounds and full-bleed art all the way to the bleed edge'],
            ['Trim', 'The final cut line — the actual size of the finished page', 'Design at the exact trim size for your chosen format'],
            ['Safe / live area', 'The region 0.25 in inside the trim', 'Keep text, logos, page numbers and key art inside it'],
          ]}
        />
        <Callout kind="warn" title="No bleed = white slivers">
          If your background stops exactly at the trim, the tiniest cutting shift leaves a thin white line down the
          edge. Always push full-bleed art the full 0.125 in past the trim.
        </Callout>
      </Section>

      {/* 3 --------------------------------------------------------------- */}
      <Section id="page-size" title="Page size and document setup">
        <p>
          Set your document size to the <strong>with-bleed</strong> dimensions below — that is the trim size plus
          0.125 in on every side, which adds 0.25 in to each dimension overall. Then place your trim and safe guides
          inside it and build at the final print size. Don&apos;t design small and scale up later.
        </p>
        <SpecTable
          headers={['Format', 'Trim size', 'Document size (with bleed)', 'Typical use']}
          rows={[
            ['A5', '5.8 × 8.3 in', '6.05 × 8.55 in', 'Manga-style volumes, digests, zines, novellas'],
            ['Standard US comic', '6.625 × 10.25 in', '6.875 × 10.5 in', 'Single issues, floppies, mini-series'],
            ['Magazine', '8 × 10.5 in', '8.25 × 10.75 in', 'Art books, anthologies, prozines'],
            ['US Letter', '8.5 × 11 in', '8.75 × 11.25 in', 'Ashcans, scripts, coloring and activity books'],
            ['Art Print', '11 × 17 in', '11.25 × 17.25 in', 'Posters, pin-ups, fold-out covers'],
          ]}
        />
        <Callout kind="tip">
          Skip the math — our <Link to="/resources/templates">templates</Link> come pre-sized with trim, bleed and
          safe guides for every format we print.
        </Callout>
      </Section>

      {/* 4 --------------------------------------------------------------- */}
      <Section id="resolution" title="Resolution and image quality">
        <p>
          Resolution is always measured <em>at final print size</em>. A 2000-pixel-wide image is gorgeous at 6 in
          (≈333 ppi) and mushy at 20 in (100 ppi) — same file, different result. The rule of thumb:{' '}
          <code style={codeStyle}>effective ppi = pixels ÷ print inches</code>. Scan and paint big; you can always
          throw pixels away, but you can never invent detail that was never captured.
        </p>
        <Figure caption="Same circle, two resolutions. At 300 ppi the edge is smooth; at 72 ppi you can see the pixels — and so can the press.">
          <ResolutionDiagram />
        </Figure>
        <SpecTable
          headers={['Artwork type', 'Resolution (at final size)', 'Notes']}
          rows={[
            ['Color and greyscale art', '300 ppi', 'Photos, painted pages, screentoned pages'],
            ['Bitmap / 1-bit line art', '600–1200 ppi', 'Pure black-and-white inks; no anti-aliasing'],
            ['Scanned inks (greyscale)', '600 ppi', 'Scan high, then reduce — never the reverse'],
            ['Screentones', '600–1200 ppi', 'Keep at final size to avoid moiré patterns'],
          ]}
        />
        <Callout kind="warn" title="72 ppi is a screen resolution, not a print one">
          Pulling images off the web, or exporting at 72 ppi and scaling up, will not add detail — the art just prints
          soft and blocky. Start at 300 ppi (or higher for line art) at final size.
        </Callout>
      </Section>

      {/* 5 --------------------------------------------------------------- */}
      <Section id="color" title="Color for print — stay in RGB">
        <p>
          Our presses run behind a <strong>Fiery RIP</strong> that converts color to ink with profiles calibrated
          to our paper and machines, and it renders RGB with the <strong>full gamut of the press</strong>. Converting
          to CMYK yourself does the opposite: it clips your colors to an offset-press gamut (SWOP or similar) before
          we ever see them, and the RIP then faithfully prints that smaller, duller range. So: build and export in{' '}
          <strong>sRGB</strong>, and <strong>do not convert to CMYK</strong>. Our upload checks for it and refuses
          CMYK and spot-color files.
        </p>
        <Figure caption="Keep the file in sRGB and let the RIP convert to ink with the full gamut of the press. A file converted to CMYK first has already been clipped to an offset gamut, and prints flat.">
          <ColorDiagram />
        </Figure>
        <Checklist
          items={[
            'Document and images in RGB — sRGB, 8 bits per channel, with the profile embedded. Grayscale is fine for black-and-white interiors.',
            'No CMYK images, no CMYK fills, no spot (Pantone / Separation) colors.',
            'Use plain black (R0 G0 B0) for text and fine lines so they stay crisp; the RIP builds a rich black for large solids on its own.',
            'Ink still cannot match the most electric screen neons. Work in a print-aware palette and soft-proof if your app can, but leave the file in RGB.',
          ]}
        />
        <Callout kind="tip" title="Soft-proof, don’t convert">
          Previewing the ink gamut on screen (Photoshop: View ▸ Proof Setup) is useful; converting the file is not.
          Adjust the colors you don&apos;t like, then export the RGB file as it is. If you use Acrobat to convert
          an existing PDF to PDF/X-3, check the result: Acrobat&apos;s conversion can turn RGB into CMYK on the way.
        </Callout>
      </Section>

      {/* 6 --------------------------------------------------------------- */}
      <Section id="covers-spine" title="Covers and spine">
        <p>
          Submit your cover as <strong>one single PDF</strong> laid out as a back–spine–front spread, reading left to
          right, with 0.125 in of bleed around the <em>whole spread</em> — not around each panel. A spine only exists
          on <strong>perfect-bound</strong> (glue-bound) books; a saddle-stitched cover is just a back-to-front wrap
          with the fold at the spine and nothing to print on it.
        </p>
        <Figure caption="One flattened cover spread: back on the left, spine in the middle, front on the right, with a single bleed around the outside and fold lines at the spine.">
          <CoverSpreadDiagram />
        </Figure>
        <p>
          Because spine width depends on your exact page count and paper weight, don&apos;t guess it. Ask us to{' '}
          <Link to="/resources/templates">send a cover template sized to your book</Link>, or{' '}
          <Link to="/contact">get in touch</Link> and we will give you the exact spine width and overall spread
          dimensions before you build the cover.
        </p>
        <Callout kind="info" title="No spine on saddle stitch">
          Saddle-stitched covers have no flat spine — the fold is the spine. Keep any wrap-around art clear of the
          fold, and leave spine text and barcodes for perfect-bound books only.
        </Callout>
      </Section>

      {/* 7 --------------------------------------------------------------- */}
      <Section id="page-count-binding" title="Page count and binding">
        <p>
          Count <strong>every</strong> page — including blanks and full-art spreads — because the total has to fit your
          binding method. Get this right before you export; a page total that doesn&apos;t match the binding is one of
          the most common reasons a file gets held.
        </p>
        <Figure caption="Saddle stitch folds and staples nested sheets at the spine (pages in multiples of 4). Perfect binding glues single sheets into a flat spine (pages in multiples of 2).">
          <BindingDiagram />
        </Figure>
        <p>
          <strong>Saddle stitch</strong> nests folded sheets and staples them at the spine, so the interior must be a{' '}
          <strong>multiple of 4</strong> (8, 12, 16 … typically up to roughly 48–64 pages depending on paper).{' '}
          <strong>Perfect / glue bind</strong> stacks single sheets and glues them into a flat spine, so the interior
          must be a <strong>multiple of 2</strong> (usually 32+ pages to build a spine worth printing on). If your
          total doesn&apos;t land on the right multiple, add blank pages or adjust the layout until it does.
        </p>
        <Callout kind="note" title="Covers are separate">
          The cover isn&apos;t part of the interior page count — send the interior as its own file and the cover as
          its own file. Not sure how your count maps to a binding? Ask us before you export.
        </Callout>
      </Section>

      {/* 8 --------------------------------------------------------------- */}
      <Section id="fonts-flatten" title="Fonts, transparency and flattening">
        <p>
          Anything that renders differently on our equipment than on your screen is a risk — missing fonts, live
          transparency and stray overprint are the usual culprits. Lock them all down before export.
        </p>
        <Checklist
          items={[
            'Embed all fonts in the PDF, or outline/flatten type before export — and keep an editable copy first, because outlined text can no longer be re-typed.',
            'Flatten transparency, layers and blend modes so drop shadows, glows and multiply effects don’t re-render differently on our RIP.',
            'Rasterize or flatten live effects (Illustrator effects, layer styles, smart filters) at full resolution.',
            'Never set white to overprint, and avoid accidental overprint on other colors too.',
          ]}
        />
        <Callout kind="warn" title="Overprinting white is the silent killer">
          On screen a white object set to &ldquo;overprint&rdquo; looks perfect; on press it disappears and whatever
          sits beneath it shows through. Flattening the file and turning off overprint for white prevents it.
        </Callout>
      </Section>

      {/* 8b -------------------------------------------------------------- */}
      <Section id="flat" title="Flat files: no transparency, no masks">
        <p>
          A print file has to be <strong>plain painted content</strong>: images, vectors and text drawn directly on
          each page. Nothing wrapped in a mask, nothing left for the press to composite. Files exported the way a
          screen flipbook or a web viewer builds pages — every page a transparency group with a low-resolution soft
          mask over it, plus a clipping group and the art underneath — cannot be imposed, proofed or ripped reliably.
          They open fine in one viewer and come up blank in another, and the mask turns pages solid white on press.
        </p>
        <p>These are hard rules. Our upload reads the inside of every PDF and refuses a file that breaks any of them, and the <Link to="/resources/file-check">File Checker</Link> runs the same checks before you order.</p>
        <SpecTable
          headers={['Rule', 'What we look for', 'How to meet it']}
          rows={[
            [<strong>No live transparency</strong>, 'Soft masks, transparency groups, blend modes other than Normal, opacity below 100%.', 'Flatten before export. PDF/X-1a:2003 forbids transparency by definition, which is the point.'],
            [<strong>No masks over the art</strong>, 'Luminosity or alpha soft masks, stencil-masked images, image /Mask entries.', 'Composite transparent PNGs onto their background before placing them; never place art with its alpha channel.'],
            [<strong>Pages drawn directly</strong>, 'Each page nested inside a single form with a clip rectangle.', 'Draw page content on the page. The page size already keeps the art in place; a clip path is not needed.'],
            [<strong>Images at print resolution</strong>, 'Any raster under 250 ppi at its placed size.', '300 ppi effective at placed size. A 72–150 ppi image is a screen asset and must never go into a print file, not even as a mask.'],
            [<strong>Flat 8-bit RGB images</strong>, '16-bit images, JPEG 2000 (JPX), JBIG2, CMYK or spot color.', 'sRGB (or grayscale), 8 bits per channel, profile embedded, ordinary JPEG or ZIP compression. No CMYK: the RIP converts from RGB.'],
            [<strong>Fonts embedded</strong>, 'Any font that is not embedded.', 'Embed and subset every font, or convert text to outlines.'],
            [<strong>Page geometry</strong>, 'Pages that are not the trim plus bleed, spreads, sideways pages, crop marks inside the art.', 'One page per PDF page at trim size plus 0.125″ bleed; TrimBox and BleedBox set if your app offers them.'],
            [<strong>PDF 1.4 or lower</strong>, 'A PDF version above 1.4.', 'Export with the PDF/X-3 preset (PDF 1.3/1.4, RGB allowed). Newer versions allow live transparency.'],
            [<strong>Every page renders</strong>, 'A page that draws an image or form the file does not contain.', 'Re-export from the original document. Splitting or merging PDFs can drop the resources pages depend on.'],
          ]}
        />
        <h3 style={{ fontSize: '1.1rem', margin: '1.5rem 0 .5rem' }}>How to flatten before export</h3>
        <Steps
          items={[
            { title: 'Simplest, and right for comic interiors: rasterize each page', body: 'Export every page as a flat 300 ppi sRGB image with the background filled, then place one image per page as the page\u2019s only content and export the PDF. Nothing can be left live.' },
            { title: 'Keeping vectors: use the PDF/X-3 preset', body: 'In InDesign, Affinity Publisher, Illustrator or Scribus, export with the PDF/X-3 preset (not X-1a, which forces CMYK), no color conversion, and transparency flattening at high resolution. Photoshop and Clip Studio: flatten the image first, then save as PDF with no layers.' },
            { title: 'Already have a PDF with transparency? Flatten it', body: 'Acrobat: Print Production → Flattener Preview, or Save As PDF/X-3. Ghostscript: gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.3 -dPDFSETTINGS=/prepress -o flat.pdf in.pdf. Then run the result through the File Checker.' },
            { title: 'Verify', body: 'Open the exported PDF in a second viewer (Acrobat, Chrome, Affinity) and confirm every page shows its art with no Mask layers and no blank pages, then drop it on the File Checker.' },
          ]}
        />
        <Callout kind="info" title="Check it before you order">
          The <Link to="/resources/file-check">File Checker</Link> reads your PDF and shows a green tick or a red cross
          for every rule on this page, with what to fix. Your file is deleted the moment the check finishes.
        </Callout>
      </Section>

      {/* 9 --------------------------------------------------------------- */}
      <Section id="export-pdf" title="Exporting your PDF">
        <p>
          The finish line is a single flattened, high-resolution PDF in RGB — the <strong>PDF/X-3</strong> preset is the target. Work through these six steps in order, then submit one PDF for the
          interior and one for the cover.
        </p>
        <Steps
          items={[
            {
              title: 'Set the document to trim + bleed',
              body: 'Build the canvas at the exact trim size for your format, then add 0.125 in of bleed on all four sides. Pull background art out to the bleed; keep text 0.25 in inside the trim.',
            },
            {
              title: 'Keep it in RGB',
              body: 'Leave the document and every image in sRGB, 8-bit, profile embedded. Do not convert to CMYK — that clips your colors to an offset gamut; our Fiery RIP converts from RGB with the full gamut of the press. Plain black (R0 G0 B0) for text and lines.',
            },
            {
              title: 'Embed or outline fonts',
              body: 'Embed every font, or convert type to outlines/curves. Keep an editable copy first, since outlined text can no longer be edited as text.',
            },
            {
              title: 'Flatten',
              body: 'Flatten transparency, layers, masks and blend modes so every page is plain painted content (see Flat files above), and make sure white is never set to overprint.',
            },
            {
              title: 'Export the PDF',
              body: 'Export a single flattened, high-resolution PDF using the PDF/X-3 preset (PDF 1.3/1.4, RGB allowed, no color conversion) — one file for the interior, one for the cover. Our upload refuses files with live transparency, masks, CMYK color or a PDF version above 1.4.',
            },
            {
              title: 'Verify',
              body: 'Reopen the exported PDF and check the page size, the page count and order, that colors look right and fonts render, and that nothing got clipped or shifted.',
            },
          ]}
        />
        <h3 style={{ fontSize: '1.1rem', margin: '1.75rem 0 .5rem' }}>Quick export tips by app</h3>
        <CardGrid min={260}>
          {appTips.map((app) => (
            <div
              key={app.name}
              style={{
                background: '#fff',
                border: '1px solid #e3e3e6',
                borderRadius: 10,
                padding: '0.95rem 1.05rem',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '.35rem', color: INK }}>{app.name}</div>
              <div style={{ fontSize: '.88rem', lineHeight: 1.5, color: '#444' }}>{app.body}</div>
            </div>
          ))}
        </CardGrid>
        <Callout kind="info" title="Not sure your export is right?">
          <Link to="/sample-pack">Order a sample pack</Link> to see our paper and print quality in hand, or{' '}
          <Link to="/contact">send us a test PDF</Link> and we will check it over before you commit to a full run.
        </Callout>
      </Section>

      {/* 10 -------------------------------------------------------------- */}
      <Section id="before-upload" title="Before you upload">
        <p>One last pass. Run this final check against your interior and cover files:</p>
        <Checklist
          items={[
            'Interior: one flattened, high-resolution PDF (or JPG), sized to your chosen format with 0.125 in bleed.',
            'Cover: one flattened PDF as a single back–spine–front spread, with the spine width confirmed with us for perfect binding.',
            'Color is RGB throughout (no CMYK, no spot colors); fonts are embedded or outlined; transparency and masks are flattened; no white overprint.',
            'Page count matches the binding (×4 for saddle stitch, ×2 for perfect bind) and pages are in the correct order.',
            'Files are clearly named (interior vs cover) and match the format and options you selected at checkout.',
          ]}
        />
        <Callout kind="warn" title="What triggers a prepress hold">
          At checkout you confirm that your files are correctly sized to the selected format, are flattened
          high-resolution PDFs or JPGs, are labeled accurately, and meet the required page-count multiples (4 for
          saddle stitch, 2 for glue bind). We review <strong>every</strong> file by hand in prepress. If everything
          checks out you won&apos;t hear from us until your proof is ready to approve — no news is good news. If
          something is off (wrong size, low resolution, RGB color, an off-count page total, or an un-flattened cover),
          we email you a link to upload corrected files before production can begin.
        </Callout>
      </Section>

      <RelatedLinks
        links={[
          { to: '/resources/templates', label: 'Download templates' },
          { to: '/resources/make-a-comic', label: 'Make a Comic guide' },
          { to: '/sample-pack', label: 'Order a sample pack' },
          { to: '/contact', label: 'Ask a question' },
        ]}
      />
    </ResourcePage>
  );
}
