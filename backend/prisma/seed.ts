import { PrismaClient, LeadSource, LeadStatus, PipelineStage, Priority, PropertyType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Admin@1234", 10);

  // ── Partner companies ─────────────────────────────────────────────
  const partnerA = await prisma.partnerCompany.upsert({
    where: { id: "seed-partner-a" },
    update: {},
    create: {
      id: "seed-partner-a",
      name: "Gulf Gate Properties",
      contactPerson: "Omar Haddad",
      phone: "+971501112222",
      whatsapp: "+971501112222",
      email: "omar@gulfgate.example",
      city: "Dubai",
      country: "UAE",
      notes: "Strong at off-plan projects in Dubai Marina & JVC.",
    },
  });
  const partnerB = await prisma.partnerCompany.upsert({
    where: { id: "seed-partner-b" },
    update: {},
    create: {
      id: "seed-partner-b",
      name: "Emirates Visa & Homes",
      contactPerson: "Sara Malik",
      phone: "+971502223333",
      whatsapp: "+971502223333",
      email: "sara@evh.example",
      city: "Abu Dhabi",
      country: "UAE",
      notes: "Handles golden-visa-linked property purchases.",
    },
  });

  // ── Users ─────────────────────────────────────────────────────────
  const mkUser = (id: string, name: string, email: string, role: string, partnerCompanyId?: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { id, name, email, passwordHash: password, role: role as never, partnerCompanyId },
    });

  const [admin, manager, staff1, staff2, propStaff, partnerUser] = await Promise.all([
    mkUser("seed-admin", "Aisha Rahman", "admin@realrest.example", "SUPER_ADMIN"),
    mkUser("seed-manager", "Vikram Nair", "manager@realrest.example", "SALES_MANAGER"),
    mkUser("seed-staff1", "Fatima Noor", "fatima@realrest.example", "SALES_EXECUTIVE"),
    mkUser("seed-staff2", "John Mathew", "john@realrest.example", "SALES_EXECUTIVE"),
    mkUser("seed-propstaff", "Priya Menon", "priya@realrest.example", "PROPERTY_STAFF"),
    mkUser("seed-partner-user", "Omar Haddad", "omar@gulfgate.example", "PARTNER_USER", partnerA.id),
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
  ];
  for (const t of templates) {
    await prisma.whatsAppTemplate.upsert({ where: { key: t.key }, update: { body: t.body }, create: t });
  }

  // ── Properties ────────────────────────────────────────────────────
  const propertyData = [
    {
      id: "seed-prop-1",
      title: "2BR Apartment, Dubai Marina — Marina View",
      type: PropertyType.APARTMENT, category: "SALE" as const,
      location: "Dubai Marina", address: "Marina Promenade, Tower B",
      areaSqft: 1250, bedrooms: 2, bathrooms: 2, furnishing: "FURNISHED" as const,
      amenities: ["Pool", "Gym", "Parking", "Balcony", "Sea View"],
      price: 1850000, currency: "AED",
      description: "Bright 2-bedroom with full marina view, upgraded kitchen, one parking bay.",
      ownerName: "Marina Holdings LLC", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
    {
      id: "seed-prop-2",
      title: "1BR Apartment, JVC — Ready to Move",
      type: PropertyType.APARTMENT, category: "SALE" as const,
      location: "Jumeirah Village Circle", address: "District 12",
      areaSqft: 780, bedrooms: 1, bathrooms: 1, furnishing: "SEMI_FURNISHED" as const,
      amenities: ["Pool", "Gym", "Parking"],
      price: 720000, currency: "AED",
      description: "Ideal first purchase or golden-visa top-up. High rental yield area.",
      ownerName: "JVC Estates", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
    {
      id: "seed-prop-3",
      title: "4BR Villa, Arabian Ranches — Corner Plot",
      type: PropertyType.VILLA, category: "SALE" as const,
      location: "Arabian Ranches", address: "Alvorada 3",
      areaSqft: 3600, bedrooms: 4, bathrooms: 5, furnishing: "UNFURNISHED" as const,
      amenities: ["Private Garden", "Maid Room", "Parking", "Community Pool"],
      price: 5400000, currency: "AED",
      description: "Upgraded corner-plot villa near the golf course. Vacant on transfer.",
      ownerName: "Private Owner", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
    {
      id: "seed-prop-4",
      title: "Studio, Business Bay — High Floor",
      type: PropertyType.STUDIO, category: "RENT" as const,
      location: "Business Bay", address: "Bay Square",
      areaSqft: 480, bedrooms: 0, bathrooms: 1, furnishing: "FURNISHED" as const,
      amenities: ["Gym", "Metro Nearby", "Parking"],
      price: 68000, currency: "AED",
      description: "Fully furnished studio, canal view, 1-4 cheques.",
      ownerName: "Bay Living", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
    {
      id: "seed-prop-5",
      title: "3BR Townhouse, Town Square — Single Row",
      type: PropertyType.TOWNHOUSE, category: "SALE" as const,
      location: "Town Square", address: "Naseem Townhouses",
      areaSqft: 2100, bedrooms: 3, bathrooms: 3, furnishing: "UNFURNISHED" as const,
      amenities: ["Community Pool", "Park", "Parking"],
      price: 2100000, currency: "AED",
      description: "Single-row 3-bed close to the central park. Tenanted at 110k until Dec.",
      ownerName: "Private Owner", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
    {
      id: "seed-prop-6",
      title: "Office Space, Downtown — Fitted",
      type: PropertyType.OFFICE, category: "COMMERCIAL" as const,
      location: "Downtown Dubai", address: "Boulevard Plaza T1",
      areaSqft: 1500, bedrooms: null, bathrooms: 2, furnishing: "FURNISHED" as const,
      amenities: ["Parking", "Meeting Rooms", "Pantry"],
      price: 280000, currency: "AED",
      description: "Fully fitted office with Burj view, ready for immediate occupancy.",
      ownerName: "Downtown Commercial", contactName: "Priya Menon", contactPhone: "+971503334444",
    },
  ];
  for (const p of propertyData) {
    await prisma.property.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, assignedToId: propStaff.id },
    });
  }

  // ── Leads ─────────────────────────────────────────────────────────
  const leadData = [
    {
      id: "seed-lead-1",
      fullName: "Ali Khan", mobile: "+971501234567", whatsappNumber: "+971501234567",
      email: "ali.khan@example.com", country: "Pakistan", city: "Dubai", preferredArea: "Dubai Marina",
      budgetMin: 1500000, budgetMax: 2000000, currency: "AED",
      propertyType: PropertyType.APARTMENT, bedrooms: 2,
      visaType: "Golden Visa", visaRequired: true,
      source: LeadSource.VISA_FORM, status: LeadStatus.NEW, stage: PipelineStage.NEW_LEAD,
      priority: Priority.HIGH, assignedToId: staff1.id, createdById: manager.id,
      requirementNotes: "Wants golden-visa eligible property. Prefers marina view, ready unit.",
    },
    {
      id: "seed-lead-2",
      fullName: "Meera Pillai", mobile: "+971529876543", whatsappNumber: "+971529876543",
      email: "meera.p@example.com", country: "India", city: "Dubai", preferredArea: "JVC",
      budgetMin: 600000, budgetMax: 800000, currency: "AED",
      propertyType: PropertyType.APARTMENT, bedrooms: 1,
      visaRequired: false,
      source: LeadSource.WEBSITE_FORM, status: LeadStatus.CONTACTED, stage: PipelineStage.INITIAL_CONTACT,
      priority: Priority.MEDIUM, assignedToId: staff1.id, createdById: manager.id,
      followUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    {
      id: "seed-lead-3",
      fullName: "David Chen", mobile: "+971543216789", whatsappNumber: "+971543216789",
      email: "d.chen@example.com", country: "China", city: "Dubai", preferredArea: "Arabian Ranches",
      budgetMin: 4500000, budgetMax: 6000000, currency: "AED",
      propertyType: PropertyType.VILLA, bedrooms: 4,
      visaType: "Golden Visa", visaRequired: true,
      source: LeadSource.REFERRAL, status: LeadStatus.INTERESTED, stage: PipelineStage.INTERESTED_SITE_VISIT,
      priority: Priority.URGENT, assignedToId: staff2.id, createdById: manager.id,
      followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: "seed-lead-4",
      fullName: "Sofia Ivanova", mobile: "+971561112233", whatsappNumber: "+971561112233",
      email: "sofia.i@example.com", country: "Russia", city: "Dubai", preferredArea: "Business Bay",
      budgetMax: 75000, currency: "AED",
      propertyType: PropertyType.STUDIO, bedrooms: 0,
      visaRequired: false,
      source: LeadSource.WHATSAPP, status: LeadStatus.FOLLOW_UP, stage: PipelineStage.FOLLOW_UP_PENDING,
      priority: Priority.LOW, assignedToId: staff2.id, createdById: staff2.id,
      followUpAt: new Date(),
    },
    {
      id: "seed-lead-5",
      fullName: "Ahmed Al Farsi", mobile: "+968921234567", whatsappNumber: "+968921234567",
      email: "ahmed.f@example.com", country: "Oman", city: "Abu Dhabi",
      budgetMin: 2000000, budgetMax: 3000000, currency: "AED",
      propertyType: PropertyType.TOWNHOUSE, bedrooms: 3,
      visaType: "Investor Visa", visaRequired: true,
      source: LeadSource.VISA_FORM, status: LeadStatus.SHARED_TO_PARTNER, stage: PipelineStage.SHARED_TO_PARTNER,
      priority: Priority.MEDIUM, assignedToId: staff1.id, createdById: manager.id,
      partnerCompanyId: partnerA.id,
    },
  ];
  for (const l of leadData) {
    await prisma.lead.upsert({ where: { id: l.id }, update: {}, create: l });
  }

  // Partner share for lead 5
  await prisma.partnerLeadShare.upsert({
    where: { id: "seed-share-1" },
    update: {},
    create: {
      id: "seed-share-1",
      leadId: "seed-lead-5",
      partnerId: partnerA.id,
      sharedById: staff1.id,
      notesShared: "Investor visa client, prefers Abu Dhabi but open to Dubai townhouses.",
      status: "IN_PROGRESS",
    },
  });

  // A few activities so timelines aren't empty
  await prisma.leadActivity.createMany({
    data: [
      { leadId: "seed-lead-1", actorId: manager.id, type: "LEAD_CREATED", message: "Lead captured from VISA_FORM" },
      { leadId: "seed-lead-1", actorId: manager.id, type: "ASSIGNED", message: "Assigned to Fatima Noor" },
      { leadId: "seed-lead-5", actorId: staff1.id, type: "SHARED_TO_PARTNER", message: "Shared with Gulf Gate Properties" },
    ],
    skipDuplicates: true,
  });

  await prisma.setting.upsert({
    where: { key: "currencies" },
    update: {},
    create: { key: "currencies", value: ["AED", "USD", "EUR", "INR", "SAR"] },
  });

  console.log("Seed complete.");
  console.log("Logins (password for all: Admin@1234):");
  console.log("  Super Admin   → admin@realrest.example");
  console.log("  Sales Manager → manager@realrest.example");
  console.log("  Sales Exec    → fatima@realrest.example / john@realrest.example");
  console.log("  Property      → priya@realrest.example");
  console.log("  Partner user  → omar@gulfgate.example");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
