type MetricCardProps = {
  label: string;
  value: string;
  trend: string;
  accent: 'purple' | 'green' | 'orange' | 'blue';
};

export function MetricCard({ label, value, trend, accent }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className={`metric-accent ${accent}`} />
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-trend">{trend}</div>
    </div>
  );
}
