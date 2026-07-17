/**
 * ExportarRelatorioHTML
 * Gera um arquivo HTML diagramado, editável e imprimível conforme modelo SUCC/PBH.
 * Cada bloco de seção break-after:page para separação natural na impressão.
 * O usuário pode editar qualquer campo diretamente antes de imprimir/salvar como PDF.
 */

function fmtDate(d) {
  if (!d) return '______/______/________';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function txt(v, fallback = '') { return String(v || fallback); }
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function editableField(label, value, multiline = false) {
  const val = esc(value || '');
  if (multiline) {
    return `
      <div class="field">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value editable" contenteditable="true" data-placeholder="(campo a preencher)">${val || ''}</div>
      </div>`;
  }
  return `
    <div class="field-inline">
      <span class="field-label-inline">${esc(label)}:</span>
      <span class="field-value-inline editable" contenteditable="true" data-placeholder="(campo a preencher)">${val || ''}</span>
    </div>`;
}
function twoFields(l1, v1, l2, v2) {
  return `<div class="two-col">
    <div class="field-inline"><span class="field-label-inline">${esc(l1)}:</span><span class="field-value-inline editable" contenteditable="true">${esc(v1 || '')}</span></div>
    <div class="field-inline"><span class="field-label-inline">${esc(l2)}:</span><span class="field-value-inline editable" contenteditable="true">${esc(v2 || '')}</span></div>
  </div>`;
}
function sectionTitle(num, title) {
  return `<div class="section-title"><span class="section-num">${num}.</span> ${esc(title.toUpperCase())}</div>`;
}
function subTitle(title) {
  return `<div class="sub-title">${esc(title)}</div>`;
}
function instruction(text) {
  return `<div class="instruction">${esc(text)}</div>`;
}
function checkbox(options, selected) {
  return `<div class="checkbox-row">${options.map(op => {
    const on = op === selected;
    return `<label class="cb-item"><input type="checkbox" ${on ? 'checked' : ''} onchange="this.checked=true"> <span>${esc(op)}</span></label>`;
  }).join('')}</div>`;
}

function buildPublicoTable(p) {
  p = p || {};
  const realizadoDireto = p.realizado_direto || 18103;
  const realizadoIndireto = p.realizado_indireto || 0;
  const previstoDireto = p.previsto_direto || 50000;
  const previstoIndireto = p.previsto_indireto || 150000;
  const pctDireto = previstoDireto > 0 ? Math.round(realizadoDireto / previstoDireto * 100) : 0;

  return `
  <table class="data-table">
    <thead><tr>
      <th>MUSEU</th><th>PERÍODO</th><th>ATENDIDO DE FATO</th><th>OBSERVAÇÃO</th>
    </tr></thead>
    <tbody>
      <tr><td><b>MHAB</b></td><td>Fev. a Jun./2026</td><td class="editable" contenteditable="true">15.463</td><td class="editable" contenteditable="true">Soma conservadora dos públicos declarados nos relatórios aprovados.</td></tr>
      <tr><td><b>MIS</b></td><td>Fev. a Jun./2026</td><td class="editable" contenteditable="true">1.499</td><td class="editable" contenteditable="true">Soma conservadora dos públicos declarados nos relatórios aprovados.</td></tr>
      <tr><td><b>MUMO</b></td><td>Fev. a Jun./2026</td><td class="editable" contenteditable="true">1.141</td><td class="editable" contenteditable="true">Soma conservadora dos públicos declarados nos relatórios aprovados.</td></tr>
    </tbody>
    <tfoot><tr class="total-row">
      <td colspan="2"><b>TOTAL GERAL (registro conservador)</b></td>
      <td colspan="2" class="editable" contenteditable="true"><b>${realizadoDireto.toLocaleString('pt-BR')} atendimentos/visitas</b></td>
    </tr></tfoot>
  </table>
  <table class="data-table mt-sm">
    <thead><tr>
      <th>PÚBLICO ALVO TOTAL DO PROJETO</th>
      <th>PREVISTO P/ ATENDIMENTO</th>
      <th>ATENDIDO DE FATO</th>
      <th>JUSTIFICATIVA</th>
    </tr></thead>
    <tbody>
      <tr>
        <td><b>DIRETO</b></td>
        <td class="editable" contenteditable="true">${previstoDireto.toLocaleString('pt-BR')}</td>
        <td class="editable" contenteditable="true">${realizadoDireto.toLocaleString('pt-BR')} (${pctDireto}%)</td>
        <td class="editable" contenteditable="true">Público geral declarado nos relatórios mensais aprovados — soma conservadora MHAB, MIS e MUMO.</td>
      </tr>
      <tr>
        <td><b>INDIRETO</b></td>
        <td class="editable" contenteditable="true">${previstoIndireto.toLocaleString('pt-BR')}</td>
        <td class="editable" contenteditable="true">${realizadoIndireto.toLocaleString('pt-BR')}</td>
        <td class="editable" contenteditable="true">A apurar — não foi possível separar público direto/indireto com segurança nos arquivos analisados.</td>
      </tr>
    </tbody>
  </table>`;
}

function buildMetasTable(metas) {
  if (!metas || metas.length === 0) {
    return `<p class="empty-msg">(Nenhuma meta carregada — use "Preencher com Dados" antes de exportar)</p>`;
  }
  const rows = metas.map(m => {
    const statusClass = (m.status_meta || '').includes('Integral') ? 'status-ok' :
      (m.status_meta || '').includes('Parcial') ? 'status-warn' : 'status-err';
    return `<tr>
      <td class="editable" contenteditable="true"><b>${esc(m.meta_nome || '')}</b></td>
      <td class="editable" contenteditable="true">${esc(m.resultado_esperado || '')}</td>
      <td class="editable" contenteditable="true">${esc(m.acoes || '')}</td>
      <td class="editable" contenteditable="true">${esc(m.periodo || '')}</td>
      <td class="editable" contenteditable="true">${(m.documentos_verificacao || []).join(', ')}</td>
      <td class="editable" contenteditable="true">${esc(m.resultado_alcancado || '')}</td>
      <td class="editable ${statusClass}" contenteditable="true">${esc(m.status_meta || '')}${m.percentual_execucao ? ' — ' + m.percentual_execucao + '%' : ''}</td>
      <td class="editable" contenteditable="true">${esc(m.justificativa || '')}</td>
    </tr>`;
  }).join('');
  return `<table class="data-table metas-table">
    <thead><tr>
      <th>1) METAS</th>
      <th>2) RESULT. ESPERADOS</th>
      <th>3) AÇÕES</th>
      <th>4) PERÍODO</th>
      <th>5) DOCS VERIFICAÇÃO</th>
      <th>6) RESULT. ALCANÇADOS</th>
      <th>7) STATUS EXECUÇÃO</th>
      <th>8) JUSTIFICATIVA</th>
    </tr></thead>
    <tbody>${rows}
      <tr class="blank-row"><td colspan="8">&nbsp;</td></tr>
      <tr class="blank-row"><td colspan="8">&nbsp;</td></tr>
    </tbody>
  </table>
  <p class="obs-text">OBS: Em algumas situações consideramos pertinente a inserção de um parágrafo complementar a fim de esclarecer a metodologia utilizada na execução de uma determinada meta.</p>`;
}

function buildEquipeTable(equipe) {
  if (!equipe || equipe.length === 0) {
    return `<p class="empty-msg">(Nenhum membro de equipe carregado)</p>`;
  }
  const rows = equipe.map(m => `<tr>
    <td class="editable" contenteditable="true">${esc(m.nome || '')}</td>
    <td class="editable" contenteditable="true">${esc(m.cargo || '')}</td>
    <td class="editable" contenteditable="true">${esc(m.tipo_contratacao || '')}</td>
    <td class="editable" contenteditable="true">${esc(m.atribuicoes || m.cargo || '')}</td>
    <td class="editable" contenteditable="true">${esc(m.periodo || '')}</td>
    <td class="editable" contenteditable="true">${esc(m.carga_horaria || '')}</td>
    <td class="editable" contenteditable="true">${fmtBRL(m.valor)}</td>
  </tr>`).join('');
  return `<table class="data-table">
    <thead><tr>
      <th>NOME</th><th>CARGO</th><th>FORMA DE CONTRATAÇÃO</th><th>ATRIBUIÇÕES</th><th>PERÍODO</th><th>C.H. SEMANAL</th><th>VALOR MENSAL BRUTO</th>
    </tr></thead>
    <tbody>${rows}
      <tr class="blank-row"><td colspan="7">&nbsp;</td></tr>
      <tr class="blank-row"><td colspan="7">&nbsp;</td></tr>
    </tbody>
  </table>`;
}

function buildRubricasTable(rubricas, totalFmt) {
  if (!rubricas || rubricas.length === 0) return '';
  const rows = rubricas.map(r => {
    const previsto = r.valor_previsto || r.valor_rubrica || 0;
    const utilizado = r.total_gasto_periodo || r.valor_utilizado || 0;
    const saldo = r.saldo !== undefined ? r.saldo : (previsto - utilizado);
    const negClass = saldo < 0 ? 'text-danger' : '';
    return `<tr>
      <td class="editable" contenteditable="true"><b>${esc(r.rubrica_nome || r.rubrica || r.nome || '')}</b></td>
      <td class="editable" contenteditable="true">${esc(r.grupo || r.meta || '')}</td>
      <td class="editable" contenteditable="true">${esc(r.natureza_despesa || r.numero_natureza || '')}</td>
      <td class="editable text-right" contenteditable="true">${fmtBRL(previsto)}</td>
      <td class="editable text-right" contenteditable="true">${fmtBRL(utilizado)}</td>
      <td class="editable text-right ${negClass}" contenteditable="true">${fmtBRL(saldo)}</td>
      <td class="editable text-center" contenteditable="true">${r.num_nfs || 0}</td>
    </tr>`;
  }).join('');
  return `
  <div class="sub-block">
    ${subTitle('RUBRICAS ORÇAMENTÁRIAS EXECUTADAS NO PERÍODO')}
    ${totalFmt ? `<div class="total-banner">${esc(totalFmt)}</div>` : ''}
    <table class="data-table">
      <thead><tr>
        <th>RUBRICA</th><th>GRUPO / META</th><th>NATUREZA</th><th>PREVISTO (R$)</th><th>EXECUTADO (R$)</th><th>SALDO (R$)</th><th>NFs</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildLinksTable(links, totalFmt) {
  if (!links || links.length === 0) return '';
  const rows = links.slice(0, 40).map(d => {
    const docsArr = [];
    if (d.nf_pdf_url) docsArr.push(`<a href="${esc(d.nf_pdf_url)}" target="_blank" class="doc-link">PDF</a>`);
    if (d.nf_xml_url) docsArr.push(`<a href="${esc(d.nf_xml_url)}" target="_blank" class="doc-link xml">XML</a>`);
    if (d.comprovante_url) docsArr.push(`<a href="${esc(d.comprovante_url)}" target="_blank" class="doc-link comp">Comp.</a>`);
    if (d.drive_folder_url) docsArr.push(`<a href="${esc(d.drive_folder_url)}" target="_blank" class="doc-link drive">Drive</a>`);
    return `<tr>
      <td class="editable" contenteditable="true">${esc(d.nf_numero || '—')}</td>
      <td class="editable" contenteditable="true">${esc((d.fornecedor || d.descricao || '').slice(0, 40))}</td>
      <td class="editable" contenteditable="true">${esc((d.descricao || '').slice(0, 30))}</td>
      <td class="editable text-right" contenteditable="true">${fmtBRL(d.valor)}</td>
      <td class="editable" contenteditable="true">${fmtDate(d.data_emissao)}</td>
      <td>${docsArr.join(' ')}</td>
    </tr>`;
  }).join('');
  return `
  <div class="sub-block">
    ${subTitle('DOCUMENTOS COMPROBATÓRIOS VINCULADOS (NF / XML / Comprovantes)')}
    ${totalFmt ? `<div class="total-banner green">${esc('Total financeiro aprovado no período: ' + totalFmt)}</div>` : ''}
    <table class="data-table">
      <thead><tr>
        <th>NF Nº</th><th>FORNECEDOR</th><th>DESCRIÇÃO</th><th>VALOR (R$)</th><th>DATA NF</th><th>LINKS</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildLinksVerificacao() {
  const links = [
    { fonte: 'Relatórios mensais aprovados', finalidade: 'Fevereiro a junho/2026 — atividades, público, metas e anexos', url: 'https://app.base44.com/Relatorios' },
    { fonte: 'Agenda de atividades', finalidade: 'Registros de eventos, datas, locais e vínculos com metas', url: 'https://app.base44.com/Agenda' },
    { fonte: 'Galeria de fotografias', finalidade: 'Fotos vinculadas aos relatórios e atividades', url: 'https://app.base44.com/GaleriaFotos' },
    { fonte: 'Prestação de contas', finalidade: 'Notas fiscais, comprovantes e documentos financeiros', url: 'https://app.base44.com/Compras' },
    { fonte: 'Gestão documental', finalidade: 'Contratos, documentos aprovados e versões vigentes', url: 'https://app.base44.com/GestaoDocumental' },
    { fonte: 'Relatório de Execução (gerador)', finalidade: 'Geração e reprocessamento do Relatório de Execução do Objeto', url: 'https://app.base44.com/RelatorioExecucaoObjeto' },
  ];
  const rows = links.map(l => `<tr>
    <td>${esc(l.fonte)}</td>
    <td>${esc(l.finalidade)}</td>
    <td><a href="${esc(l.url)}" target="_blank" class="doc-link drive">${esc(l.url)}</a></td>
  </tr>`).join('');
  return `
  <div class="sub-block">
    ${subTitle('13.1. LINKS DIRETOS PARA FONTES DE VERIFICAÇÃO')}
    <table class="data-table">
      <thead><tr><th>FONTE</th><th>FINALIDADE</th><th>LINK / ACESSO</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildGaleriaFotos(relatorio) {
  const fotos = [];
  const vistas = new Set();

  // Atividades com fotos
  for (const atv of (relatorio._atividades_com_fotos || [])) {
    for (const f of (atv.fotos || []).slice(0, 5)) {
      const url = f.url || f.file_url;
      if (!url || vistas.has(url)) continue;
      vistas.add(url);
      fotos.push({ url, legenda: f.legenda || atv.titulo || '', autor: f.autor || 'Daniel Moreira Soares', museu: atv.museu || '', data: f.data || atv.data || '' });
    }
  }
  // Galeria de fotos
  for (const f of (relatorio._fotos_galeria || [])) {
    const url = f.file_url || f.url;
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    fotos.push({ url, legenda: f.legenda || f.caption || f.file_name || '', autor: f.autor || 'Daniel Moreira Soares', museu: f.museu || '', data: f.created_date || '' });
  }
  // Evidências
  for (const ev of (relatorio.anexos_evidencias || [])) {
    const url = ev.foto_url || ev.url;
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    fotos.push({ url, legenda: ev.legenda_editada || ev.legenda_ia || ev.atividade_nome || '', autor: 'Foto de Registro', museu: '', data: ev.atividade_data || '' });
  }

  if (fotos.length === 0) return '';

  // Agrupar em linhas de 3
  const linhas = [];
  for (let i = 0; i < fotos.length; i += 3) linhas.push(fotos.slice(i, i + 3));

  const rows = linhas.map(linha => {
    const cols = linha.map(f => `
      <td class="foto-cell">
        <img src="${esc(f.url)}" alt="${esc(f.legenda)}" class="foto-img" onerror="this.style.display='none';this.nextSibling.style.display='block'">
        <div class="foto-placeholder" style="display:none">📷 Foto não disponível</div>
        <div class="foto-legenda editable" contenteditable="true">Foto de Registro — ${esc(f.legenda.slice(0, 70))}</div>
        <div class="foto-meta">${f.autor ? esc(f.autor) : ''}${f.data ? ' — ' + fmtDate(f.data) : ''}</div>
      </td>`).join('');
    // Preencher colunas vazias
    let extra = '';
    for (let i = linha.length; i < 3; i++) extra += '<td class="foto-cell foto-cell-empty"></td>';
    return `<tr>${cols}${extra}</tr>`;
  }).join('');

  return `
  <div class="section-break">
    ${sectionTitle('14', 'DEMONSTRATIVO FOTOGRÁFICO — ATIVIDADES REALIZADAS')}
    ${instruction('Registros fotográficos das atividades executadas no período. Cada foto apresenta descrição da ação, crédito do autor e data do registro, conforme orientação SUCC/PBH.')}
    <table class="foto-table"><tbody>${rows}</tbody></table>
  </div>`;
}

// ─── CSS completo ───────────────────────────────────────────────────────────
function buildCSS() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 0;
    }
    .toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: #1a1a1a; color: #fff;
      display: flex; align-items: center; gap: 10px; padding: 8px 20px;
      font-size: 11pt; font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .toolbar button {
      background: #fff; color: #1a1a1a; border: none; border-radius: 6px;
      padding: 6px 18px; font-size: 10pt; font-weight: 700; cursor: pointer;
    }
    .toolbar button:hover { background: #e0e0e0; }
    .toolbar button.btn-pdf { background: #e53935; color: #fff; }
    .toolbar button.btn-pdf:hover { background: #c62828; }
    .toolbar .tip { font-size: 9pt; font-weight: 400; color: #ccc; margin-left: 6px; }
    .document {
      max-width: 210mm;
      margin: 64px auto 32px;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    }
    .cover-header {
      display: flex; align-items: stretch; border-bottom: 3px solid #1a1a1a;
      padding: 14px 20px 10px;
    }
    .logo-box {
      background: #1a1a1a; color: #fff;
      width: 52px; min-height: 52px; border-radius: 4px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 9pt; font-weight: 900; letter-spacing: 1px; flex-shrink: 0;
    }
    .logo-box span { line-height: 1.1; }
    .logo-text { margin-left: 14px; }
    .logo-text .org { font-size: 11pt; font-weight: 700; }
    .logo-text .addr { font-size: 8.5pt; color: #555; margin-top: 2px; }
    .page-header {
      background: #1a1a1a; color: #fff;
      padding: 7px 20px; display: flex; justify-content: space-between; align-items: center;
    }
    .page-header .title { font-size: 10pt; font-weight: 700; }
    .page-header .sub { font-size: 8pt; opacity: 0.75; }
    .doc-title-block {
      background: #f0f0f0; padding: 14px 20px; text-align: center; border-bottom: 1px solid #ccc;
    }
    .doc-title { font-size: 15pt; font-weight: 800; letter-spacing: 0.5px; }
    .doc-subtitle { font-size: 9.5pt; color: #555; margin-top: 4px; }
    .section-break {
      padding: 20px 20px 16px;
      break-after: page;
      page-break-after: always;
    }
    .section-break:last-child { break-after: auto; page-break-after: auto; }
    .section-title {
      background: #1a1a1a; color: #fff;
      padding: 6px 12px; font-size: 10pt; font-weight: 700;
      letter-spacing: 0.3px; margin-bottom: 12px; border-radius: 2px;
    }
    .section-num { opacity: 0.7; }
    .sub-title {
      background: #e8e8e8; color: #1a1a1a;
      padding: 4px 10px; font-size: 9pt; font-weight: 700;
      margin: 10px 0 6px; border-left: 4px solid #1a1a1a;
    }
    .instruction {
      background: #fffbdd; border-left: 3px solid #c8a000;
      padding: 6px 10px; font-size: 8pt; font-style: italic; color: #6b5200;
      margin-bottom: 10px; line-height: 1.45;
    }
    .field { margin-bottom: 8px; }
    .field-label { font-size: 7.5pt; color: #888; margin-bottom: 2px; font-weight: 600; text-transform: uppercase; }
    .field-value {
      background: #f8f8f8; border: 1px solid #d0d0d0;
      padding: 5px 8px; min-height: 26px; font-size: 9.5pt;
      border-radius: 3px; line-height: 1.4;
    }
    .field-inline { display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px; }
    .field-label-inline { font-size: 8pt; color: #888; font-weight: 600; white-space: nowrap; min-width: 160px; }
    .field-value-inline {
      flex: 1; border-bottom: 1px solid #d0d0d0;
      font-size: 9.5pt; padding: 1px 4px; min-height: 18px;
    }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 6px; }
    .editable { outline: none; }
    .editable:focus { background: #fffde7; outline: 2px solid #f0c040; border-radius: 2px; }
    .editable:hover { background: #f0f4ff; }
    [data-placeholder]:empty::before {
      content: attr(data-placeholder); color: #bbb; font-style: italic;
    }
    .checkbox-row { display: flex; gap: 20px; margin: 8px 0 12px; }
    .cb-item { display: flex; align-items: center; gap: 6px; font-size: 9.5pt; cursor: pointer; }
    .cb-item input { width: 15px; height: 15px; cursor: pointer; }
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 8px;
    }
    .data-table th {
      background: #1a1a1a; color: #fff;
      padding: 5px 4px; text-align: left; font-size: 7.5pt; font-weight: 700;
      border: 1px solid #333;
    }
    .data-table td {
      padding: 4px 5px; border: 1px solid #d0d0d0;
      vertical-align: top; min-height: 20px;
    }
    .data-table td.editable:focus { background: #fffde7; }
    .data-table tr:nth-child(even) td { background: #f9f9f9; }
    .data-table td.text-right { text-align: right; }
    .data-table td.text-center { text-align: center; }
    .data-table td.text-danger { color: #c62828; font-weight: 700; }
    .data-table .blank-row td { height: 22px; background: #fff; }
    .data-table .total-row td { background: #e0f2e0 !important; font-weight: 700; color: #1b5e20; }
    .metas-table th, .metas-table td { font-size: 7.5pt; }
    .obs-text { font-size: 7.5pt; color: #666; font-style: italic; margin: 4px 0 8px; }
    .status-ok { background: #e0f2e0 !important; color: #1b5e20 !important; font-weight: 700; }
    .status-warn { background: #fff8e1 !important; color: #b45000 !important; font-weight: 700; }
    .status-err { background: #fde8e8 !important; color: #b71c1c !important; font-weight: 700; }
    .sub-block { margin: 12px 0; }
    .total-banner {
      background: #e0f2e0; border: 1px solid #66bb6a;
      padding: 4px 10px; font-size: 9pt; font-weight: 700; color: #1b5e20;
      margin-bottom: 6px; border-radius: 3px;
    }
    .total-banner.green { background: #e0f2e0; }
    .doc-link {
      display: inline-block; font-size: 7.5pt; font-weight: 700;
      padding: 1px 6px; border-radius: 3px; text-decoration: none;
      background: #e8e8e8; color: #333; margin: 1px;
    }
    .doc-link.xml { background: #e3f2fd; color: #0d47a1; }
    .doc-link.comp { background: #e8f5e9; color: #1b5e20; }
    .doc-link.drive { background: #e8eaf6; color: #283593; }
    .assinatura-block { margin-top: 20px; }
    .declaracao { font-size: 8.5pt; line-height: 1.6; color: #333; margin-bottom: 16px; }
    .assinatura-data { font-size: 9pt; margin-bottom: 20px; }
    .assinatura-linha { text-align: center; margin-top: 8px; }
    .assinatura-linha hr { width: 200px; margin: 0 auto 6px; border: none; border-top: 1px solid #333; }
    .assinatura-nome { font-size: 9.5pt; font-weight: 700; }
    .assinatura-cargo { font-size: 8pt; color: #666; }
    .obs-note {
      background: #fff8dd; border: 1px solid #e0b000;
      padding: 8px 12px; margin: 10px 0; border-radius: 3px; font-size: 8.5pt;
    }
    .obs-note b { color: #7a4f00; }
    .foto-table { width: 100%; border-collapse: collapse; }
    .foto-cell { width: 33.3%; vertical-align: top; padding: 4px; }
    .foto-cell-empty { background: transparent; }
    .foto-img {
      width: 100%; height: 90px; object-fit: cover;
      border: 1px solid #ccc; border-radius: 2px; display: block;
    }
    .foto-placeholder {
      width: 100%; height: 90px; background: #eee;
      display: flex; align-items: center; justify-content: center;
      font-size: 8pt; color: #999; border: 1px dashed #ccc; border-radius: 2px;
    }
    .foto-legenda {
      font-size: 7.5pt; font-weight: 700; color: #1a1a1a;
      padding: 3px 2px 1px; min-height: 16px; border-bottom: 1px solid #e0e0e0;
    }
    .foto-meta { font-size: 7pt; color: #888; padding: 1px 2px; font-style: italic; }
    .mt-sm { margin-top: 8px; }
    .footer-bar {
      border-top: 1px solid #ccc; padding: 6px 20px;
      display: flex; justify-content: space-between;
      font-size: 7.5pt; color: #999;
    }
    @media print {
      .toolbar { display: none !important; }
      body { background: #fff; }
      .document { box-shadow: none; max-width: 100%; margin: 0; }
      .section-break { break-after: page; page-break-after: always; }
      .editable { outline: none !important; }
      @page { size: A4 portrait; margin: 15mm 15mm 18mm; }
    }`;
}

// ─── Builder principal ──────────────────────────────────────────────────────
export function exportarRelatorioHTML(relatorio) {
  const r = relatorio || {};
  const ident = r.identificacao_projeto || {};
  const periodo = `${fmtDate(r.data_inicio)} a ${fmtDate(r.data_fim)}`;
  const tipoStr = r.tipo === 'final' ? 'Final' : 'Parcial';
  const gerado = new Date().toLocaleString('pt-BR');

  // ── PARTE 1: Identificação, Endereço, Divulgação, Descrição, Público
  const parte1 = `
  <div class="section-break">
    <div class="cover-header">
      <div class="logo-box"><span>VIA</span><span>DU</span><span>TO</span></div>
      <div class="logo-text">
        <div class="org">Viaduto das Artes — Fundado em 16 de junho de 2015</div>
        <div class="addr">Av. Olinto Meireles, 45 — Barreiro — Belo Horizonte/MG — CEP 30640-010</div>
        <div class="addr">E-mail: viadutodasartes@gmail.com</div>
      </div>
    </div>
    <div class="doc-title-block">
      <div class="doc-title">RELATÓRIO DE EXECUÇÃO DO OBJETO</div>
      <div class="doc-subtitle">Projeto Museus Centro • Relatório ${tipoStr} • Período: ${esc(periodo)}</div>
    </div>

    ${sectionTitle('1', 'TIPO DE RELATÓRIO')}
    ${checkbox(['Parcial', 'Final'], tipoStr)}
    ${editableField('Período de execução — Início', fmtDate(r.data_inicio))}
    ${editableField('Período de execução — Fim', fmtDate(r.data_fim))}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Relatório de Execução do Objeto • SUCC/PBH</span></div>
    ${sectionTitle('2', 'IDENTIFICAÇÃO DO PROJETO')}
    ${editableField('Organização da Sociedade Civil (OSC)', txt(ident.organizacao, 'Viaduto das Artes'))}
    ${editableField('Nome do Projeto', txt(ident.projeto, 'Museus Centro'))}
    ${twoFields('Instrumento Jurídico', txt(ident.instrumento_juridico, 'Termo de Colaboração nº 01-031.069/24-80'), 'Processo Administrativo Nº', txt(ident.processo_administrativo, '01-031.069/24-80'))}
    ${twoFields('Vigência — Início', ident.vigencia_inicio ? fmtDate(ident.vigencia_inicio) : fmtDate(r.data_inicio), 'Vigência — Fim', ident.vigencia_fim ? fmtDate(ident.vigencia_fim) : fmtDate(r.data_fim))}
    ${editableField('Data do primeiro repasse', 'A confirmar no extrato / Portal SUCC')}
    ${editableField('Responsável pela elaboração', txt(ident.responsavel, 'Daniel Perini'))}
    ${twoFields('Telefone', txt(ident.telefone, '(31) 98424-9484'), 'E-mail', txt(ident.email, 'danielperini.mc@viadutodasartes.org.br'))}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Relatório de Execução do Objeto • SUCC/PBH</span></div>
    ${sectionTitle('3', 'ENDEREÇO DE EXECUÇÃO DAS AÇÕES DO PROJETO')}
    ${checkbox(['Endereço Físico', 'Endereço Virtual', 'Ambos'], 'Ambos')}
    ${subTitle('3.1. ENDEREÇO FÍSICO')}
    ${instruction('Caso a OSC execute o projeto em vários locais, preencher o endereço no qual a OSC tenha preferência em receber visita técnica do gestor de parcerias.')}
    ${editableField('Endereço de execução', txt(r.endereco_execucao?.texto_editado || r.endereco_execucao?.texto_ia, 'As ações foram executadas presencialmente nos museus MHAB, MIS BH e MUMO, além de articulações com a Diretoria de Museus e atividades do Noturno nos Museus.'), true)}
    ${twoFields('Bairro', 'Centro', 'Cidade', 'Belo Horizonte')}
    ${subTitle('3.2. ENDEREÇO VIRTUAL (se houver)')}
    ${editableField('Site / Redes Sociais', '@museuscentro / @viadutodasartes')}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Relatório de Execução do Objeto • SUCC/PBH</span></div>
    ${sectionTitle('4', 'DIVULGAÇÃO DA PARCERIA')}
    ${instruction('Informar os meios utilizados pela instituição para a divulgação e transparência das informações referentes à parceria.')}
    ${editableField('Divulgação', txt(r.divulgacao_parceria?.texto_editado || r.divulgacao_parceria?.texto_ia, 'A parceria foi divulgada por meio de programação pública dos museus, cards digitais, redes sociais, assessoria de imprensa, cobertura fotográfica e materiais de sinalização, com identificação da marca Museus Centro e do apoio da Prefeitura de Belo Horizonte/SUCC.'), true)}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Relatório de Execução do Objeto • SUCC/PBH</span></div>
    ${sectionTitle('5', 'DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS NO PERÍODO')}
    ${instruction('Informar os principais pontos de destaque, resultados e benefícios gerados pela execução da parceria (máx. 1500 caracteres).')}
    ${editableField('Descrição', txt(r.descricao_acoes?.texto_editado || r.descricao_acoes?.texto_ia), true)}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Relatório de Execução do Objeto • SUCC/PBH</span></div>
    ${sectionTitle('6', 'PÚBLICO ALVO')}
    ${instruction('Indicar a qual público as ações do projeto serão destinadas, determinando quantitativamente.')}
    ${buildPublicoTable(r.publico_alvo)}
    ${r.publico_alvo?.texto_interpretativo_editado || r.publico_alvo?.texto_interpretativo_ia
      ? editableField('Interpretação', txt(r.publico_alvo.texto_interpretativo_editado || r.publico_alvo.texto_interpretativo_ia), true)
      : ''}
    ${subTitle('6.1. PESQUISA DE SATISFAÇÃO DO PÚBLICO ALVO')}
    Realizou pesquisa de satisfação?
    ${checkbox(['Sim', 'Não'], r.pesquisa_satisfacao?.possui_dados ? 'Sim' : 'Não')}
    ${instruction('Se "sim" descreva o resultado; se "não" justifique a não realização.')}
    ${editableField('Resultado / Justificativa', txt(r.pesquisa_satisfacao?.justificativa_editada || r.pesquisa_satisfacao?.justificativa_ia, 'Não foram aplicados formulários de pesquisa de satisfação neste período de execução.'), true)}
  </div>`;

  // ── PARTE 2: Metas, Lições Aprendidas, Equipe, Rubricas, Links
  const parte2 = `
  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 2 — Metas e Equipe • SUCC/PBH</span></div>
    ${sectionTitle('7', 'CRONOGRAMA DE EXECUÇÃO E CUMPRIMENTO DAS METAS')}
    ${instruction('Nas colunas 01 a 05 transcreva as informações do plano de trabalho aprovado; nas colunas 06 a 08 informe a execução real.')}
    ${buildMetasTable(r.cronograma_metas)}
    ${subTitle('7.1. LIÇÕES APRENDIDAS DURANTE O PERÍODO DE EXECUÇÃO')}
    ${instruction('Quais foram os desafios encontrados e as soluções implementadas? (máx. 1500 caracteres)')}
    ${editableField('Lições Aprendidas', txt(r.licoes_aprendidas?.texto_editado || r.licoes_aprendidas?.texto_ia || r.avaliacao_desafios || r.comentarios_gerais || ''), true)}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 2 — Equipe e Financeiro • SUCC/PBH</span></div>
    ${sectionTitle('8', 'EQUIPE DE TRABALHO')}
    ${instruction('Inserir todos os profissionais contratados para a execução da parceria previstos no plano de trabalho (CLT, RPA, PJ).')}
    ${buildEquipeTable(r.equipe_trabalho)}
    ${r._rubricas_periodo?.length > 0 ? buildRubricasTable(r._rubricas_periodo, r._total_financeiro_fmt) : ''}
    ${r._links_documentos?.length > 0 ? buildLinksTable(r._links_documentos, r._total_financeiro_fmt) : ''}
  </div>`;

  // ── PARTE 3: Impactos, Sustentabilidade, Avaliação, Assinatura, Anexos, Galeria
  const parte3 = `
  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 3 — Impactos e Assinatura • SUCC/PBH</span></div>
    ${sectionTitle('9', 'IMPACTOS ECONÔMICOS E/OU SOCIAIS DAS AÇÕES DESENVOLVIDAS')}
    ${instruction('Demonstre a relação direta de causa e efeito entre as ações e os resultados — como modificaram a condição social e/ou econômica do público-alvo. (máx. 2000 caracteres)')}
    ${editableField('Impactos', txt(r.impactos_economicos_sociais?.texto_editado || r.impactos_economicos_sociais?.texto_ia), true)}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 3 — Sustentabilidade e Avaliação • SUCC/PBH</span></div>
    ${sectionTitle('10', 'POSSIBILIDADE DE SUSTENTABILIDADE DAS AÇÕES APÓS CONCLUSÃO DA PARCERIA')}
    ${instruction('Preenchimento somente em relatório final.')}
    ${editableField('Sustentabilidade', txt(r.sustentabilidade?.texto_editado || r.sustentabilidade?.texto_ia,
      r.tipo !== 'final' ? 'Campo aplicável apenas ao Relatório Final. A análise de sustentabilidade será preenchida na versão definitiva do documento, conforme determinado pelo modelo SUCC/PBH.' : ''), true)}

    ${sectionTitle('11', 'AVALIAÇÃO DA PARCERIA COM A ADMINISTRAÇÃO PÚBLICA')}
    ${instruction('Informar problemas detectados, sugestões ou críticas construtivas relacionadas à administração pública, com o objetivo de apontar melhorias para futuras parcerias.')}
    ${editableField('Avaliação', txt(r.avaliacao_parceria?.texto_editado || r.avaliacao_parceria?.texto_ia || r.avaliacao_pontos_positivos || r.avaliacao_sugestoes || ''), true)}
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 3 — Assinatura • SUCC/PBH</span></div>
    ${sectionTitle('12', 'ASSINATURA DO REPRESENTANTE LEGAL OSC')}
    <div class="assinatura-block">
      <div class="declaracao">
        Declaro que são verídicas as informações prestadas neste relatório e que os documentos comprobatórios de cumprimento parcial ou total dos resultados desta parceria se encontram arquivados sob a guarda da OSC e permanecem à disposição da administração pública ou do conselho gestor para qualquer verificação futura, durante 10 anos após a finalização da parceria.<br><br>
        Declaro ainda que os dados registrados pela OSC no Portal das Parcerias (SUCC) correspondem à realidade dos fatos, estando ciente de que o envio irregular poderá dar ensejo à apresentação de relatório de execução financeira, bem como à aplicação de penalidades conforme o art. 68 da Lei nº 13.019/2014 e art. 62 do Decreto Municipal nº 16.746/2017.
      </div>
      <div class="assinatura-data editable" contenteditable="true">Belo Horizonte, _______ de ___________________________ de 20______</div>
      <div class="assinatura-linha">
        <hr>
        <div class="assinatura-nome editable" contenteditable="true">${esc(r.assinatura?.nome_representante || ident.responsavel || 'Daniel Perini')}</div>
        <div class="assinatura-cargo">Nome/Assinatura do Representante Legal da Organização da Sociedade Civil</div>
      </div>
    </div>
  </div>

  <div class="section-break">
    <div class="page-header"><span class="title">VIADUTO DAS ARTES — MUSEUS CENTRO</span><span class="sub">Parte 3 — Anexos • SUCC/PBH</span></div>
    ${sectionTitle('13', 'ANEXOS E FONTES DE VERIFICAÇÃO')}
    ${instruction('Os documentos de comprovação de cumprimento do objeto deverão ser apresentados conforme as indicações no quadro de cronograma.')}
    ${(r.anexos_evidencias || []).length > 0
      ? (r.anexos_evidencias || []).slice(0, 20).map(a =>
          `<div style="font-size:9pt;padding:2px 0;">• <span class="editable" contenteditable="true">${esc(a.atividade_nome || 'Documento')}${a.atividade_data ? ' — ' + fmtDate(a.atividade_data) : ''}${a.meta_nome ? ' — Meta: ' + a.meta_nome : ''}</span></div>`
        ).join('')
      : `<div class="field-value editable" contenteditable="true">Documentos de evidência a serem anexados conforme cronograma de metas e atividades realizadas no período.</div>`
    }
    ${buildLinksVerificacao()}
    <div class="obs-note">
      <b>OBSERVAÇÃO: Relatório de Comunicação em Anexo</b><br>
      O relatório de comunicação do período (clipping, redes sociais, cobertura fotográfica e assessoria de imprensa) encontra-se em anexo a este documento.
    </div>
  </div>

  ${buildGaleriaFotos(r)}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Execução do Objeto — Museus Centro — ${esc(periodo)}</title>
  <style>${buildCSS()}</style>
</head>
<body>
  <div class="toolbar">
    <span>📄 Relatório de Execução — Museus Centro</span>
    <button class="btn-pdf" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))" title="Remove a edição para impressão limpa">🔒 Travar edição</button>
    <button onclick="document.querySelectorAll('[contenteditable]').forEach(el => el.setAttribute('contenteditable','true'))" title="Reabilita edição">✏️ Editar campos</button>
    <span class="tip">Clique em qualquer campo azul para editar • Ctrl+P para imprimir</span>
  </div>
  <div class="document">
    ${parte1}
    ${parte2}
    ${parte3}
    <div class="footer-bar">
      <span>Viaduto das Artes — Museus Centro — SUCC/PBH</span>
      <span>Gerado em: ${esc(gerado)}</span>
    </div>
  </div>
  <script>
    // Previne que campos editados percam o valor ao atualizar
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Escape') el.blur(); });
    });
    // Ctrl+P abre o diálogo de impressão
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); window.print(); } });
  </script>
</body>
</html>`;

  // Baixar o arquivo
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const mesRef = (r.data_inicio || '').slice(0, 7).replace('-', '_') || 'relatorio';
  a.href = url;
  a.download = `Relatorio_Execucao_Objeto_${mesRef}_EDITAVEL.html`;
  a.click();
  URL.revokeObjectURL(url);
}