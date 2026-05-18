import React from 'react';
import {
  cleanText,
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

function isPublicFacingActivity(activity = {}) {
  const text = `${activity?.nome || ''} ${activity?.titulo || ''} ${activity?.descricao || ''} ${activity?.classificacao || ''}`.toLowerCase();
  return !(
    text.includes('ritual de gest') ||
    text.includes('reunião de apresentação') ||
    text.includes('reuniao de apresentacao') ||
    text.includes('contato interno') ||
    text.includes('contatos internos') ||
    text.includes('contratação de consultoria') ||
    text.includes('contratacao de consultoria') ||
    text.includes('noturno')
  );
}

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
  const complementaryText = splitParagraphs([activity?.sinopse_agenda, activity?.observacoes, activity?.resultado].filter(Boolean).join('\n\n'), 1)[0] || '';
  const publico = getActivityPublico(activity);
  const meta = getActivityMeta(activity);
  const fotos = Array.isArray(activity?.fotos_destaque) ? activity.fotos_destaque : activity?.fotos;

  return (
    <article className="premium-activity-card">
      <div className="premium-activity-index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <p className="premium-card-meta">{[getActivityDate(activity), activity?.mes, activity?.local].filter(Boolean).join(' / ')}</p>
        <h4>{getActivityTitle(activity)}</h4>
        <p>{cleanText(text)}</p>
        {complementaryText ? <p>{cleanText(complementaryText)}</p> : null}
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
  const atividadesPublicas = (Array.isArray(contexto?.atividades) ? contexto.atividades : []).filter(isPublicFacingActivity);
  const grupos = groupByMuseu(atividadesPublicas);
  const intros = {
    MHAB: 'No MHAB, a programacao dialoga com memoria urbana, historia publica, mediacao territorial e formacao de publico.',
    MIS: 'No MIS, as acoes mobilizam audiovisual, memoria da imagem e do som, documentacao cultural e aproximacao com publicos diversos.',
    MUMO: 'No MUMO, os registros aproximam moda, corpo, design, educacao e cultura urbana em chave contemporanea.',
    geral: 'A atuacao geral reune frentes transversais de planejamento, acessibilidade, comunicacao, documentacao e producao cultural.',
  };
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
            <p className="premium-museum-intro">{intros[museu] || intros.geral}</p>

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
