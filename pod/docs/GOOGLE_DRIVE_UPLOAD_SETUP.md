# Google Drive upload connection

The portal uses Google Drive behind the scenes. Publishers stay inside the Philbo portal.

## Working domain

- `https://philbopod.com`
- `https://www.philbopod.com`
- The current GoDaddy preview URL remains allowed during testing.

## Drive organization

- `01 - Public Catalog Assets` — approved covers, logos, and approved marketing downloads only.
- `02 - Private Publisher & POD Files` — original print PDFs and publisher production assets.
- `03 - Private Operations` — invoices, contracts, account records, and internal documents.

New publisher title folders are created automatically inside the private folder. Publisher uploads remain private until an Admin explicitly approves a public copy.

## Server-only configuration

Deploy the `google-drive-upload` Supabase function and set these values as Supabase function secrets. Never add the OAuth secret or refresh token to Vite, GitHub, screenshots, or browser code.

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `GOOGLE_DRIVE_PUBLIC_FOLDER_ID`
- `GOOGLE_DRIVE_PRIVATE_FOLDER_ID`
- `GOOGLE_DRIVE_OPERATIONS_FOLDER_ID`
- `PHILBO_ALLOWED_ORIGINS`

`PHILBO_ALLOWED_ORIGINS` must include the PhilboPOD domain and the current GoDaddy preview origin during testing.

## Activation order

1. Connect `philbopod.com` to the GoDaddy project and confirm HTTPS.
2. Regenerate the OAuth client secret because the first secret appeared in a screenshot.
3. Authorize `philbodistribution@gmail.com` and generate the refresh token.
4. Save the values as Supabase function secrets.
5. Deploy `google-drive-upload`.
6. Switch the portal from mock accounts to Supabase accounts only after account and role checks pass.
7. Upload a private test PDF and confirm it appears in the matching publisher/title folder.
8. Upload and approve a public test cover separately; confirm the original print file remains private.
