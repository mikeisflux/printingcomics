# Packaged product photos

Static product photos that ship with the repo, served from `/products/…`.
Used for stock goods (shipping supplies) that have no admin-uploaded photo.

`prisma/seed-cws.ts` attaches one of these to a product **only if the file
actually exists here**, and **only if that product has no image yet** — so an
admin photo uploaded through the media library is never overwritten, and a
missing file leaves the storefront placeholder in place rather than a broken
image.

The filename in `seed-cws.ts` must match exactly, extension included. Adding a
photo in a different format means updating the `image:` path for that product.

## Current files

| File | Product |
|---|---|
| `comic-armor-10-pack.webp` | Comic Armor — 10 Pack |
| `comic-armor-20-pack.webp` | Comic Armor — 20 Pack |

The T-mailer packs have no photo yet and fall back to the placeholder.

## Guidelines

Square, 1080×1080 or larger: the storefront card renders them in a 1:1 box with
`object-fit: cover`, so anything else gets cropped from the centre.

Keep them under ~200 KB where you can. These are served uncompressed exactly as
committed — there is no build step that resizes or re-encodes them.

After adding or replacing a file, re-run `npm run db:seed:cws`.
