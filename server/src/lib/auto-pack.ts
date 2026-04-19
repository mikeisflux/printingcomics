/**
 * Automatic bin-packing for order fulfillment.
 *
 * Given a list of "units" (individual item copies with a weight each) and a
 * catalog of available packages (box types with a max weight), produce a
 * plan that tells you which items go in which box. Uses first-fit-decreasing
 * by weight — a standard 1-D bin-packing heuristic that's within ~22% of
 * optimal in the worst case and much better in practice for the workloads
 * we see (comics in mailers).
 *
 * We pack on WEIGHT only, not volume. Comics are thin and stackable — the
 * dominant real-world constraint at the mail-tier is weight, and carriers
 * penalise dimensional-weight only at much larger box sizes than we ship.
 * If you later want volume/dimensional packing, extend PackageOption with
 * dimension caps and track remaining capacity per box.
 */

export interface UnitToPack {
  orderItemId: string;
  weightOz: number;
}

export interface PackageOption {
  id: string;
  name: string;
  maxWeightOz: number | null;   // null → no cap (effectively unlimited)
  emptyWeightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

export interface PackedBox {
  packageId: string;
  packageName: string;
  allocations: { orderItemId: string; quantity: number }[];
  contentWeightOz: number;
  emptyWeightOz: number;
}

export interface PackPlan {
  boxes: PackedBox[];
  unpacked: UnitToPack[];   // items too heavy for any single box
}

function capOf(p: PackageOption): number {
  return p.maxWeightOz ?? Infinity;
}

export function autoPack(
  units: UnitToPack[],
  packages: PackageOption[],
): PackPlan {
  if (packages.length === 0) return { boxes: [], unpacked: [...units] };

  // Packages sorted smallest-capacity-first; we prefer to open the tightest
  // box that still fits each unit so mid-sized orders don't always grab the
  // biggest mailer.
  const byCapAsc = [...packages].sort((a, b) => capOf(a) - capOf(b));

  // Pack the heaviest units first — FFD.
  const sorted = [...units].sort((a, b) => b.weightOz - a.weightOz);

  const open: (PackedBox & { cap: number })[] = [];
  const unpacked: UnitToPack[] = [];

  for (const unit of sorted) {
    // Try to fit into an already-open box.
    const fit = open.find((b) => b.contentWeightOz + unit.weightOz <= b.cap);
    if (fit) {
      const existing = fit.allocations.find((a) => a.orderItemId === unit.orderItemId);
      if (existing) existing.quantity += 1;
      else fit.allocations.push({ orderItemId: unit.orderItemId, quantity: 1 });
      fit.contentWeightOz += unit.weightOz;
      continue;
    }
    // No open box fits — open a new one. Pick the smallest package that
    // can hold this unit all by itself.
    const newPkg = byCapAsc.find((p) => capOf(p) >= unit.weightOz);
    if (!newPkg) {
      // Even the biggest box can't hold this one item — flag it.
      unpacked.push(unit);
      continue;
    }
    open.push({
      packageId: newPkg.id,
      packageName: newPkg.name,
      allocations: [{ orderItemId: unit.orderItemId, quantity: 1 }],
      contentWeightOz: unit.weightOz,
      emptyWeightOz: newPkg.emptyWeightOz,
      cap: capOf(newPkg),
    });
  }

  return {
    boxes: open.map(({ cap: _cap, ...rest }) => rest),
    unpacked,
  };
}
