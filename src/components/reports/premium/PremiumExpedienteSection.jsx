import React from 'react';
import { TEAM_REGISTRY_BASE } from '@/lib/teamRegistryBase';
import { REPORT_INSTITUTIONAL_REALIZATION } from '@/config/reportEditorialTemplate';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';
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

function getCanonicalExpedientePerson(nome = '', report = {}) {
  const normalizedName = normalizeText(nome);
  const normalizedEmail = normalizeText(report.email || report.user_email || report.autor_email || '');

  if (!normalizedName) return null;
  if (normalizedName.includes('silvia goes caram') || normalizedEmail.includes('caram silvia yahoo')) return null;

  if (normalizedName.includes('ana luiza') || normalizedName.includes('programacao museus centro')) return { nome: 'Ana Luiza' };
  if (normalizedName.includes('fernanda monte mor') || normalizedName.includes('fernanda campos')) return { nome: 'Fernanda Campos de Pinho Monte-Mor' };
  if (normalizedName.includes('daniela isis')) return { nome: 'Daniela Isis de Souza Araújo' };
  if (normalizedName.includes('daniel moreira')) return { nome: 'Daniel Moreira Soares' };
  if (normalizedName.includes('caroline abasse')) return { nome: 'Caroline Abasse e Braga' };
  if (normalizedName.includes('ana carolina motta')) return { nome: 'Ana Carolina Motta Montalvão' };
  if (normalizedName.includes('isabella caroline')) return { nome: 'Isabella Caroline de Souza' };
  if (normalizedName.includes('wanda mucchiut')) return { nome: 'Wanda Mucchiut' };
  if (normalizedName.includes('marcos hilatrio')) return { nome: 'Marcos Hilatrio' };
  if (normalizedName.includes('leandro gabriel') || normalizedName.includes('lenado')) return { nome: 'Leandro Gabriel' };
  if (normalizedName.includes('producao viaduto das artes')) return null;
  if (normalizedName.includes('claraassumpcao') || normalizedName.includes('clara assumpcao')) {
    return {
      nome: 'Clara Braga Assumpção',
      funcao: 'Educadora · Museus Centro',
    };
  }

  return { nome: cleanText(nome) };
}

function buildEquipe(contexto = {}) {
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const fromReports = reports.map((report) => {
    const canonical = getCanonicalExpedientePerson(report.autor || report.author_name || report.user_name || report.nome, report);
    if (!canonical) return null;
    const nome = canonical.nome;
    const funcao = normalizeRole(report.funcao || report.role || report.cargo);
    const museu = getMuseuLabel(report.museu || report.equipamento || report.setor || 'Museus Centro');
    return {
      nome,
      funcao: canonical.funcao || `${funcao} · ${museu}`,
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
      <PremiumInternalPageHeader />

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
