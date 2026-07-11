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

/* ------------------------------------------------------------------ */
/*  Palette (kept in sync with the brand + ResourceLayout accents)     */
/* ------------------------------------------------------------------ */
const RED = '#C61A22';
const INK = '#1a1a1a';
const MUTED = '#888';
const BLUE = '#1e74fc';
const LIGHT = '#f2f2f4';
const BORDER = '#e3e3e6';

const SVG_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/* ================================================================== */
/*  Diagram 1 — the ten-stage pipeline                                 */
/* ================================================================== */
function PipelineDiagram() {
  const stages = [
    'Idea',
    'Script',
    'Thumbnails',
    'Layouts',
    'Pencils',
    'Inks',
    'Colors',
    'Letters',
    'Prepress',
    'Print',
  ];
  const x0 = 8;
  const step = 90;
  const bw = 96;
  const notch = 16;
  const y = 40;
  const h = 58;
  const width = x0 + (stages.length - 1) * step + bw + 8;

  const groups = [
    { a: 0, b: 1, label: 'Develop' },
    { a: 2, b: 3, label: 'Plan' },
    { a: 4, b: 7, label: 'Make the art' },
    { a: 8, b: 9, label: 'Produce' },
  ];

  return (
    <svg
      viewBox={`0 0 ${width} 148`}
      role="img"
      aria-label="The comic-making pipeline: idea, script, thumbnails, layouts, pencils, inks, colors, letters, prepress, print"
      style={{ width: '100%', maxWidth: 900, height: 'auto', fontFamily: SVG_FONT }}
    >
      {stages.map((label, i) => {
        const x = x0 + i * step;
        const fill = i % 2 === 0 ? RED : INK;
        const d =
          i === 0
            ? `M ${x},${y} L ${x + bw - notch},${y} L ${x + bw},${y + h / 2} L ${x + bw - notch},${y + h} L ${x},${y + h} Z`
            : `M ${x},${y} L ${x + bw - notch},${y} L ${x + bw},${y + h / 2} L ${x + bw - notch},${y + h} L ${x},${y + h} L ${x + notch},${y + h / 2} Z`;
        return (
          <g key={label}>
            <path d={d} fill={fill} />
            <text
              x={x + bw / 2 + (i === 0 ? 0 : notch / 2)}
              y={y + h / 2 + 4}
              textAnchor="middle"
              fill="#fff"
              fontSize={13}
              fontWeight={600}
            >
              {label}
            </text>
          </g>
        );
      })}

      {groups.map((g) => {
        const start = x0 + g.a * step;
        const end = x0 + g.b * step + bw;
        const cx = (start + end) / 2;
        return (
          <g key={g.label}>
            <path
              d={`M ${start + 4},${y + h + 8} L ${start + 4},${y + h + 13} L ${end - 4},${y + h + 13} L ${end - 4},${y + h + 8}`}
              fill="none"
              stroke={MUTED}
              strokeWidth={1.5}
            />
            <text x={cx} y={y + h + 30} textAnchor="middle" fill={MUTED} fontSize={12} fontWeight={700}>
              {g.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 2 — page layout, gutters & reading path                    */
/* ================================================================== */
function PageLayoutDiagram() {
  const panels = [
    { x: 50, y: 44, w: 108, h: 118 },
    { x: 170, y: 44, w: 108, h: 118 },
    { x: 50, y: 174, w: 228, h: 92 },
    { x: 50, y: 278, w: 68, h: 156 },
    { x: 130, y: 278, w: 68, h: 156 },
    { x: 210, y: 278, w: 68, h: 156 },
  ];
  const badges = [
    { n: 1, x: 62, y: 58 },
    { n: 2, x: 182, y: 58 },
    { n: 3, x: 62, y: 190 },
    { n: 4, x: 60, y: 292 },
    { n: 5, x: 140, y: 292 },
    { n: 6, x: 222, y: 292 },
  ];

  return (
    <svg
      viewBox="0 0 470 470"
      role="img"
      aria-label="A comic page split into six panels with a numbered left-to-right reading path"
      style={{ width: '100%', maxWidth: 440, height: 'auto', fontFamily: SVG_FONT }}
    >
      <defs>
        <marker id="rp-arrow" markerWidth={10} markerHeight={10} refX={7} refY={5} orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L9,5 L1,9 Z" fill={BLUE} />
        </marker>
      </defs>

      {/* page / trim */}
      <rect x={30} y={24} width={268} height={430} rx={6} fill="#fff" stroke={INK} strokeWidth={2.5} />
      {/* safe margin */}
      <rect x={44} y={38} width={240} height={402} rx={3} fill="none" stroke={BLUE} strokeWidth={1.5} strokeDasharray="6 5" />

      {/* panels */}
      {panels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill={LIGHT} stroke={INK} strokeWidth={2} />
      ))}

      {/* reading path */}
      <polyline
        points="104,103 224,103 164,220 84,356 164,356 244,356"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.5}
        strokeDasharray="7 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#rp-arrow)"
      />

      {/* numbered badges */}
      {badges.map((b) => (
        <g key={b.n}>
          <circle cx={b.x} cy={b.y} r={11} fill={RED} />
          <text x={b.x} y={b.y + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
            {b.n}
          </text>
        </g>
      ))}

      {/* callout leaders + labels */}
      <g stroke={MUTED} strokeWidth={1.5} fill="none">
        <polyline points="164,44 164,30 300,30" />
        <line x1={284} y1={124} x2={304} y2={124} />
        <line x1={278} y1={220} x2={304} y2={220} />
        <line x1={298} y1={440} x2={314} y2={440} />
      </g>
      <g fontFamily={SVG_FONT} fontSize={12} fill={INK}>
        <text x={304} y={34}>Gutter</text>
        <text x={307} y={128}>Safe margin</text>
        <text x={307} y={224}>Panel</text>
        <text x={317} y={444}>Trim edge</text>
        <line x1={306} y1={300} x2={340} y2={300} stroke={BLUE} strokeWidth={2.5} strokeDasharray="7 5" />
        <text x={344} y={304} fill={BLUE} fontWeight={700}>1 &#8594; 6 reading path</text>
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 3 — balloon placement across two panels                    */
/* ================================================================== */
function BalloonPlacementDiagram() {
  const heads = [
    { cx: 80, base: 232 },
    { cx: 255, base: 236 },
    { cx: 390, base: 236 },
    { cx: 560, base: 236 },
  ];
  const badges = [
    { n: 1, x: 92, y: 52 },
    { n: 2, x: 178, y: 138 },
    { n: 3, x: 378, y: 38 },
    { n: 4, x: 489, y: 124 },
  ];

  return (
    <svg
      viewBox="0 0 640 310"
      role="img"
      aria-label="Two comic panels showing speech balloons, tails pointing at speakers, and a top-to-bottom left-to-right reading path"
      style={{ width: '100%', maxWidth: 640, height: 'auto', fontFamily: SVG_FONT }}
    >
      <defs>
        <marker id="bl-arrow" markerWidth={10} markerHeight={10} refX={7} refY={5} orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L9,5 L1,9 Z" fill={BLUE} />
        </marker>
      </defs>

      {/* panels */}
      <rect x={16} y={20} width={296} height={260} rx={5} fill={LIGHT} stroke={INK} strokeWidth={2.5} />
      <rect x={328} y={20} width={296} height={260} rx={5} fill={LIGHT} stroke={INK} strokeWidth={2.5} />

      {/* speaker silhouettes */}
      {heads.map((hd, i) => (
        <g key={i} fill={MUTED} opacity={0.5}>
          <circle cx={hd.cx} cy={hd.base - 40} r={17} />
          <path d={`M ${hd.cx - 28},${hd.base} Q ${hd.cx},${hd.base - 30} ${hd.cx + 28},${hd.base} Z`} />
        </g>
      ))}

      {/* caption box */}
      <rect x={26} y={28} width={112} height={26} rx={3} fill={INK} />
      <text x={82} y={45} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700} letterSpacing="0.06em">
        CAPTION
      </text>

      {/* tails (drawn under balloons) */}
      <g fill="#fff" stroke={INK} strokeWidth={2}>
        <polygon points="132,102 162,106 96,168" />
        <polygon points="212,188 240,186 250,205" />
        <polygon points="418,90 448,92 398,168" />
        <polygon points="524,176 552,174 566,200" />
      </g>

      {/* balloons */}
      <g fill="#fff" stroke={INK} strokeWidth={2}>
        <ellipse cx={150} cy={78} rx={72} ry={32} />
        <ellipse cx={232} cy={162} rx={62} ry={30} />
        <ellipse cx={440} cy={64} rx={72} ry={32} />
        <ellipse cx={545} cy={150} rx={64} ry={30} />
      </g>
      <g fill={MUTED} fontSize={18} textAnchor="middle" fontWeight={700}>
        <text x={150} y={84}>&#8230;</text>
        <text x={232} y={168}>&#8230;</text>
        <text x={440} y={70}>&#8230;</text>
        <text x={545} y={156}>&#8230;</text>
      </g>

      {/* reading path (segment per hop so every jump shows direction) */}
      <g stroke={BLUE} strokeWidth={2.5} strokeDasharray="7 5" fill="none">
        <line x1={150} y1={110} x2={220} y2={140} markerEnd="url(#bl-arrow)" />
        <line x1={250} y1={150} x2={410} y2={80} markerEnd="url(#bl-arrow)" />
        <line x1={470} y1={78} x2={520} y2={130} markerEnd="url(#bl-arrow)" />
      </g>

      {/* order badges */}
      {badges.map((b) => (
        <g key={b.n}>
          <circle cx={b.x} cy={b.y} r={12} fill={RED} />
          <text x={b.x} y={b.y + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
            {b.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 4 — cover anatomy                                          */
/* ================================================================== */
function CoverAnatomyDiagram() {
  const bars = [316, 319, 323, 328, 331, 336, 340, 345, 349, 354, 358, 363, 367];

  return (
    <svg
      viewBox="0 0 560 390"
      role="img"
      aria-label="A comic cover with labeled zones: bleed, masthead, title, issue number, focal image, barcode, trade dress and safe area"
      style={{ width: '100%', maxWidth: 520, height: 'auto', fontFamily: SVG_FONT }}
    >
      {/* bleed */}
      <rect x={167} y={16} width={226} height={356} rx={4} fill="none" stroke={RED} strokeWidth={1.5} strokeDasharray="6 5" />
      {/* trim / cover */}
      <rect x={175} y={24} width={210} height={340} rx={3} fill="#fff" stroke={INK} strokeWidth={2.5} />
      {/* safe area */}
      <rect x={189} y={38} width={182} height={312} rx={2} fill="none" stroke={BLUE} strokeWidth={1.5} strokeDasharray="5 5" />

      {/* focal image */}
      <g>
        <path d="M250,318 L242,210 Q280,192 318,210 L310,318 Z" fill={RED} opacity={0.4} />
        <path d="M258,318 L258,212 Q258,190 280,190 Q302,190 302,212 L302,318 Z" fill={RED} opacity={0.92} />
        <circle cx={280} cy={162} r={24} fill={RED} />
      </g>

      {/* masthead */}
      <rect x={175} y={24} width={210} height={44} fill={INK} />
      <text x={280} y={52} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700} letterSpacing="0.04em">
        MASTHEAD / LOGO
      </text>

      {/* title */}
      <text x={196} y={150} fill={INK} fontSize={30} fontWeight={800}>TITLE</text>
      <text x={197} y={170} fill={MUTED} fontSize={12} fontWeight={600}>a stubborn little comic</text>

      {/* issue number */}
      <rect x={345} y={76} width={36} height={30} rx={3} fill={LIGHT} stroke={INK} strokeWidth={1.5} />
      <text x={363} y={96} textAnchor="middle" fill={INK} fontSize={14} fontWeight={700}>#1</text>

      {/* barcode */}
      <rect x={311} y={326} width={62} height={28} rx={2} fill="#fff" stroke={INK} strokeWidth={1} />
      {bars.map((bx, i) => (
        <line key={i} x1={bx} y1={330} x2={bx} y2={350} stroke={INK} strokeWidth={i % 3 === 0 ? 2 : 1} />
      ))}

      {/* trade dress / credits */}
      <text x={185} y={344} fill={INK} fontSize={11} fontWeight={600}>STORY &#183; ART &#183; $4.99</text>

      {/* leaders + labels: left */}
      <g stroke={MUTED} strokeWidth={1.5}>
        <line x1={167} y1={18} x2={161} y2={18} />
        <line x1={175} y1={46} x2={161} y2={46} />
        <line x1={196} y1={150} x2={161} y2={150} />
        <line x1={185} y1={344} x2={161} y2={344} />
      </g>
      <g fontFamily={SVG_FONT} fontSize={12} fill={INK} textAnchor="end">
        <text x={158} y={22} fill={RED} fontWeight={700}>Bleed 0.125 in</text>
        <text x={158} y={50}>Masthead / logo</text>
        <text x={158} y={154}>Title</text>
        <text x={158} y={348}>Trade dress</text>
      </g>

      {/* leaders + labels: right */}
      <g stroke={MUTED} strokeWidth={1.5}>
        <line x1={371} y1={40} x2={399} y2={40} />
        <line x1={381} y1={90} x2={399} y2={90} />
        <line x1={302} y1={160} x2={399} y2={160} />
        <line x1={373} y1={340} x2={399} y2={340} />
      </g>
      <g fontFamily={SVG_FONT} fontSize={12} fill={INK}>
        <text x={402} y={44} fill={BLUE} fontWeight={700}>Safe area</text>
        <text x={402} y={94}>Issue #</text>
        <text x={402} y={164}>Focal image</text>
        <text x={402} y={344}>Barcode zone</text>
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 5 — line weight & spotting blacks                          */
/* ================================================================== */
function InkingDiagram() {
  const ladder = [
    { y: 36, w: 1.5, label: 'Hairline — distant / background' },
    { y: 78, w: 3, label: 'Thin — interior detail' },
    { y: 120, w: 6, label: 'Medium — figure outline' },
    { y: 162, w: 11, label: 'Bold — foreground & shadow side' },
  ];
  const hatch = [364, 371, 378, 385, 392, 399];

  return (
    <svg
      viewBox="0 0 520 210"
      role="img"
      aria-label="A line-weight ladder from hairline to bold, and three swatches showing how to spot blacks from light to shadow"
      style={{ width: '100%', maxWidth: 560, height: 'auto', fontFamily: SVG_FONT }}
    >
      {ladder.map((l) => (
        <g key={l.y}>
          <line x1={30} y1={l.y} x2={250} y2={l.y} stroke={INK} strokeWidth={l.w} strokeLinecap="round" />
          <text x={258} y={l.y + 4} fill={MUTED} fontSize={12}>{l.label}</text>
        </g>
      ))}

      {/* spotting blacks: light / mid / shadow */}
      <g>
        <rect x={340} y={70} width={40} height={40} rx={3} fill="#fff" stroke={INK} strokeWidth={1.5} />
        <rect x={355} y={130} width={40} height={40} rx={3} fill={LIGHT} stroke={INK} strokeWidth={1.5} />
        {hatch.map((hx) => (
          <line key={hx} x1={hx} y1={130} x2={hx - 8} y2={170} stroke={MUTED} strokeWidth={1} />
        ))}
        <rect x={355} y={130} width={40} height={40} rx={3} fill="none" stroke={INK} strokeWidth={1.5} />
        <rect x={430} y={70} width={40} height={40} rx={3} fill={INK} />
      </g>
      <g fontFamily={SVG_FONT} fontSize={11} fill={MUTED} textAnchor="middle">
        <text x={360} y={124}>light</text>
        <text x={375} y={186}>mid</text>
        <text x={450} y={124}>shadow</text>
        <text x={405} y={62} fontSize={12} fontWeight={700} fill={INK}>Spot your blacks</text>
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 6 — coloring stages                                        */
/* ================================================================== */
function ColorStagesDiagram() {
  const stages = [
    { cx: 80, label: 'Flats', shadow: false, light: false, rim: false },
    { cx: 210, label: 'Shadows', shadow: true, light: false, rim: false },
    { cx: 340, label: 'Light', shadow: true, light: true, rim: false },
    { cx: 470, label: 'Rendered', shadow: true, light: true, rim: true },
  ];
  const cy = 80;
  const r = 44;

  return (
    <svg
      viewBox="0 0 560 175"
      role="img"
      aria-label="Coloring in four stages: flat color, shadows, highlights, and a fully rendered ball"
      style={{ width: '100%', maxWidth: 560, height: 'auto', fontFamily: SVG_FONT }}
    >
      {stages.map((s) => (
        <g key={s.label}>
          <ellipse cx={s.cx} cy={cy + 60} rx={38} ry={7} fill={INK} opacity={0.12} />
          <circle cx={s.cx} cy={cy} r={r} fill={RED} />
          {s.shadow && <ellipse cx={s.cx + 13} cy={cy + 14} rx={22} ry={17} fill="#8a1218" />}
          {s.rim && <ellipse cx={s.cx + 22} cy={cy - 20} rx={9} ry={16} fill={BLUE} opacity={0.35} />}
          {s.light && <ellipse cx={s.cx - 15} cy={cy - 16} rx={12} ry={9} fill="#fff" opacity={0.85} />}
          <circle cx={s.cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={1.5} />
          <text x={s.cx} y={cy + 78} textAnchor="middle" fill={INK} fontSize={13} fontWeight={700} fontFamily={SVG_FONT}>
            {s.label}
          </text>
        </g>
      ))}
      <g fill={MUTED} fontSize={18} fontFamily={SVG_FONT} textAnchor="middle">
        <text x={145} y={86}>&#8594;</text>
        <text x={275} y={86}>&#8594;</text>
        <text x={405} y={86}>&#8594;</text>
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 7 — balloon shapes                                         */
/* ================================================================== */
function BalloonShapesDiagram() {
  const burst = Array.from({ length: 16 }, (_, i) => {
    const ang = (Math.PI / 8) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? 46 : 26;
    return `${(340 + rad * Math.cos(ang)).toFixed(1)},${(80 + rad * Math.sin(ang)).toFixed(1)}`;
  }).join(' ');

  return (
    <svg
      viewBox="0 0 640 195"
      role="img"
      aria-label="Balloon shapes for lettering: speech, thought, shout, whisper and caption"
      style={{ width: '100%', maxWidth: 640, height: 'auto', fontFamily: SVG_FONT }}
    >
      {/* speech */}
      <g fill="#fff" stroke={INK} strokeWidth={2}>
        <ellipse cx={80} cy={78} rx={54} ry={34} />
        <polygon points="60,104 92,104 58,150" />
      </g>
      {/* thought */}
      <g fill="#fff" stroke={INK} strokeWidth={2}>
        <ellipse cx={210} cy={72} rx={54} ry={34} />
        <circle cx={186} cy={118} r={8} />
        <circle cx={174} cy={138} r={6} />
        <circle cx={165} cy={153} r={4} />
      </g>
      {/* shout / burst */}
      <polygon points={burst} fill="#fff" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {/* whisper */}
      <ellipse cx={470} cy={78} rx={54} ry={34} fill="#fff" stroke={INK} strokeWidth={2} strokeDasharray="6 5" />
      {/* caption */}
      <rect x={556} y={50} width={76} height={56} rx={3} fill={INK} />
      <text x={594} y={84} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={700}>CAP</text>

      <g fill={MUTED} fontSize={13} fontWeight={700} textAnchor="middle" fontFamily={SVG_FONT}>
        <text x={80} y={182}>Speech</text>
        <text x={210} y={182}>Thought</text>
        <text x={340} y={182}>Shout</text>
        <text x={470} y={182}>Whisper</text>
        <text x={594} y={182}>Caption</text>
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Diagram 8 — binding & page count                                   */
/* ================================================================== */
function BindingDiagram() {
  return (
    <svg
      viewBox="0 0 560 230"
      role="img"
      aria-label="Saddle stitch binding needs page counts in multiples of four, perfect binding needs multiples of two"
      style={{ width: '100%', maxWidth: 560, height: 'auto', fontFamily: SVG_FONT }}
    >
      {/* saddle stitch — tented signature with staples */}
      <g>
        <polygon points="60,160 150,66 150,160" fill={LIGHT} stroke={INK} strokeWidth={2} />
        <polygon points="150,66 240,160 150,160" fill="#fff" stroke={INK} strokeWidth={2} />
        <line x1={78} y1={160} x2="150" y2={80} stroke={MUTED} strokeWidth={1} />
        <line x1={96} y1={160} x2="150" y2={94} stroke={MUTED} strokeWidth={1} />
        <line x1={222} y1={160} x2="150" y2={80} stroke={MUTED} strokeWidth={1} />
        <line x1={204} y1={160} x2="150" y2={94} stroke={MUTED} strokeWidth={1} />
        <rect x={146} y={92} width={8} height={14} rx={1} fill={RED} />
        <rect x={146} y={120} width={8} height={14} rx={1} fill={RED} />
      </g>
      <text x={150} y={192} textAnchor="middle" fill={INK} fontSize={14} fontWeight={700} fontFamily={SVG_FONT}>
        Saddle stitch
      </text>
      <text x={150} y={212} textAnchor="middle" fill={MUTED} fontSize={12} fontFamily={SVG_FONT}>
        pages in multiples of 4
      </text>

      {/* perfect bind — stacked block with glued spine */}
      <g>
        <rect x={340} y={70} width={150} height={110} rx={2} fill="#fff" stroke={INK} strokeWidth={2} />
        <rect x={328} y={70} width={14} height={110} rx={2} fill={RED} />
        {[86, 98, 110, 122, 134, 146, 158].map((ly) => (
          <line key={ly} x1={350} y1={ly} x2={480} y2={ly} stroke={LIGHT} strokeWidth={4} />
        ))}
      </g>
      <text x={415} y={200} textAnchor="middle" fill={INK} fontSize={14} fontWeight={700} fontFamily={SVG_FONT}>
        Perfect bind
      </text>
      <text x={415} y={220} textAnchor="middle" fill={MUTED} fontSize={12} fontFamily={SVG_FONT}>
        pages in multiples of 2
      </text>
    </svg>
  );
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
const SAMPLE_SCRIPT = `PAGE FOUR  (5 panels)

PANEL 1 - Wide establishing shot.
A cramped print shop at dawn. RAINA (20s, ink-stained
hands) stares down a dead printing press.

    CAPTION:  The deadline was midnight.

    RAINA:  ...Not today. Please, not today.

PANEL 2 - Close on the control panel. One red light blinks.

    SFX:  tk- tk- tk

PANEL 3 - Raina pops the side panel; a jammed sheet peeks out.

    RAINA:  There you are.

PANEL 4 - Low angle. She braces a boot on the frame and PULLS.

    RAINA (strain):  Come - ON -

PANEL 5 - The press roars back to life. Ink hits paper.

    SFX:  KA-CHUNK

    CAPTION:  Every comic is a small act of stubbornness.`;

const TOC = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'story', label: 'Story & script' },
  { id: 'layout', label: 'Thumbnails & layout' },
  { id: 'pencils', label: 'Penciling' },
  { id: 'inks', label: 'Inking' },
  { id: 'colors', label: 'Coloring' },
  { id: 'letters', label: 'Lettering' },
  { id: 'covers', label: 'Covers' },
  { id: 'format', label: 'Format & binding' },
  { id: 'tools', label: 'Tools' },
  { id: 'mistakes', label: 'Best practices' },
  { id: 'print', label: 'Ready to print' },
];

export function MakeAComic() {
  return (
    <ResourcePage
      eyebrow="Make a Comic"
      title="How to make a comic, start to finish"
      intro="From a one-line idea to a print-ready book: the full pipeline, the craft at every stage, and the specs that keep it from tripping at the press."
    >
      {/* On-page nav */}
      <nav
        aria-label="On this page"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', margin: '0 0 1.75rem' }}
      >
        {TOC.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            style={{
              fontSize: '.8rem',
              textDecoration: 'none',
              color: INK,
              background: LIGHT,
              border: `1px solid ${BORDER}`,
              borderRadius: 999,
              padding: '.28rem .75rem',
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <p>
        Making a comic is really ten smaller crafts wearing one trench coat. You do not have to be
        world-class at all of them, and you do not have to do them alone, but it helps enormously to
        know where you are in the process and what the next stage actually needs from you. This guide
        walks the whole road, then hands you off to our{' '}
        <Link to="/resources/templates">print templates</Link> and{' '}
        <Link to="/resources/file-prep">File Prep guide</Link> when it is time to export.
      </p>

      {/* 1 — Pipeline */}
      <Section id="pipeline" title="The comic-making pipeline">
        <p>
          Almost every finished comic travels the same route. Early stages are cheap to change and
          expensive to skip; later stages are the reverse. Solve story problems in the script,
          staging problems in thumbnails, and readability problems in layouts &mdash; long before a
          single panel is rendered.
        </p>
        <Figure caption="The ten stages, grouped into four phases. Work loosely at the left, precisely at the right.">
          <PipelineDiagram />
        </Figure>
        <p>
          You will loop back &mdash; a lettering pass often reveals a balloon that needs more art
          room, and that is normal. The goal is not a rigid assembly line, it is to always know which
          decision you are making so you are not repainting a page to fix a plot hole.
        </p>
      </Section>

      {/* 2 — Story & script */}
      <Section id="story" title="Story &amp; script">
        <p>
          Start with a <strong>logline</strong>: one sentence naming the protagonist, their want, and
          the obstacle. &ldquo;A burned-out print-shop owner has one night to resurrect a dead press
          and save her first published comic.&rdquo; If you cannot say it in a breath, the reader will
          not feel it in twenty pages.
        </p>
        <p>
          There are two common ways to script. In the <strong>full-script</strong> method (the
          &ldquo;DC method&rdquo;) the writer specifies every page, panel, description, and line of
          dialogue before art begins &mdash; great for collaboration and predictable page counts. In
          the <strong>&ldquo;Marvel method&rdquo;</strong> the writer hands the artist a plot
          outline, the artist paces and draws the pages, and dialogue is written last to fit the art.
          Neither is more &ldquo;correct&rdquo;; pick the one that matches your team and your control
          needs.
        </p>

        <Steps
          items={[
            {
              title: 'Premise & logline',
              body: 'Lock the one-sentence hook and the ending you are writing toward. Everything else serves these.',
            },
            {
              title: 'Beat out the story',
              body: 'List the major turns as bullet beats. This is where you budget length before you fall in love with pages.',
            },
            {
              title: 'Budget pages & panels',
              body: 'Assign beats to pages. A useful default is 5-7 panels per page; give big moments a whole page (a splash) and quiet beats fewer panels with more air.',
            },
            {
              title: 'Write the script',
              body: 'Full script or plot-first. Number pages and panels so every later stage can reference them unambiguously.',
            },
          ]}
        />

        <p style={{ marginBottom: '.5rem' }}>
          A page of full script looks roughly like this &mdash; page heading, numbered panels, a short
          visual description, then captions, dialogue, and sound effects:
        </p>
        <div style={{ overflowX: 'auto', margin: '.5rem 0 1.25rem' }}>
          <pre
            style={{
              margin: 0,
              background: INK,
              color: '#eaeaea',
              padding: '1.15rem 1.25rem',
              borderRadius: 10,
              fontSize: '.82rem',
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              whiteSpace: 'pre',
            }}
          >
            {SAMPLE_SCRIPT}
          </pre>
        </div>

        <Callout kind="tip" title="Budget in fours">
          Because most comics bind in signatures, sketch your page budget in multiples of 4 from the
          start. It is far easier to write a beat to fill page 24 than to amputate one to escape page
          25. More on that in <a href="#format">Format &amp; binding</a>.
        </Callout>
      </Section>

      {/* 3 — Thumbnails & layout */}
      <Section id="layout" title="Thumbnails &amp; page layout">
        <p>
          Thumbnails are tiny, fast, ugly sketches &mdash; a few inches tall &mdash; where you solve
          the page as a whole: how many panels, how big, and in what order the eye travels. Design the
          reading path on purpose. In Western comics the eye runs in a <strong>Z-path</strong>: left
          to right, top to bottom, one tier at a time.
        </p>
        <Figure caption="A six-panel page. The dashed blue line is the reading path; keep panels stepping down and to the right so the eye never has to guess where 4 comes after 3.">
          <PageLayoutDiagram />
        </Figure>
        <p>
          The white channels between panels are <strong>gutters</strong>; the reader&rsquo;s
          imagination fills them, so the jump between panels is a storytelling tool, not dead space.
          Vary panel size for rhythm &mdash; wide panels slow time down, a stack of narrow ones speeds
          it up, and a full-bleed splash lands a beat like a drum hit.
        </p>
        <Callout kind="warn" title="Mind your tangents">
          A <em>tangent</em> is when two edges kiss by accident &mdash; a character&rsquo;s head
          exactly touching the horizon, or a panel border grazing a fingertip. Tangents flatten depth
          and read as mistakes. Nudge the staging so lines clearly overlap or clearly separate.
        </Callout>
        <p>
          Keep balloons and essential storytelling inside the safe area (dashed above). Anything that
          must survive trimming &mdash; text especially &mdash; stays well inside the trim; see{' '}
          <Link to="/resources/file-prep">File Prep</Link> for the exact margins.
        </p>
      </Section>

      {/* 4 — Penciling */}
      <Section id="pencils" title="Penciling">
        <p>
          Pencils turn the thumbnail&rsquo;s plan into real drawing: staging the figures, choosing the
          camera, and building believable space. Think like a director. A <strong>low angle</strong>{' '}
          makes a figure looming and powerful; a <strong>high angle</strong> makes them small or
          watched; an <strong>eye-level</strong> shot is neutral and intimate.
        </p>
        <Checklist
          items={[
            'Silhouette first: if the black shape alone reads clearly, the pose works. If two figures merge into one blob, restage.',
            'Anchor perspective with a horizon line and vanishing points so rooms and streets feel solid rather than tilted.',
            'Use gesture and line-of-action before anatomy — a strong curve through the spine sells energy that correct muscles cannot fake.',
            'Draw through: rough the whole figure (even hidden parts) so foreshortening and overlaps stay convincing.',
            'Leave room for letters. Sketch balloon blobs at the pencil stage so dialogue never has to cover a face.',
          ]}
        />
        <Callout kind="info" title="Draw for the trim, not the screen">
          What looks centered on your monitor can drift into the trim once the page is cut. Rough your
          panels against the same safe area and bleed you will print to &mdash; the specs live in the{' '}
          <Link to="/resources/file-prep">File Prep guide</Link>.
        </Callout>
      </Section>

      {/* 5 — Inking */}
      <Section id="inks" title="Inking">
        <p>
          Inking is not tracing &mdash; it is deciding what matters. Line weight creates hierarchy:
          heavier lines come forward and carry weight, lighter lines recede into detail and distance.
          A consistent light source tells you which side of every form to thicken.
        </p>
        <Figure caption="Left: a line-weight ladder — heavier contours advance, hairlines recede. Right: 'spotting blacks' means placing solid darks deliberately to anchor the shadow side and lead the eye.">
          <InkingDiagram />
        </Figure>
        <p>
          <strong>Spotting blacks</strong> &mdash; deciding where large solid darks fall &mdash; is
          what separates flat linework from a page with real depth and mood. <strong>Feathering</strong>{' '}
          (tapered lines fanning out of a shadow) blends the transition between light and dark without
          gray. Whether you ink with a brush, a dip pen, a fineliner, or a pressure-sensitive digital
          brush matters far less than committing to a consistent weight logic across the book.
        </p>
      </Section>

      {/* 6 — Coloring */}
      <Section id="colors" title="Coloring">
        <p>
          Color usually goes down in two passes. First <strong>flats</strong>: solid, separated
          local-color shapes with no shading, on their own layer so each element can be selected
          instantly. Then <strong>rendering</strong>: shadows and light built on top with a single,
          consistent light source.
        </p>
        <Figure caption="Flats, then shadows, then highlights, then rendered — one light source throughout. Palette and value set the mood before any rendering happens.">
          <ColorStagesDiagram />
        </Figure>
        <p>
          Let <strong>palette</strong> do emotional work: warm and saturated for energy, cool and
          desaturated for dread or distance. Keep values readable &mdash; squint at the page; if the
          storytelling survives in grayscale, your color is supporting the art rather than fighting it.
        </p>
        <Callout kind="warn" title="Print is CMYK">
          Screens glow in RGB; presses print CMYK ink, which cannot reproduce the most electric neons.
          Work in a print-aware palette and convert before you export so nothing shifts on press &mdash;
          the how-to is in <Link to="/resources/file-prep">File Prep</Link>.
        </Callout>
      </Section>

      {/* 7 — Lettering */}
      <Section id="letters" title="Lettering">
        <p>
          Lettering is invisible when it is good and impossible to ignore when it is bad. Place
          balloons in reading order &mdash; top to bottom, left to right &mdash; so the eye takes them
          in the right sequence, and point each <strong>tail</strong> clearly at the speaker.
        </p>
        <Figure caption="Across two panels, balloons read top-to-bottom then left-to-right. Tails point at whoever is talking; a caption box sets scene or narration.">
          <BalloonPlacementDiagram />
        </Figure>
        <p>
          The shape carries tone. A smooth outline is normal speech; a scalloped or bubble-trailed
          balloon is thought; a jagged burst is a shout or a radio/robot voice; a dashed outline is a
          whisper; a rectangular box is a caption for narration or time and place.
        </p>
        <Figure caption="Balloon vocabulary: match the shape to the delivery so readers hear the line correctly.">
          <BalloonShapesDiagram />
        </Figure>
        <Checklist
          items={[
            'Keep every glyph inside the safe area — a balloon clipped by the trim is unforgivable and unfixable after printing.',
            'Break lines to make balloons tall and round, not wide and flat; round balloons tuck into art better.',
            'Never cross tails or let a later balloon sit above an earlier one — that scrambles the reading order.',
            'Use a real comic-lettering typeface (Blambot and Comicraft make excellent ones). Avoid Comic Sans; it reads as amateur.',
            'Letter last, but plan balloon room from the pencils so text never buries a face or an important gesture.',
          ]}
        />
      </Section>

      {/* 8 — Covers */}
      <Section id="covers" title="Covers &amp; trade dress">
        <p>
          The cover is your entire marketing department on one page. It has a job to do in a fraction
          of a second: read the title, feel the genre, want to open it. The recurring furniture &mdash;
          masthead, title, issue number, price, barcode &mdash; is called the <strong>trade dress</strong>.
        </p>
        <Figure caption="Cover anatomy. The focal image sells the mood; trade dress does the retail work. Everything bleeds to the red line; nothing important crosses the blue safe line.">
          <CoverAnatomyDiagram />
        </Figure>
        <Checklist
          items={[
            'Lead with one clear focal image and a strong silhouette — covers are judged as thumbnails first.',
            'Set the masthead/logo and title in the top third where the eye lands and where shelves and feeds crop.',
            'Reserve a clean, light rectangle for the barcode — do not run busy art or dark values under it.',
            'Extend background art all the way to the 0.125 in bleed so trimming never leaves a white sliver.',
            'Keep the title and credits inside the safe area; for saddle-stitch books the front, spine, and back are one continuous cover file.',
          ]}
        />
      </Section>

      {/* 9 — Format & binding */}
      <Section id="format" title="Format, page count &amp; binding">
        <p>
          Choose your trim size early &mdash; it changes composition, panel counts, and how much text
          fits a balloon. These are the sizes we print:
        </p>
        <SpecTable
          headers={['Format', 'Trim size (in)', 'Good for']}
          rows={[
            ['A5', '5.8 × 8.3', 'Manga-style volumes, digests, pocket zines'],
            ['Standard US comic', '6.625 × 10.25', 'Single issues and floppies — the classic'],
            ['Magazine', '8 × 10.5', 'Anthologies, art magazines, larger reproduction'],
            ['US Letter', '8.5 × 11', 'All-ages books, zines, activity comics'],
            ['Art Print', '11 × 17', 'Posters, pin-ups, wall pieces'],
          ]}
        />
        <p>
          <strong>Page count follows the binding.</strong> Saddle stitch folds nested sheets and
          staples the spine, so total pages must be a <strong>multiple of 4</strong>. Perfect (glue)
          binding stacks and glues pages into a flat spine, needing a <strong>multiple of 2</strong>.
          Count covers and blanks &mdash; the press counts every leaf.
        </p>
        <Figure caption="Saddle stitch (folded, stapled) needs multiples of 4; perfect bind (glued spine) needs multiples of 2. Plan your page count to fit before you finish the art.">
          <BindingDiagram />
        </Figure>
        <SpecTable
          headers={['Book', 'Typical length', 'Common binding']}
          rows={[
            ['Single issue', '22-32 interior pages', 'Saddle stitch'],
            ['One-shot / special', '32-48 pages', 'Saddle stitch or perfect bind'],
            ['Graphic novel / TPB', '80-200+ pages', 'Perfect bind'],
          ]}
        />
        <Callout kind="tip" title="Start from a template">
          Rather than build a canvas from scratch, download the correctly-sized{' '}
          <Link to="/resources/templates">print template</Link> for your trim &mdash; bleed, trim, and
          safe area are already drawn in, so your page count and margins line up with our presses from
          page one.
        </Callout>
      </Section>

      {/* 10 — Tools */}
      <Section id="tools" title="Tools &amp; software">
        <p>
          There is no single &ldquo;right&rdquo; program &mdash; working pros mix and match. Pick one
          drawing app you enjoy and one layout app for assembling the final book, and grow from there.
        </p>
        <SpecTable
          headers={['Software', 'Platform', 'Where it shines']}
          rows={[
            ['Clip Studio Paint', 'Win / Mac / iPad', 'Purpose-built for comics: panel tools, perspective rulers, screentones, a superb pen engine'],
            ['Photoshop', 'Win / Mac', 'Painting, color, texture, and heavy-duty CMYK print prep'],
            ['Procreate', 'iPad', 'Fast, portable drawing and inking — ideal for thumbnails and sketching anywhere'],
            ['Krita', 'Win / Mac / Linux (free)', 'Powerful open-source painting and inking with comic-specific tools'],
            ['Affinity Photo / Designer', 'Win / Mac / iPad', 'One-time-purchase alternative to Photoshop and Illustrator'],
            ['Illustrator', 'Win / Mac', 'Vector logos, mastheads, and crisp, scalable SFX and lettering'],
            ['InDesign', 'Win / Mac', 'Multi-page assembly and reliable print-ready PDF export for longer books'],
          ]}
        />
        <Callout kind="info" title="Hardware that earns its keep">
          A pressure-sensitive tablet transforms digital inking. A <strong>pen display</strong>{' '}
          (Wacom Cintiq, Huion Kamvas, XP-Pen Artist) lets you draw directly on the screen; a{' '}
          <strong>pen tablet</strong> (Wacom Intuos) is cheaper and draws to a separate monitor; an{' '}
          <strong>iPad with Apple Pencil</strong> is a portable all-in-one. Whatever you use, work on a
          300 dpi canvas at final trim size so the art holds up in print.
        </Callout>
      </Section>

      {/* 11 — Best practices & mistakes */}
      <Section id="mistakes" title="Best practices &amp; common mistakes">
        <p>
          Most reprints are caused by a handful of avoidable slip-ups &mdash; almost all of them at
          the file, not the art. Build these habits and you will sail through prepress.
        </p>
        <Callout kind="warn" title="The usual suspects">
          Low-resolution art (upscaled or screen-grabbed) that turns soft in print. Electric RGB neons
          that go muddy in CMYK. Text or logos drifting into the bleed and getting trimmed off. A page
          count that is not a multiple of 4 (saddle stitch) or 2 (perfect bind). Accidental tangents
          that flatten depth. Unflattened files where a hidden layer or live blend mode shifts on
          export.
        </Callout>
        <Checklist
          items={[
            'Set the canvas to final trim size at 300 dpi with 0.125 in bleed before you draw a single line.',
            'Keep all text and critical content inside the safe area, well clear of the trim.',
            'Work with a print-aware palette and convert to CMYK before export — check for neon surprises.',
            'Confirm your page count fits the binding math early, and count covers and blanks.',
            'Name and organize layers; flatten a copy for output and keep your layered master.',
            'Proof at 100% and print a quick home test or order a proof — screens flatter, paper is honest.',
            'Order a sample pack so you can feel paper stock and binding before you commit the full run.',
          ]}
        />
        <Callout kind="tip" title="One source of truth for specs">
          Do not memorize numbers &mdash; start from a template and check exports against the{' '}
          <Link to="/resources/file-prep">File Prep guide</Link>. That is where resolution, bleed,
          color, and PDF settings are kept current.
        </Callout>
      </Section>

      {/* 12 — Ready to print */}
      <Section id="print" title="Ready to print?">
        <p>
          When the art is finished and lettered, the last mile is production: correct size, correct
          bleed, correct color, correct page count. Get those four right and your book prints exactly
          as you drew it.
        </p>
        <CardGrid min={260}>
          <div
            style={{
              background: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)',
            }}
          >
            <div style={{ fontWeight: 700 }}>Print-ready templates</div>
            <p style={{ margin: 0, fontSize: '.9rem', color: MUTED, flex: 1 }}>
              Start on a canvas with bleed, trim, and safe area already drawn in, sized for every
              format we offer.
            </p>
            <Link to="/resources/templates" className="btn" style={{ textAlign: 'center' }}>
              Browse templates
            </Link>
          </div>
          <div
            style={{
              background: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)',
            }}
          >
            <div style={{ fontWeight: 700 }}>File Prep checklist</div>
            <p style={{ margin: 0, fontSize: '.9rem', color: MUTED, flex: 1 }}>
              The exact resolution, bleed, CMYK, font, and PDF settings our presses expect &mdash; the
              final gate before you upload.
            </p>
            <Link to="/resources/file-prep" className="btn secondary" style={{ textAlign: 'center' }}>
              Read File Prep
            </Link>
          </div>
        </CardGrid>
        <Steps
          items={[
            {
              title: 'Lock your format & page count',
              body: 'Pick a trim size and make the total pages fit the binding math (multiples of 4 for saddle stitch, 2 for perfect bind).',
            },
            {
              title: 'Export to spec',
              body: (
                <>
                  Flatten, convert to CMYK, and export a print-ready PDF following the{' '}
                  <Link to="/resources/file-prep">File Prep guide</Link>.
                </>
              ),
            },
            {
              title: 'Proof it in your hands',
              body: (
                <>
                  Order a <Link to="/sample-pack">sample pack</Link> or a proof, then start your run
                  when the paper looks right.
                </>
              ),
            },
          ]}
        />
        <p>
          That is the whole pipeline &mdash; idea to printed book. Every professional comic you love
          took this same road, one stubborn stage at a time. Now go make yours.
        </p>
      </Section>

      <RelatedLinks
        links={[
          { to: '/resources/templates', label: 'Download templates' },
          { to: '/resources/file-prep', label: 'File Prep guide' },
          { to: '/sample-pack', label: 'Order a sample pack' },
          { to: '/shop/comic-books', label: 'Start a print order' },
        ]}
      />
    </ResourcePage>
  );
}
