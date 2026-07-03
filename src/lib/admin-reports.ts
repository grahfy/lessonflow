/**
 * Admin Reports & Business Intelligence Engine
 * 
 * Central service for calculating business performance, financial health, 
 * and scheduling trends across multiple time horizons.
 * 
 * ARCHITECTURAL DESIGN:
 * 1. Multi-Dimensional: Aggregates data by Day, Week, Month, and Year for 
 *    comprehensive business visibility.
 * 2. High Concurrency: Uses `Promise.all` extensively to parallelize 
 *    independent DB queries, minimizing report generation latency for 
 *    the Admin Dashboard.
 * 3. Trend Bucketing: Implements "Bucket Mapping" to normalize disparate 
 *    events into time-series data for visualization (Line Charts), ensuring 
 *    zero-activity periods are still represented.
 * 4. Comparative Analysis: Automatically computes deltas (performance 
 *    relative to the previous period) to highlight growth or decline.
 * 
 * DESIGN RATIONALE:
 * Managing a music school requires tracking "Pipeline" (incoming requests) 
 * vs "Execution" (confirmed lessons) vs "Cashflow" (actual collected 
 * payments). This module bridges those disparate data models into a unified 
 * telemetry set.
 */

import { BookingStatus, InvoiceStatus } from "@/generated/prisma/client";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears
} from "date-fns";

import { prisma } from "@/lib/db";
import { APP_TIMEZONE, dateTimeLocalToDate, toDateKey } from "@/lib/time";

/**
 * APP_TIMEZONE-aware period boundary helpers.
 *
 * RATIONALE: date-fns `startOfDay`/`endOfDay`/`startOfWeek`/`startOfMonth`/...
 * resolve boundaries in the server process timezone (UTC in production), while
 * every label in these reports is rendered in APP_TIMEZONE. That mismatch
 * mis-buckets late-evening Melbourne activity into the wrong calendar period.
 *
 * APPROACH: We model period math on a "naive local anchor" — a `Date` whose
 * UTC-clock fields hold the desired local Y/M/D/00:00. All calendar arithmetic
 * (start-of-week/month/year, +/- N units) is done with UTC getters/setters so
 * it is independent of the server process TZ. Each resulting boundary is then
 * mapped back to a real UTC instant via `dateTimeLocalToDate`, which applies the
 * correct (DST-aware) APP_TIMEZONE offset. Inclusive windows use an EXCLUSIVE
 * next-boundary upper bound to avoid the millisecond gaps of `endOf*`.
 */

/** Builds a naive local anchor (UTC fields = local Y/M/D, time at 00:00). */
function localAnchor(date: Date): Date {
  const key = toDateKey(date, APP_TIMEZONE);
  return new Date(`${key}T00:00:00.000Z`);
}

/** Converts a naive local anchor (UTC fields) into the real UTC instant. */
function anchorToInstant(anchor: Date): Date {
  const key = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
  const resolved = dateTimeLocalToDate(`${key}T00:00`, APP_TIMEZONE);
  if (!resolved) {
    throw new Error(`Unable to resolve local midnight for ${key}`);
  }
  return resolved;
}

/** Half-open local period window [start, endExclusive) as UTC instants, plus naive anchors for labels. */
type LocalWindow = { start: Date; endExclusive: Date; startAnchor: Date; endAnchor: Date };

function dayWindow(anchor: Date, offsetDays = 0): LocalWindow {
  const startAnchor = new Date(anchor);
  startAnchor.setUTCDate(startAnchor.getUTCDate() + offsetDays);
  const endAnchor = new Date(startAnchor);
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 1);
  return { start: anchorToInstant(startAnchor), endExclusive: anchorToInstant(endAnchor), startAnchor, endAnchor };
}

/** Week starts on Monday, matching the previous `weekStartsOn: 1` convention. */
function weekWindow(anchor: Date, offsetWeeks = 0): LocalWindow {
  const startAnchor = new Date(anchor);
  const dow = startAnchor.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  startAnchor.setUTCDate(startAnchor.getUTCDate() - daysSinceMonday + offsetWeeks * 7);
  const endAnchor = new Date(startAnchor);
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 7);
  return { start: anchorToInstant(startAnchor), endExclusive: anchorToInstant(endAnchor), startAnchor, endAnchor };
}

function monthWindow(anchor: Date, offsetMonths = 0): LocalWindow {
  const startAnchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offsetMonths, 1));
  const endAnchor = new Date(Date.UTC(startAnchor.getUTCFullYear(), startAnchor.getUTCMonth() + 1, 1));
  return { start: anchorToInstant(startAnchor), endExclusive: anchorToInstant(endAnchor), startAnchor, endAnchor };
}

function yearWindow(anchor: Date, offsetYears = 0): LocalWindow {
  const startAnchor = new Date(Date.UTC(anchor.getUTCFullYear() + offsetYears, 0, 1));
  const endAnchor = new Date(Date.UTC(startAnchor.getUTCFullYear() + 1, 0, 1));
  return { start: anchorToInstant(startAnchor), endExclusive: anchorToInstant(endAnchor), startAnchor, endAnchor };
}

/** Supported time buckets for standard administrative visibility. */
export type AdminReportPeriodKey = "daily" | "weekly" | "monthly" | "yearly";

/** Internal structure for defining time-window boundaries for queries. */
type PeriodBounds = {
  key: AdminReportPeriodKey;
  label: string;
  start: Date;
  end: Date;
  previousLabel: string;
  previousStart: Date;
  previousEnd: Date;
};

/** A snapshot of business metrics for a specific window of time. */
export type ReportMetricSnapshot = {
  appointments: {
    confirmedCount: number;
    cancelledCount: number;
    attendedCount: number;
    noShowCount: number;
  };
  appointmentPipeline: {
    pendingRequestCount: number;
    upcomingConfirmedCount: number;
  };
  outstandingInvoices: {
    count: number;
    totalCents: number;
    overdueCount: number;
    overdueTotalCents: number;
  };
  earnings: {
    netPaidCents: number;
    invoicePaidCents: number;
    creditNotePaidCents: number;
    paidDocumentCount: number;
  };
  /** Detailed rows for inclusion in email reports or dashboard tables. */
  details: {
    pendingAppointments: Array<{ time: string; customerName: string }>;
    upcomingConfirmedAppointments: Array<{ time: string; customerName: string }>;
    cancelledAppointments: Array<{ time: string; customerName: string }>;
    outstandingInvoices: Array<{
      invoiceNumber: string;
      customerName: string;
      amountCents: number;
      daysOverdue: number;
    }>;
  };
};

/** Comparison of current performance against the previous period. */
export type ReportComparison = {
  previousLabel: string;
  previousStart: string;
  previousEnd: string;
  earningsDeltaCents: number;
  earningsDeltaPercent: number | null;
  appointmentsDelta: number;
};

/** Representation of a report for a specific named period (e.g., Weekly). */
export type PeriodReport = ReportMetricSnapshot & {
  key: AdminReportPeriodKey;
  label: string;
  start: string;
  end: string;
  comparison: ReportComparison;
};

export type CustomRangeReport = Omit<PeriodReport, "key"> & {
  key: "custom";
};

/** A single data point for charting trends over time. */
export type TrendPoint = {
  key: string;
  label: string;
  appointments: number;
  earningsNetCents: number;
};

/** The full nested structure returned by the dashboard API. */
export type AdminReportsDashboard = {
  generatedAt: string;
  periods: {
    daily: PeriodReport;
    weekly: PeriodReport;
    monthly: PeriodReport;
    yearly: PeriodReport;
  };
  trends: {
    daily: TrendPoint[];
    weekly: TrendPoint[];
    monthly: TrendPoint[];
    yearly: TrendPoint[];
  };
  customRange?: CustomRangeReport;
};

/** RATIONALE: Invoices that aren't PAID or VOID are considered 'In Flight' (Outstanding). */
const OUTSTANDING_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent"];

/** Safely parses row limits for report lists. */
function parseReportEmailRowLimit(value: string | undefined, fallback: number, min = 1, max = 50): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const REPORT_EMAIL_APPOINTMENT_ROWS = parseReportEmailRowLimit(process.env.ADMIN_REPORT_EMAIL_APPOINTMENT_ROWS, 10);
const REPORT_EMAIL_OUTSTANDING_INVOICE_ROWS = parseReportEmailRowLimit(process.env.ADMIN_REPORT_EMAIL_OUTSTANDING_INVOICE_ROWS, 12);

/** Inclusive upper bound (last representable ms) for a half-open window. */
function inclusiveEnd(endExclusive: Date): Date {
  return new Date(endExclusive.getTime() - 1);
}

/**
 * Calculates start/end boundaries and the parallel comparative window
 * (Prior Day/Week/Month/Year) for a given reporting key.
 */
function periodBounds(period: AdminReportPeriodKey, now: Date): PeriodBounds {
  const anchor = localAnchor(now);

  if (period === "daily") {
    const current = dayWindow(anchor, 0);
    const previous = dayWindow(anchor, -1);
    return {
      key: period,
      label: `Today (${format(current.startAnchor, "d MMM")})`,
      start: current.start,
      end: inclusiveEnd(current.endExclusive),
      previousLabel: `Previous day (${format(previous.startAnchor, "d MMM")})`,
      previousStart: previous.start,
      previousEnd: inclusiveEnd(previous.endExclusive)
    };
  }

  if (period === "weekly") {
    const current = weekWindow(anchor, 0);
    const previous = weekWindow(anchor, -1);
    const currentEndAnchor = new Date(current.endAnchor);
    currentEndAnchor.setUTCDate(currentEndAnchor.getUTCDate() - 1);
    const previousEndAnchor = new Date(previous.endAnchor);
    previousEndAnchor.setUTCDate(previousEndAnchor.getUTCDate() - 1);
    return {
      key: period,
      label: `This week (${format(current.startAnchor, "d MMM")} - ${format(currentEndAnchor, "d MMM")})`,
      start: current.start,
      end: inclusiveEnd(current.endExclusive),
      previousLabel: `Previous week (${format(previous.startAnchor, "d MMM")} - ${format(previousEndAnchor, "d MMM")})`,
      previousStart: previous.start,
      previousEnd: inclusiveEnd(previous.endExclusive)
    };
  }

  if (period === "monthly") {
    const current = monthWindow(anchor, 0);
    const previous = monthWindow(anchor, -1);
    return {
      key: period,
      label: `This month (${format(current.startAnchor, "MMMM yyyy")})`,
      start: current.start,
      end: inclusiveEnd(current.endExclusive),
      previousLabel: `Previous month (${format(previous.startAnchor, "MMMM yyyy")})`,
      previousStart: previous.start,
      previousEnd: inclusiveEnd(previous.endExclusive)
    };
  }

  const current = yearWindow(anchor, 0);
  const previous = yearWindow(anchor, -1);
  return {
    key: period,
    label: `This year (${format(current.startAnchor, "yyyy")})`,
    start: current.start,
    end: inclusiveEnd(current.endExclusive),
    previousLabel: `Previous year (${format(previous.startAnchor, "yyyy")})`,
    previousStart: previous.start,
    previousEnd: inclusiveEnd(previous.endExclusive)
  };
}

/** Queries confirmed vs cancelled booking counts in a window, plus attendance outcomes. */
async function getAppointmentCountsForWindow(start: Date, end: Date) {
  const [confirmedCount, cancelledCount, attendedCount, noShowCount] = await Promise.all([
    prisma.booking.count({
      where: {
        status: "approved",
        startAt: { gte: start, lte: end }
      }
    }),
    prisma.booking.count({
      where: {
        status: "cancelled",
        startAt: { gte: start, lte: end }
      }
    }),
    prisma.booking.count({
      where: {
        status: "approved",
        attendanceStatus: "attended",
        startAt: { gte: start, lte: end }
      }
    }),
    prisma.booking.count({
      where: {
        status: "approved",
        attendanceStatus: "no_show",
        startAt: { gte: start, lte: end }
      }
    })
  ]);
  return { confirmedCount, cancelledCount, attendedCount, noShowCount };
}

/** Snapshot of global application health (Requests needing attention). */
async function getAppointmentPipelineSnapshot(now: Date) {
  const [pendingRequestCount, upcomingConfirmedCount] = await Promise.all([
    prisma.bookingRequest.count({
      where: { status: "pending" }
    }),
    prisma.booking.count({
      where: {
        status: "approved",
        startAt: { gte: now }
      }
    })
  ]);
  return { pendingRequestCount, upcomingConfirmedCount };
}

/** Fetches row-level data for the top pending/upcoming appointments. */
async function getAppointmentDetailRows(start: Date, end: Date, now: Date) {
  const [pendingAppointments, upcomingConfirmedAppointments, cancelledAppointments] = await Promise.all([
    prisma.bookingRequest.findMany({
      where: { status: "pending" },
      orderBy: { requestedStartAt: "asc" },
      take: REPORT_EMAIL_APPOINTMENT_ROWS,
      select: { requestedStartAt: true, name: true }
    }),
    prisma.booking.findMany({
      where: {
        status: "approved",
        startAt: { gte: now }
      },
      orderBy: { startAt: "asc" },
      take: REPORT_EMAIL_APPOINTMENT_ROWS,
      select: { startAt: true, name: true }
    }),
    prisma.booking.findMany({
      where: {
        status: "cancelled",
        startAt: { gte: start, lte: end }
      },
      orderBy: { startAt: "asc" },
      take: REPORT_EMAIL_APPOINTMENT_ROWS,
      select: { startAt: true, name: true }
    })
  ]);

  return {
    pendingAppointments: pendingAppointments.map((row) => ({
      time: row.requestedStartAt.toISOString(),
      customerName: row.name
    })),
    upcomingConfirmedAppointments: upcomingConfirmedAppointments.map((row) => ({
      time: row.startAt.toISOString(),
      customerName: row.name
    })),
    cancelledAppointments: cancelledAppointments.map((row) => ({
      time: row.startAt.toISOString(),
      customerName: row.name
    }))
  };
}

/** 
 * Aggregates actual payments collected (Cashflow).
 * RATIONALE: We only count PAID invoices in this metric to distinguish 
 * from "Theoretical Revenue" which includes sent but unpaid invoices.
 */
async function getEarningsForWindow(start: Date, end: Date) {
  const paidDocs = await prisma.invoice.findMany({
    where: {
      isDeleted: false,
      status: "paid",
      paidAt: { gte: start, lte: end }
    },
    select: {
      id: true,
      totalCents: true,
      documentType: true
    }
  });

  let netPaidCents = 0;
  let invoicePaidCents = 0;
  let creditNotePaidCents = 0;
  
  for (const doc of paidDocs) {
    netPaidCents += doc.totalCents;
    if (doc.documentType === "credit_note") {
      creditNotePaidCents += doc.totalCents;
    } else {
      invoicePaidCents += doc.totalCents;
    }
  }

  return {
    netPaidCents,
    invoicePaidCents,
    creditNotePaidCents,
    paidDocumentCount: paidDocs.length
  };
}

/** Aggregates liabilities (Money owed to the school). */
async function getOutstandingSnapshot(now: Date) {
  const [allOutstanding, overdueOutstanding] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        isDeleted: false,
        documentType: "invoice",
        status: { in: OUTSTANDING_INVOICE_STATUSES }
      },
      _count: { _all: true },
      _sum: { totalCents: true }
    }),
    prisma.invoice.aggregate({
      where: {
        isDeleted: false,
        documentType: "invoice",
        status: { in: OUTSTANDING_INVOICE_STATUSES },
        dueAt: { lt: now }
      },
      _count: { _all: true },
      _sum: { totalCents: true }
    })
  ]);

  return {
    count: allOutstanding._count._all,
    totalCents: allOutstanding._sum.totalCents ?? 0,
    overdueCount: overdueOutstanding._count._all,
    overdueTotalCents: overdueOutstanding._sum.totalCents ?? 0
  };
}

/** Row-level listing of who owes money and for how long. */
async function getOutstandingInvoiceDetailRows(now: Date) {
  const rows = await prisma.invoice.findMany({
    where: {
      isDeleted: false,
      documentType: "invoice",
      status: { in: OUTSTANDING_INVOICE_STATUSES }
    },
    orderBy: [{ dueAt: "asc" }, { invoiceNumber: "asc" }],
    take: REPORT_EMAIL_OUTSTANDING_INVOICE_ROWS,
    select: {
      invoiceNumber: true,
      customerName: true,
      totalCents: true,
      dueAt: true
    }
  });

  const msPerDay = 24 * 60 * 60 * 1000;
  return rows.map((row) => ({
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerName,
    amountCents: row.totalCents,
    daysOverdue: Math.max(0, Math.floor((now.getTime() - row.dueAt.getTime()) / msPerDay))
  }));
}

/** Runs the shared set of parallel queries needed for a current + previous window comparison. */
async function gatherPeriodMetrics(start: Date, end: Date, previousStart: Date, previousEnd: Date, now: Date) {
  const [appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings] = await Promise.all([
    getAppointmentCountsForWindow(start, end),
    getAppointmentPipelineSnapshot(now),
    getAppointmentDetailRows(start, end, now),
    getEarningsForWindow(start, end),
    getOutstandingSnapshot(now),
    getOutstandingInvoiceDetailRows(now),
    getAppointmentCountsForWindow(previousStart, previousEnd),
    getEarningsForWindow(previousStart, previousEnd)
  ]);

  return { appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings };
}

/** Delta calculation for "Growth" metrics. */
function computeEarningsDelta(netPaidCents: number, previousNetPaidCents: number) {
  const earningsDeltaCents = netPaidCents - previousNetPaidCents;
  const earningsDeltaPercent =
    previousNetPaidCents === 0
      ? netPaidCents === 0 ? 0 : null
      : (earningsDeltaCents / Math.abs(previousNetPaidCents)) * 100;
  return { earningsDeltaCents, earningsDeltaPercent };
}

/** Builds the full comparative report set for a specific boundary. */
async function buildPeriodMetrics(bounds: PeriodBounds, now: Date): Promise<PeriodReport> {
  const { appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings } =
    await gatherPeriodMetrics(bounds.start, bounds.end, bounds.previousStart, bounds.previousEnd, now);

  const { earningsDeltaCents, earningsDeltaPercent } = computeEarningsDelta(earnings.netPaidCents, previousEarnings.netPaidCents);

  return {
    key: bounds.key,
    label: bounds.label,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
    appointments,
    appointmentPipeline,
    outstandingInvoices,
    earnings,
    details: {
      ...appointmentDetails,
      outstandingInvoices: outstandingInvoiceDetails
    },
    comparison: {
      previousLabel: bounds.previousLabel,
      previousStart: bounds.previousStart.toISOString(),
      previousEnd: bounds.previousEnd.toISOString(),
      earningsDeltaCents,
      earningsDeltaPercent,
      appointmentsDelta: appointments.confirmedCount - previousAppointments.confirmedCount
    }
  };
}

/** Handles reports for arbitrary user-selected dates. */
async function buildCustomPeriodMetrics(start: Date, end: Date, now: Date): Promise<CustomRangeReport> {
  const startDate = startOfDay(start);
  const endDate = endOfDay(end);
  const daySpan = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  const previousStart = startOfDay(subDays(startDate, daySpan));
  const previousEnd = endOfDay(subDays(startDate, 1));

  const { appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings } =
    await gatherPeriodMetrics(startDate, endDate, previousStart, previousEnd, now);

  const { earningsDeltaCents, earningsDeltaPercent } = computeEarningsDelta(earnings.netPaidCents, previousEarnings.netPaidCents);

  return {
    key: "custom",
    label: `Custom range (${format(startDate, "d MMM yyyy")} - ${format(endDate, "d MMM yyyy")})`,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    appointments,
    appointmentPipeline,
    outstandingInvoices,
    earnings,
    details: {
      ...appointmentDetails,
      outstandingInvoices: outstandingInvoiceDetails
    },
    comparison: {
      previousLabel: `Previous ${daySpan}-day period (${format(previousStart, "d MMM yyyy")} - ${format(previousEnd, "d MMM yyyy")})`,
      previousStart: previousStart.toISOString(),
      previousEnd: previousEnd.toISOString(),
      earningsDeltaCents,
      earningsDeltaPercent,
      appointmentsDelta: appointments.confirmedCount - previousAppointments.confirmedCount
    }
  };
}

/** Normalizes dates to strings for charting bucket alignment. */
function bucketDateKey(date: Date, grain: "day" | "week" | "month" | "year") {
  if (grain === "day") return format(startOfDay(date), "yyyy-MM-dd");
  if (grain === "week") return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (grain === "month") return format(startOfMonth(date), "yyyy-MM-01");
  return format(startOfYear(date), "yyyy-01-01");
}

type TrendBucket = { key: string; label: string; start: Date; end: Date };

/** 
 * Generates an array of time-buckets to be filled with data. 
 * RATIONALE: Pre-generating buckets ensures the trend-line has 0-values 
 * for periods with no activity, rather than missing gaps in the chart.
 */
function buildTrendPointsTemplate(
  grain: "day" | "week" | "month" | "year",
  now: Date,
  customRange?: { start: Date; end: Date }
): TrendBucket[] {
  if (customRange) {
    const customStart = startOfDay(customRange.start);
    const customEnd = endOfDay(customRange.end);

    if (grain === "day") {
      return eachDayOfInterval({ start: customStart, end: customEnd }).map((day) => ({
        key: bucketDateKey(day, "day"),
        label: format(day, "d MMM"),
        start: startOfDay(day),
        end: endOfDay(day)
      }));
    }

    if (grain === "week") {
      return eachWeekOfInterval({ start: customStart, end: customEnd }, { weekStartsOn: 1 }).map((weekStart) => ({
        key: bucketDateKey(weekStart, "week"),
        label: `${format(weekStart, "d MMM")}`,
        start: startOfWeek(weekStart, { weekStartsOn: 1 }),
        end: endOfWeek(weekStart, { weekStartsOn: 1 })
      }));
    }

    if (grain === "month") {
      return eachMonthOfInterval({ start: customStart, end: customEnd }).map((monthStart) => ({
        key: bucketDateKey(monthStart, "month"),
        label: format(monthStart, "MMM yy"),
        start: startOfMonth(monthStart),
        end: endOfMonth(monthStart)
      }));
    }

    return eachYearOfInterval({ start: customStart, end: customEnd }).map((yearStart) => ({
      key: bucketDateKey(yearStart, "year"),
      label: format(yearStart, "yyyy"),
      start: startOfYear(yearStart),
      end: endOfYear(yearStart)
    }));
  }

  // Handle standard rolling windows (e.g. last 14 days, last 12 months)
  if (grain === "year") {
    const currentYearStart = startOfYear(now);
    const years = Array.from({ length: 6 }, (_, i) => startOfYear(subYears(currentYearStart, 5 - i)));
    return years.map((yearStart) => ({
      key: bucketDateKey(yearStart, "year"),
      label: format(yearStart, "yyyy"),
      start: yearStart,
      end: endOfYear(yearStart)
    }));
  }

  if (grain === "day") {
    const start = startOfDay(subDays(now, 13));
    const end = endOfDay(now);
    return eachDayOfInterval({ start, end }).map((day) => ({
      key: bucketDateKey(day, "day"),
      label: format(day, "d MMM"),
      start: startOfDay(day),
      end: endOfDay(day)
    }));
  }

  if (grain === "week") {
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weeks = Array.from({ length: 8 }, (_, i) => startOfWeek(subWeeks(currentWeekStart, 7 - i), { weekStartsOn: 1 }));
    return weeks.map((weekStart) => ({
      key: bucketDateKey(weekStart, "week"),
      label: `${format(weekStart, "d MMM")}`,
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 })
    }));
  }

  const currentMonthStart = startOfMonth(now);
  const start = startOfMonth(subMonths(currentMonthStart, 11));
  return eachMonthOfInterval({ start, end: currentMonthStart }).map((monthStart) => ({
    key: bucketDateKey(monthStart, "month"),
    label: format(monthStart, "MMM yy"),
    start: monthStart,
    end: endOfMonth(monthStart)
  }));
}

/** Builds trend-line data points for a specific granularity. */
async function buildTrend(
  grain: "day" | "week" | "month" | "year",
  now: Date,
  customRange?: { start: Date; end: Date }
): Promise<TrendPoint[]> {
  const buckets = buildTrendPointsTemplate(grain, now, customRange);
  const firstStart = buckets[0]?.start;
  const lastEnd = buckets[buckets.length - 1]?.end;
  
  if (!firstStart || !lastEnd) return [];

  const [bookings, paidInvoices] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: "approved",
        startAt: { gte: firstStart, lte: lastEnd }
      },
      select: { startAt: true, status: true }
    }),
    prisma.invoice.findMany({
      where: {
        isDeleted: false,
        status: "paid",
        paidAt: { gte: firstStart, lte: lastEnd }
      },
      select: { paidAt: true, totalCents: true }
    })
  ]);

  const appointmentByBucket = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status !== BookingStatus.approved) continue;
    const key = bucketDateKey(booking.startAt, grain);
    appointmentByBucket.set(key, (appointmentByBucket.get(key) ?? 0) + 1);
  }

  const earningsByBucket = new Map<string, number>();
  for (const invoice of paidInvoices) {
    if (!invoice.paidAt) continue;
    const key = bucketDateKey(invoice.paidAt, grain);
    earningsByBucket.set(key, (earningsByBucket.get(key) ?? 0) + invoice.totalCents);
  }

  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    appointments: appointmentByBucket.get(bucket.key) ?? 0,
    earningsNetCents: earningsByBucket.get(bucket.key) ?? 0
  }));
}

/**
 * Primary orchestrator for the Admin Report Dashboard.
 * 
 * DESIGN RATIONALE: By grouping ALL dashboard data into one call, we 
 * minimize frontend-loading states and ensure a consistent 
 * "Time-of-Generation" across all metrics.
 * 
 * @param now - Reference date for 'today'
 * @param options - Custom date range overrides
 */
export async function getAdminReportsDashboard(
  now: Date = new Date(),
  options?: { customRangeStart?: Date; customRangeEnd?: Date }
): Promise<AdminReportsDashboard> {
  const hasCustomRange = !!(options?.customRangeStart && options?.customRangeEnd);

  const [daily, weekly, monthly, yearly, dailyTrend, weeklyTrend, monthlyTrend, yearlyTrend, customRange] = await Promise.all([
    buildPeriodMetrics(periodBounds("daily", now), now),
    buildPeriodMetrics(periodBounds("weekly", now), now),
    buildPeriodMetrics(periodBounds("monthly", now), now),
    buildPeriodMetrics(periodBounds("yearly", now), now),
    buildTrend("day", now, hasCustomRange ? { start: options!.customRangeStart!, end: options!.customRangeEnd! } : undefined),
    buildTrend("week", now, hasCustomRange ? { start: options!.customRangeStart!, end: options!.customRangeEnd! } : undefined),
    buildTrend("month", now, hasCustomRange ? { start: options!.customRangeStart!, end: options!.customRangeEnd! } : undefined),
    buildTrend("year", now, hasCustomRange ? { start: options!.customRangeStart!, end: options!.customRangeEnd! } : undefined),
    hasCustomRange ? buildCustomPeriodMetrics(options!.customRangeStart!, options!.customRangeEnd!, now) : Promise.resolve(undefined)
  ]);

  return {
    generatedAt: now.toISOString(),
    periods: { daily, weekly, monthly, yearly },
    trends: { daily: dailyTrend, weekly: weeklyTrend, monthly: monthlyTrend, yearly: yearlyTrend },
    ...(customRange ? { customRange } : {})
  };
}

/** Helper to fetch a single period report (used by email jobs). */
export async function getAdminPeriodReport(period: AdminReportPeriodKey, now: Date = new Date()): Promise<PeriodReport> {
  return buildPeriodMetrics(periodBounds(period, now), now);
}

/** Formats cents into AUD currency string. */
export function formatAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

/** Formats numeric changes with + prefix. */
export function formatChange(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

/** Formats percentages with capping and +/- prefix. */
export function formatPercentChange(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
