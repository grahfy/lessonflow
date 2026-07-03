import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { getCurrentAdmin, isOwnerAdmin } from "@/lib/admin-auth";
import { getCalendarRange } from "@/lib/calendar-range";
import { prisma } from "@/lib/db";
import { getSetupCompletionState } from "@/lib/setup";

import { formatTime, formatWeekdayTime } from "./formatters";

export const metadata = {
  title: "Booking Console Dashboard"
};

/**
 * Read-only landing overview for the booking console.
 *
 * Teachers see only their own assigned schedule and students; owners see an
 * all-up equivalent across the studio. The page intentionally performs the
 * role-scoped reads itself (mirroring the GET /api/admin/bookings and
 * /api/admin/customers teacher filters) so a teacher session can never observe
 * another teacher's bookings or students.
 */

const MAX_SCHEDULE_ROWS = 200;
const MAX_STUDENT_ROWS = 8;

type ScheduleBooking = {
  id: string;
  startAt: Date;
  endAt: Date;
  name: string;
  firstName: string;
  lastName: string;
  lessonMode: string;
  assignedTeacherName: string | null;
};

function bookingDisplayName(booking: Pick<ScheduleBooking, "name" | "firstName" | "lastName">): string {
  return booking.lastName ? `${booking.lastName}, ${booking.firstName}` : booking.name;
}

export default async function AdminDashboardPage() {
  const setupState = await getSetupCompletionState();
  if (setupState.status === "incomplete") {
    redirect("/setup");
  }
  if (setupState.status === "unavailable") {
    redirect("/admin/login");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const isOwner = isOwnerAdmin(admin);
  // Teachers are scoped to their own assignments; owners see everything.
  const teacherScope = isOwner ? {} : { assignedTeacherId: admin.id };
  const customerScope = isOwner ? {} : { primaryTeacherId: admin.id };

  const now = new Date();
  const dayRange = getCalendarRange("day", now.toISOString());
  const weekRange = getCalendarRange("week", now.toISOString());

  const [todayBookings, weekBookings, studentTotal, recentStudents] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: "approved",
        startAt: { gte: dayRange.start, lte: dayRange.end },
        ...teacherScope
      },
      include: {
        assignedTeacher: { select: { id: true, displayName: true } }
      },
      orderBy: { startAt: "asc" },
      take: MAX_SCHEDULE_ROWS
    }),
    prisma.booking.findMany({
      where: {
        status: "approved",
        startAt: { gte: weekRange.start, lte: weekRange.end },
        ...teacherScope
      },
      include: {
        assignedTeacher: { select: { id: true, displayName: true } }
      },
      orderBy: { startAt: "asc" },
      take: MAX_SCHEDULE_ROWS
    }),
    prisma.customer.count({
      where: { isArchived: false, ...customerScope }
    }),
    prisma.customer.findMany({
      where: { isArchived: false, ...customerScope },
      orderBy: { createdAt: "desc" },
      take: MAX_STUDENT_ROWS,
      include: {
        primaryTeacher: { select: { id: true, displayName: true } }
      }
    })
  ]);

  const toSchedule = (rows: typeof todayBookings): ScheduleBooking[] =>
    rows.map((booking) => ({
      id: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      name: booking.name,
      firstName: booking.firstName,
      lastName: booking.lastName,
      lessonMode: booking.lessonMode,
      assignedTeacherName: booking.assignedTeacher?.displayName ?? null
    }));

  const today = toSchedule(todayBookings);
  // The week view already includes today; keep it as the full-week list so the
  // two sections read as "today" and "this week" rather than duplicating rows.
  const week = toSchedule(weekBookings);
  // Cap the visual week list so a busy week doesn't render hundreds of rows;
  // mirrors the MAX_STUDENT_ROWS treatment with a "+N more" overflow line.
  const weekVisible = week.slice(0, MAX_STUDENT_ROWS);
  const weekOverflow = week.length - weekVisible.length;

  const greetingName = admin.displayName || admin.firstName || "there";
  const scopeLabel = isOwner ? "across the studio" : "assigned to you";

  return (
    <AdminShell title="Dashboard" className="admin-shell-dashboard">
      <section className="admin-home-hero">
        <div className="admin-home-hero-copy">
          <p className="admin-console-kicker">Dashboard</p>
          <h2 className="admin-home-title">Welcome back, {greetingName}.</h2>
          <p className="helper-text admin-home-summary">
            A read-only snapshot of the schedule and students {scopeLabel}. Open Bookings or Customers to make changes.
          </p>
        </div>
      </section>

      <section className="admin-dashboard-grid" aria-label="Dashboard overview">
        <AdminCard className="admin-dashboard-card">
          <div className="admin-dashboard-card-head">
            <h3 className="admin-dashboard-card-title">Today&apos;s schedule</h3>
            <span className="admin-dashboard-card-count">{today.length}</span>
          </div>
          {today.length === 0 ? (
            <p className="helper-text">No lessons scheduled for today.</p>
          ) : (
            <ul className="admin-dashboard-list">
              {today.map((booking) => (
                <li key={booking.id} className="admin-dashboard-list-item">
                  <span className="admin-dashboard-list-time">{formatTime(booking.startAt)}</span>
                  <span className="admin-dashboard-list-name">{bookingDisplayName(booking)}</span>
                  {isOwner && booking.assignedTeacherName ? (
                    <span className="admin-dashboard-list-meta">{booking.assignedTeacherName}</span>
                  ) : (
                    <span className="admin-dashboard-list-meta">{booking.lessonMode.replace(/_/g, " ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-secondary admin-dashboard-card-link" href="/admin/bookings?view=day">
            Open today in Bookings
          </Link>
        </AdminCard>

        <AdminCard className="admin-dashboard-card">
          <div className="admin-dashboard-card-head">
            <h3 className="admin-dashboard-card-title">This week</h3>
            <span className="admin-dashboard-card-count">{week.length}</span>
          </div>
          {week.length === 0 ? (
            <p className="helper-text">No lessons scheduled this week.</p>
          ) : (
            <ul className="admin-dashboard-list">
              {weekVisible.map((booking) => (
                <li key={booking.id} className="admin-dashboard-list-item">
                  <span className="admin-dashboard-list-time">{formatWeekdayTime(booking.startAt)}</span>
                  <span className="admin-dashboard-list-name">{bookingDisplayName(booking)}</span>
                  {isOwner && booking.assignedTeacherName ? (
                    <span className="admin-dashboard-list-meta">{booking.assignedTeacherName}</span>
                  ) : null}
                </li>
              ))}
              {weekOverflow > 0 ? (
                <li className="admin-dashboard-list-item admin-dashboard-list-more">
                  <span className="admin-dashboard-list-name">+{weekOverflow} more — open in Bookings</span>
                </li>
              ) : null}
            </ul>
          )}
          <Link className="btn btn-secondary admin-dashboard-card-link" href="/admin/bookings?view=week">
            Open week in Bookings
          </Link>
        </AdminCard>

        <AdminCard className="admin-dashboard-card">
          <div className="admin-dashboard-card-head">
            <h3 className="admin-dashboard-card-title">{isOwner ? "Students" : "My students"}</h3>
            <span className="admin-dashboard-card-count">{studentTotal}</span>
          </div>
          {recentStudents.length === 0 ? (
            <p className="helper-text">No students {scopeLabel} yet.</p>
          ) : (
            <ul className="admin-dashboard-list">
              {recentStudents.map((student) => (
                <li key={student.id} className="admin-dashboard-list-item">
                  <span className="admin-dashboard-list-name">{student.fullName}</span>
                  {isOwner && student.primaryTeacher?.displayName ? (
                    <span className="admin-dashboard-list-meta">{student.primaryTeacher.displayName}</span>
                  ) : (
                    <span className="admin-dashboard-list-meta">{student.skillLevel.replace(/_/g, " ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-secondary admin-dashboard-card-link" href="/admin/customers">
            Open Customers
          </Link>
        </AdminCard>
      </section>
    </AdminShell>
  );
}
