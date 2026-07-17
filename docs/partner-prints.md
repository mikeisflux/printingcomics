# Partner integration — 11×17 Prints

The **11×17 Prints** line is exposed through the same partner API as everything
else (catalog, pricing, orders, proofing). Prints are ordinary catalog
products, so if you already integrate comic/graphic-novel orders, prints work
with **no new endpoints** — you just reference a different `productSlug` and set
`quantity`.

Base URL: `https://printingcomics.com/api/v1` · Auth: `Authorization: Bearer <key>`

## Products

| Material | `productSlug` | Min qty | Pricing |
|---|---|---|---|
| Silver Metal | `art-print-11x17-silver-metal` | 1 | flat **$17.67**/unit |
| Raised Metal | `art-print-11x17-raised-metal` | 1 | flat **$22.67**/unit |
| Paper (100# Gloss) | `art-print-11x17-paper-gloss` | 10 | volume-tiered |
| Foil | `art-print-11x17-foil` | 5 | volume-tiered |

All prints are **11 × 17 in**. Prices are **firm** — the site-wide storefront
promo does **not** apply, so what you quote is exactly what's charged.

### Price-per-unit tiers

**Paper (100# Gloss)** — min 10

| Qty | 10–24 | 25–49 | 50–99 | 100–249 | 250–499 | 500–999 | 1000+ |
|---|---|---|---|---|---|---|---|
| $/unit | 2.16 | 1.72 | 1.35 | 1.08 | 0.87 | 0.76 | 0.71 |

**Foil** — min 5

| Qty | 5–24 | 25–49 | 50–99 | 100–249 | 250–499 | 500–999 | 1000+ |
|---|---|---|---|---|---|---|---|
| $/unit | 5.73 | 5.33 | 5.00 | 4.75 | 4.56 | 4.46 | 4.42 |

**Silver / Raised Metal** — flat at every quantity ($17.67 / $22.67).

Always trust a live **`POST /pricing/quote`** over these tables — it's the
authoritative price and reflects any future changes.

## Per-print shipping weight

If you estimate shipping yourself, these are the per-unit weights we use
(also on `GET /catalog/products/:slug` as `weightGrams`):

| Material | Per print |
|---|---|
| Silver / Raised Metal | 0.361424 lb (164 g) |
| Paper / Foil | 0.076775 lb (35 g) |

## Quote a basket

```jsonc
POST /api/v1/pricing/quote
{
  "items": [
    { "productSlug": "art-print-11x17-foil", "quantity": 100 }
  ],
  "shippingAddress": { "country": "US", "region": "CA" }
}
// → items[0].unitPriceCents = 475, totalCents = 47500, plus shipping/tax.
```
Prints need **no configurator options** to price — just `productSlug` +
`quantity`. (Proof options below add fees; see Proofing.)

## Submit an order

Upload the print art first (`POST /uploads`, see the main reference), then
attach the `uploadId` to the line item:

```jsonc
POST /api/v1/orders
{
  "email": "creator@example.com",
  "shippingAddress": { "firstName": "Jane", "lastName": "Doe",
    "line1": "123 Main St", "city": "SF", "region": "CA",
    "postalCode": "94110", "country": "US" },
  "items": [
    {
      "productSlug": "art-print-11x17-silver-metal",
      "quantity": 50,
      "options": {
        "title": "Issue 1 variant",
        "pdf_proof": "yes"          // free proof; hard_copy_proof also allowed
      },
      "files": [ { "uploadId": "cmf12abcde…", "purpose": "artwork" } ]
    }
  ]
}
```

### Options a print accepts (all optional)

| key | type | effect |
|---|---|---|
| `title` | string | reference label shown on the order |
| `pdf_proof` | `"yes"` | free PDF proof before printing (flags the order) |
| `hard_copy_proof` | `"yes"` | adds a printed proof line = one print's single-copy price + **$19.95** |
| `is_reorder` | `"yes"` | marks the line as a reorder |

Prints have **no** page/cover/binding options.

## Proofing

Identical to the rest of the API. If a line sets `pdf_proof` or
`hard_copy_proof`, the order is created `proofStatus: "requested"` and is held
from production until the creator approves. Subscribe to the `proof.ready` /
`proof.approved` / `proof.changes_requested` webhooks and let the creator
approve from your site — see **Orders → Creator approval on your site** in the
main `/developers` reference.
