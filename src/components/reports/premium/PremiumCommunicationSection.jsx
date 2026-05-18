import React from 'react';
import { cleanText, splitParagraphs } from './premiumReportUtils';

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

export default function PremiumCommunicationSection({ contexto, textos }) {
  const atividades = communicationActivities(contexto);
  const paragraphs = splitParagraphs(
    textos?.comunicacao || textos?.capitulos?.comunicacao_produtos,
    6
  );
  const fallbackParagraphs = [
    'A comunicacao do periodo e apresentada como frente de memoria visual, documentacao cultural e presenca publica. Mais do que divulgar atividades isoladas, registros fotograficos, filmagens, pecas digitais e acompanhamento das acoes formam uma camada de evidencia sobre a execucao do projeto.',
    'Esse conjunto permite reconhecer como a programacao se torna visivel para diferentes publicos e como os museus constroem continuidade institucional por meio de imagens, textos, coberturas e arquivos.',
    'Os textos originais dos registros foram preservados como fonte, mas reorganizados editorialmente para reduzir redundancias, qualificar a leitura e evidenciar relacoes entre cobertura, identidade visual, documentacao, audiovisual, redes institucionais e prestacao de contas.',
  ];

  return (
    <section className="premium-communication premium-page-break">
      <div className="premium-section-heading">
        <p className="premium-eyebrow">Comunicacao, memoria visual e circulacao publica</p>
        <h2>Comunicacao, registros e evidencias</h2>
      </div>

      <div className="premium-communication-grid">
        <div className="premium-prose">
          {(paragraphs.length ? paragraphs : fallbackParagraphs).map((paragraph) => (
            <p key={paragraph}>{cleanText(paragraph)}</p>
          ))}
        </div>

        <div className="premium-communication-panel">
          <strong>{atividades.length}</strong>
          <span>registros associados a comunicacao, cobertura, audiovisual, pauta ou memoria visual</span>
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
              {atividades.slice(0, 24).map((item, index) => (
                <tr key={item?.id || index}>
                  <td>{item?.nome || item?.titulo || 'Registro de comunicacao'}</td>
                  <td>{item?.museu || 'Geral'}</td>
                  <td>{item?.mes || item?.data || 'Periodo'}</td>
                  <td>{item?.categoria_label || item?.classificacao || 'Comunicacao'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
