import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Anthropic from 'npm:@anthropic-ai/sdk@0.26.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

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

async function gerarTextoIA(prompt, maxTokens = 1800) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content?.[0]?.text || '';
}

function paragrafoHTML(texto) {
  return (texto || '').split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
}

// ── coleta de dados ───────────────────────────────────────────────────────────

async function coletarDados(base44, from, to, museuFiltro) {
  const [reports, rubricas, purchases, attachments] = await Promise.all([
    base44.asServiceRole.entities.Report.list('-created_date', 500),
    base44.asServiceRole.entities.Rubrica.list('grupo', 200),
    base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500),
    base44.asServiceRole.entities.Attachment.list('-created_date', 1000),
  ]);

  const relsFiltrados = reports.filter(r => {
    if (!reportInPeriod(r, from, to)) return false;
    if (museuFiltro && r.museu !== museuFiltro) return false;
    return true;
  });

  const allAtividades = relsFiltrados.flatMap(r =>
    (Array.isArray(r.atividades) ? r.atividades : []).map(a => ({
      ...a,
      _report_id: r.id,
      _museu:     r.museu,
      _mes:       r.mes_referencia,
      _ano:       r.ano,
      _author:    r.author_name,
    }))
  );

  const comprasFiltradas = purchases.filter(p => {
    if (!['APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(p.status)) return false;
    const d = parseDateStr(p.data_pagamento) || parseDateStr(p.aprov_admin_data) || parseDateStr(p.created_date);
    if (!d || d < from || d > to) return false;
    if (museuFiltro && p.centro_custo && p.centro_custo !== museuFiltro && p.centro_custo !== 'Geral') return false;
    return true;
  });

  const reportIds      = new Set(relsFiltrados.map(r => r.id));
  const attachsFiltrados = attachments.filter(a => reportIds.has(a.report_id));
  const rubricasAtivas = rubricas.filter(r => r.ativo !== false);

  // mapa rubricaId → nome para lookup rápido
  const rubricaMap = Object.fromEntries(rubricas.map(r => [r.id, r.rubrica || r.grupo || '']));

  return { relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas, rubricaMap };
}

// ── métricas ──────────────────────────────────────────────────────────────────

function calcMetricas({ relsFiltrados, allAtividades, comprasFiltradas, rubricasAtivas }) {
  const totalRels    = relsFiltrados.length;
  const aprovados    = relsFiltrados.filter(r => r.status === 'APPROVED').length;
  const totalAtiv    = allAtividades.length;
  const publicoTotal = allAtividades.reduce((s, a) => s + (Number(a.publico_total) || Number(a.publico_estimado) || 0), 0);

  const porMuseu = Object.fromEntries(['MIS','MHAB','MUMO'].map(m => {
    const ativs = allAtividades.filter(a => a._museu === m);
    return [m, {
      atividades: ativs.length,
      publico: ativs.reduce((s, a) => s + (Number(a.publico_total) || Number(a.publico_estimado) || 0), 0),
    }];
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
    .slice(0, 15);

  // valor por museu (das compras)
  const valorPorMuseu = {};
  comprasFiltradas.forEach(p => {
    const m = p.centro_custo || 'Geral';
    valorPorMuseu[m] = (valorPorMuseu[m] || 0) + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0);
  });

  const alertas = [];
  if (totalNF < totalCompras) alertas.push(`${totalCompras - totalNF} compra(s) sem nota fiscal vinculada`);
  if (aprovados < totalRels)  alertas.push(`${totalRels - aprovados} relatório(s) ainda não aprovado(s)`);

  return {
    totalRels, aprovados, totalAtiv, publicoTotal,
    porMuseu, classif, valorPorMuseu,
    valorUtilizado, valorPagoCompras, percentual, saldo,
    totalNF, totalCompras,
    topRubricas, alertas,
  };
}

// ── construção de fotos com legenda completa ──────────────────────────────────

function buildFotosComLegenda(allAtividades, rubricaMap, maxPorAtiv = 4) {
  const lista = [];
  allAtividades.forEach(a => {
    const fotos = Array.isArray(a.fotos) ? a.fotos : [];
    // priorizar: tem drive_url, tem legenda, tem file_url
    const ordenadas = [...fotos].sort((x, y) => {
      const px = (x.drive_url ? 2 : 0) + (x.legenda ? 1 : 0);
      const py = (y.drive_url ? 2 : 0) + (y.legenda ? 1 : 0);
      return py - px;
    }).slice(0, maxPorAtiv);

    ordenadas.forEach(f => {
      if (!f.file_url && !f.drive_url) return;
      const rubrica = a.rubrica_id ? (rubricaMap[a.rubrica_id] || 'não informado') : 'não informado';
      const dataFmt = a.data_realizacao || a.data_inicio || mesStr(a._mes, a._ano) || 'não informado';
      const legenda = [
        `Atividade: ${a.titulo || a.nome || 'não informado'}`,
        `Museu: ${a._museu || 'não informado'}`,
        `Data: ${dataFmt}`,
        `Local: ${a.local || 'não informado'}`,
        `Rubrica: ${rubrica}`,
      ].join(' | ');
      const driveLink = f.drive_url || f.drive_file_id
        ? (f.drive_url || `https://drive.google.com/file/d/${f.drive_file_id}/view`)
        : null;
      lista.push({ url: f.file_url || null, driveLink, legenda, altLegenda: f.legenda || a.titulo || '' });
    });
  });
  return lista;
}

// ── geração de HTML ───────────────────────────────────────────────────────────

async function gerarHTMLCompleto(dados, metricas, secoes, dateFrom, dateTo, museuFiltro, opcoes) {
  const { allAtividades, comprasFiltradas, rubricasAtivas, rubricaMap } = dados;
  const periodoStr = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
  const museuStr   = museuFiltro || 'Todos os Museus';
  const { modoEntrega = false, introIA = true } = opcoes;

  // ── prompts IA ──────────────────────────────────────────────────────────────
  const ctx = `Você é especialista em gestão cultural e prestação de contas públicas. Escreva em português brasileiro, linguagem técnica e institucional (estilo gestor cultural, direto e preciso).
Período: ${periodoStr}. Museus: ${museuStr}.
Dados reais disponíveis:
- ${metricas.totalAtiv} atividades | Público total: ${metricas.publicoTotal.toLocaleString('pt-BR')}
- ${metricas.totalRels} relatórios (${metricas.aprovados} aprovados)
- Orçamento 3º Aditivo: R$ ${fmt(ORCAMENTO_TOTAL)} | Utilizado: R$ ${fmt(metricas.valorUtilizado)} (${metricas.percentual}%) | Saldo: R$ ${fmt(metricas.saldo)}
- META=${metricas.classif.META}, ROTINA=${metricas.classif.ROTINA}, EXTRA=${metricas.classif.EXTRA}
- MIS: ${metricas.porMuseu.MIS?.atividades||0} ativ., público ${(metricas.porMuseu.MIS?.publico||0).toLocaleString('pt-BR')}
- MHAB: ${metricas.porMuseu.MHAB?.atividades||0} ativ., público ${(metricas.porMuseu.MHAB?.publico||0).toLocaleString('pt-BR')}
- MUMO: ${metricas.porMuseu.MUMO?.atividades||0} ativ., público ${(metricas.porMuseu.MUMO?.publico||0).toLocaleString('pt-BR')}
- Total compras: ${metricas.totalCompras} | Com NF: ${metricas.totalNF}
Não invente dados. Se não houver informação, escreva "não informado".`;

  const prompts = {};

  if (secoes.includes('introducao') && introIA) {
    const atvsResumo = allAtividades.slice(0, 12).map(a => a.titulo || a.nome || '').filter(Boolean).join(', ');
    prompts.introducao = `${ctx}\nPrincipais atividades: ${atvsResumo || 'não informado'}.\n\nRedija a Introdução Executiva do Relatório Físico-Financeiro do Projeto Museus Centro. Inclua síntese de execução física, público alcançado, número de atividades, número de relatórios e principais destaques do período. Máximo 3 parágrafos.`;
  }
  if (secoes.includes('resumo_geral'))
    prompts.resumo_geral = `${ctx}\n\nRedija o Resumo Geral do Período destacando resultados físicos e financeiros. Máximo 4 parágrafos.`;

  if (secoes.includes('resumo_museu')) {
    const at = (m) => allAtividades.filter(a => a._museu === m).map(a => a.titulo || a.nome || '').filter(Boolean).slice(0,8).join(', ') || 'nenhuma registrada';
    prompts.resumo_museu = `${ctx}\nAtividades MIS: ${at('MIS')}. MHAB: ${at('MHAB')}. MUMO: ${at('MUMO')}.\n\nRedija um parágrafo de resumo para cada museu (MIS, MHAB, MUMO) destacando atividades, público e destaques do período.`;
  }
  if (secoes.includes('comunicacao')) {
    const atsCom = allAtividades.filter(a => (a.tipo_equipe||'').toUpperCase()==='COMUNICACAO' || (a.equipe_responsavel||'').toLowerCase().includes('comunica')).slice(0,10).map(a=>a.titulo||'').join(', ');
    prompts.comunicacao = `${ctx}\nAções de comunicação: ${atsCom||'não informado'}.\n\nRedija a seção de Comunicação descrevendo ações de divulgação, presença institucional e comunicação do projeto. Máximo 3 parágrafos.`;
  }
  if (secoes.includes('financeiro')) {
    const topRubs = metricas.topRubricas.slice(0,5).map(r=>`${r.rubrica||r.grupo}: R$ ${fmt(r.valor_utilizado)}`).join('; ');
    prompts.financeiro = `${ctx}\nRubricas mais utilizadas: ${topRubs||'não informado'}.\n\nRedija a seção de Execução Financeira explicando uso dos recursos, percentual executado, saldo, rubricas principais e observações. Máximo 3 parágrafos.`;
  }
  if (secoes.includes('prestacao') || modoEntrega) {
    const semNF  = metricas.totalCompras - metricas.totalNF;
    const pendencias = semNF > 0 ? `${semNF} compra(s) sem nota fiscal` : 'nenhuma pendência documental identificada';
    prompts.prestacao = `${ctx}\nPendências documentais: ${pendencias}.\n\nRedija a seção de Prestação de Contas relacionando execução física com financeira, coerência entre atividades e gastos, rubricas mais utilizadas, pendências documentais e observações de auditoria. Máximo 4 parágrafos.`;
  }
  if (secoes.includes('conclusao'))
    prompts.conclusao = `${ctx}\n\nRedija a Conclusão institucional destacando avanços, impacto cultural e compromisso com transparência. Máximo 2 parágrafos.`;
  if (modoEntrega) {
    const topRubs = metricas.topRubricas.slice(0,8).map(r=>`${r.rubrica||r.grupo}: previsto R$ ${fmt(r.valor_rubrica)}, utilizado R$ ${fmt(r.valor_utilizado)}`).join('; ');
    prompts.texto_financeiro_entrega = `${ctx}\nRubricas: ${topRubs||'não informado'}.\n\nRedija texto explicativo financeiro para prestação de contas formal: explique a execução financeira do período, relação entre atividades e gastos, rubricas mais utilizadas, pendências documentais e observações relevantes para a prestadora de contas. Máximo 4 parágrafos.`;
  }

  // executar IA em lotes de 3
  const textos = {};
  const keys = Object.keys(prompts);
  for (let i = 0; i < keys.length; i += 3) {
    const batch = keys.slice(i, i + 3);
    const results = await Promise.all(batch.map(k => gerarTextoIA(prompts[k])));
    batch.forEach((k, j) => { textos[k] = results[j]; });
  }

  // fotos
  const fotosComLegenda = buildFotosComLegenda(allAtividades, rubricaMap, modoEntrega ? 4 : 2);
  const fotoCapa = fotosComLegenda[0];

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const css = `
    @page { margin: 2.5cm 2cm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.65; }
    h1 { font-size: 30px; font-weight: 700; margin: 0 0 10px; }
    h2 { font-size: 17px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 40px; page-break-after: avoid; }
    h3 { font-size: 14px; font-weight: 600; margin-top: 22px; color: #222; }
    p  { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 11.5px; }
    th { background: #111; color: #fff; padding: 7px 9px; text-align: left; font-size: 11px; }
    td { padding: 6px 9px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .capa { text-align: center; padding: 80px 40px; page-break-after: always; }
    .capa h1 { font-size: 34px; margin-bottom: 12px; }
    .capa .sub { font-size: 16px; color: #555; margin: 6px 0; }
    .capa .tag { display: inline-block; background: #111; color: #fff; border-radius: 4px; padding: 3px 12px; font-size: 12px; margin-top: 16px; }
    .badge { display: inline-block; background: #111; color: #fff; border-radius: 3px; padding: 1px 7px; font-size: 10px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .kpi { background: #f5f5f5; border-radius: 6px; padding: 14px 16px; }
    .kpi .val { font-size: 22px; font-weight: 700; }
    .kpi .lbl { font-size: 11px; color: #666; margin-top: 2px; }
    .kpi-2col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 18px 0; }
    .alerta { background: #fff8e1; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 10px 0; font-size: 12px; border-radius: 0 4px 4px 0; }
    .alerta-ok { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 10px 14px; margin: 10px 0; font-size: 12px; border-radius: 0 4px 4px 0; }
    .foto-item { break-inside: avoid; margin-bottom: 14px; }
    img.foto { max-width: 100%; max-height: 220px; object-fit: cover; border-radius: 5px; display: block; }
    .foto-legenda { font-size: 10.5px; color: #555; margin: 4px 0 0; line-height: 1.4; }
    .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 14px 0; }
    .progress-bar { background: #e5e5e5; border-radius: 4px; height: 10px; margin: 6px 0; }
    .progress-fill { background: #111; border-radius: 4px; height: 10px; }
    .rodape { font-size: 10px; color: #999; text-align: center; margin-top: 60px; border-top: 1px solid #e5e5e5; padding-top: 12px; }
    .page-break { page-break-before: always; }
    a { color: #1a56db; word-break: break-all; }
    .resumo-financeiro { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .resumo-financeiro table { margin: 8px 0; }
    .secao-entrega { border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin-top: 20px; }
  `;

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Físico-Financeiro — Museus Centro</title><style>${css}</style></head><body>`;

  // ── CAPA ────────────────────────────────────────────────────────────────────
  if (secoes.includes('capa')) {
    html += `<div class="capa">`;
    if (fotoCapa?.url) html += `<img src="${fotoCapa.url}" style="max-height:200px;border-radius:8px;margin-bottom:24px;" alt="capa"/>`;
    html += `<h1>Relatório Físico-Financeiro</h1>
      <div class="sub">Projeto Museus Centro</div>
      <div class="sub">${periodoStr}</div>
      <div class="sub">${museuStr}</div>
      ${modoEntrega ? '<div class="tag">Entrega / Prestação de Contas</div>' : ''}
      <div class="sub" style="margin-top:20px;font-size:11px;color:#999;">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </div>`;
  }

  // ── SUMÁRIO ──────────────────────────────────────────────────────────────────
  const sumarioItens = [
    ['introducao','Introdução Executiva'],
    ['resumo_geral','Resumo Geral do Período'],
    ['atividades','Atividades Realizadas'],
    ['resumo_museu','Resumo por Museu'],
    ['publico','Público Alcançado'],
    ['comunicacao','Comunicação'],
    ['fotos','Fotos e Registros'],
    ['financeiro','Execução Financeira'],
    ['notas_fiscais','Notas Fiscais e Compras'],
    ['prestacao','Prestação de Contas'],
    ['conclusao','Conclusão'],
  ];
  if (modoEntrega) sumarioItens.push(['resumo_financeiro_entrega','Planilha Resumo Financeira']);

  html += `<div class="page-break"><h2>Sumário</h2><ol style="line-height:2.4;">`;
  sumarioItens.filter(([id]) => secoes.includes(id) || id === 'resumo_financeiro_entrega' && modoEntrega)
    .forEach(([, label]) => { html += `<li>${label}</li>`; });
  html += `</ol></div>`;

  // ── INTRODUÇÃO ───────────────────────────────────────────────────────────────
  if (secoes.includes('introducao')) {
    html += `<div class="page-break"><h2>1. Introdução Executiva</h2>`;
    if (introIA && textos.introducao) {
      html += paragrafoHTML(textos.introducao);
    } else {
      html += `<p>O presente relatório apresenta a execução físico-financeira do Projeto Museus Centro referente ao período de ${periodoStr}, abrangendo os museus ${museuStr}.</p>`;
    }
    html += `</div>`;
  }

  // ── RESUMO GERAL ─────────────────────────────────────────────────────────────
  if (secoes.includes('resumo_geral')) {
    html += `<div class="page-break"><h2>2. Resumo Geral do Período</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalRels}</div><div class="lbl">Relatórios</div></div>
        <div class="kpi"><div class="val">${metricas.aprovados}</div><div class="lbl">Aprovados</div></div>
        <div class="kpi"><div class="val">${metricas.totalAtiv}</div><div class="lbl">Atividades</div></div>
        <div class="kpi"><div class="val">${metricas.publicoTotal.toLocaleString('pt-BR')}</div><div class="lbl">Público total</div></div>
        <div class="kpi"><div class="val">${metricas.classif.META}</div><div class="lbl">Atividades Meta</div></div>
        <div class="kpi"><div class="val">${metricas.classif.ROTINA + metricas.classif.EXTRA}</div><div class="lbl">Rotina + Extra</div></div>
      </div>
      ${paragrafoHTML(textos.resumo_geral)}
    </div>`;
  }

  // ── ATIVIDADES ───────────────────────────────────────────────────────────────
  if (secoes.includes('atividades')) {
    html += `<div class="page-break"><h2>3. Atividades Realizadas</h2>`;
    if (allAtividades.length > 0) {
      html += `<table>
        <thead><tr><th>Título</th><th>Museu</th><th>Mês/Ano</th><th>Classif.</th><th>Público</th></tr></thead>
        <tbody>
          ${allAtividades.map(a => `<tr>
            <td>${a.titulo || a.nome || '—'}</td>
            <td>${a._museu || '—'}</td>
            <td>${mesStr(a._mes, a._ano)}</td>
            <td><span class="badge">${a.classificacao || '—'}</span></td>
            <td>${(Number(a.publico_total)||Number(a.publico_estimado)||0).toLocaleString('pt-BR')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } else {
      html += `<p>Nenhuma atividade registrada no período.</p>`;
    }
    html += `</div>`;
  }

  // ── RESUMO POR MUSEU ─────────────────────────────────────────────────────────
  if (secoes.includes('resumo_museu')) {
    html += `<div class="page-break"><h2>4. Resumo por Museu</h2>
      <div class="kpi-2col">
        ${['MIS','MHAB','MUMO'].map(m => `
          <div class="kpi">
            <div style="font-size:15px;font-weight:700;">${m}</div>
            <div class="val">${metricas.porMuseu[m].atividades} ativ.</div>
            <div class="lbl">Público: ${metricas.porMuseu[m].publico.toLocaleString('pt-BR')}</div>
          </div>`).join('')}
      </div>
      ${paragrafoHTML(textos.resumo_museu)}
    </div>`;
  }

  // ── PÚBLICO ──────────────────────────────────────────────────────────────────
  if (secoes.includes('publico')) {
    const porMes = {};
    allAtividades.forEach(a => {
      const k = mesStr(a._mes, a._ano);
      if (!porMes[k]) porMes[k] = 0;
      porMes[k] += Number(a.publico_total) || Number(a.publico_estimado) || 0;
    });
    html += `<div class="page-break"><h2>5. Público Alcançado</h2>
      <div class="kpi-grid">
        ${['MIS','MHAB','MUMO'].map(m => `<div class="kpi">
          <div class="val">${metricas.porMuseu[m].publico.toLocaleString('pt-BR')}</div>
          <div class="lbl">${m}</div>
        </div>`).join('')}
      </div>
      <h3>Por mês</h3>
      <table>
        <thead><tr><th>Período</th><th>Público</th></tr></thead>
        <tbody>${Object.entries(porMes).map(([k,v])=>`<tr><td>${k}</td><td>${v.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  // ── COMUNICAÇÃO ──────────────────────────────────────────────────────────────
  if (secoes.includes('comunicacao')) {
    html += `<div class="page-break"><h2>6. Comunicação</h2>
      ${paragrafoHTML(textos.comunicacao) || '<p>Não informado.</p>'}
    </div>`;
  }

  // ── FOTOS ────────────────────────────────────────────────────────────────────
  if (secoes.includes('fotos')) {
    html += `<div class="page-break"><h2>7. Fotos e Registros</h2>`;
    if (fotosComLegenda.length > 0) {
      if (modoEntrega) {
        // modo entrega: foto individual com legenda completa
        fotosComLegenda.forEach((f, i) => {
          html += `<div class="foto-item">`;
          if (f.url) {
            html += `<img class="foto" src="${f.url}" alt="${f.altLegenda}" />`;
          } else if (f.driveLink) {
            html += `<p style="font-size:11px;color:#888;">[imagem disponível no Drive]</p>`;
          }
          html += `<p class="foto-legenda">${f.legenda}</p>`;
          if (f.driveLink) html += `<p style="font-size:10px;margin:2px 0;"><a href="${f.driveLink}">Ver no Drive ↗</a></p>`;
          html += `</div>`;
          // quebra de página a cada 4 fotos para não pesar
          if ((i + 1) % 4 === 0 && i < fotosComLegenda.length - 1) html += `<div class="page-break"></div>`;
        });
      } else {
        // modo padrão: grid 2 colunas
        html += `<div class="foto-grid">`;
        fotosComLegenda.slice(0, 30).forEach(f => {
          html += `<div class="foto-item">`;
          if (f.url) html += `<img class="foto" src="${f.url}" alt="${f.altLegenda}" />`;
          html += `<p class="foto-legenda">${f.legenda}</p>`;
          if (f.driveLink) html += `<p style="font-size:10px;margin:2px 0;"><a href="${f.driveLink}">Ver no Drive ↗</a></p>`;
          html += `</div>`;
        });
        html += `</div>`;
      }
    } else {
      html += `<p>Nenhuma foto disponível no período.</p>`;
    }
    html += `</div>`;
  }

  // ── FINANCEIRO ───────────────────────────────────────────────────────────────
  if (secoes.includes('financeiro')) {
    const pct = Math.min(Number(metricas.percentual), 100);
    html += `<div class="page-break"><h2>8. Execução Financeira</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">R$ ${fmt(ORCAMENTO_TOTAL)}</div><div class="lbl">Orçamento Total (3º Aditivo)</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorUtilizado)}</div><div class="lbl">Utilizado acumulado</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.saldo)}</div><div class="lbl">Saldo disponível</div></div>
      </div>
      <p><strong>Percentual executado: ${metricas.percentual}%</strong></p>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
      <h3>Rubricas — detalhamento</h3>
      <table>
        <thead><tr><th>Grupo</th><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>% Exec.</th></tr></thead>
        <tbody>
          ${metricas.topRubricas.map(r => {
            const saldoR = (r.valor_rubrica || 0) - (r.valor_utilizado || 0);
            const pctR   = r.valor_rubrica > 0 ? ((r.valor_utilizado / r.valor_rubrica) * 100).toFixed(1) : '—';
            return `<tr>
              <td>${r.grupo||'—'}</td>
              <td>${r.rubrica||'—'}</td>
              <td>R$ ${fmt(r.valor_rubrica)}</td>
              <td>R$ ${fmt(r.valor_utilizado)}</td>
              <td>R$ ${fmt(saldoR)}</td>
              <td>${pctR}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${paragrafoHTML(textos.financeiro)}
    </div>`;
  }

  // ── NOTAS FISCAIS ────────────────────────────────────────────────────────────
  if (secoes.includes('notas_fiscais')) {
    html += `<div class="page-break"><h2>9. Notas Fiscais, Compras e Pagamentos</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalCompras}</div><div class="lbl">Compras no período</div></div>
        <div class="kpi"><div class="val">${metricas.totalNF}</div><div class="lbl">Com nota fiscal</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorPagoCompras)}</div><div class="lbl">Valor pago/aprovado</div></div>
      </div>`;

    metricas.alertas.forEach(a => { html += `<div class="alerta">⚠ ${a}</div>`; });
    if (metricas.alertas.length === 0) html += `<div class="alerta-ok">✓ Nenhum alerta documental identificado.</div>`;

    if (comprasFiltradas.length > 0) {
      if (modoEntrega) {
        // modo entrega: tabela detalhada com rubrica, NF, data, link
        html += `<table>
          <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Rubrica</th><th>Nº NF</th><th>Data NF</th><th>Valor Pago</th><th>Status</th><th>PDF NF</th><th>XML NF</th></tr></thead>
          <tbody>
            ${comprasFiltradas.map(p => {
              const rubricaNome = p.rubrica_id ? (rubricaMap[p.rubrica_id] || 'não informado') : (p.categoria || '—');
              const pdfLink  = p.nota_fiscal_url  ? `<a href="${p.nota_fiscal_url}">PDF ↗</a>`  : 'arquivo não localizado';
              const xmlLink  = p.orcamento_url    ? `<a href="${p.orcamento_url}">XML ↗</a>`   : '—';
              return `<tr>
                <td>${(p.descricao_item||'—').slice(0,55)}</td>
                <td>${p.fornecedor_nome||'—'}</td>
                <td>${rubricaNome}</td>
                <td>${p.nf_numero||'—'}</td>
                <td>${p.nf_data_emissao||p.data_pagamento||'—'}</td>
                <td>R$ ${fmt(p.valor_pago||p.valor_aprovado_admin||p.valor_solicitado)}</td>
                <td>${p.status||'—'}</td>
                <td style="font-size:10px;">${pdfLink}</td>
                <td style="font-size:10px;">${xmlLink}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      } else {
        // modo padrão: tabela resumida
        html += `<table>
          <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Valor Pago</th><th>Status</th></tr></thead>
          <tbody>
            ${comprasFiltradas.slice(0,80).map(p=>`<tr>
              <td>${(p.descricao_item||'—').slice(0,60)}</td>
              <td>${p.fornecedor_nome||'—'}</td>
              <td>${p.categoria||'—'}</td>
              <td>R$ ${fmt(p.valor_pago||p.valor_aprovado_admin||p.valor_solicitado)}</td>
              <td>${p.status||'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      }
    } else {
      html += `<p>Nenhuma compra encontrada no período.</p>`;
    }
    html += `</div>`;
  }

  // ── PRESTAÇÃO DE CONTAS ──────────────────────────────────────────────────────
  if (secoes.includes('prestacao') || modoEntrega) {
    html += `<div class="page-break"><h2>10. Prestação de Contas</h2>
      ${paragrafoHTML(textos.prestacao) || '<p>Não informado.</p>'}
    </div>`;
  }

  // ── CONCLUSÃO ────────────────────────────────────────────────────────────────
  if (secoes.includes('conclusao')) {
    html += `<div class="page-break"><h2>11. Conclusão</h2>
      ${paragrafoHTML(textos.conclusao) || '<p>Não informado.</p>'}
    </div>`;
  }

  // ── PLANILHA RESUMO FINANCEIRA (modo entrega) ────────────────────────────────
  if (modoEntrega) {
    const totalPorMuseu = Object.entries(metricas.valorPorMuseu)
      .sort((a,b) => b[1]-a[1])
      .map(([m,v]) => `<tr><td>${m}</td><td>R$ ${fmt(v)}</td></tr>`).join('');

    html += `<div class="page-break"><h2>12. Planilha Resumo Financeira</h2>
      <div class="resumo-financeiro">
        <table>
          <thead><tr><th colspan="2">Resumo Geral</th></tr></thead>
          <tbody>
            <tr><td><strong>Total previsto (3º Aditivo)</strong></td><td>R$ ${fmt(ORCAMENTO_TOTAL)}</td></tr>
            <tr><td><strong>Total utilizado no período</strong></td><td>R$ ${fmt(metricas.valorPagoCompras)}</td></tr>
            <tr><td><strong>Total utilizado acumulado</strong></td><td>R$ ${fmt(metricas.valorUtilizado)}</td></tr>
            <tr><td><strong>Saldo disponível</strong></td><td>R$ ${fmt(metricas.saldo)}</td></tr>
            <tr><td><strong>Percentual executado</strong></td><td>${metricas.percentual}%</td></tr>
            <tr><td><strong>Quantidade de notas fiscais</strong></td><td>${metricas.totalNF}</td></tr>
            <tr><td><strong>Quantidade de compras/pagamentos</strong></td><td>${metricas.totalCompras}</td></tr>
          </tbody>
        </table>

        <h3>Por rubrica</h3>
        <table>
          <thead><tr><th>Rubrica</th><th>Grupo</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>%</th></tr></thead>
          <tbody>
            ${rubricasAtivas.sort((a,b)=>(b.valor_utilizado||0)-(a.valor_utilizado||0)).map(r => {
              const saldoR = (r.valor_rubrica||0)-(r.valor_utilizado||0);
              const pctR   = r.valor_rubrica>0 ? ((r.valor_utilizado/r.valor_rubrica)*100).toFixed(1) : '0.0';
              return `<tr>
                <td>${r.rubrica||'—'}</td><td>${r.grupo||'—'}</td>
                <td>R$ ${fmt(r.valor_rubrica)}</td><td>R$ ${fmt(r.valor_utilizado)}</td>
                <td>R$ ${fmt(saldoR)}</td><td>${pctR}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        ${totalPorMuseu ? `
        <h3>Por museu / centro de custo</h3>
        <table>
          <thead><tr><th>Museu / Centro de Custo</th><th>Valor pago no período</th></tr></thead>
          <tbody>${totalPorMuseu}</tbody>
        </table>` : ''}

        ${paragrafoHTML(textos.texto_financeiro_entrega)}
      </div>
    </div>`;
  }

  // ── RODAPÉ ───────────────────────────────────────────────────────────────────
  html += `<div class="rodape">
    Relatório Físico-Financeiro — Projeto Museus Centro — Gerado em ${new Date().toLocaleString('pt-BR')}
    ${modoEntrega ? ' | Modo: Entrega / Prestação de Contas' : ''}
  </div>`;

  html += `</body></html>`;
  return html;
}

// ── handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const {
      dateFrom:    df,
      dateTo:      dt,
      museu:       museuFiltro,
      secoes  = [],
      modo    = 'previa',
      modoEntrega = false,
      introIA     = true,
    } = body;

    if (!df || !dt) return Response.json({ error: 'Informe dateFrom e dateTo' }, { status: 400 });

    const from = new Date(df + 'T00:00:00');
    const to   = new Date(dt + 'T23:59:59');

    const dados    = await coletarDados(base44, from, to, museuFiltro || null);
    const metricas = calcMetricas(dados);

    if (modo === 'previa') {
      return Response.json({
        total_relatorios: metricas.totalRels,
        total_aprovados:  metricas.aprovados,
        total_atividades: metricas.totalAtiv,
        publico_total:    metricas.publicoTotal,
        valor_utilizado:  metricas.valorUtilizado,
        total_nf:         metricas.totalNF,
        total_compras:    metricas.totalCompras,
        percentual:       metricas.percentual,
        saldo:            metricas.saldo,
        alertas:          metricas.alertas,
        por_museu:        metricas.porMuseu,
      });
    }

    const html = await gerarHTMLCompleto(
      dados, metricas, secoes, from, to,
      museuFiltro || null,
      { modoEntrega, introIA }
    );
    return Response.json({ html });

  } catch (err) {
    console.error('gerarRelatorioFisicoFinanceiro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});