"use client";

import PropertyForm from "@/components/PropertyForm";
import { Card } from "@/components/ui";

export default function NewPropertyPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Add property</h1>
      <Card className="p-5">
        <PropertyForm />
      </Card>
    </div>
  );
}
