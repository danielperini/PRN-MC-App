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

function reportInPeriod(report, from, to) {
  const d = parseDateStr(report.submitted_at) || parseDateStr(report.created_date);
  if (d) return d >= from && d <= to;
  const idx = MESES_PT.findIndex(m => m === report.mes_referencia);
  if (idx < 0) return false;
  const rep = new Date(Number(report.ano || new Date().getFullYear()), idx, 1);
  return rep >= new Date(from.getFullYear(), from.getMonth(), 1) &&
         rep <= new Date(to.getFullYear(), to.getMonth(), 1);
}

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

// ── categorização editorial de atividades ─────────────────────────────────────

function detectarCategoria(a) {
  const txt = normalizeText([a.titulo, a.nome, a.classificacao, a.tipo_equipe, a.equipe_responsavel, a.descricao].join(' '));
  if (txt.includes('exposi') || txt.includes('exposicao')) return 'exposicao';
  if (txt.includes('oficina')) return 'oficina';
  if (txt.includes('visita mediada') || txt.includes('visita guiada') || txt.includes('visita educativa')) return 'visita_mediada';
  if (txt.includes('roda de conversa') || txt.includes('conversa') || txt.includes('dialogo')) return 'roda_conversa';
  if (txt.includes('apresenta') || txt.includes('espetaculo') || txt.includes('show') || txt.includes('musica') || txt.includes('danca')) return 'apresentacao';
  if (txt.includes('formacao') || txt.includes('capacitacao') || txt.includes('curso') || txt.includes('workshop')) return 'formacao';
  if (txt.includes('acao externa') || txt.includes('ação externa') || txt.includes('escola') || txt.includes('comunidade')) return 'acao_externa';
  if (txt.includes('educativ') || txt.includes('pedagogic') || txt.includes('mediacao')) return 'educativo';
  return 'outras';
}

// ── coleta de dados (integração com releases) ─────────────────────────────────

async function coletarDados(base44, from, to, museuFiltro) {
  const [reports, rubricas, purchases, attachments, programacao, nf_intake] = await Promise.all([
    base44.asServiceRole.entities.Report.list('-created_date', 500),
    base44.asServiceRole.entities.Rubrica.list('grupo', 200),
    base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500),
    base44.asServiceRole.entities.Attachment.list('-created_date', 1000),
    base44.asServiceRole.entities.Programacao.list('-created_date', 500).catch(() => []),
    base44.asServiceRole.entities.DocumentIntake.list('-created_date', 1000).catch(() => []),
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
      _museu:     r.museu,
      _mes:       r.mes_referencia,
      _ano:       r.ano,
      _author:    r.author_name,
      _categoria: detectarCategoria(a),
    }))
  );

  const comprasFiltradas = purchases.filter(p => {
    if (!['APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(p.status)) return false;
    const d = parseDateStr(p.data_pagamento) || parseDateStr(p.aprov_admin_data) || parseDateStr(p.created_date);
    if (!d || d < from || d > to) return false;
    if (museuFiltro && p.centro_custo && p.centro_custo !== museuFiltro && p.centro_custo !== 'Geral') return false;
    return true;
  });

  const reportIds        = new Set(relsFiltrados.map(r => r.id));
  const attachsFiltrados = attachments.filter(a => reportIds.has(a.report_id));
  const rubricasAtivas   = rubricas.filter(r => r.ativo !== false);
  const rubricaMap       = Object.fromEntries(rubricas.map(r => [r.id, r.rubrica || r.grupo || '']));

  const progFiltradas = programacao.filter(p => {
    const d = parseDateStr(p.data_inicio || p.data_realizacao || p.created_date);
    if (!d) return false;
    if (museuFiltro && p.museu && p.museu !== museuFiltro) return false;
    return d >= from && d <= to;
  });

  // NFiscais do DocumentIntake no período
  const nfFiltradas = nf_intake.filter(d => {
    if (d.tipo_detectado !== 'NOTA_FISCAL_PDF' && d.tipo_detectado !== 'NOTA_FISCAL_XML') return false;
    const dt = parseDateStr(d.nf_emitente_nome ? d.created_date : d.created_date);
    if (!dt || dt < from || dt > to) return false;
    if (museuFiltro && d.municipio && d.municipio !== museuFiltro) return false;
    return true;
  });

  return { relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas, rubricaMap, progFiltradas, nfFiltradas };
}

// ── métricas ──────────────────────────────────────────────────────────────────

function calcMetricas({ relsFiltrados, allAtividades, comprasFiltradas, rubricasAtivas, progFiltradas, nfFiltradas }) {
  const totalRels  = relsFiltrados.length;
  const totalAtiv  = allAtividades.length;

  const publicoSemDuplicidade = allAtividades.reduce((s, a) => {
    const pubTotal = Number(a.publico_total) || 0;
    const pubEst   = Number(a.publico_estimado) || 0;
    const reps     = Math.max(Number(a.quantas_repeticoes) || 1, 1);
    return s + (pubTotal > 0 ? pubTotal : pubEst * reps);
  }, 0);

  const pubPorCategoria = {};
  allAtividades.forEach(a => {
    const cat  = a._categoria || 'outras';
    const pub  = (Number(a.publico_total) || 0) || (Number(a.publico_estimado) || 0) * Math.max(Number(a.quantas_repeticoes) || 1, 1);
    pubPorCategoria[cat] = (pubPorCategoria[cat] || 0) + pub;
  });

  const porMuseu = Object.fromEntries(['MIS','MHAB','MUMO'].map(m => {
    const ativs = allAtividades.filter(a => a._museu === m);
    const pub   = ativs.reduce((s, a) => {
      const pt  = Number(a.publico_total) || 0;
      const pe  = Number(a.publico_estimado) || 0;
      const rep = Math.max(Number(a.quantas_repeticoes) || 1, 1);
      return s + (pt > 0 ? pt : pe * rep);
    }, 0);
    return [m, { atividades: ativs.length, publico: pub }];
  }));

  const classif = { META: 0, ROTINA: 0, EXTRA: 0 };
  allAtividades.forEach(a => { if (a.classificacao in classif) classif[a.classificacao]++; });

  const valorUtilizadoRubricas = rubricasAtivas.reduce((s, r) => s + (Number(r.valor_utilizado) || 0), 0);
  const valorPagoCompras       = comprasFiltradas.reduce((s, p) => s + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0), 0);
  const valorUtilizado = valorUtilizadoRubricas || valorPagoCompras;
  const percentual     = ORCAMENTO_TOTAL > 0 ? ((valorUtilizado / ORCAMENTO_TOTAL) * 100).toFixed(1) : 0;
  const saldo          = ORCAMENTO_TOTAL - valorUtilizado;

  const totalNF      = comprasFiltradas.filter(p => p.nota_fiscal_url || p.nf_numero).length;
  const totalCompras = comprasFiltradas.length;

  const topRubricas = [...rubricasAtivas]
    .sort((a, b) => (b.valor_utilizado || 0) - (a.valor_utilizado || 0))
    .slice(0, 20);

  const valorPorMuseu = {};
  comprasFiltradas.forEach(p => {
    const m = p.centro_custo || 'Geral';
    valorPorMuseu[m] = (valorPorMuseu[m] || 0) + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0);
  });

  const categoriasContagem = {};
  allAtividades.forEach(a => {
    const cat = a._categoria || 'outras';
    categoriasContagem[cat] = (categoriasContagem[cat] || 0) + 1;
  });

  return {
    totalRels, totalAtiv, publicoTotal: publicoSemDuplicidade,
    pubPorCategoria, porMuseu, classif, valorPorMuseu,
    valorUtilizado, valorPagoCompras, percentual, saldo,
    totalNF, totalCompras, topRubricas,
    totalProgramacoes: (progFiltradas || []).length,
    categoriasContagem,
  };
}

// ── extração de falas reais ───────────────────────────────────────────────────

function extrairFalasReais(relsFiltrados) {
  const falas = [];
  relsFiltrados.forEach(r => {
    const campos = [
      r.resumo_periodo, r.resumo_executivo, r.avaliacao_pontos_positivos,
      r.avaliacao_desafios, r.avaliacao_sugestoes, r.comentarios_gerais,
    ];
    campos.forEach(campo => {
      if (!campo || campo.length < 30) return;
      const matches = campo.match(/["'""][^""'']{20,200}["''']/g) || [];
      matches.forEach(m => falas.push({ texto: m.replace(/^["'"']+|["''']+$/g,'').trim(), autor: r.author_name, museu: r.museu, mes: r.mes_referencia }));
    });
    (Array.isArray(r.depoimentos) ? r.depoimentos : []).forEach(d => {
      if (d.texto && d.texto.length > 20) falas.push({ texto: d.texto, autor: d.autor || r.author_name, museu: r.museu, mes: r.mes_referencia });
    });
  });
  return falas.slice(0, 8);
}

// ── construção de fotos com legenda ───────────────────────────────────────────

function buildFotosComLegenda(allAtividades, rubricaMap, maxPorAtiv = 4) {
  const lista = [];
  const usedUrls = new Set();

  allAtividades.forEach(a => {
    const fotos = Array.isArray(a.fotos) ? a.fotos : [];
    const ordenadas = [...fotos]
      .filter(f => !usedUrls.has(f.file_url || f.drive_url))
      .sort((x, y) => {
        const px = (x.drive_url ? 2 : 0) + (x.legenda ? 1 : 0);
        const py = (y.drive_url ? 2 : 0) + (y.legenda ? 1 : 0);
        return py - px;
      })
      .slice(0, maxPorAtiv);

    ordenadas.forEach(f => {
      if (!f.file_url && !f.drive_url) return;
      const url = f.file_url || f.drive_url;
      if (!url) return;
      usedUrls.add(url);

      const dataFmt = a.data_realizacao || a.data_inicio || mesStr(a._mes, a._ano) || 'não informado';
      const legenda = `${a.titulo || a.nome || 'Atividade'} — ${a._museu || 'não informado'} — ${dataFmt}`;
      const driveLink = f.drive_url || f.drive_file_id ? (f.drive_url || `https://drive.google.com/file/d/${f.drive_file_id}/view`) : null;
      
      lista.push({ url: f.file_url || null, driveLink, legenda, altLegenda: f.legenda || a.titulo || '' });
    });
  });
  return lista;
}

// ── geração de HTML ───────────────────────────────────────────────────────────

async function gerarHTMLCompleto(dados, metricas, secoes, dateFrom, dateTo, museuFiltro, opcoes) {
  const { allAtividades, comprasFiltradas, rubricasAtivas, rubricaMap, relsFiltrados, progFiltradas, nfFiltradas } = dados;
  const periodoStr = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
  const museuStr   = museuFiltro || 'Todos os Museus';
  const { modoEntrega = false, introIA = true } = opcoes;

  // Contexto para IA
  const titulosAtividades = allAtividades.slice(0, 30).map(a => a.titulo || a.nome || '').filter(Boolean);
  const falasReais        = extrairFalasReais(relsFiltrados);

  const ctxBase = `Você é especialista em gestão cultural e comunicação institucional. Escreva em português brasileiro, tom institucional, analítico e elegante.
Período: ${periodoStr}. Museus: ${museuStr}.

DADOS VERIFICADOS:
- Relatórios aprovados: ${metricas.totalRels}
- Atividades realizadas: ${metricas.totalAtiv}
- Público total: ${metricas.publicoTotal.toLocaleString('pt-BR')}
- Programações: ${metricas.totalProgramacoes}
- Execução: ${metricas.percentual}% (R$ ${fmt(metricas.valorUtilizado)})

REGRAS:
1. Use somente dados verificados acima.
2. Não repita "durante o período" mais de uma vez por seção.
3. Mencione museus (MIS, MHAB, MUMO) quando relevante.
4. Se houver falas reais, incorpore com crédito entre aspas.
5. Tom: institucional, cultural, preciso — não genérico.`;

  const prompts = {};

  if (secoes.includes('introducao') && introIA) {
    prompts.introducao = `${ctxBase}

Redija Introdução (máximo 2 parágrafos): apresente o projeto, contextualize o período, mencione tipos de atividades e público alcançado.`;
  }

  if (secoes.includes('resumo_periodo')) {
    prompts.resumo = `${ctxBase}

Redija Resumo do Período (máximo 4 parágrafos): descreva atividades realizadas, destaque resultados, incorpore se disponível fala/depoimento real.`;
  }

  if (secoes.includes('prestacao')) {
    prompts.prestacao = `${ctxBase}

Redija Prestação de Contas (máximo 5 parágrafos): execute análise entre físico e financeiro, coerência, rubricas principais, observações de auditoria.`;
  }

  if (secoes.includes('conclusao')) {
    prompts.conclusao = `${ctxBase}

Redija Conclusão (máximo 2 parágrafos): destaque avanços, impacto cultural, compromisso com transparência.`;
  }

  // Executar IA em lotes
  const textos = {};
  const keys = Object.keys(prompts);
  for (let i = 0; i < keys.length; i += 3) {
    const batch = keys.slice(i, i + 3);
    const results = await Promise.all(batch.map(k => gerarTextoIA(prompts[k])));
    batch.forEach((k, j) => { textos[k] = results[j]; });
  }

  const fotosComLegenda = buildFotosComLegenda(allAtividades, rubricaMap, modoEntrega ? 4 : 2);
  const fotoCapa = fotosComLegenda[0];

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    @page { margin: 2.5cm 2cm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.65; }
    h1 { font-size: 30px; font-weight: 700; margin: 0 0 10px; }
    h2 { font-size: 17px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 40px; page-break-after: avoid; }
    h3 { font-size: 13px; font-weight: 600; margin-top: 18px; color: #222; }
    p  { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
    th { background: #111; color: #fff; padding: 6px 8px; text-align: left; font-size: 10.5px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .capa { text-align: center; padding: 80px 40px; page-break-after: always; }
    .capa h1 { font-size: 34px; margin-bottom: 12px; }
    .capa .sub { font-size: 15px; color: #666; margin: 6px 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
    .kpi { background: #f5f5f5; border-radius: 4px; padding: 12px; }
    .kpi .val { font-size: 20px; font-weight: 700; }
    .kpi .lbl { font-size: 10px; color: #777; margin-top: 2px; }
    .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 12px 0; }
    .foto-item { break-inside: avoid; margin-bottom: 10px; }
    img.foto { max-width: 100%; max-height: 200px; object-fit: cover; border-radius: 4px; display: block; }
    .foto-legenda { font-size: 10px; color: #666; margin: 3px 0 0; line-height: 1.3; }
    .progress-bar { background: #e5e5e5; border-radius: 3px; height: 8px; margin: 6px 0; }
    .progress-fill { background: #111; border-radius: 3px; height: 8px; }
    .rodape { font-size: 9px; color: #999; text-align: center; margin-top: 50px; border-top: 1px solid #e5e5e5; padding-top: 10px; }
    a { color: #1a56db; }
    .badge { display: inline-block; background: #111; color: #fff; border-radius: 2px; padding: 1px 6px; font-size: 9px; }
  `;

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Físico-Financeiro</title><style>${css}</style></head><body>`;

  // ── CAPA ──────────────────────────────────────────────────────────────────
  if (secoes.includes('capa')) {
    html += `<div class="capa">
      ${fotoCapa?.url ? `<img src="${fotoCapa.url}" style="max-height:180px;border-radius:6px;margin-bottom:20px;" alt="capa"/>` : ''}
      <h1>Relatório Físico-Financeiro</h1>
      <div class="sub">Projeto Museus Centro</div>
      <div class="sub">${periodoStr}</div>
      <div style="margin-top:30px;display:inline-block;text-align:left;background:#f5f5f5;border-radius:6px;padding:18px 24px;">
        <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:10px;">INDICADORES PRINCIPAIS</div>
        <div style="font-size:13px;margin:5px 0;"><strong>Público:</strong> ${metricas.publicoTotal.toLocaleString('pt-BR')}</div>
        <div style="font-size:13px;margin:5px 0;"><strong>Atividades:</strong> ${metricas.totalAtiv}</div>
        <div style="font-size:13px;margin:5px 0;"><strong>Relatórios:</strong> ${metricas.totalRels}</div>
        <div style="font-size:13px;margin:5px 0;"><strong>Execução:</strong> ${metricas.percentual}%</div>
      </div>
    </div>`;
  }

  // ── SUMÁRIO ───────────────────────────────────────────────────────────────
  const sumarioItens = [
    ['introducao','Introdução'],
    ['painel_executivo','Painel Executivo'],
    ['resumo_periodo','Resumo do Período'],
    ['atividades','Atividades Realizadas'],
    ['fotos','Fotos e Registros'],
    ['relatorios','Relatórios Mensais'],
    ['financeiro','Execução Financeira'],
    ['notas_fiscais','Notas Fiscais'],
    ['rubricas','Rubricas Orçamentárias'],
    ['prestacao','Prestação de Contas Integral'],
    ['conclusao','Conclusão'],
  ];
  
  html += `<div class="page-break"><h2>Sumário</h2><ol style="line-height:2.2;">`;
  sumarioItens.filter(([id]) => secoes.includes(id)).forEach(([, label]) => { html += `<li>${label}</li>`; });
  html += `</ol></div>`;

  // ── INTRODUÇÃO ────────────────────────────────────────────────────────────
  if (secoes.includes('introducao')) {
    html += `<div class="page-break"><h2>Introdução</h2>`;
    if (introIA && textos.introducao) {
      html += paragrafoHTML(textos.introducao);
    } else {
      html += `<p>O presente relatório apresenta a execução físico-financeira do Projeto Museus Centro referente ao período de ${periodoStr}. Foram realizadas ${metricas.totalAtiv} atividades, alcançando ${metricas.publicoTotal.toLocaleString('pt-BR')} pessoas.</p>`;
    }
    html += `</div>`;
  }

  // ── PAINEL EXECUTIVO ──────────────────────────────────────────────────────
  if (secoes.includes('painel_executivo')) {
    html += `<div class="page-break"><h2>Painel Executivo</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalAtiv}</div><div class="lbl">Atividades</div></div>
        <div class="kpi"><div class="val">${metricas.publicoTotal.toLocaleString('pt-BR')}</div><div class="lbl">Público total</div></div>
        <div class="kpi"><div class="val">${metricas.totalRels}</div><div class="lbl">Relatórios</div></div>
        <div class="kpi"><div class="val">${metricas.totalProgramacoes}</div><div class="lbl">Programações</div></div>
        <div class="kpi"><div class="val">${metricas.totalCompras}</div><div class="lbl">Compras</div></div>
        <div class="kpi"><div class="val">${metricas.totalNF}</div><div class="lbl">Notas Fiscais</div></div>
      </div>
    </div>`;
  }

  // ── RESUMO DO PERÍODO ─────────────────────────────────────────────────────
  if (secoes.includes('resumo_periodo')) {
    const falasHtml = falasReais.slice(0, 2).map(f =>
      `<div style="background:#f9f9f9;border-left:3px solid #999;padding:8px 12px;margin:10px 0;font-style:italic;font-size:11px;">"${f.texto}"<br/><span style="font-size:9px;color:#777;margin-top:3px;">— ${f.autor || 'Participante'}, ${f.museu || ''}</span></div>`
    ).join('');

    html += `<div class="page-break"><h2>Resumo do Período</h2>
      ${paragrafoHTML(textos.resumo || '')}
      ${falasHtml}
    </div>`;
  }

  // ── ATIVIDADES (LISTAGEM INTEGRAL) ────────────────────────────────────────
  if (secoes.includes('atividades')) {
    html += `<div class="page-break"><h2>Atividades Realizadas</h2>
      <p><strong>Total:</strong> ${metricas.totalAtiv} atividades</p>`;
    
    if (allAtividades.length > 0) {
      html += `<table>
        <thead><tr><th>Título</th><th>Museu</th><th>Período</th><th>Classif.</th><th>Tipo</th><th>Público</th></tr></thead>
        <tbody>`;
      
      allAtividades.forEach(a => {
        const pub = (Number(a.publico_total) || 0) || ((Number(a.publico_estimado)||0) * Math.max(Number(a.quantas_repeticoes)||1,1));
        html += `<tr>
          <td><strong>${a.titulo || a.nome || '—'}</strong></td>
          <td>${a._museu || '—'}</td>
          <td>${mesStr(a._mes, a._ano)}</td>
          <td><span class="badge">${a.classificacao || '—'}</span></td>
          <td>${a._categoria || '—'}</td>
          <td>${pub > 0 ? pub.toLocaleString('pt-BR') : '—'}</td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    } else {
      html += `<p>Nenhuma atividade registrada.</p>`;
    }
    html += `</div>`;
  }

  // ── FOTOS E REGISTROS ─────────────────────────────────────────────────────
  if (secoes.includes('fotos')) {
    html += `<div class="page-break"><h2>Fotos e Registros</h2>`;
    if (fotosComLegenda.length > 0) {
      html += `<div class="foto-grid">`;
      fotosComLegenda.slice(0, 40).forEach((f, i) => {
        html += `<div class="foto-item">`;
        if (f.url) html += `<img class="foto" src="${f.url}" alt="${f.altLegenda}"/>`;
        html += `<p class="foto-legenda">${f.legenda}</p>`;
        html += `</div>`;
        if ((i + 1) % 8 === 0 && i < fotosComLegenda.length - 1) html += `</div><div class="page-break"></div><div class="foto-grid">`;
      });
      html += `</div>`;
    } else {
      html += `<p>Nenhuma foto disponível.</p>`;
    }
    html += `</div>`;
  }

  // ── RELATÓRIOS MENSAIS (LISTAGEM INTEGRAL) ────────────────────────────────
  if (secoes.includes('relatorios')) {
    html += `<div class="page-break"><h2>Relatórios Mensais</h2>
      <p><strong>Total aprovado:</strong> ${metricas.totalRels} relatórios</p>`;
    
    if (relsFiltrados.length > 0) {
      html += `<table>
        <thead><tr><th>Mês</th><th>Museu</th><th>Profissional</th><th>Público</th><th>Atividades</th><th>Status</th></tr></thead>
        <tbody>`;
      
      relsFiltrados.forEach(r => {
        const pubMuseu = (metricas.porMuseu[r.museu]?.publico || 0).toLocaleString('pt-BR');
        const ativMuseu = metricas.porMuseu[r.museu]?.atividades || 0;
        html += `<tr>
          <td><strong>${r.mes_referencia}/${r.ano}</strong></td>
          <td>${r.museu || '—'}</td>
          <td>${r.author_name || '—'}</td>
          <td>${pubMuseu}</td>
          <td>${ativMuseu}</td>
          <td><span class="badge">${r.status || '—'}</span></td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }

  // ── EXECUÇÃO FINANCEIRA ───────────────────────────────────────────────────
  if (secoes.includes('financeiro')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="page-break"><h2>Execução Financeira</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">R$ ${fmt(ORCAMENTO_TOTAL)}</div><div class="lbl">Orçamento 3º Aditivo</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorUtilizado)}</div><div class="lbl">Utilizado (acumulado)</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.saldo)}</div><div class="lbl">Saldo disponível</div></div>
      </div>
      <p><strong>Execução: ${metricas.percentual}%</strong></p>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
      ${paragrafoHTML(textos.prestacao || '')}
    </div>`;
  }

  // ── NOTAS FISCAIS (LISTAGEM INTEGRAL) ─────────────────────────────────────
  if (secoes.includes('notas_fiscais')) {
    html += `<div class="page-break"><h2>Notas Fiscais e Documentação</h2>
      <p><strong>Total de compras:</strong> ${metricas.totalCompras} | <strong>Com NF:</strong> ${metricas.totalNF}</p>`;
    
    if (comprasFiltradas.length > 0) {
      html += `<table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>NF</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>`;
      
      comprasFiltradas.forEach(p => {
        html += `<tr>
          <td>${(p.descricao_item || '—').slice(0, 50)}</td>
          <td>${p.fornecedor_nome || '—'}</td>
          <td>${p.nf_numero || '—'}</td>
          <td>${p.nf_data_emissao || p.data_pagamento || '—'}</td>
          <td>R$ ${fmt(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado)}</td>
          <td><span class="badge">${p.status || '—'}</span></td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }

  // ── RUBRICAS ORÇAMENTÁRIAS (LISTAGEM INTEGRAL) ────────────────────────────
  if (secoes.includes('rubricas')) {
    html += `<div class="page-break"><h2>Rubricas Orçamentárias</h2>
      <p><strong>Total de rubricas:</strong> ${rubricasAtivas.length}</p>`;
    
    if (rubricasAtivas.length > 0) {
      html += `<table>
        <thead><tr><th>Rubrica</th><th>Grupo</th><th>Valor Total</th><th>Utilizado</th><th>Saldo</th><th>% Exec.</th></tr></thead>
        <tbody>`;
      
      rubricasAtivas.forEach(r => {
        const util = Number(r.valor_utilizado) || 0;
        const total = Number(r.valor_rubrica) || 0;
        const saldo = total - util;
        const pct = total > 0 ? ((util / total) * 100).toFixed(1) : '0.0';
        
        html += `<tr>
          <td><strong>${r.rubrica || '—'}</strong></td>
          <td>${r.grupo || '—'}</td>
          <td>R$ ${fmt(total)}</td>
          <td>R$ ${fmt(util)}</td>
          <td>R$ ${fmt(saldo)}</td>
          <td>${pct}%</td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }

  // ── PRESTAÇÃO DE CONTAS INTEGRAL ──────────────────────────────────────────
  if (secoes.includes('prestacao')) {
    html += `<div class="page-break"><h2>Prestação de Contas Integral</h2>
      ${paragrafoHTML(textos.prestacao || '')}
      <h3>Resumo da Execução</h3>
      <ul style="line-height:1.8;">
        <li><strong>Período:</strong> ${periodoStr}</li>
        <li><strong>Relatórios aprovados:</strong> ${metricas.totalRels}</li>
        <li><strong>Atividades realizadas:</strong> ${metricas.totalAtiv}</li>
        <li><strong>Público alcançado:</strong> ${metricas.publicoTotal.toLocaleString('pt-BR')}</li>
        <li><strong>Orçamento executado:</strong> ${metricas.percentual}%</li>
        <li><strong>Valor utilizado:</strong> R$ ${fmt(metricas.valorUtilizado)}</li>
        <li><strong>Notas Fiscais:</strong> ${metricas.totalNF} / ${metricas.totalCompras} compras</li>
        <li><strong>Rubricas ativas:</strong> ${rubricasAtivas.length}</li>
      </ul>
    </div>`;
  }

  // ── CONCLUSÃO ─────────────────────────────────────────────────────────────
  if (secoes.includes('conclusao')) {
    html += `<div class="page-break"><h2>Conclusão</h2>
      ${paragrafoHTML(textos.conclusao || '')}
    </div>`;
  }

  html += `<div class="rodape">Relatório Físico-Financeiro — Projeto Museus Centro — ${new Date().toLocaleString('pt-BR')}</div></body></html>`;
  
  return html;
}

// ── handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const { dateFrom: df, dateTo: dt, museu: museuFiltro, secoes = [], modo = 'previa', modoEntrega = false, introIA = true } = body;

    if (!df || !dt) return Response.json({ error: 'Informe dateFrom e dateTo' }, { status: 400 });

    const from = new Date(df + 'T00:00:00');
    const to   = new Date(dt + 'T23:59:59');

    _base44ForIA = base44;
    const dados    = await coletarDados(base44, from, to, museuFiltro || null);
    const metricas = calcMetricas(dados);

    if (modo === 'previa') {
      return Response.json({
        total_relatorios:    metricas.totalRels,
        total_atividades:    metricas.totalAtiv,
        publico_total:       metricas.publicoTotal,
        valor_utilizado:     metricas.valorUtilizado,
        percentual:          metricas.percentual,
        total_compras:       metricas.totalCompras,
        total_nf:            metricas.totalNF,
        total_rubricas:      rubricasAtivas.length,
        por_museu:           metricas.porMuseu,
      });
    }

    const secoesPadrao = ['capa','introducao','painel_executivo','resumo_periodo','atividades','fotos','relatorios','financeiro','notas_fiscais','rubricas','prestacao','conclusao'];
    const secoesFinal = secoes.length > 0 ? secoes : secoesPadrao;

    const html = await gerarHTMLCompleto(dados, metricas, secoesFinal, from, to, museuFiltro || null, { modoEntrega, introIA });
    return Response.json({ html });

  } catch (err) {
    console.error('gerarRelatorioFisicoFinanceiro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});