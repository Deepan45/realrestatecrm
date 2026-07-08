# RealRest CRM

Full-stack CRM for a real estate + visa lead business: lead capture, pipeline management, property inventory, a property-matching engine, WhatsApp property sharing, and Level-2 partner lead distribution.

📄 **[Functional specification](docs/FUNCTIONAL_SPEC.md)** — roles & permissions matrix, module-by-module behaviour, workflows, and business rules.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, TypeScript |
| Backend | Node.js, Express, TypeScript, Zod validation |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT + role-based access control (5 roles) |
| Integrations | WhatsApp Cloud API (pluggable provider, mock in dev), SMTP email, local file uploads |
| Docs | Swagger UI at `/api/docs` |
| Deploy | Docker + docker-compose |

## Roles

- **SUPER_ADMIN** — everything, user management, settings, audit logs
- **SALES_MANAGER** — all leads, assignment, pipeline, reports, WhatsApp logs, partners, templates
- **SALES_EXECUTIVE** — own assigned leads, property matching, WhatsApp sharing, notes/follow-ups
- **PROPERTY_STAFF** — property CRUD, images, availability
- **PARTNER_USER** — only leads shared with their company; updates partner-side status

## Quick start (local)

Prereqs: Node 20+, PostgreSQL 14+ (or use Docker for the DB only: `docker compose up db`).

```bash
# 1. Backend
cd backend
cp .env.example .env            # edit DATABASE_URL if needed
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev                     # API on http://localhost:4000, docs at /api/docs

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # UI on http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL=http://localhost:4000/api` in `frontend/.env.local` if the API runs elsewhere.

### Demo logins (password for all: `Admin@1234`)

| Role | Email |
|---|---|
| Super Admin | admin@realrest.example |
| Sales Manager | manager@realrest.example |
| Sales Executive | fatima@realrest.example, john@realrest.example |
| Property Staff | priya@realrest.example |
| Partner User | omar@gulfgate.example |

## Docker (full stack)

```bash
docker compose up --build
# Frontend: http://localhost:3000 · API: http://localhost:4000 · Docs: http://localhost:4000/api/docs
```

Migrations and seed run automatically on backend start.

## Environment variables (backend/.env)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |
| `PORT`, `APP_URL` | Server port, frontend URL (used in reset-password emails) |
| `WHATSAPP_PROVIDER` | `mock` (logs messages) or `cloud` (WhatsApp Cloud API) |
| `WHATSAPP_CLOUD_API_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | Cloud API credentials |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Email; leave `SMTP_HOST` empty to log to console |

## Key workflows

1. **Visa lead → property sharing**: leads arrive via `POST /api/leads/capture` (public, no auth — point your visa/website form at it). Managers are notified, assign to staff; staff opens the lead, clicks *Find matches* (scored on budget 35 / location 25 / type 20 / bedrooms 15 / currency 5), selects properties, and sends via WhatsApp. The lead auto-moves to *Property Shared* and a follow-up reminder is created for +2 days.
2. **Partner escalation**: from the lead page, *Share to partner* creates a tracked `PartnerLeadShare`; partner users log in and update the share status (Accepted → In Progress → … → Converted). A partner-side conversion also converts the CRM lead. Manager reports show per-partner conversion.
3. **Property upload**: property staff add listings + images; they are immediately searchable and matchable.

Follow-up reminders run as an in-process job every 15 minutes (in-app + email notification to the assignee).

## API surface

Full interactive docs at `/api/docs`. Highlights:

- `POST /api/auth/login`, `/forgot-password`, `/reset-password`
- `GET|POST /api/leads`, `GET /api/leads/board`, `POST /api/leads/import` (CSV)
- `POST /api/leads/:id/assign | change-stage | add-note | follow-up | match-properties | shortlist | send-whatsapp | share-partner`
- `GET|POST|PUT|DELETE /api/properties`, `POST /api/properties/:id/images`, `POST /api/properties/import`
- `GET|POST|PUT /api/partners`, `GET /api/partners/:id/leads`, `PUT /api/partners/shares/:shareId`
- `GET /api/whatsapp/templates|logs`
- `GET /api/reports/dashboard | leads | staff | partners | monthly`
- `GET|POST|PUT /api/users`, `GET /api/notifications`, `GET|PUT /api/settings`

## CSV import formats

**Leads** (`POST /api/leads/import`): `fullName,mobile,whatsappNumber,email,country,city,preferredArea,budgetMin,budgetMax,currency,propertyType,bedrooms,visaType`

**Properties** (`POST /api/properties/import`): `title,type,category,location,address,areaSqft,bedrooms,bathrooms,furnishing,amenities,price,currency,description` — separate multiple amenities with `|`.

## Project structure

```
backend/
  prisma/schema.prisma      # 17 models: users, leads, properties, partners, whatsapp, notifications…
  prisma/seed.ts            # demo users, leads, properties, partners, templates
  src/
    middleware/             # JWT auth, RBAC, zod validation, uploads, error handling
    services/               # whatsapp provider, matching engine, email, notifications, audit, activity
    modules/                # auth, users, leads, properties, partners, whatsapp, notifications, reports, settings
    jobs/                   # follow-up reminder scheduler
    docs/openapi.ts         # Swagger spec
frontend/
  src/lib/                  # API client, auth context, shared types
  src/components/           # UI kit, LeadForm, PropertyForm
  src/app/
    login/  reset-password/
    (dashboard)/            # dashboard, leads, leads/[id], pipeline, properties, partners, reports, users, settings
```
