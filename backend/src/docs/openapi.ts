// Hand-maintained OpenAPI spec covering the main API surface.
// Served at /api/docs via swagger-ui-express.

const bearer = [{ bearerAuth: [] as string[] }];

function crud(tag: string, singular: string) {
  return {
    get: { tags: [tag], summary: `List ${tag.toLowerCase()}`, security: bearer, responses: { "200": { description: "OK" } } },
    post: { tags: [tag], summary: `Create ${singular}`, security: bearer, responses: { "201": { description: "Created" } } },
  };
}

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "RealRest CRM API",
    version: "1.0.0",
    description:
      "REST API for the RealRest real estate + visa lead CRM. Authenticate via POST /auth/login, then send the token as `Authorization: Bearer <token>`.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string" }, password: { type: "string" } },
              },
              example: { email: "admin@realrest.example", password: "Admin@1234" },
            },
          },
        },
        responses: { "200": { description: "JWT token + user profile" }, "401": { description: "Invalid credentials" } },
      },
    },
    "/auth/forgot-password": { post: { tags: ["Auth"], summary: "Request password reset email", responses: { "200": { description: "OK" } } } },
    "/auth/reset-password": { post: { tags: ["Auth"], summary: "Reset password using emailed token", responses: { "200": { description: "OK" } } } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Current user profile", security: bearer, responses: { "200": { description: "OK" } } } },

    "/leads/capture": {
      post: {
        tags: ["Leads"],
        summary: "Public lead capture (visa/website forms) — no auth",
        requestBody: {
          content: {
            "application/json": {
              example: {
                fullName: "Ali Khan",
                mobile: "+971501234567",
                email: "ali@example.com",
                country: "Pakistan",
                city: "Dubai",
                budgetMax: 900000,
                propertyType: "APARTMENT",
                visaType: "Golden Visa",
                visaRequired: true,
                source: "VISA_FORM",
              },
            },
          },
        },
        responses: { "201": { description: "Lead created" } },
      },
    },
    "/leads": {
      get: {
        tags: ["Leads"],
        summary: "List leads (role-scoped) with filters",
        security: bearer,
        parameters: ["q", "status", "stage", "source", "assignedToId", "partnerId", "propertyType", "priority", "budgetMin", "budgetMax", "from", "to", "followUpDue", "page", "pageSize", "sort"].map((name) => ({
          name, in: "query", required: false, schema: { type: "string" },
        })),
        responses: { "200": { description: "Paginated leads" } },
      },
      post: { tags: ["Leads"], summary: "Create lead", security: bearer, responses: { "201": { description: "Created" } } },
    },
    "/leads/board": { get: { tags: ["Leads"], summary: "Kanban board grouped by pipeline stage", security: bearer, responses: { "200": { description: "OK" } } } },
    "/leads/import": { post: { tags: ["Leads"], summary: "Bulk import leads from CSV (multipart field: file)", security: bearer, responses: { "200": { description: "Import summary" } } } },
    "/leads/import-basic": { post: { tags: ["Leads"], summary: "Bulk import offline-campaign CSV (columns: Name,Phone,Address)", security: bearer, responses: { "200": { description: "Import summary" } } } },
    "/leads/export": { get: { tags: ["Leads"], summary: "Download all leads as CSV (Super Admin only, audited)", security: bearer, responses: { "200": { description: "CSV file" } } } },
    "/leads/webhook/website": {
      post: {
        tags: ["Webhooks"],
        summary: "Inbound website form / CTA pop-up lead webhook (header: X-Webhook-Secret)",
        requestBody: { content: { "application/json": { example: { name: "Ravi Kumar", phone: "+919876500000", email: "ravi@example.com", message: "Interested in OMR apartments", formName: "cofounder-profile-cta" } } } },
        responses: { "201": { description: "Lead created" }, "401": { description: "Bad secret" }, "503": { description: "Webhook not configured" } },
      },
    },
    "/leads/webhook/whatsapp-click": {
      post: {
        tags: ["Webhooks"],
        summary: "WhatsApp click-to-chat relay webhook (header: X-Webhook-Secret)",
        requestBody: { content: { "application/json": { example: { phone: "+919876500000", sourcePage: "/properties/omr-3bhk" } } } },
        responses: { "201": { description: "Lead created" } },
      },
    },
    "/leads/webhook/meta": {
      get: { tags: ["Webhooks"], summary: "Meta Lead Ads webhook verification handshake", responses: { "200": { description: "Echoes hub.challenge" } } },
      post: { tags: ["Webhooks"], summary: "Meta Lead Ads event receiver (HMAC-verified, fetches lead field data from Graph API)", responses: { "200": { description: "Processed" } } },
    },
    "/leads/{id}": {
      get: { tags: ["Leads"], summary: "Lead detail with notes, timeline, WhatsApp + partner history", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      put: { tags: ["Leads"], summary: "Update lead", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    },
    "/leads/{id}/assign": { post: { tags: ["Leads"], summary: "Assign lead to staff (manager+)", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/leads/{id}/change-stage": { post: { tags: ["Leads"], summary: "Move lead across pipeline stages", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/leads/{id}/add-note": { post: { tags: ["Leads"], summary: "Add internal note", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Created" } } } },
    "/leads/{id}/follow-up": { post: { tags: ["Leads"], summary: "Set follow-up reminder", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/leads/{id}/match-properties": { post: { tags: ["Leads"], summary: "Run property matching engine for this lead", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Scored matches" } } } },
    "/leads/{id}/shortlist": { post: { tags: ["Leads"], summary: "Save shortlisted properties for the lead", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/leads/{id}/send-whatsapp": {
      post: {
        tags: ["Leads"],
        summary: "Send selected properties / template message to the lead via WhatsApp",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { example: { propertyIds: ["prop_id_1"], templateKey: "property_shortlist" } } } },
        responses: { "201": { description: "Message logged" }, "502": { description: "Provider failure" } },
      },
    },
    "/leads/{id}/share-partner": { post: { tags: ["Leads"], summary: "Share lead with a partner company (Level 2 distribution)", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Share record created" } } } },

    "/properties": crud("Properties", "property"),
    "/properties/{id}": {
      get: { tags: ["Properties"], summary: "Property detail", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      put: { tags: ["Properties"], summary: "Update property", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      delete: { tags: ["Properties"], summary: "Delete property", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    },
    "/properties/{id}/images": { post: { tags: ["Properties"], summary: "Upload images (multipart field: images)", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Created" } } } },
    "/properties/{id}/video": { post: { tags: ["Properties"], summary: "Upload/replace video tour (multipart field: video)", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Created" } } } },
    "/properties/import": { post: { tags: ["Properties"], summary: "Bulk import from CSV", security: bearer, responses: { "200": { description: "Import summary" } } } },
    "/properties/export": { get: { tags: ["Properties"], summary: "Download all properties as CSV (Super Admin only, audited)", security: bearer, responses: { "200": { description: "CSV file" } } } },
    "/integrations/website/properties": {
      post: {
        tags: ["Webhooks"],
        summary: "Inbound property sync from the public website — upserts by externalId (header: X-Webhook-Secret)",
        requestBody: { content: { "application/json": { example: { externalId: "site-123", title: "3BHK Apartment, Anna Nagar", type: "APARTMENT", category: "SALE", location: "Anna Nagar, Chennai", price: 17500000, images: ["https://example.com/img1.jpg"] } } } },
        responses: { "201": { description: "Upserted" }, "503": { description: "Webhook not configured" } },
      },
    },

    "/partners": crud("Partners", "partner company"),
    "/partners/{id}": {
      get: { tags: ["Partners"], summary: "Partner detail", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      put: { tags: ["Partners"], summary: "Update partner", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    },
    "/partners/{id}/leads": { get: { tags: ["Partners"], summary: "Leads shared with a partner", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/partners/shares/{shareId}": { put: { tags: ["Partners"], summary: "Update partner-side status of a shared lead", security: bearer, parameters: [{ name: "shareId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/partners/shares/{shareId}/reveal-phone": { post: { tags: ["Partners"], summary: "Reveal the masked client number for one share (audited)", security: bearer, parameters: [{ name: "shareId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Real numbers" } } } },

    "/whatsapp/templates": crud("WhatsApp", "template"),
    "/whatsapp/logs": { get: { tags: ["WhatsApp"], summary: "WhatsApp message log", security: bearer, responses: { "200": { description: "OK" } } } },

    "/reports/dashboard": { get: { tags: ["Reports"], summary: "Dashboard widgets", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/leads": { get: { tags: ["Reports"], summary: "Lead source / status / visa / lost report", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/staff": { get: { tags: ["Reports"], summary: "Staff performance report", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/partners": { get: { tags: ["Reports"], summary: "Partner company report", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/monthly": { get: { tags: ["Reports"], summary: "Monthly lead trend + pipeline value (12 months)", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/property-engagement": { get: { tags: ["Reports"], summary: "Listings ranked by views and shortlist count", security: bearer, responses: { "200": { description: "OK" } } } },
    "/reports/buyer-behavior": { get: { tags: ["Reports"], summary: "Repeat inquirers, avg decision time, avg shortlist size", security: bearer, responses: { "200": { description: "OK" } } } },

    "/blog": {
      get: { tags: ["Blog"], summary: "Published posts (public, paginated)", responses: { "200": { description: "OK" } } },
      post: { tags: ["Blog"], summary: "Create post (manager+)", security: bearer, responses: { "201": { description: "Created" } } },
    },
    "/blog/{slug}": { get: { tags: ["Blog"], summary: "Read a published post by slug (public)", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/blog/admin/all": { get: { tags: ["Blog"], summary: "All posts incl. drafts (manager+)", security: bearer, responses: { "200": { description: "OK" } } } },

    "/users": crud("Users", "user"),
    "/notifications": { get: { tags: ["Notifications"], summary: "My notifications", security: bearer, responses: { "200": { description: "OK" } } } },
    "/settings": { get: { tags: ["Settings"], summary: "All settings", security: bearer, responses: { "200": { description: "OK" } } } },
  },
};
