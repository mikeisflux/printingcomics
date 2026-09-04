# Packaged product photos

Static product photos that ship with the repo, served from `/products/…`.
Used for stock goods (shipping supplies) that have no admin-uploaded photo.

`prisma/seed-cws.ts` attaches one of these to a product **only if the file
actually exists here**, and **only if that product has no image yet** — so an
admin photo uploaded through the media library is never overwritten, and a
missing file leaves the storefront placeholder in place rather than a broken
image.

## Expected filenames

| File | Product |
|---|---|
| `comic-armor-10-pack.webp` | Comic Armor — 10 Pack |
| `comic-armor-20-pack.png`  | Comic Armor — 20 Pack |

Sources on the Comic Armor site (these hosts are blocked from the build
container's egress proxy, so they have to be downloaded by hand):

- 10 pack — `https://comicarmor.com/wp-content/uploads/2025/12/3.webp`
- 20 pack — `https://comicarmor.com/wp-content/uploads/2025/12/shot_20251227004822.png`

Drop the files in with those names, then re-run `npm run db:seed:cws`.

Square-ish crops look best: the storefront card renders them in a 1:1 box with
`object-fit: cover`.
