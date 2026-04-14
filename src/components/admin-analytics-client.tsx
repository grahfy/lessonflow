"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type { AnalyticsPeriodKey, AnalyticsTrendPoint } from "@/lib/analytics-dashboard";

// --- Types mirroring the API response shape ---

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

type AnalyticsDashboardResponse = {
  generatedAt: string;
  periods: Record<AnalyticsPeriodKey, PeriodSummary>;
  trends: Record<AnalyticsPeriodKey, AnalyticsTrendPoint[]>;
  topPages: RankedItem[];
  topReferrers: RankedItem[];
  topCountries: RankedItem[];
  deviceBreakdown: RankedItem[];
  error?: string;
};

// --- Utility functions ---

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  return (await response.json().catch(() => null)) as T | null;
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

function periodTitle(key: AnalyticsPeriodKey): string {
  if (key === "hourly") return "Hourly";
  if (key === "daily") return "Daily";
  if (key === "weekly") return "Weekly";
  if (key === "monthly") return "Monthly";
  return "Yearly";
}

function periodShortLabel(key: AnalyticsPeriodKey): string {
  if (key === "hourly") return "This hour";
  if (key === "daily") return "Today";
  if (key === "weekly") return "This week";
  if (key === "monthly") return "This month";
  return "This year";
}

function trendTitle(key: AnalyticsPeriodKey): string {
  if (key === "hourly") return "Hourly trend (last 24 hours)";
  if (key === "daily") return "Daily trend (last 14 days)";
  if (key === "weekly") return "Weekly trend (last 8 weeks)";
  if (key === "monthly") return "Monthly trend (last 12 months)";
  return "Yearly trend (last 6 years)";
}

function deltaArrow(value: number): string {
  if (value > 0) return "\u2197"; // ↗
  if (value < 0) return "\u2198"; // ↘
  return "\u2192"; // →
}

// --- SVG Trend Chart (adapted from ReportTrendChart for analytics) ---

type ChartStyle = "bar" | "line" | "area" | "step" | "lollipop";

function buildLinePath(coords: Array<{ x: number; y: number }>): string {
  return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
}

function buildStepPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return "";
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    path += ` H ${coords[i].x} V ${coords[i].y}`;
  }
  return path;
}

/** Decorative SVG placeholder shown when the chart has no data. */
function EmptyChartPlaceholder(): ReactElement {
  const width = 560;
  const height = 188;
  const padX = 14;
  const bottom = 34;
  const top = 14;

  // Generate faded placeholder bars at random heights
  const barCount = 14;
  const slotWidth = (width - padX * 2) / barCount;
  const barWidth = Math.max(6, Math.min(24, slotWidth * 0.56));
  const chartHeight = height - top - bottom;
  const placeholderHeights = [0.15, 0.25, 0.18, 0.35, 0.3, 0.22, 0.4, 0.32, 0.28, 0.2, 0.38, 0.25, 0.33, 0.18];

  return (
    <div className="analytics-empty-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-empty-chart-svg" role="img" aria-label="No chart data yet">
        {/* Faded grid lines */}
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            y1={height - bottom - chartHeight * ratio}
            x2={width - padX}
            y2={height - bottom - chartHeight * ratio}
            className="analytics-empty-grid-line"
          />
        ))}
        {/* Axis */}
        <line x1={padX} y1={height - bottom} x2={width - padX} y2={height - bottom} className="analytics-empty-axis" />
        {/* Ghost bars */}
        {placeholderHeights.map((h, i) => {
          const barX = padX + slotWidth * i + (slotWidth - barWidth) / 2;
          const barH = chartHeight * h;
          const barY = height - bottom - barH;
          return (
            <rect
              key={i}
              x={barX}
              y={barY}
              width={barWidth}
              height={barH}
              rx={3}
              className="analytics-empty-bar"
            />
          );
        })}
      </svg>
      <p className="analytics-empty-chart-message">
        Data will appear as visitors browse your public pages.
      </p>
    </div>
  );
}

function AnalyticsTrendChart({
  points,
  chartStyle,
  emptyLabel
}: {
  points: AnalyticsTrendPoint[];
  chartStyle: ChartStyle;
  emptyLabel: string;
}): ReactElement {
  const width = 560;
  const height = 188;
  const padX = 14;
  const top = 14;
  const bottom = 34;
  const chartHeight = height - top - bottom;

  const allZero = points.length > 0 && points.every((p) => p.views === 0);

  if (points.length === 0 || allZero) {
    return <EmptyChartPlaceholder />;
  }

  const values = points.map((p) => p.views);
  const maxValue = Math.max(...values, 1);
  const slotWidth = (width - padX * 2) / points.length;
  const barWidth = Math.max(6, Math.min(24, slotWidth * 0.56));
  const labelStep = points.length > 10 ? Math.ceil(points.length / 6) : 1;
  const firstLabel = points[0].label;
  const lastLabel = points[points.length - 1].label;

  const coords = points.map((point, index) => {
    const normalized = maxValue <= 0 ? 0 : Math.max(0, point.views) / maxValue;
    const barHeight = normalized * chartHeight;
    const x = padX + slotWidth * index + slotWidth / 2;
    const y = height - bottom - barHeight;
    return { point, x, y, value: point.views, label: point.label };
  });

  const linePath = buildLinePath(coords);
  const stepPath = buildStepPath(coords);
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x} ${height - bottom} L ${coords[0].x} ${height - bottom} Z`
    : "";

  const strokeClass = "analytics-bar analytics-bar-views";

  return (
    <div className="report-chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="report-chart-svg analytics-chart-svg" role="img" aria-label={emptyLabel}>
        <line x1={padX} y1={height - bottom} x2={width - padX} y2={height - bottom} className="report-chart-axis" />
        {chartStyle === "area" && areaPath ? <path d={areaPath} className={`${strokeClass} report-area-fill`} /> : null}
        {(chartStyle === "line" || chartStyle === "area") && linePath ? (
          <path d={linePath} className={`${strokeClass} report-line-stroke`} />
        ) : null}
        {chartStyle === "step" && stepPath ? <path d={stepPath} className={`${strokeClass} report-step-stroke`} /> : null}
        {coords.map((entry, index) => {
          const barX = padX + slotWidth * index + (slotWidth - barWidth) / 2;
          const barY = entry.y;
          const barH = height - bottom - entry.y;
          const showLabel = index % labelStep === 0 || index === points.length - 1;
          const tooltip = `${entry.label}: ${entry.value} views`;

          return (
            <g key={entry.point.key}>
              <title>{tooltip}</title>
              {chartStyle === "bar" ? (
                <rect x={barX} y={barY} width={barWidth} height={Math.max(barH, 2)} rx={3} className={strokeClass} />
              ) : null}
              {chartStyle === "lollipop" ? (
                <>
                  <line x1={entry.x} y1={height - bottom} x2={entry.x} y2={entry.y} className={`${strokeClass} report-lollipop-stem`} />
                  <circle cx={entry.x} cy={entry.y} r={5} className={`${strokeClass} report-lollipop-head`} />
                </>
              ) : null}
              {chartStyle !== "bar" && chartStyle !== "lollipop" ? (
                <circle cx={entry.x} cy={entry.y} r={3} className={`${strokeClass} ${chartStyle === "step" ? "report-step-point" : "report-line-point"}`} />
              ) : null}
              {showLabel ? (
                <text x={entry.x} y={height - 10} textAnchor="middle" className="report-chart-label">
                  {entry.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="report-chart-summary">
        <span>Range: {firstLabel} to {lastLabel}</span>
        <span>Peak: {maxValue} views</span>
      </div>
    </div>
  );
}

// --- Horizontal Bar List (for top pages, referrers, countries) ---

/** Decorative placeholder shown when a ranked list has no data. */
function EmptyBarPlaceholder({ label }: { label: string }) {
  return (
    <div className="analytics-ranked-list">
      <h3>{label}</h3>
      <div className="analytics-ranked-empty">
        {[0.85, 0.6, 0.4, 0.25].map((w, i) => (
          <div key={i} className="analytics-ranked-empty-row">
            <div className="analytics-ranked-empty-label" style={{ width: `${40 + i * 8}%` }} />
            <div className="analytics-ranked-bar-track">
              <div className="analytics-ranked-empty-bar" style={{ width: `${w * 100}%` }} />
            </div>
          </div>
        ))}
        <p className="analytics-empty-hint">Waiting for visitor data</p>
      </div>
    </div>
  );
}

function RankedBarList({ items, label }: { items: RankedItem[]; label: string }) {
  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;
  const total = items.reduce((sum, i) => sum + i.count, 0);

  if (items.length === 0) {
    return <EmptyBarPlaceholder label={label} />;
  }

  return (
    <div className="analytics-ranked-list">
      <h3>{label}</h3>
      <div className="analytics-ranked-items">
        {items.map((item) => {
          const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const barWidth = maxCount > 0 ? Math.max(2, (item.count / maxCount) * 100) : 0;
          return (
            <div key={item.name} className="analytics-ranked-row">
              <div className="analytics-ranked-label">
                <span className="analytics-ranked-name">{item.name}</span>
                <span className="analytics-ranked-count">{item.count} ({percent}%)</span>
              </div>
              <div className="analytics-ranked-bar-track">
                <div className="analytics-ranked-bar-fill" style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Period Summary Card ---

const PERIOD_ACCENT: Record<AnalyticsPeriodKey, string> = {
  hourly: "accent-lime",
  daily: "accent-teal",
  weekly: "accent-cyan",
  monthly: "accent-violet",
  yearly: "accent-amber"
};

function PeriodCard({ period }: { period: PeriodSummary }) {
  const periodKey = period.key as AnalyticsPeriodKey;
  const accent = PERIOD_ACCENT[periodKey] || "accent-teal";

  return (
    <div className={`analytics-period-card ${accent}`}>
      <div className="analytics-period-header">
        <span className="analytics-period-short">{periodShortLabel(periodKey)}</span>
      </div>
      <div className="analytics-period-value">{period.totalViews.toLocaleString()}</div>
      <div className="analytics-period-sublabel">page views</div>
      <div className={`analytics-period-delta-row ${deltaClass(period.comparison.delta)}`}>
        <span className="analytics-period-arrow">{deltaArrow(period.comparison.delta)}</span>
        <span className="analytics-period-delta-text">
          {formatDelta(period.comparison.delta)} ({formatPercent(period.comparison.deltaPercent)})
        </span>
      </div>
      <div className="analytics-period-prev">{period.comparison.previousLabel}</div>
    </div>
  );
}

// --- Main Dashboard ---

export function AdminAnalyticsClient(): ReactElement {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<AnalyticsDashboardResponse | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bar");
  const [activeTrend, setActiveTrend] = useState<AnalyticsPeriodKey>("daily");

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/analytics", {
        method: "GET",
        cache: "no-store"
      });
      const body = await readJsonSafe<AnalyticsDashboardResponse>(response);

      if (response.status === 401) {
        router.push("/admin/login");
        router.refresh();
        return;
      }

      if (!response.ok || !body?.periods || !body?.trends) {
        setError(body?.error || "Unable to load analytics.");
        return;
      }

      setDashboard(body);
    } catch {
      setError("Unable to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTrendPoints = useMemo(
    () => dashboard?.trends[activeTrend] ?? [],
    [dashboard, activeTrend]
  );

  return (
    <AdminShell title="Site Analytics" error={error} loading={loading} className="admin-shell-analytics">
      <div className="admin-layout-content analytics-layout-content">

        {/* Toolbar — controls integrated into actions area */}
        <div className="admin-card admin-toolbar-card analytics-toolbar-card admin-workspace-panel">
          <div className="admin-workspace-head">
            <div className="admin-workspace-copy">
              <h2 className="admin-workspace-title">Website Analytics</h2>
              <p className="helper-text admin-workspace-summary">
                Public page traffic, visitor geography, and referral sources. Privacy-friendly — no cookies, no PII.
              </p>
              <div className="admin-workspace-chip-row" aria-label="Analytics workspace context">
                <span className="admin-workspace-chip">{periodTitle(activeTrend)} trend</span>
                {dashboard ? <span className="admin-workspace-chip">{dashboard.periods.monthly.totalViews.toLocaleString()} views this month</span> : null}
              </div>
            </div>
            <div className="admin-workspace-actions analytics-toolbar-actions">
              <div className="analytics-toolbar-controls">
                <Tooltip content="Switch the trend chart between hourly, daily, weekly, monthly, and yearly views.">
                  <select value={activeTrend} onChange={(e) => setActiveTrend(e.target.value as AnalyticsPeriodKey)} className="analytics-toolbar-select">
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </Tooltip>
                <Tooltip content="Choose bar, line, area, step, or lollipop style.">
                  <select value={chartStyle} onChange={(e) => setChartStyle(e.target.value as ChartStyle)} className="analytics-toolbar-select">
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="area">Area</option>
                    <option value="step">Step</option>
                    <option value="lollipop">Lollipop</option>
                  </select>
                </Tooltip>
              </div>
              <Tooltip content="Reload analytics data.">
                <button className="btn btn-secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing}>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {dashboard ? (
          <>
            {/* Period summary cards */}
            <div className="analytics-period-grid">
              <PeriodCard period={dashboard.periods.hourly} />
              <PeriodCard period={dashboard.periods.daily} />
              <PeriodCard period={dashboard.periods.weekly} />
              <PeriodCard period={dashboard.periods.monthly} />
              <PeriodCard period={dashboard.periods.yearly} />
            </div>

            {/* Trend chart */}
            <section className="admin-card analytics-chart-card">
              <div className="report-card-header-row">
                <h2>{trendTitle(activeTrend)}</h2>
                <p className="helper-text">Page views over time</p>
              </div>
              <AnalyticsTrendChart
                points={activeTrendPoints}
                chartStyle={chartStyle}
                emptyLabel={`${trendTitle(activeTrend)} page views`}
              />
            </section>

            {/* Top pages + Top referrers */}
            <div className="analytics-breakdown-grid">
              <section className="admin-card analytics-breakdown-card">
                <RankedBarList items={dashboard.topPages} label="Top pages (this month)" />
              </section>
              <section className="admin-card analytics-breakdown-card">
                <RankedBarList items={dashboard.topReferrers} label="Top referrers (this month)" />
              </section>
            </div>

            {/* Top countries + Device breakdown */}
            <div className="analytics-breakdown-grid">
              <section className="admin-card analytics-breakdown-card">
                <RankedBarList items={dashboard.topCountries} label="Top countries (this month)" />
              </section>
              <section className="admin-card analytics-breakdown-card">
                <RankedBarList items={dashboard.deviceBreakdown} label="Device breakdown (this month)" />
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
