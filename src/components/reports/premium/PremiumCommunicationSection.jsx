import React from 'react';
import { splitParagraphs } from './premiumReportUtils';

function communicationActivities(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  return atividades.filter((item) => {
    const text = `${item?.categoria_editorial || ''} ${item?.categoria_label || ''} ${item?.nome || ''} ${item?.descricao || ''}`.toLowerCase();
    return text.includes('comunic') || text.includes('rede') || text.includes('divulg') || text.includes('release') || text.includes('clipping') || text.includes('foto') || text.includes('filmagem');
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
        <p className="premium-eyebrow">Comunicação, memória visual e circulação pública</p>
        <h2>Comunicação, registros e evidências</h2>
      </div>

      <div className="premium-communication-grid">
        <div className="premium-prose">
          {(paragraphs.length ? paragraphs : [
            'A comunicação do período é apresentada como processo documental: registros fotográficos, filmagens, peças de divulgação, acompanhamento de atividades e organização de evidências que sustentam a memória pública do projeto.',
          ]).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="premium-communication-panel">
          <strong>{atividades.length}</strong>
          <span>registros associados a comunicação, cobertura, pauta ou memória visual</span>
        </div>
      </div>

      {atividades.length > 0 && (
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Ação</th>
                <th>Museu</th>
                <th>Mês</th>
                <th>Natureza</th>
              </tr>
            </thead>
            <tbody>
              {atividades.slice(0, 16).map((item, index) => (
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
