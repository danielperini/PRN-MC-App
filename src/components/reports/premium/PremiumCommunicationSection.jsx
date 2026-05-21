import React from 'react';
import { cleanText, splitParagraphs } from './premiumReportUtils';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';

function communicationActivities(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  return atividades.filter((item) => {
    const text = `${item?.categoria_editorial || ''} ${item?.categoria_label || ''} ${item?.nome || ''} ${item?.descricao || ''}`.toLowerCase();
    return text.includes('comunic') ||
      text.includes('rede') ||
      text.includes('divulg') ||
      text.includes('release') ||
      text.includes('clipping') ||
      text.includes('foto') ||
      text.includes('filmagem') ||
      text.includes('audiovisual') ||
      text.includes('documenta');
  });
}

export default function PremiumCommunicationSection({ contexto, textos, chapterIds = ['comunicacao'] }) {
  const atividades = communicationActivities(contexto);
  const paragraphs = splitParagraphs(
    textos?.comunicacao || textos?.capitulos?.comunicacao_produtos,
    6
  );
  const fallbackParagraphs = [
    'A comunicação do período é apresentada como frente de memória visual, documentação cultural e presença pública. Mais do que divulgar atividades isoladas, registros fotográficos, filmagens, peças digitais e acompanhamento das ações formam uma camada de evidência sobre a execução do projeto.',
    'Esse conjunto permite reconhecer como a programação se torna visível para diferentes públicos e como os museus constroem continuidade institucional por meio de imagens, textos, coberturas e arquivos.',
    'Os textos originais dos registros foram preservados como fonte, mas reorganizados editorialmente para reduzir redundâncias, qualificar a leitura e evidenciar relações entre cobertura, identidade visual, documentação, audiovisual, redes institucionais e prestação de contas.',
  ];

  return (
    <section
      className="premium-communication premium-page-break"
      data-report-chapter-id={chapterIds[0] || 'comunicacao'}
      data-report-chapter-ids={chapterIds.filter(Boolean).join(' ')}
      data-report-chapter-title="Comunicação"
    >
      <PremiumInternalPageHeader />

      <div className="premium-section-heading">
        <p className="premium-eyebrow">Comunicação, memória visual e circulação pública</p>
        <h2>Comunicação, registros e evidências</h2>
      </div>

      <div className="premium-communication-grid">
        <div className="premium-prose">
          {(paragraphs.length ? paragraphs : fallbackParagraphs).map((paragraph) => (
            <p key={paragraph}>{cleanText(paragraph)}</p>
          ))}
        </div>

        <div className="premium-communication-panel">
          <span>Registros de comunicaÃ§Ã£o</span>
          <strong>{atividades.length}</strong>
          <span>aÃ§Ãµes, peÃ§as ou registros consolidados no perÃ­odo</span>
        </div>
      </div>

      {atividades.length > 0 && (
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Acao</th>
                <th>Museu</th>
                <th>Mes</th>
                <th>Natureza</th>
              </tr>
            </thead>
            <tbody>
              {atividades.map((item, index) => (
                <tr key={item?.id || index}>
                  <td>{item?.nome || item?.titulo || 'Registro de comunicação'}</td>
                  <td>{item?.museu || 'Geral'}</td>
                  <td>{item?.mes || item?.data || 'Período'}</td>
                  <td>{item?.categoria_label || item?.classificacao || 'Comunicação'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
