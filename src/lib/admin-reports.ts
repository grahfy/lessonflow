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

/**
 * Calculates start/end boundaries and the parallel comparative window 
 * (Prior Day/Week/Month/Year) for a given reporting key.
 */
function periodBounds(period: AdminReportPeriodKey, now: Date): PeriodBounds {
  if (period === "daily") {
    const start = startOfDay(now);
    const end = endOfDay(now);
    const previousStart = startOfDay(subDays(start, 1));
    const previousEnd = endOfDay(previousStart);
    return {
      key: period,
      label: `Today (${format(start, "d MMM")})`,
      start,
      end,
      previousLabel: `Previous day (${format(previousStart, "d MMM")})`,
      previousStart,
      previousEnd
    };
  }

  if (period === "weekly") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    const previousStart = startOfWeek(subWeeks(start, 1), { weekStartsOn: 1 });
    const previousEnd = endOfWeek(previousStart, { weekStartsOn: 1 });
    return {
      key: period,
      label: `This week (${format(start, "d MMM")} - ${format(end, "d MMM")})`,
      start,
      end,
      previousLabel: `Previous week (${format(previousStart, "d MMM")} - ${format(previousEnd, "d MMM")})`,
      previousStart,
      previousEnd
    };
  }

  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const previousStart = startOfMonth(subMonths(start, 1));
  const previousEnd = endOfMonth(previousStart);
  if (period === "monthly") {
    return {
      key: period,
      label: `This month (${format(start, "MMMM yyyy")})`,
      start,
      end,
      previousLabel: `Previous month (${format(previousStart, "MMMM yyyy")})`,
      previousStart,
      previousEnd
    };
  }

  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  const previousYearStart = startOfYear(subYears(yearStart, 1));
  const previousYearEnd = endOfYear(previousYearStart);
  return {
    key: period,
    label: `This year (${format(yearStart, "yyyy")})`,
    start: yearStart,
    end: yearEnd,
    previousLabel: `Previous year (${format(previousYearStart, "yyyy")})`,
    previousStart: previousYearStart,
    previousEnd: previousYearEnd
  };
}

/** Queries confirmed vs cancelled booking counts in a window. */
async function getAppointmentCountsForWindow(start: Date, end: Date) {
  const [confirmedCount, cancelledCount] = await Promise.all([
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
    })
  ]);
  return { confirmedCount, cancelledCount };
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

/** Builds the full comparative report set for a specific boundary. */
async function buildPeriodMetrics(bounds: PeriodBounds, now: Date): Promise<PeriodReport> {
  const [appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings] = await Promise.all([
    getAppointmentCountsForWindow(bounds.start, bounds.end),
    getAppointmentPipelineSnapshot(now),
    getAppointmentDetailRows(bounds.start, bounds.end, now),
    getEarningsForWindow(bounds.start, bounds.end),
    getOutstandingSnapshot(now),
    getOutstandingInvoiceDetailRows(now),
    getAppointmentCountsForWindow(bounds.previousStart, bounds.previousEnd),
    getEarningsForWindow(bounds.previousStart, bounds.previousEnd)
  ]);

  // Delta calculation for "Growth" metrics
  const earningsDeltaCents = earnings.netPaidCents - previousEarnings.netPaidCents;
  const earningsDeltaPercent =
    previousEarnings.netPaidCents === 0
      ? earnings.netPaidCents === 0 ? 0 : null
      : (earningsDeltaCents / Math.abs(previousEarnings.netPaidCents)) * 100;

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

  const [appointments, appointmentPipeline, appointmentDetails, earnings, outstandingInvoices, outstandingInvoiceDetails, previousAppointments, previousEarnings] = await Promise.all([
    getAppointmentCountsForWindow(startDate, endDate),
    getAppointmentPipelineSnapshot(now),
    getAppointmentDetailRows(startDate, endDate, now),
    getEarningsForWindow(startDate, endDate),
    getOutstandingSnapshot(now),
    getOutstandingInvoiceDetailRows(now),
    getAppointmentCountsForWindow(previousStart, previousEnd),
    getEarningsForWindow(previousStart, previousEnd)
  ]);

  const earningsDeltaCents = earnings.netPaidCents - previousEarnings.netPaidCents;
  const earningsDeltaPercent =
    previousEarnings.netPaidCents === 0
      ? earnings.netPaidCents === 0 ? 0 : null
      : (earningsDeltaCents / Math.abs(previousEarnings.netPaidCents)) * 100;

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
