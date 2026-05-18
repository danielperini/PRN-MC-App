import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PremiumOpeningCover from './PremiumOpeningCover';
import PremiumSection from './PremiumSection';
import PremiumMetrics from './PremiumMetrics';
import PremiumTimeline from './PremiumTimeline';
import PremiumGallery from './PremiumGallery';
import PremiumMuseumSection from './PremiumMuseumSection';
import PremiumCommunicationSection from './PremiumCommunicationSection';
import PremiumClosingSection from './PremiumClosingSection';
import { fmtBRL, fmtInt, toNumber } from './premiumReportUtils';

const CATALOG_CSS = `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e7e3dc; color: #171717; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .premium-report { background: #f7f3eb; color: #171717; }
  .premium-cover { min-height: 297mm; position: relative; overflow: hidden; display: flex; align-items: flex-end; break-after: page; background: #161616; color: #fff; }
  .premium-cover img, .premium-cover-fallback { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .premium-cover-fallback { background: linear-gradient(135deg, #111 0%, #39352d 48%, #6e5c45 100%); }
  .premium-cover-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.55) 52%, rgba(0,0,0,.9) 100%); }
  .premium-cover-content { position: relative; width: 100%; padding: 34mm 20mm 24mm; }
  .premium-cover-kicker, .premium-eyebrow { margin: 0 0 10px; font-size: 10px; line-height: 1.5; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; color: #9f7f4d; }
  .premium-cover h1 { max-width: 760px; margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 64px; line-height: .92; letter-spacing: 0; font-weight: 500; }
  .premium-cover-period { margin: 20px 0 28px; font-size: 16px; color: rgba(255,255,255,.78); }
  .premium-cover-credit { margin: -14px 0 22px; font-size: 10px; color: rgba(255,255,255,.62); letter-spacing: .06em; text-transform: uppercase; }
  .premium-cover-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; max-width: 860px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.25); }
  .premium-cover-grid span { padding: 14px; background: rgba(0,0,0,.45); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  .premium-section, .premium-museum-block, .premium-communication, .premium-closing { padding: 20mm 18mm; background: #f7f3eb; min-height: 260mm; }
  .premium-page-break { break-before: page; }
  .premium-section-dark { background: #171717; color: #f7f3eb; }
  .premium-section-heading { display: grid; grid-template-columns: minmax(0, .95fr) minmax(220px, .55fr); gap: 24px; align-items: end; margin-bottom: 22px; border-bottom: 1px solid rgba(23,23,23,.18); padding-bottom: 18px; }
  .premium-section-heading h2, .premium-museum-heading h2, .premium-closing h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 38px; line-height: 1; font-weight: 500; letter-spacing: 0; text-align: left; }
  .premium-section-subtitle { margin: 0; color: #666; font-size: 13px; line-height: 1.45; }
  .premium-prose { columns: 2; column-gap: 26px; font-size: 12.2px; line-height: 1.72; color: #2b2b2b; }
  .premium-prose p { margin: 0 0 12px; break-inside: avoid; }
  .premium-prose-invert { color: rgba(255,255,255,.82); }
  .premium-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin: 22px 0 8px; }
  .premium-metric { border: 1px solid rgba(23,23,23,.16); background: rgba(255,255,255,.42); padding: 15px; min-height: 96px; }
  .premium-metric span, .premium-card-meta, .premium-timeline-meta { display: block; font-size: 9px; color: #6b6258; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }
  .premium-metric strong { display: block; margin-top: 8px; font-size: 28px; line-height: 1; font-weight: 700; }
  .premium-metric small { display: block; margin-top: 8px; color: #777; font-size: 10px; }
  .premium-timeline { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 22px; }
  .premium-timeline-item { display: grid; grid-template-columns: 42px 1fr; gap: 12px; padding: 12px 0; border-top: 1px solid rgba(23,23,23,.14); break-inside: avoid; }
  .premium-timeline-marker { width: 32px; height: 32px; border-radius: 50%; background: #171717; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
  .premium-timeline-item h3, .premium-activity-card h4 { margin: 3px 0 6px; font-size: 14px; line-height: 1.2; }
  .premium-timeline-item p, .premium-activity-card p { margin: 0; font-size: 11px; line-height: 1.55; color: #555; }
  .premium-gallery { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); grid-auto-rows: 36mm; gap: 7px; margin-top: 18px; }
  .premium-photo { margin: 0; position: relative; overflow: hidden; background: #ddd4c6; break-inside: avoid; }
  .premium-photo-0, .premium-photo-4 { grid-column: span 3; grid-row: span 2; }
  .premium-photo-1, .premium-photo-2, .premium-photo-3 { grid-column: span 2; }
  .premium-photo img, .premium-photo-placeholder { width: 100%; height: 100%; object-fit: cover; display: block; }
  .premium-photo-placeholder { display: grid; place-items: center; background: repeating-linear-gradient(135deg, #d7cec0 0 10px, #cfc3b1 10px 20px); color: #746756; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
  .premium-photo figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 10px 9px; color: #fff; font-size: 9px; line-height: 1.25; background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.82)); }
  .premium-photo figcaption span, .premium-photo figcaption small { display: block; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: rgba(255,255,255,.78); }
  .premium-photo figcaption a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .premium-photo-index { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-top: 18px; }
  .premium-photo-index-item { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.45); padding: 9px; font-size: 9.5px; line-height: 1.35; break-inside: avoid; }
  .premium-photo-index-item strong, .premium-photo-index-item span, .premium-photo-index-item small, .premium-photo-index-item a { display: block; margin-bottom: 3px; color: inherit; }
  .premium-museum-heading { display: flex; justify-content: space-between; align-items: end; gap: 18px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid rgba(23,23,23,.18); }
  .premium-museum-kpis { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .premium-museum-kpis span, .premium-activity-tags span { border: 1px solid rgba(23,23,23,.16); padding: 6px 8px; font-size: 10px; background: rgba(255,255,255,.4); }
  .premium-activity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .premium-activity-card { display: grid; grid-template-columns: 34px 1fr; gap: 11px; padding: 12px; border: 1px solid rgba(23,23,23,.13); background: rgba(255,255,255,.48); break-inside: avoid; }
  .premium-activity-index { font-size: 16px; font-weight: 800; color: #9f7f4d; }
  .premium-activity-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
  .premium-activity-photos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin-top: 10px; }
  .premium-activity-photos figure { margin: 0; min-height: 48px; }
  .premium-activity-photos img { width: 100%; height: 48px; object-fit: cover; display: block; background: #ddd4c6; }
  .premium-activity-photos figcaption { margin-top: 3px; font-size: 7px; line-height: 1.25; color: #6a6259; }
  .premium-activity-photos figcaption span { display: block; }
  .premium-communication-grid { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 20px; align-items: stretch; }
  .premium-communication-panel { background: #171717; color: #fff; padding: 18px; display: flex; flex-direction: column; justify-content: flex-end; min-height: 130px; }
  .premium-communication-panel strong { font-size: 52px; line-height: .9; }
  .premium-communication-panel span { margin-top: 10px; font-size: 11px; line-height: 1.35; color: rgba(255,255,255,.72); }
  .premium-table-wrap { margin-top: 18px; overflow: hidden; border: 1px solid rgba(23,23,23,.16); }
  .premium-table { width: 100%; border-collapse: collapse; font-size: 10px; background: rgba(255,255,255,.42); }
  .premium-table th { text-align: left; padding: 8px; background: #171717; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: .1em; }
  .premium-table td { padding: 8px; border-top: 1px solid rgba(23,23,23,.1); vertical-align: top; }
  .premium-finance-grid, .premium-audience-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
  .premium-closing { background: #171717; color: #f7f3eb; display: flex; flex-direction: column; justify-content: space-between; }
  .premium-closing h2 { max-width: 760px; font-size: 48px; }
  .premium-signature { border-top: 1px solid rgba(255,255,255,.2); padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 12px; color: rgba(255,255,255,.62); }
  .premium-signature strong { color: #fff; }
  @media print {
    body { background: #fff; }
    .premium-report { background: #fff; }
    .premium-section, .premium-museum-block, .premium-communication, .premium-closing { min-height: auto; }
    .premium-photo, .premium-activity-card, .premium-timeline-item, .premium-metric, .premium-photo-index-item { break-inside: avoid; }
  }
`;

const INTRODUCAO_PERIODO = `Este relatório abrange fevereiro, março e abril de 2026 e consolida, a partir dos registros do aplicativo, resultados culturais, institucionais, programáticos e de público do projeto Museus Centro / Viaduto das Artes.

O período marca uma transição importante na coordenação geral do projeto, com a saída de Andréa Matos e a entrada de Daniel Perini. Também passa a integrar o processo a consultora de programação Ana Luiza, fortalecendo a interlocução entre planejamento, produção, diretorias dos museus e organização das ações culturais.

O primeiro momento do projeto foi marcado por chegada, aprovação, contratação e estabilização dos fluxos. Além da coordenação geral, houve mudanças de produção nos equipamentos: no MIS, saída de Ana Carolina Galvão e entrada de Isabela; no MUMO, saída de Daniela Isis e entrada de Silvia Coes. Essas transições exigiram pactuação de rotinas, reordenação de responsabilidades e aproximação cotidiana entre coordenação, produção, comunicação, educativo e equipes dos museus.

O relatório apresenta uma leitura integrada dos museus como infraestrutura pública de memória, formação, convivência e fruição cultural. MIS, MHAB e MUMO aparecem como equipamentos complementares, capazes de articular audiovisual, memória urbana, moda, educação, acessibilidade, preservação e presença territorial no centro de Belo Horizonte.`;

function composeIntro(textos = {}) {
  return [
    INTRODUCAO_PERIODO,
    textos.introducao,
    textos.contexto_territorial || textos.territorio,
    textos.publico_alcancado,
  ].filter(Boolean).join('\n\n');
}

function RubricasTable({ contexto }) {
  const rubricas = Array.isArray(contexto?.rubricas) ? contexto.rubricas : [];
  if (rubricas.length === 0) return null;

  return (
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Rubrica</th>
            <th>Previsto</th>
            <th>Utilizado</th>
            <th>Saldo</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {rubricas.slice(0, 42).map((item, index) => (
            <tr key={item?.id || index}>
              <td>{item?.grupo || 'Grupo'}</td>
              <td>{item?.rubrica || item?.nome || 'Rubrica'}</td>
              <td>{fmtBRL(item?.valor_previsto ?? item?.previsto ?? item?.valor_rubrica ?? item?.valor_total)}</td>
              <td>{fmtBRL(item?.valor_utilizado ?? item?.utilizado)}</td>
              <td>{fmtBRL(item?.saldo)}</td>
              <td>{toNumber(item?.percentual).toFixed(1).replace('.', ',')}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComprasTable({ contexto }) {
  const compras = Array.isArray(contexto?.compras) ? contexto.compras : [];
  if (compras.length === 0) return null;

  return (
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Fornecedor</th>
            <th>Rubrica</th>
            <th>Status</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {compras.slice(0, 36).map((item, index) => (
            <tr key={item?.id || index}>
              <td>{item?.descricao || 'Compra registrada'}</td>
              <td>{item?.fornecedor || '-'}</td>
              <td>{item?.rubrica || '-'}</td>
              <td>{item?.status || '-'}</td>
              <td>{fmtBRL(item?.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AudienceBreakdown({ contexto }) {
  const porMes = Array.isArray(contexto?.publico_por_mes) ? contexto.publico_por_mes : [];
  const porMuseu = Array.isArray(contexto?.publico_por_museu) ? contexto.publico_por_museu : Object.values(contexto?.por_museu || {});

  return (
    <div className="premium-audience-grid">
      <div>
        <h3>Público por mês</h3>
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr><th>Mês</th><th>Ações</th><th>Espontâneo</th><th>Agendadas</th><th>Total</th></tr>
            </thead>
            <tbody>
              {porMes.map((item) => (
                <tr key={item.mes}>
                  <td>{item.mes}</td>
                  <td>{fmtInt(item.atividades)}</td>
                  <td>{fmtInt(item.espontaneo)}</td>
                  <td>{fmtInt(item.visitas_agendadas)}</td>
                  <td>{fmtInt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3>Público por museu</h3>
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr><th>Museu</th><th>Atividades</th><th>Espontâneo</th><th>Agendadas</th><th>Total</th></tr>
            </thead>
            <tbody>
              {porMuseu.map((item) => (
                <tr key={item.museu}>
                  <td>{item.museu}</td>
                  <td>{fmtInt(item.publico ?? item.atividades_publico)}</td>
                  <td>{fmtInt(item.espontaneo)}</td>
                  <td>{fmtInt(item.visitas_agendadas)}</td>
                  <td>{fmtInt(item.total ?? item.publico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StrategicRecords({ contexto }) {
  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const grupos = [
    { titulo: 'Ambiente seguro e diversidade', termos: ['ambiente seguro', 'diversidade', 'inclusao', 'inclusão'] },
    { titulo: 'Memórias e Libras', termos: ['libras', 'memorias', 'memórias', 'surdo', 'acessibilidade'] },
    { titulo: 'Entrevista / Registro recuperado', termos: ['entrevista', 'registro recuperado'] },
    { titulo: 'Traços ao Pixel', termos: ['tracos ao pixel', 'traços ao pixel', 'pixel'] },
    { titulo: 'Atuação geral', termos: ['atuacao geral', 'atuação geral', 'coordenação', 'coordenacao', 'consultora de programação'] },
    { titulo: 'Reuniões semanais com a equipe', termos: ['reuniao', 'reunião', 'ritual de gestao', 'ritual de gestão', 'alinhamento'] },
    { titulo: 'Acompanhamento das filmagens', termos: ['filmagem', 'filmagens', 'audiovisual', 'video', 'vídeo'] },
    { titulo: 'Trechos de entrevistas de Libras', termos: ['entrevista', 'libras'] },
  ].map((grupo) => ({
    ...grupo,
    itens: atividades.filter((atividade) => {
      const text = `${atividade?.nome || ''} ${atividade?.descricao || ''} ${atividade?.classificacao || ''} ${atividade?.categoria_label || ''}`.toLowerCase();
      return grupo.termos.some((termo) => text.includes(termo));
    }).slice(0, 4),
  })).filter((grupo) => grupo.itens.length > 0);

  if (grupos.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Registros editoriais recuperados"
      title="Ações estratégicas do período"
      subtitle="Atividades e registros internos são apresentados conforme aparecem nos relatórios aprovados, sem criar eventos fora da base do app."
      text="Esta seção aproxima ações de acessibilidade, formação, reuniões, filmagens, entrevistas e registros recuperados. Quando a ação é interna, ela é lida como atividade de gestão, produção, comunicação ou mediação, sem atribuição indevida de público direto."
    >
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Seção</th>
              <th>Registro localizado</th>
              <th>Museu</th>
              <th>Mês</th>
              <th>Classificação</th>
            </tr>
          </thead>
          <tbody>
            {grupos.flatMap((grupo) => grupo.itens.map((item, index) => (
              <tr key={`${grupo.titulo}-${item?.id || index}`}>
                <td>{grupo.titulo}</td>
                <td>{item?.nome || item?.titulo || 'Registro do app'}</td>
                <td>{item?.museu || 'Geral'}</td>
                <td>{item?.mes || item?.data || 'Período'}</td>
                <td>{item?.categoria_label || item?.classificacao || 'Atividade interna'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </PremiumSection>
  );
}

function NoturnoSection({ contexto }) {
  const atividades = (Array.isArray(contexto?.atividades) ? contexto.atividades : []).filter((item) => {
    const text = `${item?.nome || ''} ${item?.descricao || ''} ${item?.categoria_label || ''}`.toLowerCase();
    return text.includes('noturno');
  });
  const rubricas = (Array.isArray(contexto?.rubricas) ? contexto.rubricas : []).filter((item) => {
    const text = `${item?.grupo || ''} ${item?.rubrica || ''} ${item?.nome || ''}`.toLowerCase();
    return text.includes('noturno');
  });

  if (atividades.length === 0 && rubricas.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Seção especial"
      title="Noturno nos Museus"
      subtitle="Planejamento, pré-produção, infraestrutura, comunicação e rubricas vinculadas ao eixo de maior visibilidade pública."
      text="No período de fevereiro a abril, o Noturno nos Museus é tratado como frente de planejamento e preparação. Os registros do app permitem acompanhar articulações, compras, infraestrutura, desenho de programação e organização executiva sem apresentar a ausência de evento como vazio de execução."
    >
      <div className="premium-finance-grid">
        <div>
          <h3>Registros relacionados</h3>
          <div className="premium-table-wrap">
            <table className="premium-table">
              <tbody>
                {atividades.slice(0, 12).map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{item?.nome || item?.titulo || 'Ação Noturno'}</td>
                    <td>{item?.museu || 'Geral'}</td>
                    <td>{item?.data || item?.mes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Rubricas do grupo Noturno</h3>
          <div className="premium-table-wrap">
            <table className="premium-table">
              <tbody>
                {rubricas.slice(0, 12).map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{item?.rubrica || item?.nome || 'Rubrica Noturno'}</td>
                    <td>{fmtBRL(item?.valor_previsto ?? item?.previsto ?? item?.valor_rubrica ?? item?.valor_total)}</td>
                    <td>{fmtBRL(item?.valor_utilizado ?? item?.utilizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PremiumSection>
  );
}

function hasSection(selected = [], ...ids) {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  return ids.some((id) => selected.includes(id));
}

export default function PremiumReportLayout({ contexto = {}, textos = {}, filtros = {}, secoesSelecionadas = [] }) {
  return (
    <main className="premium-report">
      {hasSection(secoesSelecionadas, 'capa') && <PremiumOpeningCover contexto={contexto} filtros={filtros} />}

      {hasSection(secoesSelecionadas, 'sumario_executivo', 'introducao', 'resumo_geral', 'indicadores_premium') && <PremiumSection
        eyebrow="Sumário executivo"
        title="Introdução"
        subtitle="Fevereiro, março e abril como ciclo de transição, estabilização, pactuação de rotinas e consolidação dos dados do app."
        text={composeIntro(textos)}
      >
        <PremiumMetrics contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'publico', 'metas', 'indicadores_premium') && <PremiumSection
        breakBefore
        eyebrow="Indicadores, metas e público"
        title="Execução física acompanhada por evidências"
        subtitle={`${fmtInt(contexto.total_atividades)} atividades registradas, ${fmtInt(contexto.publico_total)} pessoas no recorte do período e ${fmtInt(contexto.total_relatorios)} relatórios consolidados.`}
        text={`${textos.resumo_geral || ''}\n\nPúblico espontâneo corresponde ao público que acessa o museu sem agendamento prévio, em visita livre, circulação cotidiana, exposições, permanência nos espaços e fruição espontânea da programação.\n\nVisitas agendadas correspondem a grupos previamente organizados, escolas, instituições, coletivos ou grupos acompanhados por mediação, com registro de data, número de participantes e, quando houver, vínculo com atividade educativa.\n\n${textos.metas || ''}`}
      >
        <AudienceBreakdown contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'programacao', 'agenda_programacao', 'timeline_premium') && <PremiumSection
        breakBefore
        eyebrow="Agenda Museus Centro no período"
        title="Programação e atividades do período"
        subtitle="Programações e atividades reais de fevereiro, março e abril, recuperadas dos relatórios aprovados e da agenda do app."
        text={textos.programacao}
      >
        <PremiumTimeline contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'programacao', 'atividades_museu', 'relatorios_completos') && <StrategicRecords contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'atividades_museu', 'museus_premium') && <PremiumMuseumSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'noturno_premium') && <NoturnoSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'comunicacao', 'comunicacao_premium') && <PremiumCommunicationSection contexto={contexto} textos={textos} />}

      {hasSection(secoesSelecionadas, 'galeria_evidencias', 'galeria_premium') && <PremiumSection
        breakBefore
        eyebrow="Galeria e evidências"
        title="Imagem como documento de execução"
        subtitle="As fotografias são recuperadas do app, deduplicadas por URL e distribuídas como evidência visual das ações."
        text="A galeria opera como camada documental do relatório. Ela amplia a verificabilidade da narrativa: cada imagem vinculada ao app aponta para uma ação, um equipamento, uma frente de trabalho ou uma etapa de produção. A listagem em três colunas preserva atividade, museu, mês, crédito, arquivo e localização GPS quando disponível."
      >
        <PremiumGallery contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'financeiro', 'rubricas', 'prestacao') && <PremiumSection
        breakBefore
        eyebrow="Metas, orçamento e prestação de contas"
        title="Orçamento, rubricas e rastreabilidade"
        subtitle={`Execução informada: ${toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}% do orçamento acompanhado.`}
        text={`${textos.financeiro || ''}\n\n${textos.prestacao || ''}`}
      >
        <div className="premium-finance-grid">
          <RubricasTable contexto={contexto} />
          <ComprasTable contexto={contexto} />
        </div>
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'app_museu_centro', 'sistema_governanca') && <PremiumSection
        breakBefore
        eyebrow="Sistema e governança"
        title="Museu Centro APP como memória operacional"
        subtitle="A ferramenta integra relatórios, fotos, programação, compras, rubricas e textos, permitindo relatórios mais densos e menos manuais."
        text={textos.app_museu_centro}
      />}

      {hasSection(secoesSelecionadas, 'conclusao') && <PremiumClosingSection textos={textos} />}
    </main>
  );
}

export function montarHtmlRelatorioPremium({ contexto = {}, textos = {}, filtros = {}, secoesSelecionadas = [] } = {}) {
  const html = renderToStaticMarkup(
    <PremiumReportLayout contexto={contexto} textos={textos} filtros={filtros} secoesSelecionadas={secoesSelecionadas} />
  );

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório Institucional - Museus Centro</title>
  <style>${CATALOG_CSS}</style>
</head>
<body>${html}</body>
</html>`;
}
