# Backend Completion and Launch Gate

## What is now implemented in source

- Shared PostgreSQL records for organizations, users, roles, catalog, retailer ordering, invoices, payments, publisher purchase orders, returns, credits, inventory, fulfillment, POD orders, production jobs, applications, notifications, and audit history.
- Row Level Security policies for MO.OS, Admin, Preflight, Publisher, Retailer, and POD customer access.
- A separate preflight-visible job record that does not contain quantity, retailer order identity, prices, payment data, or internal notes.
- Private storage buckets for publisher logos, title files, production files, and resale certificates.
- Supabase Auth invitation, password-reset, suspension, restoration, and application-approval service.
- A durable email outbox for operational email events.
- An encrypted nightly database backup workflow for the private GitHub repository.
- A final frontend launch switch: `VITE_USE_SUPABASE_BACKEND=true`.

## Required private setup before the switch can be enabled

1. Authenticate the Supabase CLI locally and link project `sasrmqpyqvimnmfxtggb`.
2. Dry-run, apply, and execute all database tests on staging.
3. Deploy the `admin-user-access` Edge Function.
4. Set Edge Function secrets `PHILBO_SITE_URL` and `PHILBO_ALLOWED_ORIGINS` to the real protected beta address.
5. Configure custom SMTP in Supabase Auth. The built-in test mailer is not suitable for customer invitations or password recovery.
6. Add private GitHub Actions secrets:
   - `SUPABASE_DB_URL`: staging's direct or session-pooler PostgreSQL connection string.
   - `BACKUP_ENCRYPTION_PASSPHRASE`: a long unique passphrase stored in the company password manager.
7. Run the backup workflow manually once, download the encrypted artifact, decrypt it, and restore it into a disposable database to prove recovery works.
8. Convert and verify every frontend data screen against Supabase. Do not enable the switch while any live screen still writes to `firebase-mock.js`.

## Environment model

- **Local demo:** browser-only seeded demo data. No real customer records.
- **Staging / protected beta:** project `philbo-staging`, test accounts, test payment mode, and the first place migrations are applied.
- **Production:** a separate Supabase project, separate keys, separate payment credentials, separate storage, and its own encrypted backups. Production must never share staging credentials.

## Backup recovery

The GitHub workflow creates a PostgreSQL custom-format dump, encrypts it before upload, and retains the encrypted artifact for 30 days. To recover, decrypt with the password-manager copy of `BACKUP_ENCRYPTION_PASSPHRASE`, then restore with PostgreSQL 17 `pg_restore` into a clean database. A backup is not considered operational until a test restore succeeds.

Storage objects require a separate storage backup strategy before live print files are accepted. Until Google Drive/S3 replication is selected, original customer print files must remain in their original secure source as well as Supabase Storage.

## Protected-beta payment gate

Keep `VITE_ENABLE_PAYMENTS=false` throughout the protected beta. Retailer testers can submit orders for review, but the portal does not display a card form, request payment details, or mark the order paid. Payment testing is a separate launch phase and requires an explicit configuration change.
