# Self-hosted SMTP for Printing Comics

This guide sets up a VPS to send and receive mail under your own
`printingcomics.com` domain — no Brevo, no SendGrid, no Mailgun.

**Outbound**: Node → local Postfix on `localhost:25` → internet
**Inbound**: internet → Postfix → pipe to `POST /api/inbound` on the app

## Prerequisites

- Ubuntu 22.04 / 24.04 server with a **public IPv4** and **FQDN**
  (e.g. `mail.printingcomics.com`)
- Your VPS host's **rDNS (PTR)** record points at that FQDN
- Ports **25 (inbound SMTP)**, **587 (submission, optional)**, and
  **80/443 (for cert fetching)** open

Contact your VPS provider to set rDNS. Without rDNS → FQDN matching,
Gmail/Outlook will reject your outbound mail.

## 1. DNS records

Add these to your DNS provider before starting. Replace `1.2.3.4`
with your VPS IPv4 and `mail.printingcomics.com` with your chosen MX host.

| Type  | Name                        | Value                                                                 |
|-------|-----------------------------|-----------------------------------------------------------------------|
| A     | `mail.printingcomics.com`   | `1.2.3.4`                                                             |
| MX    | `printingcomics.com`        | `10 mail.printingcomics.com.`                                         |
| TXT   | `printingcomics.com` (SPF)  | `v=spf1 a mx ip4:1.2.3.4 ~all`                                        |
| TXT   | `_dmarc.printingcomics.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@printingcomics.com; adkim=s; aspf=s` |
| TXT   | `default._domainkey.…`      | *filled in after step 4*                                              |

## 2. Install Postfix + Dovecot + OpenDKIM

```bash
sudo apt update
sudo apt install -y postfix postfix-pcre opendkim opendkim-tools mailutils
```

When prompted pick **Internet Site** and enter `printingcomics.com` as
the system mail name.

## 3. Configure Postfix

`/etc/postfix/main.cf`:

```conf
# Identity
myhostname = mail.printingcomics.com
mydomain = printingcomics.com
myorigin = $mydomain
inet_interfaces = all
inet_protocols = ipv4
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain

# TLS (use certbot for the cert — see below)
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.printingcomics.com/fullchain.pem
smtpd_tls_key_file  = /etc/letsencrypt/live/mail.printingcomics.com/privkey.pem
smtpd_tls_security_level = may
smtp_tls_security_level  = may
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# Require that recipient addresses are real for inbound.
smtpd_recipient_restrictions =
    permit_mynetworks,
    reject_non_fqdn_recipient,
    reject_unknown_recipient_domain,
    reject_unauth_destination

# Pipe every message addressed to our domain into the app. Controlled via
# /etc/postfix/transport below.
virtual_alias_maps = hash:/etc/postfix/virtual
virtual_mailbox_domains = printingcomics.com
virtual_transport = app-pipe

# DKIM via OpenDKIM milter
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

`/etc/postfix/master.cf` — append a pipe transport that POSTs to our app:

```conf
app-pipe  unix  -       n       n       -       -       pipe
  flags=FRX user=nobody argv=/usr/local/bin/pc-inbound-pipe ${recipient}
```

Create the pipe script at `/usr/local/bin/pc-inbound-pipe`:

```bash
#!/bin/bash
# Forwards stdin (raw RFC-822) to the printingcomics app.
set -euo pipefail

INBOUND_URL="http://localhost:4000/api/inbound"
INBOUND_SECRET="$(cat /etc/printingcomics/inbound-secret)"

curl --silent --fail --max-time 30 \
  -H "Authorization: Bearer $INBOUND_SECRET" \
  -H "Content-Type: message/rfc822" \
  --data-binary @- \
  "$INBOUND_URL" || exit 75  # 75 = tempfail → Postfix retries
```

```bash
sudo chmod +x /usr/local/bin/pc-inbound-pipe
sudo mkdir -p /etc/printingcomics
# Generate and store the inbound secret — must match Admin → Settings → Email
openssl rand -hex 32 | sudo tee /etc/printingcomics/inbound-secret > /dev/null
sudo chmod 600 /etc/printingcomics/inbound-secret
```

Copy that same hex string into the app's **Inbound secret** field.

Map `hello@printingcomics.com` to accept everything:

```bash
echo "hello@printingcomics.com  hello@printingcomics.com" | sudo tee /etc/postfix/virtual
echo "postmaster@printingcomics.com  hello@printingcomics.com" | sudo tee -a /etc/postfix/virtual
sudo postmap /etc/postfix/virtual
```

## 4. DKIM keys (OpenDKIM)

```bash
sudo mkdir -p /etc/opendkim/keys/printingcomics.com
cd /etc/opendkim/keys/printingcomics.com
sudo opendkim-genkey -s default -d printingcomics.com
sudo chown -R opendkim:opendkim /etc/opendkim/keys
```

Open `/etc/opendkim/keys/printingcomics.com/default.txt` and paste the
TXT record value into DNS at `default._domainkey.printingcomics.com`.

`/etc/opendkim.conf`:

```conf
Domain                  printingcomics.com
KeyFile                 /etc/opendkim/keys/printingcomics.com/default.private
Selector                default
Socket                  inet:8891@localhost
UMask                   002
OversignHeaders         From
Mode                    sv
SubDomains              no
AutoRestart             yes
```

```bash
sudo systemctl restart opendkim postfix
```

## 5. TLS cert for the MX host

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d mail.printingcomics.com
# Certs live at /etc/letsencrypt/live/mail.printingcomics.com/
sudo systemctl reload postfix
```

## 6. Configure the app

In Admin → Settings → Email:

| Field              | Value                              |
|--------------------|------------------------------------|
| Host               | `localhost`                        |
| Port               | `25`                               |
| Secure             | off                                |
| Username/Password  | *blank* (local Postfix is unauth)  |
| From email         | `hello@printingcomics.com`         |
| From name          | `Printing Comics`                  |
| Inbound secret     | *same hex from step 3*             |

Also set **Public site URL** to `https://printingcomics.com` so the
open-tracking pixel and click tracker URLs resolve correctly.

## 7. Verify

```bash
# Outbound — should show DKIM-Signature header in the received copy
echo "Test body" | mail -s "Outbound test" yourname@gmail.com

# Then reply to that email — should show up in /admin/inbox within a few seconds

# Check SPF/DKIM/DMARC alignment with https://www.mail-tester.com/
```

Target is a **10/10 score on mail-tester**. Anything below 9 means
you're going to spam folder — fix before going live.

## 8. Operational checklist

- [ ] IP is not on Spamhaus ZEN (`host 4.3.2.1.zen.spamhaus.org`)
- [ ] Gmail Postmaster Tools account pointed at `printingcomics.com`
- [ ] Microsoft SNDS / JMRP signed up
- [ ] DMARC reports going to an inbox you actually read
- [ ] Postfix mail queue alert (`mailq`, size > 100 = investigate)
- [ ] Log rotation for `/var/log/mail.log`

## Troubleshooting

- **All outbound lands in spam** — verify `DKIM-Signature` header present,
  SPF `pass`, DMARC `pass` via a Gmail delivery test.
- **Inbound pipe 401s** — secret mismatch. Curl the endpoint with the
  secret from `/etc/printingcomics/inbound-secret` and see what the app
  logs.
- **Postfix rejects your domain** — `postmap` wasn't run after editing
  `/etc/postfix/virtual`, or `virtual_mailbox_domains` is missing.
- **Gmail flags as "unauthenticated"** — IPv6 AAAA record for your MX
  host must also match rDNS, or drop to IPv4-only with `inet_protocols = ipv4`.
