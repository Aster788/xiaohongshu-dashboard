import type { ContentInsightDTO } from "@/lib/dashboard/types";

export function ContentInsightsPanel({
  insights,
}: {
  insights: ContentInsightDTO[];
}) {
  if (insights.length === 0) {
    return <p className="empty-hint">No insight data yet.</p>;
  }

  return (
    <div
      className="insights-list insights-list-title-aligned"
      aria-label="Content attractiveness insights"
    >
      {insights.map((insight) => (
        <article key={insight.id} className="insight-card">
          <div className="insight-card-head">
            <h3>{insight.title}</h3>
          </div>
          <p>{insight.supportingData}</p>
        </article>
      ))}
    </div>
  );
}
