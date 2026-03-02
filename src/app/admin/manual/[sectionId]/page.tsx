import { notFound } from "next/navigation";

import { AdminManualSectionClient } from "@/components/admin-manual-section-client";
import { requireAdmin } from "@/lib/admin/server-auth";
import { MANUAL_SECTION_MANIFEST, getAdminManualIndex, getAdminManualSection } from "@/lib/manual/content";

export async function generateMetadata(props: { params: Promise<{ sectionId: string }> }) {
  const params = await props.params;
  const manifest = MANUAL_SECTION_MANIFEST.find((entry) => entry.id === params.sectionId);
  return {
    title: manifest ? `${manifest.title} Manual` : "Admin Manual"
  };
}

/**
 * Protected in-app manual section page for admin operators.
 * Each manual section has its own route so the UI stays readable for beginners.
 */
export default async function AdminManualSectionPage(props: { params: Promise<{ sectionId: string }> }) {
  await requireAdmin();

  const params = await props.params;
  const section = await getAdminManualSection(params.sectionId);
  if (!section) {
    notFound();
  }

  const manualIndex = await getAdminManualIndex();
  const sectionPosition = manualIndex.sections.findIndex((entry) => entry.id === section.id);
  const previous = sectionPosition > 0 ? manualIndex.sections[sectionPosition - 1] : null;
  const next = sectionPosition >= 0 && sectionPosition < manualIndex.sections.length - 1
    ? manualIndex.sections[sectionPosition + 1]
    : null;

  return <AdminManualSectionClient index={manualIndex} section={section} previous={previous} next={next} />;
}
