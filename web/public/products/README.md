# Packaged product photos

Static product photos that ship with the repo, served from `/products/…`.
Used for stock goods (shipping supplies) that have no admin-uploaded photo.

`prisma/seed-cws.ts` attaches one of these to a product **only if the file
actually exists here**, and **only if that product has no image yet** — so an
admin photo uploaded through the media library is never overwritten, and a
missing file leaves the storefront placeholder in place rather than a broken
image.

A product can have several photos. The first entry in its `images:` array is
the card thumbnail; the rest become a thumbnail strip on the product page.

Filenames in `seed-cws.ts` must match exactly, extension included. Adding a
photo in a different format means updating that product's `images:` paths.

## Current files

| File | Used by |
|---|---|
| `comic-armor-10-pack.webp` | Comic Armor — 10 Pack |
| `comic-armor-20-pack.webp` | Comic Armor — 20 Pack |
| `T-Fold_Comic_Mailer_1.jpg` | every T-Mailer pack — folded shallow (thumbnail) |
| `T-Fold_Comic_Mailer_2.jpg` | every T-Mailer pack — folded deep |
| `T-Fold_Comic_Mailer_3.jpg` | every T-Mailer pack — score ladder, open |
| `T-Fold_Comic_Mailer.jpg` | every T-Mailer pack — flat blank, as it ships |

All five T-Mailer pack sizes share the same four photos (`TMAILER_IMAGES`),
ordered so the two fold depths sit next to each other — that pairing is what
shows "adjustable" at a glance.

## Guidelines

Square, 1080×1080 or larger: the storefront card renders them in a 1:1 box with
`object-fit: cover`, so anything else gets cropped from the centre.

Keep them under ~200 KB where you can. These are served uncompressed exactly as
committed — there is no build step that resizes or re-encodes them.

After adding or replacing a file, re-run `npm run db:seed:cws`.
