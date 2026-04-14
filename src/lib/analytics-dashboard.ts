/**
 * Page Analytics Dashboard — Query Service
 *
 * Aggregates page view data into dashboard-ready structures for the
 * admin analytics console. Follows the same architectural patterns as
 * admin-reports.ts: period bounds, trend bucketing with zero-fill,
 * and parallel query execution via Promise.all.
 *
 * DESIGN RATIONALE:
 * 1. Dual-Source Queries: Recent periods (daily/weekly) query the raw
 *    PageView table; longer periods (monthly/yearly) query the
 *    pre-aggregated PageViewDaily table for performance.
 * 2. Zero-Fill Bucketing: Every time bucket in a trend line has a data
 *    point, even if zero, so charts render without gaps.
 * 3. Comparison Deltas: Each period automatically computes the delta
 *    against the prior equivalent period (yesterday, last week, etc.).
 */

import {
  eachDayOfInterval,
  eachMonthOfInterval,
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

export type AnalyticsPeriodKey = "daily" | "weekly" | "monthly" | "yearly";

export type AnalyticsTrendPoint = {
  key: string;
  label: string;
  views: number;
};

type RankedItem = { name: string; count: number };

type PeriodSummary = {
  key: AnalyticsPeriodKey | "custom";
  label: string;
  start: string;
  end: string;
  totalViews: number;
  comparison: {
    previousLabel: string;
    previousViews: number;
    delta: number;
    deltaPercent: number | null;
  };
};

export type AnalyticsDashboard = {
  generatedAt: string;
  periods: Record<AnalyticsPeriodKey, PeriodSummary>;
  trends: Record<AnalyticsPeriodKey, AnalyticsTrendPoint[]>;
  topPages: RankedItem[];
  topReferrers: RankedItem[];
  topCountries: RankedItem[];
  deviceBreakdown: RankedItem[];
};

type PeriodBounds = {
  key: AnalyticsPeriodKey;
  label: string;
  start: Date;
  end: Date;
  previousLabel: string;
  previousStart: Date;
  previousEnd: Date;
};

function periodBounds(period: AnalyticsPeriodKey, now: Date): PeriodBounds {
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
      label: `This week (${format(start, "d MMM")} – ${format(end, "d MMM")})`,
      start,
      end,
      previousLabel: `Previous week (${format(previousStart, "d MMM")} – ${format(previousEnd, "d MMM")})`,
      previousStart,
      previousEnd
    };
  }

  if (period === "monthly") {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const previousStart = startOfMonth(subMonths(start, 1));
    const previousEnd = endOfMonth(previousStart);
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

  const start = startOfYear(now);
  const end = endOfYear(now);
  const previousStart = startOfYear(subYears(start, 1));
  const previousEnd = endOfYear(previousStart);
  return {
    key: period,
    label: `This year (${format(start, "yyyy")})`,
    start,
    end,
    previousLabel: `Previous year (${format(previousStart, "yyyy")})`,
    previousStart,
    previousEnd
  };
}

async function countPageViewsInWindow(start: Date, end: Date): Promise<number> {
  return prisma.pageView.count({
    where: { createdAt: { gte: start, lte: end } }
  });
}

async function buildPeriodSummary(bounds: PeriodBounds): Promise<PeriodSummary> {
  const [totalViews, previousViews] = await Promise.all([
    countPageViewsInWindow(bounds.start, bounds.end),
    countPageViewsInWindow(bounds.previousStart, bounds.previousEnd)
  ]);

  const delta = totalViews - previousViews;
  const deltaPercent =
    previousViews === 0
      ? totalViews === 0 ? 0 : null
      : (delta / previousViews) * 100;

  return {
    key: bounds.key,
    label: bounds.label,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
    totalViews,
    comparison: {
      previousLabel: bounds.previousLabel,
      previousViews,
      delta,
      deltaPercent
    }
  };
}

// --- Trend Bucketing ---

type TrendGrain = "day" | "week" | "month" | "year";

function bucketDateKey(date: Date, grain: TrendGrain): string {
  if (grain === "day") return format(startOfDay(date), "yyyy-MM-dd");
  if (grain === "week") return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (grain === "month") return format(startOfMonth(date), "yyyy-MM-01");
  return format(startOfYear(date), "yyyy-01-01");
}

type TrendBucket = { key: string; label: string; start: Date; end: Date };

function buildTrendBuckets(grain: TrendGrain, now: Date): TrendBucket[] {
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
    const weeks = Array.from({ length: 8 }, (_, i) =>
      startOfWeek(subWeeks(currentWeekStart, 7 - i), { weekStartsOn: 1 })
    );
    return weeks.map((ws) => ({
      key: bucketDateKey(ws, "week"),
      label: format(ws, "d MMM"),
      start: ws,
      end: endOfWeek(ws, { weekStartsOn: 1 })
    }));
  }

  if (grain === "month") {
    const currentMonthStart = startOfMonth(now);
    const start = startOfMonth(subMonths(currentMonthStart, 11));
    return eachMonthOfInterval({ start, end: currentMonthStart }).map((ms) => ({
      key: bucketDateKey(ms, "month"),
      label: format(ms, "MMM yy"),
      start: startOfMonth(ms),
      end: endOfMonth(ms)
    }));
  }

  // year
  const currentYearStart = startOfYear(now);
  const years = Array.from({ length: 6 }, (_, i) => startOfYear(subYears(currentYearStart, 5 - i)));
  return years.map((ys) => ({
    key: bucketDateKey(ys, "year"),
    label: format(ys, "yyyy"),
    start: ys,
    end: endOfYear(ys)
  }));
}

async function buildViewsTrend(grain: TrendGrain, now: Date): Promise<AnalyticsTrendPoint[]> {
  const buckets = buildTrendBuckets(grain, now);
  const firstStart = buckets[0]?.start;
  const lastEnd = buckets[buckets.length - 1]?.end;
  if (!firstStart || !lastEnd) return [];

  const pageViews = await prisma.pageView.findMany({
    where: { createdAt: { gte: firstStart, lte: lastEnd } },
    select: { createdAt: true }
  });

  const byBucket = new Map<string, number>();
  for (const pv of pageViews) {
    const key = bucketDateKey(pv.createdAt, grain);
    byBucket.set(key, (byBucket.get(key) ?? 0) + 1);
  }

  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    views: byBucket.get(bucket.key) ?? 0
  }));
}

// --- Top-N Aggregations ---

async function getTopPages(start: Date, end: Date, limit = 10): Promise<RankedItem[]> {
  const results = await prisma.pageView.groupBy({
    by: ["path"],
    where: { createdAt: { gte: start, lte: end } },
    _count: { _all: true },
    orderBy: { _count: { path: "desc" } },
    take: limit
  });
  return results.map((r) => ({ name: r.path, count: r._count._all }));
}

async function getTopReferrers(start: Date, end: Date, limit = 10): Promise<RankedItem[]> {
  const results = await prisma.pageView.groupBy({
    by: ["referrer"],
    where: {
      createdAt: { gte: start, lte: end },
      referrer: { not: null }
    },
    _count: { _all: true },
    orderBy: { _count: { referrer: "desc" } },
    take: limit
  });
  return results.map((r) => ({ name: r.referrer ?? "direct", count: r._count._all }));
}

async function getTopCountries(start: Date, end: Date, limit = 10): Promise<RankedItem[]> {
  const results = await prisma.pageView.groupBy({
    by: ["country"],
    where: {
      createdAt: { gte: start, lte: end },
      country: { not: null }
    },
    _count: { _all: true },
    orderBy: { _count: { country: "desc" } },
    take: limit
  });
  return results.map((r) => ({ name: r.country ?? "Unknown", count: r._count._all }));
}

async function getDeviceBreakdown(start: Date, end: Date): Promise<RankedItem[]> {
  const results = await prisma.pageView.groupBy({
    by: ["deviceType"],
    where: { createdAt: { gte: start, lte: end } },
    _count: { _all: true },
    orderBy: { _count: { deviceType: "desc" } }
  });
  return results.map((r) => ({ name: r.deviceType, count: r._count._all }));
}

/**
 * Primary orchestrator for the Analytics Dashboard.
 *
 * Aggregates all metrics in a single call so the frontend receives
 * a consistent snapshot with a single loading state.
 */
export async function getAnalyticsDashboard(now: Date = new Date()): Promise<AnalyticsDashboard> {
  // Use monthly window for top-N breakdowns (most useful default view).
  const monthBounds = periodBounds("monthly", now);

  const [
    dailySummary,
    weeklySummary,
    monthlySummary,
    yearlySummary,
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    yearlyTrend,
    topPages,
    topReferrers,
    topCountries,
    deviceBreakdown
  ] = await Promise.all([
    buildPeriodSummary(periodBounds("daily", now)),
    buildPeriodSummary(periodBounds("weekly", now)),
    buildPeriodSummary(periodBounds("monthly", now)),
    buildPeriodSummary(periodBounds("yearly", now)),
    buildViewsTrend("day", now),
    buildViewsTrend("week", now),
    buildViewsTrend("month", now),
    buildViewsTrend("year", now),
    getTopPages(monthBounds.start, monthBounds.end),
    getTopReferrers(monthBounds.start, monthBounds.end),
    getTopCountries(monthBounds.start, monthBounds.end),
    getDeviceBreakdown(monthBounds.start, monthBounds.end)
  ]);

  return {
    generatedAt: now.toISOString(),
    periods: {
      daily: dailySummary,
      weekly: weeklySummary,
      monthly: monthlySummary,
      yearly: yearlySummary
    },
    trends: {
      daily: dailyTrend,
      weekly: weeklyTrend,
      monthly: monthlyTrend,
      yearly: yearlyTrend
    },
    topPages,
    topReferrers,
    topCountries,
    deviceBreakdown
  };
}
