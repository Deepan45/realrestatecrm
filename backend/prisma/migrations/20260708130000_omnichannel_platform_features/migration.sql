-- Omnichannel platform features: Meta Ads lead source, split site-visit stages
-- (so before/after WhatsApp automation has two distinct trigger points), property
-- geo/YouTube/external-sync fields, property view tracking, and a public blog.

-- LeadSource: Meta/Facebook/Instagram Lead Ads ingestion
ALTER TYPE "LeadSource" ADD VALUE 'META_ADS';

-- PipelineStage: split the single "Interested / Site Visit" stage into a
-- scheduled/completed pair so automation can fire distinct WhatsApp templates
-- before and after the visit.
ALTER TYPE "PipelineStage" RENAME VALUE 'INTERESTED_SITE_VISIT' TO 'SITE_VISIT_SCHEDULED';
ALTER TYPE "PipelineStage" ADD VALUE 'SITE_VISIT_COMPLETED' AFTER 'SITE_VISIT_SCHEDULED';

-- AlterTable: Property — geo pin, YouTube embed, external website sync bookkeeping
ALTER TABLE "Property" ADD COLUMN "youtubeUrl" TEXT;
ALTER TABLE "Property" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Property" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Property" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Property" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Property" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Property_externalId_key" ON "Property"("externalId");

-- CreateTable: PropertyViewEvent
CREATE TABLE "PropertyViewEvent" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyViewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyViewEvent_propertyId_createdAt_idx" ON "PropertyViewEvent"("propertyId", "createdAt");

ALTER TABLE "PropertyViewEvent" ADD CONSTRAINT "PropertyViewEvent_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: BlogPost
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "coverImageUrl" TEXT,
    "body" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_isPublished_publishedAt_idx" ON "BlogPost"("isPublished", "publishedAt");

ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
