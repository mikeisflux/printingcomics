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

> **Owner's note:** rent, utilities, software, insurance, and general
> fixed costs are absorbed by the owner's *other* business and are **not
> allocated** to the printing operation. The cost model below is therefore a
> **printing-specific / marginal cost floor** — it covers the printer lease,
> any printing-only equipment, labor, materials, and finishing. It does NOT
> claim to be a fully-loaded P&L. That's the right basis for a price fight
> (we know the true floor we can't go below), but keep in mind the "profit"
> it shows is profit *before* shared overhead.

- ✅ **Q1. Printer lease** — $1,900/mo
- ✅ **Q2. Click rate includes toner + parts + service.** No separate toner
  line — the $0.045/click is all-in on consumables and press maintenance.
- ✅ **Q3. Facility rent / mortgage** — $0 allocated (absorbed by other business)
- ✅ **Q4. Utilities** — $0 allocated (absorbed by other business)
- ✅ **Q5. Other printing equipment** — $0. No additional equipment financed.
- ✅ **Q6. Software & licensing** — $0 allocated (absorbed by other business)
- ✅ **Q7. Insurance** — $0 allocated (absorbed by other business)
- ✅ **Q8. Other fixed costs** — $0 allocated (absorbed by other business)

**Section 1 printing-specific fixed total: $1,900/mo (printer lease only).**

## Section 2 — Labor — ✅ owner-operated, not booked

- ✅ **Q9. Headcount** — owner runs all production solo; no employees.
- ✅ **Q10. Monthly payroll** — **$0 booked.** Owner's time is not charged
  into the cost model.
- ✅ **Q11/Q12. Labor time per job** — not tracked; not booked.

> ⚠️ Flagged once, then dropped: with labor at $0 the model can't tell a
> fiddly 1-copy job from an easy 1,000-copy run. Fine while you're the sole
> operator — just don't let it tempt you into underpricing tiny jobs. If you
> ever hire, we revisit this.

**Section 2 booked labor: $0.**

## Section 3 — Press / clicks

- ✅ **Q13. Click rate** — $0.045
- ✅ **Q14. Tabloid duplex** — 4 clicks ($0.18/sheet)
- ✅ **Q15. Imposition** — **4 finished pages per 11×17 sheet**, for *both*
  saddle-stitch comics and perfect-bound graphic novels.
- ✅ **Q16. Cover** — printed on the same press, same 4-click duplex
  ($0.18/sheet), regardless of stock weight.

**Click math (locked):**
- Interior sheets = `ceil(interiorPages / 4)`
- Cover = 1 sheet
- Clicks cost = `(interiorSheets + 1) × $0.18`

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

  | Stock | Size | List | $/sheet |
  |-------|------|------|---------|
  | Blazer Digital Gloss Cover 80lb | 17×11 | $96.20 /M | **$0.0962** |
  | Blazer Digital Gloss Cover 100lb | 18×12 | $137.65 /M | **$0.1377** |
  | Cougar Digital Smooth Cover 100lb — *sketch cover* | 17×11 | $139.25 /M | **$0.1393** |
  | Mirri Digital Rainbow 220gsm 11pt C2S — *foil / metallic specialty cover* | 19×13 | $1.968 /sheet | **$1.968** |

  ⚠️ The Mirri foil stock is **~14× a standard cover sheet**. Foil / holo-chrome
  cover options must carry that cost explicitly — a flat cover upcharge would
  bleed money on every foil cover sold.

- ✅ **Q19. Buying format** — pre-cut sheets (11×17, 17×11, 18×12, 19×13),
  bought by the carton.
- 🟡 **Q19b. Sales tax** — *partially answered.* The Legion Paper invoice
  carried **$0 sales tax** (resale-exempt); the earlier Blazer/Cougar invoice
  was taxed ~7%. Confirm: is paper consistently bought tax-exempt under a
  resale certificate? If yes I model all paper pre-tax (as listed above).
- ❓ **Q19c. Freight** — paper delivery runs $6–$23 per order (varies by
  carrier). Roughly what's an average freight cost per paper order, and how
  many sheets per order, so I can amortize it? (minor, but tidy.)
- ❓ **Q19d.** Which configurator options print on the Mirri foil stock —
  the "Holo-Chrome" cover, the foil cover options, or both?

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

## Section 7 — Volume & break-even

- ✅ **Q29 / Q30 / Q31 / Q32** — **business hasn't opened yet; no volume
  history.** Nothing to allocate the lease against.

Because there's no volume yet, we do **not** bake the $1,900 lease into the
per-book price (dividing by an unknown volume would be a guess). Instead:

- **Per-book price** is built purely on **marginal cost** — clicks + paper +
  finishing + consumables — plus the target margin.
- **The $1,900/mo lease is a break-even hurdle** covered by total margin:

  ```
  booksToCoverLease (per month) = $1,900 ÷ grossMarginDollarsPerBook
  ```

  Example: if an average book earns $4 of margin over marginal cost, you need
  **475 books/month** to cover the lease; everything past that is profit.

Once you've been open a few months with real numbers, we can fold the lease
in as a true per-book overhead if you want fully-loaded pricing.

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

## 🔢 Cost model

Labor = $0 (owner-operated). The lease is handled separately as a monthly
break-even hurdle (Section 7), not a per-book cost. So per-book **marginal
cost** is:

```
clicksPerBook   = (ceil(interiorPages / 4) + 1 cover) × $0.18
paperPerBook    = interiorSheets × interiorStock$  +  1 × coverStock$
finishingPerBook= saddle-stitch / perfect-bind + trim + lamination + uv
                  (per-unit materials only — labor is free)
consumables     = Q27 per-book + (Q28 packaging ÷ books-per-order)
wasteFactor     = 1 + Q34%   (+ Q33 makeready amortized over the run)

marginalCost    = (clicks + paper + finishing + consumables) × wasteFactor

floorPrice      = marginalCost                          ← never sell below
targetPrice     = marginalCost ÷ (1 − targetMargin%)
```

Then the lease check:

```
marginPerBook       = sellingPrice − marginalCost
booksToCoverLease   = $1,900 ÷ marginPerBook       (per month)
```

For each competitor price point: if it sits **above** `floorPrice` we can
undercut and still make money — the worksheet flags any point where we
can't, so you decide whether to match, skip, or take the loss as a
loss-leader.

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
| Consumables / packaging | — | ❓Q27 + ❓Q28 | ❓ |
| Labor | — | owner-operated | $0 |
| Overhead | — | lease handled as break-even, not per-book | $0 |
| **Clicks + paper subtotal** | | | **$2.12** |

Clicks + paper are locked at **$2.12** marginal. Only bindery/finishing +
consumables remain before this 32-page comic has a complete marginal cost.

---

## Change log

- _Created_ — captured printer lease ($1,900/mo), click rate ($0.045),
  tabloid duplex = 4 clicks.
- _Paper invoice_ — Section 4 answered (Q17–Q19): interior text $0.0504/sh;
  cover stocks $0.0962 / $0.1377 / $0.1393 per sheet. Worked example clicks +
  paper subtotal now $2.12 for a 32-page standard comic.
- _Foil paper invoice_ — added Mirri Digital Rainbow specialty cover stock
  at $1.968/sheet (Q18); noted Legion invoice was tax-exempt (Q19b partial).
- _Overhead_ — Q3/Q4/Q6/Q7/Q8 = $0 allocated (absorbed by owner's other
  business). Printing-specific fixed = $1,900/mo lease + Q5 equipment.
- _Labor & volume_ — Q2 (click rate is all-in), Q5 ($0 extra equipment),
  Q9–Q12 (owner-operated, $0 booked labor), Q15/Q16 (4 pp/sheet both product
  types, cover same press), Q29–Q32 (pre-launch, no volume). Model
  restructured: per-book price = marginal cost only; $1,900 lease is a
  monthly break-even hurdle, not a per-unit cost.
