import jsPDF from 'jspdf';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 20; // margem
const CONTENT_W = PAGE_W - M * 2;
const LINE_HEIGHT = 5.5;
const FONT_NORMAL = 10;
const FONT_SMALL = 8.5;
const FONT_TINY = 7.5;

function fmtDate(d) {
  if (!d) return 'DD/MM/AAAA';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(d);
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function addPage(doc) {
  doc.addPage();
  return M;
}

function checkPageBreak(doc, y, needed = 20) {
  if (y + needed > PAGE_H - 15) {
    return addPage(doc);
  }
  return y;
}

function drawHeader(doc, y) {
  // Título principal
  doc.setFillColor(15, 15, 15);
  doc.rect(M, y, CONTENT_W, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE EXECUÇÃO DO OBJETO', PAGE_W / 2, y + 7, { align: 'center' });
  y += 12;

  doc.setFillColor(240, 240, 240);
  doc.rect(M, y, CONTENT_W, 7, 'F');
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'italic');
  doc.text('(Preferencialmente em papel timbrado)', PAGE_W / 2, y + 5, { align: 'center' });
  return y + 10;
}

function drawSectionTitle(doc, y, num, titulo) {
  y = checkPageBreak(doc, y, 12);
  doc.setFillColor(30, 30, 30);
  doc.rect(M, y, CONTENT_W, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FONT_NORMAL);
  doc.setFont('helvetica', 'bold');
  doc.text(`${num}. ${titulo.toUpperCase()}`, M + 3, y + 5);
  return y + 9;
}

function drawSubTitle(doc, y, titulo) {
  y = checkPageBreak(doc, y, 8);
  doc.setFillColor(230, 230, 230);
  doc.rect(M, y, CONTENT_W, 6, 'F');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, M + 2, y + 4.2);
  return y + 8;
}

function drawLabel(doc, y, label, value, fullWidth = false) {
  y = checkPageBreak(doc, y, LINE_HEIGHT + 2);
  const colW = fullWidth ? CONTENT_W : CONTENT_W / 2;
  doc.setFontSize(FONT_TINY);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(label + ':', M + 1, y + 3);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  const val = String(value || '—');
  doc.text(val, M + 1 + doc.getTextWidth(label + ': '), y + 3);
  return y + LINE_HEIGHT;
}

function drawField(doc, y, label, value, fullWidth = false) {
  y = checkPageBreak(doc, y, 10);
  const w = fullWidth ? CONTENT_W : CONTENT_W / 2;
  doc.setFillColor(250, 250, 250);
  doc.rect(M, y, fullWidth ? CONTENT_W : w, 8, 'F');
  doc.setDrawColor(210, 210, 210);
  doc.rect(M, y, fullWidth ? CONTENT_W : w, 8, 'S');
  doc.setFontSize(FONT_TINY);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(label, M + 2, y + 3);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  const txt = String(value || '');
  const maxW = (fullWidth ? CONTENT_W : w) - 4;
  const lines = doc.splitTextToSize(txt, maxW);
  doc.text(lines[0] || '', M + 2, y + 6.5);
  return y + 9;
}

function drawTwoFields(doc, y, f1label, f1val, f2label, f2val) {
  y = checkPageBreak(doc, y, 10);
  const hw = CONTENT_W / 2 - 1;
  // Campo 1
  doc.setFillColor(250, 250, 250);
  doc.rect(M, y, hw, 8, 'F');
  doc.setDrawColor(210, 210, 210);
  doc.rect(M, y, hw, 8, 'S');
  doc.setFontSize(FONT_TINY);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(f1label, M + 2, y + 3);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(String(f1val || ''), M + 2, y + 6.5);
  // Campo 2
  const x2 = M + hw + 2;
  doc.setFillColor(250, 250, 250);
  doc.rect(x2, y, hw, 8, 'F');
  doc.setDrawColor(210, 210, 210);
  doc.rect(x2, y, hw, 8, 'S');
  doc.setFontSize(FONT_TINY);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(f2label, x2 + 2, y + 3);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(String(f2val || ''), x2 + 2, y + 6.5);
  return y + 9;
}

function drawTextBlock(doc, y, texto, maxChars = 0) {
  if (!texto) return y + 4;
  const txt = maxChars > 0 ? texto.slice(0, maxChars) : texto;
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(txt, CONTENT_W - 4);
  for (const line of lines) {
    y = checkPageBreak(doc, y, LINE_HEIGHT);
    doc.text(line, M + 2, y + 3.5);
    y += LINE_HEIGHT;
  }
  return y + 2;
}

function drawInstruction(doc, y, texto) {
  y = checkPageBreak(doc, y, 8);
  doc.setFillColor(255, 252, 235);
  doc.rect(M, y, CONTENT_W, 6, 'F');
  doc.setFontSize(FONT_TINY);
  doc.setTextColor(140, 100, 0);
  doc.setFont('helvetica', 'italic');
  const lines = doc.splitTextToSize(texto, CONTENT_W - 4);
  doc.text(lines[0], M + 2, y + 4);
  return y + 7;
}

function drawCheckbox(doc, y, opcoes, selecionada) {
  y = checkPageBreak(doc, y, 8);
  let x = M + 2;
  for (const op of opcoes) {
    const checked = op === selecionada;
    doc.setDrawColor(80, 80, 80);
    doc.setFillColor(checked ? 30 : 255, checked ? 30 : 255, checked ? 30 : 255);
    doc.rect(x, y + 1, 4, 4, checked ? 'FD' : 'D');
    if (checked) {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(FONT_TINY - 1);
      doc.text('✓', x + 0.8, y + 4.5);
    }
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(FONT_SMALL);
    doc.setFont('helvetica', 'normal');
    doc.text(`  ${op}`, x + 5, y + 4.5);
    x += 5 + doc.getTextWidth(`  ${op}`) + 8;
  }
  return y + 8;
}

function drawMetasTable(doc, y, metas) {
  y = checkPageBreak(doc, y, 20);

  // Cabeçalho da tabela
  const cols = [
    { label: '1) METAS', w: 30 },
    { label: '2) RESULT. ESPERADOS', w: 28 },
    { label: '3) AÇÕES', w: 28 },
    { label: '4) PERÍODO', w: 22 },
    { label: '5) DOCS VERIF.', w: 20 },
    { label: '6) RESULT. ALCANÇADOS', w: 28 },
    { label: '7) STATUS', w: 22 },
    { label: '8) JUSTIF.', w: 22 },
  ];

  doc.setFillColor(15, 15, 15);
  let xc = M;
  for (const col of cols) {
    doc.rect(xc, y, col.w, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(col.label, col.w - 1);
    doc.text(lines, xc + 1, y + 3);
    xc += col.w;
  }
  y += 8;

  for (const meta of (metas || [])) {
    const rowH = 14;
    y = checkPageBreak(doc, y, rowH);
    const statusColor =
      meta.status_meta === 'Realizada Integralmente' ? [34, 139, 34] :
      meta.status_meta === 'Realizada Parcialmente' ? [218, 165, 32] :
      [200, 50, 50];

    xc = M;
    const cells = [
      meta.meta_nome || '',
      meta.resultado_esperado || '',
      meta.acoes || '',
      meta.periodo || '',
      (meta.documentos_verificacao || []).join(', ') || '',
      meta.resultado_alcancado || '',
      `${meta.status_meta || '—'}\n${meta.percentual_execucao ? meta.percentual_execucao + '%' : ''}`,
      meta.justificativa || '',
    ];
    for (let ci = 0; ci < cols.length; ci++) {
      const bg = ci === 6 ? statusColor : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.setDrawColor(200, 200, 200);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      doc.setTextColor(ci === 6 ? 255 : 40, ci === 6 ? 255 : 40, ci === 6 ? 255 : 40);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', ci === 6 ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(cells[ci], cols[ci].w - 2);
      doc.text(lines.slice(0, 3), xc + 1, y + 3.5);
      xc += cols[ci].w;
    }
    y += rowH;
  }
  return y + 4;
}

function drawEquipeTable(doc, y, equipe) {
  y = checkPageBreak(doc, y, 20);

  const cols = [
    { label: 'NOME', w: 42 },
    { label: 'CARGO', w: 30 },
    { label: 'CONTRATAÇÃO', w: 28 },
    { label: 'ATRIBUIÇÕES', w: 32 },
    { label: 'PERÍODO', w: 22 },
    { label: 'C.H. SEMANAL', w: 18 },
    { label: 'VALOR MENSAL BRUTO', w: 28 },
  ];

  doc.setFillColor(15, 15, 15);
  let xc = M;
  for (const col of cols) {
    doc.rect(xc, y, col.w, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(col.label, xc + 1, y + 4.5);
    xc += col.w;
  }
  y += 7;

  for (const m of (equipe || [])) {
    const rowH = 8;
    y = checkPageBreak(doc, y, rowH);
    xc = M;
    const cells = [
      m.nome || '',
      m.cargo || '',
      m.tipo_contratacao || '',
      m.atribuicoes || '',
      m.periodo || '',
      m.carga_horaria || '',
      fmtBRL(m.valor),
    ];
    for (let ci = 0; ci < cols.length; ci++) {
      doc.setFillColor(ci % 2 === 0 ? 250 : 245, 250, 255);
      doc.setDrawColor(220, 220, 220);
      doc.rect(xc, y, cols[ci].w, rowH, 'FD');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(cells[ci], cols[ci].w - 2);
      doc.text(lines[0] || '', xc + 1, y + 5);
      xc += cols[ci].w;
    }
    y += rowH;
  }

  // Linha em branco para preenchimento manual
  for (let i = 0; i < 2; i++) {
    y = checkPageBreak(doc, y, 8);
    xc = M;
    for (const col of cols) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 200, 200);
      doc.rect(xc, y, col.w, 8, 'D');
      xc += col.w;
    }
    y += 8;
  }
  return y + 4;
}

function drawPublicoTable(doc, y, publico) {
  y = checkPageBreak(doc, y, 24);

  const p = publico || {};
  const colW = CONTENT_W / 4;

  // Cabeçalho
  const headers = ['P. ALVO TOTAL DO PROJETO', 'PREVISTO P/ ATENDIMENTO', 'ATENDIDO DE FATO', 'JUSTIFICATIVA'];
  doc.setFillColor(30, 30, 30);
  let xc = M;
  for (const h of headers) {
    doc.rect(xc, y, colW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(h, xc + colW / 2, y + 4.5, { align: 'center' });
    xc += colW;
  }
  y += 7;

  // Linha DIRETO
  const rows = [
    ['DIRETO', `DIRETO: ${(p.previsto_direto || 0).toLocaleString('pt-BR')}`, `DIRETO: ${(p.realizado_direto || 0).toLocaleString('pt-BR')} (${p.percentual_direto || 0}%)`, ''],
    ['INDIRETO', `INDIRETO: ${(p.previsto_indireto || 0).toLocaleString('pt-BR')}`, `INDIRETO: ${(p.realizado_indireto || 0).toLocaleString('pt-BR')} (${p.percentual_indireto || 0}%)`, ''],
  ];
  for (const row of rows) {
    xc = M;
    for (const cell of row) {
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(210, 210, 210);
      doc.rect(xc, y, colW, 8, 'FD');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(FONT_SMALL);
      doc.setFont('helvetica', 'bold');
      doc.text(cell, xc + 2, y + 5.5);
      xc += colW;
    }
    y += 8;
  }
  return y + 4;
}

function drawFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    doc.text(`Viaduto das Artes — Museus Centro  |  Gerado em ${new Date().toLocaleString('pt-BR')}`, M, PAGE_H - 7);
    doc.text(`Página ${i} de ${pageCount}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
  }
}

export function exportarRelatorioExecucaoPDF(relatorio) {
  if (!relatorio) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ident = relatorio.identificacao_projeto || {};
  let y = M;

  // === CABEÇALHO ===
  y = drawHeader(doc, y);
  y += 2;

  // === 1. TIPO DE RELATÓRIO ===
  y = drawSectionTitle(doc, y, '1', 'TIPO DE RELATÓRIO');
  y = drawCheckbox(doc, y, ['Parcial', 'Final'], relatorio.tipo === 'parcial' ? 'Parcial' : 'Final');
  y = drawTwoFields(doc, y,
    'Período de execução (Início)', fmtDate(relatorio.data_inicio),
    'Período de execução (Fim)', fmtDate(relatorio.data_fim)
  );
  y += 4;

  // === 2. IDENTIFICAÇÃO DO PROJETO ===
  y = drawSectionTitle(doc, y, '2', 'IDENTIFICAÇÃO DO PROJETO');
  y = drawField(doc, y, 'Organização da Sociedade Civil', ident.organizacao, true);
  y = drawField(doc, y, 'Nome do Projeto', ident.projeto, true);
  y = drawTwoFields(doc, y, 'Instrumento Jurídico', ident.instrumento_juridico, 'Processo Administrativo Nº', ident.processo_administrativo);
  y = drawTwoFields(doc, y, 'Vigência do Projeto (Início)', fmtDate(ident.vigencia_inicio), 'Vigência do Projeto (Fim)', fmtDate(ident.vigencia_fim));
  y = drawField(doc, y, 'Responsável pela elaboração do relatório', ident.responsavel, true);
  y = drawTwoFields(doc, y, 'Telefone', ident.telefone, 'E-mail', ident.email);
  y += 4;

  // === 3. ENDEREÇO DE EXECUÇÃO ===
  y = drawSectionTitle(doc, y, '3', 'ENDEREÇO DE EXECUÇÃO DAS AÇÕES DO PROJETO');
  y = drawCheckbox(doc, y, ['Endereço Físico', 'Endereço Virtual', 'Ambos'], 'Ambos');
  y = drawSubTitle(doc, y, '3.1. ENDEREÇO FÍSICO');
  y = drawInstruction(doc, y, 'Orientação: caso a OSC execute o projeto em vários locais, preencher o endereço no qual a OSC tenha preferência em receber visita técnica.');
  const endTxt = relatorio.endereco_execucao?.texto_editado || relatorio.endereco_execucao?.texto_ia || '';
  y = drawField(doc, y, 'Endereço', endTxt, true);
  y = drawTwoFields(doc, y, 'Complemento', '', 'Bairro', '');
  y = drawTwoFields(doc, y, 'Regional', '', 'Cidade', 'Belo Horizonte');
  y = drawSubTitle(doc, y, '3.2. ENDEREÇO VIRTUAL (Se houver)');
  y = drawField(doc, y, 'Site', '', true);
  y += 4;

  // === 4. DIVULGAÇÃO DA PARCERIA ===
  y = drawSectionTitle(doc, y, '4', 'DIVULGAÇÃO DA PARCERIA');
  y = drawInstruction(doc, y, 'Informar os meios utilizados pela instituição para a divulgação e transparência das informações referentes à parceria, conforme art. 11 da Lei Federal.');
  const divTxt = relatorio.divulgacao_parceria?.texto_editado || relatorio.divulgacao_parceria?.texto_ia || '';
  y = drawTextBlock(doc, y, divTxt);
  y += 4;

  // === 5. DESCRIÇÃO SUCINTA ===
  y = drawSectionTitle(doc, y, '5', 'DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS NO PERÍODO');
  y = drawInstruction(doc, y, 'Informar os principais pontos de destaque, resultados e benefícios gerados pela execução da parceria (máx. 1500 caracteres).');
  const descTxt = relatorio.descricao_acoes?.texto_editado || relatorio.descricao_acoes?.texto_ia || '';
  y = drawTextBlock(doc, y, descTxt, 1500);
  y += 4;

  // === 6. PÚBLICO ALVO ===
  y = drawSectionTitle(doc, y, '6', 'PÚBLICO ALVO');
  y = drawInstruction(doc, y, 'Indicar a qual público as ações do projeto serão destinadas, determinando quantitativamente.');
  y = drawPublicoTable(doc, y, relatorio.publico_alvo);
  if (relatorio.publico_alvo?.texto_interpretativo_editado || relatorio.publico_alvo?.texto_interpretativo_ia) {
    y = drawTextBlock(doc, y, relatorio.publico_alvo.texto_interpretativo_editado || relatorio.publico_alvo.texto_interpretativo_ia);
  }

  y = drawSubTitle(doc, y, '6.1. PESQUISA DE SATISFAÇÃO DO PÚBLICO ALVO DO PROJETO');
  const satRealiz = relatorio.pesquisa_satisfacao?.possui_dados;
  y = drawCheckbox(doc, y, ['Sim', 'Não'], satRealiz ? 'Sim' : 'Não');
  y = drawInstruction(doc, y, 'Se "sim" descreva o resultado abaixo, se "não" justifique a não realização.');
  const satTxt = relatorio.pesquisa_satisfacao?.justificativa_editada || relatorio.pesquisa_satisfacao?.justificativa_ia || '';
  y = drawTextBlock(doc, y, satTxt || 'Não foram aplicados formulários de pesquisa de satisfação neste período de execução.');
  y += 4;

  // === 7. CRONOGRAMA DE METAS ===
  y = drawSectionTitle(doc, y, '7', 'CRONOGRAMA DE EXECUÇÃO E CUMPRIMENTO DAS METAS');
  y = drawInstruction(doc, y, 'Nas colunas 01 a 05 transcreva as informações do plano de trabalho aprovado e acrescente as informações das colunas 06 a 08 conforme a execução das ações.');
  y = drawMetasTable(doc, y, relatorio.cronograma_metas);

  y = drawSubTitle(doc, y, '7.1. LIÇÕES APRENDIDAS DURANTE O PERÍODO DE EXECUÇÃO');
  y = drawInstruction(doc, y, 'Quais foram os desafios encontrados e as soluções implementadas? (máximo 1500 caracteres)');
  y = drawTextBlock(doc, y, relatorio.descricao_acoes?.texto_editado ? '' : '', 1500);
  // Espaço para preenchimento
  for (let i = 0; i < 4; i++) {
    y = checkPageBreak(doc, y, 6);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, y + 4, M + CONTENT_W, y + 4);
    y += 6;
  }
  y += 4;

  // === 8. EQUIPE DE TRABALHO ===
  y = drawSectionTitle(doc, y, '8', 'EQUIPE DE TRABALHO');
  y = drawInstruction(doc, y, 'Inserir todos os profissionais contratados para a execução da parceria previstos no plano de trabalho (CLT, RPA, PJ).');
  y = drawEquipeTable(doc, y, relatorio.equipe_trabalho);

  // === 9. IMPACTOS ===
  y = drawSectionTitle(doc, y, '9', 'IMPACTOS ECONÔMICOS E/OU SOCIAIS DAS AÇÕES DESENVOLVIDAS');
  y = drawInstruction(doc, y, 'Demonstre a relação direta de causa e efeito entre as ações, os resultados alcançados e como estes modificaram/melhoraram a condição do público-alvo. (máx. 2000 caracteres)');
  const impTxt = relatorio.impactos_economicos_sociais?.texto_editado || relatorio.impactos_economicos_sociais?.texto_ia || '';
  y = drawTextBlock(doc, y, impTxt, 2000);
  y += 4;

  // === 10. SUSTENTABILIDADE (somente relatório final) ===
  y = drawSectionTitle(doc, y, '10', 'POSSIBILIDADE DE SUSTENTABILIDADE DAS AÇÕES APÓS CONCLUSÃO DA PARCERIA');
  y = drawInstruction(doc, y, 'Preenchimento somente em relatório final. Fazer análise sobre a possibilidade de sustentabilidade das ações após a conclusão da parceria.');
  const susTxt = relatorio.sustentabilidade?.texto_editado || relatorio.sustentabilidade?.texto_ia || '';
  y = drawTextBlock(doc, y, susTxt || (relatorio.tipo === 'parcial' ? '[Campo aplicável apenas ao Relatório Final]' : ''));
  y += 4;

  // === 11. AVALIAÇÃO DA PARCERIA ===
  y = drawSectionTitle(doc, y, '11', 'AVALIAÇÃO DA PARCERIA COM A ADMINISTRAÇÃO PÚBLICA');
  y = drawInstruction(doc, y, 'Informar problemas detectados, sugestões ou críticas construtivas relacionadas à administração pública (Conselho, SMASAC, PGM, outros).');
  const avalTxt = relatorio.avaliacao_parceria?.texto_editado || relatorio.avaliacao_parceria?.texto_ia || '';
  y = drawTextBlock(doc, y, avalTxt);
  y += 4;

  // === 12. ASSINATURA ===
  y = drawSectionTitle(doc, y, '12', 'ASSINATURA DO REPRESENTANTE LEGAL OSC');
  y += 2;
  y = drawInstruction(doc, y,
    'Declaro que são verídicas as informações prestadas neste relatório e que os documentos comprobatórios se encontram arquivados sob a guarda da OSC durante 10 anos após a finalização da parceria.'
  );
  y += 4;

  // Espaço para data
  y = checkPageBreak(doc, y, 16);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`Belo Horizonte, ______ de _______________________________ de 20______`, M + 2, y);
  y += 12;

  // Linha de assinatura
  y = checkPageBreak(doc, y, 20);
  const centerX = PAGE_W / 2;
  doc.setDrawColor(30, 30, 30);
  doc.line(centerX - 45, y, centerX + 45, y);
  y += 4;
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const nomeSig = relatorio.assinatura?.nome_representante || ident.responsavel || '___________________________________';
  doc.text(nomeSig, centerX, y, { align: 'center' });
  y += 4;
  doc.setFontSize(FONT_TINY);
  doc.text('Nome/Assinatura do Representante legal da Organização da Sociedade Civil', centerX, y, { align: 'center' });
  y += 10;

  // === 13. ANEXOS ===
  y = drawSectionTitle(doc, y, '13', 'ANEXOS');
  y = drawInstruction(doc, y,
    'Os documentos de comprovação deverão ser apresentados conforme o cronograma de metas. Fotografias devem conter descrição do evento e data. Quando extensos, é possível inserção por amostragem.'
  );
  const anexos = relatorio.anexos_evidencias || [];
  if (anexos.length === 0) {
    y = drawTextBlock(doc, y, 'Documentos de evidência a serem anexados conforme cronograma de metas.');
  } else {
    doc.setFontSize(FONT_SMALL);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    y += 2;
    for (let i = 0; i < Math.min(anexos.length, 15); i++) {
      const a = anexos[i];
      y = checkPageBreak(doc, y, 6);
      doc.text(`• ${a.atividade_nome || 'Documento'}${a.atividade_data ? ' — ' + fmtDate(a.atividade_data) : ''}${a.meta_nome ? ' — Meta: ' + a.meta_nome : ''}`, M + 2, y + 4);
      y += 6;
    }
  }

  // Rodapé
  drawFooter(doc);

  const mesRef = relatorio.data_inicio ? relatorio.data_inicio.slice(0, 7).replace('-', '_') : 'relatorio';
  doc.save(`Relatorio_Execucao_Objeto_${mesRef}.pdf`);
}