import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportTrendChart, type ReportChartStyle, type TrendPoint } from "@/components/admin/reports/report-trend-chart";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const points: TrendPoint[] = [
  {
    key: "2026-03-01",
    label: "1 Mar",
    appointments: 3,
    earningsNetCents: 12000
  },
  {
    key: "2026-03-02",
    label: "2 Mar",
    appointments: 5,
    earningsNetCents: 16000
  },
  {
    key: "2026-03-03",
    label: "3 Mar",
    appointments: 2,
    earningsNetCents: 9000
  }
];

function renderChart(chartStyle: ReportChartStyle, chartPoints: TrendPoint[] = points): string {
  return renderToStaticMarkup(
    createElement(ReportTrendChart, {
      points: chartPoints,
      grain: "daily",
      dateFormat: "readable",
      valueKey: "appointments",
      strokeClass: "report-bar report-bar-appointments",
      chartStyle,
      emptyLabel: "Appointments trend"
    })
  );
}

describe("admin-report-chart", () => {
  it("renders bar charts with bars only", () => {
    const markup = renderChart("bar");

    expect(markup).toContain("<rect");
    expect(markup).not.toContain("report-line-stroke");
    expect(markup).not.toContain("report-step-stroke");
    expect(markup).not.toContain("report-lollipop-stem");
  });

  it("renders line charts with a line path and point markers", () => {
    const markup = renderChart("line");

    expect(markup).toContain("report-line-stroke");
    expect(markup).toContain("report-line-point");
    expect(markup).not.toContain("<rect");
    expect(markup).not.toContain("report-area-fill");
  });

  it("renders area charts with a filled area and overlay line", () => {
    const markup = renderChart("area");

    expect(markup).toContain("report-area-fill");
    expect(markup).toContain("report-line-stroke");
  });

  it("renders step charts with stepped segments and step markers", () => {
    const markup = renderChart("step");

    expect(markup).toContain("report-step-stroke");
    expect(markup).toContain("report-step-point");
    expect(markup).toContain(" H ");
    expect(markup).toContain(" V ");
    expect(markup).not.toContain("report-line-stroke");
  });

  it("renders lollipop charts with stems and heads", () => {
    const markup = renderChart("lollipop");

    expect(markup).toContain("report-lollipop-stem");
    expect(markup).toContain("report-lollipop-head");
    expect(markup).not.toContain("<rect");
    expect(markup).not.toContain("report-line-point");
  });

  it("renders the empty state when there are no trend points", () => {
    const markup = renderChart("step", []);

    expect(markup).toContain("report-chart-empty");
    expect(markup).toContain("Appointments trend");
  });
});
