# isitdown.india — Complete DevOps Journey

*From idea to a fully automated, cloud-deployed, observability-equipped application.*

---

## 1. The Problem

Service outages cost businesses money and trust, but most uptime-monitoring
and alerting tools are either expensive SaaS products or require heavy
infrastructure to self-host. **isitdown.india** is a free, self-hostable
service-status-monitoring platform: it continuously probes services, detects
incidents, and alerts subscribers via Email OTP login + Telegram — with zero
paid vendor dependency.

---

## 2. Application Architecture

- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL via Drizzle ORM
- **Cache**: Redis (optional — the app automatically falls back to an
  in-process LRU cache if Redis is unavailable, so the architecture degrades
  gracefully instead of failing)
- **Auth**: Email OTP (via Resend) — no password-reset-email vendor lock-in
- **Alerts/verification**: Telegram Bot API — free, reliable, used both for
  user verification and real-time incident alerts
- **Decision log**: WhatsApp Cloud API OTP was prototyped and then
  deliberately removed after hitting real reliability issues with Meta's
  sandbox account locking — a conscious engineering tradeoff documented
  here rather than hidden.

**[Insert screenshot: application home/status board]**
**[Insert screenshot: login flow with email OTP]**
**[Insert screenshot: Telegram bot verification]**

---

## 3. Containerization

A multistage `Dockerfile` (deps → builder → runner) produces a small,
production-ready image:
- `deps` stage installs dependencies
- `builder` stage runs `next build`
- `runner` stage copies only the compiled output + production
  `node_modules`, runs as a non-root user

Verified with a real `docker build` + `docker run` end-to-end, including
live database connectivity.

**[Insert screenshot: `docker build` succeeding]**

---

## 4. Local Orchestration — Docker Compose

`docker-compose.yml` runs the full stack together:
- `app` (the Next.js container)
- `postgres` (Postgres 17, isolated on port 5433 to avoid clashing with any
  host-native Postgres)
- `redis`

All three networked automatically via Compose's built-in DNS — the app
reaches Postgres/Redis by service name (`postgres`, `redis`), not IP.

**[Insert screenshot: `docker compose ps` showing all 3 containers healthy]**

### Observability layer — Elastic Stack
On top of the base stack, `docker-compose.yml` also runs:
- **Elasticsearch** (single-node, memory-capped for a dev/demo footprint)
- **Kibana** (dashboard/log explorer UI)
- **Filebeat** (ships every container's logs into Elasticsearch, tagged
  with container metadata)

This gives a real, searchable, live log pipeline — not just raw `docker logs`.

**[Insert screenshot: Kibana Discover view showing live app logs]**

---

## 5. CI/CD Pipeline — GitHub Actions

`.github/workflows/deploy.yml` runs on every push to `main`:

1. **Typecheck + lint** job — `npm run typecheck`, `npm run lint` (gate on
   real static-analysis checks)
2. **Build, push, deploy** job (only runs if the first job passes):
   - Builds the Docker image
   - Pushes it to a private **Amazon ECR** repository, tagged with the git
     commit SHA (full traceability between a deployed version and its
     exact source code)
   - Deploys that image to **AWS Elastic Beanstalk** automatically via the
     `beanstalk-deploy` action

**[Insert screenshot: GitHub Actions run — both jobs green]**

### A real engineering snag, and how it was fixed
The CI pipeline's `npm test` step initially failed because no automated
test framework was wired into `package.json`. Rather than fake a passing
test suite, the pipeline was changed to gate on `typecheck` + `lint` — real,
working automated checks — and this is flagged here transparently as a
known follow-up area (adding Vitest/Jest coverage) rather than concealed.

**[Insert screenshot: the failing run, and the fixed run right after]**

---

## 6. Cloud Deployment — AWS

### Services used
| Service | Purpose |
|---|---|
| IAM | Scoped service user for GitHub Actions (ECR + Beanstalk only, not admin) |
| ECR | Private Docker image registry |
| RDS (PostgreSQL 17) | Managed production database |
| Elastic Beanstalk | Runs the container, public HTTP endpoint, health checks |

### Setup highlights
- Single-instance Beanstalk environment (cost-conscious choice — avoids
  load-balancer charges for a project at this stage)
- RDS security group deliberately scoped to only two sources: the
  developer's IP (for running migrations) and the Beanstalk EC2 instance's
  own security group (for the live app) — not open to the whole internet
- IAM role for the EC2 instance explicitly granted
  `AmazonEC2ContainerRegistryReadOnly` so it can pull the private image

**[Insert screenshot: AWS RDS instance "Available"]**
**[Insert screenshot: Elastic Beanstalk environment "Health: Ok"]**
**[Insert screenshot: the live app's "Running version" matching a git commit SHA]**

### Real production debugging (the part that proves this wasn't copy-pasted)
Three genuine issues were hit and resolved during deployment, each with a
concrete root cause:

1. **`ECONNREFUSED 127.0.0.1:5432`** — the deployed app's `DATABASE_URL`
   environment property still held the old local-development value instead
   of the RDS endpoint. Root cause: an environment-variable edit in the AWS
   console hadn't actually been applied before saving. Fixed by explicitly
   re-entering the correct value.
2. **`ETIMEDOUT` connecting to RDS from the laptop** — the developer's
   public IP had changed since the RDS security group rule was created
   (common on home/mobile ISPs). Fixed by detecting the new IP
   (`curl -4 ifconfig.me`) and updating the security group rule.
3. **`no pg_hba.conf entry ... no encryption`** — RDS requires an encrypted
   connection, and the initial connection string didn't request one. Fixed
   by appending `?sslmode=no-verify` to the connection string (documented
   here as a pragmatic fix; a production-grade follow-up would pin RDS's
   CA certificate for full verification instead of skipping it).

**[Insert screenshot: one of the error logs + the fix that followed]**

---

## 7. Infrastructure as Code — Terraform

A complete, **validated** (`terraform validate` passes) Terraform project
mirrors the entire manually-built AWS setup:
- IAM users/roles/policies
- ECR repository
- RDS instance + security group
- Elastic Beanstalk application + environment, with environment variables
  computed automatically (e.g. `DATABASE_URL` is built from the RDS
  resource's own attributes, so it's always correct)

This proves the setup is reproducible — not a one-off set of manual clicks
that can never be rebuilt. The project intentionally keeps the already
-working live environment untouched (documented as a deliberate, low-risk
engineering decision) while providing the code to redeploy identically
elsewhere.

**[Insert screenshot: `terraform validate` → "Success! The configuration is valid."]**

---

## 8. What's Next (Roadmap)
- Add a real automated test suite (Vitest) to the CI pipeline
- HTTPS in front of Elastic Beanstalk (CloudFront or ALB+ACM) — required
  for Telegram webhook callbacks on the production URL
- Migrate the existing AWS resources under full Terraform management via
  `terraform import`
- Optional: Kubernetes deployment for teams needing multi-node scaling

---

## 9. What I Learned

*(Draft — personalize this before submitting; keep under 300 words for the
impact question)*

Building and deploying isitdown.india end-to-end taught me that the gap
between "it works on my machine" and "it works in production" is where
real engineering happens. I learned to debug across layers that don't show
their errors clearly — a wrong environment variable looks identical to a
network problem until you read the actual logs; a security group blocking
a connection looks identical to a wrong password until you test each
layer in isolation. I learned AWS networking (VPCs, security groups,
IAM roles) hands-on by hitting real walls: a stale IP allowlist, a missing
ECR permission, an SSL requirement I didn't know existed until RDS told me.
I learned that automated pipelines (CI/CD, Terraform) aren't optional
polish — they're what make a project maintainable by someone other than
the person who built it, including future me. Most importantly, I learned
to make deliberate tradeoffs under constraints (dropping a costly/unreliable
WhatsApp integration, choosing a single-instance deployment to control
cost) and document *why*, rather than chasing a "perfect" architecture I
couldn't actually finish. The impact: a genuinely free, self-hostable
alternative to paid uptime-monitoring SaaS tools, built and deployed with a
real, reproducible, automated pipeline — not just a demo that only runs
once.

