"use client";
import { APP_TIMEZONE } from "@/lib/time";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import {
  ReportTrendChart,
  type ReportChartStyle,
  type ReportDateFormat,
  type TrendGrainKey,
  type TrendPoint
} from "@/components/admin/reports/report-trend-chart";
import { Tooltip } from "@/components/admin/ui/tooltip";

type ReportPeriodKey = "daily" | "weekly" | "monthly" | "yearly";

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

/**
 * Parses JSON only when the backend actually returned JSON.
 *
 * RATIONALE: Admin routes can fail behind auth middleware or dev-server HTML
 * overlays. Returning `null` here keeps the dashboard on a predictable error
 * path instead of throwing a secondary JSON parse exception.
 */
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
    timeZone: APP_TIMEZONE
  }).format(date);
}

/** Formats a UTC-ish payload date using the application's Melbourne timezone. */
function toMelbourneDate(value: string): Date {
  return new Date(new Date(value).toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
}

/**
 * Builds the period card label while preserving the backend's canonical window
 * boundaries instead of recomputing them in the client.
 */
function formatPeriodLabel(period: PeriodReport, mode: ReportDateFormat): string {
  const start = toMelbourneDate(period.start);
  const end = toMelbourneDate(period.end);

  if (mode === "readable") {
    if (period.key === "daily") return `Today (${formatDate(start, mode)})`;
    if (period.key === "weekly") return `This week (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
    if (period.key === "monthly") {
      return `This month (${new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: APP_TIMEZONE }).format(start)})`;
    }
    return `This year (${start.getFullYear()})`;
  }

  if (period.key === "daily") return `Today (${formatDate(start, mode)})`;
  if (period.key === "weekly") return `This week (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  if (period.key === "monthly") return `This month (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
  return `This year (${formatDate(start, mode)} - ${formatDate(end, mode)})`;
}

/** Rewrites the previous-period label for compact date mode when needed. */
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

/** Splits labels like "Previous week (1 Jan - 7 Jan)" into displayable parts. */
function splitComparisonLabel(label: string): { primary: string; secondary?: string } {
  const openParenIndex = label.indexOf("(");
  const closeParenIndex = label.lastIndexOf(")");
  if (openParenIndex > 0 && closeParenIndex > openParenIndex) {
    return {
      primary: label.slice(0, openParenIndex).trim(),
      secondary: label.slice(openParenIndex, closeParenIndex + 1).trim()
    };
  }
  return { primary: label };
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

/** Shared chart card for one grain of report comparison data. */
function TrendPanel({
  title,
  points,
  grain,
  dateFormat,
  chartStyle
}: {
  title: string;
  points: TrendPoint[];
  grain: TrendGrainKey;
  dateFormat: ReportDateFormat;
  chartStyle: ReportChartStyle;
}) {
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
        <ReportTrendChart
          points={points}
          grain={grain}
          dateFormat={dateFormat}
          valueKey="appointments"
          strokeClass="report-bar report-bar-appointments"
          chartStyle={chartStyle}
          emptyLabel={`${title} appointments trend`}
        />
      </div>
      <div className="report-trend-block">
        <div className="report-trend-title-row">
          <h3>Earnings (net paid)</h3>
        </div>
        <ReportTrendChart
          points={points}
          grain={grain}
          dateFormat={dateFormat}
          valueKey="earningsNetCents"
          strokeClass="report-bar report-bar-earnings"
          chartStyle={chartStyle}
          emptyLabel={`${title} earnings trend`}
          moneyValues
        />
      </div>
    </section>
  );
}

/** Snapshot card for the fixed daily/weekly/monthly/yearly report windows. */
function PeriodCard({ period, dateFormat }: { period: PeriodReport; dateFormat: ReportDateFormat }) {
  const previousPeriodLabel = splitComparisonLabel(formatPreviousLabel(period, dateFormat));
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
          <span className="report-comparison-value">
            <span>{previousPeriodLabel.primary}</span>
            {previousPeriodLabel.secondary ? <span className="report-comparison-subvalue">{previousPeriodLabel.secondary}</span> : null}
          </span>
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

/** Summary card for the optional admin-selected custom reporting window. */
function CustomRangeCard({ period, dateFormat }: { period: CustomRangeReport; dateFormat: ReportDateFormat }) {
  const previousPeriodLabel = splitComparisonLabel(formatPreviousLabel(period, dateFormat));
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
          <span className="report-comparison-value">
            <span>{previousPeriodLabel.primary}</span>
            {previousPeriodLabel.secondary ? <span className="report-comparison-subvalue">{previousPeriodLabel.secondary}</span> : null}
          </span>
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
export function AdminReportsClient(): ReactElement {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dashboard, setDashboard] = useState<AdminReportsDashboard | null>(null);
  const [dateFormat, setDateFormat] = useState<ReportDateFormat>("readable");
  const [chartStyle, setChartStyle] = useState<ReportChartStyle>("bar");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [sendingReportPeriod, setSendingReportPeriod] = useState<"daily" | "monthly" | "yearly" | null>(null);
  const [visibleComparisons, setVisibleComparisons] = useState<Record<TrendGrainKey, boolean>>({
    daily: true,
    weekly: true,
    monthly: true,
    yearly: true
  });

  /**
   * Loads the reports dashboard and optionally overlays a custom date window.
   *
   * RATIONALE: "initial" and "refresh" loading states are split so the page can
   * stay interactive during explicit refreshes instead of dropping back to a
   * full-screen loading shell every time an admin tweaks filters.
   */
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
        // NOTE: The backend owns custom range aggregation. The client only
        // forwards raw ISO date inputs and renders whatever summary comes back.
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

      setDashboard({
        generatedAt: body.generatedAt,
        periods: body.periods,
        trends: body.trends,
        ...(body.customRange ? { customRange: body.customRange } : {})
      });
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

  /**
   * Triggers owner-facing report delivery for one of the pre-defined summary
   * periods exposed by the backend.
   */
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
    // RATIONALE: We derive the list once so chart rendering stays ordered and
    // the JSX below does not repeat checkbox-state filtering work on every pass.
    () => (Object.entries(visibleComparisons).filter(([, on]) => on).map(([key]) => key) as TrendGrainKey[]),
    [visibleComparisons]
  );

  return (
    <AdminShell title="Reports Console" error={error} notice={notice} loading={loading} className="admin-shell-reports">
      <div className="admin-layout-content report-layout-content">
        <div className="admin-card admin-toolbar-card report-toolbar-card">
          <div>
            <p className="helper-text report-toolbar-title">Daily, weekly, monthly and yearly operational reporting</p>
            <p className="helper-text">
              Includes appointment activity, outstanding invoices, paid earnings and comparisons to previous periods.
            </p>
          </div>
          <div className="button-row">
            <Tooltip content="Reload dashboard figures and chart data immediately.">
              <button className="btn btn-secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing}>
                {refreshing ? "Refreshing..." : "Refresh reports"}
              </button>
            </Tooltip>
            <Tooltip content="Email the latest daily report to the owner account.">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void sendReportEmail("daily")}
                disabled={loading || refreshing || sendingReportPeriod !== null}
              >
                {sendingReportPeriod === "daily" ? "Sending Today..." : "Send Today Report"}
              </button>
            </Tooltip>
            <Tooltip content="Email the latest monthly summary to the owner account.">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void sendReportEmail("monthly")}
                disabled={loading || refreshing || sendingReportPeriod !== null}
              >
                {sendingReportPeriod === "monthly" ? "Sending Month..." : "Send Month Report"}
              </button>
            </Tooltip>
            <Tooltip content="Email the yearly summary to the owner account.">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void sendReportEmail("yearly")}
                disabled={loading || refreshing || sendingReportPeriod !== null}
              >
                {sendingReportPeriod === "yearly" ? "Sending Year..." : "Send Year Report"}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="admin-card admin-toolbar-card report-controls-card">
          <div className="report-controls-primary">
            <div className="field report-format-field">
              <label>Date format</label>
              <Tooltip content="Switch between human-readable dates and compact DD/MM/YY format.">
                <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as ReportDateFormat)}>
                  <option value="readable">Readable (e.g. 25 Feb 2026)</option>
                  <option value="ddmmyy">DD/MM/YY</option>
                </select>
              </Tooltip>
            </div>
            <div className="field report-chart-style-field">
              <label>Chart type</label>
              <Tooltip content="Choose bar, line, area, step, or lollipop style for trend visualisation.">
                <select value={chartStyle} onChange={(event) => setChartStyle(event.target.value as ReportChartStyle)}>
                  <option value="bar">Bar charts</option>
                  <option value="line">Line charts</option>
                  <option value="area">Area charts</option>
                  <option value="step">Step charts</option>
                  <option value="lollipop">Lollipop charts</option>
                </select>
              </Tooltip>
            </div>
          </div>
          <div className="field report-compare-field report-custom-range-field">
            <div className="report-custom-range-head">
              <label>Custom date range (admin)</label>
            </div>
            <div className="report-date-range-row">
              <div className="report-date-field">
                <label>Start</label>
                <Tooltip content="Pick the first day for a custom report window.">
                  <input
                    type="date"
                    aria-label="Custom range start date"
                    value={rangeStart}
                    max={rangeEnd || undefined}
                    onChange={(event) => setRangeStart(event.target.value)}
                  />
                </Tooltip>
              </div>
              <div className="report-date-field">
                <label>End</label>
                <Tooltip content="Pick the last day for a custom report window.">
                  <input
                    type="date"
                    aria-label="Custom range end date"
                    value={rangeEnd}
                    min={rangeStart || undefined}
                    onChange={(event) => setRangeEnd(event.target.value)}
                  />
                </Tooltip>
              </div>
              <div className="button-row report-date-range-actions">
                <Tooltip content="Build a custom summary while keeping daily/weekly/monthly/yearly cards below.">
                  <button className="btn btn-secondary" type="button" onClick={applyCustomRange} disabled={loading || refreshing}>
                    Apply Range
                  </button>
                </Tooltip>
                <Tooltip content="Remove the custom range and return to standard report windows only.">
                  <button className="btn btn-secondary" type="button" onClick={clearCustomRange} disabled={loading || refreshing || (!rangeStart && !rangeEnd)}>
                    Clear Range
                  </button>
                </Tooltip>
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
                <Tooltip key={key} content={`Show or hide the ${periodTitle(key).toLowerCase()} trend panel below.`}>
                  <label className="report-toggle-pill">
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
                </Tooltip>
              ))}
            </div>
            <p className="helper-text">Toggle daily / weekly / monthly / yearly charts to compare periods side-by-side in admin.</p>
          </div>
        </div>

        {dashboard ? (
          <>
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
                  chartStyle={chartStyle}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
