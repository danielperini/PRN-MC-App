import React from 'react';
import { TEAM_REGISTRY_BASE } from '@/lib/teamRegistryBase';
import { REPORT_INSTITUTIONAL_REALIZATION } from '@/config/reportEditorialTemplate';
import { cleanText, getMuseuLabel, normalizeText, uniqueBy } from './premiumReportUtils';

const EQUIPE_BASE = TEAM_REGISTRY_BASE.map((item) => {
  const funcaoBase = cleanText([item.funcao, item.area].filter(Boolean).join(' · '));
  const detalhes = [
    cleanText(item.email),
    cleanText([
      item.valor_referencia ? `Referência: ${item.valor_referencia}` : '',
      item.inicio_vinculo_referencia ? `Ingresso: ${item.inicio_vinculo_referencia}` : '',
    ].filter(Boolean).join(' · ')),
  ].filter(Boolean);

  return {
    nome: cleanText(item.nome),
    funcao: funcaoBase || 'Equipe Museus Centro · Museus Centro',
    detalhes,
  };
});

function normalizeRole(value = '') {
  const text = normalizeText(value);
  if (text.includes('coord')) return 'Coordenação';
  if (text.includes('educ')) return 'Educativo';
  if (text.includes('prod')) return 'Produção';
  if (text.includes('comunic')) return 'Comunicação';
  if (text.includes('foto')) return 'Fotografia';
  if (text.includes('program')) return 'Programação';
  return cleanText(value) || 'Equipe Museus Centro';
}

function buildEquipe(contexto = {}) {
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const fromReports = reports.map((report) => {
    const nome = cleanText(report.autor || report.author_name || report.user_name || report.nome);
    if (!nome) return null;
    if (normalizeText(nome).includes('claraassumpcao')) {
      return {
        nome: 'Clara Braga Assumpção',
        funcao: 'Educadora · Museus Centro',
        detalhes: [],
      };
    }
    const funcao = normalizeRole(report.funcao || report.role || report.cargo);
    const museu = getMuseuLabel(report.museu || report.equipamento || report.setor || 'Museus Centro');
    return {
      nome,
      funcao: `${funcao} · ${museu}`,
      detalhes: [],
    };
  }).filter(Boolean);

  return uniqueBy(
    [...EQUIPE_BASE, ...fromReports],
    (item) => normalizeText(item.nome)
  ).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function CreditBlock({ title, children }) {
  return (
    <section className="premium-expediente-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function PremiumExpedienteSection({ contexto = {} }) {
  const equipe = buildEquipe(contexto);

  return (
    <section className="premium-expediente premium-page-break">
      <div className="premium-expediente-heading">
        <p className="premium-eyebrow">Expediente</p>
        <h2>Uma publicação construída por muitas mãos</h2>
        <p>
          Este relatório reconhece a dimensão coletiva do Museus Centro: a articulação entre gestão pública, Viaduto das Artes,
          coordenações, educativo, produção, comunicação e profissionais que transformaram a rotina do projeto em memória pública,
          acompanhamento técnico e presença cultural no território.
        </p>
      </div>

      <div className="premium-expediente-grid">
        <CreditBlock title="Projeto Museus Centro">
          <p className="premium-expediente-lead">Realização</p>
          <ul className="premium-expediente-list">
            {REPORT_INSTITUTIONAL_REALIZATION.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CreditBlock>
      </div>

      <CreditBlock title="Equipe Museus Centro">
        <div className="premium-expediente-people premium-expediente-people-wide">
          {equipe.map((pessoa) => (
            <article key={pessoa.nome}>
              <strong>{pessoa.nome}</strong>
              <span>{pessoa.funcao}</span>
              {Array.isArray(pessoa.detalhes) && pessoa.detalhes.map((detalhe) => (
                <span key={`${pessoa.nome}-${detalhe}`}>{detalhe}</span>
              ))}
            </article>
          ))}
        </div>
      </CreditBlock>
    </section>
  );
}
