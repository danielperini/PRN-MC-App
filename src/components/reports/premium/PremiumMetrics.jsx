import React from 'react';
import { buildMetrics } from './premiumReportUtils';

export default function PremiumMetrics({ contexto }) {
  const metrics = buildMetrics(contexto);

  return (
    <div className="premium-metrics">
      {metrics.map((metric) => (
        <div className="premium-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </div>
      ))}
    </div>
  );
}
