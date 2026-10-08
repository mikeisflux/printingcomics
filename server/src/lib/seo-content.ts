/**
 * The copy of the search-landing pages, as data: served to the storefront
 * through /api/public/pages/<slug> and rendered into the page shell for
 * crawlers, so a visitor and a search engine read the same words. Product
 * cards on these pages are live listings, not copies.
 *
 * Pages:
 *   comic-book-mailers         — the page for "comic book mailers"
 *   how-to-ship-comic-books    — the guide that feeds it (and ranks on its own)
 */
import { prisma } from '../db.js';
import { availabilityOf, faqEntries, type SeoProduct } from './seo.js';

export interface PageSection {
  heading?: string;
  /** Paragraphs; a line starting with "- " is a bullet. */
  body: string[];
  /** Optional ordered steps rendered as a numbered list. */
  steps?: { title: string; text: string }[];
  /** Render the product grid of this product line after the section. */
  products?: 'mailers' | 'armor';
}

export interface PageContent {
  slug: string;
  path: string;
  eyebrow: string;
  title: string;          // the H1
  metaTitle: string;      // <title>
  metaDescription: string;
  intro: string;
  sections: PageSection[];
  faq: { q: string; a: string }[];
  related: { label: string; path: string }[];
  image: string;
  type: 'website' | 'article';
  lastReviewed: string;   // ISO date — the sitemap's lastmod
}

export interface PageProductCard {
  slug: string;
  name: string;
  shortDescription: string | null;
  priceCents: number;
  /** Mailers or sleeves in the pack, and the price each — the number people compare. */
  units: number;
  perUnitCents: number;
  image: string | null;
  imageAlt: string | null;
  availability: string;
  faq: { q: string; a: string }[];
}

export const PAGES: Record<string, PageContent> = {
  'comic-book-mailers': {
    slug: 'comic-book-mailers',
    path: '/comic-book-mailers',
    eyebrow: 'Shipping supplies',
    title: 'Comic Book Mailers',
    metaTitle: 'Comic Book Mailers — Adjustable T-Fold Mailers for Shipping Comics',
    metaDescription: 'Comic book mailers that fold to fit 1 to 10 bagged-and-boarded comics. Heavy kraft corrugated, ship flat, store flat. Packs of 10 to 135, priced per mailer. From the comic printers at Printing Comics.',
    intro: 'One comic book mailer that fits every order: fold it to the thickness of what you are shipping, from a single bagged-and-boarded issue to a stack of ten. No sizes to guess, no void fill, no comics rattling around in a box that was too big.',
    image: '/products/T-Fold_Comic_Mailer_1.jpg',
    type: 'website',
    lastReviewed: '2026-10-08',
    sections: [
      {
        heading: 'One mailer, four depths',
        body: [
          'Most comic book mailers come in fixed sizes — one for a single issue, another for a few, another for a run — and you eat the postage on whichever one you guessed wrong. Our T-fold comic mailer has a ladder of score lines built into the blank. Fold on the line that matches your stack and the walls close on the comics themselves, so a single book ships as snugly as ten.',
          'Because the mailer folds down to the real thickness, there is nothing to pad out: no bubble wrap, no peanuts, no extra ounces on the scale.',
        ],
      },
      {
        heading: 'Built for comics, by comic printers',
        body: [
          '- Sized for standard current-age and silver-age comics in bags with backing boards — trade paperbacks and graphic novels too.',
          '- Heavy kraft corrugated board that resists corner dings and spine rolls in transit.',
          '- Ships flat and stores flat: a pack sits on a shelf until you need one, then folds up in seconds with no tape gun needed to hold the shape.',
          '- Seals with a strip of packing tape; takes a shipping label on the flat top panel.',
          '- Made by a comic printing company that ships thousands of books a year in the same mailers.',
        ],
      },
      {
        heading: 'Pick a pack',
        body: [
          'Every pack is the same mailer; the only difference is how many you keep on the shelf. The price per mailer is shown on each pack so you can compare straight across. Orders ship from our shop in Indiana.',
        ],
        products: 'mailers',
      },
      {
        heading: 'How to ship a comic in a T-fold mailer',
        body: [],
        steps: [
          { title: 'Bag and board', text: 'Put the comic in a bag with a backing board — the board is what keeps the spine straight.' },
          { title: 'Slide it into Comic Armor', text: 'Optional but recommended for anything valuable: a Comic Armor sleeve wraps the bagged book in a rigid, cushioned shell.' },
          { title: 'Fold to fit', text: 'Lay the stack on the mailer, fold the side walls on the score line that matches its thickness, bring the T-flap over and tape it down.' },
          { title: 'Label and ship', text: 'Stick the label on the flat top. The mailer travels as a small parcel with USPS, UPS or FedEx.' },
        ],
      },
      {
        heading: 'Pair it with Comic Armor',
        body: [
          'A mailer protects the outside of the parcel; Comic Armor protects the book inside it. The sleeves are sold in packs that mirror the mailers, two sleeves to a mailer, and ship in the same box when you order both.',
        ],
        products: 'armor',
      },
    ],
    faq: [
      { q: 'What size comic book mailer do I need?', a: 'One size. The T-fold mailer is scored at several depths, so the same mailer ships one bagged-and-boarded comic or a stack of up to ten. Fold on the score line that matches your stack.' },
      { q: 'How many comics fit in one mailer?', a: 'From one to about ten standard comics, bagged and boarded. Thick trade paperbacks and graphic novels fit one or two to a mailer, depending on their spine.' },
      { q: 'Do these mailers fit golden-age or magazine-size comics?', a: 'They are sized for current-age and silver-age comics in bags and boards, and for trades and graphic novels of the same footprint. Oversized magazine-format books need a larger mailer.' },
      { q: 'Can I ship comics with USPS Media Mail in these?', a: 'The mailer works with any carrier, but Media Mail eligibility is the carrier’s call: USPS excludes items that contain advertising, which rules out most comics. Most sellers ship comics as a small parcel (USPS Ground Advantage or Priority Mail).' },
      { q: 'Do I need bubble wrap or packing peanuts?', a: 'No. Folding the mailer down to the exact thickness is what stops the contents from shifting, so there is nothing to pad out.' },
      { q: 'How are the mailers shipped to me?', a: 'Flat, in a box: packs of up to 50 ship in one carton and larger quantities in a bigger carton, so they arrive unbent and store flat on a shelf.' },
      { q: 'Is there a bulk price?', a: 'The 135-pack is the bulk price per mailer. Shops and sellers moving more than that can contact us for a quote.' },
      { q: 'Do you ship to Canada or overseas?', a: 'Checkout quotes live carrier rates to the address you enter, so you will see the exact postage before you pay.' },
    ],
    related: [
      { label: 'How to ship comic books so they arrive mint', path: '/resources/how-to-ship-comic-books' },
      { label: 'Comic Armor shipping sleeves', path: '/shop/shipping-supplies' },
      { label: 'Print your own comic book', path: '/shop/comic-books' },
    ],
  },

  'how-to-ship-comic-books': {
    slug: 'how-to-ship-comic-books',
    path: '/resources/how-to-ship-comic-books',
    eyebrow: 'Guide',
    title: 'How to Ship Comic Books So They Arrive Mint',
    metaTitle: 'How to Ship Comic Books Safely — Packing Guide for Collectors and Sellers',
    metaDescription: 'How to ship comic books without dings, bends or water damage: bag and board, Comic Armor sleeves, the right comic book mailer, taping, labeling and which USPS service to use.',
    intro: 'A comic survives the mail when three things are true: the spine cannot bend, the corners cannot take a hit, and nothing inside the parcel can move. Here is the packing method we use for every book that leaves our print shop.',
    image: '/products/T-Fold_Comic_Mailer_2.jpg',
    type: 'article',
    lastReviewed: '2026-10-08',
    sections: [
      {
        heading: 'What you need',
        body: [
          '- A polypropylene bag and an acid-free backing board for each comic.',
          '- Comic Armor sleeves, one per book or per small stack, for anything you would hate to see creased.',
          '- A comic book mailer that folds to the thickness of the stack.',
          '- Packing tape and a shipping label. No bubble wrap, no peanuts.',
        ],
      },
      {
        heading: 'Step by step',
        body: [],
        steps: [
          { title: 'Bag and board every book', text: 'The board keeps the spine straight and the bag keeps moisture and fingerprints off the cover. Tape the bag flap to the back of the bag, never across the comic.' },
          { title: 'Armor the valuable ones', text: 'Slide the bagged comic into a Comic Armor sleeve. The rigid, cushioned shell takes the corner hits and the bends that a bag and board cannot.' },
          { title: 'Build one tight stack', text: 'Stack the books face up with the spines on the same side. Two or more sleeves can share a mailer as long as the stack is even.' },
          { title: 'Fold the mailer to the stack', text: 'Lay the stack on the T-fold mailer and fold the side walls on the score line that matches its thickness. The walls should touch the stack; if they do not, fold on the next line down.' },
          { title: 'Close and tape', text: 'Bring the T-flap over the top and run one strip of tape along the seam, then one across each end. Press the tape down — most carrier damage starts with a flap that worked loose.' },
          { title: 'Label the flat side', text: 'Put the shipping label on the flat top panel, away from the seams, and add a “do not bend” note if you like. It is a reminder, not a guarantee, which is why the packing matters more.' },
        ],
      },
      {
        heading: 'Which shipping service to use',
        body: [
          'A single comic in a mailer weighs well under a pound, so USPS Ground Advantage is the usual pick in the United States; Priority Mail buys speed and insurance for valuable books. UPS and FedEx Ground make sense for heavy stacks and for multi-box orders.',
          'Media Mail is tempting but USPS excludes items that contain advertising, which rules out most comics. Ship them as a small parcel and keep the tracking number.',
          'Shipping a print run? Our configurator quotes live carrier rates for the exact box count when you order comics or mailers from us.',
        ],
      },
      {
        heading: 'Mistakes that damage comics in the mail',
        body: [
          '- A box with room to move: the comic slides and the corners take every bump. Fold the mailer down until the walls touch the stack.',
          '- Tape across the comic bag opening onto the cover: it lifts ink when it is removed.',
          '- Rubber bands around a stack: they dent the edges of every book in it.',
          '- Padded envelopes on their own: they bend. Bubble mailers are for things that are not flat.',
          '- Mixing thick and thin books in one stack: the thin ones bend around the thick one. Make even stacks.',
        ],
      },
    ],
    faq: [
      { q: 'How do I ship a single comic book?', a: 'Bag and board it, put it in a Comic Armor sleeve if it is worth more than the postage, fold a T-fold comic mailer down to the single-issue score line, tape the seam and ship it as a small parcel with tracking.' },
      { q: 'Can comic books go Media Mail?', a: 'USPS Media Mail excludes items that contain advertising, which rules out most comics. Use Ground Advantage or Priority Mail and keep the tracking number.' },
      { q: 'How much does it cost to ship a comic book?', a: 'A bagged, boarded comic in a mailer weighs a few ounces, so domestic small-parcel postage is usually in the single digits. Checkout on our site quotes the live rate to the address you enter.' },
      { q: 'How do I ship a stack of comics?', a: 'Keep the stack even, sleeve the valuable ones, and fold the mailer on the score line that matches the stack. Ten standard comics fit one T-fold mailer; more than that, use a second mailer or a box with the stacks packed tight.' },
      { q: 'Should I write “do not bend” on the package?', a: 'It does not hurt, but carriers do not treat it as an instruction. The packing is what keeps the book flat: a rigid sleeve and a mailer folded to the stack.' },
    ],
    related: [
      { label: 'Comic book mailers', path: '/comic-book-mailers' },
      { label: 'Comic Armor shipping sleeves', path: '/shop/shipping-supplies' },
      { label: 'File prep for printing your comic', path: '/resources/file-prep' },
    ],
  },
};

/** The live product cards a page shows, cheapest pack first. */
export async function pageProducts(line: 'mailers' | 'armor'): Promise<PageProductCard[]> {
  const prefix = line === 'mailers' ? 't-mailer-' : 'comic-armor-';
  const products = await prisma.product.findMany({
    where: { active: true, slug: { startsWith: prefix } },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, stockPool: { select: { units: true } } },
    orderBy: { priceCents: 'asc' },
  });
  return products.map((p) => {
    const units = Math.max(1, p.unitsPerItem || Number((p.slug.match(/-(\d+)-pack$/) ?? [])[1]) || 1);
    return {
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      priceCents: p.priceCents,
      units,
      perUnitCents: Math.round(p.priceCents / units),
      image: p.images[0]?.url ?? null,
      imageAlt: p.images[0]?.alt ?? null,
      availability: availabilityOf(p as unknown as SeoProduct),
      faq: faqEntries(p.faq),
    };
  });
}

export async function loadPage(slug: string): Promise<(PageContent & { products: Record<string, PageProductCard[]> }) | null> {
  const page = PAGES[slug];
  if (!page) return null;
  const lines = [...new Set(page.sections.map((s) => s.products).filter((x): x is 'mailers' | 'armor' => !!x))];
  const products: Record<string, PageProductCard[]> = {};
  for (const line of lines) products[line] = await pageProducts(line);
  return { ...page, products };
}
