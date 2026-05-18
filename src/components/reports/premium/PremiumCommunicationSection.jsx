import React from 'react';
import { splitParagraphs } from './premiumReportUtils';

function communicationActivities(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  return atividades.filter((item) => {
    const text = `${item?.categoria_editorial || ''} ${item?.categoria_label || ''} ${item?.nome || ''} ${item?.descricao || ''}`.toLowerCase();
    return text.includes('comunic') || text.includes('rede') || text.includes('divulg') || text.includes('release') || text.includes('clipping');
  });
}

export default function PremiumCommunicationSection({ contexto, textos }) {
  const atividades = communicationActivities(contexto);
  const paragraphs = splitParagraphs(
    textos?.comunicacao || textos?.capitulos?.comunicacao_produtos,
    4
  );

  return (
    <section className="premium-communication premium-page-break">
      <div className="premium-section-heading">
        <p className="premium-eyebrow">Comunicacao, memoria visual e circulacao publica</p>
        <h2>Comunicacao como infraestrutura de evidencia</h2>
      </div>

      <div className="premium-communication-grid">
        <div className="premium-prose">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="premium-communication-panel">
          <strong>{atividades.length}</strong>
          <span>registros associados a comunicacao, cobertura, pauta ou memoria visual</span>
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
              {atividades.slice(0, 16).map((item, index) => (
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
