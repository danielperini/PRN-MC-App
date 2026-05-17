import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ORCAMENTO_TOTAL = 1320000;
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── CONTEXTO INSTITUCIONAL FIXO ────────────────────────────────────────────────
// Fatos verificados e permanentes do projeto Museus Centro que a IA DEVE usar
const CONTEXTO_INSTITUCIONAL = `
CONTEXTO INSTITUCIONAL FIXO — PROJETO MUSEUS CENTRO (usar obrigatoriamente):

GESTÃO E COORDENAÇÃO:
- Projeto iniciou com Andréia Matos como coordenadora geral
- Daniel Perini assumiu a coordenação executiva a partir de fevereiro/março de 2026
- Ana Luiza atua como coordenadora técnica/museóloga do projeto
- Houve pausa operacional em fevereiro de 2026 (período de transição de gestão)
- Retomada plena das atividades em março de 2026
- Projeto realizado em parceria com a Diretoria de Museus (DEMUS) da Fundação Municipal de Cultura de Belo Horizonte (FMC-BH)

PLATAFORMA E TECNOLOGIA:
- O projeto desenvolveu o Museu Centro APP: plataforma própria de gestão cultural, relatórios, acompanhamento financeiro, galeria de fotos e inteligência artificial
- O relatório foi produzido com o próprio Museu Centro APP, usando IA para auditoria técnica dos dados
- A plataforma integra: relatórios mensais, programação, fotos, compras, rubricas, notas fiscais e base de conhecimento

RITUAIS DE GESTÃO E PLANEJAMENTO:
- Projeto adotou rituais sistemáticos de gestão: reuniões semanais de alinhamento, ritual mensal de planejamento, fechamento de relatórios mensais
- Implementação de sistema de metas por ciclos (metas MC3A-20 a MC3A-25)
- Planejamento estratégico estruturado com foco em março-junho 2026

NOTURNO NOS MUSEUS:
- Evento estratégico de grande porte previsto para 2026 nos três museus (MIS, MHAB, MUMO)
- Parte central do Plano de Trabalho — maior exposição pública do projeto
- Preparação envolve produção executiva, comunicação, infraestrutura e equipes dos museus

MUSEUS:
- MIS: Museu da Imagem e do Som — foco em audiovisual, memória e comunicação
- MHAB: Museu Histórico Abílio Barreto — foco em memória histórica e território
- MUMO: Museu da Moda — foco em moda, identidade e design
- Viaduto das Artes: espaço de articulação territorial no centro de BH

ORÇAMENTO E EXECUÇÃO:
- 3º Termo Aditivo: R$ 1.320.000,00
- Execução concentrada nos meses seguintes (junho em diante): exposições, manutenção, produção, Noturno
- Baixo percentual de execução no início é esperado e decorre do cronograma
`;

// ── helpers ───────────────────────────────────────────────────────────────────

function parseDateStr(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

function mesStr(mes, ano) { return `${mes || ''}/${ano || ''}`.trim(); }

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

let _base44ForIA = null;

async function gerarTextoIA(prompt, usarModeloAvancado = false) {
  const modelo = usarModeloAvancado ? 'claude_sonnet_4_6' : 'claude_sonnet_4_6';
  const texto = await _base44ForIA.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: modelo,
  });
  return typeof texto === 'string' ? texto : (texto?.output || texto?.text || String(texto || ''));
}

async function gerarTextoIAComWeb(prompt) {
  // Busca web apenas para contextos de museologia, patrimônio, cultura, território
  const texto = await _base44ForIA.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: 'gemini_3_flash',
    add_context_from_internet: true,
  });
  return typeof texto === 'string' ? texto : (texto?.output || texto?.text || String(texto || ''));
}

function paragrafoHTML(texto) {
  if (!texto) return '';
  return (texto || '').split(/\n{2,}|\r?\n/).map(p => p.trim() ? `<p>${p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>` : '').join('');
}

function reportInPeriod(report, from, to) {
  const d = parseDateStr(report.submitted_at) || parseDateStr(report.created_date);
  if (d) return d >= from && d <= to;
  const idx = MESES_PT.findIndex(m => m === report.mes_referencia);
  if (idx < 0) return false;
  const rep = new Date(Number(report.ano || new Date().getFullYear()), idx, 1);
  return rep >= new Date(from.getFullYear(), from.getMonth(), 1) &&
         rep <= new Date(to.getFullYear(), to.getMonth(), 1);
}

// ── coleta integral da base de conhecimento ───────────────────────────────────

async function coletarDadosExpandidos(base44, from, to, museuFiltro) {
  const [reports, rubricas, purchases, attachments, programacao, nf_intake, agenda, releases, teamMembers, comunicacao,
    knowledge, reportPhotos, momentos, projectMeta, metaActivities] = await Promise.all([
    base44.asServiceRole.entities.Report.list('-created_date', 500),
    base44.asServiceRole.entities.Rubrica.list('grupo', 200),
    base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500),
    base44.asServiceRole.entities.Attachment.list('-created_date', 1000),
    base44.asServiceRole.entities.Programacao.list('-created_date', 500).catch(() => []),
    base44.asServiceRole.entities.DocumentIntake.list('-created_date', 1000).catch(() => []),
    base44.asServiceRole.entities.Agenda?.list?.('-created_date', 500).catch(() => []) || [],
    base44.asServiceRole.entities.Release?.list?.('-created_date', 500).catch(() => []) || [],
    base44.asServiceRole.entities.TeamMember?.list?.('-created_date', 500).catch(() => []) || [],
    base44.asServiceRole.entities.NewsHighlight?.list?.('-created_date', 200).catch(() => []) || [],
    base44.asServiceRole.entities.KnowledgeDocument?.list?.('-created_date', 300).catch(() => []) || [],
    base44.asServiceRole.entities.ReportPhoto?.list?.('-created_date', 500).catch(() => []) || [],
    base44.asServiceRole.entities.Momento?.list?.('-created_date', 200).catch(() => []) || [],
    base44.asServiceRole.entities.ProjectMeta?.list?.('-created_date', 50).catch(() => []) || [],
    base44.asServiceRole.entities.MetaActivity?.list?.('-created_date', 200).catch(() => []) || [],
  ]);

  const relsFiltrados = reports.filter(r => {
    if (!reportInPeriod(r, from, to)) return false;
    if (museuFiltro && r.museu !== museuFiltro) return false;
    return r.status === 'APPROVED';
  });

  const allAtividades = relsFiltrados.flatMap(r =>
    (Array.isArray(r.atividades) ? r.atividades : []).map(a => ({
      ...a,
      _report_id: r.id,
      _museu: r.museu,
      _mes: r.mes_referencia,
      _ano: r.ano,
      _author: r.author_name,
    }))
  );

  const comprasFiltradas = purchases.filter(p => {
    if (!['APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(p.status)) return false;
    const d = parseDateStr(p.data_pagamento) || parseDateStr(p.aprov_admin_data) || parseDateStr(p.created_date);
    if (!d || d < from || d > to) return false;
    if (museuFiltro && p.centro_custo && p.centro_custo !== museuFiltro && p.centro_custo !== 'Geral') return false;
    return true;
  });

  const reportIds = new Set(relsFiltrados.map(r => r.id));
  const attachsFiltrados = attachments.filter(a => reportIds.has(a.report_id));
  const rubricasAtivas = rubricas.filter(r => r.ativo !== false);
  const rubricaMap = Object.fromEntries(rubricas.map(r => [r.id, r.rubrica || r.grupo || '']));

  const progFiltradas = programacao.filter(p => {
    const d = parseDateStr(p.data_inicio || p.data_realizacao || p.created_date);
    if (!d) return false;
    if (museuFiltro && p.museu && p.museu !== museuFiltro) return false;
    return d >= from && d <= to;
  });

  const agendaFiltrada = agenda.filter(a => {
    const d = parseDateStr(a.data || a.created_date);
    if (!d || d < from || d > to) return false;
    if (museuFiltro && a.museu && a.museu !== museuFiltro) return false;
    return true;
  });

  const releasesFiltrados = releases.filter(r => {
    const d = parseDateStr(r.data_sincronizacao || r.created_date);
    if (!d || d < from || d > to) return false;
    if (museuFiltro && r.museus && !r.museus.includes(museuFiltro)) return false;
    return r.status === 'aprovado' || r.status === 'vinculado' || r.ativo;
  });

  const nfFiltradas = nf_intake.filter(d => {
    if (d.tipo_detectado !== 'NOTA_FISCAL_PDF' && d.tipo_detectado !== 'NOTA_FISCAL_XML') return false;
    const dt = parseDateStr(d.created_date);
    if (!dt || dt < from || dt > to) return false;
    return true;
  });

  const teamFiltrado = teamMembers.filter(t => {
    if (!t.status || t.status === 'INATIVO') return false;
    if (museuFiltro && t.museu_projeto && t.museu_projeto !== museuFiltro) return false;
    return true;
  });

  const comFiltrada = comunicacao.filter(c => {
    const d = parseDateStr(c.created_date);
    if (!d || d < from || d > to) return false;
    return c.ativo !== false;
  });

  const knowledgeAtivo = knowledge.filter(k => k.ativo !== false);

  const momentosFiltrados = momentos.filter(m => {
    const d = parseDateStr(m.data || m.created_date);
    if (!d || d < from || d > to) return false;
    return m.ativo !== false;
  });

  return {
    relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas, rubricaMap,
    progFiltradas, nfFiltradas, agendaFiltrada, releasesFiltrados, teamFiltrado, comFiltrada,
    knowledgeAtivo, reportPhotos, momentosFiltrados, projectMeta, metaActivities,
  };
}

// ── métricas expandidas ───────────────────────────────────────────────────────

function calcMetricasExpandidas({ relsFiltrados, allAtividades, comprasFiltradas, rubricasAtivas, progFiltradas, nfFiltradas, agendaFiltrada, releasesFiltrados, teamFiltrado }) {
  const totalRels = relsFiltrados.length;
  const totalAtiv = allAtividades.length;

  const publicoSemDuplicidade = allAtividades.reduce((s, a) => {
    const pubTotal = Number(a.publico_total) || 0;
    const pubEst = Number(a.publico_estimado) || 0;
    const reps = Math.max(Number(a.quantas_repeticoes) || 1, 1);
    return s + (pubTotal > 0 ? pubTotal : pubEst * reps);
  }, 0);

  const valorUtilizado = rubricasAtivas.reduce((s, r) => s + (Number(r.valor_utilizado) || 0), 0);
  const percentual = ORCAMENTO_TOTAL > 0 ? ((valorUtilizado / ORCAMENTO_TOTAL) * 100).toFixed(1) : 0;
  const saldo = ORCAMENTO_TOTAL - valorUtilizado;

  const topRubricas = [...rubricasAtivas].sort((a, b) => (b.valor_utilizado || 0) - (a.valor_utilizado || 0)).slice(0, 20);

  const valorPorMuseu = {};
  comprasFiltradas.forEach(p => {
    const m = p.centro_custo || 'Geral';
    valorPorMuseu[m] = (valorPorMuseu[m] || 0) + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0);
  });

  const porMuseu = Object.fromEntries(['MIS','MHAB','MUMO'].map(m => {
    const ativs = allAtividades.filter(a => a._museu === m);
    const pub = ativs.reduce((s, a) => {
      const pt = Number(a.publico_total) || 0;
      const pe = Number(a.publico_estimado) || 0;
      const rep = Math.max(Number(a.quantas_repeticoes) || 1, 1);
      return s + (pt > 0 ? pt : pe * rep);
    }, 0);
    return [m, { atividades: ativs.length, publico: pub }];
  }));

  // Análise por tipo de atividade
  const tiposAtividade = {};
  allAtividades.forEach(a => {
    const tipo = a.classificacao || a.tipo || 'Outros';
    tiposAtividade[tipo] = (tiposAtividade[tipo] || 0) + 1;
  });

  // Equipe por função
  const funcoesPorMuseu = {};
  relsFiltrados.forEach(r => {
    const museu = r.museu || 'Geral';
    if (!funcoesPorMuseu[museu]) funcoesPorMuseu[museu] = [];
    if (r.author_name && !funcoesPorMuseu[museu].includes(r.author_name)) {
      funcoesPorMuseu[museu].push(r.author_name);
    }
  });

  return {
    totalRels, totalAtiv, publicoTotal: publicoSemDuplicidade, porMuseu,
    valorUtilizado, percentual, saldo, topRubricas, valorPorMuseu,
    totalCompras: comprasFiltradas.length, totalNF: comprasFiltradas.filter(p => p.nf_numero).length,
    totalProgramacoes: (progFiltradas || []).length, totalAgenda: (agendaFiltrada || []).length,
    totalReleases: (releasesFiltrados || []).length, totalEquipe: (teamFiltrado || []).length,
    totalNFIntake: (nfFiltradas || []).length, tiposAtividade, funcoesPorMuseu,
  };
}

// ── construtor de contexto editorial completo ────────────────────────────────

function buildContextoEditorial(dados, metricas, periodoStr, museuStr, fotosAnalisadas = []) {
  const { relsFiltrados, allAtividades, releasesFiltrados, agendaFiltrada, teamFiltrado,
    comprasFiltradas, knowledgeAtivo, momentosFiltrados, progFiltradas, rubricasAtivas } = dados;

  const atividadesTitulos = allAtividades.slice(0, 60).map(a => a.titulo || a.nome || '').filter(Boolean).join('; ');
  const releasesTitulos = releasesFiltrados.slice(0, 20).map(r => r.titulo || r.conteudo_resumido?.slice(0, 60) || '').filter(Boolean).join('; ');
  const agendaTitulos = agendaFiltrada.slice(0, 20).map(a => a.titulo || a.evento || '').filter(Boolean).join('; ');

  const conhecimentoTexto = (knowledgeAtivo || []).slice(0, 8).map(k =>
    `${k.titulo || ''}: ${(k.conteudo_extraido || k.descricao || '').slice(0, 120)}`
  ).filter(Boolean).join('\n');

  const momentosTexto = (momentosFiltrados || []).slice(0, 5).map(m => m.descricao || m.titulo || '').filter(Boolean).join('; ');
  const analisesFotosTexto = fotosAnalisadas.slice(0, 15).map(f => f.analise_visual || '').filter(Boolean).join(' | ').slice(0, 800);

  const resumosRels = relsFiltrados.slice(0, 12).map(r =>
    [`[${r.author_name}/${r.museu}/${r.mes_referencia}]`,
      r.resumo_executivo, r.resumo_periodo, r.avaliacao_pontos_positivos
    ].filter(Boolean).join(' ').slice(0, 400)
  ).filter(Boolean).join('\n');

  // Top rubricas com saldo
  const rubricasInfo = rubricasAtivas.slice(0, 10).map(r => {
    const util = Number(r.valor_utilizado) || 0;
    const total = Number(r.valor_rubrica) || 0;
    const pct = total > 0 ? ((util/total)*100).toFixed(0) : '0';
    return `${r.rubrica || r.grupo}: R$${fmt(util)} / R$${fmt(total)} (${pct}%)`;
  }).join('\n');

  // Tipos de atividade
  const tiposStr = Object.entries(metricas.tiposAtividade || {})
    .sort((a,b) => b[1]-a[1]).slice(0,10)
    .map(([tipo, count]) => `${tipo}: ${count}`).join(', ');

  // Equipe por museu
  const equipeStr = Object.entries(metricas.funcoesPorMuseu || {})
    .map(([museu, nomes]) => `${museu}: ${nomes.slice(0,5).join(', ')}`).join(' | ');

  return `${CONTEXTO_INSTITUCIONAL}

DADOS REAIS VERIFICADOS — ${periodoStr} | ${museuStr}:
- Relatórios aprovados: ${metricas.totalRels}
- Atividades realizadas: ${metricas.totalAtiv}
- Público total: ${fmtInt(metricas.publicoTotal)}
- Programações: ${metricas.totalProgramacoes}
- Agenda: ${metricas.totalAgenda}
- Releases de comunicação: ${metricas.totalReleases}
- Equipe: ${metricas.totalEquipe} profissionais
- Compras aprovadas: ${metricas.totalCompras} (${metricas.totalNF} com NF)
- Execução financeira: ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)} de R$ ${fmt(ORCAMENTO_TOTAL)})
- Por museu: MIS=${metricas.porMuseu?.MIS?.atividades || 0} atv/${fmtInt(metricas.porMuseu?.MIS?.publico || 0)} púb | MHAB=${metricas.porMuseu?.MHAB?.atividades || 0} atv/${fmtInt(metricas.porMuseu?.MHAB?.publico || 0)} púb | MUMO=${metricas.porMuseu?.MUMO?.atividades || 0} atv/${fmtInt(metricas.porMuseu?.MUMO?.publico || 0)} púb

TÍTULOS DAS ATIVIDADES (${metricas.totalAtiv} total):
${atividadesTitulos || 'Não disponível'}

TIPOS DE ATIVIDADE:
${tiposStr || 'Variados'}

EQUIPE POR MUSEU:
${equipeStr || 'Equipes multidisciplinares'}

RELEASES DE COMUNICAÇÃO:
${releasesTitulos || 'Não disponível'}

AGENDA DO PERÍODO:
${agendaTitulos || 'Não disponível'}

BASE DE CONHECIMENTO:
${conhecimentoTexto || 'Não disponível'}

MOMENTOS MARCANTES:
${momentosTexto || 'Não disponível'}

ANÁLISE VISUAL DE IMAGENS:
${analisesFotosTexto || 'Sem análise visual disponível'}

RUBRICAS PRINCIPAIS (execução):
${rubricasInfo || 'Não disponível'}

TRECHOS DOS RELATÓRIOS APROVADOS:
${resumosRels || 'Não disponível'}

REGRAS ABSOLUTAS DE ESCRITA:
1. Tom: INSTITUCIONAL, TÉCNICO, CURATORIAL, ANALÍTICO — nunca promocional ou genérico
2. Idioma: Português do Brasil culto, sem erros, sem travessão excessivo
3. Usar SOMENTE dados verificados acima — NUNCA inventar números, datas, nomes ou fatos
4. Mínimo 3 parágrafos por seção, cada um com mínimo 80 palavras
5. Cruzar múltiplas fontes: relatórios ↔ atividades ↔ releases ↔ agenda ↔ conhecimento
6. Evitar: "foi realizado", "cabe destacar", "é importante ressaltar", frases genéricas de IA
7. Mencionar museus (MIS, MHAB, MUMO) e seus contextos quando relevante
8. Usar contexto institucional fixo para enriquecer a narrativa`;
}

// ── prompts institucionais específicos ────────────────────────────────────────

function buildPromptIntroducao(ctxEditorial, metricas, periodoStr, museuStr) {
  return `${ctxEditorial}

TAREFA: Redigir a Introdução Institucional do Relatório Físico-Financeiro do Projeto Museus Centro.

Diretrizes editoriais (4 parágrafos mínimos):

Contextualize institucionalmente o período analisado.
Apresentar o período (${periodoStr}), o projeto Museus Centro, a parceria com a DEMUS/FMC-BH, e a importante transição de coordenação que marcou o início do período: Andréia Matos e a chegada de Daniel Perini à coordenação executiva, com Ana Luiza como referência técnica. Mencionar a pausa de fevereiro como momento de reorganização e a retomada plena em março.

Analise o escopo consolidado das atividades e relatórios.
Descrever que o relatório consolida ${metricas.totalRels} relatórios aprovados das equipes do MIS, MHAB e MUMO, comunicação, produção executiva e coordenação financeira. Contextualizar a amplitude das ${metricas.totalAtiv} atividades realizadas, com público de ${fmtInt(metricas.publicoTotal)} pessoas nas ações abertas.

Descreva o papel do Museu Centro APP na gestão e auditoria técnica.
Apresentar o Museu Centro APP como instrumento de gestão cultural desenvolvido especificamente para o projeto — integra relatórios, programação, fotos, compras, rubricas e prestação de contas. Destacar que este relatório foi produzido com o uso do aplicativo e que inteligência artificial foi utilizada como camada de auditoria técnica dos dados, sem substituir a análise da coordenação.

Analise os rituais de gestão, planejamento e monitoramento.
Descrever a implementação de rituais sistemáticos de gestão (reuniões semanais, planejamento mensal, fechamento de relatórios), o trabalho de estruturação operacional do período, e o horizonte do Noturno nos Museus como evento central da segunda metade de 2026.

Tom: institucional, editorial, denso, técnico-cultural. Sem linguagem de marketing.
Redija os 4 parágrafos completos:`;
}

function buildPromptConclusao(ctxEditorial, metricas, periodoStr) {
  return `${ctxEditorial}

TAREFA: Redigir a Conclusão Institucional do Relatório Físico-Financeiro.

Diretrizes editoriais (3 parágrafos):

PARÁGRAFO 1 — ANÁLISE INSTITUCIONAL E CONSOLIDAÇÃO:
Analisar o período ${periodoStr} como etapa de consolidação estrutural do Projeto Museus Centro. Com ${metricas.totalRels} relatórios aprovados, ${metricas.totalAtiv} atividades realizadas e ${fmtInt(metricas.publicoTotal)} pessoas alcançadas, o período marcou a transição de gestão, a implantação de rituais operacionais e o amadurecimento dos processos internos. Relacionar com a missão do projeto: memória, cultura, território e transformação social no centro de BH.

PARÁGRAFO 2 — EXECUÇÃO FINANCEIRA E PRÓXIMOS PASSOS:
Contextualizar que a execução financeira de ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)} de R$ ${fmt(ORCAMENTO_TOTAL)}) corresponde ao cronograma previsto: os maiores investimentos estão concentrados no segundo semestre, com montagem de exposições, Noturno nos Museus, adequações de espaços, manutenção e produção cultural ampliada. Indicar os próximos passos estratégicos.

PARÁGRAFO 3 — IMPACTO CULTURAL E MEMÓRIA INSTITUCIONAL:
Refletir sobre o impacto cultural do projeto no território do centro histórico de BH, a contribuição para a memória institucional dos museus, e o papel do Museu Centro APP na produção de evidências e na transparência da gestão. Destacar que o relatório não apenas documenta ações passadas, mas inaugura uma forma mais qualificada de monitoramento e prestação de contas do projeto.

Tom: reflexivo, institucional, cultural, analítico. Denso e preciso.
Redija os 3 parágrafos:`;
}

function buildPromptAnaliseAtividades(ctxEditorial, metricas) {
  return `${ctxEditorial}

TAREFA: Análise institucional das atividades realizadas, organizadas por eixo e museu.

ESTRUTURA (4 parágrafos):

PARÁGRAFO 1 — METAS E PROGRAMAÇÃO:
Analisar o cumprimento das metas do 3º Aditivo (MC3A-20 a MC3A-25) no período. Contextualizar as ${metricas.totalProgramacoes} programações e ${metricas.totalAtiv} atividades dentro do plano de trabalho. Relacionar tipos de atividade com os objetivos estratégicos de cada museu.

PARÁGRAFO 2 — PÚBLICO E ALCANCE:
Analisar o alcance de ${fmtInt(metricas.publicoTotal)} pessoas nas atividades abertas ao público. Distinguir atividades públicas (oficinas, visitas mediadas, eventos) de atividades internas (gestão, produção, manutenção). Por museu: MIS com ${metricas.porMuseu?.MIS?.atividades || 0} atividades / ${fmtInt(metricas.porMuseu?.MIS?.publico || 0)} pessoas; MHAB com ${metricas.porMuseu?.MHAB?.atividades || 0} / ${fmtInt(metricas.porMuseu?.MHAB?.publico || 0)}; MUMO com ${metricas.porMuseu?.MUMO?.atividades || 0} / ${fmtInt(metricas.porMuseu?.MUMO?.publico || 0)}.

PARÁGRAFO 3 — EXECUÇÃO FINANCEIRA:
Análise da execução financeira de ${metricas.percentual}% com ${metricas.totalCompras} compras aprovadas. Contextualizar rubricas mais utilizadas, perfil dos gastos (equipe, comunicação, produção, infraestrutura) e a lógica do cronograma orçamentário — maiores custos a partir de junho.

PARÁGRAFO 4 — COMUNICAÇÃO E VISIBILIDADE:
Síntese das ${metricas.totalReleases} releases e ações de comunicação. Impacto na visibilidade institucional dos museus, cobertura de imprensa, redes sociais e presença territorial. Relação com as metas de comunicação do projeto.

Redija os 4 parágrafos com densidade analítica:`;
}

function buildPromptMetas(ctxEditorial, metricas, dados) {
  const { projectMeta, metaActivities } = dados;

  const metasInfo = (Array.isArray(projectMeta) ? projectMeta : []).slice(0, 10).map(m =>
    `${m.codigo || m.meta || ''}: ${m.descricao || ''} — Execução: ${m.percentual_execucao || m.status || 'em andamento'}`
  ).filter(Boolean).join('\n');

  return `${ctxEditorial}

METAS DO 3º ADITIVO REGISTRADAS NO SISTEMA:
${metasInfo || 'MC3A-20 a MC3A-25 e Meta Extra — em execução conforme plano de trabalho'}

TAREFA: Síntese analítica das metas do 3º Aditivo no período.

ESTRUTURA (3 parágrafos):

PARÁGRAFO 1: Contextualizar as metas MC3A-20 a MC3A-25, seu vínculo com os museus e a lógica de execução por ciclo. Relacionar com as atividades realizadas e o público alcançado.

PARÁGRAFO 2: Analisar o andamento da execução física e financeira por meta. Identificar metas em bom andamento e eventuais ajustes necessários. Contextualizar o papel do Noturno nos Museus como meta estratégica central.

PARÁGRAFO 3: Perspectivas para o próximo período — quais metas demandam aceleração, quais estão no ritmo previsto, e como a estruturação operacional do período atual cria condições para o segundo semestre.

Redija os parágrafos com base nos dados reais:`;
}

function buildPromptComunicacao(ctxEditorial, metricas, dados) {
  const { releasesFiltrados, comFiltrada } = dados;

  const releasesDetalhe = releasesFiltrados.slice(0, 10).map(r =>
    `"${r.titulo}": ${(r.conteudo_resumido || r.palavras_chave?.join(', ') || '').slice(0, 100)}`
  ).filter(Boolean).join('\n');

  return `${ctxEditorial}

RELEASES DETALHADOS DO PERÍODO:
${releasesDetalhe || 'Não disponível'}

TAREFA: Análise da comunicação e visibilidade institucional do período.

ESTRUTURA (3 parágrafos):

PARÁGRAFO 1: Síntese da produção de comunicação: ${metricas.totalReleases} releases, presença nas redes sociais, cobertura de imprensa. Descrever o perfil editorial das publicações — temas, museus, tipos de atividade cobertos.

PARÁGRAFO 2: Análise do impacto de visibilidade. Como a comunicação contribuiu para a imagem pública dos museus e do projeto. Relacionar com o território do centro histórico de BH.

PARÁGRAFO 3: Estratégia de comunicação para os próximos meses — preparação para o Noturno nos Museus, campanhas de exposições, fortalecimento da identidade visual do projeto.

Redija com linguagem editorial e institucional:`;
}

function buildPromptPrestacaoContas(ctxEditorial, metricas) {
  return `${ctxEditorial}

TAREFA: Prestação de contas integral — texto formal para a DEMUS/FMC-BH.

ESTRUTURA (4 parágrafos):

PARÁGRAFO 1 — SÍNTESE EXECUTIVA:
Síntese formal da execução do projeto no período: ${metricas.totalRels} relatórios, ${metricas.totalAtiv} atividades, ${fmtInt(metricas.publicoTotal)} pessoas de público, ${metricas.totalCompras} compras com ${metricas.totalNF} notas fiscais. Afirmar que todos os dados foram produzidos com o Museu Centro APP e auditados com inteligência artificial.

PARÁGRAFO 2 — ANÁLISE FINANCEIRA:
Execução de ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)} utilizados de R$ ${fmt(ORCAMENTO_TOTAL)} do 3º Aditivo). Contextualizar que o percentual baixo é esperado: cronograma prevê concentração dos gastos no segundo semestre (exposições, Noturno, manutenção, produção). Saldo disponível: R$ ${fmt(metricas.saldo)}.

PARÁGRAFO 3 — RASTREABILIDADE DOCUMENTAL:
Descrever a documentação disponível: ${metricas.totalNFIntake} notas fiscais no sistema, compras vinculadas a rubricas orçamentárias, contratos da equipe, registros fotográficos e relatórios mensais aprovados. O Museu Centro APP garante rastreabilidade completa de cada gasto e atividade.

PARÁGRAFO 4 — CONFORMIDADE E TRANSPARÊNCIA:
Afirmar a conformidade do projeto com as obrigações do 3º Aditivo, a transparência dos processos de aprovação de compras (dois níveis: coordenação e administração), e o compromisso com a qualificação contínua da prestação de contas.

Tom: formal, técnico, auditável. Para uso em documentação oficial.
Redija os 4 parágrafos:`;
}

// ── análise de imagens com contexto visual ─────────────────────────────────────

async function analisarImagensComVisao(fotosList, base44) {
  if (!fotosList || fotosList.length === 0) return [];

  const fotosAnalisadas = [];

  for (const foto of fotosList.slice(0, 40)) {
    if (!foto.url) continue;

    try {
      const analiseVisual = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Analise esta imagem de uma atividade cultural do Projeto Museus Centro (BH) e descreva em 2-3 linhas:
- Tipo de atividade (oficina, exposição, visita mediada, evento, reunião, produção)
- Elementos principais visíveis (público, materiais, espaço, interação, arte)
- Contexto cultural e institucional
Seja conciso, técnico e preciso.`,
        file_urls: [foto.url],
        model: 'gemini_3_flash',
      });

      fotosAnalisadas.push({
        ...foto,
        analise_visual: typeof analiseVisual === 'string' ? analiseVisual : (analiseVisual?.output || ''),
      });
    } catch (err) {
      fotosAnalisadas.push({ ...foto, analise_visual: '' });
    }
  }

  return fotosAnalisadas;
}

// ── construção de fotos com curadoria automática ───────────────────────────────

function buildFotosComLegenda(allAtividades, reportPhotos, rubricaMap) {
  const lista = [];
  const usedUrls = new Set();

  allAtividades.forEach(a => {
    const fotos = Array.isArray(a.fotos) ? a.fotos : [];
    fotos.forEach(f => {
      if (!f.file_url && !f.drive_url) return;
      const url = f.file_url || f.drive_url;
      if (!url || usedUrls.has(url)) return;
      usedUrls.add(url);

      const dataFmt = a.data_realizacao || a.data_inicio || mesStr(a._mes, a._ano) || 'não informado';
      const legenda = `${a.titulo || a.nome || 'Atividade'} — ${a._museu || ''} — ${dataFmt}`;
      const driveLink = f.drive_url || (f.drive_file_id ? `https://drive.google.com/file/d/${f.drive_file_id}/view` : null);

      lista.push({
        url: f.file_url || null,
        driveLink,
        legenda,
        altLegenda: f.legenda || a.titulo || '',
        fonte: 'atividade',
        atividade_id: a._report_id,
      });
    });
  });

  if (Array.isArray(reportPhotos)) {
    reportPhotos.forEach(rp => {
      if (!rp.file_url && !rp.drive_url) return;
      const url = rp.file_url || rp.drive_url;
      if (!url || usedUrls.has(url)) return;
      usedUrls.add(url);

      lista.push({
        url: rp.file_url || null,
        driveLink: rp.drive_url || null,
        legenda: rp.descricao || rp.titulo || 'Registro do período',
        altLegenda: rp.titulo || '',
        fonte: 'relatorio',
      });
    });
  }

  return lista.sort((a, b) => {
    const scoreA = (a.url ? 2 : 0) + (a.fonte === 'atividade' ? 1 : 0);
    const scoreB = (b.url ? 2 : 0) + (b.fonte === 'atividade' ? 1 : 0);
    return scoreB - scoreA;
  });
}

// ── geração de todos os textos IA em paralelo ─────────────────────────────────

async function gerarTodosTextosIA(dados, metricas, secoes, periodoStr, museuStr, fotosAnalisadas, opcoes) {
  const { introIA = true, modoEntrega = false } = opcoes;
  const ctxEditorial = buildContextoEditorial(dados, metricas, periodoStr, museuStr, fotosAnalisadas);

  const prompts = {};

  // 1. INTRODUÇÃO com contexto institucional completo
  if (introIA && secoes.includes('introducao')) {
    prompts.introducao = buildPromptIntroducao(ctxEditorial, metricas, periodoStr, museuStr);
  }

  // 2. AGENDA E PROGRAMAÇÃO
  if (secoes.includes('agenda_programacao')) {
    prompts.agenda = `${ctxEditorial}

TAREFA: Análise da agenda e programação do período.

Redija 3 parágrafos que cubram:
1. Contexto operacional das ${metricas.totalProgramacoes} programações — diversidade tipológica, distribuição pelos museus, articulação com o plano de trabalho
2. Dinâmica concreta das atividades realizadas — espaços, públicos, formatos, interações
3. Continuidade e regularidade — como a programação do período prepara o segundo semestre e o Noturno nos Museus

Linguagem editorial, técnica, institucional:`;
  }

  // 3. RELATÓRIOS COMPLETOS
  if (secoes.includes('relatorios_completos')) {
    prompts.relatorios = `${ctxEditorial}

TAREFA: Síntese narrativa dos ${metricas.totalRels} relatórios aprovados no período.

3 parágrafos:
1. Perfil das equipes e cobertura: quem reportou, quais museus, qual diversidade de funções
2. Principais achados dos relatórios: pontos positivos, desafios, dinâmicas internas, qualidade dos registros
3. O relatório como instrumento de gestão e memória — como o sistema de relatórios do Museu Centro APP qualifica a produção de evidências

Tom analítico e institucional:`;
  }

  // 4. ATIVIDADES
  if (secoes.includes('atividades_consolidadas')) {
    prompts.atividades = buildPromptAnaliseAtividades(ctxEditorial, metricas);
  }

  // 5. METAS
  if (secoes.includes('metas')) {
    prompts.metas = buildPromptMetas(ctxEditorial, metricas, dados);
  }

  // 6. COMUNICAÇÃO
  if (secoes.includes('comunicacao')) {
    prompts.comunicacao = buildPromptComunicacao(ctxEditorial, metricas, dados);
  }

  // 7. PRESTAÇÃO DE CONTAS
  if (secoes.includes('prestacao_integral')) {
    prompts.prestacao = buildPromptPrestacaoContas(ctxEditorial, metricas);
  }

  // 8. CONCLUSÃO
  if (secoes.includes('conclusao')) {
    prompts.conclusao = buildPromptConclusao(ctxEditorial, metricas, periodoStr);
  }

  // 9. TERRITÓRIO (busca web leve — patrimônio, museologia, cultura)
  if (secoes.includes('territorio')) {
    prompts.territorio_web = `Forneça contexto técnico e cultural (2 parágrafos densos) sobre:
- O papel dos museus MIS, MHAB e MUMO no ecossistema cultural do centro histórico de Belo Horizonte
- A relevância museológica e patrimonial do projeto Museus Centro no contexto da museologia brasileira contemporânea
- Referências ao campo do patrimônio cultural urbano, memória social e mediação cultural em museus

Use perspectiva técnica, citando conceitos de museologia, patrimônio imaterial, mediação cultural e território.
Período de referência: ${periodoStr}`;
  }

  // Executar IA em paralelo em lotes de 3
  const textos = {};
  const keys = Object.keys(prompts);

  for (let i = 0; i < keys.length; i += 3) {
    const batch = keys.slice(i, i + 3);
    const results = await Promise.all(batch.map(k => {
      if (k === 'territorio_web') {
        return gerarTextoIAComWeb(prompts[k]);
      }
      return gerarTextoIA(prompts[k]);
    }));
    batch.forEach((k, j) => { textos[k] = results[j]; });
  }

  return textos;
}


function gerarAnexosRelatoriosIndividuais(relsFiltrados = []) {
  if (!Array.isArray(relsFiltrados) || relsFiltrados.length === 0) {
    return '';
  }

  return `
    <div class="secao">
      <h2>Anexos — Relatórios Individuais</h2>

      ${relsFiltrados.map((r, index) => {
        const atividades = Array.isArray(r.atividades)
          ? r.atividades
          : [];

        return `
          <div class="anexo-relatorio" style="page-break-before:always;margin-top:40px;">
            <h3>
              ${String(index + 1).padStart(2, '0')} —
              ${r.author_name || 'Profissional'}
            </h3>

            <p>
              <strong>Museu:</strong> ${r.museu || '—'}<br>
              <strong>Função:</strong> ${r.funcao || '—'}<br>
              <strong>Período:</strong> ${r.mes_referencia || '—'}/${r.ano || '—'}
            </p>

            ${r.resumo_executivo ? `
              <div class="destaque-box">
                <p>${r.resumo_executivo}</p>
              </div>
            ` : ''}

            ${atividades.map(a => `
              <div style="margin:18px 0;padding:14px;border:1px solid #e5e5e5;border-radius:8px;">
                <h4 style="margin:0 0 8px;">
                  ${a.titulo || a.nome || 'Atividade'}
                </h4>

                <p>
                  ${a.descricao_executado || a.descricao || ''}
                </p>

                ${a.resultados_impactos ? `
                  <p>
                    <strong>Impactos:</strong>
                    ${a.resultados_impactos}
                  </p>
                ` : ''}

                ${a.problemas ? `
                  <p>
                    <strong>Problemas:</strong>
                    ${a.problemas}
                  </p>
                ` : ''}

                ${a.solucoes ? `
                  <p>
                    <strong>Soluções:</strong>
                    ${a.solucoes}
                  </p>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}


// ── geração de HTML completo ───────────────────────────────────────────────────

async function gerarHTMLCompleto(dados, metricas, secoes, dateFrom, dateTo, museuFiltro, opcoes, fotosAnalisadas = []) {
  const { allAtividades, comprasFiltradas, rubricasAtivas, rubricaMap, relsFiltrados,
    progFiltradas, agendaFiltrada, releasesFiltrados, teamFiltrado, comFiltrada,
    projectMeta, metaActivities } = dados;
  const periodoStr = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
  const museuStr = museuFiltro || 'Todos os Museus';

  // Gerar todos os textos IA
  const textos = await gerarTodosTextosIA(dados, metricas, secoes, periodoStr, museuStr, fotosAnalisadas, opcoes);

  const fotosComLegenda = buildFotosComLegenda(allAtividades, dados.reportPhotos, rubricaMap);
  const fotoCapa = fotosComLegenda[0];

  // ── CSS refinado ──────────────────────────────────────────────────────────
  const css = `
    @page {
      margin: 2.5cm 2cm;
      @bottom-center { content: counter(page) ' / ' counter(pages); font-size: 9pt; color: #aaa; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      font-size: 11.5px;
      line-height: 1.7;
      background: #fff;
      counter-reset: section;
    }
    h1 { font-size: 32px; font-weight: 700; margin: 0 0 12px; letter-spacing: -0.5px; }
    h2 {
      font-size: 17px;
      font-weight: 700;
      border-bottom: 2.5px solid #111;
      padding-bottom: 7px;
      margin: 48px 0 18px;
      page-break-after: avoid;
      letter-spacing: -0.2px;
      counter-increment: section;
    }
    h2::before {
      content: counter(section, decimal-leading-zero) ". ";
      color: #777;
      font-size: 12px;
      font-weight: 400;
    }
    h3 { font-size: 13px; font-weight: 600; margin: 22px 0 8px; color: #222; }
    p { margin: 0 0 14px; text-align: justify; hyphens: auto; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10px; }
    th { background: #111; color: #fff; padding: 6px 10px; text-align: left; font-weight: 600; font-size: 9.5px; letter-spacing: 0.3px; }
    td { padding: 5px 10px; border-bottom: 1px solid #ebebeb; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    tr:hover td { background: #f0f0f0; }
    .capa {
      min-height: 300px;
      padding: 80px 40px 60px;
      background: linear-gradient(135deg, #0a0a14 0%, #1a1040 50%, #0a0a12 100%);
      color: white;
      text-align: center;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .capa-img-bg {
      position: absolute; inset: 0;
      background-size: cover; background-position: center;
      opacity: 0.35;
    }
    .capa-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, rgba(10,10,20,0.5) 0%, rgba(10,10,20,0.85) 100%);
    }
    .capa-content { position: relative; z-index: 2; }
    .capa h1 { color: white; font-size: 38px; margin-bottom: 10px; }
    .capa .subtitle { color: rgba(255,255,255,0.7); font-size: 15px; margin: 6px 0; }
    .capa .kpis-capa {
      display: flex; gap: 0; justify-content: center;
      border-top: 1px solid rgba(255,255,255,0.15);
      padding-top: 24px; margin-top: 32px; flex-wrap: wrap;
    }
    .capa .kpi-c {
      padding: 0 28px; border-right: 1px solid rgba(255,255,255,0.12);
    }
    .capa .kpi-c:last-child { border-right: 0; }
    .capa .kpi-c .val { font-size: 26px; font-weight: 700; color: white; display: block; line-height: 1; }
    .capa .kpi-c .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(255,255,255,0.5); margin-top: 5px; display: block; }
    .capa .rodape-capa { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 28px; letter-spacing: 0.15em; text-transform: uppercase; }

    /* Sumário */
    .sumario { page-break-after: always; padding: 20px 0; }
    .sumario h2 { counter-increment: none; }
    .sumario h2::before { content: ''; }
    .sumario ol { list-style: none; padding: 0; }
    .sumario li {
      padding: 8px 0;
      border-bottom: 1px dotted #ddd;
      font-size: 12px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .sumario li .num { color: #999; font-size: 10px; min-width: 24px; }
    .sumario li .titulo-item { flex: 1; }

    /* Seções */
    .secao { page-break-before: always; }
    .secao:first-of-type { page-break-before: auto; }

    /* KPIs */
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
    .kpi { background: #f7f7f7; border-radius: 6px; padding: 14px 16px; border: 1px solid #e8e8e8; }
    .kpi.dark { background: #111; color: white; }
    .kpi .val { font-size: 22px; font-weight: 700; display: block; line-height: 1; }
    .kpi.dark .val { color: white; }
    .kpi .lbl { font-size: 9px; color: #888; margin-top: 4px; display: block; text-transform: uppercase; letter-spacing: 0.12em; }
    .kpi.dark .lbl { color: rgba(255,255,255,0.5); }

    /* Progresso */
    .progress-bar { background: #ebebeb; border-radius: 3px; height: 8px; margin: 8px 0 4px; overflow: hidden; }
    .progress-fill { height: 8px; border-radius: 3px; background: #111; }
    .progress-fill.orange { background: #f59e0b; }
    .progress-fill.red { background: #ef4444; }

    /* Fotos */
    .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 16px 0; }
    .foto-item { break-inside: avoid; }
    img.foto { max-width: 100%; max-height: 200px; width: 100%; object-fit: cover; border-radius: 5px; display: block; }
    .foto-legenda { font-size: 9px; color: #777; margin: 4px 0 0; line-height: 1.3; font-style: italic; }

    /* Badges */
    .badge { display: inline-block; background: #111; color: #fff; border-radius: 3px; padding: 2px 7px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
    .badge.green { background: #166534; }
    .badge.blue { background: #1e40af; }
    .badge.amber { background: #92400e; }
    .badge.red { background: #991b1b; }

    /* Rodapé */
    .rodape { font-size: 9px; color: #bbb; text-align: center; margin-top: 48px; border-top: 1px solid #eee; padding-top: 12px; }

    /* Caixa de destaque */
    .destaque-box {
      background: #f5f5f5;
      border-left: 3px solid #111;
      padding: 14px 18px;
      margin: 20px 0;
      border-radius: 0 5px 5px 0;
    }
    .destaque-box p { margin: 0; font-size: 12px; font-style: italic; color: #444; }

    /* Análise IA */
    .analise-ia {
      background: #fafafa;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 10px 0;
      font-size: 10px;
      color: #555;
      line-height: 1.5;
    }

    
    .anexo-relatorio {
      break-inside: avoid;
    }

    .anexo-relatorio h3 {
      font-size: 18px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 8px;
    }


    @media print {
      .secao { page-break-before: always; }
      .kpi-grid, .foto-item, .destaque-box, tr { page-break-inside: avoid; }
      h2, h3 { page-break-after: avoid; }
    }
  `;

  // ── Seções disponíveis para sumário ──────────────────────────────────────
  const SECAO_LABELS = {
    capa: 'Capa Editorial',
    introducao: 'Introdução Institucional',
    painel_executivo: 'Painel Executivo',
    metas: 'Metas do 3º Aditivo',
    agenda_programacao: 'Agenda e Programação',
    atividades_consolidadas: 'Atividades Consolidadas',
    relatorios_completos: 'Relatórios das Equipes',
    comunicacao: 'Comunicação e Visibilidade',
    fotos: 'Fotos e Registros',
    financeiro: 'Execução Financeira',
    rubricas: 'Rubricas Orçamentárias',
    notas_fiscais: 'Documentação Fiscal',
    compras: 'Compras e Pagamentos',
    equipe: 'Equipe e Profissionais',
    territorio: 'Território e Contexto Cultural',
    prestacao_integral: 'Prestação de Contas Integral',
    conclusao: 'Conclusão',
  };

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Institucional — Museus Centro</title><style>${css}</style></head><body>`;

  // ── CAPA ──────────────────────────────────────────────────────────────────
  if (secoes.includes('capa')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="capa">
      ${fotoCapa?.url ? `<div class="capa-img-bg" style="background-image:url('${fotoCapa.url}')"></div>` : ''}
      <div class="capa-overlay"></div>
      <div class="capa-content">
        <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:16px;">
          Museus Centro · Relatório Institucional Consolidado · ${new Date().getFullYear()}
        </div>
        <h1>Relatório Físico-Financeiro</h1>
        <div class="subtitle">Projeto Museus Centro</div>
        <div class="subtitle">${periodoStr}</div>
        <div class="subtitle" style="color:rgba(255,255,255,0.5);font-size:13px;">${museuStr}</div>

        <div class="kpis-capa">
          <div class="kpi-c"><span class="val">${metricas.totalRels}</span><span class="lbl">Relatórios</span></div>
          <div class="kpi-c"><span class="val">${fmtInt(metricas.publicoTotal)}</span><span class="lbl">Público</span></div>
          <div class="kpi-c"><span class="val">${metricas.totalAtiv}</span><span class="lbl">Atividades</span></div>
          <div class="kpi-c"><span class="val">${metricas.percentual}%</span><span class="lbl">Execução</span></div>
          <div class="kpi-c"><span class="val">${metricas.totalProgramacoes}</span><span class="lbl">Prog.</span></div>
          <div class="kpi-c"><span class="val">${metricas.totalEquipe}</span><span class="lbl">Equipe</span></div>
        </div>

        <div class="rodape-capa">MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.25);margin-top:10px;">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      </div>
    </div>`;
  }

  // ── SUMÁRIO ───────────────────────────────────────────────────────────────
  const sumarioItens = Object.entries(SECAO_LABELS).filter(([id]) => secoes.includes(id) && id !== 'capa');
  if (sumarioItens.length > 0) {
    html += `<div class="sumario secao">
      <h2 style="counter-increment:none;">Sumário</h2>
      <ol>
        ${sumarioItens.map(([id, label], idx) => `<li>
          <span class="num">${String(idx + 1).padStart(2, '0')}</span>
          <span class="titulo-item">${label}</span>
        </li>`).join('')}
      </ol>
    </div>`;
  }

  // ── INTRODUÇÃO ────────────────────────────────────────────────────────────
  if (secoes.includes('introducao')) {
    html += `<div class="secao">
      <h2>Introdução Institucional</h2>
      ${textos.introducao ? paragrafoHTML(textos.introducao) : `<p>Período analisado: ${periodoStr}. Projeto Museus Centro — parceria com DEMUS/FMC-BH.</p>`}
    </div>`;
  }

  // ── PAINEL EXECUTIVO ──────────────────────────────────────────────────────
  if (secoes.includes('painel_executivo')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="secao">
      <h2>Painel Executivo</h2>
      <div class="kpi-grid">
        <div class="kpi dark"><span class="val">${metricas.totalAtiv}</span><span class="lbl">Atividades realizadas</span></div>
        <div class="kpi dark"><span class="val">${fmtInt(metricas.publicoTotal)}</span><span class="lbl">Público total</span></div>
        <div class="kpi dark"><span class="val">${metricas.totalRels}</span><span class="lbl">Relatórios aprovados</span></div>
        <div class="kpi"><span class="val">${metricas.totalProgramacoes}</span><span class="lbl">Programações</span></div>
        <div class="kpi"><span class="val">${metricas.totalReleases}</span><span class="lbl">Releases</span></div>
        <div class="kpi"><span class="val">${metricas.totalEquipe}</span><span class="lbl">Profissionais</span></div>
        <div class="kpi"><span class="val">${metricas.totalCompras}</span><span class="lbl">Compras aprovadas</span></div>
        <div class="kpi"><span class="val">${metricas.totalNF}</span><span class="lbl">Notas fiscais</span></div>
        <div class="kpi"><span class="val">${metricas.percentual}%</span><span class="lbl">Execução financeira</span></div>
      </div>
      <h3>Por Museu</h3>
      <table>
        <thead><tr><th>Museu</th><th>Atividades</th><th>Público</th></tr></thead>
        <tbody>
          ${['MIS','MHAB','MUMO'].map(m => `<tr>
            <td><strong>${m}</strong></td>
            <td>${metricas.porMuseu?.[m]?.atividades || 0}</td>
            <td>${fmtInt(metricas.porMuseu?.[m]?.publico || 0)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <h3>Execução Financeira</h3>
      <p><strong>${metricas.percentual}%</strong> — R$ ${fmt(metricas.valorUtilizado)} utilizado de R$ ${fmt(ORCAMENTO_TOTAL)} (3º Aditivo)</p>
      <div class="progress-bar"><div class="progress-fill ${pct > 80 ? 'red' : pct > 60 ? 'orange' : ''}" style="width:${pct}%"></div></div>
      <p style="font-size:10px;color:#888;">Saldo disponível: R$ ${fmt(metricas.saldo)}</p>
    </div>`;
  }

  // ── METAS ─────────────────────────────────────────────────────────────────
  if (secoes.includes('metas')) {
    const metasData = Array.isArray(projectMeta) ? projectMeta : [];
    html += `<div class="secao">
      <h2>Metas do 3º Aditivo</h2>
      ${textos.metas ? paragrafoHTML(textos.metas) : ''}
      ${metasData.length > 0 ? `
        <h3>Acompanhamento por Meta</h3>
        <table>
          <thead><tr><th>Código</th><th>Meta</th><th>Status</th><th>Execução</th></tr></thead>
          <tbody>
            ${metasData.slice(0, 20).map(m => `<tr>
              <td><strong>${m.codigo || m.meta || '—'}</strong></td>
              <td>${m.descricao || m.nome || '—'}</td>
              <td><span class="badge">${m.status || '—'}</span></td>
              <td>${m.percentual_execucao ? m.percentual_execucao + '%' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : `<p>Metas MC3A-20 a MC3A-25 em execução conforme o plano de trabalho do 3º Aditivo.</p>`}
    </div>`;
  }

  // ── AGENDA E PROGRAMAÇÃO ──────────────────────────────────────────────────
  if (secoes.includes('agenda_programacao')) {
    html += `<div class="secao">
      <h2>Agenda e Programação</h2>
      ${textos.agenda ? paragrafoHTML(textos.agenda) : ''}
      ${progFiltradas.length > 0 ? `
        <h3>Programações Executadas (${progFiltradas.length})</h3>
        <table>
          <thead><tr><th>Data</th><th>Título</th><th>Museu</th><th>Tipo</th><th>Público</th></tr></thead>
          <tbody>
            ${progFiltradas.slice(0, 60).map(p => `<tr>
              <td>${p.data_realizacao || p.data_inicio || '—'}</td>
              <td>${p.titulo || p.evento || '—'}</td>
              <td>${p.museu || '—'}</td>
              <td>${p.tipo || '—'}</td>
              <td>${p.publico || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p>Nenhuma programação registrada no período.</p>'}
    </div>`;
  }

  // ── ATIVIDADES CONSOLIDADAS ───────────────────────────────────────────────
  if (secoes.includes('atividades_consolidadas')) {
    html += `<div class="secao">
      <h2>Atividades Consolidadas (${metricas.totalAtiv})</h2>
      ${textos.atividades ? paragrafoHTML(textos.atividades) : ''}
      <table>
        <thead><tr><th>Título</th><th>Museu</th><th>Mês</th><th>Tipo</th><th>Público</th><th>Profissional</th></tr></thead>
        <tbody>
          ${allAtividades.slice(0, 120).map(a => {
            const pub = (Number(a.publico_total) || 0) || ((Number(a.publico_estimado)||0) * Math.max(Number(a.quantas_repeticoes)||1,1));
            return `<tr>
              <td><strong>${a.titulo || a.nome || '—'}</strong></td>
              <td>${a._museu || '—'}</td>
              <td>${mesStr(a._mes, a._ano)}</td>
              <td><span class="badge">${(a.classificacao || '—').slice(0,18)}</span></td>
              <td>${pub > 0 ? fmtInt(pub) : 'N/A'}</td>
              <td>${a._author || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── RELATÓRIOS COMPLETOS ──────────────────────────────────────────────────
  if (secoes.includes('relatorios_completos')) {
    html += `<div class="secao">
      <h2>Relatórios das Equipes (${metricas.totalRels})</h2>
      ${textos.relatorios ? paragrafoHTML(textos.relatorios) : ''}
      <table>
        <thead><tr><th>Período</th><th>Museu</th><th>Profissional</th><th>Função</th><th>Atividades</th><th>Público</th></tr></thead>
        <tbody>
          ${relsFiltrados.map(r => `<tr>
            <td><strong>${r.mes_referencia}/${r.ano}</strong></td>
            <td>${r.museu || '—'}</td>
            <td>${r.author_name || '—'}</td>
            <td>${r.funcao || '—'}</td>
            <td>${(r.atividades || []).length}</td>
            <td>${fmtInt(r.publico_geral_declarado || 0)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── COMUNICAÇÃO ───────────────────────────────────────────────────────────
  if (secoes.includes('comunicacao')) {
    html += `<div class="secao">
      <h2>Comunicação e Visibilidade</h2>
      ${textos.comunicacao ? paragrafoHTML(textos.comunicacao) : ''}
      ${releasesFiltrados.length > 0 ? `
        <h3>Releases do Período (${releasesFiltrados.length})</h3>
        <table>
          <thead><tr><th>Título</th><th>Museus</th><th>Mês/Ano</th><th>Status</th></tr></thead>
          <tbody>
            ${releasesFiltrados.slice(0, 40).map(r => `<tr>
              <td>${r.titulo || '—'}</td>
              <td>${(r.museus || []).join(', ') || '—'}</td>
              <td>${r.mes || '—'}/${r.ano || '—'}</td>
              <td><span class="badge">${r.status || '—'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>`;
  }

  // ── TERRITÓRIO ────────────────────────────────────────────────────────────
  if (secoes.includes('territorio')) {
    html += `<div class="secao">
      <h2>Território e Contexto Cultural</h2>
      ${textos.territorio_web ? paragrafoHTML(textos.territorio_web) : '<p>Museus localizados no centro histórico de Belo Horizonte — MIS, MHAB e MUMO em articulação com o Viaduto das Artes.</p>'}
    </div>`;
  }

  // ── FOTOS E REGISTROS ─────────────────────────────────────────────────────
  if (secoes.includes('fotos')) {
    html += `<div class="secao">
      <h2>Fotos e Registros</h2>
      <p>${fotosComLegenda.length} registros fotográficos do período.</p>`;

    if (fotosAnalisadas.length > 0) {
      html += `<h3>Análise Visual dos Registros</h3>`;
      fotosAnalisadas.slice(0, 6).forEach((f, idx) => {
        if (f.analise_visual) {
          html += `<div class="analise-ia"><strong>Registro ${idx + 1}:</strong> ${f.analise_visual}</div>`;
        }
      });
    }

    if (fotosComLegenda.length > 0) {
      html += `<h3>Galeria Fotográfica</h3><div class="foto-grid">`;
      fotosComLegenda.slice(0, 48).forEach((f, i) => {
        if (i > 0 && i % 10 === 0) html += `</div><div class="foto-grid">`;
        html += `<div class="foto-item">
          ${f.url ? `<img class="foto" src="${f.url}" alt="${f.altLegenda}" loading="lazy"/>` : ''}
          <p class="foto-legenda">${f.legenda}</p>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<p>Nenhuma foto vinculada às atividades do período.</p>`;
    }
    html += `</div>`;
  }

  // ── EXECUÇÃO FINANCEIRA ───────────────────────────────────────────────────
  if (secoes.includes('financeiro')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="secao">
      <h2>Execução Financeira</h2>
      <div class="kpi-grid">
        <div class="kpi"><span class="val">R$ ${fmt(ORCAMENTO_TOTAL)}</span><span class="lbl">Orçamento 3º Aditivo</span></div>
        <div class="kpi dark"><span class="val">R$ ${fmt(metricas.valorUtilizado)}</span><span class="lbl">Utilizado</span></div>
        <div class="kpi"><span class="val">R$ ${fmt(metricas.saldo)}</span><span class="lbl">Saldo disponível</span></div>
      </div>
      <p><strong>Execução: ${metricas.percentual}%</strong></p>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="destaque-box"><p>O baixo percentual de execução é esperado e decorre do cronograma: os maiores investimentos estão concentrados no segundo semestre (montagem de exposições, Noturno nos Museus, adequações de espaços, produção cultural ampliada).</p></div>
      <h3>Top Rubricas — Execução</h3>
      <table>
        <thead><tr><th>Rubrica</th><th>Grupo</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>%</th></tr></thead>
        <tbody>
          ${metricas.topRubricas.slice(0, 20).map(r => {
            const saldo = (r.valor_rubrica || 0) - (r.valor_utilizado || 0);
            const pctExec = r.valor_rubrica > 0 ? ((r.valor_utilizado / r.valor_rubrica) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td><strong>${r.rubrica || '—'}</strong></td>
              <td>${r.grupo || '—'}</td>
              <td>R$ ${fmt(r.valor_rubrica)}</td>
              <td>R$ ${fmt(r.valor_utilizado)}</td>
              <td>R$ ${fmt(saldo)}</td>
              <td>${pctExec}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── DOCUMENTAÇÃO FISCAL ───────────────────────────────────────────────────
  if (secoes.includes('notas_fiscais')) {
    html += `<div class="secao">
      <h2>Documentação Fiscal</h2>
      <p><strong>Total no sistema:</strong> ${metricas.totalNFIntake} NF | ${metricas.totalNF} com PDF vinculado</p>
      ${comprasFiltradas.length > 0 ? `<table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>NF Nº</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>
          ${comprasFiltradas.slice(0, 70).map(p => `<tr>
            <td>${(p.descricao_item || '—').slice(0, 40)}</td>
            <td>${p.fornecedor_nome || '—'}</td>
            <td>${p.nf_numero || '—'}</td>
            <td>${p.nf_data_emissao || '—'}</td>
            <td>R$ ${fmt(p.valor_pago || p.valor_solicitado)}</td>
            <td><span class="badge">${p.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhuma compra registrada no período.</p>'}
    </div>`;
  }

  // ── RUBRICAS ──────────────────────────────────────────────────────────────
  if (secoes.includes('rubricas')) {
    html += `<div class="secao">
      <h2>Rubricas Orçamentárias (${rubricasAtivas.length})</h2>
      <table>
        <thead><tr><th>Rubrica</th><th>Grupo</th><th>Meta</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>%</th></tr></thead>
        <tbody>
          ${rubricasAtivas.map(r => {
            const util = Number(r.valor_utilizado) || 0;
            const total = Number(r.valor_rubrica) || 0;
            const saldo = total - util;
            const pct = total > 0 ? ((util / total) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td><strong>${r.rubrica || '—'}</strong></td>
              <td>${r.grupo || '—'}</td>
              <td>${r.meta || '—'}</td>
              <td>R$ ${fmt(total)}</td>
              <td>R$ ${fmt(util)}</td>
              <td>R$ ${fmt(saldo)}</td>
              <td>${pct}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── COMPRAS E PAGAMENTOS ──────────────────────────────────────────────────
  if (secoes.includes('compras')) {
    const totalPago = comprasFiltradas.reduce((s,p) => s + (Number(p.valor_pago) || 0), 0);
    html += `<div class="secao">
      <h2>Compras e Pagamentos (${metricas.totalCompras})</h2>
      <p><strong>Total pago no período:</strong> R$ ${fmt(totalPago)}</p>
      <table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Centro de Custo</th><th>Valor</th><th>Data</th><th>Status</th></tr></thead>
        <tbody>
          ${comprasFiltradas.slice(0, 100).map(p => `<tr>
            <td>${(p.descricao_item || '—').slice(0, 35)}</td>
            <td>${p.fornecedor_nome || '—'}</td>
            <td>${p.categoria || '—'}</td>
            <td>${p.centro_custo || '—'}</td>
            <td>R$ ${fmt(p.valor_pago || p.valor_solicitado)}</td>
            <td>${p.data_pagamento || '—'}</td>
            <td><span class="badge">${p.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── EQUIPE ────────────────────────────────────────────────────────────────
  if (secoes.includes('equipe')) {
    html += `<div class="secao">
      <h2>Equipe e Profissionais (${metricas.totalEquipe})</h2>
      ${teamFiltrado.length > 0 ? `<table>
        <thead><tr><th>Nome</th><th>Função</th><th>Museu / Projeto</th><th>Tipo</th><th>Contrato</th><th>Status</th></tr></thead>
        <tbody>
          ${teamFiltrado.slice(0, 70).map(t => `<tr>
            <td><strong>${t.user_name || '—'}</strong></td>
            <td>${t.funcao || '—'}</td>
            <td>${t.museu_projeto || '—'}</td>
            <td>${t.tipo_pessoa || '—'}</td>
            <td>${t.numero_contrato || '—'}</td>
            <td><span class="badge">${t.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhum membro ativo registrado.</p>'}
    </div>`;
  }

  // ── PRESTAÇÃO DE CONTAS INTEGRAL ──────────────────────────────────────────
  if (secoes.includes('prestacao_integral')) {
    html += `<div class="secao">
      <h2>Prestação de Contas Integral</h2>
      ${textos.prestacao ? paragrafoHTML(textos.prestacao) : ''}
      <h3>Resumo Executivo</h3>
      <table>
        <tbody>
          <tr><td><strong>Período</strong></td><td>${periodoStr}</td></tr>
          <tr><td><strong>Relatórios aprovados</strong></td><td>${metricas.totalRels}</td></tr>
          <tr><td><strong>Atividades realizadas</strong></td><td>${metricas.totalAtiv}</td></tr>
          <tr><td><strong>Público total</strong></td><td>${fmtInt(metricas.publicoTotal)}</td></tr>
          <tr><td><strong>Orçamento (3º Aditivo)</strong></td><td>R$ ${fmt(ORCAMENTO_TOTAL)}</td></tr>
          <tr><td><strong>Valor utilizado</strong></td><td>R$ ${fmt(metricas.valorUtilizado)}</td></tr>
          <tr><td><strong>Saldo disponível</strong></td><td>R$ ${fmt(metricas.saldo)}</td></tr>
          <tr><td><strong>Execução financeira</strong></td><td>${metricas.percentual}%</td></tr>
          <tr><td><strong>Compras aprovadas</strong></td><td>${metricas.totalCompras}</td></tr>
          <tr><td><strong>Notas fiscais</strong></td><td>${metricas.totalNF}</td></tr>
          <tr><td><strong>Rubricas ativas</strong></td><td>${rubricasAtivas.length}</td></tr>
          <tr><td><strong>Profissionais</strong></td><td>${metricas.totalEquipe}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  // ── CONCLUSÃO ─────────────────────────────────────────────────────────────
  if (secoes.includes('conclusao')) {
    html += `<div class="secao">
      <h2>Conclusão</h2>
      ${textos.conclusao ? paragrafoHTML(textos.conclusao) : '<p>Período analisado com consistência documental e física verificada.</p>'}
    </div>`;
  }

  html += gerarAnexosRelatoriosIndividuais(relsFiltrados);

  html += `<div class="rodape">
    Relatório Institucional — Projeto Museus Centro — Gerado com Museu Centro APP em ${new Date().toLocaleString('pt-BR')}<br>
    MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus — parceria DEMUS/FMC-BH
  </div></body></html>`;

  return html;
}

// ── handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const { dateFrom: df, dateTo: dt, museu: museuFiltro, secoes = [], modo = 'previa', modoEntrega = false, introIA = true } = body;

    if (!df || !dt) return Response.json({ error: 'Informe dateFrom e dateTo' }, { status: 400 });

    const from = new Date(df + 'T00:00:00');
    const to = new Date(dt + 'T23:59:59');

    _base44ForIA = base44;

    const dados = await coletarDadosExpandidos(base44, from, to, museuFiltro || null);
    const metricas = calcMetricasExpandidas(dados);

    if (modo === 'previa') {
      return Response.json({
        total_relatorios: metricas.totalRels,
        total_atividades: metricas.totalAtiv,
        publico_total: metricas.publicoTotal,
        valor_utilizado: metricas.valorUtilizado,
        percentual: metricas.percentual,
        total_compras: metricas.totalCompras,
        total_nf: metricas.totalNF,
        total_programacoes: metricas.totalProgramacoes,
        total_releases: metricas.totalReleases,
        total_equipe: metricas.totalEquipe,
        por_museu: metricas.porMuseu,
      });
    }

    // Análise visual de imagens
    const fotosParaAnalisar = buildFotosComLegenda(dados.allAtividades, dados.reportPhotos, dados.rubricaMap).slice(0, 20);
    const fotosAnalisadas = await analisarImagensComVisao(fotosParaAnalisar, base44);

    const secoesPadrao = [
      'capa','introducao','painel_executivo','metas','agenda_programacao',
      'atividades_consolidadas','relatorios_completos','comunicacao','fotos',
      'financeiro','rubricas','compras','equipe','prestacao_integral','conclusao'
    ];
    const secoesFinal = secoes.length > 0 ? secoes : secoesPadrao;

    const html = await gerarHTMLCompleto(dados, metricas, secoesFinal, from, to, museuFiltro || null, { modoEntrega, introIA }, fotosAnalisadas);
    return Response.json({ html });

  } catch (err) {
    console.error('gerarRelatorioFisicoFinanceiro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
