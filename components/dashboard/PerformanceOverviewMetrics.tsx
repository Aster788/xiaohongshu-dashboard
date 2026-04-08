import type { PerformanceOverviewMetricDTO } from "@/lib/dashboard/types";

function formatMetricValue(metric: PerformanceOverviewMetricDTO): string {
  const value = metric.current;
  if (value == null) return "—";

  switch (metric.kind) {
    case "cover-ctr":
    case "profile-conv-rate":
      return `${Math.round(value)}%`;
    case "avg-watch-duration":
      return `${Math.round(value)}s`;
    case "net-followers": {
      const rounded = Math.round(value);
      const sign = rounded > 0 ? "+" : "";
      return `${sign}${rounded.toLocaleString("en-US")}`;
    }
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

function formatPctChange(metric: PerformanceOverviewMetricDTO): string {
  if (metric.pctChange == null) return "—";
  return `${Math.abs(Math.round(metric.pctChange))}%`;
}

function deltaIconForTrend(trend: PerformanceOverviewMetricDTO["trend"]): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "•";
}

function resolveComparisonDisplay(
  metric: PerformanceOverviewMetricDTO,
): { cardTrend: PerformanceOverviewMetricDTO["trend"]; icon: string; valueText: string } {
  if (metric.pctChange == null) {
    return { cardTrend: "flat", icon: "•", valueText: "—" };
  }

  return {
    cardTrend: metric.trend,
    icon: deltaIconForTrend(metric.trend),
    valueText: formatPctChange(metric),
  };
}

export function PerformanceOverviewMetrics({
  metrics,
}: {
  metrics: PerformanceOverviewMetricDTO[];
}) {
  return (
    <div className="performance-overview-grid" aria-label="Performance overview metrics">
      {metrics.map((metric) => {
        const cmp = resolveComparisonDisplay(metric);
        return (
          <article
            key={metric.kind}
            className={`performance-metric-card performance-metric-card-${cmp.cardTrend}`}
          >
            <div className="performance-metric-header">
              <div className="kpi-label">{metric.labelEn}</div>
              <div className="performance-metric-label-zh">{metric.labelZh}</div>
            </div>
            <div className="performance-metric-value">{formatMetricValue(metric)}</div>
            <div className="performance-metric-delta-row">
              <span className="performance-metric-delta-icon">{cmp.icon}</span>
              <span className="performance-metric-delta-value">{cmp.valueText}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
