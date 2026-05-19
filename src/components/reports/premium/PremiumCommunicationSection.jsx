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

function formatCommunicationDate(value) {
  if (!value) return '';
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return cleanText(raw);
}
export default function PremiumCommunicationSection({ contexto, textos }) {
  const atividades = communicationActivities(contexto);
  const paragraphs = splitParagraphs(
    textos?.comunicacao || textos?.capitulos?.comunicacao_produtos,
    6
  );
  const fallbackParagraphs = [
    'A comunicação é tratada neste relatório como frente técnica de documentação, circulação pública e memória institucional. Além da divulgação de atividades, o capítulo considera a produção de conteúdo, a organização de pautas, os registros fotográficos e audiovisuais, a atualização de canais e a curadoria de evidências visuais.',
    'A seção diferencia divulgação pública e documentação institucional, reconhecendo que coberturas, peças gráficas, registros de processo e materiais de circulação também compõem a comprovação da execução do projeto.',
    'Os registros originais foram preservados como fonte, mas reorganizados editorialmente para reduzir redundâncias e qualificar a leitura entre cobertura, identidade visual, audiovisual, redes institucionais e prestação de contas.',
  ];

  return (
    <section className="premium-communication premium-page-break">
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
          <strong>{atividades.length}</strong>
          <span>registros associados a comunicação, cobertura, audiovisual, pauta ou memória visual</span>
        </div>
      </div>

      {atividades.length > 0 && (
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr>
                <th>AÇÃO</th>
                <th>Museu</th>
                <th>MÊS</th>
                <th>Natureza</th>
              </tr>
            </thead>
            <tbody>
              {atividades.slice(0, 24).map((item, index) => (
                <tr key={item?.id || index}>
                  <td>{cleanText(item?.nome || item?.titulo || 'Registro de comunicação')}</td>
                  <td>{cleanText(item?.museu || 'Geral')}</td>
                  <td>{cleanText(item?.mes || formatCommunicationDate(item?.data) || 'Período')}</td>
                  <td>{cleanText(item?.categoria_label || item?.classificacao || 'Comunicação')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
