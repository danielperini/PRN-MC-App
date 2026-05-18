import React from 'react';
import { cleanText, getMuseuLabel, normalizeText, uniqueBy } from './premiumReportUtils';

const REALIZACAO = [
  'Prefeitura de Belo Horizonte',
  'Fundação Municipal de Cultura',
  'Diretoria de Museus - DEMUS',
  'Viaduto das Artes',
  'Museus Centro',
];

const DEMUS = [
  { nome: 'Diretoria de Museus - DEMUS', funcao: 'Direção institucional dos museus municipais · Fundação Municipal de Cultura' },
  { nome: 'Coordenações dos equipamentos museológicos', funcao: 'Gestão pública dos museus · PBH/FMC' },
  { nome: 'Equipes técnicas dos museus municipais', funcao: 'Acervo, educativo, difusão, pesquisa, documentação e atendimento ao público' },
];

const EQUIPE_BASE = [
  { nome: 'Daniel Perini', funcao: 'Coordenação Geral · Museus Centro' },
  { nome: 'Ana Luiza', funcao: 'Consultoria de Programação · Museus Centro' },
  { nome: 'Fernanda Monte-Mór', funcao: 'Coordenação de Produção e Comunicação · Atuação Geral' },
  { nome: 'Juliana Silva', funcao: 'Educativo · MIS BH' },
  { nome: 'Lara Carvalho', funcao: 'Equipe Museus Centro · Museus Centro' },
  { nome: 'Produção Viaduto das Artes', funcao: 'Produção Cultural · Museus Centro' },
  { nome: 'Caroline Abasse', funcao: 'Equipe Museus Centro · Museus Centro' },
  { nome: 'Daniela Isis', funcao: 'Produção Cultural · MUMO' },
  { nome: 'Wanda Mucchiut', funcao: 'Equipe Museus Centro · Museus Centro' },
  { nome: 'Isabella Caroline de Souza', funcao: 'Equipe Museus Centro · Museus Centro' },
  { nome: 'Clara Assumpção', funcao: 'Equipe Museus Centro · Museus Centro' },
  { nome: 'Daniel Moreira', funcao: 'Equipe Museus Centro · Museus Centro' },
];

const EQUIPAMENTOS = [
  {
    titulo: 'Museu Histórico Abílio Barreto - MHAB',
    linhas: [
      'Direção e equipe institucional · MHAB',
      'Educativo, mediação e atendimento · MHAB',
      'Acervo, pesquisa, documentação e difusão cultural · MHAB',
      'Produção Museus Centro · MHAB',
    ],
  },
  {
    titulo: 'Museu da Imagem e do Som - MIS BH',
    linhas: [
      'Direção e equipe institucional · MIS BH',
      'Educativo, mediação e atendimento · MIS BH',
      'Audiovisual, memória da imagem e do som, documentação e difusão · MIS BH',
      'Produção Museus Centro · MIS BH',
    ],
  },
  {
    titulo: 'Museu da Moda - MUMO',
    linhas: [
      'Direção e equipe institucional · MUMO',
      'Educativo, mediação e atendimento · MUMO',
      'Moda, memória urbana, documentação e difusão cultural · MUMO',
      'Produção Museus Centro · MUMO',
    ],
  },
];

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
    const funcao = normalizeRole(report.funcao || report.role || report.cargo);
    const museu = getMuseuLabel(report.museu || report.equipamento || report.setor || 'Museus Centro');
    return { nome, funcao: `${funcao} · ${museu}` };
  }).filter(Boolean);

  return uniqueBy([...EQUIPE_BASE, ...fromReports], (item) => normalizeText(item.nome)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
          Este relatório reconhece a dimensão coletiva do Museus Centro: a articulação entre gestão pública, equipes dos museus,
          Viaduto das Artes, coordenações, educativo, produção, comunicação e profissionais que transformaram a rotina do projeto
          em memória pública, acompanhamento técnico e presença cultural no território.
        </p>
      </div>

      <div className="premium-expediente-grid">
        <CreditBlock title="Realização">
          <ul className="premium-expediente-list">
            {REALIZACAO.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CreditBlock>

        <CreditBlock title="Diretoria de Museus - DEMUS">
          <div className="premium-expediente-people">
            {DEMUS.map((item) => (
              <article key={item.nome}>
                <strong>{item.nome}</strong>
                <span>{item.funcao}</span>
              </article>
            ))}
          </div>
        </CreditBlock>
      </div>

      <div className="premium-expediente-museums">
        {EQUIPAMENTOS.map((grupo) => (
          <CreditBlock title={grupo.titulo} key={grupo.titulo}>
            <ul className="premium-expediente-list">
              {grupo.linhas.map((linha) => <li key={linha}>{linha}</li>)}
            </ul>
          </CreditBlock>
        ))}
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
