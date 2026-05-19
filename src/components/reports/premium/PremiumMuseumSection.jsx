import React from 'react';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';
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

function ActivityCard({ activity, index }) {
  const text = splitParagraphs(getActivityText(activity), 1)[0] || 'Registro disponível nos relatórios aprovados, mantido como evidência da execução do período.';
  const complementaryText = splitParagraphs([activity?.sinopse_agenda, activity?.observacoes, activity?.resultado].filter(Boolean).join('\n\n'), 1)[0] || '';
  const publico = getActivityPublico(activity);
  const meta = getActivityMeta(activity);

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
          {publico > 0 ? <span>Público: {fmtInt(publico)}</span> : null}
          {meta ? <span>Meta: {meta}</span> : null}
        </div>
      </div>
    </article>
  );
}

export default function PremiumMuseumSection({ contexto, chapterIds = ['atividades_museu'] }) {
  const atividadesPublicas = (Array.isArray(contexto?.atividades) ? contexto.atividades : []).filter(isPublicFacingActivity);
  const grupos = groupByMuseu(atividadesPublicas);
  const intros = {
    MHAB: 'No MHAB, a programação dialoga com memória urbana, história pública, mediação territorial e formação de público.',
    MIS: 'No MIS, as ações mobilizam audiovisual, memória da imagem e do som, documentação cultural e aproximação com públicos diversos.',
    MUMO: 'No MUMO, os registros aproximam moda, corpo, design, educação e cultura urbana em chave contemporânea.',
    geral: 'A atuação geral reúne frentes transversais de planejamento, acessibilidade, comunicação, documentação e produção cultural.',
  };
  const museus = ['MHAB', 'MIS', 'MUMO', 'Atuação geral'];

  return (
    <div
      className="premium-museums"
      data-report-chapter-id={chapterIds[0] || 'atividades_museu'}
      data-report-chapter-ids={chapterIds.filter(Boolean).join(' ')}
      data-report-chapter-title="Atividades por museu"
    >
      {museus.map((museu) => {
        const items = grupos[museu] || [];
        if (items.length === 0) return null;

        const publico = items.reduce((sum, item) => sum + toNumber(item?.publico), 0);

        return (
          <section className="premium-museum-block premium-page-break" key={museu}>
            <PremiumInternalPageHeader />

            <div className="premium-museum-heading">
              <p className="premium-eyebrow">Ações por equipamento</p>
              <h2>{museu}</h2>
              <div className="premium-museum-kpis">
                <span>{fmtInt(items.length)} ações</span>
                {publico > 0 ? <span>{fmtInt(publico)} público</span> : null}
              </div>
            </div>
            <p className="premium-museum-intro">{intros[museu] || intros.geral}</p>

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
