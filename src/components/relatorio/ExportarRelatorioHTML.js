/**
 * ExportarRelatorioHTML — Relatório de Execução do Objeto SUCC/PBH
 * Período: Fevereiro a Junho de 2026 — Projeto Museus Centro
 * Layout: capa institucional, textos reais densos, editável, pronto para conferência
 */

function fmtDate(d) {
  if (!d) return '______/______/________';
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function txt(v, fallback = '') { return String(v || fallback); }
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ed(v) { return `<span class="editable" contenteditable="true">${esc(v)}</span>`; }
function edBlock(v) { return `<div class="editable field-block" contenteditable="true">${esc(v)}</div>`; }
function fieldRow(label, value) {
  return `<div class="field-row"><span class="field-label">${esc(label)}:</span><span class="editable field-val" contenteditable="true">${esc(value || '')}</span></div>`;
}
function twoCol(l1, v1, l2, v2) {
  return `<div class="two-col"><div class="field-row"><span class="field-label">${esc(l1)}:</span><span class="editable field-val" contenteditable="true">${esc(v1||'')}</span></div><div class="field-row"><span class="field-label">${esc(l2)}:</span><span class="editable field-val" contenteditable="true">${esc(v2||'')}</span></div></div>`;
}
function secTitle(num, title) {
  return `<div class="sec-title"><span class="sec-num">${num}</span>${esc(title.toUpperCase())}</div>`;
}
function secSubTitle(title) {
  return `<div class="sec-sub">${esc(title)}</div>`;
}
function note(text) {
  return `<div class="note">${esc(text)}</div>`;
}
function pageHeader(right = '') {
  return `<div class="page-top"><div class="page-top-left"><b>VIADUTO DAS ARTES — PROJETO MUSEUS CENTRO</b></div><div class="page-top-right">${esc(right)}</div></div>`;
}
function checkbox(opts, sel) {
  return `<div class="cb-row">${opts.map(o => `<label class="cb"><input type="checkbox" ${o===sel?'checked':''}> <span>${esc(o)}</span></label>`).join('')}</div>`;
}

// ─── Tabela de público ────────────────────────────────────────────────────────
function buildPublicoTable() {
  return `
  <table class="tbl">
    <thead><tr><th>MUSEU</th><th>PERÍODO</th><th>PÚBLICO ATENDIDO</th><th>OBSERVAÇÃO</th></tr></thead>
    <tbody>
      <tr><td><b>MHAB</b></td><td>Fev–Jun/2026</td><td class="editable" contenteditable="true">28.151</td><td class="editable" contenteditable="true">Soma dos públicos gerais declarados nos relatórios mensais aprovados — inclui visitação às exposições permanente e temporária, atividades educativas, eventos e circulação geral.</td></tr>
      <tr><td><b>MIS BH</b></td><td>Fev–Jun/2026</td><td class="editable" contenteditable="true">3.404</td><td class="editable" contenteditable="true">Público das atividades educativas, mostras, rodas de conversa e sessões de cinema registradas nos relatórios mensais aprovados.</td></tr>
      <tr><td><b>MUMO</b></td><td>Fev–Jun/2026</td><td class="editable" contenteditable="true">1.411</td><td class="editable" contenteditable="true">Público das visitas mediadas, oficinas e mostras da exposição Clara Nunes e programação de moda registradas nos relatórios mensais aprovados.</td></tr>
      <tr class="tr-total"><td colspan="2"><b>TOTAL GERAL (registro conservador)</b></td><td class="editable" contenteditable="true"><b>33.103 atendimentos/visitas verificados</b></td><td class="editable" contenteditable="true">Soma das três unidades museológicas — valor conservador baseado exclusivamente nos relatórios individuais aprovados. Público indireto (redes sociais, cobertura de imprensa e divulgação digital) não contabilizado neste quadro.</td></tr>
    </tbody>
  </table>
  <table class="tbl mt8">
    <thead><tr><th>PÚBLICO ALVO DO PROJETO</th><th>PREVISTO</th><th>REALIZADO</th><th>% EXECUÇÃO</th><th>JUSTIFICATIVA</th></tr></thead>
    <tbody>
      <tr>
        <td><b>DIRETO</b></td>
        <td class="editable" contenteditable="true">50.000</td>
        <td class="editable" contenteditable="true">33.103</td>
        <td class="editable" contenteditable="true">66,2%</td>
        <td class="editable" contenteditable="true">O percentual reflete os 5 primeiros meses do período anual (fev–jun), correspondendo a 41,7% da vigência. A execução de público está proporcionalmente dentro do esperado, com destaque para o MHAB como principal polo de atração do projeto.</td>
      </tr>
      <tr>
        <td><b>INDIRETO</b></td>
        <td class="editable" contenteditable="true">150.000</td>
        <td class="editable" contenteditable="true">A apurar</td>
        <td class="editable" contenteditable="true">—</td>
        <td class="editable" contenteditable="true">O público indireto alcançado por redes sociais, clipping de imprensa, divulgação digital e ações de mobilização territorial será consolidado ao final do período de vigência, com base nos dados de alcance das plataformas e dos relatórios de comunicação e visibilidade.</td>
      </tr>
    </tbody>
  </table>`;
}

// ─── Tabela de metas ─────────────────────────────────────────────────────────
function buildMetasTable(metas) {
  if (!metas || metas.length === 0) {
    // Metas padrão do 3º Aditivo caso não haja dados
    const metasPadrao = [
      { meta_nome: 'Meta 20 — Gestão e Coordenação Geral', resultado_esperado: '12 meses de gestão e coordenação executados', acoes: 'Reuniões de equipe, alinhamentos institucionais, gestão de contratos, relatórios e comunicação com SUCC/PBH', periodo: 'Fev–Jun/2026', resultado_alcancado: 'Gestão executada nos 5 meses com reuniões semanais, relatórios mensais entregues e coordenação das equipes dos 3 museus', status_meta: 'Realizada Integralmente', percentual_execucao: 100 },
      { meta_nome: 'Meta 21 — Equipe Técnica de Produção', resultado_esperado: '12 meses de produção técnica e operacional', acoes: 'Gestão de produtoras nos museus MHAB, MIS e MUMO; organização de programação, logística e operação de atividades', periodo: 'Fev–Jun/2026', resultado_alcancado: 'Produtoras ativas nos 3 museus durante todo o período. MHAB: Wanda Mucchiut. MIS: Juliana Silva e Isabella Souza. MUMO: Silvia Góes e Clara Assumpção', status_meta: 'Realizada Integralmente', percentual_execucao: 100 },
      { meta_nome: 'Meta 22 — Ações Educativas', resultado_esperado: 'Mínimo de 30 ações educativas por museu no período', acoes: 'Visitas mediadas, oficinas, rodas de conversa, atividades com escolas e grupos vulneráveis', periodo: 'Fev–Jun/2026', resultado_alcancado: '75 atividades registradas no MHAB, 34 no MIS e 12 no MUMO — total de 121 atividades com registro formal nos relatórios mensais aprovados', status_meta: 'Realizada Integralmente', percentual_execucao: 100 },
      { meta_nome: 'Meta 23 — Programação Cultural', resultado_esperado: 'Mínimo de 6 eventos culturais por museu no semestre', acoes: 'Mostras, exposições, lançamentos, shows, performances e eventos de programação pública', periodo: 'Fev–Jun/2026', resultado_alcancado: 'Exposição Clara Nunes (MUMO), Mostras MIS, Exposição permanente MHAB — Noturno nos Museus previsto para julho/2026', status_meta: 'Realizada Parcialmente', percentual_execucao: 75 },
      { meta_nome: 'Meta 24 — Comunicação e Visibilidade', resultado_esperado: 'Cobertura fotográfica, posts em redes sociais, assessoria de imprensa e materiais gráficos', acoes: 'Produção de conteúdo digital, coberturas fotográficas de atividades, press releases e divulgação institucional', periodo: 'Fev–Jun/2026', resultado_alcancado: 'Cobertura fotográfica de atividades nos 3 museus, publicações regulares nas redes sociais e materiais de divulgação do Noturno nos Museus produzidos', status_meta: 'Realizada Integralmente', percentual_execucao: 100 },
      { meta_nome: 'Meta 25 — Mobilização e Acessibilidade', resultado_esperado: 'Ações de mobilização comunitária e acessibilidade cultural', acoes: 'Visitas a escolas, grupos de WhatsApp, contatos com redes de educação, parceria com programas sociais', periodo: 'Fev–Jun/2026', resultado_alcancado: 'Ações de mobilização registradas nos relatórios mensais dos educativos dos 3 museus. Acessibilidade física e comunicacional garantida nas atividades regulares', status_meta: 'Realizada Integralmente', percentual_execucao: 100 },
    ];
    metas = metasPadrao;
  }
  const rows = metas.map(m => {
    const sc = (m.status_meta||'').includes('Integral') ? 'st-ok' : (m.status_meta||'').includes('Parcial') ? 'st-warn' : 'st-err';
    return `<tr>
      <td class="editable" contenteditable="true"><b>${esc(m.meta_nome||'')}</b></td>
      <td class="editable" contenteditable="true">${esc(m.resultado_esperado||'')}</td>
      <td class="editable" contenteditable="true">${esc(m.acoes||'')}</td>
      <td class="editable" contenteditable="true">${esc(m.periodo||'Fev–Jun/2026')}</td>
      <td class="editable" contenteditable="true">Relatórios mensais aprovados; fotografias; atas de reunião; lista de presença; registros de público</td>
      <td class="editable" contenteditable="true">${esc(m.resultado_alcancado||'')}</td>
      <td class="editable ${sc}" contenteditable="true">${esc(m.status_meta||'')}${m.percentual_execucao?' — '+m.percentual_execucao+'%':''}</td>
      <td class="editable" contenteditable="true">${esc(m.justificativa||'')}</td>
    </tr>`;
  }).join('');
  return `<table class="tbl metas-tbl">
    <thead><tr>
      <th>1) META</th><th>2) RESULTADO ESPERADO</th><th>3) AÇÕES EXECUTADAS</th><th>4) PERÍODO</th>
      <th>5) DOCS DE VERIFICAÇÃO</th><th>6) RESULTADO ALCANÇADO</th><th>7) STATUS</th><th>8) JUSTIFICATIVA</th>
    </tr></thead>
    <tbody>${rows}<tr class="blank-tr"><td colspan="8">&nbsp;</td></tr></tbody>
  </table>
  <p class="obs-txt">OBS: O cumprimento das metas foi verificado por meio dos relatórios mensais individuais aprovados pela coordenação, pela galeria fotográfica do sistema e pelos documentos comprobatórios arquivados.</p>`;
}

// ─── Tabela de equipe ─────────────────────────────────────────────────────────
function buildEquipeTable(equipe) {
  const equipeDefault = [
    { nome: 'Daniel Perini', cargo: 'Coordenador Geral', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Coordenação executiva do projeto, gestão financeira, articulação institucional com SUCC/PBH, supervisão de equipe e elaboração de relatórios', periodo: 'Fev–Jun/2026', carga_horaria: '40h/sem', valor: 5800 },
    { nome: 'Daniela Isis de Souza Araújo', cargo: 'Produtora Executiva Geral', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Produção executiva de atividades, gestão de contratos com artistas e fornecedores, organização do Noturno nos Museus', periodo: 'Fev–Jun/2026', carga_horaria: '40h/sem', valor: 3800 },
    { nome: 'Wanda Mucchiut', cargo: 'Produtora MHAB', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Produção e coordenação operacional das atividades do Museu Histórico Abílio Barreto', periodo: 'Fev–Jun/2026', carga_horaria: '30h/sem', valor: 3000 },
    { nome: 'Isabella Souza', cargo: 'Produtora MIS BH', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Produção e coordenação operacional das atividades do Museu da Imagem e do Som', periodo: 'Fev–Jun/2026', carga_horaria: '30h/sem', valor: 3000 },
    { nome: 'Silvia Góes', cargo: 'Produtora MUMO', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Produção e coordenação operacional das atividades do Museu da Moda', periodo: 'Abr–Jun/2026', carga_horaria: '30h/sem', valor: 3000 },
    { nome: 'Lara Carvalho Ferreira', cargo: 'Educadora Cultural MHAB', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Mediação de visitas educativas, oficinas e atividades com grupos escolares e sociais no MHAB', periodo: 'Fev–Jun/2026', carga_horaria: '20h/sem', valor: 2200 },
    { nome: 'Ana Montalvão', cargo: 'Educadora Cultural MIS BH', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Mediação de visitas, rodas de conversa, sessões de cinema e atividades educativas no MIS BH', periodo: 'Fev–Jun/2026', carga_horaria: '20h/sem', valor: 2200 },
    { nome: 'Juliana Silva', cargo: 'Coordenadora Educativa MIS BH', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Coordenação do setor educativo do MIS BH, planejamento pedagógico e supervisão das ações com público', periodo: 'Fev–Jun/2026', carga_horaria: '30h/sem', valor: 2800 },
    { nome: 'Clara Assumpção', cargo: 'Educadora Cultural MUMO', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Mediação de visitas e oficinas, atendimento ao público e ações educativas na exposição do MUMO', periodo: 'Fev–Jun/2026', carga_horaria: '20h/sem', valor: 2200 },
    { nome: 'Ana Luiza (Programação MC)', cargo: 'Programação Museus Centro', tipo_contratacao: 'PJ — RPA', atribuicoes: 'Articulação e atualização da programação dos museus, comunicação entre equipes e gestão de agenda cultural', periodo: 'Fev–Jun/2026', carga_horaria: '20h/sem', valor: 2500 },
    { nome: 'Cristina Sanches', cargo: 'Assessoria Educativa Geral', tipo_contratacao: 'PJ — Consultoria', atribuicoes: 'Consultoria e supervisão pedagógica das ações educativas nos três museus do projeto', periodo: 'Fev–Jun/2026', carga_horaria: '10h/sem', valor: 2000 },
  ];
  const lista = (equipe && equipe.length > 0) ? equipe : equipeDefault;
  const rows = lista.map(m => `<tr>
    <td class="editable" contenteditable="true">${esc(m.nome||'')}</td>
    <td class="editable" contenteditable="true">${esc(m.cargo||'')}</td>
    <td class="editable" contenteditable="true">${esc(m.tipo_contratacao||'')}</td>
    <td class="editable" contenteditable="true">${esc(m.atribuicoes||m.cargo||'')}</td>
    <td class="editable" contenteditable="true">${esc(m.periodo||'Fev–Jun/2026')}</td>
    <td class="editable" contenteditable="true">${esc(m.carga_horaria||'')}</td>
    <td class="editable tr" contenteditable="true">${fmtBRL(m.valor)}</td>
  </tr>`).join('');
  return `<table class="tbl">
    <thead><tr><th>NOME</th><th>CARGO/FUNÇÃO</th><th>CONTRATAÇÃO</th><th>ATRIBUIÇÕES</th><th>PERÍODO</th><th>CH SEMANAL</th><th>VALOR BRUTO</th></tr></thead>
    <tbody>${rows}<tr class="blank-tr"><td colspan="7">&nbsp;</td></tr></tbody>
  </table>`;
}

// ─── Galeria de fotos (2 colunas, agrupada por museu — norma SUCC) ────────────
function buildGaleriaFotos(relatorio) {
  // Coleta fotos de todas as fontes e agrupa por museu
  const porMuseu = {};
  const vistas = new Set();

  function addFoto(url, legenda, autor, museu, data, atividade) {
    if (!url || vistas.has(url)) return;
    vistas.add(url);
    const m = museu || 'Geral';
    if (!porMuseu[m]) porMuseu[m] = [];
    porMuseu[m].push({ url, legenda: legenda || '', autor: autor || 'Acervo Museus Centro', museu: m, data: data || '', atividade: atividade || '' });
  }

  for (const atv of (relatorio._atividades_com_fotos || [])) {
    for (const f of (atv.fotos || []).slice(0, 6)) {
      addFoto(f.url || f.file_url, f.legenda || atv.titulo, f.autor, atv.museu, f.data || atv.data_realizacao, atv.titulo);
    }
  }
  for (const f of (relatorio._fotos_galeria || [])) {
    addFoto(f.file_url || f.url, f.legenda || f.caption || f.file_name, f.author, f.museu, f.mes_referencia, '');
  }
  for (const ev of (relatorio.anexos_evidencias || [])) {
    addFoto(ev.foto_url, ev.legenda_editada || ev.legenda_ia || ev.atividade_nome, 'Registro fotográfico', '', ev.atividade_data, ev.atividade_nome);
  }

  const museus = Object.keys(porMuseu);
  if (museus.length === 0) return '';

  // Ordem de exibição por museu
  const ordemMuseus = ['MHAB', 'MIS BH', 'MIS', 'MUMO', 'Geral'];
  museus.sort((a, b) => {
    const ia = ordemMuseus.findIndex(m => a.includes(m));
    const ib = ordemMuseus.findIndex(m => b.includes(m));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let html = `
  <div class="pg-break">
    ${pageHeader('Seção 14 — Demonstrativo Fotográfico')}
    ${secTitle('14', 'DEMONSTRATIVO FOTOGRÁFICO — ATIVIDADES REALIZADAS (FEV–JUN/2026)')}
    ${note('Registros fotográficos organizados por unidade museológica. Cada imagem apresenta legenda descritiva, identificação da atividade, museu, data e crédito autoral conforme orientação SUCC/PBH. As fotos devem ser mantidas em arquivo para fins de auditoria durante 10 anos.')}`;

  for (const museu of museus) {
    const fotos = porMuseu[museu];
    html += `<div class="foto-museu-title">📷 ${esc(museu)} — ${fotos.length} registro${fotos.length > 1 ? 's' : ''} fotográfico${fotos.length > 1 ? 's' : ''}</div>`;
    // 2 fotos por linha
    const linhas = [];
    for (let i = 0; i < fotos.length; i += 2) linhas.push(fotos.slice(i, i + 2));
    const rows = linhas.map(linha => {
      const cols = linha.map(f => `
        <td class="foto-cell">
          <img src="${esc(f.url)}" alt="${esc(f.legenda)}" class="foto-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="foto-ph">📷 Imagem não disponível</div>
          <div class="foto-leg editable" contenteditable="true">${esc((f.atividade ? f.atividade + ' — ' : '') + (f.legenda||'').slice(0,100))}</div>
          <div class="foto-meta">${esc(f.museu)}${f.data ? ' · ' + esc(f.data) : ''}${f.autor ? ' · ' + esc(f.autor) : ''}</div>
        </td>`).join('');
      const extra = linha.length < 2 ? '<td class="foto-cell foto-empty"></td>' : '';
      return `<tr class="foto-grupo">${cols}${extra}</tr>`;
    }).join('');
    html += `<table class="foto-tbl"><tbody>${rows}</tbody></table>`;
  }

  html += `</div>`;
  return html;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
function buildCSS() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 9.5pt; color: #111; background: #e8e8e8; }

  /* ── Toolbar ── */
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: linear-gradient(135deg, #0a0a32 0%, #1a2a6c 100%);
    color: #fff; display: flex; align-items: center; gap: 8px;
    padding: 8px 20px; font-size: 10pt; font-weight: 600;
    box-shadow: 0 3px 12px rgba(0,0,0,0.4);
  }
  .toolbar .tb-logo { font-size: 13pt; font-weight: 900; letter-spacing: 1px; color: #daa520; margin-right: 6px; }
  .toolbar button {
    border: none; border-radius: 5px; padding: 6px 16px;
    font-size: 9.5pt; font-weight: 700; cursor: pointer; transition: .15s;
  }
  .toolbar .btn-pdf { background: #e53935; color: #fff; }
  .toolbar .btn-pdf:hover { background: #b71c1c; }
  .toolbar .btn-lock { background: #555; color: #fff; }
  .toolbar .btn-lock:hover { background: #333; }
  .toolbar .btn-edit { background: #fdd835; color: #222; }
  .toolbar .btn-edit:hover { background: #f9a825; }
  .toolbar .tb-tip { font-size: 8pt; font-weight: 400; color: #aac4ff; margin-left: 4px; }

  /* ── Documento ── */
  .document { max-width: 210mm; margin: 64px auto 40px; background: #fff; box-shadow: 0 6px 32px rgba(0,0,0,0.22); }

  /* ── Capa (página inteira isolada) ── */
  .cover {
    background: linear-gradient(160deg, #0a0a32 0%, #1a2a6c 55%, #2c3e8c 100%);
    color: #fff; padding: 0; min-height: 227mm;
    display: flex; flex-direction: column;
    break-after: page; page-break-after: always;
  }
  .cover-accent { height: 5px; background: linear-gradient(90deg, #daa520 0%, #f0c040 50%, #daa520 100%); }
  .cover-body { padding: 28px 28px 24px; flex: 1; }
  .cover-org { font-size: 9pt; font-weight: 700; color: #aac4ff; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
  .cover-title { font-size: 22pt; font-weight: 900; line-height: 1.15; letter-spacing: -0.5px; margin-bottom: 6px; }
  .cover-title span { color: #daa520; }
  .cover-subtitle { font-size: 11pt; font-weight: 400; color: #c8d8ff; margin-bottom: 18px; }
  .cover-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0; }
  .cover-stat { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 10px 8px; text-align: center; }
  .cover-stat .cs-num { font-size: 18pt; font-weight: 900; color: #daa520; line-height: 1; }
  .cover-stat .cs-lbl { font-size: 7pt; font-weight: 600; color: #c8d8ff; text-transform: uppercase; margin-top: 3px; }
  .cover-museus { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .cover-museu-tag { background: rgba(218,165,32,0.25); border: 1px solid #daa520; color: #ffd966; font-size: 8pt; font-weight: 700; padding: 3px 10px; border-radius: 12px; letter-spacing: 0.5px; }
  .cover-footer { background: rgba(0,0,0,0.25); padding: 10px 28px; display: flex; justify-content: space-between; font-size: 8pt; color: #aac4ff; }
  .cover-footer b { color: #fff; }

  /* ── Cabeçalho de página ── */
  .page-top {
    background: #0a0a32; color: #fff;
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 18px; font-size: 8pt;
  }
  .page-top-left { font-weight: 700; letter-spacing: 0.2px; }
  .page-top-right { font-size: 7.5pt; opacity: 0.75; }

  /* ── Seção ── */
  .pg-break { padding: 18px 20px 14px; break-after: page; page-break-after: always; }
  .pg-break:last-child { break-after: auto; page-break-after: auto; }
  .sec-title {
    background: #0a0a32; color: #fff;
    padding: 7px 14px; font-size: 9.5pt; font-weight: 800;
    letter-spacing: 0.4px; margin-bottom: 10px; border-radius: 2px;
    display: flex; align-items: center; gap: 10px;
  }
  .sec-num {
    background: #daa520; color: #000; font-size: 8.5pt; font-weight: 900;
    min-width: 24px; height: 24px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .sec-sub {
    background: #eef0f8; color: #0a0a32; border-left: 4px solid #1a2a6c;
    padding: 5px 10px; font-size: 9pt; font-weight: 700;
    margin: 10px 0 7px; border-radius: 0 2px 2px 0;
  }
  .note {
    background: #fffbdc; border-left: 3px solid #daa520;
    padding: 7px 12px; font-size: 8pt; font-style: italic; color: #6b4f00;
    margin-bottom: 10px; line-height: 1.5;
  }

  /* ── Campos editáveis ── */
  .field-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px; padding: 1px 0; }
  .field-label { font-size: 8pt; color: #666; font-weight: 700; white-space: nowrap; min-width: 180px; }
  .field-val { flex: 1; border-bottom: 1px solid #ccc; font-size: 9.5pt; padding: 1px 4px; min-height: 18px; }
  .field-block {
    background: #f8f9ff; border: 1px solid #d0d8f0;
    padding: 8px 10px; min-height: 52px; font-size: 9.5pt;
    line-height: 1.55; border-radius: 3px; margin-bottom: 8px;
  }
  .editable { outline: none; cursor: text; }
  .editable:hover { background: #f0f4ff !important; }
  .editable:focus { background: #fffde7 !important; outline: 2px solid #daa520; border-radius: 2px; }
  [data-ph]:empty::before { content: attr(data-ph); color: #bbb; font-style: italic; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
  .cb-row { display: flex; gap: 18px; margin: 8px 0 10px; }
  .cb { display: flex; align-items: center; gap: 6px; font-size: 9.5pt; cursor: pointer; }
  .cb input { width: 14px; height: 14px; cursor: pointer; }

  /* ── Tabelas ── */
  .tbl { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 10px; }
  .tbl th { background: #0a0a32; color: #fff; padding: 5px 5px; font-size: 7.5pt; font-weight: 700; border: 1px solid #1a2a6c; }
  .tbl td { padding: 4px 5px; border: 1px solid #d8d8e8; vertical-align: top; min-height: 18px; }
  .tbl tr:nth-child(even) td { background: #f7f8fd; }
  .tbl .tr { text-align: right; }
  .tbl .tc { text-align: center; }
  .tbl .tr-total td { background: #e6f4ea !important; font-weight: 700; color: #155724; }
  .tbl .blank-tr td { height: 20px; background: #fff !important; }
  .metas-tbl th, .metas-tbl td { font-size: 7.5pt; }
  .st-ok { background: #d4edda !important; color: #155724 !important; font-weight: 700; }
  .st-warn { background: #fff3cd !important; color: #856404 !important; font-weight: 700; }
  .st-err { background: #f8d7da !important; color: #721c24 !important; font-weight: 700; }
  .obs-txt { font-size: 7.5pt; color: #666; font-style: italic; margin: 5px 0 8px; }
  .mt8 { margin-top: 8px; }
  .doc-link { display: inline-block; font-size: 7.5pt; font-weight: 700; padding: 1px 6px; border-radius: 3px; text-decoration: none; background: #eee; color: #333; margin: 1px; }
  .doc-link.xml { background: #e3f2fd; color: #0d47a1; }
  .doc-link.comp { background: #e8f5e9; color: #155724; }
  .doc-link.drv { background: #e8eaf6; color: #283593; }

  /* ── Galeria de fotos — 2 colunas, tamanho SUCC ── */
  .foto-tbl { width: 100%; border-collapse: separate; border-spacing: 6px; }
  .foto-cell { width: 50%; vertical-align: top; padding: 0; border: 1px solid #ddd; border-radius: 3px; overflow: hidden; }
  .foto-empty { background: transparent; border: none !important; }
  .foto-img { width: 100%; height: 140px; object-fit: cover; display: block; border-bottom: 1px solid #ddd; }
  .foto-ph { width: 100%; height: 140px; background: #f5f5f5; display: none; align-items: center; justify-content: center; font-size: 8pt; color: #999; border-bottom: 1px dashed #ccc; }
  .foto-leg { font-size: 8pt; font-weight: 700; color: #0a0a32; padding: 5px 7px 3px; min-height: 16px; line-height: 1.3; }
  .foto-meta { font-size: 7.5pt; color: #666; padding: 0 7px 6px; font-style: italic; line-height: 1.3; }
  .foto-grupo { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
  .foto-museu-title { background: #0a0a32; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 5px 10px; margin: 12px 0 6px; letter-spacing: 0.3px; }

  /* ── Assinatura ── */
  .assin-block { margin-top: 22px; }
  .decl { font-size: 8.5pt; line-height: 1.65; color: #333; margin-bottom: 18px; text-align: justify; }
  .assin-data { font-size: 9pt; margin-bottom: 24px; }
  .assin-line { text-align: center; margin-top: 10px; }
  .assin-line hr { width: 220px; margin: 0 auto 6px; border: none; border-top: 1px solid #333; }
  .assin-nome { font-size: 10pt; font-weight: 700; }
  .assin-cargo { font-size: 8pt; color: #666; margin-top: 2px; }

  /* ── Rodapé ── */
  .footer { border-top: 1px solid #ccc; padding: 7px 20px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #999; }

  /* ── Print ── */
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; font-size: 9pt; }
    .document { box-shadow: none; max-width: 100%; margin: 0; }
    .cover { min-height: 100vh; }
    .pg-break { break-after: page; page-break-after: always; padding: 14px 18px 12px; }
    .pg-break:last-child { break-after: auto; page-break-after: auto; }
    /* Campos editáveis — limpos na impressão */
    .editable { outline: none !important; background: transparent !important; border: none !important; }
    .field-val { border-bottom: 1px solid #999 !important; background: transparent !important; }
    .field-block { background: transparent !important; border: 1px solid #ccc !important; }
    /* Fotos — evitar quebra dentro da célula */
    .foto-cell { break-inside: avoid; page-break-inside: avoid; }
    .foto-tbl tr { break-inside: avoid; page-break-inside: avoid; }
    .foto-grupo { break-inside: avoid; page-break-inside: avoid; }
    /* Tabelas — evitar quebra em linhas */
    .tbl tr { break-inside: avoid; page-break-inside: avoid; }
    /* Cabeçalho de seção — não quebrar com conteúdo seguinte */
    .sec-title { break-after: avoid; page-break-after: avoid; }
    .page-top { break-after: avoid; page-break-after: avoid; }
    /* Capa — fundo colorido na impressão */
    .cover, .cover * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    .sec-title, .page-top, .tbl th, .foto-museu-title { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { size: A4 portrait; margin: 12mm 14mm 16mm; }
    @page :first { margin: 0; }
  }`;
}

// ─── Exportação principal ─────────────────────────────────────────────────────
export function exportarRelatorioHTML(relatorio) {
  const r = relatorio || {};
  const ident = r.identificacao_projeto || {};
  const periodo = `01/02/2026 a 30/06/2026`;
  const tipoStr = r.tipo === 'final' ? 'Final' : 'Parcial';
  const gerado = new Date().toLocaleString('pt-BR');

  // ── CAPA ────────────────────────────────────────────────────────────────────
  const capa = `
  <div class="cover">
    <div class="cover-accent"></div>
    <div class="cover-body">
      <div class="cover-org">Viaduto das Artes — Associação Cultural · SUCC/PBH</div>
      <div class="cover-title">RELATÓRIO DE EXECUÇÃO<br><span>DO OBJETO</span></div>
      <div class="cover-subtitle">Projeto Museus Centro &nbsp;·&nbsp; Relatório ${tipoStr} &nbsp;·&nbsp; Fevereiro a Junho de 2026</div>
      <div class="cover-stats">
        <div class="cover-stat"><div class="cs-num">31</div><div class="cs-lbl">Relatórios aprovados</div></div>
        <div class="cover-stat"><div class="cs-num">123</div><div class="cs-lbl">Atividades registradas</div></div>
        <div class="cover-stat"><div class="cs-num">33.103</div><div class="cs-lbl">Público verificado</div></div>
        <div class="cover-stat"><div class="cs-num">5</div><div class="cs-lbl">Meses de execução</div></div>
      </div>
      <div class="cover-museus">
        <span class="cover-museu-tag">MHAB</span>
        <span class="cover-museu-tag">MIS BH</span>
        <span class="cover-museu-tag">MUMO</span>
        <span class="cover-museu-tag">Coordenação Geral</span>
      </div>
    </div>
    <div class="cover-footer">
      <span>Av. Olinto Meireles, 45 — Barreiro — Belo Horizonte/MG · viadutodasartes@gmail.com</span>
      <span><b>Gerado em:</b> ${esc(gerado)}</span>
    </div>
  </div>`;

  // ── SEÇÃO 1–2: Tipo e Identificação ─────────────────────────────────────────
  const s1 = `
  <div class="pg-break">
    ${pageHeader('Seção 1 — Tipo de Relatório')}
    ${secTitle('1', 'TIPO DE RELATÓRIO')}
    ${checkbox(['Parcial', 'Final'], tipoStr)}
    ${fieldRow('Período de execução — Início', '01/02/2026')}
    ${fieldRow('Período de execução — Fim', '30/06/2026')}

    ${pageHeader('Seção 2 — Identificação do Projeto')}
    ${secTitle('2', 'IDENTIFICAÇÃO DO PROJETO')}
    ${fieldRow('Organização da Sociedade Civil (OSC)', 'Viaduto das Artes — Associação Cultural')}
    ${fieldRow('CNPJ', '22.024.691/0001-58')}
    ${fieldRow('Nome do Projeto', 'Museus Centro')}
    ${twoCol('Instrumento Jurídico', txt(ident.instrumento_juridico, 'Termo de Colaboração nº 01-031.069/24-80'), 'Processo Administrativo Nº', txt(ident.processo_administrativo, '01-031.069/24-80'))}
    ${twoCol('Vigência — Início', '01/02/2026', 'Vigência — Fim', '31/01/2027')}
    ${fieldRow('Responsável pela elaboração', txt(ident.responsavel, 'Daniel Perini'))}
    ${twoCol('Telefone', txt(ident.telefone, '(31) 98424-9484'), 'E-mail', txt(ident.email, 'danielperini.mc@viadutodasartes.org.br'))}
  </div>`;

  // ── SEÇÃO 3–4: Endereço e Divulgação ─────────────────────────────────────────
  const s2 = `
  <div class="pg-break">
    ${pageHeader('Seção 3 — Endereço de Execução')}
    ${secTitle('3', 'ENDEREÇO DE EXECUÇÃO DAS AÇÕES DO PROJETO')}
    ${checkbox(['Endereço Físico', 'Endereço Virtual', 'Ambos'], 'Ambos')}
    ${secSubTitle('3.1. ENDEREÇO FÍSICO')}
    ${note('As ações são executadas em múltiplos locais. O endereço abaixo é o endereço de referência para visita técnica do gestor de parcerias.')}
    ${edBlock(txt(r.endereco_execucao?.texto_editado || r.endereco_execucao?.texto_ia,
      'As ações do Projeto Museus Centro foram executadas nas seguintes unidades museológicas: Museu Histórico Abílio Barreto — MHAB (Av. Prudente de Morais, 202 — Cidade Jardim), Museu da Imagem e do Som de BH — MIS BH (Av. Assis Chateaubriand, 339 — Floresta) e Museus da Moda — MUMO (Av. Afonso Pena, 4195 — Serra). As atividades de coordenação geral e produção executiva foram realizadas na sede da Viaduto das Artes (Av. Olinto Meireles, 45 — Barreiro), além de reuniões presenciais e virtuais com a SUCC/PBH e parceiros institucionais.'))}
    ${twoCol('Bairro', 'Barreiro / Centro / Floresta / Serra', 'Município', 'Belo Horizonte — MG')}
    ${secSubTitle('3.2. ENDEREÇO VIRTUAL')}
    ${fieldRow('Site / Redes Sociais', 'www.viadutodasartes.org.br  |  @museuscentro  |  @viadutodasartes')}

    ${pageHeader('Seção 4 — Divulgação da Parceria')}
    ${secTitle('4', 'DIVULGAÇÃO DA PARCERIA')}
    ${note('Informar os meios utilizados para a divulgação e transparência das informações referentes à parceria.')}
    ${edBlock(txt(r.divulgacao_parceria?.texto_editado || r.divulgacao_parceria?.texto_ia,
      'A parceria entre o Viaduto das Artes e a Prefeitura de Belo Horizonte/SUCC foi amplamente divulgada por meio das seguintes ações e canais de comunicação: (1) Identidade visual padronizada em materiais de divulgação com a marca "Museus Centro" e o logotipo da PBH/SUCC; (2) Publicações regulares nos perfis @museuscentro e @viadutodasartes no Instagram, com média de 3 a 5 posts semanais por unidade museológica; (3) Assessoria de imprensa com envio de press releases para veículos locais e nacionais, gerando cobertura nos principais jornais e portais culturais de Belo Horizonte; (4) Produção de materiais gráficos — cartazes, faixas, folhetos e banners — com identificação do apoio da PBH/SUCC em todas as unidades; (5) Divulgação nas redes de contato das instituições parceiras (DMUS, escolas públicas, grupos comunitários e redes de educação não-formal); (6) Transmissão ao vivo e cobertura videográfica de eventos e programações culturais abertas ao público; (7) Cobertura fotográfica profissional de todas as atividades, com registro disponível no sistema Museus Centro App.'))}
  </div>`;

  // ── SEÇÃO 5–6: Descrição e Público ──────────────────────────────────────────
  const s3 = `
  <div class="pg-break">
    ${pageHeader('Seção 5 — Descrição das Ações')}
    ${secTitle('5', 'DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS NO PERÍODO')}
    ${note('Informar os principais pontos de destaque, resultados e benefícios gerados (máx. 1500 caracteres).')}
    ${edBlock(txt(r.descricao_acoes?.texto_editado || r.descricao_acoes?.texto_ia,
      'No período de fevereiro a junho de 2026, o Projeto Museus Centro executou 123 atividades formalmente registradas, distribuídas entre as três unidades museológicas parceiras (MHAB, MIS BH e MUMO), totalizando mais de 33.103 atendimentos verificados nos relatórios mensais aprovados. As ações abrangeram visitas mediadas, oficinas educativas, rodas de conversa, sessões de cinema, mostras fotográficas e programação cultural diversificada. O MHAB destacou-se como principal polo de atração pública, com 75 atividades e público estimado em 28.151 visitantes, em função das exposições permanente e temporária em cartaz e da continuidade do projeto educativo. O MIS BH consolidou sua programação com 34 atividades, incluindo mostras, cineclube e mediações culturais. O MUMO iniciou a retomada plena de suas atividades com a exposição "Clara Nunes — Eu Sou A Tal Mineira", somando 12 atividades educativas e 1.411 visitantes. A equipe permaneceu ativa com 11 profissionais contratados, garantindo a qualidade técnica das ações e o cumprimento integral do plano de trabalho para o período.'))}
  </div>

  <div class="pg-break">
    ${pageHeader('Seção 6 — Público-Alvo')}
    ${secTitle('6', 'PÚBLICO ALVO')}
    ${note('Indicar a qual público as ações do projeto foram destinadas, determinando quantitativamente.')}
    ${buildPublicoTable()}
    ${secSubTitle('6.1. PESQUISA DE SATISFAÇÃO DO PÚBLICO ALVO')}
    Realizou pesquisa de satisfação?
    ${checkbox(['Sim', 'Não'], 'Não')}
    ${note('Se "sim" descreva o resultado; se "não" justifique a não realização.')}
    ${edBlock('Não foram aplicados formulários formais de pesquisa de satisfação neste período de execução. O monitoramento da qualidade das ações foi realizado de forma qualitativa por meio de feedback presencial dos participantes junto às equipes educativas de cada museu, registros de observação nos relatórios mensais e análise do engajamento nas redes sociais. A aplicação de instrumento padronizado de avaliação de satisfação está prevista para o segundo semestre de vigência do projeto.')}
  </div>`;

  // ── SEÇÃO 7: Metas ──────────────────────────────────────────────────────────
  const s4 = `
  <div class="pg-break">
    ${pageHeader('Seção 7 — Cronograma e Metas')}
    ${secTitle('7', 'CRONOGRAMA DE EXECUÇÃO E CUMPRIMENTO DAS METAS')}
    ${note('Colunas 1 a 5: transcritas do plano de trabalho aprovado. Colunas 6 a 8: execução real verificada no período.')}
    ${buildMetasTable(r.cronograma_metas)}
    ${secSubTitle('7.1. LIÇÕES APRENDIDAS DURANTE O PERÍODO DE EXECUÇÃO')}
    ${note('Quais foram os desafios encontrados e as soluções implementadas? (máx. 1500 caracteres)')}
    ${edBlock(txt(r.licoes_aprendidas?.texto_editado || r.licoes_aprendidas?.texto_ia || r.avaliacao_desafios,
      'O período de fevereiro a junho de 2026 foi marcado por importantes aprendizados no âmbito da gestão técnica e institucional do Projeto Museus Centro. Entre os principais desafios, destacam-se: (1) A reorganização da equipe após saída de profissional da produção do MUMO, resolvida com a contratação de Silvia Góes em abril/2026 e transição assistida pela equipe de coordenação; (2) A regularização dos processos de nota fiscal e comprovação financeira junto ao VAR, com implantação do fluxo de entrada única de documentos no sistema; (3) O planejamento e produção do Noturno nos Museus 2026, demanda de alta complexidade logística que ocupou parte significativa da equipe de produção nos meses de maio e junho; (4) O alinhamento entre as equipes educativas e a DMUS para adequações de programação, especialmente no MHAB, onde a coordenação da exposição "Travessias" e o catálogo "Mana Coelho" exigiram reuniões semanais de acompanhamento. A principal lição aprendida foi a importância de manter ciclos curtos de planejamento e comunicação entre coordenação e produtoras, garantindo fluidez operacional e qualidade das entregas.'))}
  </div>`;

  // ── SEÇÃO 8: Equipe ──────────────────────────────────────────────────────────
  const s5 = `
  <div class="pg-break">
    ${pageHeader('Seção 8 — Equipe de Trabalho')}
    ${secTitle('8', 'EQUIPE DE TRABALHO')}
    ${note('Profissionais contratados para execução da parceria previstos no plano de trabalho (CLT, RPA, PJ).')}
    ${buildEquipeTable(r.equipe_trabalho)}
  </div>`;

  // ── SEÇÃO 9–11: Impactos, Sustentabilidade, Avaliação ────────────────────────
  const s6 = `
  <div class="pg-break">
    ${pageHeader('Seção 9 — Impactos')}
    ${secTitle('9', 'IMPACTOS ECONÔMICOS E/OU SOCIAIS DAS AÇÕES DESENVOLVIDAS')}
    ${note('Demonstre a relação direta de causa e efeito entre as ações e os resultados sociais e econômicos gerados.')}
    ${edBlock(txt(r.impactos_economicos_sociais?.texto_editado || r.impactos_economicos_sociais?.texto_ia,
      'O Projeto Museus Centro promoveu no período de fevereiro a junho de 2026 impactos econômicos e sociais relevantes no território do Centro de Belo Horizonte e nas comunidades atendidas. Do ponto de vista econômico, o projeto mobilizou a cadeia produtiva da cultura por meio da contratação de 11 profissionais fixos e de prestadores de serviços especializados (artistas, fotógrafos, designers, educadores e técnicos), injetando recursos financeiros diretamente na economia criativa local. As atividades realizadas geraram circulação de público nos museus e no entorno — especialmente no MHAB, que registrou mais de 28 mil visitantes — estimulando o comércio e os serviços do bairro Cidade Jardim e do Centro da cidade. Do ponto de vista social, o projeto ampliou o acesso da população belo-horizontina — especialmente de estudantes e grupos socialmente vulneráveis — a experiências culturais qualificadas e gratuitas nos três museus. As 123 atividades registradas incluíram visitas mediadas com escolas públicas, oficinas acessíveis, rodas de conversa e programações inclusivas, contribuindo para a democratização cultural e o fortalecimento da identidade e da memória coletiva. O impacto na formação de público e no desenvolvimento do capital social das comunidades atendidas é evidenciado pelo crescimento progressivo do número de visitantes e pela diversidade dos grupos alcançados ao longo do período.'))}

    ${secTitle('10', 'POSSIBILIDADE DE SUSTENTABILIDADE DAS AÇÕES APÓS CONCLUSÃO DA PARCERIA')}
    ${note('Preenchimento recomendado no Relatório Final. No Relatório Parcial, indicar a perspectiva de continuidade.')}
    ${edBlock('Este relatório parcial (fev–jun/2026) ainda não encerra o período de vigência da parceria. A sustentabilidade das ações após a conclusão do Termo de Colaboração será tratada detalhadamente no Relatório Final. Neste momento, registra-se que o projeto investe na formação e qualificação de uma equipe técnica estável, no fortalecimento das relações institucionais entre os museus e a comunidade, e na consolidação de uma base de público e parceiros que tende a garantir a continuidade das ações culturais independente dos ciclos de financiamento público.')}

    ${secTitle('11', 'AVALIAÇÃO DA PARCERIA COM A ADMINISTRAÇÃO PÚBLICA')}
    ${note('Informar problemas detectados, sugestões ou críticas construtivas com objetivo de melhorar futuras parcerias.')}
    ${edBlock(txt(r.avaliacao_parceria?.texto_editado || r.avaliacao_parceria?.texto_ia || r.avaliacao_pontos_positivos,
      'A parceria com a SUCC/PBH tem se desenvolvido de forma satisfatória ao longo do período avaliado. O canal de comunicação com a gestora de parceria tem sido eficiente e colaborativo, com retorno ágil às demandas técnicas. Como sugestão de melhoria, indicamos a possibilidade de maior flexibilidade nos prazos de aprovação de ajustes orçamentários de pequena monta, que frequentemente dependem de decisão formal e podem criar gargalos na operação das atividades. Sugere-se também a criação de um canal digital centralizado para upload de documentos comprobatórios, facilitando a organização e o acesso por parte dos gestores públicos. Por fim, registramos positivamente o comprometimento da equipe técnica da SUCC com a missão pública da política cultural municipal.'))}
  </div>`;

  // ── SEÇÃO 12: Assinatura ─────────────────────────────────────────────────────
  const s7 = `
  <div class="pg-break">
    ${pageHeader('Seção 12 — Assinatura')}
    ${secTitle('12', 'ASSINATURA DO REPRESENTANTE LEGAL OSC')}
    <div class="assin-block">
      <p class="decl">Declaro que são verídicas as informações prestadas neste relatório e que os documentos comprobatórios de cumprimento parcial ou total dos resultados desta parceria se encontram arquivados sob a guarda da OSC e permanecem à disposição da administração pública ou do conselho gestor para qualquer verificação futura, durante 10 (dez) anos após a finalização da parceria.<br><br>
      Declaro ainda que os dados registrados pela OSC no Portal das Parcerias (SUCC) correspondem à realidade dos fatos, estando ciente de que o envio irregular poderá dar ensejo à apresentação de relatório de execução financeira, bem como à aplicação de penalidades conforme o art. 68 da Lei nº 13.019/2014 e art. 62 do Decreto Municipal nº 16.746/2017.</p>
      <div class="assin-data editable" contenteditable="true">Belo Horizonte, _______ de ___________________________ de 2026.</div>
      <div class="assin-line">
        <hr>
        <div class="assin-nome editable" contenteditable="true">${esc(r.assinatura?.nome_representante || ident.responsavel || 'Daniel Perini')}</div>
        <div class="assin-cargo">Representante Legal — Viaduto das Artes</div>
      </div>
    </div>
  </div>`;

  // ── SEÇÃO 13: Anexos ─────────────────────────────────────────────────────────
  const s8 = `
  <div class="pg-break">
    ${pageHeader('Seção 13 — Anexos e Fontes de Verificação')}
    ${secTitle('13', 'ANEXOS E FONTES DE VERIFICAÇÃO')}
    ${note('Os documentos de comprovação devem ser apresentados conforme as indicações no quadro de cronograma de metas.')}
    <table class="tbl">
      <thead><tr><th>FONTE / DOCUMENTO</th><th>FINALIDADE E CONTEÚDO</th><th>LOCALIZAÇÃO / LINK</th></tr></thead>
      <tbody>
        <tr><td>Relatórios mensais aprovados (31 relatórios)</td><td>Atividades, público, atividades e avaliação de cada profissional — Fev a Jun/2026</td><td><a href="https://museus-centro-app.base44.app/Relatorios" target="_blank" class="doc-link drv">Acessar Sistema</a></td></tr>
        <tr><td>Galeria fotográfica do sistema</td><td>Registros fotográficos vinculados às atividades por museu e mês</td><td><a href="https://museus-centro-app.base44.app/GaleriaFotos" target="_blank" class="doc-link drv">Acessar Galeria</a></td></tr>
        <tr><td>Relatório fotográfico de atividades (PDF)</td><td>Demonstrativo fotográfico organizado por museu — formato SUCC/PBH</td><td><span class="editable" contenteditable="true">Arquivo em anexo — Demonstrativo_Fotografico_SUCC.pdf</span></td></tr>
        <tr><td>Prestação de contas — Notas fiscais e comprovantes</td><td>Documentos financeiros aprovados no período</td><td><a href="https://museus-centro-app.base44.app/Compras" target="_blank" class="doc-link drv">Acessar Sistema</a></td></tr>
        <tr><td>Contratos de prestadores de serviço</td><td>Termos de compromisso e contratos da equipe técnica</td><td><span class="editable" contenteditable="true">Google Drive — Pasta Contratos MC 2026</span></td></tr>
        <tr><td>Agenda / programação dos museus</td><td>Registros de eventos, datas, locais e vínculos com metas</td><td><a href="https://museus-centro-app.base44.app/Agenda" target="_blank" class="doc-link drv">Acessar Agenda</a></td></tr>
        <tr><td>Relatório de comunicação e visibilidade</td><td>Clipping, posts, coberturas fotográficas e alcance digital</td><td><span class="editable" contenteditable="true">Arquivo em anexo — Relatório de Comunicação Fev–Jun/2026</span></td></tr>
      </tbody>
    </table>
    <div class="note" style="margin-top:12px"><b>OBSERVAÇÃO:</b> O relatório de comunicação do período (clipping, redes sociais, cobertura fotográfica e assessoria de imprensa) encontra-se em anexo a este documento, conforme exigido pelo modelo SUCC/PBH.</div>
  </div>`;

  const galeriaFotos = buildGaleriaFotos(r);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Execução — Museus Centro — Fev–Jun/2026</title>
  <style>${buildCSS()}</style>
</head>
<body>
  <div class="toolbar">
    <span class="tb-logo">MC</span>
    <span>Relatório de Execução — Museus Centro — Fev–Jun/2026</span>
    <button class="btn-pdf" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    <button class="btn-lock" onclick="document.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'))">🔒 Travar</button>
    <button class="btn-edit" onclick="document.querySelectorAll('.editable, .field-val, .field-block, .foto-leg, .assin-data, .assin-nome, .decl').forEach(el=>el.setAttribute('contenteditable','true'))">✏️ Editar</button>
    <span class="tb-tip">Clique em qualquer campo para editar · Ctrl+P para imprimir/PDF</span>
  </div>
  <div class="document">
    ${capa}
    ${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}
    ${galeriaFotos}
    <div class="footer">
      <span>Viaduto das Artes — Projeto Museus Centro — SUCC/PBH — Relatório ${tipoStr} Fev–Jun/2026</span>
      <span>Gerado em: ${esc(gerado)}</span>
    </div>
  </div>
  <script>
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Escape') el.blur(); });
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey||e.metaKey) && e.key==='p') { e.preventDefault(); window.print(); }
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Relatorio_Execucao_Objeto_MuseusCentro_FevJun2026_EDITAVEL.html`;
  a.click();
  URL.revokeObjectURL(url);
}