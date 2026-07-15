# Printing Comics — Self-hosted Storefront

Custom Node/TypeScript + React 19 + Prisma + PostgreSQL replacement for the
previous WordPress/WooCommerce site. Monorepo with two workspaces:

- `server/` — Express API
- `web/` — React 19 + Vite SPA (storefront + `/admin`)
- `prisma/` — shared schema + seed

The archived WordPress backup lives in `siteold/` for reference only.

## Quick start

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create the .env file
cp .env.example .env

# 4. Migrate + seed the database
npm run db:migrate -- --name init
npm run db:seed

# 5. Start both server + web in dev
npm run dev
```

- Storefront: http://localhost:5173
- API:       http://localhost:4000
- Admin:     http://localhost:5173/admin (log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`)

## What's included

### Storefront (`/`)
- Home with featured products
- Shop listing (optionally filtered by category slug)
- Product detail with variants, options, volume pricing
- Cart (persists for guests via cookie, merges on login)
- Checkout with shipping quote, tax calculation, coupon + discount codes,
  PDF / hard-copy proof options, order notes
- Order confirmation
- Customer account + order history
- Tokenized proof review (`/proof/:token`) + corrected-file upload (`/upload/:token`)
- Register / Login / Logout

### Admin (`/admin`)
- Dashboard (30-day revenue, counts, recent orders, low stock)
- Products (list, create, edit, delete, variants, volume tiers, categories, images)
- Categories (CRUD)
- Orders (list, filter by status, detail view with status + payment + tracking updates)
- Proofing per order (upload PDF proof, request corrected media, approval hard-block)
- Customers (list, search, role assignment, drawer view of orders + addresses)
- Discount Codes, Site Discounts, Media library (download + PDF preview)
- Email Center (compose one-off, campaigns, templates, subscribers, inbound)
- Settings (store info, shipping zones/rates, tax rates, coupons)

### Data model (Prisma)
`User`, `Address`, `Category`, `Product`, `ProductImage`, `ProductOption`,
`ProductOptionValue`, `ProductVariant`, `Cart`, `CartItem`, `Order`, `OrderItem`,
`Payment`, `ShippingZone`, `ShippingRate`, `TaxRate`, `Coupon`, `Setting`,
`MediaFile`, `OrderItemFile`, `Proof`, `MediaRequest`.

## Deployment notes

- Set a strong `JWT_SECRET` and rotate it periodically.
- Point `DATABASE_URL` at a managed Postgres or a self-hosted one with regular
  backups.
- Build: `npm run build`. Serve `web/dist/` from your web server (Nginx/Caddy);
  run the API (`server/dist/index.js`) under systemd or pm2.
- Put the API behind HTTPS and set `NODE_ENV=production` so cookies use `secure`.
- Configure `WEB_ORIGIN` to the production frontend origin for CORS.

## Payment integration (stubbed)

The checkout flow creates orders with `paymentStatus=PENDING` and a
placeholder `Payment` row. To enable real charging:

1. Add your Stripe keys to `.env`.
2. Extend `server/src/routes/checkout.ts` to create a PaymentIntent during
   `/api/checkout/place` and return `client_secret`.
3. Add a Stripe webhook route to update `Payment.status` and `Order.paymentStatus`
   on `payment_intent.succeeded`.

## Security

- Passwords are hashed with bcrypt (cost 12).
- Sessions are JWT, stored in an httpOnly cookie.
- Admin routes require `ADMIN` or `STAFF` role.
- `helmet`, CORS allow-list, rate limits on auth.
- **Do not** commit `.env`. `.gitignore` keeps it out of version control.

## What's deliberately NOT included yet

- File upload (product images are currently URL inputs).
- Email sending (transactional email hook points exist — no adapter wired).
- Full Stripe integration (stubbed, see above).
- Data migration from the WordPress dumps in `siteold/` (a separate script).
- I18n, multi-currency, multi-vendor (Dokan), subscriptions.
