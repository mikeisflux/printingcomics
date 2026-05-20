# Printing Comics

Self-hosted storefront + admin (replaces the old WordPress/WooCommerce site).
Express API + React 19/Vite SPA + Prisma + PostgreSQL, as an npm-workspaces monorepo.

## Repo layout

Run `npm` commands from the repo root unless noted.

- `server/` — Express API (TypeScript, ESM)
  - `src/routes/` — HTTP routes (`cart.ts`, `checkout.ts`, `admin/`, `v1/` = partner/crowdfunding API)
  - `src/lib/` — shared logic (`pricing.ts`, `easypost.ts`, `claude.ts`, `api-keys.ts`, …)
  - `src/generated/prisma/` — generated Prisma client (gitignored; created by `prisma generate`)
  - `dist/` — compiled output (`node server/dist/index.js`)
- `web/` — React 19 + Vite SPA — storefront + `/admin`
  - `src/pages/`, `src/components/`, `src/lib/`; `dist/` — built static assets
- `prisma/` — `schema.prisma`, `migrations/`, `seed.ts` (base), `seed-cws.ts` (configurator products)
  - `pricing/cws-pricing.json` — pricing data extracted from the discount-log spreadsheets
- `comic_discount_log.xlsx`, `graphic_novel_discount_log.xlsx` — source-of-truth pricing
- `deploy/nginx.conf`, `ecosystem.config.cjs` (pm2)
- `siteold/` — archived old site; reference only, do not modify

## Prerequisites

- Node 20+ (Prisma 7 prefers 22+; on 20 you'll see a harmless `EBADENGINE` warning)
- PostgreSQL (running directly, not Docker)
- `.npmrc` already sets `legacy-peer-deps=true` (React 19 / react-three peer conflicts)

## Setup & build (from repo root)

```bash
cp -n .env.example .env   # MUST exist before install: postinstall runs `prisma generate`
npm install               # installs the server + web workspaces
npm run build             # prisma generate -> server tsc -> web tsc + vite build
npm run dev               # API :4000, storefront/admin :5173
```

Typecheck only: `npm --workspace server run typecheck`, `npm --workspace web run typecheck`.

## Database

```bash
npm run db:migrate -- --name <name>  # create + apply a migration
npm run db:push                      # push schema without a migration
npm run db:seed                      # base seed
npm run db:seed:cws                  # (re)create configurator products from cws-pricing.json
npm run db:studio                    # Prisma Studio
```

`DATABASE_URL` and all bootstrap config live in the root `.env`; see `.env.example`.

## Gotchas

- `.env` must exist **before `npm install`** — the `postinstall` hook runs
  `prisma generate`, which errors out without `DATABASE_URL`.
- Building does not need a running database; `prisma generate` only reads the schema.
- Production runs from `/opt/printingcomics` (pm2 + nginx; the botblock scripts
  read `/opt/printingcomics/.env`).

## Configurator pricing

- `server/src/lib/pricing.ts` is the authoritative pricing engine;
  `web/src/lib/pricing.ts` is a client-side mirror — **keep the two in sync**.
- Page / cover / embellishment prices live in `prisma/pricing/cws-pricing.json`
  (mirrors the `*_discount_log.xlsx` spreadsheets). `prisma/seed-cws.ts` compiles
  that JSON into each product's `pricingConfig`.
- After editing pricing data or `seed-cws.ts`, re-run `npm run db:seed:cws` —
  existing products keep their old `pricingConfig` until re-seeded.
