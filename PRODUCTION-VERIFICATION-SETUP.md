# Permanent fix: real email, WhatsApp OTP & Telegram confirmation delivery

This replaces the temporary "it just logs to the console" behavior with real
delivery. Follow the 3 sections in order. Nothing here is a workaround —
these are the actual third-party accounts/credentials production apps use.

---

## 0. Code fix (already done for you)

Your `.env` had the literal placeholder text from `.env.example`
(`RESEND_API_KEY=re_...your-resend-api-key`, `WHATSAPP_TOKEN=EAAG...permanent-system-user-token`,
etc.). The app used to treat any *non-empty* string as "configured" and tried
a real API call with that garbage value — that's what produced "API key is
invalid" and "Invalid JSON for postcard".

Fixed files (already applied in the project you downloaded — `src/lib/env.ts`
is new, these are edited): `src/lib/env.ts`, `src/lib/email.ts`,
`src/lib/alerts.ts`, `src/lib/telegram-bot.ts`, `src/app/api/auth/route.ts`,
`src/app/api/auth/verify/route.ts`, `src/app/api/telegram/test/route.ts`,
`src/components/settings-view.tsx`.

➡️ **Re-download the zip I gave you and copy those 8 files over your local
project** (or tell me and I'll list the exact diffs so you can hand-edit —
copying the files is less error-prone). Nothing else to do here; the
remaining sections are just about getting *real* credentials into `.env`.

---

## 1. Real email delivery — Resend

1. Go to **https://resend.com** → sign up (no credit card). Free plan: 3,000
   emails/month, 100/day — plenty for this app.
2. **Recommended — verify your own domain** (so email actually lands in
   users' inboxes, not spam): Dashboard → **Domains** → **Add Domain** →
   enter your domain → Resend shows you 2–3 DNS records (SPF/DKIM/DMARC) →
   add those exact records at your domain registrar (GoDaddy/Namecheap/
   Cloudflare/whoever) → wait for the status to flip to **Verified**
   (minutes to a few hours depending on DNS propagation).
   - **Don't have a domain yet?** You can skip this and use Resend's shared
     sandbox sender `onboarding@resend.dev` to start — but Resend will then
     only actually deliver to the email address you signed up to Resend
     with. Fine for testing your own account, not for real end users.
3. Dashboard → **API Keys** → **Create API Key** → permission "Sending
   access" is enough → copy the key (starts with `re_`, this is the *real*
   one, not the example text).
4. Edit `.env`:
   ```
   RESEND_API_KEY=re_<paste your real key here>
   EMAIL_FROM=Is It Down India <onboarding@resend.dev>
   ```
   Once your domain is verified, change the `EMAIL_FROM` address to
   `you@yourdomain.com` instead of `onboarding@resend.dev`.
5. Restart `npm run dev` (or `npm run build && npm start`).
6. Test: Settings → **Send code** next to your email → check your real inbox.

---

## 2. Real WhatsApp OTP delivery — Meta WhatsApp Cloud API

This one needs a template approval step, so budget a bit more time.

1. **https://developers.facebook.com** → My Apps → **Create App** → type
   **Business** → add the **WhatsApp** product to it.
2. On the WhatsApp → **API Setup** page you'll immediately see:
   - A **temporary access token** (expires in 24h — good enough to prove it
     works today).
   - A **test phone number** and its **Phone number ID** (a long numeric ID
     — this is `WHATSAPP_PHONE_ID`, *not* the phone number itself).
   - A "**To**" field where you must add and verify your own WhatsApp number
     as a test recipient (enter it, Meta sends you a code on WhatsApp to
     confirm). Until your Meta Business account passes **Business
     Verification**, you can only message numbers added here — that's a
     Meta restriction on all new WhatsApp Cloud API apps, not a bug.
3. **Get a token that doesn't expire every 24h:** Meta Business Suite →
   **Business Settings** → **Users → System Users** → **Add** → create a
   system user → **Add Assets** → assign it your app → **Generate New
   Token** → tick `whatsapp_business_messaging` (and
   `whatsapp_business_management`) → copy it. This is your permanent
   `WHATSAPP_TOKEN`.
4. **Create the OTP template** (Meta requires pre-approved templates for
   any message sent outside a 24h user-initiated conversation window):
   WhatsApp Manager (**business.facebook.com/wa/manage**) → **Message
   Templates** → **Create Template**
   - Category: **Utility**
   - Name: `verify_code` (must match the `WHATSAPP_OTP_TEMPLATE` env var
     below exactly — change one or the other if you pick a different name)
   - Body text, with exactly one `{{1}}` variable, e.g.:
     `Your Is It Down, India verification code is {{1}}. It expires in 10 minutes.`
   - Submit → Meta's review is usually minutes, occasionally up to 24h.
5. Edit `.env`:
   ```
   WHATSAPP_TOKEN=<your real permanent token>
   WHATSAPP_PHONE_ID=<the numeric Phone number ID>
   WHATSAPP_OTP_TEMPLATE=verify_code
   WHATSAPP_VERIFY_TOKEN=<any random string you make up, 20+ chars>
   ```
   (`WHATSAPP_TEMPLATE` is only needed if you also want real down/up alert
   messages, not just OTPs — separate template, same process.)
6. Restart the dev server. Test: Settings → add your WhatsApp number → Save
   → **Verify your WhatsApp number** → code should arrive on WhatsApp within
   seconds (to a number you added as a test recipient in step 2).

---

## 3. Telegram — bot token + webhook (so the confirmation message can send)

The confirmation-message logic is already implemented (it fires automatically
after every successful email/phone verification, and after Connect
Telegram). It just needs a **real, non-placeholder `TELEGRAM_BOT_TOKEN`** and
a **registered webhook** so Telegram can tell your app when someone presses
START.

Since you already have a bot from BotFather, send me:
- the **bot token** (looks like `123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
- the **bot username** (without the `@`, e.g. `isitdownindia_bot`)

and tell me to go ahead — I'll put them into this sandbox's `.env`, generate
a webhook secret, and register the webhook against this sandbox's public
HTTPS URL (so you don't need to install ngrok yourself to test right now).
You can then open the live sandbox URL, sign in, press **Connect Telegram →
START**, and watch a real confirmation message arrive when you verify
email/phone.

If you'd rather do it entirely yourself locally instead of sharing the
token, here's the manual path:

```
TELEGRAM_BOT_TOKEN=<paste your token>
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<username, no @>
TELEGRAM_WEBHOOK_SECRET=<random string>
```
Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Telegram webhooks require a **public HTTPS URL** — `localhost` doesn't work.
Since you're local-only right now, use a tunnel:
```bash
# install ngrok (https://ngrok.com), then:
ngrok http 3000
# copy the https://xxxx.ngrok-free.app URL it prints
```
Then register the webhook (do this once per ngrok session — the free ngrok
URL changes every restart):
```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://xxxx.ngrok-free.app/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'

# verify — should show your URL and no last_error_message:
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```
Once you eventually deploy to a real domain, re-run `setWebhook` once
pointing at `https://yourdomain.com/api/telegram/webhook` — permanent,
doesn't need to be repeated after that.

**Note:** `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is baked in at build time —
changing it requires a rebuild (`npm run build`), not just a dev-server
restart, before it shows up in the browser bundle.
