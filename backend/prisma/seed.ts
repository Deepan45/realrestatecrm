import { PrismaClient, LeadSource, LeadStatus, PipelineStage, Priority, PropertyType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Admin@1234", 10);

  // ── Partner companies ─────────────────────────────────────────────
  const partnerAData = {
    id: "seed-partner-a",
    name: "Chennai Prime Realty",
    contactPerson: "Senthil Kumar",
    phone: "+919841112222",
    whatsapp: "+919841112222",
    email: "senthil@chennaiprime.example",
    city: "Chennai",
    country: "India",
    notes: "Strong at apartment projects on OMR and in Velachery.",
  };
  const partnerA = await prisma.partnerCompany.upsert({
    where: { id: partnerAData.id },
    update: partnerAData,
    create: partnerAData,
  });
  const partnerBData = {
    id: "seed-partner-b",
    name: "Kovai Homes & Plots",
    contactPerson: "Lakshmi Narayanan",
    phone: "+919842223333",
    whatsapp: "+919842223333",
    email: "lakshmi@kovaihomes.example",
    city: "Coimbatore",
    country: "India",
    notes: "Handles DTCP-approved plots and villas around Coimbatore.",
  };
  await prisma.partnerCompany.upsert({
    where: { id: partnerBData.id },
    update: partnerBData,
    create: partnerBData,
  });

  // ── Users ─────────────────────────────────────────────────────────
  const mkUser = (id: string, name: string, email: string, role: string, partnerCompanyId?: string) =>
    prisma.user.upsert({
      where: { id },
      update: { name, email, role: role as never, partnerCompanyId },
      create: { id, name, email, passwordHash: password, role: role as never, partnerCompanyId },
    });

  const [, manager, staff1, staff2, propStaff] = await Promise.all([
    mkUser("seed-admin", "Aishwarya Raman", "admin@realrest.example", "SUPER_ADMIN"),
    mkUser("seed-manager", "Vikram Subramanian", "manager@realrest.example", "SALES_MANAGER"),
    mkUser("seed-staff1", "Kavitha Murugan", "kavitha@realrest.example", "SALES_EXECUTIVE"),
    mkUser("seed-staff2", "Arun Prakash", "arun@realrest.example", "SALES_EXECUTIVE"),
    mkUser("seed-propstaff", "Priya Venkatesan", "priya@realrest.example", "PROPERTY_STAFF"),
    mkUser("seed-partner-user", "Senthil Kumar", "senthil@chennaiprime.example", "PARTNER_USER", partnerA.id),
  ]);

  // ── WhatsApp templates ────────────────────────────────────────────
  const templates = [
    {
      key: "welcome",
      name: "Welcome message",
      body: "Hi {{name}}! 👋 Thank you for your interest. I'm {{agent}} from RealRest. I'll help you find the right property for your requirements. When is a good time to talk?",
    },
    {
      key: "property_shortlist",
      name: "Property shortlist",
      body: "Hi {{name}}, based on your requirements here are some properties I think you'll love:\n\n{{properties}}\n\nLet me know which ones you'd like to view! — {{agent}}",
    },
    {
      key: "follow_up",
      name: "Follow-up message",
      body: "Hi {{name}}, just following up on the properties I shared earlier. Did any of them catch your eye? Happy to arrange a viewing. — {{agent}}",
    },
    {
      key: "site_visit_reminder",
      name: "Site visit reminder",
      body: "Hi {{name}}, a gentle reminder about your upcoming site visit. Please let me know if you need to reschedule. — {{agent}}",
    },
    {
      key: "partner_transfer",
      name: "Partner transfer notification",
      body: "Hi {{name}}, to serve you better we've connected you with our specialist partner team. They will contact you shortly with tailored options. — {{agent}}",
    },
    // Automated stage-triggered messages (sent by the pipeline automation service, not chosen manually)
    {
      key: "site_visit_before",
      name: "Site visit confirmation (auto)",
      body: "Hi {{name}}! 👋 Confirming your site visit scheduled for {{time}}. {{agent}} will meet you there — see you soon!",
    },
    {
      key: "site_visit_feedback",
      name: "Site visit feedback request (auto)",
      body: "Hi {{name}}, thanks for visiting the property today! We'd love your feedback — what did you think, and are you considering it further? — {{agent}}",
    },
    {
      key: "registration_testimonial",
      name: "Registration testimonial & referral (auto)",
      body: "Congratulations {{name}} on your new home! 🎉 We'd be grateful for a short testimonial, and if you know anyone else house-hunting, we'd love an introduction. — {{agent}}",
    },
  ];
  for (const t of templates) {
    await prisma.whatsAppTemplate.upsert({ where: { key: t.key }, update: { body: t.body }, create: t });
  }

  // ── Properties ────────────────────────────────────────────────────
  const propertyData = [
    {
      id: "seed-prop-1",
      title: "3BHK Apartment, Anna Nagar — Park Facing",
      type: PropertyType.APARTMENT, category: "SALE" as const,
      location: "Anna Nagar, Chennai", address: "2nd Avenue, Near Tower Park",
      areaSqft: 1450, bedrooms: 3, bathrooms: 3, furnishing: "SEMI_FURNISHED" as const,
      amenities: ["Covered Parking", "Lift", "Power Backup", "Gym"],
      price: 17500000, currency: "INR",
      description: "East-facing 3BHK on the 4th floor, park view, CMDA approved, ready to move.",
      ownerName: "Anna Nagar Estates", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
    {
      id: "seed-prop-2",
      title: "2BHK Apartment, Velachery — Near IT Corridor",
      type: PropertyType.APARTMENT, category: "SALE" as const,
      location: "Velachery, Chennai", address: "Vijayanagar, 100 Feet Road",
      areaSqft: 980, bedrooms: 2, bathrooms: 2, furnishing: "UNFURNISHED" as const,
      amenities: ["Covered Parking", "Lift", "Children's Play Area"],
      price: 8500000, currency: "INR",
      description: "Ideal first purchase near Phoenix Mall and the IT corridor. Strong rental demand.",
      ownerName: "Velachery Builders", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
    {
      id: "seed-prop-3",
      title: "4BHK Independent Villa, ECR — Sea Breeze",
      type: PropertyType.VILLA, category: "SALE" as const,
      location: "ECR, Chennai", address: "Uthandi, East Coast Road",
      areaSqft: 3200, bedrooms: 4, bathrooms: 5, furnishing: "UNFURNISHED" as const,
      amenities: ["Private Garden", "Servant Room", "Car Park", "Bore Well"],
      price: 42500000, currency: "INR",
      description: "Independent villa on a corner plot near ECR beach, vacant on registration.",
      ownerName: "Private Owner", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
    {
      id: "seed-prop-4",
      title: "Studio Apartment, OMR Sholinganallur — Furnished",
      type: PropertyType.STUDIO, category: "RENT" as const,
      location: "Sholinganallur, Chennai", address: "OMR Main Road, Near ELCOT",
      areaSqft: 520, bedrooms: 0, bathrooms: 1, furnishing: "FURNISHED" as const,
      amenities: ["Gym", "Lift", "Power Backup", "Covered Parking"],
      price: 22000, currency: "INR",
      description: "Fully furnished studio near IT parks, monthly rent, ideal for working professionals.",
      ownerName: "OMR Living", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
    {
      id: "seed-prop-5",
      title: "3BHK Villa, Coimbatore Saravanampatti — Gated Community",
      type: PropertyType.TOWNHOUSE, category: "SALE" as const,
      location: "Saravanampatti, Coimbatore", address: "Kalapatti Road",
      areaSqft: 2100, bedrooms: 3, bathrooms: 3, furnishing: "UNFURNISHED" as const,
      amenities: ["Community Pool", "Park", "Club House", "Car Park"],
      price: 12500000, currency: "INR",
      description: "Gated community villa near IT parks and Kovai hills. DTCP approved.",
      ownerName: "Private Owner", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
    {
      id: "seed-prop-6",
      title: "Commercial Office, T. Nagar — Fitted",
      type: PropertyType.OFFICE, category: "COMMERCIAL" as const,
      location: "T. Nagar, Chennai", address: "Usman Road, Near Pondy Bazaar",
      areaSqft: 1500, bedrooms: null, bathrooms: 2, furnishing: "FURNISHED" as const,
      amenities: ["Car Park", "Meeting Rooms", "Pantry", "Lift"],
      price: 180000, currency: "INR",
      description: "Fully fitted office in the heart of T. Nagar, monthly rent, immediate occupancy.",
      ownerName: "T Nagar Commercial", contactName: "Priya Venkatesan", contactPhone: "+919843334444",
    },
  ];
  for (const p of propertyData) {
    await prisma.property.upsert({
      where: { id: p.id },
      update: { ...p, assignedToId: propStaff.id },
      create: { ...p, assignedToId: propStaff.id },
    });
  }

  // ── Leads ─────────────────────────────────────────────────────────
  const leadData = [
    {
      id: "seed-lead-1",
      fullName: "Karthik Raja", mobile: "+919876543210", whatsappNumber: "+919876543210",
      email: "karthik.raja@example.com", country: "India", city: "Chennai", preferredArea: "Anna Nagar",
      budgetMin: 15000000, budgetMax: 20000000, currency: "INR",
      propertyType: PropertyType.APARTMENT, bedrooms: 3,
      visaRequired: false,
      source: LeadSource.WEBSITE_FORM, status: LeadStatus.NEW, stage: PipelineStage.NEW_LEAD,
      priority: Priority.HIGH, assignedToId: staff1.id, createdById: manager.id,
      requirementNotes: "NRI returning from Singapore. Wants a ready-to-move 3BHK in Anna Nagar, east facing preferred.",
    },
    {
      id: "seed-lead-2",
      fullName: "Divya Shankar", mobile: "+919841098765", whatsappNumber: "+919841098765",
      email: "divya.s@example.com", country: "India", city: "Chennai", preferredArea: "Velachery",
      budgetMin: 7000000, budgetMax: 9000000, currency: "INR",
      propertyType: PropertyType.APARTMENT, bedrooms: 2,
      visaRequired: false,
      source: LeadSource.WEBSITE_FORM, status: LeadStatus.CONTACTED, stage: PipelineStage.INITIAL_CONTACT,
      priority: Priority.MEDIUM, assignedToId: staff1.id, createdById: manager.id,
      followUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    {
      id: "seed-lead-3",
      fullName: "Murali Krishnan", mobile: "+919444216789", whatsappNumber: "+919444216789",
      email: "murali.k@example.com", country: "India", city: "Chennai", preferredArea: "ECR",
      budgetMin: 35000000, budgetMax: 45000000, currency: "INR",
      propertyType: PropertyType.VILLA, bedrooms: 4,
      visaRequired: false,
      source: LeadSource.REFERRAL, status: LeadStatus.INTERESTED, stage: PipelineStage.SITE_VISIT_SCHEDULED,
      priority: Priority.URGENT, assignedToId: staff2.id, createdById: manager.id,
      followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      requirementNotes: "Business owner, wants an independent villa on ECR for own stay. Site visit planned this weekend.",
    },
    {
      id: "seed-lead-4",
      fullName: "Anitha Balaji", mobile: "+919790112233", whatsappNumber: "+919790112233",
      email: "anitha.b@example.com", country: "India", city: "Chennai", preferredArea: "Sholinganallur",
      budgetMax: 25000, currency: "INR",
      propertyType: PropertyType.STUDIO, bedrooms: 0,
      visaRequired: false,
      source: LeadSource.WHATSAPP, status: LeadStatus.FOLLOW_UP, stage: PipelineStage.FOLLOW_UP_PENDING,
      priority: Priority.LOW, assignedToId: staff2.id, createdById: staff2.id,
      followUpAt: new Date(),
      requirementNotes: "IT professional at ELCOT, looking for a furnished studio on rent near office.",
    },
    {
      id: "seed-lead-5",
      fullName: "Rajesh Annamalai", mobile: "+919843954321", whatsappNumber: "+919843954321",
      email: "rajesh.a@example.com", country: "India", city: "Coimbatore", preferredArea: "Saravanampatti",
      budgetMin: 10000000, budgetMax: 14000000, currency: "INR",
      propertyType: PropertyType.TOWNHOUSE, bedrooms: 3,
      visaRequired: false,
      source: LeadSource.MANUAL, status: LeadStatus.SHARED_TO_PARTNER, stage: PipelineStage.SHARED_TO_PARTNER,
      priority: Priority.MEDIUM, assignedToId: staff1.id, createdById: manager.id,
      partnerCompanyId: partnerA.id,
      requirementNotes: "Wants a gated-community villa near Saravanampatti IT parks for family.",
    },
    {
      id: "seed-lead-6",
      fullName: "Meena Sundaram", mobile: "+919894123456", whatsappNumber: "+919894123456",
      email: "meena.s@example.com", country: "India", city: "Chennai", preferredArea: "Anna Nagar",
      budgetMin: 15000000, budgetMax: 20000000, currency: "INR",
      propertyType: PropertyType.APARTMENT, bedrooms: 3,
      visaRequired: false,
      source: LeadSource.WEBSITE_FORM, status: LeadStatus.NEGOTIATION, stage: PipelineStage.BANK_LOAN,
      priority: Priority.HIGH, assignedToId: staff1.id, createdById: manager.id,
      requirementNotes: "Price agreed on seed-prop-1; home loan application submitted, awaiting bank sanction letter.",
    },
    {
      id: "seed-lead-7",
      fullName: "Ganesh Iyer", mobile: "+919843567890", whatsappNumber: "+919843567890",
      email: "ganesh.iyer@example.com", country: "India", city: "Chennai", preferredArea: "Velachery",
      budgetMin: 7500000, budgetMax: 9000000, currency: "INR",
      propertyType: PropertyType.APARTMENT, bedrooms: 2,
      visaRequired: false,
      source: LeadSource.REFERRAL, status: LeadStatus.CONVERTED, stage: PipelineStage.REGISTRATION,
      priority: Priority.MEDIUM, assignedToId: staff2.id, createdById: manager.id,
      convertedAt: new Date(),
      requirementNotes: "Sale deed registration scheduled at the sub-registrar office.",
    },
  ];
  for (const l of leadData) {
    await prisma.lead.upsert({ where: { id: l.id }, update: l, create: l });
  }

  // Partner share for lead 5
  await prisma.partnerLeadShare.upsert({
    where: { id: "seed-share-1" },
    update: { notesShared: "Coimbatore client, prefers Saravanampatti but open to Vadavalli villas." },
    create: {
      id: "seed-share-1",
      leadId: "seed-lead-5",
      partnerId: partnerA.id,
      sharedById: staff1.id,
      notesShared: "Coimbatore client, prefers Saravanampatti but open to Vadavalli villas.",
      status: "IN_PROGRESS",
    },
  });

  // A few activities so timelines aren't empty
  await prisma.leadActivity.createMany({
    data: [
      { leadId: "seed-lead-1", actorId: manager.id, type: "LEAD_CREATED", message: "Lead captured from WEBSITE_FORM" },
      { leadId: "seed-lead-1", actorId: manager.id, type: "ASSIGNED", message: "Assigned to Kavitha Murugan" },
      { leadId: "seed-lead-5", actorId: staff1.id, type: "SHARED_TO_PARTNER", message: "Shared with Chennai Prime Realty" },
    ],
    skipDuplicates: true,
  });

  await prisma.setting.upsert({
    where: { key: "currencies" },
    update: { value: ["INR", "USD", "AED", "EUR"] },
    create: { key: "currencies", value: ["INR", "USD", "AED", "EUR"] },
  });

  // ── Blog ──────────────────────────────────────────────────────────
  await prisma.blogPost.upsert({
    where: { slug: "chennai-property-market-outlook-2026" },
    update: {},
    create: {
      slug: "chennai-property-market-outlook-2026",
      title: "Chennai Property Market Outlook 2026",
      excerpt: "OMR and Velachery keep leading demand, while ECR sees a surge in villa enquiries.",
      body: "Chennai's residential market continues its steady climb in 2026, led by the IT corridor (OMR, Velachery, Sholinganallur) where rental demand from working professionals remains strong. Meanwhile, ECR has seen a notable uptick in villa enquiries from buyers seeking weekend homes and NRI investors returning to the market.\n\nAnna Nagar and T. Nagar remain the go-to choices for end-users wanting established infrastructure, while Coimbatore's Saravanampatti corridor is emerging as a value pick for gated-community villas near the growing IT park cluster.\n\nOur advice for buyers: lock in ready-to-move inventory in the IT corridor now, and negotiate on plot-based ECR villas where inventory has grown faster than demand.",
      isPublished: true,
      publishedAt: new Date(),
      authorId: manager.id,
    },
  });

  console.log("Seed complete.");
  console.log("Logins (password for all: Admin@1234):");
  console.log("  Super Admin   → admin@realrest.example");
  console.log("  Sales Manager → manager@realrest.example");
  console.log("  Sales Exec    → kavitha@realrest.example / arun@realrest.example");
  console.log("  Property      → priya@realrest.example");
  console.log("  Partner user  → senthil@chennaiprime.example");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
