import React from 'react';
import {
  fmtInt,
  getActivityDate,
  getActivityText,
  getActivityTitle,
  groupByMuseu,
  splitParagraphs,
  toNumber,
} from './premiumReportUtils';

function ActivityCard({ activity, index }) {
  const text = splitParagraphs(getActivityText(activity), 1)[0] || 'Registro recuperado dos relatorios do app, mantido como evidencia da execucao do periodo.';
  const publico = toNumber(activity?.publico);

  return (
    <article className="premium-activity-card">
      <div className="premium-activity-index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <p className="premium-card-meta">{[getActivityDate(activity), activity?.local, activity?.classificacao].filter(Boolean).join(' / ')}</p>
        <h4>{getActivityTitle(activity)}</h4>
        <p>{text}</p>
        <div className="premium-activity-tags">
          <span>{activity?.categoria_label || 'Eixo institucional'}</span>
          <span>Publico: {publico > 0 ? fmtInt(publico) : 'N/A'}</span>
        </div>
      </div>
    </article>
  );
}

export default function PremiumMuseumSection({ contexto }) {
  const grupos = groupByMuseu(Array.isArray(contexto?.atividades) ? contexto.atividades : []);
  const museus = ['MHAB', 'MIS', 'MUMO', 'Atuacao geral'];

  return (
    <div className="premium-museums">
      {museus.map((museu) => {
        const items = grupos[museu] || [];
        if (items.length === 0) return null;

        const publico = items.reduce((sum, item) => sum + toNumber(item?.publico), 0);

        return (
          <section className="premium-museum-block premium-page-break" key={museu}>
            <div className="premium-museum-heading">
              <p className="premium-eyebrow">Acoes por equipamento</p>
              <h2>{museu}</h2>
              <div className="premium-museum-kpis">
                <span>{fmtInt(items.length)} acoes</span>
                <span>{publico > 0 ? fmtInt(publico) : 'N/A'} publico</span>
              </div>
            </div>

            <div className="premium-activity-grid">
              {items.slice(0, 18).map((activity, index) => (
                <ActivityCard activity={activity} index={index} key={activity?.id || `${museu}-${index}`} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
