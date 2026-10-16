# Validation checklist — email, WhatsApp OTP, Telegram confirmation

Run these after you've put real values in `.env` (see
`PRODUCTION-VERIFICATION-SETUP.md`). Do them in this order — each one isolates
a different layer, so if something fails you know exactly where.

---

## A. Restart with the new `.env` first

Env vars are only read when the process starts.
```bash
# stop the running `npm run dev` (Ctrl+C), then:
npm run dev
```
Watch the first few lines of terminal output — if you still see
`[email] (RESEND_API_KEY not set)...` or `[whatsapp] (not configured)...`
later when you test, your `.env` wasn't saved/reloaded — fix that before
going further.

---

## B. Validate Resend (email)

1. Sign in to the app → **Settings**.
2. Click **Send code** next to your email.
3. **Terminal check (should NOT appear):** if you still see
   `[email] (RESEND_API_KEY not set) verification code for ...` in the
   `npm run dev` terminal, your real key isn't being picked up — re-check
   `.env` has no quotes/spaces around `RESEND_API_KEY=re_...` and restart.
4. **Success looks like:** no error toast, and a real email titled
   "Your verification code" lands in your inbox within ~10–30 seconds
   (check spam folder the first time).
5. Enter the 6-digit code from the email into the Settings box → click
   **Confirm** → badge should flip from `NOT VERIFIED` to `VERIFIED`.
6. **If you get a toast error** — the message now shown is the *real*
   provider error (we fixed the silent placeholder-masking bug), so read it
   literally:
   - `"Could not send the email"` / domain-related wording → your `EMAIL_FROM`
     domain isn't verified yet in Resend — switch to
     `onboarding@resend.dev` as `EMAIL_FROM` temporarily.
   - `"API key is invalid"` → the key was copied wrong, or regenerated in
     Resend since you copied it — get a fresh one from Resend → API Keys.

---

## C. Validate WhatsApp OTP

1. Settings → enter your WhatsApp number (the exact test number you
   verified in Meta's API Setup page, digits only, country code, no `+`,
   e.g. `91XXXXXXXXXX`) → **Save**.
2. Click **Send code** under "Verify your WhatsApp number."
3. **Terminal check (should NOT appear):**
   `[whatsapp] (not configured) verification code for ...` — if you see this,
   `.env` didn't reload; restart `npm run dev`.
4. **Success:** a WhatsApp message using your `verify_code` template arrives
   on that phone within seconds.
5. **Common real errors you might now see** (these are Meta's actual
   responses, not bugs):
   - `"(#131030) Recipient phone number not in allowed list"` → that number
     isn't added as a test recipient yet in Meta's API Setup page — add +
     verify it there first.
   - `"Template name does not exist in [language]"` → your template isn't
     **Approved** yet (check WhatsApp Manager → Message Templates → status
     column), or `WHATSAPP_OTP_TEMPLATE` in `.env` doesn't exactly match the
     template's name.
   - `"(#190) Invalid OAuth access token"` → token expired (the 24h temporary
     one) or mistyped — generate a System User permanent token instead (see
     §2 of the setup guide).
6. Enter the code → **Confirm** → badge flips to `VERIFIED`.

---

## D. Validate Telegram (bot token + webhook + confirmation message)

1. `.env` has real `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
   `TELEGRAM_WEBHOOK_SECRET` → rebuild if you changed the
   `NEXT_PUBLIC_*` one: `npm run build && npm start` (or just restart `dev`
   if you only changed the token/secret).
2. Register the webhook once (needs a public HTTPS URL — see the setup
   guide §3 for the ngrok command if you're local-only):
   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://<your-public-url>/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     -d 'allowed_updates=["message","callback_query"]'
   ```
   **Success:** response is `{"ok":true,"result":true,"description":"Webhook was set"}`.
3. Check it stuck:
   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```
   **Success:** `"url"` matches what you set, `"pending_update_count": 0`,
   and **no** `"last_error_message"` key at all. If you see
   `"last_error_message": "Wrong response from the webhook: 401 Unauthorized"`
   → `TELEGRAM_WEBHOOK_SECRET` in `.env` doesn't match what you passed to
   `setWebhook` — pick one value and use it in both places, then re-run
   `setWebhook`.
4. In the app → Settings → **Connect Telegram** → opens
   `t.me/<yourbot>?start=<token>` in a new tab → press **START** in Telegram.
5. **Success:** Settings page shows "Telegram: Connected" within a couple
   seconds (it polls), and the bot sends you a welcome message in that chat.
6. Now re-trigger an email or phone verification (B or C above) and
   complete it.
   **Success:** right after you click Confirm, a **second Telegram message**
   arrives automatically — e.g. "✅ Your email was just verified." — proving
   the confirmation-message requirement works end-to-end.
7. If no Telegram message arrives at step 5 or 6: check the `npm run dev`
   terminal for `[telegram]`-prefixed errors, and re-run `getWebhookInfo`
   (step 3) — a stale/failed webhook is the #1 cause.

---

## E. One combined smoke test (do this last)

1. Register a **brand-new** test account (don't reuse an already-verified one).
2. Set + verify email → confirm Telegram ping arrives.
3. Set + verify WhatsApp number → confirm Telegram ping arrives.
4. Connect Telegram → confirm welcome message arrives.
5. Reload the Settings page → all three badges should read `VERIFIED` /
   `Connected`, and the **Telegram handle field should still be read-only**
   (can't be hand-typed — only set by pressing START).

If all five pass, verification is fully live end-to-end.
