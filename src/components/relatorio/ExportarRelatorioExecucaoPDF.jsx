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

// ─── Rodapé de cada página ───────────────────────────────────────────────────
function drawAllFooters(doc, parte, totalPartes, firstPageIsCover = false) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i === 1 && firstPageIsCover) {
      drawCoverHeader(doc);
    } else {
      drawPageHeader(doc, parte, totalPartes);
    }
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
    doc.setFontSize(FS.tiny);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
    doc.text(`Pág. ${i} / ${total}${totalPartes > 1 ? ` — Parte ${parte}/${totalPartes}` : ''}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
  }
}

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
function publicoTable(doc, y, p) {
  p = p || {};
  y = check(doc, y, 30);
  const cw = CONTENT_W / 4;
  const hdrs = ['PÚBLICO ALVO TOTAL DO PROJETO', 'PREVISTO P/ ATENDIMENTO\n(referente ao período)', 'ATENDIDO DE FATO\n(referente ao período)', 'JUSTIFICATIVA\n(Alcance de Atendidos)'];
  doc.setFillColor(12, 12, 12);
  let xc = M;
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
    [`DIRETO: ${(p.previsto_direto || 0).toLocaleString('pt-BR')}`, `DIRETO: ${(p.realizado_direto || 0).toLocaleString('pt-BR')} (${p.percentual_direto || 0}%)`, ''],
    [`INDIRETO: ${(p.previsto_indireto || 0).toLocaleString('pt-BR')}`, `INDIRETO: ${(p.realizado_indireto || 0).toLocaleString('pt-BR')} (${p.percentual_indireto || 0}%)`, ''],
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
      doc.text(txt(cell), xc + 2, y + 5.5);
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
    const saldo = r.saldo || (r.valor_previsto - r.valor_utilizado);
    const saldoColor = saldo >= 0 ? [20, 100, 20] : [160, 30, 30];
    const cells = [
      txt(r.rubrica_nome),
      txt(r.grupo),
      txt(r.natureza_despesa),
      fmtBRL(r.valor_previsto),
      fmtBRL(r.total_gasto_periodo),
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

// ─── Galeria de fotos (ao final do relatório) ─────────────────────────────────
// Renderiza fotos agrupadas por atividade, 3-4 por atividade, sem repetição,
// com legenda obrigatória abaixo de cada foto.
async function drawGaleriaFotos(doc, y, relatorio) {
  // Coletar todas as fotos: anexos_evidencias + _fotos_galeria
  const todasFotos = [];
  const urlsVistas = new Set();

  // Fontes de fotos: anexos_evidencias do relatório
  const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
  // Fontes de fotos: _fotos_galeria (array de ReportPhoto/Attachment injetado pelo sync)
  const galeriaFotos = Array.isArray(relatorio._fotos_galeria) ? relatorio._fotos_galeria : [];
  // Fontes de fotos: _atividades_periodo com fotos
  const atividades = Array.isArray(relatorio._atividades_periodo) ? relatorio._atividades_periodo : [];

  // 1. Montar grupos por atividade a partir de galeriaFotos (que têm activity_id / atividade_nome)
  const gruposPorAtividade = new Map();

  for (const foto of galeriaFotos) {
    const url = foto.file_url || foto.url;
    if (!url || urlsVistas.has(url)) continue;
    const nomeAtv = foto.atividade_nome || foto.activityTitulo || foto.museu || 'Registro do Projeto';
    if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, []);
    const grupo = gruposPorAtividade.get(nomeAtv);
    if (grupo.length < 4) {
      grupo.push({ url, legenda: foto.legenda || foto.caption || foto.file_name || nomeAtv, data: foto.date || foto.created_date });
      urlsVistas.add(url);
    }
  }

  // 2. Evidencias do relatório (sem atividade específica = "Atividades do Período")
  for (const ev of evidencias) {
    const url = ev.foto_url || ev.url;
    if (!url || urlsVistas.has(url)) continue;
    const nomeAtv = ev.atividade_nome || 'Atividades do Período';
    if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, []);
    const grupo = gruposPorAtividade.get(nomeAtv);
    if (grupo.length < 4) {
      grupo.push({ url, legenda: ev.legenda_editada || ev.legenda_ia || ev.atividade_nome || 'Foto de Registro', data: ev.atividade_data });
      urlsVistas.add(url);
    }
  }

  // Se não há fotos suficientes, tentar atividades do período
  if (todasFotos.length === 0 && gruposPorAtividade.size === 0) {
    for (const atv of atividades.slice(0, 20)) {
      const fotos = Array.isArray(atv.fotos) ? atv.fotos : [];
      if (fotos.length === 0) continue;
      const nomeAtv = atv.titulo || atv.nome || 'Atividade';
      if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, []);
      const grupo = gruposPorAtividade.get(nomeAtv);
      for (const foto of fotos) {
        const url = foto.file_url || foto.url;
        if (!url || urlsVistas.has(url) || grupo.length >= 4) continue;
        grupo.push({ url, legenda: foto.legenda || foto.caption || nomeAtv, data: foto.date });
        urlsVistas.add(url);
      }
    }
  }

  // Filtrar grupos com pelo menos 1 foto e limitar a 4 fotos por grupo
  const grupos = Array.from(gruposPorAtividade.entries())
    .filter(([, fotos]) => fotos.length >= 1)
    .map(([nome, fotos]) => ({ nome, fotos: fotos.slice(0, 4) }));

  if (grupos.length === 0) return y;

  // Título da seção galeria
  y = check(doc, y, 12);
  y = sectionTitle(doc, y, '14', 'DEMONSTRATIVO FOTOGRÁFICO — ATIVIDADES REALIZADAS');
  y = instruction(doc, y, 'Registros fotográficos das atividades executadas no período. Cada foto apresenta descrição da ação e data do registro, conforme orientação SUCC/PBH.');
  y += 3;

  // Layout: 2 fotos por linha, cada foto com legenda abaixo
  const fotoW = (CONTENT_W - 4) / 2;
  const fotoH = 42; // altura da imagem
  const legendaH = 10;
  const blocoH = fotoH + legendaH + 4;

  for (const grupo of grupos) {
    // Título do grupo (atividade)
    y = check(doc, y, 10);
    doc.setFillColor(240, 240, 240);
    doc.rect(M, y, CONTENT_W, 6, 'F');
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(FS.small);
    doc.setFont('helvetica', 'bold');
    doc.text(grupo.nome.slice(0, 80), M + 2, y + 4.5);
    y += 8;

    // Renderizar fotos em pares (2 por linha)
    for (let i = 0; i < grupo.fotos.length; i += 2) {
      y = check(doc, y, blocoH + 6);
      const fotos2 = grupo.fotos.slice(i, i + 2);

      for (let j = 0; j < fotos2.length; j++) {
        const foto = fotos2[j];
        const xFoto = M + j * (fotoW + 4);

        // Tentar carregar imagem
        try {
          // Tentativa de adicionar imagem (pode falhar se não for CORS-acessível)
          doc.addImage(foto.url, 'JPEG', xFoto, y, fotoW, fotoH, undefined, 'FAST');
        } catch {
          // Fallback: placeholder cinza com ícone de câmera
          doc.setFillColor(230, 230, 230);
          doc.rect(xFoto, y, fotoW, fotoH, 'F');
          doc.setFontSize(FS.tiny);
          doc.setTextColor(150, 150, 150);
          doc.setFont('helvetica', 'italic');
          doc.text('[Foto não disponível]', xFoto + fotoW / 2, y + fotoH / 2, { align: 'center' });
          doc.text(foto.legenda?.slice(0, 40) || '', xFoto + fotoW / 2, y + fotoH / 2 + 5, { align: 'center', maxWidth: fotoW - 4 });
        }

        // Legenda abaixo da foto
        const legendaY = y + fotoH + 1;
        doc.setFillColor(248, 248, 248);
        doc.setDrawColor(210, 210, 210);
        doc.rect(xFoto, legendaY, fotoW, legendaH, 'FD');
        doc.setFontSize(6);
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'bold');
        const legenda = foto.legenda || grupo.nome;
        const legendaLines = doc.splitTextToSize(`Foto de Registro — ${legenda}`, fotoW - 4);
        doc.text(legendaLines[0] || '', xFoto + 2, legendaY + 3.5);
        if (legendaLines[1]) {
          doc.setFont('helvetica', 'normal');
          doc.text(legendaLines[1], xFoto + 2, legendaY + 7);
        }
        if (foto.data) {
          doc.setFontSize(5);
          doc.setTextColor(120, 120, 120);
          doc.text(fmtDate(foto.data), xFoto + fotoW - 2, legendaY + 8.5, { align: 'right' });
        }
      }

      y += blocoH + 4;
    }
    y += 3;
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
  y = twoFields(doc, y, 'Instrumento Jurídico', txt(ident.instrumento_juridico), 'Processo Administrativo Nº', txt(ident.processo_administrativo));
  y = twoFields(doc, y, 'Vigência do Projeto — Início', fmtDate(ident.vigencia_inicio), 'Vigência do Projeto — Fim', fmtDate(ident.vigencia_fim));
  y = field(doc, y, 'Data do primeiro repasse pela administração', fmtDate(ident.data_primeiro_repasse || ''), true);
  y = field(doc, y, 'Responsável pela elaboração do relatório', txt(ident.responsavel), true);
  y = twoFields(doc, y, 'Telefone', txt(ident.telefone), 'E-mail', txt(ident.email));
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
  y = publicoTable(doc, y, relatorio.publico_alvo);
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

  drawAllFooters(doc, 1, 3, true); // true = primeira página com cover header
  return doc;
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

  drawAllFooters(doc, 2, 3);
  return doc;
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
  const susTxt = txt(relatorio.sustentabilidade?.texto_editado || relatorio.sustentabilidade?.texto_ia);
  y = textBlock(doc, y, susTxt || (relatorio.tipo === 'parcial' ? '[Campo aplicável apenas ao Relatório Final]' : ''));
  y += 4;

  // 11. AVALIAÇÃO DA PARCERIA
  y = sectionTitle(doc, y, '11', 'AVALIAÇÃO DA PARCERIA COM A ADMINISTRAÇÃO PÚBLICA');
  y = instruction(doc, y, 'Informar problemas detectados, sugestões ou críticas construtivas relacionadas à administração pública (Conselho, SMASAC, PGM, outros), com o objetivo de apontar melhorias para futuras parcerias.');
  const avalTxt = txt(relatorio.avaliacao_parceria?.texto_editado || relatorio.avaliacao_parceria?.texto_ia || relatorio.avaliacao_pontos_positivos || '');
  y = textBlock(doc, y, avalTxt);
  y += 4;

  // 12. ASSINATURA
  y = sectionTitle(doc, y, '12', 'ASSINATURA DO REPRESENTANTE LEGAL OSC');
  y += 2;
  y = assinaturaBlock(doc, y, relatorio);

  // 13. ANEXOS (lista)
  y = sectionTitle(doc, y, '13', 'ANEXOS');
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

  // 14. GALERIA FOTOGRÁFICA (nova seção — ao final)
  y = check(doc, y, 20);
  y += 4;
  y = await drawGaleriaFotos(doc, y, relatorio);

  drawAllFooters(doc, 3, 3);
  return doc;
}

// ─── API pública ─────────────────────────────────────────────────────────────
export async function exportarRelatorioExecucaoPDF(relatorio, modo = 'completo') {
  if (!relatorio) return;
  const mesRef = (relatorio.data_inicio || '').slice(0, 7).replace('-', '_') || 'relatorio';
  const base = `Relatorio_Execucao_Objeto_${mesRef}`;

  if (modo === 'parte1') {
    buildParte1(relatorio).save(`${base}_Parte1_Identificacao_Publico.pdf`);
  } else if (modo === 'parte2') {
    buildParte2(relatorio).save(`${base}_Parte2_Metas_Equipe.pdf`);
  } else if (modo === 'parte3') {
    const d3 = await buildParte3(relatorio);
    d3.save(`${base}_Parte3_Impactos_Assinatura_Galeria.pdf`);
  } else {
    const d1 = buildParte1(relatorio);
    const d2 = buildParte2(relatorio);
    const d3 = await buildParte3(relatorio);
    d1.save(`${base}_Parte1_Identificacao_Publico.pdf`);
    d2.save(`${base}_Parte2_Metas_Equipe.pdf`);
    d3.save(`${base}_Parte3_Impactos_Assinatura_Galeria.pdf`);
  }
}