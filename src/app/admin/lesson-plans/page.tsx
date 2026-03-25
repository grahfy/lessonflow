import { AdminLessonPlansClient } from "@/components/admin/lesson-plans/lesson-plans-client";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Lesson Plans"
};

export default async function AdminLessonPlansPage() {
  await requireAdmin();
  return <AdminLessonPlansClient />;
}
