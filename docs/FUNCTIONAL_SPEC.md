# RealRest CRM — Functional Specification

**Version:** 1.0 · **Date:** July 2026 · **Status:** Reflects the implemented system

This document describes *what the system does* from a business/functional point of view: user roles, modules, workflows, and business rules. For setup and technical details, see the [README](../README.md); for the API contract, see Swagger at `/api/docs`.

---

## 1. Purpose & scope

RealRest CRM manages the full life cycle of a real-estate lead:

1. **Capture** — leads arrive from visa/website forms, CSV import, manual entry, referrals, or WhatsApp.
2. **Qualify & assign** — managers assign leads to sales executives; requirements (budget, area, property type, bedrooms, visa needs) are recorded.
3. **Match & share** — a scoring engine matches available inventory to the lead's requirements; shortlists are sent to the client via WhatsApp.
4. **Follow up & progress** — a Kanban pipeline tracks each lead through 11 stages, with automatic follow-up reminders.
5. **Escalate to partners** — leads can be distributed to external partner companies ("Level-2 distribution") who work them through their own status flow.
6. **Convert & report** — conversions, staff performance, partner performance, and lead-source effectiveness are reported to management.

---

## 2. User roles & permissions

| Capability | SUPER_ADMIN | SALES_MANAGER | SALES_EXECUTIVE | PROPERTY_STAFF | PARTNER_USER |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✅ (all data) | ✅ (all data) | ✅ (own leads) | ✅ | ✅ (shared leads) |
| View leads | All | All | Own assigned only | — | Shared with their company only |
| Create / edit leads | ✅ | ✅ | ✅ (own) | — | — |
| Assign leads to staff | ✅ | ✅ | — | — | — |
| Pipeline board (drag & drop) | ✅ | ✅ | ✅ (own) | — | — |
| Property matching + WhatsApp send | ✅ | ✅ | ✅ | — | — |
| Notes / follow-ups on leads | ✅ | ✅ | ✅ | — | — |
| Share lead to partner | ✅ | ✅ | ✅ | — | — |
| Update partner-share status | ✅ | ✅ | ✅ | — | ✅ (own company's shares) |
| View properties | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit / delete properties, media | ✅ | ✅ | — | ✅ | — |
| Partner company management | ✅ | ✅ | view | — | own company (read) |
| Reports (leads / staff / partners / monthly) | ✅ | ✅ | — | — | — |
| WhatsApp templates | ✅ | ✅ | use only | — | — |
| User management, audit logs, currencies | ✅ | — | — | — | — |

**General rules**

- SUPER_ADMIN implicitly passes every role check.
- Partner users see a **redacted** lead view: internal notes, activity timeline, WhatsApp logs, pipeline history, and other partners' shares are hidden.
- Deactivated users cannot log in and cannot be assigned leads; users are deactivated, never deleted.

---

## 3. Authentication & account management

- **Login** with email + password; a JWT is issued (configurable expiry) and required on every API call.
- **Forgot password** — the user requests a reset link by email; the response never reveals whether the email exists. The link contains a one-time token valid for **1 hour**.
- **Reset password** — minimum 8 characters; the token is cleared after use.
- **Session expiry** — any API call returning 401 logs the user out and redirects to the login screen.
- Logins, password resets, and all significant actions (create/update/delete of leads, properties, users, partners, settings, imports) are written to the **audit log** (visible to SUPER_ADMIN).

---

## 4. Modules

### 4.1 Dashboard

KPI tiles: total leads, new today, follow-ups due today, conversion rate, properties available, properties shared today, WhatsApp sent today, partner-shared leads. Bar charts: leads by source, leads by pipeline stage, leads per staff member (managers only). Lead counts are scoped to the viewer (executives see their own, partners see shares).

### 4.2 Leads

**Fields:** full name*, mobile*, WhatsApp number (defaults to mobile), email, country, city, preferred area, budget min/max + currency, property type, bedrooms, visa type, visa required flag, source, priority (Low/Medium/High/Urgent), requirement notes, assigned staff, follow-up date.

**Sources:** `VISA_FORM`, `WEBSITE_FORM`, `MANUAL`, `REFERRAL`, `WHATSAPP`, `IMPORT`, `PARTNER`.

**Ways a lead enters the system**
1. **Public capture endpoint** (`POST /api/leads/capture`, no auth) — for embedding in visa/website forms. Rate-limited to 20 submissions per IP per 10 minutes. Every active manager is notified in-app on each capture.
2. **Manual creation** by sales staff.
3. **CSV import** (managers/executives) — one row per lead; invalid rows are reported per-row with reasons (first 20 shown), valid rows still import.

**Lead list** — filterable by search text (name/phone/email), status, source, property type, assigned staff, and "follow-up due"; paginated and sortable. The dashboard "Follow-ups due" tile deep-links to this filter.

**Lead detail** — requirement summary, notes (internal), set follow-up, matching panel (§4.4), WhatsApp send (§4.5), share-to-partner (§4.6), and four history tabs: activity timeline, WhatsApp log, partner shares, pipeline history.

### 4.3 Pipeline (Kanban)

Twelve stages: `New Lead → Initial Contact → Requirement Analysis → Property Matching → Property Shared → Follow-up Pending → Site Visit Scheduled → Site Visit Completed → Negotiation → Bank Loan → Shared to Partner → Registration → Lost/Closed`.

- Cards are dragged between stages; the move is optimistic and rolls back with an error banner if the server rejects it.
- **Status ⇄ stage sync:** changing a lead's *status* moves it to the implied *stage* and vice-versa (e.g. status `INTERESTED` ⇒ stage `Site Visit Scheduled`; stage `Lost/Closed` ⇒ status `CLOSED_LOST`). `Site Visit Completed` and `Bank Loan` are pipeline-only waypoints with no dedicated status — moving a card there doesn't change the lead's status field. Every stage change is recorded in pipeline history with who moved it.
- Moving to **Registration** (the deal-closed stage, formerly labelled "Converted") stamps the conversion date; the underlying lead *status* value remains `CONVERTED` for reporting continuity.
- **Cross-assignment:** managers can assign any lead to any staff member; a sales executive can *transfer* a lead they currently hold to a peer or back to a manager (they cannot touch a colleague's lead). Every (re)assignment is logged on the activity timeline.
- **Automated stage-triggered WhatsApp messages** fire on three transitions (best-effort — a failed send never blocks the stage change): entering **Site Visit Scheduled** sends the buyer a confirmation with the scheduled time; entering **Site Visit Completed** requests feedback; entering **Registration** asks for a testimonial and referral. Message wording lives in the same WhatsApp Templates settings screen (keys `site_visit_before`, `site_visit_feedback`, `registration_testimonial`).
- **30-day lead recycling:** a daily job unassigns any lead that hasn't reached a new pipeline stage in 30 days (and isn't already Registration/Lost-Closed), returning it to the unassigned pool and notifying managers with a summary count.

### 4.4 Property matching engine

Triggered from the lead page ("Find matches"). Only **AVAILABLE** properties are considered. Each candidate is scored out of 100:

| Criterion | Weight | Rules |
|---|---|---|
| Budget | 35 | Full points inside min–max; 18 points if within ±15%; neutral credit (15) when the lead has no budget |
| Location | 25 | Preferred area (or city) contained in property location/address; neutral credit (10) if lead gave none |
| Property type | 20 | Exact type match; neutral credit (10) if lead gave none |
| Bedrooms | 15 | Exact = 15, ±1 bedroom = 8; neutral credit (7) if unknown |
| Currency | 5 | Same currency |

Results below **30 points are dropped**; the top 20 are shown with the reasons for each score (e.g. "Within budget", "Bedroom count within ±1"). Staff can tick properties and **save a shortlist** against the lead; shortlists persist and show whether each property was already sent via WhatsApp.

### 4.5 WhatsApp property sharing

- Message = selected template (placeholders `{{name}}`, `{{agent}}`, `{{properties}}`) **or** custom message **or** an auto-generated intro. The property block lists each property's title, price, location, short description, and first photo link.
- Only **active** templates can be used; deactivated templates disappear from the picker and are refused by the server.
- Sent to the lead's WhatsApp number (falls back to mobile) through the configured provider — WhatsApp Cloud API in production, a console-logging mock in development.
- **On success with properties attached (Workflow 1):** lead status/stage auto-move to *Property Shared*; a follow-up is auto-scheduled **+2 days** (unless one is already set); the shortlist entries are flagged "shared"; the assignee is notified.
- **On failure:** the attempt is logged with the provider error and surfaced to the user; the lead is not moved.
- Every message is stored in the WhatsApp log (recipient, body, template, status, provider message id). Managers see all logs; executives see their own.

### 4.6 Partner distribution (Level 2)

- Managers maintain **partner companies** (contact info, status Active/Inactive). Only active partners can receive leads.
- "Share to partner" from a lead creates a tracked **share record** with optional notes; the lead moves to status/stage *Shared to Partner*, and every active user of the partner company is notified in-app **and by email**.
- Partner users log into the same app and see only their company's shared leads (redacted view). They progress each share through: `Shared → Accepted → In Progress → Client Contacted → Property Sent → Converted / Rejected / Closed`.
- Partner status updates notify the staff member who shared the lead. Setting a share to **Converted** (by partner or staff) converts the CRM lead itself.

### 4.7 Properties

**Fields:** title*, type* (Apartment, Villa, Townhouse, Penthouse, Studio, Plot, Office, Retail, Warehouse, Other), category* (Sale, Rent, Lease, Commercial, Residential), location*, address, area (sqft), bedrooms, bathrooms, furnishing, amenities, price* + currency, description, availability (Available, Booked, Sold, Rented, Inactive), owner/contact details, managing staff.

**Media** (added on the edit page after the property is saved):
- **Images** — up to 12 per property, 8 MB each (jpg/png/webp/gif). The first uploaded image becomes the primary photo used in cards and WhatsApp messages.
- **Video tour** — one per property, uploaded as a file (mp4/mov/webm/m4v, up to 200 MB). Uploading a new video replaces the previous file; the video plays inline on the property page.
- **YouTube video** — alternatively (or in addition), paste a YouTube URL/embed link; it renders as an embedded player on the property page instead of/alongside the uploaded file.
- **Location pin** — optional latitude/longitude, settable by typing coordinates or tapping "Use my current location" (browser geolocation, no API key required); the property page shows a "View on Google Maps" link built from the coordinates (`google.com/maps?q=lat,lng`).

**Other rules**
- Searchable/filterable by text, type, category, availability, bedrooms, price range; paginated cards.
- When a property's **availability changes**, every staff member with that property shortlisted for a lead is notified (e.g. "now SOLD").
- **CSV import** with per-row error reporting; amenities separated by `|`. **CSV export** (all properties) is restricted to Super Admin.
- Create/edit/delete restricted to Property Staff and Sales Managers.
- Every property-detail view is logged (fire-and-forget) for the property-engagement report (§4.9).
- **Website sync:** creating, updating, or deleting a property in the CRM pushes the change to the public website's API (`WEBSITE_API_URL`) if configured; unconfigured environments just log the payload instead of failing. Properties can also flow the other way — the website posts to an inbound webhook (§8) which upserts by `externalId` so re-syncs update the same CRM row instead of duplicating it.

### 4.8 Notifications

- In-app bell with unread badge; polls every 60 s; "mark all read"; clicking a lead-related notification opens that lead.
- Triggers: new captured lead (→ managers), lead assigned (→ assignee, +email), properties sent to a client (→ assignee), lead shared to partner (→ partner users, +email), partner status update (→ sharing staff), property availability change (→ interested staff), follow-up due (→ assignee, +email).
- **Follow-up reminder job** runs every 15 minutes; a due lead produces at most one reminder per 24 h; closed/converted/invalid leads are skipped.
- Email mirrors selected notifications via SMTP; without SMTP configured, emails are logged to the console (dev mode).

### 4.9 Reports (managers)

- **Lead report** — by source, by status, visa-lead count, recently lost leads; date-range filter.
- **Staff performance** — per executive: assigned, converted, conversion %, WhatsApp sent, partner shares, site visits completed.
- **Partner performance** — per partner: leads received, converted, conversion %, breakdown by share status.
- **Monthly trend** — last 12 months of lead volume vs conversions vs pipeline value (sum of budgets for leads created that month).
- **Property engagement** — every listing ranked by view count and shortlist count, so managers can see which inventory gets traction and which doesn't.
- **Buyer behavior** — repeat inquirers (same mobile number appearing more than once), average shortlist size for converted leads, and average decision time (days from creation to conversion).

### 4.10 Administration (super admin)

- **Users** — create/edit users, set role, link partner users to their company, activate/deactivate, reset passwords. Admins cannot deactivate themselves.
- **Settings** — WhatsApp message templates (managers can also manage these, including the three automated stage-trigger templates); accepted currencies list.
- **Audit log** — last 200 recorded actions with actor, action, entity, and metadata. Also captures CSV exports and partner phone-number reveals (see §8).
- **Blog** — managers create/edit/publish articles that appear on the public `/blog` site (§8).

---

## 5. End-to-end workflows

### Workflow 1 — Visa lead to property shared
1. Visitor submits the visa/website form → lead created with source `VISA_FORM`, all managers notified.
2. Manager assigns the lead → executive notified in-app + email.
3. Executive reviews requirements, runs **Find matches**, ticks the best properties.
4. Executive picks a template and sends via **WhatsApp** → client receives the shortlist; lead auto-moves to *Property Shared*; follow-up auto-set for +2 days.
5. Reminder fires when the follow-up is due; the executive continues via notes, stage moves, and re-shares until *Converted* or *Lost/Closed*.

### Workflow 2 — Partner escalation
1. Staff opens a lead and uses **Share to partner** with context notes.
2. Partner company's users are notified (in-app + email), log in, and see the lead in their portal.
3. Partner works the lead, updating the share status at each step; staff get notified of every update.
4. Partner marks **Converted** → CRM lead converts automatically; the conversion appears in partner performance reports.

### Workflow 3 — Inventory intake
1. Property staff add a listing (or bulk CSV import), then upload photos and a video tour on the edit page.
2. The property is immediately searchable and participates in matching.
3. When it's sold/rented, staff flip availability — everyone who shortlisted it for a lead is alerted.

---

## 6. Omnichannel platform & integrations

### 6.1 Property sync with the public website
Bi-directional, see §4.7. Outbound push and inbound webhook both require `WEBSITE_API_URL`/`WEBSITE_API_KEY` (outbound) and `WEBSITE_WEBHOOK_SECRET` (inbound, checked via an `X-Webhook-Secret` header) to be configured — until then, outbound pushes just log locally and the inbound endpoint returns 503. **Design decision:** connecting this to a *specific* website's actual API requires that site's real endpoint/auth details, which weren't available when this was built; the CRM side (schema, upsert-by-`externalId`, pluggable push) is complete and ready to point at a real endpoint.

### 6.2 Omnichannel lead capture
In addition to the existing public capture form (§4.2), three more inbound channels create leads the same way (manager alert, activity log entry):
- **Generic website webhook** (`POST /api/leads/webhook/website`) — for contact forms and CTA pop-ups anywhere on the marketing site, incl. sections like a co-founder profile page. Secret-header authenticated (`LEAD_WEBHOOK_SECRET`).
- **WhatsApp click-to-chat** (`POST /api/leads/webhook/whatsapp-click`) — the website's "Chat on WhatsApp" button relays the click here instead of (or alongside) opening WhatsApp, so the enquiry isn't lost if the visitor never actually messages.
- **Meta Lead Ads** (`GET`/`POST /api/leads/webhook/meta`) — a standard Meta webhook: the `GET` handles the verification handshake (`META_VERIFY_TOKEN`); the `POST` validates Meta's HMAC signature (`META_APP_SECRET`) before fetching each lead's field data from the Graph API (`META_PAGE_ACCESS_TOKEN`) and creating a lead tagged source `META_ADS`. **Design decision:** this needs a real Meta App + Page + Lead Ads form to test end-to-end; the endpoint is fully wired but unverified against live Meta traffic.
- **Bulk offline-campaign import** (`POST /api/leads/import-basic`, Sales team) — a simpler CSV template (`Name,Phone,Address` only) for offline campaign lists, separate from the full-field lead CSV import.

### 6.3 Location & media
See §4.7 (YouTube embed, geo pin). No Google Maps API key is used or required — the "map" is a plain link, and there's no drag-to-pin interactive map widget (that would need a Maps JavaScript API key); the current version is coordinate entry + a generated link, which is functional but simpler than a full pin-drop UI.

### 6.4 Data governance
- **Phone number masking** — partner users see leads' mobile/WhatsApp numbers masked (e.g. `+9198••••10`) everywhere in their portal. They can reveal a specific lead's real number one at a time via a "reveal" action, which is written to the audit log — protecting the database from bulk extraction while still letting a partner call a client when needed. Internal staff always see full numbers for leads assigned to them.
- **CSV export lock** — `GET /api/leads/export` and `GET /api/properties/export` (full-table CSV downloads) are Super-Admin-only; every export is audit-logged with the row count.
- **RBAC scope** — unchanged from §2 for leads (executives never see a colleague's leads). **Design decision (not changed):** property *inventory* visibility was intentionally left shared across all internal roles rather than restricted per assigned agent, because the matching engine and WhatsApp-sharing workflow require any executive to be able to offer any available property to their own leads; restricting it would break that core workflow. If per-agent property visibility is actually wanted, that's a scope change worth discussing before implementing, since it changes how matching works.

### 6.5 Public marketing site
- `/blog` and `/blog/:slug` — public article pages (no auth), listing/reading posts a manager published from the in-app **Blog** admin screen. Each article page has a sticky sidebar lead-capture form (posts to the same public capture endpoint, tagged with the article slug).
- **Exit-intent popup** — fires once per browser session: on desktop when the cursor exits toward the top of the viewport; on mobile when the back button/gesture is pressed (there's no mouse to track, so the popup intercepts the first back-navigation instead). Offers a "local price guide" in exchange for a phone number.

### 6.6 New environment variables
| Variable | Purpose |
|---|---|
| `CLIENT_URL` | Public site origin, used to build property links shared with partners |
| `WEBSITE_API_URL`, `WEBSITE_API_KEY` | Outbound property sync target + auth |
| `WEBSITE_WEBHOOK_SECRET` | Shared secret for the inbound website→CRM property webhook |
| `LEAD_WEBHOOK_SECRET` | Shared secret for the generic website/WhatsApp-click lead webhooks |
| `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_API_URL` | Meta Lead Ads webhook verification, signature check, and Graph API lookups |

## 7. Business rules quick reference

| Rule | Value |
|---|---|
| Public capture rate limit | 20 submissions / IP / 10 min |
| Auto follow-up after WhatsApp share | +2 days (only if none set) |
| Follow-up reminder job | every 15 min, max 1 reminder / lead / 24 h |
| Matching cut-off / result size | score ≥ 30, top 20 |
| Images per property | 12 max, 8 MB each |
| Video per property | 1, 200 MB max (mp4/mov/webm/m4v) |
| CSV import row errors | reported per row, first 20 shown |
| Password reset token validity | 1 hour |
| Password minimum length | 8 characters |
| Notification polling | 60 s |
| Pagination caps | 100 rows/page (API), 20 leads / 12 properties per page (UI) |
| Lead recycling lease | 30 days without a stage change → unassigned |
| Meta/WhatsApp-click/website webhooks | secret/signature authenticated, no rate limit (add one if exposed publicly at scale) |

## 8. Out of scope (current release)

- Online payments / invoicing, contract generation
- Two-way WhatsApp (inbound *message* handling — outbound automation and click-to-chat/lead-ads webhooks now exist, but replies aren't read back into the CRM)
- Calendar integration for site visits (site visits are tracked via the lead's follow-up date, not a dedicated calendar)
- Interactive drag-to-pin map widget (current geo feature is coordinate entry + a generated Google Maps link, no Maps JavaScript API key used)
- Mobile apps (the web UI is responsive)
- Multi-language UI
- Live connection to a specific external website/Meta Ads account (the integration endpoints are built and ready, but need that system's real credentials to go live)
