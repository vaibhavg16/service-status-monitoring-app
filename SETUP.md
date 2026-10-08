# Is It Down, India? — Setup & Run Guide

Next.js 16 (App Router) · PostgreSQL (Drizzle ORM) · live Telegram bot · optional WhatsApp Cloud API.

---

## 1. Install & run locally (no bot yet)

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres

createdb app_db                 # or: psql -U postgres -c "CREATE DATABASE app_db"

npx drizzle-kit push            # create tables
node scripts/seed.mjs           # demo data: 12 services, 24h probes, incidents, reports, users

npm run dev                     # http://localhost:3000
```

Demo logins (shown as buttons on `/login`):

| Role | Email | Password |
|---|---|---|
| Merchant | `merchant@isitdown.in` | `merchant123` |
| Admin | `admin@isitdown.in` | `admin123` |

Admin unlocks **Services** (`/services`) including the simulation panel (`/services#simulation`) to force Up/Degraded/Down, inject crowd reports, or run a probe cycle.

```bash
# verify
curl -s localhost:3000/api/health          # {"ok":true}
curl -s localhost:3000/api/probe           # {"running":true,"intervalMs":30000}
```

Reset the demo at any time: `node scripts/seed.mjs` (truncates + reloads).

---

## 2. Create the Telegram bot

In Telegram, message **@BotFather**:

```
/newbot
  → name:  Is It Down India
  → user: isitdownindia_demo_bot        (must end in "bot")
  → copy the token it prints
```

Then, still in BotFather:

```
/setdescription  → Live status for UPI, IRCTC, GST and the services India runs on.
/setabouttext    → Probed every 30 seconds. Backed by real reports.
/setuserpic      → upload a 512×512 logo
/setcommands     → start - Connect this chat to your account
                   status - Live board summary
                   subscribe - Pick services to follow
                   unsubscribe - Stop following a service
                   mysubs - What you follow now
                   report - Tell us a service is failing
                   stop - Disconnect this chat
/setdomain       → yourdomain.com        ← required for website login (see §4)
```

`/setdomain` takes a bare public HTTPS domain — **no** `https://`, no path, no port. Without it the website's Telegram login button will not render.

---

## 3. Environment variables

`.env` (server-side) and `NEXT_PUBLIC_*` (baked into the browser bundle at **build** time):

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Postgres connection |
| `AUTH_SECRET` | server | signs session cookies + Telegram link tokens — use 64 random chars |
| `TELEGRAM_BOT_TOKEN` | server | from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | server | any string; passed to `setWebhook` and checked on every update |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | **client, build-time** | bot username **without** `@` — renders the login widget |
| `REDIS_URL` | server | optional; hot status cache (shows `MEMORY` in the rail without it) |
| `PROBE_INTERVAL_MS` | server | probe cadence, default `30000` |
| `DISABLE_PROBE_WORKER=1` | server | stop in-process workers (use `/api/cron/tick` instead) |
| `CRON_SECRET` | server | protects `POST /api/cron/tick` |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_TEMPLATE` / `WHATSAPP_VERIFY_TOKEN` | server | optional WhatsApp Cloud API |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ Changing a `NEXT_PUBLIC_*` value requires a **rebuild**, not just a restart.

---

## 4. Two ways to connect a user to the bot

Telegram never lets a bot message a chat that has not opened a conversation with it, so there are two distinct steps:

### A. Deployed site (public HTTPS) — Telegram Login Widget

1. `/setdomain yourdomain.com` in BotFather.
2. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, rebuild, deploy.
3. On `/login` the real **Continue with Telegram** button appears; approving it signs the user in and stores their `telegram_id`.
4. They still press **Connect Telegram → START** once (Settings) so the bot may message them.

### B. Local / no domain — one-tap Connect (works on localhost)

1. Sign in with email/password.
2. **Settings → Connect Telegram** opens `t.me/<bot>?start=<signed token>`.
3. Press **START** in that chat → the webhook binds the `chat_id` to the account.
4. **Send test alert** → the message must arrive.

---

## 5. Register the webhook

Once per deployment (after the site is reachable over HTTPS):

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOURDOMAIN.com/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]' \
  -d "drop_pending_updates=true"

# verify
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | python3 -m json.tool
```

Healthy output: your URL, `"pending_update_count": 0`, and **no** `last_error_message`.
`401 Wrong response` → `TELEGRAM_WEBHOOK_SECRET` ≠ the `secret_token` you sent.
Repoint during testing: `.../deleteWebhook` then `setWebhook` again.

---

## 6. Bot commands

| Command | What it does |
|---|---|
| `/start` | Binds the chat to a website account (sent automatically by the deep link) |
| `/status` | Live board: aspect, 24h uptime, p50 and crowd-report count per failing service |
| `/subscribe` | Inline keyboard of all 12 services — tap to follow. Or `/subscribe irctc` |
| `/unsubscribe` | Inline keyboard to stop following. Or `/unsubscribe gst` |
| `/mysubs` | Lists what this chat follows and at what severity |
| `/report <service> <note>` | Files a crowd report, e.g. `/report irctc Tatkal search spins forever` |
| `/stop` | Disconnects the chat from the account |
| `/help` | Command list |

Service names are matched flexibly: `npci`, `hdfc`, `sbi`, `icici`, `paytm`, `phonepe`, `gpay`, `irctc`, `digilocker`, `aadhaar`, `gst`, `tax` all work.

Replies come back in the user's own language (English / हिन्दी / मराठी / தமிழ்).

---

## 7. Test it end to end

1. **Bot identity** — sign in via Telegram (or Connect on localhost), press START, then **Send test alert**. Message must arrive.
2. **Subscribe from the bot** — send `/subscribe`, tap two services, then `/mysubs`.
3. **Live status** — send `/status`. Force a service down in `/services#simulation` and send `/status` again; it should flip to 🔴.
4. **Down alert** — with the subscription active, force **down** on a followed service. Within ~10s: `GST PORTAL — STATUS: DOWN` plus the advice line.
5. **Slow alert** — force **degraded**: `... STATUS: DEGRADED`.
6. **Recovery alert** — press **Clear** in the simulation panel: `... STATUS: RECOVERED`.
7. **Crowd report from the bot** — `/report gst Filing returns 502`, then check `/reports` on the website; it should be listed with your city.
8. **Escalation** — as admin use **Inject 12 crowd reports** on a service; 3+ opens an incident, 10+ turns the public board red even while probes read UP.

Server-side check:

```sql
SELECT id, user_id, service_id, channel, severity, state, target, detail, sent_at
FROM outbox ORDER BY created_at DESC LIMIT 20;
```

`sent` = delivered · `failed` + `detail = 'chat not found'` = user never pressed START (auto-retried later).

---

## 8. Alerts only reach users who did all three

1. Connected Telegram and pressed START (`users.telegram_id IS NOT NULL`).
2. Have an **active subscription** to that service.
3. `min_severity` matches: `degraded` catches amber + red; `down` catches red only.

Subscribe everyone at once:

```sql
INSERT INTO subscriptions (user_id, service_id, channel, min_severity, active)
SELECT u.id, s.id, 'telegram', 'degraded', true
FROM users u CROSS JOIN services s
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions b
  WHERE b.user_id = u.id AND b.service_id = s.id AND b.channel = 'telegram'
);
```

Find users who will silently miss alerts:

```sql
SELECT id, email, name FROM users WHERE telegram_id IS NULL;
```

---

## 9. WhatsApp (optional)

Telegram works immediately; WhatsApp needs a Meta Business app and a pre-approved template.

1. **developers.facebook.com** → Create App → type **Business**.
2. Add **WhatsApp** → copy **Phone number ID** and the test token.
3. **Business Settings → System Users** → create → *Generate token* with `whatsapp_business_messaging` → this is your permanent `WHATSAPP_TOKEN`.
4. **Message templates** → Create → category **Utility** → name `status_alert` → language `en` → body:
   `Is It Down, India? alert: {{1}}`
5. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_VERIFY_TOKEN`; rebuild; deploy.
6. **Webhook**: WhatsApp → Configuration → Callback URL `https://YOURDOMAIN.com/api/whatsapp/webhook`, Verify Token = `WHATSAPP_VERIFY_TOKEN` → subscribe to `messages`.
7. Put a user's number in **Settings → WhatsApp number** (`919812345678`, country code, no `+`), set a subscription channel to `whatsapp`, trigger an alert.

WhatsApp only allows free-form replies inside 24h of the user messaging you; outside that you must use an approved template — which is why the code always sends `type: "template"`. `channel = 'sms'` is log-only until you add a provider.

---

## 10. Keep workers alive on serverless hosts

`src/instrumentation.ts` starts the probe and alert workers, but timers only survive in a long-lived Node server. On Vercel/Netlify/serverless containers, schedule an external cron:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOURDOMAIN.com/api/cron/tick"
```

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/tick?key=YOUR_CRON_SECRET", "schedule": "* * * * *" }] }
```

`.github/workflows/tick.yml`:

```yaml
name: tick
on:
  schedule: [{ cron: "* * * * *" }]
  workflow_dispatch:
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "https://YOURDOMAIN.com/api/cron/tick"
```

Self-hosted / VPS / PM2 / Docker needs nothing extra.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Telegram button missing on `/login` | Not HTTPS, `/setdomain` not done, or `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` added **after** build |
| `Telegram signature could not be verified` | Wrong `TELEGRAM_BOT_TOKEN`, or `auth_date` older than 24h (clock skew) |
| Webhook 401 | `TELEGRAM_WEBHOOK_SECRET` ≠ `secret_token` sent to `setWebhook` |
| `chat not found` in outbox | User never pressed START — auto-retried once they do |
| No alerts at all | No subscription, or `min_severity = down` while the service is only degraded |
| Alerts delayed/never on serverless | No cron hitting `/api/cron/tick` |
| Duplicate alerts | Two instances draining; set `DISABLE_PROBE_WORKER=1` on all but one |
| Latencies look synthetic | Sandbox has no outbound network — expected locally, real on your host |
| Board shows stale data | `curl -s localhost:3000/api/board`; restart dev to re-trigger `instrumentation.ts` |

---

## 12. Project layout

```
src/
  instrumentation.ts        starts probe + alert workers
  db/schema.ts              users, services, probe_results, reports,
                            subscriptions, incidents, incident_events,
                            outbox, app_components
  lib/
    auth.ts                 scrypt passwords, HMAC sessions, link tokens
    status.ts               thresholds, crowd 3+/10+, advice, IST formatting
    queries.ts              hot board snapshot (cached), list queries
    probe.ts                30s probe worker, incident + alert transitions
    alerts.ts               fan-out, de-dupe, Telegram/WhatsApp delivery
    actions.ts              shared report/subscription mutations (API + bot)
    telegram-bot.ts         bot commands, service matching, inline keyboards
    bot-i18n.ts             bot copy in 4 languages
    cache.ts                Redis (or in-process LRU) hot status cache
    i18n.ts                 UI dictionary, 4 languages
  components/               shell, board, subscriptions, reports, incidents,
                            services, settings, login, ui primitives
  app/
    (app)/                  board, subscriptions, reports, incidents,
                            services (admin), settings
    login/ status/          auth page, public app-health page
    api/                    auth, board, reports, subscriptions, services,
                            incidents, simulate, probe, cron/tick,
                            telegram/{link,test,webhook}, whatsapp/webhook
scripts/seed.mjs            demo dataset
```
