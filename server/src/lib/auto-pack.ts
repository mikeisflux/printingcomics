/**
 * Bin-packing shared by the checkout shipping quote and fulfillment's
 * Auto-pack, so the customer is charged for the boxes that will actually
 * ship.
 *
 * Units carry a weight and, when known, a footprint and thickness (books
 * from trim size and page count, prints from their size). Packages carry
 * inner dimensions and an optional max packed weight. A unit "fits" a
 * package when its footprint lies on one face of the box in some
 * orientation and its weight is within the cap; what it uses up is its share
 * of that face (a 6.6×10.3 comic in a 12×9 mailer stacks one column, so it
 * uses the whole 12×9 face) times its thickness — so a box is "full" when
 * the stacks reach the lid, not when some abstract volume is used.
 *
 * Choosing boxes: for each package type that could take every unit, the
 * units are poured into boxes of that type first-fit; the type that needs the
 * fewest boxes wins (ties → the smallest box). Every box is then shrunk to
 * the smallest package that still holds its contents, so a 25-copy order
 * never ships in the 300-copy carton. Units that no single package can take
 * come back as `unpacked`.
 */

export interface UnitDims {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
}

export interface UnitToPack {
  orderItemId: string;
  weightOz: number;
  /** The only package this unit may go in (Product.packageId), if any. */
  packageId?: string | null;
  /** Footprint and thickness, when known. Unknown → weight is the only limit. */
  dims?: UnitDims | null;
  /**
   * Boxes this unit may ship in, with the share of the box's count it takes
   * (a 25-pack of mailers in the box that holds 50 is 0.5). Set from a stock
   * pool's boxes; outranks `packageId` and `dims`.
   */
  allowed?: { packageId: string; share: number }[] | null;
}

export interface PackageOption {
  id: string;
  name: string;
  maxWeightOz: number | null;   // null → the default cap below
  emptyWeightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  costCents?: number;
  sortOrder?: number;
  /**
   * Claimed by a product (ships in its own box) or a stock pool's boxes: only
   * those units go in it. Anything else is packed from the open boxes, so a
   * few comics are never quoted in the Comic Armor box or a mailer carton.
   */
  reserved?: boolean;
}

export interface PackedBox {
  packageId: string;
  packageName: string;
  allocations: { orderItemId: string; quantity: number }[];
  contentWeightOz: number;
  emptyWeightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** Share of the box's inside used by the contents (0–1; 0 when sizes are unknown). */
  fill: number;
}

export interface PackPlan {
  boxes: PackedBox[];
  unpacked: UnitToPack[];   // items too heavy or too big for any single box
}

/**
 * A box with no max packed weight is capped at 50 lb: carriers take up to
 * 70 lb, but a heavier carton of books is unsafe to lift and splits anyway.
 */
export const DEFAULT_MAX_PACKED_OZ = 50 * 16;

/** How much the contents may weigh: the max packed weight less the empty box. */
export function weightCapOz(p: PackageOption): number {
  const packed = p.maxWeightOz && p.maxWeightOz > 0 ? p.maxWeightOz : DEFAULT_MAX_PACKED_OZ;
  return Math.max(1, packed - Math.max(0, p.emptyWeightOz));
}

/**
 * A product that names its own box but has no packed size, in a box with no
 * max packed weight, ships one per box: weight alone cannot say how many
 * fit, and that is what the product editor promises.
 */
function onePerBox(unit: UnitToPack, p: PackageOption): boolean {
  return !!unit.packageId && unit.packageId === p.id && !unit.dims && !(p.maxWeightOz && p.maxWeightOz > 0);
}

export function volumeIn3(p: PackageOption): number {
  return p.lengthIn * p.widthIn * p.heightIn;
}

/**
 * Cubic inches of `p` one unit uses, counting the face area its column
 * wastes; Infinity when it does not fit in any orientation, 0 when its size is
 * unknown.
 */
export function unitShareIn3(unit: UnitToPack, p: PackageOption): number {
  if (!unit.dims) return 0;
  const { lengthIn: a, widthIn: b, thicknessIn: t } = unit.dims;
  if (!(a > 0) || !(b > 0) || !(t > 0)) return 0;
  const dims = [p.lengthIn, p.widthIn, p.heightIn];
  let best = Infinity;
  for (let k = 0; k < 3; k++) {
    // Columns stand along axis k; the other two dims are the face they sit on.
    const height = dims[k]!;
    if (t > height + 1e-9) continue;
    const [f1, f2] = dims.filter((_, i) => i !== k) as [number, number];
    const columns = Math.max(Math.floor(f1 / a) * Math.floor(f2 / b), Math.floor(f1 / b) * Math.floor(f2 / a));
    if (columns < 1) continue;
    best = Math.min(best, ((f1 * f2) / columns) * t);
  }
  return best;
}

/** Share of box `p`'s count this unit takes: Infinity when the box is not on its list. */
function countShare(unit: UnitToPack, p: PackageOption): number {
  if (!unit.allowed) return 0;
  const entry = unit.allowed.find((a) => a.packageId === p.id);
  return entry && entry.share > 0 ? entry.share : Infinity;
}

function fits(unit: UnitToPack, p: PackageOption): boolean {
  return unit.weightOz <= weightCapOz(p) && unitShareIn3(unit, p) <= volumeIn3(p) && countShare(unit, p) <= 1 + 1e-9;
}

interface OpenBox {
  pkg: PackageOption;
  units: UnitToPack[];
  weightOz: number;
  usedIn3: number;
  /** Of the box's count (0–1), for units with an allowed-boxes list. */
  countUsed: number;
}

function canAdd(box: OpenBox, unit: UnitToPack): boolean {
  if (box.units.length > 0 && (onePerBox(unit, box.pkg) || box.units.some((u) => onePerBox(u, box.pkg)))) return false;
  const share = unitShareIn3(unit, box.pkg);
  const count = countShare(unit, box.pkg);
  return share !== Infinity && count !== Infinity
    && box.weightOz + unit.weightOz <= weightCapOz(box.pkg)
    && box.usedIn3 + share <= volumeIn3(box.pkg) + 1e-9
    && box.countUsed + count <= 1 + 1e-9;
}

function add(box: OpenBox, unit: UnitToPack): void {
  box.units.push(unit);
  box.weightOz += unit.weightOz;
  box.usedIn3 += unitShareIn3(unit, box.pkg);
  box.countUsed += countShare(unit, box.pkg);
}

/** Biggest first, so the small ones fill the gaps. */
function sortForPacking(units: UnitToPack[], p: PackageOption): UnitToPack[] {
  const size = (u: UnitToPack) => (u.allowed ? countShare(u, p) : unitShareIn3(u, p));
  return [...units].sort((x, y) => (size(y) - size(x)) || (y.weightOz - x.weightOz));
}

/** Pour every unit into boxes of one package type, first-fit. */
function fillWith(units: UnitToPack[], p: PackageOption): OpenBox[] {
  const open: OpenBox[] = [];
  for (const unit of sortForPacking(units, p)) {
    const box = open.find((b) => canAdd(b, unit));
    if (box) add(box, unit);
    else {
      const fresh: OpenBox = { pkg: p, units: [], weightOz: 0, usedIn3: 0, countUsed: 0 };
      add(fresh, unit);
      open.push(fresh);
    }
  }
  return open;
}

/** Smallest first: by inside volume, then cost, then the admin's order. */
function byVolume(a: PackageOption, b: PackageOption): number {
  return (volumeIn3(a) - volumeIn3(b)) || ((a.costCents ?? 0) - (b.costCents ?? 0)) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.name.localeCompare(b.name);
}

/** The smallest package that holds this box's contents (its own type at worst). */
function shrink(box: OpenBox, packages: PackageOption[]): OpenBox {
  for (const p of [...packages].sort(byVolume)) {
    if (volumeIn3(p) >= volumeIn3(box.pkg)) break;
    if (box.weightOz > weightCapOz(p)) continue;
    let used = 0;
    let count = 0;
    let ok = true;
    for (const u of box.units) {
      const share = unitShareIn3(u, p);
      const c = countShare(u, p);
      if (share === Infinity || c === Infinity || u.weightOz > weightCapOz(p)) { ok = false; break; }
      used += share;
      count += c;
    }
    if (ok && used <= volumeIn3(p) + 1e-9 && count <= 1 + 1e-9) return { ...box, pkg: p, usedIn3: used, countUsed: count };
  }
  return box;
}

function toPacked(box: OpenBox): PackedBox {
  const allocations: { orderItemId: string; quantity: number }[] = [];
  for (const u of box.units) {
    const a = allocations.find((x) => x.orderItemId === u.orderItemId);
    if (a) a.quantity += 1; else allocations.push({ orderItemId: u.orderItemId, quantity: 1 });
  }
  return {
    packageId: box.pkg.id,
    packageName: box.pkg.name,
    allocations,
    contentWeightOz: +box.weightOz.toFixed(3),
    emptyWeightOz: box.pkg.emptyWeightOz,
    lengthIn: box.pkg.lengthIn,
    widthIn: box.pkg.widthIn,
    heightIn: box.pkg.heightIn,
    fill: volumeIn3(box.pkg) > 0 ? Math.min(1, box.usedIn3 / volumeIn3(box.pkg)) : 0,
  };
}

function packOnce(units: UnitToPack[], packages: PackageOption[]): PackPlan {
  if (units.length === 0) return { boxes: [], unpacked: [] };
  if (packages.length === 0) return { boxes: [], unpacked: [...units] };

  // Anything no package can take on its own is reported, not silently dropped.
  const unpacked = units.filter((u) => !packages.some((p) => fits(u, p)));
  const packable = units.filter((u) => !unpacked.includes(u));
  if (packable.length === 0) return { boxes: [], unpacked };

  const sorted = [...packages].sort(byVolume);
  const takesAll = sorted.filter((p) => packable.every((u) => fits(u, p)));

  let open: OpenBox[];
  if (takesAll.length > 0) {
    // Fewest boxes wins; `sorted` is smallest-first so a tie keeps the smaller box.
    let best: OpenBox[] | null = null;
    for (const p of takesAll) {
      const plan = fillWith(packable, p);
      if (!best || plan.length < best.length) best = plan;
    }
    open = best!;
  } else {
    // No single type suits every unit: each unit opens the smallest box that
    // takes it, after trying the boxes already open.
    open = [];
    for (const unit of sortForPacking(packable, sorted[sorted.length - 1]!)) {
      const box = open.find((b) => canAdd(b, unit));
      if (box) { add(box, unit); continue; }
      const p = sorted.find((q) => fits(unit, q))!;
      const fresh: OpenBox = { pkg: p, units: [], weightOz: 0, usedIn3: 0, countUsed: 0 };
      add(fresh, unit);
      open.push(fresh);
    }
  }

  return { boxes: open.map((b) => toPacked(shrink(b, sorted))), unpacked };
}

export function autoPack(units: UnitToPack[], packages: PackageOption[]): PackPlan {
  if (packages.length === 0) return { boxes: [], unpacked: [...units] };

  // Units with their own list of boxes (a stock pool's: mailers go in the
  // box that takes 50 or the one that takes 135) are packed among themselves
  // into those boxes; units that name one box are packed into that box only
  // (a 135 case never lands in a comic mailer); the rest use the whole
  // catalogue. Plans are merged.
  const groups = new Map<string, { units: UnitToPack[]; packages: PackageOption[] }>();
  for (const u of units) {
    let key = '';
    let allowed = packages;
    if (u.allowed && u.allowed.length > 0) {
      const ids = u.allowed.map((a) => a.packageId).filter((id) => packages.some((p) => p.id === id)).sort();
      if (ids.length > 0) { key = `list:${ids.join(',')}`; allowed = packages.filter((p) => ids.includes(p.id)); }
    } else if (u.packageId && packages.some((p) => p.id === u.packageId)) {
      key = u.packageId;
      allowed = packages.filter((p) => p.id === u.packageId);
    }
    if (key === '') {
      // Open boxes only, unless every box is spoken for.
      const open = packages.filter((p) => !p.reserved);
      allowed = open.length > 0 ? open : packages;
    }
    const g = groups.get(key) ?? { units: [], packages: allowed };
    g.units.push(u);
    groups.set(key, g);
  }
  const merged: PackPlan = { boxes: [], unpacked: [] };
  for (const g of groups.values()) {
    const plan = packOnce(g.units, g.packages);
    merged.boxes.push(...plan.boxes);
    merged.unpacked.push(...plan.unpacked);
  }
  return merged;
}
