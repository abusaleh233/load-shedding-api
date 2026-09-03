# ⚡ Load Shedding & Power Management System — Backend API

A production-grade RESTful API built with **Node.js, TypeScript, Express, PostgreSQL/Prisma, Redis, and Stripe**, following a **Controller → Service → Prisma(Repository)** layered architecture.

---

## ⚠️ One honest deviation from the spec

The brief asked for **"Prisma v7 syntax & practices."** As of this build, Prisma has **not publicly released a v7** — the latest stable major is **v6.x**. Rather than invent APIs that don't exist, this project uses the current stable `prisma-client-js` generator and v6 client conventions, which are what the assignment can actually be run and graded against today. If v7 ships before your submission, the migration surface is small (mainly the `generator` block and import paths) — flag it to me and I'll adapt it.

---

## 🧱 Architecture

```
src/
├── app.ts                 # Express app assembly (security, parsers, routes, errors)
├── server.ts               # Entry point: DB connect, listen, graceful shutdown
├── config/                 # env, redis, stripe clients
├── lib/prisma.ts           # Prisma client singleton
├── middlewares/            # auth (JWT), rbac, validate (Zod), rateLimiter, error
├── utils/                  # ApiResponse, ApiError, asyncHandler, jwt, hash, logger
├── routes/index.ts         # Central router aggregation + Stripe webhook mount
└── modules/                # one folder per domain, each with:
    ├── *.routes.ts         #   → route wiring + middleware chain
    ├── *.controller.ts     #   → thin HTTP layer (req/res only)
    ├── *.service.ts        #   → business logic + Prisma transactions (repository layer)
    └── *.schema.ts         #   → Zod request validation schemas
```

Modules: `auth`, `user`, `substation`, `area`, `schedule`, `outage`, `payment`, `audit`.

**Why this shape:** controllers never touch Prisma directly; all business rules, transactions, and cache invalidation live in services, so the same logic is reusable and unit-testable independent of Express. Prisma itself plays the "repository" role — there's no separate repository layer, which is intentional (an extra indirection over Prisma's already-typed query builder adds no real safety here) — but the boundary is still explicit through the service layer.

---

## 🔑 Key rubric-driving design decisions

| Requirement | Implementation |
|---|---|
| **Standardized responses** | `ApiResponse` / `ApiError` classes; `error.middleware.ts` is the *single* place error JSON is shaped, including mapped Prisma error codes (P2002, P2025, P2003). |
| **Soft deletes** | Every core model has `deletedAt DateTime?`; all reads filter `deletedAt: null`; deletes are `UPDATE ... SET deletedAt = now()`. |
| **Audit logs** | `AuditLog` model + `recordAudit()` helper, called **inside the same Prisma transaction** as the action it logs, for every create/update/delete/auth event. Viewable via `GET /admin/audit-logs` (ADMIN only). |
| **Transactions & race conditions** | See below — the Schedule Engine's overlap check is the flagship example. |
| **Overlap prevention** | `schedule.service.ts::assertNoOverlap()` — Postgres `pg_advisory_xact_lock(hashtext(areaId))` inside the transaction serializes concurrent writers per-area, *then* runs the interval-overlap predicate. This closes the classic "two requests both pass the check before either commits" race that a naive check-then-insert has under READ COMMITTED. Documented recommendation for an `EXCLUDE` constraint (via `btree_gist`) as DB-level defense-in-depth, since Prisma's schema DSL can't express that constraint type directly. |
| **Indexing & constraints** | Composite/​single-column indexes on all foreign keys, status columns, and `deletedAt`; `@unique` on natural keys (email, substation code, feeder code, Stripe IDs); `onDelete: Restrict` on Area→Substation (can't orphan areas), `onDelete: Cascade` on Schedule/Outage→Area. |
| **3-role RBAC** | `authorize(...roles)` middleware, composed with `authenticate` per-route. ADMIN > OPERATOR > CONSUMER isn't hierarchical in code — each route explicitly lists which roles may call it, which is safer than assuming a rank order. |
| **JWT auth** | Short-lived access token (15m) + rotating refresh token (7d, hashed with SHA-256 at rest, single-use — reused refresh tokens are rejected). |
| **GCP Social Login** | `google-auth-library`'s `OAuth2Client.verifyIdToken()` validates the ID token's signature/audience server-side; find-or-create by `googleId`/email; auto-links an existing local account. |
| **Stripe** | Checkout Session API (`/payments/create-checkout-session`) + webhook (`/payments/webhook`) with signature verification. **Critical detail:** the webhook route is registered with `express.raw()` *before* the global `express.json()` in `app.ts` — Stripe's HMAC check needs the exact raw bytes, and a JSON-parsed-then-reserialized body will always fail verification. |
| **Redis caching** | `GET /outages/live` uses a cache-aside helper (`cacheAside()` in `config/redis.ts`), TTL from `REDIS_TTL_SECONDS`. Every mutation to Outage/Schedule/Area/Substation calls `invalidateCache("outages:live*")` so the cache never serves stale data past a write. |
| **Security** | `helmet()`, scoped `cors()`, `express-rate-limit` (200 req/15min global, 10 req/15min on auth endpoints), `bcrypt` (12 salt rounds, configurable). |

---

## 📡 API Endpoints (36 total)

Base path: `/api/v1` (configurable via `API_PREFIX`)

### Auth — `/auth`
| Method | Path | Access |
|---|---|---|
| POST | `/register` | Public |
| POST | `/login` | Public |
| POST | `/google` | Public (GCP ID token) |
| POST | `/refresh` | Public (valid refresh token) |
| POST | `/logout` | Public (revokes refresh token) |

### Users — `/users`
| Method | Path | Access |
|---|---|---|
| GET | `/me` | Authenticated |
| PATCH | `/me` | Authenticated |
| GET | `/` | ADMIN |
| PATCH | `/:id/role` | ADMIN |
| DELETE | `/:id` | ADMIN (soft delete) |

### Substations — `/substations`
| Method | Path | Access |
|---|---|---|
| POST | `/` | ADMIN, OPERATOR |
| GET | `/` | Authenticated |
| GET | `/:id` | Authenticated |
| PATCH | `/:id` | ADMIN, OPERATOR |
| DELETE | `/:id` | ADMIN (soft delete; blocked if areas still attached) |

### Areas — `/areas`
| Method | Path | Access |
|---|---|---|
| POST | `/` | ADMIN, OPERATOR |
| GET | `/` | Authenticated |
| GET | `/:id` | Authenticated |
| PATCH | `/:id` | ADMIN, OPERATOR |
| DELETE | `/:id` | ADMIN |

### Schedules — `/schedules` (Schedule Engine)
| Method | Path | Access |
|---|---|---|
| POST | `/` | ADMIN, OPERATOR — **overlap-checked** |
| GET | `/` | Authenticated (filter by areaId/status/date range) |
| GET | `/:id` | Authenticated |
| PATCH | `/:id` | ADMIN, OPERATOR — **re-checked on time change** |
| DELETE | `/:id` | ADMIN, OPERATOR (soft delete + auto-CANCELLED) |

### Outages / Emergencies — `/outages`
| Method | Path | Access |
|---|---|---|
| POST | `/` | Authenticated (CONSUMER can only report EMERGENCY) |
| GET | `/live` | Authenticated — **Redis-cached** |
| GET | `/` | Authenticated |
| GET | `/:id` | Authenticated |
| PATCH | `/:id` | ADMIN, OPERATOR |
| DELETE | `/:id` | ADMIN |

### Payments — `/payments`
| Method | Path | Access |
|---|---|---|
| POST | `/create-checkout-session` | Authenticated |
| POST | `/webhook` | Stripe (signature-verified, no auth header) |
| GET | `/history` | Authenticated (own payments) |
| GET | `/` | ADMIN (all payments) |

### Admin — `/admin/audit-logs`
| Method | Path | Access |
|---|---|---|
| GET | `/` | ADMIN (paginated, filterable by entity/action/userId) |

### Misc
`GET /api/v1/health` — liveness probe.

---

## 🚀 Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# fill in DATABASE_URL, JWT secrets, GOOGLE_CLIENT_ID, STRIPE keys, REDIS_URL

# 3. Generate Prisma client & run migrations
npx prisma generate
npx prisma migrate dev --name init

# 4. (Optional) Seed demo data — admin/operator/consumer users + sample substation/area
npm run prisma:seed

# 5. Run in dev mode (hot reload)
npm run dev

# Production build
npm run build && npm start
```

### Testing the Stripe webhook locally
```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```
Copy the `whsec_...` signing secret it prints into `STRIPE_WEBHOOK_SECRET`.

### Seeded accounts (after `npm run prisma:seed`)
| Role | Email | Password |
|---|---|---|
| ADMIN | admin@loadshedding.dev | Passw0rd123 |
| OPERATOR | operator@loadshedding.dev | Passw0rd123 |
| CONSUMER | consumer@loadshedding.dev | Passw0rd123 |

---

## 📦 Standardized response shapes

**Success**
```json
{ "success": true, "message": "Schedules retrieved successfully", "data": { "schedules": [], "pagination": {} } }
```

**Error**
```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "body.endTime", "message": "endTime must be after startTime" }] }
```

---

## ☁️ Deploying to Vercel

Vercel runs Node.js code as **serverless functions**, not a long-lived process — so `src/server.ts` (which calls `app.listen()`) is only for local dev. Deployment goes through a separate, stateless entry point instead.

**What's already wired up for this:**
- `api/index.ts` — exports the same `createApp()` Express instance as Vercel's serverless handler. No `app.listen()`, no bootstrap connect logic; the Prisma singleton in `src/lib/prisma.ts` connects lazily on first query, which is exactly what a stateless invocation needs.
- `vercel.json` — routes every incoming path to that one function, so Express's own internal routing (in `routes/index.ts`) still does all the work, unchanged.
- `"postinstall": "prisma generate"` in `package.json` — Vercel runs `npm install` as its first build step, and the Prisma client has to exist before anything importing `@prisma/client` gets type-checked/bundled.

**Steps:**
```bash
npm i -g vercel     # if you don't have the CLI
vercel               # first deploy — links the project, asks a few questions
vercel --prod        # subsequent production deploys
```
Or just push to GitHub and import the repo in the Vercel dashboard — either works.

**Environment variables:** set every value from `.env.example` in the Vercel dashboard under *Project Settings → Environment Variables* (not in a committed `.env` file). For the Stripe webhook, once deployed, update `STRIPE_WEBHOOK_SECRET` to the signing secret for an endpoint pointed at `https://<your-project>.vercel.app/api/v1/payments/webhook`.

**Two things that behave differently in serverless and need attention — flagging rather than glossing over:**

1. **Postgres connection pooling.** Every serverless invocation can spin up its own DB connection, and a burst of traffic can exhaust Postgres's `max_connections` fast. Use a pooled connection string — [Neon](https://neon.tech), [Supabase](https://supabase.com), or Vercel's own Postgres integration all provide one (typically append `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` when pooling through PgBouncer in transaction mode). One thing that *does* hold up under PgBouncer transaction-pooling despite the connection being handed back after each transaction: the schedule-overlap advisory lock uses `pg_advisory_xact_lock` (transaction-scoped, not session-scoped) specifically so it releases automatically at `COMMIT`/`ROLLBACK` — that was a deliberate choice, not an accident, and it's why the overlap-prevention logic doesn't need a dedicated persistent connection to work correctly here.
2. **Redis over a raw TCP client (`ioredis`).** This still works on Vercel, but every cold start reconnects, and it's not the most serverless-idiomatic option. If you hit connection-limit or cold-start latency issues on `/outages/live`, the straightforward swap is [Upstash Redis](https://upstash.com) (has a Vercel Marketplace integration) using its `rediss://` URL as a drop-in `REDIS_URL` — or, better, swapping `config/redis.ts` to Upstash's HTTP-based `@upstash/redis` client, which has no persistent connection at all. I haven't made that swap here since it wasn't asked for and touches the caching layer's implementation, not just config — say the word and I'll do it.

## 🧪 What's intentionally out of scope

- No test suite is included (not requested) — the layered architecture (services independent of Express) makes one straightforward to add with `jest` + `supertest` if your rubric expects it.
- No Docker Compose file — deployment target is Vercel (see above), not a container host, so this wasn't needed. Ask if that changes.
- `npm install` was not run in this environment (no network access on my end), so dependency versions are pinned to what I know is compatible as of early 2026, but you should run `npm install` yourself and resolve any transitive advisories before submitting.
