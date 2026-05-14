import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ORCAMENTO_TOTAL = 1320000;
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

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

function mesStr(mes, ano) { return `${mes || ''}/${ano || ''}`.trim(); }

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

let _base44ForIA = null;

async function gerarTextoIA(prompt) {
  const texto = await _base44ForIA.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: 'claude_sonnet_4_6',
  });
  return typeof texto === 'string' ? texto : (texto?.output || texto?.text || String(texto || ''));
}

function paragrafoHTML(texto) {
  return (texto || '').split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
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
    knowledge, reportPhotos, momentos, newsHighlight, comment, suggestion] = await Promise.all([
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
    base44.asServiceRole.entities.NewsHighlight?.list?.('-created_date', 100).catch(() => []) || [],
    base44.asServiceRole.entities.Comment?.list?.('-created_date', 300).catch(() => []) || [],
    base44.asServiceRole.entities.Suggestion?.list?.('-created_date', 100).catch(() => []) || [],
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
    if (museuFiltro && d.municipio && d.municipio !== museuFiltro) return false;
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

  const knowledgeAtivo = knowledge.filter(k => {
    const d = parseDateStr(k.created_date);
    if (!d || d < from || d > to) return false;
    return k.ativo !== false;
  });

  const momentosFiltrados = momentos.filter(m => {
    const d = parseDateStr(m.data || m.created_date);
    if (!d || d < from || d > to) return false;
    return m.ativo !== false;
  });

  return {
    relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas, rubricaMap, progFiltradas,
    nfFiltradas, agendaFiltrada, releasesFiltrados, teamFiltrado, comFiltrada, knowledgeAtivo, reportPhotos, momentosFiltrados,
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

  return {
    totalRels, totalAtiv, publicoTotal: publicoSemDuplicidade, porMuseu,
    valorUtilizado, percentual, saldo, topRubricas, valorPorMuseu,
    totalCompras: comprasFiltradas.length, totalNF: comprasFiltradas.filter(p => p.nf_numero).length,
    totalProgramacoes: (progFiltradas || []).length, totalAgenda: (agendaFiltrada || []).length,
    totalReleases: (releasesFiltrados || []).length, totalEquipe: (teamFiltrado || []).length,
    totalNFIntake: (nfFiltradas || []).length,
  };
}

// ── contexto editorial integral com análise de imagens ────────────────────────

function buildContextoEditorial(dados, metricas, periodoStr, museuStr, fotosAnalisadas = []) {
  const { relsFiltrados, allAtividades, releasesFiltrados, agendaFiltrada, teamFiltrado, comprasFiltradas, knowledgeAtivo, momentosFiltrados, progFiltradas } = dados;

  const atividadesTitulos = allAtividades.slice(0, 50).map(a => a.titulo || a.nome || '').filter(Boolean).join('; ');
  const releasesTitulos = releasesFiltrados.slice(0, 20).map(r => r.titulo || r.conteudo_resumido?.slice(0, 50) || '').filter(Boolean).join('; ');
  const agendaTitulos = agendaFiltrada.slice(0, 15).map(a => a.titulo || a.evento || '').filter(Boolean).join('; ');
  
  const conhecimentoTexto = (knowledgeAtivo || []).slice(0, 5).map(k => k.titulo || k.conteudo?.slice(0, 60) || '').filter(Boolean).join('; ');
  const momentosTexto = (momentosFiltrados || []).slice(0, 5).map(m => m.descricao || m.titulo || '').filter(Boolean).join('; ');
  
  const analisesFotosTexto = fotosAnalisadas.slice(0, 10).map(f => f.analise_visual || '').filter(Boolean).join(' | ').slice(0, 500);

  const resumosRels = relsFiltrados.slice(0, 10).map(r =>
    [r.resumo_executivo, r.resumo_periodo, r.avaliacao_pontos_positivos]
      .filter(Boolean).join(' | ').slice(0, 300)
  ).filter(Boolean).join('\n');
  
  const releasesCuratoriais = releasesFiltrados.slice(0, 5).map(r => ({
    titulo: r.titulo,
    resumo: r.conteudo_resumido || r.titulo,
    mes: r.mes,
    ano: r.ano
  }));

  return `Contexto Editorial Integral — Relatório Físico-Financeiro do Projeto Museus Centro
Período: ${periodoStr} | Museus: ${museuStr}

INDICADORES REAIS VERIFICADOS:
- Relatórios: ${metricas.totalRels} aprovados
- Atividades realizadas: ${metricas.totalAtiv}
- Público total: ${metricas.publicoTotal.toLocaleString('pt-BR')}
- Programações: ${metricas.totalProgramacoes}
- Agenda registrada: ${metricas.totalAgenda}
- Releases: ${metricas.totalReleases}
- Equipe: ${metricas.totalEquipe} profissionais
- Compras: ${metricas.totalCompras} (${metricas.totalNF} com NF)
- Execução financeira: ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)})

TÍTULOS DE ATIVIDADES:
${atividadesTitulos || 'Não informado'}

RELEASES REGISTRADOS:
${releasesTitulos || 'Não informado'}

AGENDA DO PERÍODO:
${agendaTitulos || 'Não informado'}

BASE DE CONHECIMENTO:
${conhecimentoTexto || 'Não informado'}

MOMENTOS MARCANTES:
${momentosTexto || 'Não informado'}

ANÁLISE VISUAL DE IMAGENS (contexto fotográfico):
${analisesFotosTexto || 'Sem análise visual disponível'}

TRECHOS DOS RELATÓRIOS:
${resumosRels || 'Não informado'}

DIRETRIZES OBRIGATÓRIAS:
1. Use SOMENTE dados verificados acima — NUNCA invente números ou fatos.
2. Consulte simultaneamente: relatórios, atividades, releases, agenda, programação, conhecimento, imagens.
3. Utilize análise visual das imagens para contextualizar e enriquecer narrativa.
4. Linguagem institucional, editorial, sofisticada e analítica.
5. Contextualize atividades — relate ao público, ao impacto territorial, ao diálogo.
6. Evite: frases genéricas, "foi realizado" repetido, linguagem automática, textos superficiais.
7. Cruze múltiplas fontes: agenda ↔ atividade ↔ release ↔ relatório ↔ imagem ↔ conhecimento.
8. Produza textos densos, completos, curatoriais e editorializada.
9. Se análise visual confirma contexto, use para enriquecer — ex: "identificar público, materiais, dinâmica".
10. Mencione museus (MIS, MHAB, MUMO) quando relevante.
11. Confiança mínima >= 95% para informações extraídas.`;
}

// ── análise de imagens com contexto visual ─────────────────────────────────────

async function analisarImagensComVisao(fotosList, base44) {
  if (!fotosList || fotosList.length === 0) return [];

  const fotosAnalisadas = [];
  
  for (const foto of fotosList.slice(0, 60)) {
    if (!foto.url) continue;
    
    try {
      // Análise visual com IA
      const analiseVisual = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Analise esta imagem de uma atividade cultural e identifique (máximo 2 linhas):
- tipo de atividade (oficina, exposição, visita, roda de conversa, apresentação, educativo);
- elementos visuais principais (materiais, público, espaço, interação);
- contexto institucional.

Seja conciso e direto.`,
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

  // Coletar fotos de atividades
  allAtividades.forEach(a => {
    const fotos = Array.isArray(a.fotos) ? a.fotos : [];
    fotos.forEach(f => {
      if (!f.file_url && !f.drive_url) return;
      const url = f.file_url || f.drive_url;
      if (!url || usedUrls.has(url)) return;
      usedUrls.add(url);

      const dataFmt = a.data_realizacao || a.data_inicio || mesStr(a._mes, a._ano) || 'não informado';
      const legenda = `${a.titulo || a.nome || 'Atividade'} — ${a._museu || ''} — ${dataFmt}`;
      const driveLink = f.drive_url || f.drive_file_id ? (f.drive_url || `https://drive.google.com/file/d/${f.drive_file_id}/view`) : null;
      
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

  // Adicionar fotos de relatório
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

  // Ordenar por diversidade e relevância
  return lista.sort((a, b) => {
    const scoreA = (a.url ? 2 : 0) + (a.fonte === 'atividade' ? 1 : 0);
    const scoreB = (b.url ? 2 : 0) + (b.fonte === 'atividade' ? 1 : 0);
    return scoreB - scoreA;
  });
}

// ── geração de HTML expandido ──────────────────────────────────────────────────

async function gerarHTMLCompleto(dados, metricas, secoes, dateFrom, dateTo, museuFiltro, opcoes, fotosAnalisadas = []) {
  const { allAtividades, comprasFiltradas, rubricasAtivas, rubricaMap, relsFiltrados, progFiltradas, agendaFiltrada, releasesFiltrados, teamFiltrado, comFiltrada } = dados;
  const periodoStr = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
  const museuStr = museuFiltro || 'Todos os Museus';
  const { modoEntrega = false, introIA = true } = opcoes;

  const ctxEditorial = buildContextoEditorial(dados, metricas, periodoStr, museuStr, fotosAnalisadas);

  // ── PROMPTS IA ──────────────────────────────────────────────────────────────
  const prompts = {};

  if (introIA && secoes.includes('introducao')) {
    prompts.introducao = `${ctxEditorial}

DIRETRIZES OBRIGATÓRIAS DE REDAÇÃO:
- Mínimo 3 parágrafos completos (evite conter em 2)
- Cada parágrafo: mínimo 80 palavras, linguagem densa
- Parágrafo 1: contextualização institucional, síntese período, leitura geral ações
- Parágrafo 2: cruzamento agenda↔atividades↔releases, contexto cultural
- Parágrafo 3: interpretação resultados, participação, continuidade, impacto
- Evitar: "foi realizado", repetição, texto automático, superficialidade
- Estilo: institucional, elegante, editorial, técnico, curatorial, sofisticado
- Usar EXCLUSIVAMENTE dados listados acima — NUNCA invente

Redija a Introdução do relatório (mínimo 3 parágrafos densos):`;
  }

  if (secoes.includes('agenda_programacao')) {
    prompts.agenda = `${ctxEditorial}

DIRETRIZES: Densidade textual obrigatória. Cruzar agenda com atividades e releases. 
Parágrafo 1: contexto operacional das programações
Parágrafo 2: descrição das atividades e dinâmica dos espaços
Parágrafo 3: participação, continuidade, integração
Evitar linguagem automática. Estilo: editorial, analítico.

Redija Agenda e Programação (mínimo 3 parágrafos):`;
  }

  if (secoes.includes('relatorios_completos')) {
    prompts.relatorios = `${ctxEditorial}

DIRETRIZES: Síntese dos ${metricas.totalRels} relatórios aprovados com densidade narrativa.
Integrar: dinâmica das equipes, atividades por museu, desafios, sucessos.
Estrutura: Contextualização → Descrição → Interpretação
Evitar repetição de palavras e frases genéricas.

Redija Relatórios Completos (mínimo 3 parágrafos densos):`;
  }

  if (secoes.includes('atividades_consolidadas')) {
    prompts.atividades = `${ctxEditorial}

DIRETRIZES: Consolidar ${metricas.totalAtiv} atividades em narrativa coerente.
Cruzar: atividades + releases + agenda + imagens
Tipologia, público, impacto territorial, mediação cultural
Estrutura: Contexto → Descrição → Interpretação institucional

Redija Atividades Consolidadas (mínimo 3 parágrafos):`;
  }

  if (secoes.includes('comunicacao')) {
    prompts.comunicacao = `${ctxEditorial}

DIRETRIZES: ${releasesCuratoriais.length} releases institucionais mapeados.
Descrever cobertura de comunicação, campanhas, alcance, tipos de conteúdo.
Usar releases como base textual — reutilizar trechos curatoriais.
Linguagem: editorial, narrativa.

Redija Comunicação (mínimo 3 parágrafos densos):`;
  }

  if (secoes.includes('prestacao_integral')) {
    prompts.prestacao = `${ctxEditorial}

DIRETRIZES: Prestação integral de contas - MÁXIMA DENSIDADE.
Cruzar: execução física (atividades=${metricas.totalAtiv}, público=${metricas.publicoTotal.toLocaleString('pt-BR')}) 
+ execução financeira (${metricas.percentual}%, R$ utilizado)
Citar documentação completa (rubricas, compras, NFs, contratos)
Tom: formal, técnico, auditável, profissional
Estrutura: Síntese → Análise financeira → Rastreabilidade

Redija Prestação de Contas (mínimo 4 parágrafos muito densos):`;
  }

  if (secoes.includes('conclusao')) {
    prompts.conclusao = `${ctxEditorial}

DIRETRIZES: Conclusão sofisticada. Destaque avanços, impacto cultural, aprendizados.
Tom: positivo, institucional, com densidade narrativa
Mencionar: sustentabilidade operacional, memória institucional, continuidade

Redija Conclusão (mínimo 2 parágrafos densos):`;
  }

  // Executar IA em lotes
  const textos = {};
  const keys = Object.keys(prompts);
  for (let i = 0; i < keys.length; i += 3) {
    const batch = keys.slice(i, i + 3);
    const results = await Promise.all(batch.map(k => gerarTextoIA(prompts[k])));
    batch.forEach((k, j) => { textos[k] = results[j]; });
  }

  const fotosComLegenda = buildFotosComLegenda(allAtividades, rubricaMap);
  const fotoCapa = fotosComLegenda[0];

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    @page { margin: 2.5cm 2cm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.65; }
    h1 { font-size: 30px; font-weight: 700; margin: 0 0 10px; }
    h2 { font-size: 16px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 40px; page-break-after: avoid; }
    h3 { font-size: 13px; font-weight: 600; margin-top: 18px; color: #222; }
    p { margin: 8px 0; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10.5px; }
    th { background: #111; color: #fff; padding: 5px 8px; text-align: left; }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e5e5; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .capa { text-align: center; padding: 80px 40px; page-break-after: always; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
    .kpi { background: #f5f5f5; border-radius: 4px; padding: 12px; }
    .kpi .val { font-size: 20px; font-weight: 700; }
    .kpi .lbl { font-size: 10px; color: #777; margin-top: 2px; }
    .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 12px 0; }
    .foto-item { break-inside: avoid; }
    img.foto { max-width: 100%; max-height: 180px; object-fit: cover; border-radius: 4px; }
    .foto-legenda { font-size: 9px; color: #666; margin: 2px 0 0; line-height: 1.2; }
    .rodape { font-size: 9px; color: #999; text-align: center; margin-top: 40px; border-top: 1px solid #e5e5e5; padding-top: 10px; }
    .badge { display: inline-block; background: #111; color: #fff; border-radius: 2px; padding: 1px 6px; font-size: 9px; }
    .page-break { page-break-before: always; }
  `;

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Físico-Financeiro</title><style>${css}</style></head><body>`;

  // ── CAPA ──────────────────────────────────────────────────────────────────
  if (secoes.includes('capa')) {
    html += `<div class="capa">
      ${fotoCapa?.url ? `<img src="${fotoCapa.url}" style="max-height:180px;border-radius:6px;margin-bottom:20px;" alt="capa"/>` : ''}
      <h1>Relatório Físico-Financeiro</h1>
      <div style="font-size:15px;color:#666;margin:8px 0;">Projeto Museus Centro</div>
      <div style="font-size:14px;color:#666;margin:4px 0;">${periodoStr}</div>
      <div style="font-size:13px;color:#999;margin:4px 0;">${museuStr}</div>
      <div style="margin-top:30px;display:inline-block;text-align:left;background:#f5f5f5;border-radius:6px;padding:18px 24px;">
        <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:8px;">INDICADORES PRINCIPAIS</div>
        <div style="font-size:12px;margin:4px 0;"><strong>Público:</strong> ${metricas.publicoTotal.toLocaleString('pt-BR')}</div>
        <div style="font-size:12px;margin:4px 0;"><strong>Atividades:</strong> ${metricas.totalAtiv}</div>
        <div style="font-size:12px;margin:4px 0;"><strong>Relatórios:</strong> ${metricas.totalRels}</div>
        <div style="font-size:12px;margin:4px 0;"><strong>Execução:</strong> ${metricas.percentual}%</div>
      </div>
      <div style="font-size:10px;color:#999;margin-top:20px;">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </div>`;
  }

  // ── SUMÁRIO ───────────────────────────────────────────────────────────────
  const sumarioItens = [
    ['introducao', 'Introdução'],
    ['painel_executivo', 'Painel Executivo'],
    ['agenda_programacao', 'Agenda e Programação'],
    ['atividades_consolidadas', 'Atividades Consolidadas'],
    ['relatorios_completos', 'Relatórios Completos'],
    ['comunicacao', 'Comunicação e Visibilidade'],
    ['fotos', 'Fotos e Registros'],
    ['financeiro', 'Execução Financeira'],
    ['notas_fiscais', 'Documentação Fiscal'],
    ['rubricas', 'Rubricas Orçamentárias'],
    ['compras', 'Compras e Pagamentos'],
    ['equipe', 'Equipe e Profissionais'],
    ['prestacao_integral', 'Prestação de Contas Integral'],
    ['conclusao', 'Conclusão'],
  ];

  html += `<div class="page-break"><h2>Sumário</h2><ol style="line-height:2.2;">`;
  sumarioItens.filter(([id]) => secoes.includes(id)).forEach(([, label]) => {
    html += `<li>${label}</li>`;
  });
  html += `</ol></div>`;

  // ── INTRODUÇÃO ────────────────────────────────────────────────────────────
  if (secoes.includes('introducao')) {
    html += `<div class="page-break"><h2>Introdução</h2>
      ${introIA && textos.introducao ? paragrafoHTML(textos.introducao) : '<p>Período analisado: ' + periodoStr + '</p>'}
    </div>`;
  }

  // ── PAINEL EXECUTIVO ──────────────────────────────────────────────────────
  if (secoes.includes('painel_executivo')) {
    html += `<div class="page-break"><h2>Painel Executivo</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalAtiv}</div><div class="lbl">Atividades</div></div>
        <div class="kpi"><div class="val">${metricas.publicoTotal.toLocaleString('pt-BR')}</div><div class="lbl">Público total</div></div>
        <div class="kpi"><div class="val">${metricas.totalRels}</div><div class="lbl">Relatórios</div></div>
        <div class="kpi"><div class="val">${metricas.totalProgramacoes}</div><div class="lbl">Programações</div></div>
        <div class="kpi"><div class="val">${metricas.totalReleases}</div><div class="lbl">Releases</div></div>
        <div class="kpi"><div class="val">${metricas.totalEquipe}</div><div class="lbl">Profissionais</div></div>
      </div>
    </div>`;
  }

  // ── AGENDA E PROGRAMAÇÃO ──────────────────────────────────────────────────
  if (secoes.includes('agenda_programacao')) {
    html += `<div class="page-break"><h2>Agenda e Programação do Período</h2>
      ${textos.agenda ? paragrafoHTML(textos.agenda) : ''}
      <h3>Programações Executadas</h3>
      ${progFiltradas.length > 0 ? `
        <table>
          <thead><tr><th>Data</th><th>Título</th><th>Museu</th><th>Tipo</th><th>Público</th></tr></thead>
          <tbody>
            ${progFiltradas.slice(0, 50).map(p => `<tr>
              <td>${p.data_realizacao || p.data_inicio || '—'}</td>
              <td>${p.titulo || p.evento || '—'}</td>
              <td>${p.museu || '—'}</td>
              <td>${p.tipo || '—'}</td>
              <td>${p.publico || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p>Nenhuma programação registrada.</p>'}
    </div>`;
  }

  // ── ATIVIDADES CONSOLIDADAS ───────────────────────────────────────────────
  if (secoes.includes('atividades_consolidadas')) {
    html += `<div class="page-break"><h2>Atividades Consolidadas (${metricas.totalAtiv})</h2>
      ${textos.atividades ? paragrafoHTML(textos.atividades) : ''}
      <table>
        <thead><tr><th>Título</th><th>Museu</th><th>Mês</th><th>Tipo</th><th>Público</th><th>Relatório</th></tr></thead>
        <tbody>
          ${allAtividades.slice(0, 100).map(a => {
            const pub = (Number(a.publico_total) || 0) || ((Number(a.publico_estimado)||0) * Math.max(Number(a.quantas_repeticoes)||1,1));
            return `<tr>
              <td><strong>${a.titulo || a.nome || '—'}</strong></td>
              <td>${a._museu || '—'}</td>
              <td>${mesStr(a._mes, a._ano)}</td>
              <td><span class="badge">${a.classificacao || '—'}</span></td>
              <td>${pub > 0 ? pub : '—'}</td>
              <td>${a._author || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── RELATÓRIOS COMPLETOS ──────────────────────────────────────────────────
  if (secoes.includes('relatorios_completos')) {
    html += `<div class="page-break"><h2>Relatórios Completos das Equipes</h2>
      ${textos.relatorios ? paragrafoHTML(textos.relatorios) : ''}
      <h3>Relatórios Aprovados (${metricas.totalRels})</h3>
      <table>
        <thead><tr><th>Período</th><th>Museu</th><th>Profissional</th><th>Atividades</th><th>Público</th><th>Status</th></tr></thead>
        <tbody>
          ${relsFiltrados.map(r => `<tr>
            <td><strong>${r.mes_referencia}/${r.ano}</strong></td>
            <td>${r.museu || '—'}</td>
            <td>${r.author_name || '—'}</td>
            <td>${(r.atividades || []).length}</td>
            <td>${(r.publico_geral_declarado || 0).toLocaleString('pt-BR')}</td>
            <td><span class="badge">${r.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── COMUNICAÇÃO ───────────────────────────────────────────────────────────
  if (secoes.includes('comunicacao')) {
    html += `<div class="page-break"><h2>Comunicação e Visibilidade</h2>
      ${textos.comunicacao ? paragrafoHTML(textos.comunicacao) : ''}
      ${comFiltrada.length > 0 ? `
        <h3>Destaques de Comunicação</h3>
        <table>
          <thead><tr><th>Título</th><th>Tipo</th><th>Destaque</th><th>Data</th></tr></thead>
          <tbody>
            ${comFiltrada.slice(0, 30).map(c => `<tr>
              <td>${c.titulo || c.headline || '—'}</td>
              <td>${c.tipo || c.categoria || '—'}</td>
              <td>${c.destaque ? '✓' : '—'}</td>
              <td>${c.published_date || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>`;
  }

  // ── FOTOS E REGISTROS COM ANÁLISE VISUAL ─────────────────────────────────────
  if (secoes.includes('fotos')) {
    html += `<div class="page-break"><h2>Fotos e Registros</h2>
      <p><strong>Galeria institucional curada:</strong> ${fotosComLegenda.length} registros fotográficos analisados visualmente</p>`;
    
    if (fotosAnalisadas.length > 0) {
      html += `<h3>Análise Visual do Período</h3>
      <p style="font-size:11px;color:#666;margin-bottom:12px;">
        Registros identificam atividades, público, contexto e interação cultural.
      </p>`;
      
      fotosAnalisadas.slice(0, 5).forEach((f, idx) => {
        if (f.analise_visual) {
          html += `<div style="background:#f9f9f9;border-left:3px solid #ccc;padding:8px;margin:8px 0;font-size:10px;line-height:1.4;">
            <strong>Foto ${idx + 1}:</strong> ${f.analise_visual}
          </div>`;
        }
      });
    }
    
    if (fotosComLegenda.length > 0) {
      html += `<h3>Galeria Fotográfica</h3>
      <div class="foto-grid">
        ${fotosComLegenda.slice(0, 40).map((f, i) => `<div class="foto-item">
          ${f.url ? `<img class="foto" src="${f.url}" alt="${f.altLegenda}"/>` : ''}
          <p class="foto-legenda">${f.legenda}</p>
        </div>
        ${(i + 1) % 8 === 0 && i < fotosComLegenda.length - 1 ? '</div><div class="page-break"></div><div class="foto-grid">' : ''}`).join('')}
      </div>`;
    } else {
      html += `<p>Nenhuma foto disponível.</p>`;
    }
    html += `</div>`;
  }

  // ── EXECUÇÃO FINANCEIRA ───────────────────────────────────────────────────
  if (secoes.includes('financeiro')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="page-break"><h2>Execução Financeira</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">R$ ${fmt(ORCAMENTO_TOTAL)}</div><div class="lbl">Orçamento 3º Aditivo</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorUtilizado)}</div><div class="lbl">Utilizado</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.saldo)}</div><div class="lbl">Saldo</div></div>
      </div>
      <p><strong>Execução: ${metricas.percentual}%</strong></p>
      <div style="background:#e5e5e5;border-radius:3px;height:8px;margin:6px 0;"><div style="background:#111;border-radius:3px;height:8px;width:${pct}%;"></div></div>
      <h3>Rubricas (Top 15)</h3>
      <table>
        <thead><tr><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>% Exec.</th></tr></thead>
        <tbody>
          ${metricas.topRubricas.slice(0, 15).map(r => {
            const saldo = (r.valor_rubrica || 0) - (r.valor_utilizado || 0);
            const pctExec = r.valor_rubrica > 0 ? ((r.valor_utilizado / r.valor_rubrica) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${r.rubrica || '—'}</td>
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
    html += `<div class="page-break"><h2>Documentação Fiscal</h2>
      <p><strong>Total:</strong> ${metricas.totalNFIntake} NF no sistema | ${metricas.totalNF} com PDF vinculado</p>
      ${comprasFiltradas.length > 0 ? `<table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>NF</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>
          ${comprasFiltradas.slice(0, 60).map(p => `<tr>
            <td>${(p.descricao_item || '—').slice(0, 40)}</td>
            <td>${p.fornecedor_nome || '—'}</td>
            <td>${p.nf_numero || '—'}</td>
            <td>${p.nf_data_emissao || '—'}</td>
            <td>R$ ${fmt(p.valor_pago || p.valor_solicitado)}</td>
            <td><span class="badge">${p.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhuma compra registrada.</p>'}
    </div>`;
  }

  // ── RUBRICAS ORÇAMENTÁRIAS ────────────────────────────────────────────────
  if (secoes.includes('rubricas')) {
    html += `<div class="page-break"><h2>Rubricas Orçamentárias (${rubricasAtivas.length})</h2>
      <table>
        <thead><tr><th>Rubrica</th><th>Grupo</th><th>Valor Total</th><th>Utilizado</th><th>Saldo</th><th>%</th></tr></thead>
        <tbody>
          ${rubricasAtivas.map(r => {
            const util = Number(r.valor_utilizado) || 0;
            const total = Number(r.valor_rubrica) || 0;
            const saldo = total - util;
            const pct = total > 0 ? ((util / total) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td><strong>${r.rubrica || '—'}</strong></td>
              <td>${r.grupo || '—'}</td>
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
    html += `<div class="page-break"><h2>Compras e Pagamentos (${metricas.totalCompras})</h2>
      <p><strong>Valor total pago:</strong> R$ ${fmt(comprasFiltradas.reduce((s,p) => s + (Number(p.valor_pago) || 0), 0))}</p>
      <table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Rubrica</th><th>Valor</th><th>Data</th><th>Status</th></tr></thead>
        <tbody>
          ${comprasFiltradas.map(p => `<tr>
            <td>${(p.descricao_item || '—').slice(0, 35)}</td>
            <td>${p.fornecedor_nome || '—'}</td>
            <td>${p.categoria || '—'}</td>
            <td>R$ ${fmt(p.valor_pago || p.valor_solicitado)}</td>
            <td>${p.data_pagamento || '—'}</td>
            <td><span class="badge">${p.status || '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── EQUIPE E PROFISSIONAIS ────────────────────────────────────────────────
  if (secoes.includes('equipe')) {
    html += `<div class="page-break"><h2>Equipe e Profissionais (${metricas.totalEquipe})</h2>
      ${teamFiltrado.length > 0 ? `<table>
        <thead><tr><th>Nome</th><th>Função</th><th>Museu</th><th>Tipo</th><th>Contrato</th></tr></thead>
        <tbody>
          ${teamFiltrado.slice(0, 60).map(t => `<tr>
            <td>${t.user_name || '—'}</td>
            <td>${t.funcao || '—'}</td>
            <td>${t.museu_projeto || '—'}</td>
            <td>${t.tipo_pessoa || '—'}</td>
            <td>${t.numero_contrato || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p>Nenhum membro registrado.</p>'}
    </div>`;
  }

  // ── PRESTAÇÃO DE CONTAS INTEGRAL ──────────────────────────────────────────
  if (secoes.includes('prestacao_integral')) {
    html += `<div class="page-break"><h2>Prestação de Contas Integral</h2>
      ${textos.prestacao ? paragrafoHTML(textos.prestacao) : ''}
      <h3>Resumo Executivo</h3>
      <ul>
        <li>Período: ${periodoStr}</li>
        <li>Relatórios aprovados: ${metricas.totalRels}</li>
        <li>Atividades realizadas: ${metricas.totalAtiv}</li>
        <li>Público total: ${metricas.publicoTotal.toLocaleString('pt-BR')}</li>
        <li>Execução financeira: ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)} de R$ ${fmt(ORCAMENTO_TOTAL)})</li>
        <li>Documentação fiscal: ${metricas.totalNF} notas fiscais</li>
        <li>Rubricas: ${rubricasAtivas.length} linhas orçamentárias</li>
      </ul>
    </div>`;
  }

  // ── CONCLUSÃO ─────────────────────────────────────────────────────────────
  if (secoes.includes('conclusao')) {
    html += `<div class="page-break"><h2>Conclusão</h2>
      ${textos.conclusao ? paragrafoHTML(textos.conclusao) : '<p>Período analisado com sucesso.</p>'}
    </div>`;
  }

  html += `<div class="rodape">Relatório Físico-Financeiro — Projeto Museus Centro — ${new Date().toLocaleString('pt-BR')}</div></body></html>`;

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

    // Análise de imagens com visão computacional
    const fotosParaAnalisar = buildFotosComLegenda(dados.allAtividades, dados.reportPhotos, dados.rubricaMap).slice(0, 15);
    const fotosAnalisadas = await analisarImagensComVisao(fotosParaAnalisar, base44);

    const secoesPadrao = ['capa','introducao','painel_executivo','agenda_programacao','atividades_consolidadas','relatorios_completos','comunicacao','fotos','financeiro','notas_fiscais','rubricas','compras','equipe','prestacao_integral','conclusao'];
    const secoesFinal = secoes.length > 0 ? secoes : secoesPadrao;

    const html = await gerarHTMLCompleto(dados, metricas, secoesFinal, from, to, museuFiltro || null, { modoEntrega, introIA }, fotosAnalisadas);
    return Response.json({ html });

  } catch (err) {
    console.error('gerarRelatorioFisicoFinanceiro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});