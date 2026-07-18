import jsPDF from 'jspdf';

// ─── Constantes de layout ────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const M = 18;
const CONTENT_W = PAGE_W - M * 2;
const LH = 5.5;
const FS = { tiny: 7, small: 8.5, normal: 10, big: 12, big2: 14 };
const HEADER_H = 16;
const COVER_HEADER_H = 28; // altura do cabeçalho institucional (só capa)
const FOOTER_H = 12;
const Y_MAX = PAGE_H - FOOTER_H - 6;

// ─── Utilitários ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return 'DD/MM/AAAA';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function txt(v, fallback = '') { return String(v || fallback); }

// ─── Cabeçalho institucional (apenas primeira página / capa) ─────────────────
// Replica o layout do modelo Word: logo VIA|DU|TO à esquerda + dados à direita + linha separadora
function drawCoverHeader(doc) {
  const h = COVER_HEADER_H;

  // Fundo branco (já é, mas deixamos explícito)
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, h, 'F');

  // Bloco LOGO — retângulo preto à esquerda simulando logotipo
  const logoX = M;
  const logoY = 3;
  const logoW = 22;
  const logoH = 20;
  doc.setFillColor(20, 20, 20);
  doc.rect(logoX, logoY, logoW, logoH, 'F');

  // Texto "VIA" / "DU" / "TO" dentro do bloco preto
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VIA', logoX + 1, logoY + 5);
  doc.text('DU', logoX + 1, logoY + 10);
  doc.text('TO', logoX + 1, logoY + 15);

  // Texto lateral "DAS ARTES" (pequeno, em branco, no lado direito do bloco)
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  // Rotacionado simulado: escrevemos verticalmente como letras
  doc.text('DAS ARTES', logoX + 13, logoY + 5, { angle: 90 });

  // Dados institucionais à direita do logo
  const textX = logoX + logoW + 6;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS.small);
  doc.text('Viaduto das Artes - Fundado em 16 de junho de 2015', textX, logoY + 5);
  doc.text('Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG', textX, logoY + 10);
  doc.text('CEP 30640-010  -  E-mail: viadutodasartes@gmail.com', textX, logoY + 15);

  // Linha separadora
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(M, h - 2, PAGE_W - M, h - 2);
  doc.setLineWidth(0.2);
}

// ─── Cabeçalho de página (páginas 2 em diante) ──────────────────────────────
function drawPageHeader(doc, parte, totalPartes) {
  doc.setFillColor(12, 12, 12);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FS.normal);
  doc.setFont('helvetica', 'bold');
  doc.text('VIADUTO DAS ARTES — MUSEUS CENTRO', M, 7);
  doc.setFontSize(FS.tiny);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório de Execução do Objeto  •  SUCC/PBH', M, 12);
  if (totalPartes > 1) {
    doc.text(`Parte ${parte} de ${totalPartes}`, PAGE_W - M, 12, { align: 'right' });
  }
}

// drawAllFooters removida — footers agora aplicados inline com numeração global

// ─── Nova página ─────────────────────────────────────────────────────────────
function newPage(doc) {
  doc.addPage();
  return HEADER_H + 4;
}

function check(doc, y, needed = 16) {
  if (y + needed > Y_MAX) return newPage(doc);
  return y;
}

// ─── Primitivos de desenho ───────────────────────────────────────────────────
function sectionTitle(doc, y, num, title) {
  y = check(doc, y, 10);
  doc.setFillColor(12, 12, 12);
  doc.rect(M, y, CONTENT_W, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FS.normal);
  doc.setFont('helvetica', 'bold');
  doc.text(`${num}. ${title.toUpperCase()}`, M + 3, y + 5);
  return y + 9;
}

function subTitle(doc, y, title) {
  y = check(doc, y, 8);
  doc.setFillColor(225, 225, 225);
  doc.rect(M, y, CONTENT_W, 6, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'bold');
  doc.text(title, M + 2, y + 4.2);
  return y + 8;
}

function instruction(doc, y, text) {
  y = check(doc, y, 8);
  const lines = doc.splitTextToSize(text, CONTENT_W - 4);
  const h = Math.max(6, lines.length * 4.5 + 2);
  doc.setFillColor(255, 251, 220);
  doc.rect(M, y, CONTENT_W, h, 'F');
  doc.setFontSize(FS.tiny);
  doc.setTextColor(130, 90, 0);
  doc.setFont('helvetica', 'italic');
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], M + 2, y + 4 + i * 4.5);
  }
  return y + h + 2;
}

function checkbox(doc, y, options, selected) {
  y = check(doc, y, 8);
  let x = M + 2;
  for (const op of options) {
    const on = op === selected;
    doc.setDrawColor(60, 60, 60);
    doc.setFillColor(on ? 12 : 255, on ? 12 : 255, on ? 12 : 255);
    doc.rect(x, y + 1.5, 3.5, 3.5, on ? 'FD' : 'D');
    if (on) {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5.5);
      doc.text('X', x + 0.6, y + 4.5);
    }
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'normal');
    doc.text(`  ${op}`, x + 4, y + 4.5);
    x += 4 + doc.getTextWidth(`  ${op}`) + 10;
  }
  return y + 8;
}

function field(doc, y, label, value, fullW = false) {
  y = check(doc, y, 10);
  const w = fullW ? CONTENT_W : CONTENT_W / 2;
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(210, 210, 210);
  doc.rect(M, y, w, 8, 'FD');
  doc.setFontSize(FS.tiny);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(label, M + 2, y + 3);
  doc.setFontSize(FS.small);
  doc.setTextColor(15, 15, 15);
  doc.setFont('helvetica', 'bold');
  const val = txt(value);
  const lines = doc.splitTextToSize(val, w - 4);
  doc.text(lines[0] || '', M + 2, y + 6.5);
  return y + 9;
}

function twoFields(doc, y, l1, v1, l2, v2) {
  y = check(doc, y, 10);
  const hw = (CONTENT_W - 2) / 2;
  const x2 = M + hw + 2;
  for (const [xp, lbl, val] of [[M, l1, v1], [x2, l2, v2]]) {
    doc.setFillColor(248, 248, 248);
    doc.setDrawColor(210, 210, 210);
    doc.rect(xp, y, hw, 8, 'FD');
    doc.setFontSize(FS.tiny);
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'normal');
    doc.text(lbl, xp + 2, y + 3);
    doc.setFontSize(FS.small);
    doc.setTextColor(15, 15, 15);
    doc.setFont('helvetica', 'bold');
    doc.text(txt(val), xp + 2, y + 6.5);
  }
  return y + 9;
}

function textBlock(doc, y, text, maxChars = 0) {
  if (!text) {
    y = check(doc, y, 16);
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(M, y, CONTENT_W, 14, 'D');
    doc.setLineDashPattern([], 0);
    doc.setFontSize(FS.tiny);
    doc.setTextColor(180, 180, 180);
    doc.setFont('helvetica', 'italic');
    doc.text('(Campo a preencher)', M + 3, y + 8);
    return y + 16;
  }
  const t = maxChars > 0 ? text.slice(0, maxChars) : text;
  doc.setFontSize(FS.small);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(t, CONTENT_W - 4);
  for (const line of lines) {
    y = check(doc, y, LH);
    doc.text(line, M + 2, y + 4);
    y += LH;
  }
  return y + 2;
}

function blankLines(doc, y, count = 4) {
  for (let i = 0; i < count; i++) {
    y = check(doc, y, 6);
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(M, y + 5, M + CONTENT_W, y + 5);
    doc.setLineDashPattern([], 0);
    y += 6;
  }
  return y + 2;
}

// ─── Tabela de público alvo ──────────────────────────────────────────────────
function publicoTable(doc, y, p, publicoPorMuseu) {
  p = p || {};
  // Usar exclusivamente dados reais do relatório — sem fallback numérico fixo
  const realizadoDireto = p.realizado_direto || 0;
  const realizadoIndireto = p.realizado_indireto || 0;
  const previstoDireto = p.previsto_direto || 0;
  const previstoIndireto = p.previsto_indireto || 0;
  const pctDireto = p.percentual_direto || (previstoDireto > 0 ? Math.round(realizadoDireto / previstoDireto * 100) : 0);
  const pctIndireto = p.percentual_indireto || 0;

  y = check(doc, y, 50);

  // Linha de resumo por museu — usar dados reais se disponíveis
  const museuRowsBase = publicoPorMuseu && typeof publicoPorMuseu === 'object' && Object.keys(publicoPorMuseu).length > 0
    ? Object.entries(publicoPorMuseu).map(([museu, atendido]) => ({ museu, atendido: atendido || 0, obs: 'Dados extraídos dos relatórios mensais do período.' }))
    : [
        { museu: 'MHAB', atendido: null, obs: 'Não informado — preencher com dados do relatório mensal.' },
        { museu: 'MIS', atendido: null, obs: 'Não informado — preencher com dados do relatório mensal.' },
        { museu: 'MUMO', atendido: null, obs: 'Não informado — preencher com dados do relatório mensal.' },
      ];
  const museuRows = museuRowsBase.map(r => ({
    ...r,
    periodo: p._periodo_label || 'Período do relatório',
  }));
  const mCols = [{ h: 'MUSEU', w: 22 }, { h: 'PERÍODO', w: 34 }, { h: 'ATENDIDO DE FATO', w: 28 }, { h: 'OBSERVAÇÃO', w: 90 }];
  doc.setFillColor(40, 40, 40);
  let xc = M;
  for (const c of mCols) { doc.rect(xc, y, c.w, 6, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.text(c.h, xc + 1, y + 4); xc += c.w; }
  y += 6;
  for (const row of museuRows) {
    xc = M;
    for (const [ci, val] of [row.museu, row.periodo, row.atendido.toLocaleString('pt-BR'), row.obs].entries()) {
      doc.setFillColor(ci % 2 === 0 ? 248 : 255, 250, 252);
      doc.setDrawColor(210, 210, 210);
      doc.rect(xc, y, mCols[ci].w, 7, 'FD');
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      doc.text(doc.splitTextToSize(String(val), mCols[ci].w - 2)[0] || '', xc + 1, y + 5);
      xc += mCols[ci].w;
    }
    y += 7;
  }
  // Total
  doc.setFillColor(220, 240, 220);
  doc.setDrawColor(100, 160, 100);
  doc.rect(M, y, 174, 7, 'FD');
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 80, 20);
  const totalLabel = realizadoDireto > 0
    ? `TOTAL GERAL DO PERÍODO: ${realizadoDireto.toLocaleString('pt-BR')} atendimentos/visitas`
    : 'TOTAL GERAL DO PERÍODO: Não informado — preencher com dados dos relatórios mensais aprovados';
  doc.text(totalLabel, M + 2, y + 5);
  y += 10;

  const cw = CONTENT_W / 4;
  const hdrs = ['PÚBLICO ALVO TOTAL DO PROJETO', 'PREVISTO P/ ATENDIMENTO\n(referente ao período)', 'ATENDIDO DE FATO\n(referente ao período)', 'JUSTIFICATIVA\n(Alcance de Atendidos)'];
  doc.setFillColor(12, 12, 12);
  xc = M;
  for (const h of hdrs) {
    doc.rect(xc, y, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    const ls = doc.splitTextToSize(h, cw - 2);
    ls.forEach((l, i) => doc.text(l, xc + 1, y + 3.5 + i * 3.5));
    xc += cw;
  }
  y += 9;
  const rows = [
    [
      previstoDireto > 0 ? `DIRETO: ${previstoDireto.toLocaleString('pt-BR')}` : 'DIRETO: Não informado',
      realizadoDireto > 0 ? `DIRETO: ${realizadoDireto.toLocaleString('pt-BR')} (${pctDireto}%)` : 'DIRETO: Não informado',
      p.texto_interpretativo_editado || p.texto_interpretativo_ia || 'Público geral declarado nos relatórios mensais aprovados.',
    ],
    [
      previstoIndireto > 0 ? `INDIRETO: ${previstoIndireto.toLocaleString('pt-BR')}` : 'INDIRETO: Não informado',
      realizadoIndireto > 0 ? `INDIRETO: ${realizadoIndireto.toLocaleString('pt-BR')} (${pctIndireto}%)` : 'INDIRETO: Não informado',
      'Público indireto a apurar pelos responsáveis do período.',
    ],
  ];
  for (const [idx, row] of rows.entries()) {
    xc = M;
    const label = idx === 0 ? 'DIRETO:' : 'INDIRETO:';
    for (const [ci, cell] of [label, ...row].entries()) {
      doc.setFillColor(ci % 2 === 0 ? 245 : 255, 248, 255);
      doc.setDrawColor(210, 210, 210);
      doc.rect(xc, y, cw, 8, 'FD');
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(FS.small);
      doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(txt(cell), cw - 3);
      doc.text(lines[0] || '', xc + 2, y + 5.5);
      xc += cw;
    }
    y += 8;
  }
  return y + 3;
}

// ─── Tabela de metas ─────────────────────────────────────────────────────────
function metasTable(doc, y, metas) {
  y = check(doc, y, 20);
  const cols = [
    { h: '1) METAS', w: 28 },
    { h: '2) RESULT. ESPERADOS', w: 26 },
    { h: '3) AÇÕES', w: 26 },
    { h: '4) PERÍODO', w: 20 },
    { h: '5) DOCS VERIFICAÇÃO', w: 22 },
    { h: '6) RESULT. ALCANÇADOS', w: 26 },
    { h: '7) STATUS EXECUÇÃO', w: 22 },
    { h: '8) JUSTIFICATIVA', w: 24 },
  ];
  doc.setFillColor(12, 12, 12);
  let xc = M;
  for (const c of cols) {
    doc.rect(xc, y, c.w, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.splitTextToSize(c.h, c.w - 1).forEach((l, i) => doc.text(l, xc + 1, y + 3.5 + i * 3));
    xc += c.w;
  }
  y += 9;

  for (const meta of (metas || [])) {
    const rowH = 16;
    y = check(doc, y, rowH);
    const statusRgb =
      (meta.status_meta || '').includes('Integral') ? [22, 120, 22] :
      (meta.status_meta || '').includes('Parcial') ? [180, 130, 0] :
      [180, 40, 40];
    xc = M;
    const cells = [
      txt(meta.meta_nome),
      txt(meta.resultado_esperado),
      txt(meta.acoes),
      txt(meta.periodo),
      (meta.documentos_verificacao || []).join(', '),
      txt(meta.resultado_alcancado),
      `${txt(meta.status_meta)}\n${meta.percentual_execucao ? meta.percentual_execucao + '%' : ''}`,
      txt(meta.justificativa),
    ];
    for (let ci = 0; ci < cols.length; ci++) {
      const bg = ci === 6 ? statusRgb : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.setDrawColor(200, 200, 200);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      doc.setTextColor(ci === 6 ? 255 : 30, ci === 6 ? 255 : 30, ci === 6 ? 255 : 30);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', ci === 6 ? 'bold' : 'normal');
      doc.splitTextToSize(cells[ci], cols[ci].w - 2).slice(0, 3).forEach((l, i) => doc.text(l, xc + 1, y + 4 + i * 4));
      xc += cols[ci].w;
    }
    y += rowH;
  }
  for (let i = 0; i < 2; i++) {
    xc = M;
    for (const c of cols) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(210, 210, 210);
      doc.rect(xc, y, c.w, 12, 'D');
      xc += c.w;
    }
    y += 12;
  }
  return y + 3;
}

// ─── Tabela de equipe ────────────────────────────────────────────────────────
function equipeTable(doc, y, equipe) {
  y = check(doc, y, 20);
  const cols = [
    { h: 'NOME', w: 38 },
    { h: 'CARGO', w: 28 },
    { h: 'FORMA DE CONTRATAÇÃO', w: 28 },
    { h: 'ATRIBUIÇÕES NO PROJETO', w: 32 },
    { h: 'PERÍODO (INÍCIO/FIM)', w: 22 },
    { h: 'C.H. SEMANAL', w: 16 },
    { h: 'VALOR MENSAL BRUTO', w: 30 },
  ];
  doc.setFillColor(12, 12, 12);
  let xc = M;
  for (const c of cols) {
    doc.rect(xc, y, c.w, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.splitTextToSize(c.h, c.w - 1).forEach((l, i) => doc.text(l, xc + 1, y + 3 + i * 3));
    xc += c.w;
  }
  y += 7;
  for (const m of (equipe || [])) {
    const rowH = 8;
    y = check(doc, y, rowH);
    xc = M;
    const cells = [txt(m.nome), txt(m.cargo), txt(m.tipo_contratacao), txt(m.atribuicoes), txt(m.periodo), txt(m.carga_horaria), fmtBRL(m.valor)];
    for (let ci = 0; ci < cols.length; ci++) {
      doc.setFillColor(ci % 2 === 0 ? 248 : 255, 250, 255);
      doc.setDrawColor(215, 215, 215);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      doc.setTextColor(25, 25, 25);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(cells[ci], cols[ci].w - 2)[0] || '', xc + 1, y + 5.5);
      xc += cols[ci].w;
    }
    y += rowH;
  }
  for (let i = 0; i < 2; i++) {
    xc = M;
    for (const c of cols) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(210, 210, 210);
      doc.rect(xc, y, c.w, 9, 'D');
      xc += c.w;
    }
    y += 9;
  }
  return y + 3;
}

// ─── Bloco de assinatura ─────────────────────────────────────────────────────
function assinaturaBlock(doc, y, relatorio) {
  const ident = relatorio.identificacao_projeto || {};
  y = check(doc, y, 60);
  const decl =
    'Declaro que são verídicas as informações prestadas neste relatório e que os documentos comprobatórios de cumprimento parcial ou total dos resultados desta parceria se encontram arquivados sob a guarda da OSC e permanecem à disposição da administração pública ou do conselho gestor para qualquer verificação futura, durante 10 anos após a finalização da parceria.\n\n' +
    'Declaro ainda que os dados registrados pela OSC no Portal das Parcerias (SUCC) correspondem à realidade dos fatos, estando ciente de que o envio irregular poderá dar ensejo à apresentação de relatório de execução financeira, bem como à aplicação de penalidades conforme o art. 68 da Lei nº 13.019/2014 e art. 62 do Decreto Municipal nº 16.746/2017.';
  y = textBlock(doc, y, decl);
  y += 6;
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 20);
  doc.text('Belo Horizonte, _______ de ___________________________ de 20______', M + 2, y);
  y += 16;
  const cx = PAGE_W / 2;
  doc.setDrawColor(30, 30, 30);
  doc.line(cx - 50, y, cx + 50, y);
  y += 5;
  doc.setFontSize(FS.small);
  doc.text(txt(relatorio.assinatura?.nome_representante || ident.responsavel || '___________________________________'), cx, y, { align: 'center' });
  y += 4;
  doc.setFontSize(FS.tiny);
  doc.setTextColor(80, 80, 80);
  doc.text('Nome/Assinatura do Representante Legal da Organização da Sociedade Civil', cx, y, { align: 'center' });
  return y + 10;
}

// ─── Links de documentos ─────────────────────────────────────────────────────
function linksDocumentosTable(doc, y, links, totalFmt) {
  if (!links || links.length === 0) return y;
  y = check(doc, y, 16);
  y = subTitle(doc, y, 'DOCUMENTOS COMPROBATÓRIOS VINCULADOS (NF / XML / Comprovantes)');

  if (totalFmt) {
    y = check(doc, y, 8);
    doc.setFillColor(232, 255, 232);
    doc.setDrawColor(100, 190, 100);
    doc.rect(M, y, CONTENT_W, 7, 'FD');
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 100, 30);
    doc.text(`Total financeiro aprovado no período: ${totalFmt}`, M + 3, y + 5);
    y += 9;
  }

  const cols = [
    { h: 'NF Nº', w: 14 },
    { h: 'FORNECEDOR', w: 38 },
    { h: 'DESCRIÇÃO', w: 40 },
    { h: 'VALOR (R$)', w: 24 },
    { h: 'DATA NF', w: 18 },
    { h: 'LINKS DISPONÍVEIS', w: 40 },
  ];

  doc.setFillColor(40, 40, 40);
  let xc = M;
  for (const c of cols) {
    doc.rect(xc, y, c.w, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(c.h, xc + 1, y + 4.5);
    xc += c.w;
  }
  y += 7;

  for (const d of links.slice(0, 40)) {
    const rowH = 7;
    y = check(doc, y, rowH);
    const linksTxt = [
      d.nf_pdf_url ? 'PDF' : '',
      d.nf_xml_url ? 'XML' : '',
      d.comprovante_url ? 'Comprovante' : '',
      d.drive_folder_url ? 'Drive' : '',
    ].filter(Boolean).join(' • ') || '—';
    const cells = [
      txt(d.nf_numero),
      txt(d.fornecedor).slice(0, 22),
      txt(d.descricao).slice(0, 24),
      fmtBRL(d.valor),
      fmtDate(d.data_emissao),
      linksTxt,
    ];
    xc = M;
    for (let ci = 0; ci < cols.length; ci++) {
      doc.setFillColor(ci % 2 === 0 ? 250 : 255, 252, 250);
      doc.setDrawColor(215, 215, 215);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      doc.setTextColor(25, 25, 25);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      doc.text(cells[ci] || '', xc + 1, y + 4.8);
      xc += cols[ci].w;
    }
    y += rowH;
  }
  return y + 4;
}

function rubricasTable(doc, y, rubricas, totalFmt) {
  if (!rubricas || rubricas.length === 0) return y;
  y = check(doc, y, 16);
  y = subTitle(doc, y, 'RUBRICAS ORÇAMENTÁRIAS EXECUTADAS NO PERÍODO');

  if (totalFmt) {
    y = check(doc, y, 8);
    doc.setFillColor(230, 245, 255);
    doc.setDrawColor(80, 140, 200);
    doc.rect(M, y, CONTENT_W, 7, 'FD');
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 60, 120);
    doc.text(`Total financeiro executado no período: ${totalFmt}`, M + 3, y + 5);
    y += 9;
  }

  const cols = [
    { h: 'RUBRICA', w: 44 },
    { h: 'GRUPO / META', w: 34 },
    { h: 'NATUREZA', w: 22 },
    { h: 'PREVISTO (R$)', w: 24 },
    { h: 'EXECUTADO (R$)', w: 24 },
    { h: 'SALDO (R$)', w: 20 },
    { h: 'NFs', w: 6 },
  ];

  doc.setFillColor(40, 40, 80);
  let xc = M;
  for (const c of cols) {
    doc.rect(xc, y, c.w, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(c.h, xc + 1, y + 4.5);
    xc += c.w;
  }
  y += 7;

  for (const r of rubricas) {
    const rowH = 8;
    y = check(doc, y, rowH);
    const previsto = r.valor_previsto || r.valor_rubrica || r.valor_total || 0;
    const utilizado = r.total_gasto_periodo || r.valor_utilizado || 0;
    const saldo = r.saldo !== undefined ? r.saldo : (previsto - utilizado);
    const saldoColor = saldo >= 0 ? [20, 100, 20] : [160, 30, 30];
    const cells = [
      txt(r.rubrica_nome || r.rubrica || r.nome || r.item_rubrica),
      txt(r.grupo || r.meta || ''),
      txt(r.natureza_despesa || r.numero_natureza || ''),
      fmtBRL(r.valor_previsto || r.valor_rubrica || r.valor_total || 0),
      fmtBRL(r.total_gasto_periodo || r.valor_utilizado || 0),
      fmtBRL(saldo),
      String(r.num_nfs || 0),
    ];
    xc = M;
    for (let ci = 0; ci < cols.length; ci++) {
      doc.setFillColor(ci % 2 === 0 ? 248 : 255, 252, 255);
      doc.setDrawColor(210, 215, 230);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      if (ci === 5) {
        doc.setTextColor(...saldoColor);
      } else {
        doc.setTextColor(25, 25, 25);
      }
      doc.setFontSize(5.5);
      doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      doc.text(doc.splitTextToSize(cells[ci], cols[ci].w - 2)[0] || '', xc + 1, y + 5.5);
      xc += cols[ci].w;
    }
    y += rowH;
  }
  return y + 4;
}

// ─── Tabela de links 13.1 (fontes de verificação) ────────────────────────────
function drawLinksVerificacao(doc, y) {
  const APP_BASE = 'https://app.base44.com';
  const DRIVE_RELATORIOS = 'https://drive.google.com/drive/folders/'; // placeholder — usar link real
  const links = [
    { fonte: 'Relatórios mensais aprovados (MHAB, MIS, MUMO)', finalidade: 'Fevereiro a junho/2026 — atividades, público, metas, descrições e anexos', url: `${APP_BASE}/Relatorios` },
    { fonte: 'Agenda de atividades', finalidade: 'Registros de eventos, datas, locais, responsáveis e vínculos com museus e metas', url: `${APP_BASE}/Agenda` },
    { fonte: 'Programação Museus Centro', finalidade: 'Programação geral e ações mensais dos equipamentos', url: `${APP_BASE}/ProgramacaoEspelho` },
    { fonte: 'Galeria de fotografias', finalidade: 'Fotos vinculadas aos relatórios e atividades — máx. 2 por atividade no corpo, link da galeria completa', url: `${APP_BASE}/GaleriaFotos` },
    { fonte: 'Entrada Única / DocumentIntake', finalidade: 'Documentos recebidos, anexos e arquivos processados', url: `${APP_BASE}/EntradaUnica` },
    { fonte: 'Gestão documental', finalidade: 'Contratos finais, documentos aprovados e versões vigentes', url: `${APP_BASE}/GestaoDocumental` },
    { fonte: 'Prestação de contas', finalidade: 'Notas fiscais, comprovantes, conciliações e documentos financeiros', url: `${APP_BASE}/Compras` },
    { fonte: 'Rubricas e vínculos financeiros', finalidade: 'Consulta de rubricas, natureza de despesa, centro de custo e execução', url: `${APP_BASE}/Compras` },
    { fonte: 'Relatório de execução / gerador', finalidade: 'Geração, consolidação e reprocessamento do Relatório de Execução do Objeto', url: `${APP_BASE}/RelatorioExecucaoObjeto` },
  ];

  y = check(doc, y, 12);
  y = subTitle(doc, y, '13.1. LINKS DIRETOS PARA FONTES DE VERIFICAÇÃO');
  const cols = [{ h: 'FONTE', w: 52 }, { h: 'FINALIDADE', w: 80 }, { h: 'LINK / ACESSO', w: 42 }];
  doc.setFillColor(40, 40, 40);
  let xc = M;
  for (const c of cols) {
    doc.rect(xc, y, c.w, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(c.h, xc + 1, y + 4.5);
    xc += c.w;
  }
  y += 7;
  for (const l of links) {
    const rowH = 8;
    y = check(doc, y, rowH);
    xc = M;
    const cells = [l.fonte, l.finalidade, l.url];
    for (let ci = 0; ci < cols.length; ci++) {
      doc.setFillColor(ci % 2 === 0 ? 250 : 255, 252, 250);
      doc.setDrawColor(215, 215, 215);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      if (ci === 2) {
        doc.setTextColor(0, 80, 180);
        doc.setFont('helvetica', 'italic');
      } else {
        doc.setTextColor(25, 25, 25);
        doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal');
      }
      doc.setFontSize(5.5);
      const val = doc.splitTextToSize(cells[ci], cols[ci].w - 2)[0] || '';
      doc.text(val, xc + 1, y + 5);
      // Adicionar link clicável
      if (ci === 2 && l.url) {
        doc.link(xc, y, cols[ci].w, rowH, { url: l.url });
      }
      xc += cols[ci].w;
    }
    y += rowH;
  }
  return y + 4;
}

// ─── Galeria de fotos — substituída por exportação individual (1 foto/PDF) ────
// eslint-disable-next-line no-unused-vars
async function drawGaleriaFotos(doc, y, relatorio) {
  const urlsVistas = new Set();
  const gruposPorAtividade = new Map();

  const MAX_POR_ATIVIDADE = 5;
  const MIN_POR_ATIVIDADE = 3;

  // ── 1. Atividades com fotos diretamente vinculadas (mais rico)
  const atividadesComFotos = Array.isArray(relatorio._atividades_com_fotos) ? relatorio._atividades_com_fotos : [];
  for (const atv of atividadesComFotos) {
    const key = atv.titulo || 'Atividade';
    if (!gruposPorAtividade.has(key)) gruposPorAtividade.set(key, { fotos: [], data: atv.data, museu: atv.museu });
    const grupo = gruposPorAtividade.get(key);
    for (const foto of (atv.fotos || [])) {
      const url = foto.url || foto.file_url;
      if (!url || urlsVistas.has(url) || grupo.fotos.length >= MAX_POR_ATIVIDADE) continue;
      grupo.fotos.push({ url, legenda: foto.legenda || foto.caption || key, autor: foto.autor || 'Daniel Moreira Soares', data: foto.data || atv.data });
      urlsVistas.add(url);
    }
  }

  // ── 2. _fotos_galeria agrupadas por atividade_nome / museu
  const galeriaFotos = Array.isArray(relatorio._fotos_galeria) ? relatorio._fotos_galeria : [];
  for (const foto of galeriaFotos) {
    const url = foto.file_url || foto.url;
    if (!url || urlsVistas.has(url)) continue;
    const nomeAtv = foto.atividade_nome || foto.museu || 'Registro do Projeto';
    if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, { fotos: [], data: '', museu: foto.museu || '' });
    const grupo = gruposPorAtividade.get(nomeAtv);
    if (grupo.fotos.length < MAX_POR_ATIVIDADE) {
      grupo.fotos.push({ url, legenda: foto.legenda || foto.caption || foto.file_name || nomeAtv, autor: foto.autor || 'Daniel Moreira Soares', data: foto.created_date || '' });
      urlsVistas.add(url);
    }
  }

  // ── 3. Evidências vinculadas ao cronograma de metas
  const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
  for (const ev of evidencias) {
    const url = ev.foto_url || ev.url;
    if (!url || urlsVistas.has(url)) continue;
    const nomeAtv = ev.atividade_nome || ev.meta_nome || 'Atividades do Período';
    if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, { fotos: [], data: ev.atividade_data || '', museu: '' });
    const grupo = gruposPorAtividade.get(nomeAtv);
    if (grupo.fotos.length < MAX_POR_ATIVIDADE) {
      grupo.fotos.push({ url, legenda: ev.legenda_editada || ev.legenda_ia || nomeAtv, autor: 'Foto de Registro', data: ev.atividade_data || '' });
      urlsVistas.add(url);
    }
  }

  // ── 4. Atividades do período que ainda não têm fotos — adicionar placeholder
  const atividadesPeriodo = Array.isArray(relatorio._atividades_periodo) ? relatorio._atividades_periodo : [];
  for (const atv of atividadesPeriodo.slice(0, 40)) {
    const key = atv.titulo || 'Atividade';
    if (!gruposPorAtividade.has(key)) {
      gruposPorAtividade.set(key, { fotos: [], data: atv.data_realizacao || '', museu: atv.museu || '' });
    }
    const grupo = gruposPorAtividade.get(key);
    // Se não tem fotos, adicionar placeholder com link do Drive
    if (grupo.fotos.length === 0) {
      grupo.fotos.push({ url: null, legenda: `${key} — ${atv.museu || ''} — Foto de Registro pendente`, autor: '', data: atv.data_realizacao || '' });
    }
  }

  // Converter para array e ordenar por museu
  const grupos = Array.from(gruposPorAtividade.entries())
    .map(([nome, data]) => ({ nome, ...data }))
    .filter(g => g.fotos.length > 0);

  if (grupos.length === 0) return y;

  // Título da galeria
  y = check(doc, y, 12);
  y = sectionTitle(doc, y, '14', 'DEMONSTRATIVO FOTOGRÁFICO — ATIVIDADES REALIZADAS');
  y = instruction(doc, y,
    'Registros fotográficos das atividades executadas no período. De 3 a 5 imagens por atividade. ' +
    'Cada foto apresenta descrição da ação, crédito do autor e data do registro, conforme orientação SUCC/PBH. ' +
    'Acervo fotográfico completo disponível na Galeria do aplicativo Museus Centro.');
  y += 3;

  const fotoW = (CONTENT_W - 6) / 3; // 3 fotos por linha
  const fotoH = 38;
  const legendaH = 12;
  const blocoH = fotoH + legendaH + 3;

  for (const grupo of grupos) {
    // Cabeçalho do grupo
    y = check(doc, y, 10);
    doc.setFillColor(30, 30, 30);
    doc.rect(M, y, CONTENT_W, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'bold');
    doc.text(grupo.nome.slice(0, 80), M + 2, y + 5);
    if (grupo.museu) {
      doc.setFontSize(FS.tiny);
      doc.setFont('helvetica', 'normal');
      doc.text(grupo.museu, PAGE_W - M - 2, y + 5, { align: 'right' });
    }
    y += 9;

    // Fotos em grupos de 3 por linha
    for (let i = 0; i < grupo.fotos.length; i += 3) {
      const fotos3 = grupo.fotos.slice(i, i + 3);
      y = check(doc, y, blocoH + 4);

      for (let j = 0; j < fotos3.length; j++) {
        const foto = fotos3[j];
        const xFoto = M + j * (fotoW + 3);

        if (foto.url) {
          try {
            doc.addImage(foto.url, 'JPEG', xFoto, y, fotoW, fotoH, undefined, 'FAST');
          } catch {
            // placeholder
            doc.setFillColor(220, 220, 220);
            doc.rect(xFoto, y, fotoW, fotoH, 'F');
            doc.setFontSize(FS.tiny);
            doc.setTextColor(130, 130, 130);
            doc.setFont('helvetica', 'italic');
            doc.text('📷', xFoto + fotoW / 2, y + fotoH / 2 - 2, { align: 'center' });
            doc.text('[Verificar no Drive]', xFoto + fotoW / 2, y + fotoH / 2 + 4, { align: 'center', maxWidth: fotoW - 2 });
          }
        } else {
          // Atividade sem foto — placeholder claro
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(200, 200, 200);
          doc.setLineDashPattern([1, 1], 0);
          doc.rect(xFoto, y, fotoW, fotoH, 'FD');
          doc.setLineDashPattern([], 0);
          doc.setFontSize(6);
          doc.setTextColor(160, 160, 160);
          doc.setFont('helvetica', 'italic');
          doc.text('Foto não localizada', xFoto + fotoW / 2, y + fotoH / 2 - 3, { align: 'center' });
          doc.setFontSize(5);
          doc.text('Verificar galeria do Drive', xFoto + fotoW / 2, y + fotoH / 2 + 3, { align: 'center' });
        }

        // Legenda
        const ly = y + fotoH + 1;
        doc.setFillColor(248, 248, 248);
        doc.setDrawColor(210, 210, 210);
        doc.rect(xFoto, ly, fotoW, legendaH, 'FD');
        doc.setFontSize(5.5);
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'bold');
        const legTxt = `Foto de Registro — ${(foto.legenda || grupo.nome).slice(0, 50)}`;
        const legLines = doc.splitTextToSize(legTxt, fotoW - 3);
        doc.text(legLines[0] || '', xFoto + 1.5, ly + 3.5);
        if (legLines[1]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.text(legLines[1], xFoto + 1.5, ly + 7);
        }
        // Autor e data na linha inferior
        if (foto.autor || foto.data) {
          doc.setFontSize(4.5);
          doc.setTextColor(120, 120, 120);
          doc.setFont('helvetica', 'italic');
          const meta = [foto.autor, foto.data ? fmtDate(foto.data) : ''].filter(Boolean).join(' — ');
          doc.text(meta.slice(0, 35), xFoto + 1.5, ly + legendaH - 1.5);
        }
      }

      y += blocoH + 3;
    }
    y += 4;
  }

  return y;
}

// ─── Partes do relatório ─────────────────────────────────────────────────────
function buildParte1(relatorio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ident = relatorio.identificacao_projeto || {};
  // Primeira página usa cabeçalho institucional (mais alto)
  let y = COVER_HEADER_H + 4;

  // Título do documento
  doc.setFillColor(240, 240, 240);
  doc.rect(M, y, CONTENT_W, 8, 'F');
  doc.setTextColor(12, 12, 12);
  doc.setFontSize(FS.big2);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE EXECUÇÃO DO OBJETO', PAGE_W / 2, y + 5.5, { align: 'center' });
  y += 10;

  // Subtítulo com período
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const periodoTexto = `Projeto Museus Centro — Relatório ${relatorio.tipo === 'parcial' ? 'Parcial' : 'Final'} — Período: ${fmtDate(relatorio.data_inicio)} a ${fmtDate(relatorio.data_fim)}`;
  doc.text(periodoTexto, PAGE_W / 2, y + 3, { align: 'center' });
  y += 8;

  // 1. TIPO
  y = sectionTitle(doc, y, '1', 'TIPO DE RELATÓRIO');
  y = checkbox(doc, y, ['Parcial', 'Final'], relatorio.tipo === 'parcial' ? 'Parcial' : 'Final');
  if (relatorio.tipo === 'parcial') {
    y = check(doc, y, 8);
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text('Nº do Relatório Parcial: _______', M + 2, y + 4);
    y += 8;
  }
  y = twoFields(doc, y, 'Período de execução — Início', fmtDate(relatorio.data_inicio), 'Período de execução — Fim', fmtDate(relatorio.data_fim));
  y += 4;

  // 2. IDENTIFICAÇÃO
  y = sectionTitle(doc, y, '2', 'IDENTIFICAÇÃO DO PROJETO');
  y = field(doc, y, 'Organização da Sociedade Civil (OSC)', txt(ident.organizacao, 'Viaduto das Artes'), true);
  y = field(doc, y, 'Nome do Projeto', txt(ident.projeto, 'Museus Centro'), true);
  y = twoFields(doc, y, 'Instrumento Jurídico', txt(ident.instrumento_juridico, 'Termo de Colaboração nº 01-031.069/24-80'), 'Processo Administrativo Nº', txt(ident.processo_administrativo, '01-031.069/24-80'));
  y = twoFields(doc, y, 'Vigência do Projeto — Início', ident.vigencia_inicio ? fmtDate(ident.vigencia_inicio) : fmtDate(relatorio.data_inicio), 'Vigência do Projeto — Fim', ident.vigencia_fim ? fmtDate(ident.vigencia_fim) : fmtDate(relatorio.data_fim));
  y = field(doc, y, 'Data do primeiro repasse pela administração', 'A confirmar no extrato/Portal SUCC', true);
  y = field(doc, y, 'Responsável pela elaboração do relatório', txt(ident.responsavel, 'Daniel Perini'), true);
  y = twoFields(doc, y, 'Telefone', txt(ident.telefone, '(31) 98424-9484'), 'E-mail', txt(ident.email, 'danielperini.mc@viadutodasartes.org.br'));
  y += 4;

  // 3. ENDEREÇO
  y = sectionTitle(doc, y, '3', 'ENDEREÇO DE EXECUÇÃO DAS AÇÕES DO PROJETO');
  y = checkbox(doc, y, ['Endereço Físico', 'Endereço Virtual', 'Ambos'], 'Ambos');
  y = subTitle(doc, y, '3.1. ENDEREÇO FÍSICO');
  y = instruction(doc, y, 'Orientação: caso a OSC execute o projeto em vários locais, preencher o endereço no qual a OSC tenha preferência em receber visita técnica do gestor de parcerias.');
  const endTxt = txt(relatorio.endereco_execucao?.texto_editado || relatorio.endereco_execucao?.texto_ia ||
    'As ações foram executadas presencialmente e em ambiente virtual, com atuação integrada no Museu Histórico Abílio Barreto (MHAB), Museu da Imagem e do Som de Belo Horizonte (MIS BH) e Museu da Moda de Belo Horizonte (MUMO), além de articulações com a Diretoria de Museus e atividades especiais do Noturno nos Museus.');
  y = field(doc, y, 'Endereço', endTxt, true);
  y = twoFields(doc, y, 'Complemento', '', 'Bairro', '');
  y = twoFields(doc, y, 'Regional', '', 'Cidade', 'Belo Horizonte');
  y = subTitle(doc, y, '3.2. ENDEREÇO VIRTUAL (Se houver)');
  y = field(doc, y, 'Site / Redes Sociais', '@museuscentro / @viadutodasartes', true);
  y += 4;

  // 4. DIVULGAÇÃO
  y = sectionTitle(doc, y, '4', 'DIVULGAÇÃO DA PARCERIA');
  y = instruction(doc, y, 'Informar os meios utilizados pela instituição para a divulgação e transparência das informações referentes à parceria, conforme disposto no art. 11 da Lei Federal.');
  const divTxt = txt(relatorio.divulgacao_parceria?.texto_editado || relatorio.divulgacao_parceria?.texto_ia ||
    'A parceria foi divulgada por meio de programação pública dos museus, cards digitais, redes sociais, assessoria de imprensa, cobertura fotográfica, materiais de sinalização e publicações institucionais, com identificação da marca Museus Centro e do apoio da Prefeitura de Belo Horizonte/SUCC.');
  y = textBlock(doc, y, divTxt);
  y += 4;

  // 5. DESCRIÇÃO
  y = sectionTitle(doc, y, '5', 'DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS NO PERÍODO');
  y = instruction(doc, y, 'Informar os principais pontos de destaque, resultados e benefícios gerados pela execução da parceria (máx. 1500 caracteres).');
  const descTxt = txt(relatorio.descricao_acoes?.texto_editado || relatorio.descricao_acoes?.texto_ia);
  y = textBlock(doc, y, descTxt, 1500);
  y += 4;

  // 6. PÚBLICO ALVO
  y = sectionTitle(doc, y, '6', 'PÚBLICO ALVO');
  y = instruction(doc, y, 'Indicar a qual público as ações do projeto serão destinadas, determinando quantitativamente (número de pessoas ou número de instituições beneficiadas).');
  y = check(doc, y, 8);
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text('Métrica considerada (pessoa ou instituição): ________________________', M + 2, y + 4);
  y += 8;
  y = publicoTable(doc, y, relatorio.publico_alvo, relatorio._publico_por_museu || relatorio._publico_dashboard?.por_museu);
  const interpTxt = txt(relatorio.publico_alvo?.texto_interpretativo_editado || relatorio.publico_alvo?.texto_interpretativo_ia);
  if (interpTxt) y = textBlock(doc, y, interpTxt);
  y += 2;
  y = instruction(doc, y, 'Duplicar o quadro caso atenda pessoa e instituição e registrar cada um deles separadamente.');
  y += 2;
  y = subTitle(doc, y, '6.1. PESQUISA DE SATISFAÇÃO DO PÚBLICO ALVO DO PROJETO');
  y = check(doc, y, 8);
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text('Realizou pesquisa de satisfação?', M + 2, y + 4);
  y += 6;
  const satRealiz = relatorio.pesquisa_satisfacao?.possui_dados;
  y = checkbox(doc, y, ['Sim', 'Não'], satRealiz ? 'Sim' : 'Não');
  y = instruction(doc, y, 'Se "sim" descreva o resultado abaixo; se "não" justifique a não realização.');
  const satTxt = txt(relatorio.pesquisa_satisfacao?.justificativa_editada || relatorio.pesquisa_satisfacao?.justificativa_ia);
  y = textBlock(doc, y, satTxt || (satRealiz ? '' : 'Não foram aplicados formulários de pesquisa de satisfação neste período de execução.'));
  y += 4;

  return doc; // footers aplicados externamente com offset
}

function buildParte2(relatorio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = HEADER_H + 4;

  // 7. CRONOGRAMA DE METAS
  y = sectionTitle(doc, y, '7', 'CRONOGRAMA DE EXECUÇÃO E CUMPRIMENTO DAS METAS');
  y = instruction(doc, y, 'Nas colunas 01 a 05 transcreva as informações preenchidas no quadro de metas do plano de trabalho aprovado e acrescente as informações das colunas 06 a 08 conforme a execução das ações.');
  y = metasTable(doc, y, relatorio.cronograma_metas);

  y = check(doc, y, 8);
  doc.setFontSize(FS.tiny);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('OBS: Em algumas situações consideramos pertinente a inserção de um parágrafo complementar a fim de esclarecer a metodologia utilizada na execução de uma determinada meta.', M + 2, y + 3, { maxWidth: CONTENT_W - 4 });
  y += 8;

  y = subTitle(doc, y, '7.1. LIÇÕES APRENDIDAS DURANTE O PERÍODO DE EXECUÇÃO');
  y = instruction(doc, y, 'Quais foram os desafios encontrados e as soluções implementadas? Registrar o conhecimento aprendido durante a execução do projeto (máximo 1500 caracteres).');
  const licoesTxt = txt(
    relatorio.licoes_aprendidas?.texto_editado ||
    relatorio.licoes_aprendidas?.texto_ia ||
    relatorio.avaliacao_desafios ||
    relatorio.comentarios_gerais ||
    ''
  );
  if (licoesTxt) {
    y = textBlock(doc, y, licoesTxt, 1500);
  } else {
    y = blankLines(doc, y, 5);
  }
  y += 4;

  // 8. EQUIPE DE TRABALHO
  y = sectionTitle(doc, y, '8', 'EQUIPE DE TRABALHO');
  y = instruction(doc, y, 'Inserir no quadro todos os profissionais contratados para a execução da parceria previstos originalmente no plano de trabalho, incluindo as diversas formas de contratação (CLT, RPA, Pessoa Jurídica).');
  y = equipeTable(doc, y, relatorio.equipe_trabalho);

  if (relatorio._rubricas_periodo?.length > 0) {
    y += 4;
    y = rubricasTable(doc, y, relatorio._rubricas_periodo, relatorio._total_financeiro_fmt);
  }

  if (relatorio._links_documentos?.length > 0) {
    y += 4;
    y = linksDocumentosTable(doc, y, relatorio._links_documentos, relatorio._total_financeiro_fmt);
  }

  return doc; // footers aplicados externamente com offset
}

async function buildParte3(relatorio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = HEADER_H + 4;

  // 9. IMPACTOS
  y = sectionTitle(doc, y, '9', 'IMPACTOS ECONÔMICOS E/OU SOCIAIS DAS AÇÕES DESENVOLVIDAS');
  y = instruction(doc, y, 'Demonstre a relação direta de causa e efeito entre as ações executadas no projeto, os resultados alcançados e como estes modificaram/melhoraram a condição social e/ou econômica do público-alvo. (máximo 2000 caracteres)');
  const impTxt = txt(relatorio.impactos_economicos_sociais?.texto_editado || relatorio.impactos_economicos_sociais?.texto_ia);
  y = textBlock(doc, y, impTxt, 2000);
  y += 4;

  // 10. SUSTENTABILIDADE
  y = sectionTitle(doc, y, '10', 'POSSIBILIDADE DE SUSTENTABILIDADE DAS AÇÕES APÓS CONCLUSÃO DA PARCERIA');
  y = instruction(doc, y, 'Preenchimento somente em relatório final. Fazer uma análise sobre a possibilidade de sustentabilidade das ações após a conclusão da parceria.');
  const susTxt = txt(relatorio.sustentabilidade?.texto_editado || relatorio.sustentabilidade?.texto_ia || '');
  y = textBlock(doc, y, susTxt || (relatorio.tipo !== 'final' ? 'Campo aplicável apenas ao Relatório Final. Conforme determinado pelo modelo SUCC/PBH, a análise de sustentabilidade será preenchida na versão definitiva do documento.' : ''));
  y += 4;

  // 11. AVALIAÇÃO DA PARCERIA
  y = sectionTitle(doc, y, '11', 'AVALIAÇÃO DA PARCERIA COM A ADMINISTRAÇÃO PÚBLICA');
  y = instruction(doc, y, 'Informar problemas detectados, sugestões ou críticas construtivas relacionadas à administração pública (Conselho, SMASAC, PGM, outros), com o objetivo de apontar melhorias para futuras parcerias.');
  const avalTxt = txt(
    relatorio.avaliacao_parceria?.texto_editado ||
    relatorio.avaliacao_parceria?.texto_ia ||
    relatorio.avaliacao_pontos_positivos ||
    relatorio.avaliacao_sugestoes ||
    ''
  );
  y = textBlock(doc, y, avalTxt);
  y += 4;

  // 12. ASSINATURA
  y = sectionTitle(doc, y, '12', 'ASSINATURA DO REPRESENTANTE LEGAL OSC');
  y += 2;
  y = assinaturaBlock(doc, y, relatorio);

  // 13. ANEXOS (lista)
  y = sectionTitle(doc, y, '13', 'ANEXOS E FONTES DE VERIFICAÇÃO');
  y = instruction(doc, y,
    'Os documentos de comprovação de cumprimento do objeto deverão ser apresentados conforme as indicações no quadro de cronograma de execução e cumprimento das metas.\n' +
    'Quando o documento se tratar de "demonstrativo fotográfico" deverão ser apresentados número limitado de registros por relatório, contendo abaixo da fotografia a descrição do evento e a data do registro.\n' +
    'Quando os documentos de verificação forem extensos é possível fazer a inserção por amostragem, destacando essa opção de envio.'
  );
  const anexos = relatorio.anexos_evidencias || [];
  if (anexos.length === 0) {
    y = textBlock(doc, y, 'Documentos de evidência a serem anexados conforme cronograma de metas e atividades realizadas no período.');
  } else {
    for (const a of anexos.slice(0, 20)) {
      y = check(doc, y, 6);
      doc.setFontSize(FS.small);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const linha = `• ${txt(a.atividade_nome, 'Documento')}${a.atividade_data ? '  —  ' + fmtDate(a.atividade_data) : ''}${a.meta_nome ? '  —  Meta: ' + a.meta_nome : ''}`;
      doc.text(linha, M + 2, y + 4, { maxWidth: CONTENT_W - 4 });
      y += 6;
    }
  }

  // 13.1 Links de verificação
  y = drawLinksVerificacao(doc, y);

  // Nota padrão: relatório de comunicação em anexo
  y = check(doc, y, 18);
  y += 4;
  doc.setFillColor(255, 251, 220);
  doc.setDrawColor(200, 160, 40);
  doc.rect(M, y, CONTENT_W, 14, 'F');
  doc.rect(M, y, CONTENT_W, 14, 'S');
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120, 80, 0);
  doc.text('OBSERVAÇÃO: Relatório de Comunicação em Anexo', M + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS.tiny);
  doc.setTextColor(80, 50, 0);
  doc.text('O relatório de comunicação do período (clipping, redes sociais, cobertura fotográfica e assessoria de imprensa) encontra-se em anexo a este documento.', M + 3, y + 10, { maxWidth: CONTENT_W - 6 });
  y += 18;

  return doc; // footers aplicados externamente; galeria vai em PDFs separados
}

// ─── Coleta fotos para galeria ────────────────────────────────────────────────
function coletarFotosGaleria(relatorio) {
  const urlsVistas = new Set();
  const fotos = [];

  const atividadesComFotos = Array.isArray(relatorio._atividades_com_fotos) ? relatorio._atividades_com_fotos : [];
  for (const atv of atividadesComFotos) {
    for (const foto of (atv.fotos || [])) {
      const url = foto.url || foto.file_url;
      if (!url || urlsVistas.has(url)) continue;
      fotos.push({ url, legenda: foto.legenda || foto.caption || atv.titulo || '', atividade: atv.titulo || '', museu: atv.museu || '', data: foto.data || atv.data || '' });
      urlsVistas.add(url);
    }
  }

  const galeriaFotos = Array.isArray(relatorio._fotos_galeria) ? relatorio._fotos_galeria : [];
  for (const foto of galeriaFotos) {
    const url = foto.file_url || foto.url;
    if (!url || urlsVistas.has(url)) continue;
    fotos.push({ url, legenda: foto.legenda || foto.caption || foto.file_name || '', atividade: foto.atividade_nome || '', museu: foto.museu || '', data: foto.created_date || '' });
    urlsVistas.add(url);
  }

  const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
  for (const ev of evidencias) {
    const url = ev.foto_url || ev.url;
    if (!url || urlsVistas.has(url)) continue;
    fotos.push({ url, legenda: ev.legenda_editada || ev.legenda_ia || ev.atividade_nome || '', atividade: ev.atividade_nome || ev.meta_nome || '', museu: '', data: ev.atividade_data || '' });
    urlsVistas.add(url);
  }

  return fotos;
}

// ─── Gera um PDF com 1 foto (1 página A4) ────────────────────────────────────
async function buildFotoPDF(foto, idx, total, pageGlobal, totalPartes) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = HEADER_H + 6;

  // Cabeçalho da seção
  doc.setFillColor(12, 12, 12);
  doc.rect(M, y, CONTENT_W, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'bold');
  doc.text(`14. DEMONSTRATIVO FOTOGRÁFICO — Foto ${idx} de ${total}`, M + 2, y + 5);
  y += 10;

  const fotoH = 140;
  const fotoW = CONTENT_W;

  if (foto.url) {
    try {
      doc.addImage(foto.url, 'JPEG', M, y, fotoW, fotoH, undefined, 'FAST');
    } catch {
      doc.setFillColor(220, 220, 220);
      doc.rect(M, y, fotoW, fotoH, 'F');
      doc.setFontSize(FS.small);
      doc.setTextColor(130, 130, 130);
      doc.text('[Imagem não disponível — verificar no Drive]', PAGE_W / 2, y + fotoH / 2, { align: 'center' });
    }
  } else {
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(200, 200, 200);
    doc.rect(M, y, fotoW, fotoH, 'FD');
    doc.setFontSize(FS.small);
    doc.setTextColor(160, 160, 160);
    doc.text('[Foto não localizada]', PAGE_W / 2, y + fotoH / 2, { align: 'center' });
  }
  y += fotoH + 3;

  // Legenda
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(210, 210, 210);
  const legendaH = 22;
  doc.rect(M, y, CONTENT_W, legendaH, 'FD');
  doc.setFontSize(FS.small);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  const legTxt = foto.legenda || foto.atividade || 'Foto de Registro';
  doc.text(doc.splitTextToSize(legTxt, CONTENT_W - 4)[0] || '', M + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS.tiny);
  doc.setTextColor(80, 80, 80);
  if (foto.atividade) doc.text(`Atividade: ${foto.atividade}`, M + 2, y + 10);
  if (foto.museu) doc.text(`Museu: ${foto.museu}`, M + 2, y + 14);
  const meta = [foto.data ? fmtDate(foto.data) : '', 'Daniel Moreira Soares'].filter(Boolean).join(' — ');
  doc.text(meta, M + 2, y + 18);
  y += legendaH + 2;

  // Rodapé
  drawPageHeader(doc, totalPartes, totalPartes);
  doc.setDrawColor(200, 200, 200);
  doc.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
  doc.setFontSize(FS.tiny);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
  doc.text(`Pág. ${pageGlobal} — Foto ${idx}/${total}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });

  return doc;
}

// ─── API pública ─────────────────────────────────────────────────────────────
// Exporta em PDFs separados com máx. 5 páginas + 1 foto por PDF para a galeria.
export async function exportarRelatorioExecucaoPDF(relatorio, modo = 'completo') {
  if (!relatorio) return;
  const mesRef = (relatorio.data_inicio || '').slice(0, 7).replace('-', '_') || 'relatorio';
  const base = `Relatorio_Execucao_Objeto_${mesRef}`;

  // Total de partes de texto + PDFs de fotos (calculado depois)
  const TOTAL_PARTES_TEXTO = 3;
  let pageOffset = 0;

  if (modo === 'parte1' || modo === 'completo') {
    const d1 = buildParte1(relatorio);
    const n1 = d1.internal.getNumberOfPages();
    // Aplicar footers com numeração global
    for (let p = 1; p <= n1; p++) {
      d1.setPage(p);
      pageOffset++;
      if (p === 1) { drawCoverHeader(d1); } else { drawPageHeader(d1, 1, TOTAL_PARTES_TEXTO); }
      d1.setDrawColor(200, 200, 200);
      d1.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
      d1.setFontSize(FS.tiny); d1.setFont('helvetica', 'normal'); d1.setTextColor(150, 150, 150);
      d1.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
      d1.text(`Pág. ${pageOffset} — Parte 1/${TOTAL_PARTES_TEXTO}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
    }
    d1.save(`${base}_Parte1_Identificacao.pdf`);
    if (modo === 'parte1') return;
  }

  if (modo === 'parte2' || modo === 'completo') {
    const d2 = buildParte2(relatorio);
    const n2 = d2.internal.getNumberOfPages();
    for (let p = 1; p <= n2; p++) {
      d2.setPage(p);
      pageOffset++;
      drawPageHeader(d2, 2, TOTAL_PARTES_TEXTO);
      d2.setDrawColor(200, 200, 200);
      d2.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
      d2.setFontSize(FS.tiny); d2.setFont('helvetica', 'normal'); d2.setTextColor(150, 150, 150);
      d2.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
      d2.text(`Pág. ${pageOffset} — Parte 2/${TOTAL_PARTES_TEXTO}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
    }
    d2.save(`${base}_Parte2_Metas_Equipe.pdf`);
    if (modo === 'parte2') return;
  }

  if (modo === 'parte3' || modo === 'completo') {
    const d3 = await buildParte3(relatorio);
    const n3 = d3.internal.getNumberOfPages();
    for (let p = 1; p <= n3; p++) {
      d3.setPage(p);
      pageOffset++;
      drawPageHeader(d3, 3, TOTAL_PARTES_TEXTO);
      d3.setDrawColor(200, 200, 200);
      d3.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
      d3.setFontSize(FS.tiny); d3.setFont('helvetica', 'normal'); d3.setTextColor(150, 150, 150);
      d3.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
      d3.text(`Pág. ${pageOffset} — Parte 3/${TOTAL_PARTES_TEXTO}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
    }
    d3.save(`${base}_Parte3_Impactos_Assinatura.pdf`);
    if (modo === 'parte3') return;
  }

  // 4. GALERIA: 1 foto por PDF, com delay para não travar o browser
  if (modo === 'galeria' || modo === 'completo') {
    const fotos = coletarFotosGaleria(relatorio);
    if (fotos.length === 0) return;

    for (let i = 0; i < fotos.length; i++) {
      pageOffset++;
      // pequena pausa a cada foto para liberar o event loop
      await new Promise(r => setTimeout(r, 80));
      const docFoto = await buildFotoPDF(fotos[i], i + 1, fotos.length, pageOffset, TOTAL_PARTES_TEXTO);
      docFoto.save(`${base}_Foto_${String(i + 1).padStart(3, '0')}.pdf`);
    }
  }
}