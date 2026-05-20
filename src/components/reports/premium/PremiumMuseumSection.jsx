import React from 'react';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';
import {
  cleanText,
  fmtInt,
  getActivityDate,
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

function ActivityEvidence({ activity }) {
  const photos = Array.isArray(activity?.fotos_destaque) ? activity.fotos_destaque : [];
  if (photos.length === 0) return null;

  return (
    <div className="premium-activity-photos">
      {photos.slice(0, 2).map((photo, index) => (
        <figure key={photo?.url || photo?.id || index}>
          <img src={photo?.url} alt={photo?.legenda || activity?.nome || 'Evidência visual da atividade'} loading="lazy" />
          {(photo?.legenda || photo?.credito) ? (
            <figcaption>
              {photo?.legenda ? <span>{cleanText(photo.legenda)}</span> : null}
              {photo?.credito ? <span>Crédito: {cleanText(photo.credito)}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function ActivityCard({ activity, index }) {
  const primaryText = splitParagraphs(getActivityText(activity), 1)[0] || 'Registro disponível nos relatórios aprovados, mantido como evidência da execução do período.';
  const complementaryText = splitParagraphs([activity?.sinopse_agenda, activity?.observacoes, activity?.resultado].filter(Boolean).join('\n\n'), 1)[0] || '';
  const publico = getActivityPublico(activity);

  return (
    <article className="premium-activity-card activity-card">
      <div className="premium-activity-index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <p className="premium-card-meta activity-card-meta">{[getActivityDate(activity), activity?.museu].filter(Boolean).join(' · ')}</p>
        <h4 className="activity-card-title">{getActivityTitle(activity)}</h4>
        <div className="activity-card-body">
          <p>{cleanText(primaryText)}</p>
          {complementaryText ? <p>{cleanText(complementaryText)}</p> : null}
          {publico > 0 ? <p><strong>Público:</strong> {fmtInt(publico)}</p> : null}
        </div>
        <ActivityEvidence activity={activity} />
      </div>
    </article>
  );
}

export default function PremiumMuseumSection({ contexto, chapterIds = ['atividades_museu'] }) {
  const atividadesPublicas = (Array.isArray(contexto?.atividades) ? contexto.atividades : []).filter(isPublicFacingActivity);
  const grupos = groupByMuseu(atividadesPublicas);
  const intros = {
    MHAB: 'No MHAB, a programação do período articula memória urbana, mediação cultural e ações educativas relacionadas à história da cidade.',
    MIS: 'No MIS, os registros aproximam audiovisual, memória da imagem, formação de público e ações educativas vinculadas à exposição e à mediação.',
    MUMO: 'No MUMO, as atividades conectam moda, corpo, manualidade e cultura urbana em diálogo com exposições, oficinas e visitas mediadas.',
    'Atuação geral': 'A Atuação Geral reúne ações transversais de planejamento, produção, comunicação, acompanhamento institucional e articulação entre equipes.',
  };
  const museus = ['MHAB', 'MIS', 'MUMO', 'Atuação geral'];

  return (
    <div
      className="premium-museums"
      data-report-chapter-id={chapterIds[0] || 'atividades_museu'}
      data-report-chapter-ids={chapterIds.filter(Boolean).join(' ')}
      data-report-chapter-title="Atividades por museu"
    >
      {museus.map((museu, museumIndex) => {
        const items = (grupos[museu] || [])
          .slice()
          .sort((a, b) => String(getActivityDate(a) || '').localeCompare(String(getActivityDate(b) || '')));
        if (items.length === 0) return null;

        const publico = items.reduce((sum, item) => sum + toNumber(item?.publico), 0);

        return (
          <section className={`premium-museum-block ${museumIndex > 0 ? 'premium-page-break' : ''}`} key={museu}>
            <PremiumInternalPageHeader />
            <div className="premium-museum-heading">
              <p className="premium-eyebrow">Atividades por museu</p>
              <h2>{museu}</h2>
              <div className="premium-museum-kpis">
                <span>{fmtInt(items.length)} atividades</span>
                {publico > 0 ? <span>{fmtInt(publico)} público</span> : null}
              </div>
            </div>
            <p className="premium-museum-intro">{intros[museu]}</p>
            <div className="premium-activity-grid">
              {items.map((activity, index) => (
                <ActivityCard activity={activity} index={index} key={activity?.id || `${museu}-${index}`} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
