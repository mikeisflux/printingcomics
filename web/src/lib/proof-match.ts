/**
 * Guess which order line, and which proof slot, an uploaded proof file is for
 * — from nothing but its file name.
 *
 * Staff name proofs after the book, usually after the customer's own file:
 * "Unity Cosplay Gallery #28 vol 1.2 - cover.pdf", "vol4_int.pdf",
 * "UCG28 v3 cvr.pdf". So the name carries the title words, the issue /
 * volume number, and often a word for the slot. Each line's title and the
 * customer's upload names are the candidates; the numbers are what tell
 * "vol 1" from "vol 1.2", so they weigh double and must all be present for a
 * match to count as confident. Anything unconfident falls back to the old
 * rule (the first slot nothing has been assigned to yet) and is flagged so
 * staff look at it.
 */

export interface MatchItem {
  id: string;
  /** Product name, e.g. `Comic Book — Standard (6.625" × 10.25")`. */
  name: string;
  /** The customer's "Title of Comic", '' when none. */
  title: string;
  /** Original names of the files the customer uploaded for this line. */
  uploads: string[];
  /** Proof slots this line needs: ['cover', 'interior'] or ['artwork']. */
  kinds: string[];
}

export interface Match {
  itemId: string;
  kind: string;
  /** False when the name matched nothing well and the slot was picked by order. */
  confident: boolean;
}

const NUMERIC = /^\d+(\.\d+)?$/;

// Words that say nothing about WHICH book: file-type and version chatter, and
// the labels that precede a number ("vol 3", "issue #3", "v3" all mean 3).
const NOISE = new Set([
  'proof', 'proofs', 'pdf', 'final', 'print', 'press', 'ready', 'file', 'copy', 'draft', 'export', 'rev', 'revised',
  'the', 'a', 'an', 'of', 'and',
  'v', 'ver', 'version', 'vol', 'volume', 'issue', 'no', 'num', 'number', 'ed', 'edition', 'pt', 'part', 'book',
]);

const COVER = new Set(['cover', 'covers', 'cvr', 'cov', 'wrap', 'wraparound', 'jacket', 'dustjacket']);
const INTERIOR = new Set(['interior', 'interiors', 'int', 'inside', 'insides', 'guts', 'pages', 'body', 'inner', 'internal', 'text']);
const ARTWORK = new Set(['artwork', 'art', 'poster', 'plate']);

/**
 * Lower-cased words and numbers; "1.2" stays one token, "vol1" splits, "#28"
 * → "28". A trailing "(1)" / " - Copy" from a browser's duplicate download is
 * dropped first — that number is not part of any title.
 */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.(pdf|png|jpe?g|tiff?|psd|ai|indd|zip|rar|7z)$/i, '')
    .replace(/(\s*\(\d+\)|\s*-\s*copy(\s*\(\d+\))?)\s*$/i, '')
    .replace(/(\d)[.,](\d)/g, '$1\u0001$2')          // protect decimals: 1.2, 1,2
    .replace(/([a-z])(\d)/g, '$1 $2')                 // vol1 → vol 1
    .replace(/(\d)([a-z])/g, '$1 $2')                 // 28b → 28 b
    .replace(/[^a-z0-9\u0001]+/g, ' ')
    .replace(/\u0001/g, '.')
    .split(' ')
    .filter((t) => t && !NOISE.has(t));
}

function weight(t: string): number {
  return NUMERIC.test(t) ? 2 : 1;
}

function multiset(ts: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

interface Scored {
  /** Every number in the file name appears in the candidate (or the file has none). */
  numbersMatch: boolean;
  /**
   * The numbers actively disagree: the candidate has one the file lacks AND
   * the file has one the candidate lacks ("vol 22" against "vol 1"). A file
   * with merely an extra number ("vol 1 (2).pdf") does not disagree.
   */
  disagree: boolean;
  /** Weighted share of the candidate's tokens found in the file name. */
  coverage: number;
  /** Weighted count of tokens that matched. */
  hit: number;
  /** Candidate tokens, for working out which words were NOT part of the title. */
  candidate: string[];
}

function scoreCandidate(file: string[], candidate: string[]): Scored {
  const remaining = multiset(file);
  let hit = 0;
  let total = 0;
  for (const t of candidate) {
    const w = weight(t);
    total += w;
    const n = remaining.get(t) ?? 0;
    if (n > 0) { hit += w; remaining.set(t, n - 1); }
  }
  const fileNumbers = new Set(file.filter((t) => NUMERIC.test(t)));
  const candNumbers = new Set(candidate.filter((t) => NUMERIC.test(t)));
  const numbersMatch = fileNumbers.size > 0 && [...fileNumbers].every((n) => candNumbers.has(n));
  const disagree = [...candNumbers].some((n) => !fileNumbers.has(n)) && [...fileNumbers].some((n) => !candNumbers.has(n));
  return { numbersMatch, disagree, coverage: total ? hit / total : 0, hit, candidate };
}

function better(a: Scored, b: Scored | null): boolean {
  if (!b) return true;
  if (a.numbersMatch !== b.numbersMatch) return a.numbersMatch;
  if (a.coverage !== b.coverage) return a.coverage > b.coverage;
  return a.hit > b.hit;
}

/** The slot word left over once the matched title's own words are removed. */
function kindHint(file: string[], matched: string[]): string | null {
  const rest = multiset(file);
  for (const t of matched) {
    const n = rest.get(t) ?? 0;
    if (n > 0) rest.set(t, n - 1);
  }
  const left = [...rest.entries()].filter(([, n]) => n > 0).map(([t]) => t);
  if (left.some((t) => COVER.has(t))) return 'cover';
  if (left.some((t) => INTERIOR.has(t))) return 'interior';
  if (left.some((t) => ARTWORK.has(t))) return 'artwork';
  return null;
}

/** The first slot of `item` nobody has claimed yet, else its first slot. */
function openKind(item: MatchItem, taken: Set<string>): string {
  return item.kinds.find((k) => !taken.has(`${item.id}:${k}`)) ?? item.kinds[0] ?? 'artwork';
}

/** The old rule: the first unclaimed slot on any line, in order. */
function byOrder(items: MatchItem[], taken: Set<string>): Match | null {
  for (const it of items) {
    for (const k of it.kinds) {
      if (!taken.has(`${it.id}:${k}`)) return { itemId: it.id, kind: k, confident: false };
    }
  }
  const first = items[0];
  return first ? { itemId: first.id, kind: first.kinds[0] ?? 'artwork', confident: false } : null;
}

/**
 * Pick the line + slot for one file. `taken` holds "itemId:kind" for slots
 * already sent or already assigned in this batch, so two unlabelled files
 * for the same book land on cover then interior rather than both on cover.
 */
export function matchProofFile(fileName: string, items: MatchItem[], taken: Set<string>): Match | null {
  if (items.length === 0) return null;
  const file = tokens(fileName);
  if (file.length === 0) return byOrder(items, taken);

  let bestItem: MatchItem | null = null;
  let best: Scored | null = null;
  let tie = false;
  for (const it of items) {
    const candidates = [it.title, ...it.uploads].map(tokens).filter((c) => c.length > 0);
    for (const c of candidates) {
      const s = scoreCandidate(file, c);
      if (better(s, best)) { best = s; bestItem = it; tie = false; }
      else if (best && bestItem !== it && s.numbersMatch === best.numbersMatch && s.coverage === best.coverage && s.hit === best.hit) {
        // Same score on another line (e.g. the same book ordered with two
        // cover types): prefer whichever still has an open slot.
        const openHere = it.kinds.some((k) => !taken.has(`${it.id}:${k}`));
        const openBest = bestItem!.kinds.some((k) => !taken.has(`${bestItem!.id}:${k}`));
        if (openHere && !openBest) { best = s; bestItem = it; tie = false; }
        else tie = true;
      }
    }
  }

  // Confident: nothing contradicts, and either every number lines up or most
  // of the title is there. One-word titles ("Sunset") count when fully present.
  const confident = !!best && !!bestItem && !best.disagree
    && (best.hit >= 2 || best.coverage === 1)
    && (best.numbersMatch || best.coverage >= 0.6);
  if (!confident || !bestItem || !best) return byOrder(items, taken);
  void tie;

  const hint = kindHint(file, best.candidate);
  const kind = hint && bestItem.kinds.includes(hint) ? hint : openKind(bestItem, taken);
  return { itemId: bestItem.id, kind, confident: true };
}
