import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Anthropic from 'npm:@anthropic-ai/sdk@0.26.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const ORCAMENTO_TOTAL = 1320000;
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── helpers ──────────────────────────────────────────────────────────────────

function parseDateStr(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (typeof s === 'number') return new Date(s);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function dateInRange(dateStr, from, to) {
  const d = parseDateStr(dateStr);
  if (!d) return false;
  return d >= from && d <= to;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesStr(mes, ano) {
  return `${mes || ''}/${ano || ''}`.trim();
}

function reportInPeriod(report, from, to) {
  // tenta submitted_at ou created_date, ou compara mês/ano textual
  const d = parseDateStr(report.submitted_at) || parseDateStr(report.created_date);
  if (d) return d >= from && d <= to;
  // fallback: mês/ano
  const idx = MESES_PT.findIndex(m => m === report.mes_referencia);
  if (idx < 0) return false;
  const rep = new Date(Number(report.ano || new Date().getFullYear()), idx, 1);
  return rep >= new Date(from.getFullYear(), from.getMonth(), 1) &&
         rep <= new Date(to.getFullYear(), to.getMonth(), 1);
}

// ── IA ───────────────────────────────────────────────────────────────────────

async function gerarTextoIA(prompt) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content?.[0]?.text || '';
}

// ── coleta de dados ───────────────────────────────────────────────────────────

async function coletarDados(base44, from, to, museuFiltro) {
  const [reports, rubricas, purchases, attachments] = await Promise.all([
    base44.asServiceRole.entities.Report.list('-created_date', 500),
    base44.asServiceRole.entities.Rubrica.list('grupo', 200),
    base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500),
    base44.asServiceRole.entities.Attachment.list('-created_date', 1000),
  ]);

  // filtrar relatórios no período e museu
  const relsFiltrados = reports.filter(r => {
    if (!reportInPeriod(r, from, to)) return false;
    if (museuFiltro && r.museu !== museuFiltro) return false;
    return true;
  });

  // atividades dentro dos relatórios filtrados
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

  // compras no período
  const comprasFiltradas = purchases.filter(p => {
    if (!['APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(p.status)) return false;
    const d = parseDateStr(p.data_pagamento) || parseDateStr(p.aprov_admin_data) || parseDateStr(p.created_date);
    if (!d) return false;
    if (d < from || d > to) return false;
    if (museuFiltro && p.centro_custo && p.centro_custo !== museuFiltro && p.centro_custo !== 'Geral') return false;
    return true;
  });

  // attachments vinculados a relatórios filtrados
  const reportIds = new Set(relsFiltrados.map(r => r.id));
  const attachsFiltrados = attachments.filter(a => reportIds.has(a.report_id));

  // rubricas ativas
  const rubricasAtivas = rubricas.filter(r => r.ativo !== false);

  return { relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas };
}

// ── métricas ──────────────────────────────────────────────────────────────────

function calcMetricas({ relsFiltrados, allAtividades, comprasFiltradas, rubricasAtivas }) {
  const totalRels   = relsFiltrados.length;
  const aprovados   = relsFiltrados.filter(r => r.status === 'APPROVED').length;
  const totalAtiv   = allAtividades.length;
  const publicoTotal = allAtividades.reduce((s, a) => s + (Number(a.publico_total) || Number(a.publico_estimado) || 0), 0);

  // por museu
  const museus = ['MIS', 'MHAB', 'MUMO'];
  const porMuseu = Object.fromEntries(museus.map(m => {
    const ativs = allAtividades.filter(a => a._museu === m);
    return [m, {
      atividades: ativs.length,
      publico: ativs.reduce((s, a) => s + (Number(a.publico_total) || Number(a.publico_estimado) || 0), 0),
    }];
  }));

  // classificação
  const classif = { META: 0, ROTINA: 0, EXTRA: 0 };
  allAtividades.forEach(a => { if (classif[a.classificacao] !== undefined) classif[a.classificacao]++; });

  // financeiro: somar valor_utilizado de rubricas + compras pagas
  const valorUtilizadoRubricas = rubricasAtivas.reduce((s, r) => s + (Number(r.valor_utilizado) || 0), 0);
  const valorPagoCompras       = comprasFiltradas.reduce((s, p) => s + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0), 0);
  // usa rubricas como fonte primária (mais confiável), compras como referência
  const valorUtilizado = valorUtilizadoRubricas || valorPagoCompras;
  const percentual     = ORCAMENTO_TOTAL > 0 ? ((valorUtilizado / ORCAMENTO_TOTAL) * 100).toFixed(1) : 0;
  const saldo          = ORCAMENTO_TOTAL - valorUtilizado;

  // notas fiscais
  const totalNF     = comprasFiltradas.filter(p => p.nota_fiscal_url || p.nf_numero).length;
  const totalCompras = comprasFiltradas.length;

  // rubricas mais utilizadas
  const topRubricas = [...rubricasAtivas]
    .sort((a, b) => (b.valor_utilizado || 0) - (a.valor_utilizado || 0))
    .slice(0, 10);

  // alertas
  const alertas = [];
  if (totalNF < totalCompras) alertas.push(`${totalCompras - totalNF} compra(s) sem nota fiscal vinculada`);
  if (aprovados < totalRels) alertas.push(`${totalRels - aprovados} relatório(s) ainda não aprovado(s)`);

  return {
    totalRels, aprovados, totalAtiv, publicoTotal,
    porMuseu, classif,
    valorUtilizado, valorPagoCompras, percentual, saldo,
    totalNF, totalCompras,
    topRubricas,
    alertas,
  };
}

// ── geração de HTML do PDF ────────────────────────────────────────────────────

async function gerarHTMLCompleto({ relsFiltrados, allAtividades, comprasFiltradas, attachsFiltrados, rubricasAtivas }, metricas, secoes, dateFrom, dateTo, museuFiltro) {
  const periodoStr = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
  const museuStr   = museuFiltro || 'Todos os Museus';

  // textos IA em paralelo (apenas seções solicitadas)
  const textos = {};

  const prompts = {};
  const ctx = `
Você é especialista em gestão cultural e prestação de contas públicas.
Escreva em português brasileiro, linguagem técnica e institucional.
Período: ${periodoStr}. Museus: ${museuStr}.
Métricas disponíveis:
- ${metricas.totalAtiv} atividades realizadas
- Público total: ${metricas.publicoTotal.toLocaleString('pt-BR')}
- ${metricas.totalRels} relatórios (${metricas.aprovados} aprovados)
- Orçamento: R$ ${fmt(ORCAMENTO_TOTAL)} | Utilizado: R$ ${fmt(metricas.valorUtilizado)} (${metricas.percentual}%)
- Saldo: R$ ${fmt(metricas.saldo)}
- Classificação: META=${metricas.classif.META}, ROTINA=${metricas.classif.ROTINA}, EXTRA=${metricas.classif.EXTRA}
- MIS: ${metricas.porMuseu.MIS?.atividades || 0} ativ., público ${(metricas.porMuseu.MIS?.publico || 0).toLocaleString('pt-BR')}
- MHAB: ${metricas.porMuseu.MHAB?.atividades || 0} ativ., público ${(metricas.porMuseu.MHAB?.publico || 0).toLocaleString('pt-BR')}
- MUMO: ${metricas.porMuseu.MUMO?.atividades || 0} ativ., público ${(metricas.porMuseu.MUMO?.publico || 0).toLocaleString('pt-BR')}
Não invente dados que não estejam acima. Se não houver informação, escreva "não informado".`;

  if (secoes.includes('introducao'))
    prompts.introducao = `${ctx}\n\nRedija a Introdução Executiva do Relatório Físico-Financeiro do Projeto Museus Centro para o período indicado. Máximo 3 parágrafos.`;

  if (secoes.includes('resumo_geral'))
    prompts.resumo_geral = `${ctx}\n\nRedija o Resumo Geral do Período destacando os principais resultados físicos e financeiros. Máximo 4 parágrafos.`;

  if (secoes.includes('resumo_museu')) {
    const atMIS  = allAtividades.filter(a => a._museu === 'MIS').map(a => a.titulo || a.nome || '').filter(Boolean).slice(0, 8).join(', ');
    const atMHAB = allAtividades.filter(a => a._museu === 'MHAB').map(a => a.titulo || a.nome || '').filter(Boolean).slice(0, 8).join(', ');
    const atMUMO = allAtividades.filter(a => a._museu === 'MUMO').map(a => a.titulo || a.nome || '').filter(Boolean).slice(0, 8).join(', ');
    prompts.resumo_museu = `${ctx}\nAtividades MIS: ${atMIS || 'nenhuma registrada'}. Atividades MHAB: ${atMHAB || 'nenhuma registrada'}. Atividades MUMO: ${atMUMO || 'nenhuma registrada'}.\n\nRedija um parágrafo de resumo para cada museu (MIS, MHAB, MUMO) destacando suas atividades e público no período.`;
  }

  if (secoes.includes('comunicacao')) {
    const atsCom = allAtividades.filter(a => (a.tipo_equipe || '').toUpperCase() === 'COMUNICACAO' || (a.equipe_responsavel || '').toLowerCase().includes('comunica')).slice(0, 10).map(a => a.titulo || '').join(', ');
    prompts.comunicacao = `${ctx}\nAções de comunicação identificadas: ${atsCom || 'não informado'}.\n\nRedija a seção de Comunicação descrevendo as ações de divulgação, presença institucional e comunicação do projeto no período. Máximo 3 parágrafos.`;
  }

  if (secoes.includes('financeiro'))
    prompts.financeiro = `${ctx}\n\nRedija a seção de Execução Financeira explicando o uso dos recursos, percentual executado, saldo e principais rubricas. Máximo 3 parágrafos.`;

  if (secoes.includes('prestacao'))
    prompts.prestacao = `${ctx}\n\nRedija a seção de Prestação de Contas relacionando execução física (atividades) com a financeira (gastos), coerência, observações de auditoria e eventuais pendências. Máximo 4 parágrafos.`;

  if (secoes.includes('conclusao'))
    prompts.conclusao = `${ctx}\n\nRedija a Conclusão institucional do relatório destacando os avanços do projeto, impacto cultural e compromisso com a transparência. Máximo 2 parágrafos.`;

  // executar em paralelo com limite de 3 simultâneos
  const keys = Object.keys(prompts);
  for (let i = 0; i < keys.length; i += 3) {
    const batch = keys.slice(i, i + 3);
    const results = await Promise.all(batch.map(k => gerarTextoIA(prompts[k])));
    batch.forEach((k, j) => { textos[k] = results[j]; });
  }

  // fotos selecionadas (até 1 por atividade, priorizar com legenda e drive)
  const fotosMap = {};
  allAtividades.forEach(a => {
    const fotos = Array.isArray(a.fotos) ? a.fotos : [];
    const foto = fotos.find(f => f.drive_url || f.file_url) || fotos[0];
    if (foto) fotosMap[a._report_id + '_' + (a.titulo || '')] = foto;
  });
  const fotoCapa = Object.values(fotosMap)[0];

  // ── HTML ──────────────────────────────────────────────────────────────────

  const css = `
    @page { margin: 2cm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
    h1 { font-size: 28px; font-weight: 700; }
    h2 { font-size: 18px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 40px; page-break-after: avoid; }
    h3 { font-size: 14px; font-weight: 600; margin-top: 20px; }
    p  { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th { background: #111; color: #fff; padding: 8px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .capa { text-align: center; padding: 80px 40px; page-break-after: always; }
    .capa h1 { font-size: 34px; margin-bottom: 12px; }
    .capa .sub { font-size: 16px; color: #555; margin: 6px 0; }
    .badge { display: inline-block; background: #111; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 11px; margin: 2px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
    .kpi { background: #f5f5f5; border-radius: 6px; padding: 14px 16px; }
    .kpi .val { font-size: 22px; font-weight: 700; }
    .kpi .lbl { font-size: 11px; color: #666; margin-top: 2px; }
    .alerta { background: #fff8e1; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 10px 0; font-size: 12px; border-radius: 0 4px 4px 0; }
    img.foto { max-width: 100%; max-height: 200px; object-fit: cover; border-radius: 6px; margin: 6px 0; }
    .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 12px 0; }
    .rodape { font-size: 10px; color: #999; text-align: center; margin-top: 60px; border-top: 1px solid #e5e5e5; padding-top: 12px; }
    .page-break { page-break-before: always; }
    a { color: #1a56db; }
    .progress-bar { background: #e5e5e5; border-radius: 4px; height: 12px; margin: 6px 0; }
    .progress-fill { background: #111; border-radius: 4px; height: 12px; }
  `;

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Físico-Financeiro</title><style>${css}</style></head><body>`;

  // CAPA
  if (secoes.includes('capa')) {
    html += `<div class="capa">`;
    if (fotoCapa?.file_url) html += `<img src="${fotoCapa.file_url}" style="max-height:180px;border-radius:8px;margin-bottom:24px;" alt="capa"/>`;
    html += `<h1>Relatório Físico-Financeiro</h1>
      <div class="sub">Projeto Museus Centro</div>
      <div class="sub">${periodoStr}</div>
      <div class="sub" style="margin-top:12px;">${museuStr}</div>
      <div class="sub" style="margin-top:20px;font-size:12px;color:#999;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>`;
  }

  // SUMÁRIO simples
  html += `<div class="page-break">`;
  html += `<h2>Sumário</h2><ol style="line-height:2.2;">`;
  const sumarioSecoes = [
    ['introducao','Introdução Executiva'],['resumo_geral','Resumo Geral do Período'],
    ['atividades','Atividades Realizadas'],['resumo_museu','Resumo por Museu'],
    ['publico','Público Alcançado'],['comunicacao','Comunicação'],
    ['fotos','Fotos'],['financeiro','Execução Financeira'],
    ['notas_fiscais','Notas Fiscais e Compras'],['prestacao','Prestação de Contas'],
    ['conclusao','Conclusão'],
  ];
  sumarioSecoes.filter(([id]) => secoes.includes(id)).forEach(([, label]) => {
    html += `<li>${label}</li>`;
  });
  html += `</ol></div>`;

  // INTRODUÇÃO
  if (secoes.includes('introducao') && textos.introducao) {
    html += `<div class="page-break"><h2>1. Introdução Executiva</h2>
      ${textos.introducao.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
    </div>`;
  }

  // RESUMO GERAL
  if (secoes.includes('resumo_geral')) {
    html += `<div class="page-break"><h2>2. Resumo Geral do Período</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalRels}</div><div class="lbl">Relatórios</div></div>
        <div class="kpi"><div class="val">${metricas.aprovados}</div><div class="lbl">Aprovados</div></div>
        <div class="kpi"><div class="val">${metricas.totalAtiv}</div><div class="lbl">Atividades</div></div>
        <div class="kpi"><div class="val">${metricas.publicoTotal.toLocaleString('pt-BR')}</div><div class="lbl">Público total</div></div>
        <div class="kpi"><div class="val">${metricas.classif.META}</div><div class="lbl">Ativ. Meta</div></div>
        <div class="kpi"><div class="val">${metricas.classif.ROTINA + metricas.classif.EXTRA}</div><div class="lbl">Rotina + Extra</div></div>
      </div>
      ${textos.resumo_geral ? textos.resumo_geral.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : ''}
    </div>`;
  }

  // ATIVIDADES REALIZADAS
  if (secoes.includes('atividades') && allAtividades.length > 0) {
    html += `<div class="page-break"><h2>3. Atividades Realizadas</h2>
      <table>
        <thead><tr><th>Título</th><th>Museu</th><th>Mês/Ano</th><th>Classificação</th><th>Público</th></tr></thead>
        <tbody>
          ${allAtividades.map(a => `
            <tr>
              <td>${a.titulo || a.nome || '—'}</td>
              <td>${a._museu || '—'}</td>
              <td>${mesStr(a._mes, a._ano)}</td>
              <td><span class="badge">${a.classificacao || '—'}</span></td>
              <td>${(Number(a.publico_total) || Number(a.publico_estimado) || 0).toLocaleString('pt-BR')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // RESUMO POR MUSEU
  if (secoes.includes('resumo_museu')) {
    html += `<div class="page-break"><h2>4. Resumo por Museu</h2>`;
    ['MIS','MHAB','MUMO'].forEach(m => {
      const d = metricas.porMuseu[m];
      html += `<h3>${m}</h3>
        <p>Atividades: <strong>${d.atividades}</strong> | Público: <strong>${d.publico.toLocaleString('pt-BR')}</strong></p>`;
    });
    if (textos.resumo_museu) html += textos.resumo_museu.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
    html += `</div>`;
  }

  // PÚBLICO
  if (secoes.includes('publico')) {
    const porMes = {};
    allAtividades.forEach(a => {
      const k = mesStr(a._mes, a._ano);
      if (!porMes[k]) porMes[k] = 0;
      porMes[k] += Number(a.publico_total) || Number(a.publico_estimado) || 0;
    });
    html += `<div class="page-break"><h2>5. Público Alcançado</h2>
      <div class="kpi-grid">
        ${['MIS','MHAB','MUMO'].map(m => `
          <div class="kpi">
            <div class="val">${metricas.porMuseu[m].publico.toLocaleString('pt-BR')}</div>
            <div class="lbl">${m}</div>
          </div>`).join('')}
      </div>
      <h3>Por mês</h3>
      <table>
        <thead><tr><th>Período</th><th>Público</th></tr></thead>
        <tbody>${Object.entries(porMes).map(([k,v]) => `<tr><td>${k}</td><td>${v.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  // COMUNICAÇÃO
  if (secoes.includes('comunicacao')) {
    html += `<div class="page-break"><h2>6. Comunicação</h2>
      ${textos.comunicacao ? textos.comunicacao.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : '<p>Não informado.</p>'}
    </div>`;
  }

  // FOTOS
  if (secoes.includes('fotos')) {
    const fotosLista = allAtividades.flatMap(a => {
      const fotos = Array.isArray(a.fotos) ? a.fotos : [];
      return fotos.filter(f => f.file_url).slice(0, 2).map(f => ({
        url: f.file_url, legenda: f.legenda || f.descricao || a.titulo || ''
      }));
    }).slice(0, 30);

    html += `<div class="page-break"><h2>7. Fotos</h2>`;
    if (fotosLista.length > 0) {
      html += `<div class="foto-grid">`;
      fotosLista.forEach(f => {
        html += `<div>
          <img class="foto" src="${f.url}" alt="${f.legenda}" />
          <p style="font-size:11px;color:#666;margin:2px 0;">${f.legenda}</p>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<p>Nenhuma foto disponível no período.</p>`;
    }
    html += `</div>`;
  }

  // FINANCEIRO
  if (secoes.includes('financeiro')) {
    const pct = Number(metricas.percentual);
    html += `<div class="page-break"><h2>8. Execução Financeira</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">R$ ${fmt(ORCAMENTO_TOTAL)}</div><div class="lbl">Orçamento Total (3º Aditivo)</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorUtilizado)}</div><div class="lbl">Utilizado</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.saldo)}</div><div class="lbl">Saldo disponível</div></div>
      </div>
      <p><strong>Percentual executado: ${metricas.percentual}%</strong></p>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(pct, 100)}%;"></div></div>
      <h3>Rubricas mais utilizadas</h3>
      <table>
        <thead><tr><th>Grupo</th><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>% Exec.</th></tr></thead>
        <tbody>
          ${metricas.topRubricas.map(r => {
            const pctR = r.valor_rubrica > 0 ? ((r.valor_utilizado / r.valor_rubrica) * 100).toFixed(1) : '—';
            return `<tr>
              <td>${r.grupo || '—'}</td>
              <td>${r.rubrica || '—'}</td>
              <td>R$ ${fmt(r.valor_rubrica)}</td>
              <td>R$ ${fmt(r.valor_utilizado)}</td>
              <td>${pctR}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${textos.financeiro ? textos.financeiro.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : ''}
    </div>`;
  }

  // NOTAS FISCAIS
  if (secoes.includes('notas_fiscais')) {
    html += `<div class="page-break"><h2>9. Notas Fiscais, Compras e Pagamentos</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="val">${metricas.totalCompras}</div><div class="lbl">Compras no período</div></div>
        <div class="kpi"><div class="val">${metricas.totalNF}</div><div class="lbl">Com nota fiscal</div></div>
        <div class="kpi"><div class="val">R$ ${fmt(metricas.valorPagoCompras)}</div><div class="lbl">Valor pago</div></div>
      </div>`;
    if (metricas.alertas.length > 0) {
      metricas.alertas.forEach(a => { html += `<div class="alerta">⚠ ${a}</div>`; });
    }
    if (comprasFiltradas.length > 0) {
      html += `<table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Valor Pago</th><th>Status</th></tr></thead>
        <tbody>
          ${comprasFiltradas.slice(0, 80).map(p => `<tr>
            <td>${(p.descricao_item || '—').slice(0, 60)}</td>
            <td>${p.fornecedor_nome || '—'}</td>
            <td>${p.categoria || '—'}</td>
            <td>R$ ${fmt(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado)}</td>
            <td>${p.status || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } else {
      html += `<p>Nenhuma compra encontrada no período.</p>`;
    }
    html += `</div>`;
  }

  // PRESTAÇÃO DE CONTAS
  if (secoes.includes('prestacao')) {
    html += `<div class="page-break"><h2>10. Prestação de Contas</h2>
      ${textos.prestacao ? textos.prestacao.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : '<p>Não informado.</p>'}
    </div>`;
  }

  // CONCLUSÃO
  if (secoes.includes('conclusao')) {
    html += `<div class="page-break"><h2>11. Conclusão</h2>
      ${textos.conclusao ? textos.conclusao.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : '<p>Não informado.</p>'}
    </div>`;
  }

  // RODAPÉ
  html += `<div class="rodape">
    Relatório Físico-Financeiro — Projeto Museus Centro — gerado em ${new Date().toLocaleString('pt-BR')}
  </div>`;

  html += `</body></html>`;
  return html;
}

// ── handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const { dateFrom: df, dateTo: dt, museu: museuFiltro, secoes = [], modo = 'previa' } = body;

    if (!df || !dt) return Response.json({ error: 'Informe dateFrom e dateTo' }, { status: 400 });

    const from = new Date(df + 'T00:00:00');
    const to   = new Date(dt + 'T23:59:59');

    const dados    = await coletarDados(base44, from, to, museuFiltro || null);
    const metricas = calcMetricas(dados);

    // MODO PRÉVIA — só retorna métricas sem IA
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

    // MODO PDF — gera HTML completo com IA
    const html = await gerarHTMLCompleto(dados, metricas, secoes, from, to, museuFiltro || null);
    return Response.json({ html });

  } catch (err) {
    console.error('gerarRelatorioFisicoFinanceiro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});