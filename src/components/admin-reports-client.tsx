"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";

type ReportPeriodKey = "daily" | "weekly" | "monthly" | "yearly";
type TrendGrainKey = "daily" | "weekly" | "monthly" | "yearly";
type ReportDateFormat = "readable" | "ddmmyy";

type PeriodReport = {
  key: ReportPeriodKey;
  label: string;
  start: string;
  end: string;
  appointments: {
    confirmedCount: number;
    cancelledCount: number;
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
  comparison: {
    previousLabel: string;
    previousStart: string;
    previousEnd: string;
    earningsDeltaCents: number;
    earningsDeltaPercent: number | null;
    appointmentsDelta: number;
  };
};

type TrendPoint = {
  key: string;
  label: string;
  appointments: number;
  earningsNetCents: number;
};

type CustomRangeReport = Omit<PeriodReport, "key"> & { key: "custom" };

type AdminReportsDashboard = {
  generatedAt: string;
  periods: Record<ReportPeriodKey, PeriodReport>;
  trends: Record<TrendGrainKey, TrendPoint[]>;
  customRange?: CustomRangeReport;
};

type AdminReportsResponse = AdminReportsDashboard & {
  error?: string;
};

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

function formatAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function formatDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function deltaClass(value: number): string {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function formatDate(date: Date, mode: ReportDateFormat, withTime = false): string {
  if (mode === "ddmmyy") {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    if (!withTime) {
      return `${day}/${month}/${year}`;
    }
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Australia/Melbourne"
  }).format(date);
}

function toMelbourneDate(value: string): Date {
  return new Date(new Date(value).toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
}

function formatGeneratedAt(value: string, mode: ReportDateFormat): string {
  return formatDate(toMelbourneDate(value), mode, true);
}

function formatPeriodLabel(period: PeriodReport, mode: ReportDateFormat): string {
  const start = toMelbourneDate(period.start);
  const end = toMelbourneDate(period.end);

  if (mode === "readable") {
    if (period.key === "daily") return `Today (${formatDate(start, mode)})`;
    if (period.key === "weekly") return `This week (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
    if (period.key === "monthly") {
      return `This month (${new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Melbourne" }).format(start)})`;
    }
    return `This year (${start.getFullYear()})`;
  }

  if (period.key === "daily") return `Today (${formatDate(start, mode)})`;
  if (period.key === "weekly") return `This week (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  if (period.key === "monthly") return `This month (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  return `This year (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
}

function formatPreviousLabel(
  period: PeriodReport | CustomRangeReport,
  mode: ReportDateFormat
): string {
  if (mode === "readable") {
    return period.comparison.previousLabel;
  }
  const start = toMelbourneDate(period.comparison.previousStart);
  const end = toMelbourneDate(period.comparison.previousEnd);
  if (period.key === "custom") return `${formatDate(start, mode)} - ${formatDate(end, mode)}`;
  if (period.key === "daily") return `Previous day (${formatDate(start, mode)})`;
  if (period.key === "weekly") return `Previous week (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  if (period.key === "monthly") return `Previous month (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  return `Previous year (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
}

function parseTrendKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function formatTrendLabel(point: TrendPoint, grain: TrendGrainKey, mode: ReportDateFormat): string {
  if (mode === "readable") {
    return point.label;
  }
  const date = parseTrendKey(point.key);
  if (grain === "yearly") {
    return String(date.getFullYear());
  }
  return formatDate(date, mode);
}

function periodTitle(key: ReportPeriodKey): string {
  if (key === "daily") return "Daily";
  if (key === "weekly") return "Weekly";
  if (key === "monthly") return "Monthly";
  return "Yearly";
}

function trendTitle(key: TrendGrainKey, customRangeActive = false): string {
  if (customRangeActive) {
    if (key === "daily") return "Daily trend (custom range)";
    if (key === "weekly") return "Weekly trend (custom range)";
    if (key === "monthly") return "Monthly trend (custom range)";
    return "Yearly trend (custom range)";
  }
  if (key === "daily") return "Daily trend (last 14 days)";
  if (key === "weekly") return "Weekly trend (last 8 weeks)";
  if (key === "monthly") return "Monthly trend (last 12 months)";
  return "Yearly trend (last 6 years)";
}

function MiniBarChart({
  points,
  grain,
  dateFormat,
  valueKey,
  strokeClass,
  emptyLabel,
  moneyValues = false
}: {
  points: TrendPoint[];
  grain: TrendGrainKey;
  dateFormat: ReportDateFormat;
  valueKey: "appointments" | "earningsNetCents";
  strokeClass: string;
  emptyLabel: string;
  moneyValues?: boolean;
}) {
  const width = 560;
  const height = 160;
  const padX = 14;
  const top = 12;
  const bottom = 28;
  const chartHeight = height - top - bottom;

  const values = points.map((point) => point[valueKey]);
  const maxValue = Math.max(...values, 0);

  if (points.length === 0) {
    return <p className="report-chart-empty">{emptyLabel}</p>;
  }

  const slotWidth = (width - padX * 2) / points.length;
  const barWidth = Math.max(4, Math.min(20, slotWidth * 0.55));
  const labelStep = points.length > 10 ? Math.ceil(points.length / 6) : 1;
  const firstLabel = formatTrendLabel(points[0], grain, dateFormat);
  const lastLabel = formatTrendLabel(points[points.length - 1], grain, dateFormat);

  return (
    <div className="report-chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="report-chart-svg" role="img" aria-label={emptyLabel}>
        <line x1={padX} y1={height - bottom} x2={width - padX} y2={height - bottom} className="report-chart-axis" />
        {points.map((point, index) => {
          const value = point[valueKey];
          const normalized = maxValue <= 0 ? 0 : Math.max(0, value) / maxValue;
          const barHeight = normalized * chartHeight;
          const x = padX + slotWidth * index + (slotWidth - barWidth) / 2;
          const y = height - bottom - barHeight;
          const showLabel = index % labelStep === 0 || index === points.length - 1;
          const label = formatTrendLabel(point, grain, dateFormat);
          const tooltip = moneyValues ? `${label}: ${formatAud(value)}` : `${label}: ${value}`;

          return (
            <g key={`${point.key}-${valueKey}`}>
              <title>{tooltip}</title>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx={3} className={strokeClass} />
              {showLabel ? (
                <text x={padX + slotWidth * index + slotWidth / 2} y={height - 10} textAnchor="middle" className="report-chart-label">
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="report-chart-summary">
        <span>Range: {firstLabel} to {lastLabel}</span>
        <span>Peak: {moneyValues ? formatAud(maxValue) : maxValue}</span>
      </div>
    </div>
  );
}

function TrendPanel({ title, points, grain, dateFormat }: { title: string; points: TrendPoint[]; grain: TrendGrainKey; dateFormat: ReportDateFormat }) {
  return (
    <section className="admin-card report-chart-card">
      <div className="report-card-header-row">
        <h2>{title}</h2>
        <p className="helper-text">Appointments and net paid earnings trend</p>
      </div>
      <div className="report-trend-block">
        <div className="report-trend-title-row">
          <h3>Appointments</h3>
        </div>
        <MiniBarChart
          points={points}
          grain={grain}
          dateFormat={dateFormat}
          valueKey="appointments"
          strokeClass="report-bar report-bar-appointments"
          emptyLabel={`${title} appointments trend`}
        />
      </div>
      <div className="report-trend-block">
        <div className="report-trend-title-row">
          <h3>Earnings (net paid)</h3>
        </div>
        <MiniBarChart
          points={points}
          grain={grain}
          dateFormat={dateFormat}
          valueKey="earningsNetCents"
          strokeClass="report-bar report-bar-earnings"
          emptyLabel={`${title} earnings trend`}
          moneyValues
        />
      </div>
    </section>
  );
}

function PeriodCard({ period, dateFormat }: { period: PeriodReport; dateFormat: ReportDateFormat }) {
  const stats = useMemo(
    () => [
      { label: "Confirmed appointments", value: String(period.appointments.confirmedCount) },
      { label: "Cancelled appointments", value: String(period.appointments.cancelledCount) },
      { label: "Outstanding invoices", value: String(period.outstandingInvoices.count) },
      { label: "Outstanding total", value: formatAud(period.outstandingInvoices.totalCents) },
      { label: "Overdue invoices", value: String(period.outstandingInvoices.overdueCount) },
      { label: "Overdue total", value: formatAud(period.outstandingInvoices.overdueTotalCents) },
      { label: "Net paid earnings", value: formatAud(period.earnings.netPaidCents) },
      { label: "Paid documents", value: String(period.earnings.paidDocumentCount) },
      { label: "Invoice payments", value: formatAud(period.earnings.invoicePaidCents) },
      { label: "Credit notes", value: formatAud(period.earnings.creditNotePaidCents) }
    ],
    [period]
  );

  return (
    <section className="admin-card report-period-card">
      <div className="report-card-header-row">
        <h2>{periodTitle(period.key)} report</h2>
        <p className="helper-text">{formatPeriodLabel(period, dateFormat)}</p>
      </div>

      <div className="report-metric-grid">
        {stats.map((stat) => (
          <div key={`${period.key}-${stat.label}`} className="report-metric-cell">
            <p className="report-metric-label">{stat.label}</p>
            <p className="report-metric-value">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="report-comparison-panel">
        <div className="report-comparison-row">
          <span className="report-comparison-label">Compared with</span>
          <span>{formatPreviousLabel(period, dateFormat)}</span>
        </div>
        <div className="report-comparison-row">
          <span className="report-comparison-label">Appointments delta</span>
          <span className={`report-delta ${deltaClass(period.comparison.appointmentsDelta)}`}>
            {formatDelta(period.comparison.appointmentsDelta)}
          </span>
        </div>
        <div className="report-comparison-row">
          <span className="report-comparison-label">Earnings delta</span>
          <span className={`report-delta ${deltaClass(period.comparison.earningsDeltaCents)}`}>
            {formatAud(period.comparison.earningsDeltaCents)} ({formatPercent(period.comparison.earningsDeltaPercent)})
          </span>
        </div>
      </div>
    </section>
  );
}

function CustomRangeCard({ period, dateFormat }: { period: CustomRangeReport; dateFormat: ReportDateFormat }) {
  const stats = useMemo(
    () => [
      { label: "Confirmed appointments", value: String(period.appointments.confirmedCount) },
      { label: "Cancelled appointments", value: String(period.appointments.cancelledCount) },
      { label: "Outstanding invoices", value: String(period.outstandingInvoices.count) },
      { label: "Outstanding total", value: formatAud(period.outstandingInvoices.totalCents) },
      { label: "Overdue invoices", value: String(period.outstandingInvoices.overdueCount) },
      { label: "Overdue total", value: formatAud(period.outstandingInvoices.overdueTotalCents) },
      { label: "Net paid earnings", value: formatAud(period.earnings.netPaidCents) },
      { label: "Paid documents", value: String(period.earnings.paidDocumentCount) },
      { label: "Invoice payments", value: formatAud(period.earnings.invoicePaidCents) },
      { label: "Credit notes", value: formatAud(period.earnings.creditNotePaidCents) }
    ],
    [period]
  );

  const customLabel =
    dateFormat === "readable"
      ? `${formatDate(toMelbourneDate(period.start), dateFormat)} - ${formatDate(toMelbourneDate(period.end), dateFormat)}`
      : `${formatDate(toMelbourneDate(period.start), dateFormat)} - ${formatDate(toMelbourneDate(period.end), dateFormat)}`;

  return (
    <section className="admin-card report-period-card">
      <div className="report-card-header-row">
        <h2>Custom range report</h2>
        <p className="helper-text">{customLabel}</p>
      </div>

      <div className="report-metric-grid">
        {stats.map((stat) => (
          <div key={`custom-${stat.label}`} className="report-metric-cell">
            <p className="report-metric-label">{stat.label}</p>
            <p className="report-metric-value">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="report-comparison-panel">
        <div className="report-comparison-row">
          <span className="report-comparison-label">Compared with</span>
          <span>{formatPreviousLabel(period, dateFormat)}</span>
        </div>
        <div className="report-comparison-row">
          <span className="report-comparison-label">Appointments delta</span>
          <span className={`report-delta ${deltaClass(period.comparison.appointmentsDelta)}`}>
            {formatDelta(period.comparison.appointmentsDelta)}
          </span>
        </div>
        <div className="report-comparison-row">
          <span className="report-comparison-label">Earnings delta</span>
          <span className={`report-delta ${deltaClass(period.comparison.earningsDeltaCents)}`}>
            {formatAud(period.comparison.earningsDeltaCents)} ({formatPercent(period.comparison.earningsDeltaPercent)})
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Admin reports dashboard client for operational snapshots and trend charts.
 */
export function AdminReportsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dashboard, setDashboard] = useState<AdminReportsDashboard | null>(null);
  const [dateFormat, setDateFormat] = useState<ReportDateFormat>("readable");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [sendingReportPeriod, setSendingReportPeriod] = useState<"daily" | "monthly" | "yearly" | null>(null);
  const [visibleComparisons, setVisibleComparisons] = useState<Record<TrendGrainKey, boolean>>({
    daily: true,
    weekly: true,
    monthly: true,
    yearly: true
  });

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  async function load(mode: "initial" | "refresh" = "initial", customRange?: { start: string; end: string } | null) {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError("");

    try {
      const params = new URLSearchParams();
      const activeRange =
        customRange === undefined
          ? rangeStart && rangeEnd
            ? { start: rangeStart, end: rangeEnd }
            : null
          : customRange;
      if (activeRange) {
        params.set("start", activeRange.start);
        params.set("end", activeRange.end);
      }

      const response = await fetch(`/api/admin/reports${params.size ? `?${params.toString()}` : ""}`, {
        method: "GET",
        cache: "no-store"
      });
      const body = await readJsonSafe<AdminReportsResponse>(response);

      if (response.status === 401) {
        router.push("/admin/login");
        router.refresh();
        return;
      }

      if (!response.ok || !body?.periods || !body?.trends) {
        setError(body?.error || "Unable to load reports.");
        return;
      }

      setDashboard({ generatedAt: body.generatedAt, periods: body.periods, trends: body.trends });
    } catch {
      setError("Unable to load reports.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCustomRange() {
    setNotice("");
    if (!rangeStart || !rangeEnd) {
      setError("Select both start and end dates to apply a custom report range.");
      return;
    }
    if (rangeStart > rangeEnd) {
      setError("Start date must be on or before end date.");
      return;
    }
    void load("refresh", { start: rangeStart, end: rangeEnd });
  }

  function clearCustomRange() {
    setNotice("");
    setRangeStart("");
    setRangeEnd("");
    void load("refresh", null);
  }

  async function sendReportEmail(period: "daily" | "monthly" | "yearly") {
    setError("");
    setNotice("");
    setSendingReportPeriod(period);
    try {
      const response = await fetch("/api/admin/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period })
      });
      const body = (await readJsonSafe<{ error?: string; deliveryStatus?: string }>(response)) || null;

      if (response.status === 401) {
        router.push("/admin/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(body?.error || "Unable to send report email.");
        return;
      }

      const label = period === "daily" ? "today" : period === "monthly" ? "month" : "yearly";
      setNotice(
        `Sent ${label} report email to owner (${body?.deliveryStatus === "queued_no_smtp" ? "queued (email delivery not configured/live)" : "sent"}).`
      );
    } catch {
      setError("Unable to send report email.");
    } finally {
      setSendingReportPeriod(null);
    }
  }

  const visibleTrendKeys = useMemo(
    () => (Object.entries(visibleComparisons).filter(([, on]) => on).map(([key]) => key) as TrendGrainKey[]),
    [visibleComparisons]
  );

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Reports Console</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/bookings")}>Bookings</button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/invoices")}>Invoices</button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/manual")}>Manual</button>
          <AdminDeployUpdatesButton />
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/settings")}>Settings</button>
          <button className="btn btn-secondary" type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </div>

      <div className="admin-card report-toolbar-card">
        <div>
          <p className="helper-text report-toolbar-title">Daily, weekly, monthly and yearly operational reporting</p>
          <p className="helper-text">
            Includes appointment activity, outstanding invoices, paid earnings and comparisons to previous periods.
          </p>
        </div>
        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing}>
            {refreshing ? "Refreshing..." : "Refresh reports"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void sendReportEmail("daily")}
            disabled={loading || refreshing || sendingReportPeriod !== null}
          >
            {sendingReportPeriod === "daily" ? "Sending Today..." : "Send Today Report"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void sendReportEmail("monthly")}
            disabled={loading || refreshing || sendingReportPeriod !== null}
          >
            {sendingReportPeriod === "monthly" ? "Sending Month..." : "Send Month Report"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void sendReportEmail("yearly")}
            disabled={loading || refreshing || sendingReportPeriod !== null}
          >
            {sendingReportPeriod === "yearly" ? "Sending Year..." : "Send Year Report"}
          </button>
        </div>
      </div>

      <div className="admin-card report-controls-card">
        <div className="field report-format-field">
          <label>Date format</label>
          <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as ReportDateFormat)}>
            <option value="readable">Readable (e.g. 25 Feb 2026)</option>
            <option value="ddmmyy">DD/MM/YY</option>
          </select>
        </div>
        <div className="field report-compare-field report-custom-range-field">
          <label>Custom date range (admin)</label>
          <div className="report-date-range-row">
            <div className="field">
              <label>Start</label>
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </div>
            <div className="field">
              <label>End</label>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart || undefined}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </div>
            <div className="button-row report-date-range-actions">
              <button className="btn btn-secondary" type="button" onClick={applyCustomRange} disabled={loading || refreshing}>
                Apply Range
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearCustomRange} disabled={loading || refreshing || (!rangeStart && !rangeEnd)}>
                Clear Range
              </button>
            </div>
          </div>
          <p className="helper-text">
            Adds a custom range summary card while keeping the standard daily/weekly/monthly/yearly reports below.
          </p>
        </div>
        <div className="field report-compare-field report-compare-toggle-field">
          <label>Compare views (admin)</label>
          <div className="report-toggle-group">
            {(["daily", "weekly", "monthly", "yearly"] as TrendGrainKey[]).map((key) => (
              <label key={key} className="report-toggle-pill">
                <input
                  type="checkbox"
                  checked={visibleComparisons[key]}
                  onChange={(event) =>
                    setVisibleComparisons((prev) => ({
                      ...prev,
                      [key]: event.target.checked
                    }))
                  }
                />
                {periodTitle(key)}
              </label>
            ))}
          </div>
          <p className="helper-text">Toggle daily / weekly / monthly / yearly charts to compare periods side-by-side in admin.</p>
        </div>
      </div>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}
      {loading ? <p className="notice">Loading reports...</p> : null}

      {dashboard ? (
        <>
          <div className="admin-card report-generated-card">
            <p className="helper-text">Generated at {formatGeneratedAt(dashboard.generatedAt, dateFormat)} (Australia/Melbourne)</p>
          </div>

          {dashboard.customRange ? (
            <div className="reports-period-grid">
              <CustomRangeCard period={dashboard.customRange} dateFormat={dateFormat} />
            </div>
          ) : null}

          <div className="reports-period-grid reports-period-grid-4">
            <PeriodCard period={dashboard.periods.daily} dateFormat={dateFormat} />
            <PeriodCard period={dashboard.periods.weekly} dateFormat={dateFormat} />
            <PeriodCard period={dashboard.periods.monthly} dateFormat={dateFormat} />
            <PeriodCard period={dashboard.periods.yearly} dateFormat={dateFormat} />
          </div>

          <div className="reports-chart-grid">
            {visibleTrendKeys.length === 0 ? <p className="notice">Select at least one comparison view to display charts.</p> : null}
            {visibleTrendKeys.map((key) => (
              <TrendPanel
                key={key}
                title={trendTitle(key, !!dashboard.customRange)}
                points={dashboard.trends[key]}
                grain={key}
                dateFormat={dateFormat}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
