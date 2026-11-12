# Philbo DNS Launch Hold

Status: **DO NOT SWITCH DNS YET**

Target domain: `philbodistribution.com`

The current GoDaddy app is a private preview for Maura's review. It is not yet the public client site. Before changing DNS or completing Google OAuth production branding:

- Confirm the GoDaddy published build is healthy and matches the approved preview.
- Confirm `https://philbodistribution.com/`, `/privacy`, and `/terms` will be publicly reachable without a portal login.
- Confirm the Privacy Policy is linked from the public homepage/footer.
- Confirm portal pages, private files, print-ready book files, account data, and credentials remain protected.
- Confirm only approved covers, logos, samples, and marketing assets can be public.
- Confirm SSL/HTTPS is active for the custom domain.
- Record the current DNS values and GoDaddy destination before changing anything so the prior setup can be restored.
- Lower DNS TTL in advance when practical, then schedule the cutover during a monitored window.
- After DNS propagates, test desktop and mobile navigation, catalog product URLs, portal login, file access, email flows, and direct `/privacy` and `/terms` URLs.
- Only after the domain checks pass, enter the production URLs in Google Auth Platform, add `philbodistribution.com` as the authorized domain, publish the OAuth app, and generate the permanent Drive authorization.

Never place Google OAuth client secrets or refresh tokens in the browser bundle, GitHub, screenshots, or chat. Store them only as server-side secrets.

## Powers Creative follow-up

- Build and publish a lightweight coming-soon page for `powerscreativeco.com` using an available GoDaddy Node.js Hosting app slot.
- Keep the Powers Creative credit in the Philbo footer as plain text until that page is publicly available and verified over HTTPS.
- After launch verification, restore the footer link to `https://powerscreativeco.com`.
