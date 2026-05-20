import React from 'react';
import { TEAM_REGISTRY_BASE } from '@/lib/teamRegistryBase';
import { REPORT_INSTITUTIONAL_REALIZATION } from '@/config/reportEditorialTemplate';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';
import { cleanText, normalizeText, uniqueBy } from './premiumReportUtils';

function normalizeRole(value = '') {
  const text = normalizeText(value);
  if (text.includes('coordenacao geral') || text.includes('coord geral')) return 'Coordenação Geral';
  if (text.includes('co coorden') || text.includes('coord adjunta')) return 'Co-coordenação';
  if (text.includes('administrativo') || text.includes('financeir')) return 'Administrativo-financeiro';
  if (text.includes('comunic')) return 'Coordenação de Comunicação';
  if (text.includes('program')) return 'Programação';
  if (text.includes('educ')) return 'Educativo';
  if (text.includes('prod')) return 'Produção';
  if (text.includes('foto')) return 'Fotografia';
  if (text.includes('coord')) return 'Coordenação';
  return cleanText(value) || 'Equipe Museus Centro';
}

function getCanonicalExpedientePerson(nome = '', report = {}) {
  const normalizedName = normalizeText(nome);
  const normalizedEmail = normalizeText(report.email || report.user_email || report.autor_email || '');

  if (!normalizedName) return null;
  if (normalizedName.includes('silvia goes caram') || normalizedEmail.includes('caram silvia yahoo')) return null;
  if (normalizedName.includes('ana luiza') || normalizedName.includes('programacao museus centro')) return { nome: 'Ana Luíza', funcao: 'Programação' };
  if (normalizedName.includes('fernanda monte mor') || normalizedName.includes('fernanda campos')) return { nome: 'Fernanda Monte-Mor', funcao: 'Coordenação de Comunicação' };
  if (normalizedName.includes('daniela isis')) return { nome: 'Daniela Isis de Souza Araújo' };
  if (normalizedName.includes('daniel moreira')) return { nome: 'Daniel Moreira Soares' };
  if (normalizedName.includes('caroline abasse')) return { nome: 'Caroline Abasse e Braga' };
  if (normalizedName.includes('ana carolina motta')) return { nome: 'Ana Carolina Motta Montalvão' };
  if (normalizedName.includes('isabella caroline')) return { nome: 'Isabella Caroline de Souza' };
  if (normalizedName.includes('wanda mucchiut')) return { nome: 'Wanda Mucchiut' };
  if (normalizedName.includes('marcos hilatrio')) return { nome: 'Marcos Hilatrio' };
  if (normalizedName.includes('leandro gabriel') || normalizedName.includes('lenado')) return { nome: 'Leandro Gabriel', funcao: 'Co-coordenação' };
  if (normalizedName.includes('josiane amancio') || normalizedName.includes('josiane costa amancio')) return { nome: 'Josiane Amâncio', funcao: 'Administrativo-financeiro' };
  if (normalizedName.includes('daniel perini')) return { nome: 'Daniel Perini', funcao: 'Coordenação Geral' };
  if (normalizedName.includes('clara assumpcao') || normalizedName.includes('claraassumpcao')) return { nome: 'Clara Braga Assumpção', funcao: 'Educadora' };
  if (normalizedName.includes('producao viaduto das artes')) return null;

  return { nome: cleanText(nome) };
}

const EQUIPE_BASE = TEAM_REGISTRY_BASE.map((item) => {
  const canonical = getCanonicalExpedientePerson(item.nome || '', item) || { nome: cleanText(item.nome) };
  return {
    nome: canonical.nome,
    funcao: canonical.funcao || normalizeRole([item.funcao, item.area].filter(Boolean).join(' ')),
    detalhes: [],
  };
}).filter((item) => item?.nome);

function buildEquipe(contexto = {}) {
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const fromReports = reports.map((report) => {
    const canonical = getCanonicalExpedientePerson(report.autor || report.author_name || report.user_name || report.nome, report);
    if (!canonical) return null;
    return {
      nome: canonical.nome,
      funcao: canonical.funcao || normalizeRole(report.funcao || report.role || report.cargo),
      detalhes: [],
    };
  }).filter(Boolean);

  return uniqueBy([...EQUIPE_BASE, ...fromReports], (item) => normalizeText(item.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
    <section className="premium-expediente">
      <PremiumInternalPageHeader />

      <div className="premium-expediente-heading">
        <p className="premium-eyebrow">Expediente</p>
        <h2>Uma publicação construída por muitas mãos</h2>
        <p>
          Este relatório reconhece a dimensão coletiva do Projeto Museus Centro, que, de forma sinérgica, articula a gestão pública, o terceiro setor, por meio do Viaduto das Artes, e o universo científico, artístico e cultural constituído pelos equipamentos museológicos envolvidos: Museu Histórico Abílio Barreto, Museu da Imagem e do Som e Museu da Moda. Trata-se de uma equipe em esforço institucional multidisciplinar, voltado ao fortalecimento da política pública cultural em Belo Horizonte.
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
            </article>
          ))}
        </div>
      </CreditBlock>
    </section>
  );
}
