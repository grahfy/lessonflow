import type { ReactElement } from "react";

export type TrendGrainKey = "daily" | "weekly" | "monthly" | "yearly";
export type ReportDateFormat = "readable" | "ddmmyy";
export type ReportChartStyle = "bar" | "line" | "area" | "step" | "lollipop";

export type TrendPoint = {
  key: string;
  label: string;
  appointments: number;
  earningsNetCents: number;
};

function formatAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function formatDate(date: Date, mode: ReportDateFormat): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  if (mode === "ddmmyy") {
    return `${day}/${month}/${year}`;
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium"
  }).format(date);
}

/** Converts the backend bucket key into a stable Date for compact axis labels. */
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

type ChartCoordinate = {
  point: TrendPoint;
  value: number;
  x: number;
  y: number;
  label: string;
};

function buildLinePath(entries: ChartCoordinate[]): string {
  return entries.map((entry, index) => `${index === 0 ? "M" : "L"} ${entry.x} ${entry.y}`).join(" ");
}

function buildStepPath(entries: ChartCoordinate[]): string {
  if (entries.length === 0) {
    return "";
  }

  let path = `M ${entries[0].x} ${entries[0].y}`;
  for (let index = 1; index < entries.length; index += 1) {
    const current = entries[index];
    path += ` H ${current.x} V ${current.y}`;
  }
  return path;
}

/** Renders one compact SVG trend chart in the selected display mode. */
export function ReportTrendChart({
  points,
  grain,
  dateFormat,
  valueKey,
  strokeClass,
  chartStyle,
  emptyLabel,
  moneyValues = false
}: {
  points: TrendPoint[];
  grain: TrendGrainKey;
  dateFormat: ReportDateFormat;
  valueKey: "appointments" | "earningsNetCents";
  strokeClass: string;
  chartStyle: ReportChartStyle;
  emptyLabel: string;
  moneyValues?: boolean;
}): ReactElement {
  const width = 560;
  const height = 188;
  const padX = 14;
  const top = 14;
  const bottom = 34;
  const chartHeight = height - top - bottom;

  if (points.length === 0) {
    return <p className="report-chart-empty">{emptyLabel}</p>;
  }

  const values = points.map((point) => point[valueKey]);
  const maxValue = Math.max(...values, 0);
  const slotWidth = (width - padX * 2) / points.length;
  const barWidth = Math.max(6, Math.min(24, slotWidth * 0.56));
  const labelStep = points.length > 10 ? Math.ceil(points.length / 6) : 1;
  const firstLabel = formatTrendLabel(points[0], grain, dateFormat);
  const lastLabel = formatTrendLabel(points[points.length - 1], grain, dateFormat);

  const pointsWithCoords = points.map((point, index) => {
    const value = point[valueKey];
    const normalized = maxValue <= 0 ? 0 : Math.max(0, value) / maxValue;
    const barHeight = normalized * chartHeight;
    const x = padX + slotWidth * index + slotWidth / 2;
    const y = height - bottom - barHeight;

    return {
      point,
      value,
      x,
      y,
      label: formatTrendLabel(point, grain, dateFormat)
    };
  });

  const linePath = buildLinePath(pointsWithCoords);
  const stepPath = buildStepPath(pointsWithCoords);
  const areaPath = pointsWithCoords.length
    ? `${linePath} L ${pointsWithCoords[pointsWithCoords.length - 1].x} ${height - bottom} L ${pointsWithCoords[0].x} ${height - bottom} Z`
    : "";

  return (
    <div className="report-chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="report-chart-svg" role="img" aria-label={emptyLabel}>
        <line x1={padX} y1={height - bottom} x2={width - padX} y2={height - bottom} className="report-chart-axis" />
        {chartStyle === "area" && areaPath ? <path d={areaPath} className={`${strokeClass} report-area-fill`} /> : null}
        {(chartStyle === "line" || chartStyle === "area") && linePath ? (
          <path d={linePath} className={`${strokeClass} report-line-stroke`} />
        ) : null}
        {chartStyle === "step" && stepPath ? <path d={stepPath} className={`${strokeClass} report-step-stroke`} /> : null}
        {pointsWithCoords.map((entry, index) => {
          const { point, value, x, y, label } = entry;
          const barX = padX + slotWidth * index + (slotWidth - barWidth) / 2;
          const barY = y;
          const barHeight = height - bottom - y;
          const showLabel = index % labelStep === 0 || index === points.length - 1;
          const tooltip = moneyValues ? `${label}: ${formatAud(value)}` : `${label}: ${value}`;

          return (
            <g key={`${point.key}-${valueKey}`}>
              <title>{tooltip}</title>
              {chartStyle === "bar" ? (
                <rect x={barX} y={barY} width={barWidth} height={Math.max(barHeight, 2)} rx={3} className={strokeClass} />
              ) : null}
              {chartStyle === "lollipop" ? (
                <>
                  <line x1={x} y1={height - bottom} x2={x} y2={y} className={`${strokeClass} report-lollipop-stem`} />
                  <circle cx={x} cy={y} r={5} className={`${strokeClass} report-lollipop-head`} />
                </>
              ) : null}
              {chartStyle !== "bar" && chartStyle !== "lollipop" ? (
                <circle cx={x} cy={y} r={3} className={`${strokeClass} ${chartStyle === "step" ? "report-step-point" : "report-line-point"}`} />
              ) : null}
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
