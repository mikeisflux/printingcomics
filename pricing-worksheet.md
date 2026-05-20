# Printing Comics — Cost Model & Pricing Worksheet

Purpose: capture every real cost of producing a book so we can set prices that
undercut the competition **and** still clear a profit. We fill this in
together; once the inputs are complete I turn it into the actual
`pricing-config` numbers seeded into each product.

**How to answer:** reply with the question number and the value, e.g.
`Q7: $450/mo` or `Q17: 80lb gloss = $0.07/sheet`. Ranges and "don't know yet"
are fine — we refine as we go.

Legend: ✅ answered · ❓ open · 🔢 derived (I calculate it)

---

## Known inputs so far

| Item | Value | Source |
|------|-------|--------|
| Printer lease | **$1,900 / month** | given |
| Click rate | **$0.045 / click** | given |
| Tabloid sheet (11×17 or 12×18), duplex | **4 clicks** = **$0.18 / sheet** | given |

Derived from the above:
- 1 side of a tabloid sheet = 2 clicks = **$0.09 / side**
- A tabloid sheet counts double because the press meters large format as
  2 letter-equivalent clicks per side.

---

## Section 1 — Fixed monthly overhead

Everything we pay every month whether we print 1 book or 10,000. We divide
this across monthly volume to get an overhead cost per book.

- ✅ **Q1. Printer lease** — $1,900/mo
- ❓ **Q2. Does the $0.045 click rate include toner, parts, and service/
  maintenance?** (Usual for a lease CPC — confirm so we don't double-count toner.)
- ❓ **Q3. Facility rent / mortgage** — $____ /mo
- ❓ **Q4. Utilities** (electric, water, gas, internet) — $____ /mo
- ❓ **Q5. Other equipment** — leases or loan payments for binder, stitcher,
  guillotine/cutter, laminator, folder, etc. — $____ /mo (list each)
- ❓ **Q6. Software & licensing** (RIP, imposition, design, this storefront's
  hosting) — $____ /mo
- ❓ **Q7. Insurance** (business, equipment, liability) — $____ /mo
- ❓ **Q8. Anything else fixed** (loan payments, subscriptions, accountant,
  cleaning, waste removal) — $____ /mo

## Section 2 — Labor

- ❓ **Q9. Production headcount** — how many people run production, and are
  they hourly or salaried?
- ❓ **Q10. Total monthly production payroll** — $____ /mo (or hourly rate ×
  hours). Include your own time if you work the floor.
- ❓ **Q11. Prepress time per job** — file check, imposition, proofing:
  ____ minutes on an average job.
- ❓ **Q12. Run + finishing labor per job** — loading press, stitching,
  trimming, packing: ____ minutes on an average job.

## Section 3 — Press / clicks

- ✅ **Q13. Click rate** — $0.045
- ✅ **Q14. Tabloid duplex** — 4 clicks
- ❓ **Q15. Interior imposition** — how many finished comic pages come off one
  11×17 sheet? (I'm assuming **4 pages/sheet** for a folded saddle-stitch
  book — confirm or correct.)
- ❓ **Q16. Cover printing** — printed on the same press? Is a cover 1 tabloid
  sheet (4 clicks)? Any different click count for heavy stock?

## Section 4 — Paper / substrate cost — ✅ from supplier invoice

Costs taken from the most recent paper purchase order. Price UM `MS` = per
**1,000 sheets**; converted to per-sheet below. Prices are **pre-tax** — the
invoice also carried ~7% sales tax and a $6 delivery charge (see Q19b/Q19c).

- ✅ **Q17. Interior (text) stock**

  | Stock | Size | $/1,000 sh | $/sheet |
  |-------|------|-----------|---------|
  | Blazer Digital Gloss Text 80lb | 11×17 | $50.40 | **$0.0504** |

  Per you, no other paper type costs more than the Cougar sketch cover
  ($0.1393/sheet). Until exact numbers land I'll treat any *unspecified*
  interior stock as ≤ that ceiling.

- ✅ **Q18. Cover stock**

  | Stock | Size | $/1,000 sh | $/sheet |
  |-------|------|-----------|---------|
  | Blazer Digital Gloss Cover 80lb | 17×11 | $96.20 | **$0.0962** |
  | Blazer Digital Gloss Cover 100lb | 18×12 | $137.65 | **$0.1377** |
  | Cougar Digital Smooth Cover 100lb — *sketch cover* | 17×11 | $139.25 | **$0.1393** |

- ✅ **Q19. Buying format** — pre-cut tabloid sheets (11×17, 17×11, 18×12),
  bought by the carton.
- ❓ **Q19b. Sales tax** — is paper normally tax-exempt for you under a
  resale / manufacturing certificate? The sample invoice was taxed ~7%. If
  it's *not* exempt I add ~7% to every per-sheet cost above.
- ❓ **Q19c. Delivery** — roughly how many sheets per delivery, so I can
  amortize the $6 delivery charge across them? (tiny, but tidy.)

## Section 5 — Bindery & finishing

Per-book or per-job cost of everything after the press.

- ❓ **Q20. Saddle stitch** — cost to fold + staple one booklet (staples +
  labor, or machine-rated cost). $____ /book
- ❓ **Q21. Perfect binding** (graphic novels) — glue + labor per book.
  $____ /book
- ❓ **Q22. Trimming / cutting** — three-knife trim or guillotine. $____ /book
  or $____ /job
- ❓ **Q23. Lamination** — gloss film and matte film, material + labor.
  $____ per cover (gloss) / $____ per cover (matte)
- ❓ **Q24. UV coating** — UV coat vs. spot UV. $____ / $____ per cover
- ❓ **Q25. Foil stamping** — per cover by foil color, plus any one-time die/
  setup cost per job. $____ /cover + $____ die
- ❓ **Q26. Folding** — if separate from saddle stitch. $____ /book

## Section 6 — Consumables & packaging

- ❓ **Q27. Per-book consumables** not already counted — staples, glue,
  shrink-wrap. $____ /book
- ❓ **Q28. Packaging per order** — box/mailer + filler. $____ /order
  (shipping postage is quoted live via EasyPost, so we don't model it here —
  just the packaging materials.)

## Section 7 — Volume & utilization

This is how we spread the fixed overhead (Sections 1 + 2) across books.

- ❓ **Q29. Books per month** — total finished units in an average month: ____
- ❓ **Q30. Jobs/orders per month** — distinct print jobs in an average month:
  ____
- ❓ **Q31. Production days/hours per month** the press actually runs: ____
- ❓ **Q32. Allocate overhead on current or target volume?** — if we're
  growing, do we price off today's volume (safer) or a target volume
  (cheaper, riskier)?

## Section 8 — Waste & spoilage

- ❓ **Q33. Makeready waste** — sheets burned setting up an average job: ____
- ❓ **Q34. Spoilage rate** — % of the run that comes out unusable: ____ %

## Section 9 — Targets & competitor data

- ❓ **Q35. Target gross margin** — the profit % we *want* to keep on a normal
  order: ____ %
- ❓ **Q36. Margin floor** — the lowest margin we'll ever accept to win a
  price-sensitive job: ____ %
- ❓ **Q37. Competitor's new prices** — paste their price list, or the
  specific size / page-count / quantity points they undercut us on. The more
  granular the better (size, page count, quantity → their price).
- ❓ **Q38. Undercut strategy** — match them, beat by a flat % (which %), or
  price as low as the margin floor allows?

---

## 🔢 Cost model (auto-derived once inputs are in)

Per-book cost will be built as:

```
overheadPerBook   = (Section1 + Section2 fixed) / Q29 booksPerMonth
clicksPerBook     = ceil(interiorPages / Q15) sheets + 1 cover sheet,  × $0.18
paperPerBook      = interiorSheets × interiorStock$  +  1 × coverStock$
finishingPerBook  = stitch/bind + trim + lamination + uv + foil + fold
consumables       = Q27 + (Q28 / books-per-order)
laborPerBook      = (Q11 + Q12 minutes) × laborRate / booksPerJob
wasteFactor       = 1 + Q34%   (plus Q33 makeready amortized over the run)

trueCostPerBook   = (overhead + clicks + paper + finishing + consumables
                     + labor) × wasteFactor

floorPrice        = trueCostPerBook / (1 − marginFloor%)
targetPrice       = trueCostPerBook / (1 − targetMargin%)
```

Then for each competitor price point: if `competitorPrice > floorPrice`, we can
undercut and still profit; the worksheet will flag any point where we **can't**
safely beat them so you can decide.

---

## Worked example (illustrative — uses placeholder costs until real ones land)

32-page standard comic (6.625×10.25), saddle-stitch, standard gloss cover:

| Component | Sheets | Calc | Cost |
|-----------|--------|------|------|
| Interior clicks | 8 | 32pp ÷ 4 = 8 sheets × $0.18 | $1.44 |
| Cover clicks | 1 | 1 × $0.18 | $0.18 |
| Interior paper | 8 | 8 × $0.0504 (Blazer Gloss Text 80lb) | $0.40 |
| Cover paper | 1 | 1 × $0.0962 (Blazer Gloss Cover 80lb) | $0.10 |
| Bindery (stitch + trim) | — | ❓Q20 + ❓Q22 | ❓ |
| Labor | — | ❓Q11+Q12 ÷ booksPerJob | ❓ |
| Overhead | — | ❓(S1+S2) ÷ ❓Q29 | ❓ |
| **Clicks + paper subtotal** | | | **$2.12** |

Clicks + paper are now locked. Bindery, labor, and overhead unlock as the
remaining questions get answered.

---

## Change log

- _Created_ — captured printer lease ($1,900/mo), click rate ($0.045),
  tabloid duplex = 4 clicks.
- _Paper invoice_ — Section 4 answered (Q17–Q19): interior text $0.0504/sh;
  cover stocks $0.0962 / $0.1377 / $0.1393 per sheet. Worked example clicks +
  paper subtotal now $2.12 for a 32-page standard comic.
