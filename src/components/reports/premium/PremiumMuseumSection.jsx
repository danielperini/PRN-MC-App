import React from 'react';
import {
  fmtInt,
  getActivityDate,
  getActivityMeta,
  getActivityPublico,
  getActivityText,
  getActivityTitle,
  groupByMuseu,
  splitParagraphs,
  toNumber,
} from './premiumReportUtils';

function ActivityPhotos({ photos = [] }) {
  const selected = Array.isArray(photos) ? photos.slice(0, 4) : [];
  if (selected.length === 0) return null;

  return (
    <div className="premium-activity-photos">
      {selected.map((photo, index) => (
        <figure key={photo?.url || `${photo?.caption}-${index}`}>
          {photo?.url ? <img src={photo.url} alt={photo.caption || 'Foto da atividade'} loading="lazy" /> : null}
          <figcaption>
            {photo?.credito ? <span>Crédito: {photo.credito}</span> : null}
            {photo?.localizacao?.label ? <span>GPS: {photo.localizacao.label}</span> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function ActivityCard({ activity, index }) {
  const text = splitParagraphs(getActivityText(activity), 1)[0] || 'Registro recuperado dos relatórios aprovados no app, mantido como evidência da execução do período.';
  const publico = getActivityPublico(activity);
  const meta = getActivityMeta(activity);
  const fotos = Array.isArray(activity?.fotos_destaque) ? activity.fotos_destaque : activity?.fotos;

  return (
    <article className="premium-activity-card">
      <div className="premium-activity-index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <p className="premium-card-meta">{[getActivityDate(activity), activity?.mes, activity?.local].filter(Boolean).join(' / ')}</p>
        <h4>{getActivityTitle(activity)}</h4>
        <p>{text}</p>
        <div className="premium-activity-tags">
          <span>{activity?.categoria_label || activity?.classificacao || 'Eixo institucional'}</span>
          <span>Público: {publico > 0 ? fmtInt(publico) : 'N/A'}</span>
          {meta ? <span>Meta: {meta}</span> : null}
        </div>
        <ActivityPhotos photos={fotos} />
      </div>
    </article>
  );
}

export default function PremiumMuseumSection({ contexto }) {
  const grupos = groupByMuseu(Array.isArray(contexto?.atividades) ? contexto.atividades : []);
  const museus = ['MHAB', 'MIS', 'MUMO', 'Atuação geral'];

  return (
    <div className="premium-museums">
      {museus.map((museu) => {
        const items = grupos[museu] || [];
        if (items.length === 0) return null;

        const publico = items.reduce((sum, item) => sum + toNumber(item?.publico), 0);

        return (
          <section className="premium-museum-block premium-page-break" key={museu}>
            <div className="premium-museum-heading">
              <p className="premium-eyebrow">Ações por equipamento</p>
              <h2>{museu}</h2>
              <div className="premium-museum-kpis">
                <span>{fmtInt(items.length)} ações</span>
                <span>{publico > 0 ? fmtInt(publico) : 'N/A'} público</span>
              </div>
            </div>

            <div className="premium-activity-grid">
              {items.slice(0, 24).map((activity, index) => (
                <ActivityCard activity={activity} index={index} key={activity?.id || `${museu}-${index}`} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
