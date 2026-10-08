/* Seeds the demo dataset: 12 services, 24h of probes, incidents, reports,
 * subscriptions, alert outbox, app-health components and demo users.
 * Run:  node scripts/seed.mjs   (after `npx drizzle-kit push`)
 */
import pg from "pg";
import { createHmac, randomBytes, scryptSync } from "crypto";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
});

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `s2$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const SERVICES = [
  ["upi-npci", "UPI via NPCI", "NPCI UPI", "payments", "NPCI", "https://www.npci.org.in/what-we-do/upi", "The rails every UPI app rides on.", 180, 700, 2500, 10],
  ["upi-hdfc", "UPI via HDFC Bank", "HDFC UPI", "payments", "HDFC Bank", "https://www.hdfcbank.com/", "Collect requests and HDFC-led UPI handles.", 250, 900, 3000, 20],
  ["upi-sbi", "UPI via SBI", "SBI UPI", "payments", "State Bank of India", "https://www.onlinesbi.sbi/", "YONO and SBI UPI handle routing.", 320, 1000, 3200, 30],
  ["upi-icici", "UPI via ICICI Bank", "ICICI UPI", "payments", "ICICI Bank", "https://www.icicibank.com/", "iMobile Pay and ICICI UPI handles.", 240, 900, 3000, 40],
  ["upi-paytm", "UPI via Paytm", "PAYTM UPI", "payments", "Paytm Payments Bank", "https://paytm.com/", "Paytm UPI and wallet rail.", 210, 850, 2800, 50],
  ["upi-phonepe", "UPI via PhonePe", "PHONEPE", "payments", "PhonePe", "https://www.phonepe.com/", "PhonePe UPI collect and intent flow.", 200, 800, 2600, 60],
  ["upi-gpay", "UPI via Google Pay", "GOOGLE PAY", "payments", "Google India", "https://pay.google.com/", "Google Pay UPI intent and collect.", 190, 800, 2600, 70],
  ["irctc", "IRCTC", "IRCTC", "travel", "Indian Railways", "https://www.irctc.co.in/nget/train-search", "Booking, Tatkal and PNR enquiry.", 640, 1500, 4000, 80],
  ["digilocker", "DigiLocker", "DIGILOCKER", "governance", "MeitY", "https://www.digilocker.gov.in/", "Issued documents and e-sign.", 300, 900, 3000, 90],
  ["aadhaar-ekyc", "Aadhaar e-KYC", "AADHAAR KYC", "governance", "UIDAI", "https://uidai.gov.in/", "OTP and demographic e-KYC pulls.", 420, 1200, 3500, 100],
  ["gst-portal", "GST portal", "GST PORTAL", "compliance", "GSTN", "https://www.gst.gov.in/", "Returns, GSTR-1 and payment.", 520, 1500, 4500, 110],
  ["income-tax", "Income Tax portal", "INCOME TAX", "compliance", "CBDT", "https://www.incometax.gov.in/iec/foportal/", "Filing, refunds and 26AS.", 700, 1800, 5000, 120],
];

const CITIES = ["Dhule", "Pune", "Chennai", "Lucknow", "Nagpur", "Kochi", "Indore"];

const USERS = [
  // email, password, name, role, city, locale, telegram handle, whatsapp phone (E.164, no +)
  ["merchant@isitdown.in", "merchant123", "Meera Joshi", "merchant", "Pune", "en", "meera_joshi", null],
  ["admin@isitdown.in", "admin123", "Rukmini Desai", "admin", "Mumbai", "en", "rukmini_desai", null],
  ["sandeep@dhule.shop", "demo1234", "Sandeep Patil", "merchant", "Dhule", "hi", "sandeep_dhule", "919812345001"],
  ["kavya@chennai.in", "demo1234", "Kavya Raman", "merchant", "Chennai", "ta", "kavya_r", "919812345002"],
  ["imran@lucknow.in", "demo1234", "Imran Siddiqui", "merchant", "Lucknow", "hi", "imran_lko", null],
  ["priya@nashik.in", "demo1234", "Priya Bhosale", "merchant", "Nashik", "mr", "priya_nsk", null],
];

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of [
      "incident_events",
      "outbox",
      "incidents",
      "reports",
      "subscriptions",
      "probe_results",
      "app_components",
      "services",
      "users",
      "schema_version",
    ]) {
      await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
    }

    /* ---------------- users ---------------- */
    const userIds = {};
    for (const [email, pw, name, role, city, locale, tg, phone] of USERS) {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, name, role, city, locale, telegram_id, telegram_handle, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [email, hashPassword(pw), name, role, city, locale, null, tg, phone],
      );
      userIds[email] = rows[0].id;
    }
    const citizenIds = Object.values(userIds);

    /* ---------------- services ---------------- */
    const serviceIds = {};
    for (const [slug, name, short, category, provider, url, desc, base, deg, down, order] of SERVICES) {
      const { rows } = await client.query(
        `INSERT INTO services (slug, name, short_name, category, provider, url, description,
           base_latency_ms, check_interval_sec, timeout_ms, degraded_threshold_ms, down_threshold_ms, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,30,5000,$9,$10,$11) RETURNING id`,
        [slug, name, short, category, provider, url, desc, base, deg, down, order],
      );
      serviceIds[slug] = rows[0].id;
    }

    /* ---------------- 24h of probe history (5 min step) ---------------- */
    const now = Date.now();
    const STEP = 5 * 60_000;
    const rows = [];
    for (const [slug, , , , , , , base, deg, down] of SERVICES) {
      const id = serviceIds[slug];
      for (let t = 24 * 60; t >= 0; t -= STEP / 60000) {
        const at = new Date(now - t * 60_000);
        const bucket = Math.floor(at.getTime() / 60_000);
        const r = (fnv(`${slug}:${bucket}`) % 10000) / 10000;
        const jitter = 0.8 + ((fnv(`${slug}:${bucket}`) >>> 7) % 900) / 1000;
        let latency = Math.round(base * jitter);
        let success = true;
        let detail = "seeded history";
        let status = "up";
        if (r > 0.978) {
          latency = down + Math.round(r * 1200);
          success = false;
          detail = "seeded: gateway timeout";
          status = "down";
        } else if (r > 0.93) {
          latency = Math.round(deg * (0.9 + r * 0.4));
          detail = "seeded: peak-hour queueing";
          status = latency >= down ? "down" : latency >= deg ? "degraded" : "up";
        }
        // two deliberate, realistic dips so the sparklines have a story
        if (slug === "irctc" && t <= 60 && t >= 45) {
          latency = down + 600;
          success = false;
          detail = "seeded: Tatkal hour overload";
          status = "down";
        }
        if (slug === "upi-hdfc" && t <= 300 && t >= 270) {
          latency = deg + 700;
          detail = "seeded: collect request backlog";
          status = "degraded";
        }
        rows.push([id, at.toISOString(), latency, success, status, "seed", detail]);
      }
    }
    const COLS = 7;
    for (let i = 0; i < rows.length; i += 300) {
      const chunk = rows.slice(i, i + 300);
      const values = chunk
        .map(
          (_, j) =>
            `(${Array.from({ length: COLS }, (_, k) => `$${j * COLS + k + 1}`).join(",")})`,
        )
        .join(",");
      const params = chunk.flat();
      await client.query(
        `INSERT INTO probe_results (service_id, checked_at, latency_ms, success, status, source, detail)
         VALUES ${values}`,
        params,
      );
    }

    /* ---------------- incidents ---------------- */
    const todayIST = (h, m) => {
      const d = new Date();
      const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000);
      ist.setHours(h, m, 0, 0);
      if (ist.getTime() > d.getTime()) ist.setDate(ist.getDate() - 1);
      return ist.toISOString();
    };

    const incidentSeeds = [
      ["irctc", "IRCTC Tatkal slowdown", "degraded", "resolved", todayIST(10, 4), 14, "Tatkal quota opened; booking service queue saturated behind a slow payment callback.", "probe"],
      ["upi-hdfc", "HDFC UPI collect timeouts", "degraded", "resolved", todayIST(8, 41), 22, "Collect requests stalled in the bank's queue; NPCI rail itself stayed clear.", "probe"],
      ["gst-portal", "GST filing 5xx on GSTR-1", "down", "resolved", todayIST(21, 12), 9, "Return filing endpoint returned 502 at the monthly deadline rush.", "reports"],
    ];
    for (const [slug, title, severity, state, start, mins, cause, origin] of incidentSeeds) {
      const started = new Date(start);
      const resolved = new Date(started.getTime() + mins * 60000);
      const { rows } = await client.query(
        `INSERT INTO incidents (service_id, title, severity, state, started_at, resolved_at, cause, origin, auto_closed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
        [serviceIds[slug], title, severity, state, started.toISOString(), resolved.toISOString(), cause, origin],
      );
      const incId = rows[0].id;
      await client.query(
        `INSERT INTO incident_events (incident_id, at, kind, body, author) VALUES
         ($1,$2,'detect',$3,'probe-worker'),
         ($1,$4,'note',$5,$6),
         ($1,$7,'resolve',$8,'probe-worker')`,
        [
          incId,
          started.toISOString(),
          `Automatic probe recorded ${severity}. Watching for recovery.`,
          new Date(started.getTime() + 3 * 60000).toISOString(),
          "Reports from Chennai and Pune confirmed the same symptom; bank status page silent.",
          "Rukmini Desai",
          resolved.toISOString(),
          `Recovered after ${mins} min. Probe reports UP again.`,
        ],
      );
    }

    /* ---------------- crowd reports ---------------- */
    const reportSeeds = [
      // IRCTC — 6 inside the 15 minute window (crowd caution)
      ["irctc", 4, "Tatkal search spins forever", 3],
      ["irctc", 5, "Payment page took 40s, booking lost", 6],
      ["irctc", null, "PNR status not loading", 8],
      ["irctc", 3, "App opens but train list empty", 10],
      ["irctc", null, "Captcha not rendering", 12],
      ["irctc", 6, "Seat availability blank for 12720", 14],
      // GST — 11 inside the window (crowd red)
      ["gst-portal", 4, "GSTR-1 filing returns 502", 2],
      ["gst-portal", 5, "OTP never arrives for return filing", 3],
      ["gst-portal", null, "Payment page shows blank after challan", 4],
      ["gst-portal", 3, "Dashboard keeps logging me out", 5],
      ["gst-portal", 6, "ITC statement not opening", 6],
      ["gst-portal", null, "Search by GSTIN spins", 7],
      ["gst-portal", 4, "Annual return save fails silently", 8],
      ["gst-portal", 5, "GSTR-3B upload times out", 9],
      ["gst-portal", null, "Bank page redirect loop", 10],
      ["gst-portal", 3, "Registration module down", 11],
      ["gst-portal", 6, "Helpdesk number busy, portal 500", 13],
      // older, outside the window
      ["upi-phonepe", 5, "Collect request timed out三次", 95],
      ["aadhaar-ekyc", null, "OTP not received from UIDAI", 140],
      ["income-tax", 4, "Refund status page empty", 200],
    ];
    for (const [slug, userIdIdx, note, minutesAgo] of reportSeeds) {
      await client.query(
        `INSERT INTO reports (service_id, user_id, city, note, state, created_at)
         VALUES ($1,$2,$3,$4,'open',$5)`,
        [
          serviceIds[slug],
          userIdIdx === null ? null : citizenIds[userIdIdx],
          CITIES[fnv(note) % CITIES.length],
          note.includes("三次") ? "Collect request timed out three times" : note,
          new Date(now - minutesAgo * 60000).toISOString(),
        ],
      );
    }

    /* ---------------- subscriptions ---------------- */
    const subSeeds = [
      [0, "irctc", "telegram", "degraded"],
      [0, "upi-hdfc", "telegram", "down"],
      [0, "gst-portal", "telegram", "degraded"],
      [1, "upi-npci", "telegram", "down"],
      [1, "gst-portal", "telegram", "degraded"],
      [2, "irctc", "telegram", "degraded"],
      [3, "upi-phonepe", "telegram", "down"],
      [4, "gst-portal", "sms", "degraded"],
      [5, "aadhaar-ekyc", "whatsapp", "degraded"],
    ];
    for (const [idx, slug, channel, minSeverity] of subSeeds) {
      await client.query(
        `INSERT INTO subscriptions (user_id, service_id, channel, min_severity, active)
         VALUES ($1,$2,$3,$4,true)`,
        [citizenIds[idx], serviceIds[slug], channel, minSeverity],
      );
    }

    /* ---------------- alert outbox ---------------- */
    const outboxSeeds = [
      [0, "irctc", "IRCTC — STATUS: DEGRADED", "IRCTC: degraded. Don't retry — wait 10 minutes, then try once.", "degraded", "sent"],
      [1, "gst-portal", "GST PORTAL — STATUS: DOWN", "GST portal: down right now. Don't retry — money may be stuck. Watch this board.", "down", "sent"],
      [2, "irctc", "IRCTC — STATUS: DEGRADED", "IRCTC: धीमा है। बार-बार कोशिश न करें — 10 मिनट रुककर एक बार कोशिश करें।", "degraded", "sent"],
      [4, "gst-portal", "GST PORTAL — STATUS: DOWN", "GST portal: தற்போது செயல்படவில்லை. மீண்டும் முயற்சிக்க வேண்டாம்.", "down", "queued"],
    ];
    for (const [idx, slug, title, body, severity, state] of outboxSeeds) {
      await client.query(
        `INSERT INTO outbox (user_id, service_id, channel, title, body, severity, state, target, attempts, sent_at)
         VALUES ($1,$2,'telegram',$3,$4,$5,$6,$7,$8,$9)`,
        [
          citizenIds[idx],
          serviceIds[slug],
          title,
          body,
          severity,
          state,
          `telegram:${400000000 + idx}`,
          state === "sent" ? 1 : 0,
          state === "sent" ? new Date(now - 20 * 60000).toISOString() : null,
        ],
      );
    }

    /* ---------------- app health components ---------------- */
    const comps = [
      ["web-app", "Web application", "Status board, dashboards and public pages", "up", 99.98],
      ["probe-worker", "Probe worker", "HTTP checks every 30 seconds against 12 endpoints", "up", 99.91],
      ["status-cache", "Status cache", "Redis-shaped hot cache for current status reads", "up", 99.99],
      ["primary-db", "Primary database", "Postgres — services, probes, reports, incidents", "up", 99.97],
      ["alert-fanout", "Alert fan-out", "Queue drain and Telegram delivery", "degraded", 99.62],
    ];
    for (const [slug, name, description, state, uptime] of comps) {
      await client.query(
        `INSERT INTO app_components (slug, name, description, state, uptime7d, meta, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())`,
        [slug, name, description, state, uptime, JSON.stringify({ region: "ap-south-1" })],
      );
    }

    await client.query(
      `INSERT INTO schema_version (note) VALUES ($1)`,
      ["seed: 12 services, 24h probes, 3 incidents, crowd reports, subscriptions"],
    );

    await client.query("COMMIT");
    const counts = {};
    for (const t of ["users", "services", "probe_results", "reports", "subscriptions", "incidents", "incident_events", "outbox", "app_components"]) {
      counts[t] = (await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    }
    console.log("Seed complete:", counts);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
