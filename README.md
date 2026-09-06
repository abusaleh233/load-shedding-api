# ⚡ Load Shedding & Power Management System — Backend API

A production-grade RESTful API built with **Node.js, TypeScript, Express, PostgreSQL/Prisma, Redis, and Stripe**, following a **Controller → Service → Prisma(Repository)** layered architecture.

---



## 📡 API Endpoints (41 total)

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

### Bills — `/bills`
| Method | Path | Access |
|---|---|---|
| POST | `/` | ADMIN, OPERATOR |
| GET | `/` | Authenticated (ADMIN sees all, CONSUMER sees own) |
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
`GET /api/v1` — liveness probe.

---


### Seeded accounts (after `npm run prisma:seed`)
| Role | Email | Password |
|---|---|---|
| ADMIN | admin123@gmail.com | Admin123! |
| OPERATOR | operator123@gmail.com | Operator123! |
| CONSUMER | consumer123@gmail.com | Consumer123! |

---
