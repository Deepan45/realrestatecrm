"use client";

import PropertyForm from "@/components/PropertyForm";
import { Card, PageHeader } from "@/components/ui";
import { BuildingIcon } from "@/components/icons";

export default function NewPropertyPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        icon={BuildingIcon}
        title="Add Property"
        subtitle="New listing — save first, then add photos, video, and location on the edit page"
      />
      <Card className="p-5">
        <PropertyForm />
      </Card>
    </div>
  );
}
