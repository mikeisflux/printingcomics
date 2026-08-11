import {
  ResourcePage,
  Section,
  Callout,
  Figure,
  CardGrid,
  DownloadCard,
  SpecTable,
  Checklist,
  Steps,
  RelatedLinks,
} from './ResourceLayout';
import { Link } from 'react-router-dom';

interface Tpl {
  title: string;
  meta: string;
  href: string;
  use: string;
}

const TEMPLATES: Tpl[] = [
  { title: 'A5', meta: '5.8 × 8.3 in', href: '/templates/template-a5.pdf', use: 'Compact digests & manga-size books' },
  { title: 'Standard Comic', meta: '6.625 × 10.25 in', href: '/templates/template-standard.pdf', use: 'The classic US single-issue comic book' },
  { title: 'Magazine', meta: '8 × 10.5 in', href: '/templates/template-magazine.pdf', use: 'Magazine-format & prestige editions' },
  { title: 'US Letter', meta: '8.5 × 11 in', href: '/templates/template-letter.pdf', use: 'Full-size books & art collections' },
  { title: 'Art Print', meta: '11 × 17 in', href: '/templates/template-art-print.pdf', use: 'Posters & tabloid art prints' },
  { title: 'Trading Card', meta: '2.5 × 3.5 in', href: '/templates/template-trading-card.pdf', use: 'Collector cards — front & back' },
];

/** Nested bleed / trim / safe diagram reused as the "anatomy of a template" figure. */
function GuidesDiagram() {
  return (
    <svg viewBox="0 0 420 320" role="img" aria-label="Bleed, trim and safe-area guides"
      style={{ width: '100%', maxWidth: 460, height: 'auto' }}>
      {/* bleed */}
      <rect x="20" y="20" width="380" height="280" fill="#fbeaec" stroke="#C61A22" strokeWidth="2" strokeDasharray="6 5" />
      {/* trim */}
      <rect x="40" y="40" width="340" height="240" fill="#fff" stroke="#1a1a1a" strokeWidth="2" />
      {/* safe */}
      <rect x="66" y="66" width="288" height="188" fill="none" stroke="#1e74fc" strokeWidth="2" strokeDasharray="6 5" />

      <text x="210" y="15" textAnchor="middle" fontSize="13" fill="#C61A22" fontWeight="700">Bleed edge — art runs to here (+0.125")</text>
      <text x="210" y="55" textAnchor="middle" fontSize="13" fill="#1a1a1a" fontWeight="700">Trim — where we cut</text>
      <text x="210" y="163" textAnchor="middle" fontSize="13" fill="#1e74fc" fontWeight="700">Safe area</text>
      <text x="210" y="182" textAnchor="middle" fontSize="11" fill="#1e74fc">keep text ≥ 0.25" inside trim</text>
    </svg>
  );
}

export function Templates() {
  return (
    <ResourcePage
      eyebrow="Templates"
      title="Print templates"
      intro="Start every book on the right foundation. Download the template that matches your trim size, build your art on top of the guides, and you'll clear prepress the first time."
    >
      <Section id="download" title="Download a template">
        <p>
          Each template is a print-ready document at the exact <strong>trim size</strong>, already set up with{' '}
          <strong>bleed</strong> and <strong>safe-area</strong> guides. Pick the size that matches the book you're
          making — the guides are the same across every page, so you only have to think about the art.
        </p>
        <CardGrid min={230}>
          {TEMPLATES.map((t) => (
            <DownloadCard key={t.href} title={t.title} meta={t.meta} href={t.href}>
              {t.use}
            </DownloadCard>
          ))}
        </CardGrid>
        <Callout kind="info" title="Which one matches my order?">
          The trim size you choose in the product configurator maps 1-to-1 to these templates. Comics and graphic
          novels both offer A5, Standard, Magazine and Letter; the 11 × 17 Art Print template is for posters and
          oversized prints. Not sure? <Link to="/sample-pack">Order a sample pack</Link> or{' '}
          <Link to="/contact">ask us</Link>.
        </Callout>
      </Section>

      <Section id="anatomy" title="What's inside a template">
        <p>
          Every template carries three guides. Understanding what they mean is the whole game — get your art sitting
          correctly between them and the rest of prepress takes care of itself.
        </p>
        <Figure caption="The three guides in every Printing Comics template: bleed (red), trim (black), and safe area (blue).">
          <GuidesDiagram />
        </Figure>
        <SpecTable
          headers={['Guide', 'What it is', 'What to do']}
          rows={[
            [<strong>Bleed</strong>, 'The outer edge, 0.125" beyond the trim on all four sides.', 'Extend any art or background that touches an edge all the way to the bleed — never stop it at the trim.'],
            [<strong>Trim</strong>, 'Where the blade actually cuts the finished page.', 'Treat it as the true page edge. Cutting has a small tolerance, which is exactly why bleed and safe area exist.'],
            [<strong>Safe area</strong>, 'An inner margin, about 0.25" inside the trim.', 'Keep text, logos, page numbers and anything you can’t afford to lose inside this line.'],
          ]}
        />
      </Section>

      <Section id="how-to" title="How to use your template">
        <Steps
          items={[
            { title: 'Open the template in your art program', body: <>Photoshop, Clip Studio Paint, Illustrator, Affinity, Procreate, InDesign — anything that opens a PDF at its true size. Keep the document at the size it opens; don’t resize it.</> },
            { title: 'Build your art on a layer below the guides', body: <>Put the guide layer on top so you can always see bleed, trim and safe. Do your drawing, inking and coloring underneath it.</> },
            { title: 'Run backgrounds and edge art out to the bleed', body: <>Anything that should reach the edge of the printed page must extend to the red bleed line, not stop at the trim.</> },
            { title: 'Keep the important stuff in the safe area', body: <>Dialogue, captions, titles, page numbers and key faces belong inside the blue safe line so trimming can never clip them.</> },
            { title: 'Hide or delete the guide layer before export', body: <>The guides are for you, not the press. Turn that layer off (or delete it) so it never prints.</> },
            { title: 'Export to our file spec', body: <>Flatten, convert to CMYK, and export a print-ready PDF. Full details on the <Link to="/resources/file-prep">File Prep</Link> page.</> },
          ]}
        />
        <Callout kind="warn" title="Don't move or resize the page">
          The template is already the correct size. If you scale the canvas, change the units, or crop it, the guides
          stop matching our press and your art can end up mis-sized. Start from the template and leave the page
          dimensions alone.
        </Callout>
      </Section>

      <Section id="choose" title="Choosing the right size">
        <p>Not sure which format fits your project? Here's how creators usually pick.</p>
        <SpecTable
          headers={['Format', 'Trim size', 'Best for']}
          rows={[
            ['A5', '5.8 × 8.3 in', 'Digests, manga-style volumes, zines'],
            ['Standard Comic', '6.625 × 10.25 in', 'Traditional single issues and floppies'],
            ['Magazine', '8 × 10.5 in', 'Prestige formats, anthologies, art-forward books'],
            ['US Letter', '8.5 × 11 in', 'Full-size collections, sketchbooks, art books'],
            ['Art Print', '11 × 17 in', 'Posters, pin-ups and tabloid prints'],
            ['Trading Card', '2.5 × 3.5 in', 'Collector cards — two pages, front and back'],
          ]}
        />
        <p className="muted" style={{ fontSize: '.9rem' }}>
          Interior page counts must be a multiple of 4 for saddle-stitch and a multiple of 2 for perfect (glue) binding.
          See <Link to="/resources/file-prep">File Prep</Link> for the full binding rules.
        </p>
      </Section>

      <Section id="best-practices" title="Template best practices">
        <Checklist
          items={[
            'Work at 300 ppi (or higher) at the template’s real size — don’t scale a small file up later.',
            'Design in the template from the start; retrofitting finished art into the guides is painful.',
            'One page per template page; keep interiors as single pages and the cover as one back–spine–front spread.',
            'Double-check bleed on every spread — the most common reject is a white sliver where art stopped at the trim.',
            'Flatten and remove the guide layer before you export.',
          ]}
        />
        <Callout kind="tip" title="Covers need their own setup">
          A cover is a single spread — back, spine and front together — with bleed around the whole thing. The spine
          width depends on your page count and paper, so request an exact cover spec when you know your final page
          count. <Link to="/contact">Contact us</Link> and we'll send the precise spine width.
        </Callout>
      </Section>

      <RelatedLinks
        links={[
          { to: '/resources/file-prep', label: 'File Prep guide' },
          { to: '/resources/make-a-comic', label: 'Make a Comic guide' },
          { to: '/sample-pack', label: 'Order a sample pack' },
          { to: '/contact', label: 'Ask a question' },
        ]}
      />
    </ResourcePage>
  );
}
