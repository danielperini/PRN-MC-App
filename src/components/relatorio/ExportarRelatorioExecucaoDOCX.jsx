import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, BorderStyle,
  ShadingType, convertInchesToTwip, PageBreak, Header, Footer,
} from 'docx';

function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function txt(v, fallback = '—') {
  const s = String(v || '').trim();
  return s || fallback;
}

function textoSecao(rel, key) {
  const s = rel?.[key];
  if (!s) return '';
  if (typeof s === 'string') return s;
  return s.texto_editado || s.texto_ia || s.texto_interpretativo_editado || s.texto_interpretativo_ia || s.justificativa_editada || s.justificativa_ia || '';
}

// Fetch image URL → ArrayBuffer (CORS best-effort)
async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ── Estilos comuns ────────────────────────────────────────────────────────────

const FONT = 'Arial';
const COLOR_BLACK = '0C0C0C';
const COLOR_WHITE = 'FFFFFF';
const COLOR_DARK = '1A1A2E';
const COLOR_LIGHT_BG = 'F5F5F5';
const COLOR_BLUE_HDR = '142864';

function heading1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: COLOR_WHITE, size: 24, font: FONT })],
    shading: { type: ShadingType.SOLID, color: COLOR_DARK, fill: COLOR_DARK },
    spacing: { before: 200, after: 80 },
    indent: { left: convertInchesToTwip(0.1) },
  });
}

function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: COLOR_BLACK, size: 20, font: FONT })],
    shading: { type: ShadingType.SOLID, color: 'E1E1E1', fill: 'E1E1E1' },
    spacing: { before: 160, after: 60 },
    indent: { left: convertInchesToTwip(0.05) },
  });
}

function normalPara(text, opts = {}) {
  if (!text) return emptyPara();
  return new Paragraph({
    children: [new TextRun({ text: String(text), size: 18, font: FONT, ...opts })],
    spacing: { after: 80 },
  });
}

function emptyPara() {
  return new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 60 } });
}

function boldLabel(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: label + ': ', bold: true, size: 18, font: FONT }),
      new TextRun({ text: txt(value), size: 18, font: FONT }),
    ],
    spacing: { after: 60 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── Tabela genérica ───────────────────────────────────────────────────────────

function makeTable(headers, rows, colWidths) {
  const totalCols = headers.length;
  const pctWidths = colWidths || headers.map(() => Math.floor(100 / totalCols));

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: pctWidths[i], type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLOR_BLUE_HDR, fill: COLOR_BLUE_HDR },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: COLOR_WHITE, size: 16, font: FONT })],
          alignment: AlignmentType.LEFT,
        })],
        borders: allBorders(),
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: { size: pctWidths[ci], type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? COLOR_LIGHT_BG : COLOR_WHITE, fill: ri % 2 === 0 ? COLOR_LIGHT_BG : COLOR_WHITE },
          children: [new Paragraph({
            children: [new TextRun({ text: txt(cell), size: 16, font: FONT })],
          })],
          borders: allBorders(),
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function allBorders(color = 'CCCCCC') {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
}

// ── Seção de fotos ────────────────────────────────────────────────────────────

async function buildFotosParagraphs(relatorio) {
  const paragraphs = [];

  // Coletar fotos de múltiplas fontes
  const galeriaFotos = Array.isArray(relatorio._fotos_galeria) ? relatorio._fotos_galeria : [];
  const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
  const atividades = Array.isArray(relatorio._atividades_periodo) ? relatorio._atividades_periodo : [];

  const urlsVistas = new Set();
  const gruposPorAtividade = new Map();

  for (const foto of galeriaFotos) {
    const url = foto.file_url || foto.url;
    if (!url || urlsVistas.has(url)) continue;
    const nomeAtv = foto.atividade_nome || foto.museu || 'Registro do Projeto';
    if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, []);
    const grupo = gruposPorAtividade.get(nomeAtv);
    if (grupo.length < 4) {
      grupo.push({ url, legenda: foto.legenda || foto.caption || foto.file_name || nomeAtv, data: foto.date || foto.created_date });
      urlsVistas.add(url);
    }
  }

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

  if (gruposPorAtividade.size === 0) {
    for (const atv of atividades.slice(0, 20)) {
      const fotos = Array.isArray(atv.fotos) ? atv.fotos : [];
      if (!fotos.length) continue;
      const nomeAtv = atv.titulo || atv.nome || 'Atividade';
      if (!gruposPorAtividade.has(nomeAtv)) gruposPorAtividade.set(nomeAtv, []);
      const grupo = gruposPorAtividade.get(nomeAtv);
      for (const foto of fotos) {
        const url = foto.file_url || foto.url;
        if (!url || urlsVistas.has(url) || grupo.length >= 4) continue;
        grupo.push({ url, legenda: foto.legenda || foto.caption || nomeAtv });
        urlsVistas.add(url);
      }
    }
  }

  if (gruposPorAtividade.size === 0) return paragraphs;

  paragraphs.push(heading1('14. DEMONSTRATIVO FOTOGRÁFICO — ATIVIDADES REALIZADAS'));
  paragraphs.push(normalPara(
    'Registros fotográficos das atividades executadas no período, conforme orientação SUCC/PBH. Cada foto apresenta descrição da ação e data do registro.',
    { italics: true, color: '555555' }
  ));
  paragraphs.push(emptyPara());

  for (const [nomeAtv, fotos] of gruposPorAtividade.entries()) {
    paragraphs.push(heading2(nomeAtv));

    for (const foto of fotos.slice(0, 4)) {
      const buffer = await fetchImageBuffer(foto.url);
      if (buffer && buffer.byteLength > 100) {
        try {
          // Determinar extensão
          const ext = (foto.url.split('?')[0].split('.').pop() || 'jpeg').toLowerCase();
          const type = ext === 'png' ? 'PNG' : 'JPEG';
          paragraphs.push(new Paragraph({
            children: [
              new ImageRun({
                data: buffer,
                transformation: { width: 300, height: 210 },
                type,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 40 },
          }));
        } catch {
          // imagem inválida — apenas legenda
        }
      }

      // Legenda
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: 'Foto de Registro — ', bold: true, size: 16, font: FONT }),
          new TextRun({ text: txt(foto.legenda), size: 16, font: FONT, italics: true }),
          foto.data ? new TextRun({ text: `  —  ${fmtDate(foto.data)}`, size: 14, font: FONT, color: '888888' }) : new TextRun(''),
        ],
        alignment: AlignmentType.CENTER,
        shading: { type: ShadingType.SOLID, color: 'F0F3FA', fill: 'F0F3FA' },
        spacing: { after: 120 },
      }));
    }
    paragraphs.push(emptyPara());
  }

  return paragraphs;
}

// ── Builder principal ─────────────────────────────────────────────────────────

async function buildDocx(relatorio) {
  const ident = relatorio.identificacao_projeto || {};
  const metas = Array.isArray(relatorio.cronograma_metas) ? relatorio.cronograma_metas : [];
  const equipe = Array.isArray(relatorio.equipe_trabalho) ? relatorio.equipe_trabalho : [];
  const links = Array.isArray(relatorio._links_documentos) ? relatorio._links_documentos : [];
  const rubricas = Array.isArray(relatorio._rubricas_periodo) ? relatorio._rubricas_periodo : [];
  const publico = relatorio.publico_alvo || {};

  const sections = [];

  // ── CAPA / IDENTIFICAÇÃO ────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: 'VIADUTO DAS ARTES — MUSEUS CENTRO', bold: true, size: 32, color: COLOR_WHITE, font: FONT })],
      shading: { type: ShadingType.SOLID, color: COLOR_DARK, fill: COLOR_DARK },
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'RELATÓRIO DE EXECUÇÃO DO OBJETO', bold: true, size: 28, color: COLOR_DARK, font: FONT })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `${relatorio.tipo === 'parcial' ? 'Relatório Parcial' : 'Relatório Final'}  •  Período: ${fmtDate(relatorio.data_inicio)} a ${fmtDate(relatorio.data_fim)}`,
        size: 20, color: '555555', font: FONT,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    emptyPara(),

    heading1('1. TIPO DE RELATÓRIO'),
    boldLabel('Tipo', relatorio.tipo === 'parcial' ? 'Parcial' : 'Final'),
    boldLabel('Período — Início', fmtDate(relatorio.data_inicio)),
    boldLabel('Período — Fim', fmtDate(relatorio.data_fim)),
    emptyPara(),

    heading1('2. IDENTIFICAÇÃO DO PROJETO'),
    boldLabel('Organização (OSC)', txt(ident.organizacao, 'Viaduto das Artes')),
    boldLabel('Nome do Projeto', txt(ident.projeto, 'Museus Centro')),
    boldLabel('Instrumento Jurídico', txt(ident.instrumento_juridico)),
    boldLabel('Processo Administrativo Nº', txt(ident.processo_administrativo)),
    boldLabel('Vigência — Início', fmtDate(ident.vigencia_inicio)),
    boldLabel('Vigência — Fim', fmtDate(ident.vigencia_fim)),
    boldLabel('Responsável pela elaboração', txt(ident.responsavel)),
    boldLabel('Telefone', txt(ident.telefone)),
    boldLabel('E-mail', txt(ident.email)),
    emptyPara(),

    heading1('3. ENDEREÇO DE EXECUÇÃO'),
    normalPara(textoSecao(relatorio, 'endereco_execucao') ||
      'As ações foram executadas presencialmente e em ambiente virtual, com atuação integrada no MHAB, MIS BH e MUMO, além de articulações com a Diretoria de Museus.'),
    emptyPara(),

    heading1('4. DIVULGAÇÃO DA PARCERIA'),
    normalPara(textoSecao(relatorio, 'divulgacao_parceria') ||
      'A parceria foi divulgada por meio de programação pública dos museus, redes sociais, assessoria de imprensa e materiais de sinalização com identificação da marca Museus Centro e do apoio da PBH/SUCC.'),
    emptyPara(),

    heading1('5. DESCRIÇÃO DAS AÇÕES EXECUTADAS'),
    normalPara(textoSecao(relatorio, 'descricao_acoes')),
    emptyPara(),

    heading1('6. PÚBLICO-ALVO'),
    makeTable(
      ['Categoria', 'Previsto', 'Realizado', '% Alcançado'],
      [
        ['Direto', String(publico.previsto_direto || 0), String(publico.realizado_direto || 0), `${publico.percentual_direto || 0}%`],
        ['Indireto', String(publico.previsto_indireto || 0), String(publico.realizado_indireto || 0), `${publico.percentual_indireto || 0}%`],
      ],
      [25, 25, 25, 25]
    ),
    emptyPara(),
    ...(textoSecao(relatorio, 'publico_alvo') ? [normalPara(textoSecao(relatorio, 'publico_alvo'))] : []),

    heading2('6.1. PESQUISA DE SATISFAÇÃO'),
    boldLabel('Realizou pesquisa de satisfação?', relatorio.pesquisa_satisfacao?.possui_dados ? 'Sim' : 'Não'),
    normalPara(textoSecao(relatorio, 'pesquisa_satisfacao') || 'Não foram aplicados formulários de pesquisa de satisfação neste período.'),
    emptyPara(),
  );

  // ── CRONOGRAMA DE METAS ─────────────────────────────────────────────────────
  sections.push(
    pageBreak(),
    heading1('7. CRONOGRAMA DE EXECUÇÃO E CUMPRIMENTO DAS METAS'),
  );

  if (metas.length > 0) {
    sections.push(
      makeTable(
        ['Meta', 'Result. Esperado', 'Ações', 'Período', 'Docs. Verificação', 'Result. Alcançado', 'Status', 'Justificativa'],
        metas.map(m => [
          txt(m.meta_nome),
          txt(m.resultado_esperado),
          txt(m.acoes),
          txt(m.periodo),
          Array.isArray(m.documentos_verificacao) ? m.documentos_verificacao.join(', ') : txt(m.documentos_verificacao),
          txt(m.resultado_alcancado),
          `${txt(m.status_meta)} ${m.percentual_execucao ? '(' + m.percentual_execucao + '%)' : ''}`.trim(),
          txt(m.justificativa),
        ]),
        [14, 13, 13, 10, 12, 13, 12, 13]
      )
    );
  } else {
    sections.push(normalPara('Nenhuma meta registrada para o período selecionado.', { italics: true }));
  }

  sections.push(
    emptyPara(),
    heading2('7.1. LIÇÕES APRENDIDAS'),
    normalPara(textoSecao(relatorio, 'licoes_aprendidas') || textoSecao(relatorio, 'avaliacao_desafios') || ''),
    emptyPara(),
  );

  // ── EQUIPE ──────────────────────────────────────────────────────────────────
  sections.push(
    heading1('8. EQUIPE DE TRABALHO'),
  );
  if (equipe.length > 0) {
    sections.push(
      makeTable(
        ['Nome', 'Cargo', 'Contratação', 'Atribuições', 'Período', 'C.H. Semanal', 'Valor Mensal'],
        equipe.map(m => [
          txt(m.nome), txt(m.cargo), txt(m.tipo_contratacao),
          txt(m.atribuicoes), txt(m.periodo), txt(m.carga_horaria), fmtBRL(m.valor),
        ]),
        [18, 14, 12, 16, 12, 12, 16]
      )
    );
  } else {
    sections.push(normalPara('Nenhum membro de equipe registrado.', { italics: true }));
  }
  sections.push(emptyPara());

  // ── RUBRICAS ────────────────────────────────────────────────────────────────
  if (rubricas.length > 0) {
    sections.push(
      heading2('RUBRICAS ORÇAMENTÁRIAS EXECUTADAS'),
      makeTable(
        ['Rubrica', 'Grupo / Meta', 'Natureza', 'Previsto (R$)', 'Executado (R$)', 'Saldo (R$)', 'NFs'],
        rubricas.map(r => [
          txt(r.rubrica_nome), txt(r.grupo), txt(r.natureza_despesa),
          fmtBRL(r.valor_previsto), fmtBRL(r.total_gasto_periodo),
          fmtBRL(r.saldo || (r.valor_previsto - r.total_gasto_periodo)),
          String(r.num_nfs || 0),
        ]),
        [22, 16, 12, 13, 13, 13, 11]
      ),
      emptyPara(),
    );
  }

  // ── DOCUMENTOS (NFs) ────────────────────────────────────────────────────────
  if (links.length > 0) {
    sections.push(
      heading2('DOCUMENTOS COMPROBATÓRIOS VINCULADOS (NF / XML / Comprovantes)'),
      makeTable(
        ['NF Nº', 'Fornecedor', 'Descrição', 'Valor (R$)', 'Data NF'],
        links.slice(0, 50).map(d => [
          txt(d.nf_numero), txt(d.fornecedor), txt(d.descricao),
          fmtBRL(d.valor), fmtDate(d.data_emissao),
        ]),
        [12, 24, 26, 18, 20]
      ),
      emptyPara(),
    );
  }

  // ── IMPACTOS / SUSTENTABILIDADE / AVALIAÇÃO / ASSINATURA ───────────────────
  sections.push(
    pageBreak(),
    heading1('9. IMPACTOS ECONÔMICOS E/OU SOCIAIS'),
    normalPara(textoSecao(relatorio, 'impactos_economicos_sociais')),
    emptyPara(),

    heading1('10. POSSIBILIDADE DE SUSTENTABILIDADE'),
    normalPara(textoSecao(relatorio, 'sustentabilidade') || (relatorio.tipo === 'parcial' ? '[Campo aplicável apenas ao Relatório Final]' : '')),
    emptyPara(),

    heading1('11. AVALIAÇÃO DA PARCERIA'),
    normalPara(textoSecao(relatorio, 'avaliacao_parceria') || textoSecao(relatorio, 'avaliacao_pontos_positivos')),
    emptyPara(),

    heading1('12. ASSINATURA DO REPRESENTANTE LEGAL'),
    normalPara(
      'Declaro que são verídicas as informações prestadas neste relatório e que os documentos comprobatórios de cumprimento parcial ou total dos resultados desta parceria se encontram arquivados sob a guarda da OSC e permanecem à disposição da administração pública.',
      { italics: true }
    ),
    emptyPara(),
    boldLabel('Responsável', txt(relatorio.assinatura?.nome_representante || ident.responsavel)),
    boldLabel('Cargo', txt(relatorio.assinatura?.cargo)),
    normalPara('Belo Horizonte, _______ de ___________________________ de 20______'),
    emptyPara(),
    normalPara('Assinatura: ______________________________________________'),
    emptyPara(),

    heading1('13. ANEXOS E EVIDÊNCIAS'),
  );

  const anexos = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
  if (anexos.length > 0) {
    for (const a of anexos.slice(0, 30)) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: '• ', bold: true, size: 18, font: FONT }),
            new TextRun({ text: txt(a.atividade_nome, 'Documento'), size: 18, font: FONT }),
            a.atividade_data ? new TextRun({ text: `  —  ${fmtDate(a.atividade_data)}`, size: 16, color: '888888', font: FONT }) : new TextRun(''),
            a.meta_nome ? new TextRun({ text: `  —  Meta: ${a.meta_nome}`, size: 16, color: '555555', font: FONT }) : new TextRun(''),
          ],
          spacing: { after: 60 },
        })
      );
    }
  } else {
    sections.push(normalPara('Documentos de evidência a serem anexados conforme cronograma de metas e atividades realizadas no período.', { italics: true }));
  }

  sections.push(emptyPara());

  // ── GALERIA FOTOGRÁFICA ─────────────────────────────────────────────────────
  const fotoParagraphs = await buildFotosParagraphs(relatorio);
  sections.push(...fotoParagraphs);

  // ── MONTAR DOCUMENTO ────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'Museus Centro App',
    title: `Relatório de Execução do Objeto — ${fmtDate(relatorio.data_inicio)} a ${fmtDate(relatorio.data_fim)}`,
    description: 'Gerado automaticamente pelo sistema Museus Centro',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 18 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'VIADUTO DAS ARTES — MUSEUS CENTRO  ·  Relatório de Execução do Objeto  ·  SUCC/PBH', size: 14, color: '888888', font: FONT }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `Gerado em ${new Date().toLocaleString('pt-BR')}  ·  Projeto Museus Centro  ·  FMC/PBH`, size: 14, color: '999999', font: FONT }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  return doc;
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function exportarRelatorioExecucaoDOCX(relatorio) {
  if (!relatorio) return;
  const doc = await buildDocx(relatorio);
  const blob = await Packer.toBlob(doc);
  const mesRef = (relatorio.data_inicio || '').slice(0, 7).replace('-', '_') || 'relatorio';
  saveAs(blob, `Relatorio_Execucao_Objeto_${mesRef}.docx`);
}