import { AdminLessonPlansClientV2 } from "@/components/admin/lesson-plans/lesson-plans-client-v2";
import { requireAdmin } from "@/lib/admin/server-auth";

export const metadata = {
  title: "Booking Console Lesson Plans"
};

export default async function AdminLessonPlansPage() {
  await requireAdmin();
  return <AdminLessonPlansClientV2 />;
}
