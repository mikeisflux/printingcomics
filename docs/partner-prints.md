# Partner integration — Art Prints

The **Art Prints** line is exposed through the same partner API as everything
else (catalog, pricing, orders, proofing). Prints are ordinary catalog
products, so if you already integrate comic/graphic-novel orders, prints work
with **no new endpoints** — you reference a substrate `productSlug`, set a
`print_size` option, and set `quantity`.

Base URL: `https://printingcomics.com/api/v1` · Auth: `Authorization: Bearer <key>`

## Products (one per substrate)

| Material | `productSlug` | Min qty | Sizes | Pricing |
|---|---|---|---|---|
| Silver Metal | `art-print-metal-silver` | 1 | 11×17 · Comic | flat per size |
| Raised Metal | `art-print-metal-raised` | 1 | 11×17 · Comic | flat per size |
| Paper (100# Gloss) | `art-print-paper-gloss` | 10 | 11×17 · Comic | volume-tiered |
| Foil | `art-print-foil` | 5 | 11×17 · Comic | volume-tiered |

Prices are **firm** — the site-wide storefront promo does **not** apply, so what
you quote is exactly what's charged.

> **Migration note:** the old per-size slugs (`art-print-11x17-silver-metal`,
> `art-print-11x17-raised-metal`, `art-print-11x17-paper-gloss`,
> `art-print-11x17-foil`) are retired. Use the substrate slugs above with a
> `print_size` option. The old slugs map to the new slug + `print_size: "11×17"`.

## The `print_size` option

Each print takes one **required** `print_size` option. Each size has its own
firm per-unit price (smaller sizes cost less) — quote or read it live rather
than deriving it.

| `print_size` value | Trim size | Offered on |
|---|---|---|
| `11×17` | 11 × 17 in | all substrates |
| `Comic (6.625 × 10.25)` | 6.625 × 10.25 in | all substrates |

Send the value exactly as shown, **or** a loose form — `"11x17"`, `"comic"`
(ASCII `x`, any case/spacing) both resolve to the canonical
size. If `print_size` is omitted, the print is priced and shipped as **11×17**.
The exact accepted values are always available live on
`GET /catalog/products/:slug` under `options[print_size].values[].label`.

### Price per unit

**Metal — flat at every quantity**

| `print_size` | Silver (`art-print-metal-silver`) | Raised (`art-print-metal-raised`) |
|---|---|---|
| `11×17` | $17.67 | $17.67 |
| `Comic (6.625 × 10.25)` | $8.20 | $8.20 |

**Paper (100# Gloss)** — min 10

| Qty | 10–24 | 25–49 | 50–99 | 100–249 | 250–499 | 500–999 | 1000+ |
|---|---|---|---|---|---|---|---|
| `11×17` | 2.16 | 1.72 | 1.35 | 1.08 | 0.87 | 0.76 | 0.71 |
| `Comic (6.625 × 10.25)` | 1.08 | 0.86 | 0.68 | 0.54 | 0.44 | 0.38 | 0.36 |

**Foil** — min 5

| Qty | 5–24 | 25–49 | 50–99 | 100–249 | 250–499 | 500–999 | 1000+ |
|---|---|---|---|---|---|---|---|
| `11×17` | 7.41 | 6.97 | 6.60 | 6.33 | 6.12 | 6.01 | 5.97 |
| `Comic (6.625 × 10.25)` | 5.17 | 4.76 | 4.41 | 4.14 | 3.96 | 3.84 | 3.81 |

Always trust a live **`POST /pricing/quote`** over these tables — it's the
authoritative price and reflects any future changes.

## Per-print shipping weight

If you estimate shipping yourself, these are the per-unit weights we use. They
also come back on `GET /catalog/products/:slug` as `sizeWeightsGrams` (keyed by
`print_size` value); the top-level `weightGrams` is the 11×17 fallback.

| Material | 11×17 | Comic |
|---|---|---|
| Silver / Raised Metal | 164 g (0.3614 lb) | 82 g |
| Paper / Foil | 35 g (0.0768 lb) | 18 g |

## Quote a basket

```jsonc
POST /api/v1/pricing/quote
{
  "items": [
    { "productSlug": "art-print-metal-silver",
      "quantity": 50,
      "options": { "print_size": "Comic (6.625 × 10.25)" } }
  ],
  "shippingAddress": { "country": "US", "region": "CA" }
}
// → items[0].unitPriceCents = 820, totalCents = 41000, plus shipping/tax.
```
Set `print_size` to price a specific size; omit it to price 11×17.
(Proof options below add fees; see Proofing.)

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
      "productSlug": "art-print-metal-silver",
      "quantity": 50,
      "options": {
        "print_size": "Comic (6.625 × 10.25)",
        "title": "Issue 1 variant",
        "pdf_proof": "yes"          // free proof; hard_copy_proof also allowed
      },
      "files": [ { "uploadId": "cmf12abcde…", "purpose": "artwork" } ]
    }
  ]
}
```

### Options a print accepts

| key | type | effect |
|---|---|---|
| `print_size` | string | trim size (see table); **required**, defaults to `11×17` |
| `title` | string | reference label shown on the order |
| `pdf_proof` | `"yes"` | free PDF proof before printing (flags the order) |
| `hard_copy_proof` | `"yes"` | adds a printed proof line = one print's single-copy price at the chosen size + **$19.95** |
| `is_reorder` | `"yes"` | marks the line as a reorder |

Prints have **no** page/cover/binding options.

## Proofing

Identical to the rest of the API. If a line sets `pdf_proof` or
`hard_copy_proof`, the order is created `proofStatus: "requested"` and is held
from production until the creator approves. Subscribe to the `proof.ready` /
`proof.approved` / `proof.changes_requested` webhooks and let the creator
approve from your site — see **Orders → Creator approval on your site** in the
main `/developers` reference.
