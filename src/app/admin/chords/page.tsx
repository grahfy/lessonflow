import React from "react";

import { AdminChordsClient } from "@/components/admin/chords/chords-client";
import { requireOwner } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Chord Library"
};

export default async function AdminChordsPage() {
  await requireOwner();
  return <AdminChordsClient />;
}
