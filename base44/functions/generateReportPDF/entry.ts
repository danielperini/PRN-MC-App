import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado para revisão',
  IN_REVIEW: 'Em revisão',
  RETURNED: 'Devolvido para correção',
  APPROVED: 'Aprovado',
  ARCHIVED: 'Arquivado',
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? [text] : [];
}

function statusLabel(value: unknown): string {
  const key = clean(value).toUpperCase();
  return STATUS_LABELS[key] || clean(value) || 'Não informado';
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const paragraphs = String(text || '').split(/\n+/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function buildFallbackNarrative(report: any) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const totalPublico = atividades.reduce((sum: number, item: any) => sum + Number(item?.publico_total || item?.publico_estimado || 0), 0);
  return {
    titulo: `Relatório Executivo Mensal — ${report?.mes_referencia || ''} ${report?.ano || ''}`.trim(),
    introducao: clean(report?.resumo_periodo || report?.resumo_executivo) || `Relatório mensal das atividades realizadas por ${report?.author_name || 'profissional responsável'} no ${report?.museu || 'Museus Centro'}.`,
    sintese: atividades.length
      ? `Foram registradas ${atividades.length} atividade(s), com público total informado de ${totalPublico} pessoa(s).`
      : 'Não há atividades cadastradas neste relatório.',
    conclusao: clean(report?.comentarios_gerais || report?.avaliacao_pontos_positivos || report?.avaliacao_desafios) || 'O relatório consolida as informações registradas no período, preservando os dados originais e as evidências anexadas.',
  };
}

async function generateNarrativeWithAI(base44: any, report: any) {
  const fallback = buildFallbackNarrative(report);
  try {
    const atividades = (Array.isArray(report?.atividades) ? report.atividades : []).map((item: any) => ({
      nome: item?.nome || item?.titulo || '',
      descricao: item?.descricao || '',
      museus: item?.museu_lista || item?.museu || '',
      tipo: item?.tipo_acao_lista || item?.tipo_acao || item?.tipo || '',
      publico: item?.publico_total || item?.publico_estimado || 0,
      ocorrencias: item?.quantas_vezes_ocorreu || item?.quantidade_ocorrencias || 1,
    }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Redija um relatório executivo mensal institucional em português do Brasil, objetivo, fiel aos dados e sem inventar informações.\n\nDADOS DO RELATÓRIO:\n${JSON.stringify({
        profissional: report?.author_name,
        funcao: report?.funcao,
        museu: report?.museu,
        equipe: report?.equipe,
        mes: report?.mes_referencia,
        ano: report?.ano,
        resumo_periodo: report?.resumo_periodo,
        resumo_executivo: report?.resumo_executivo,
        pontos_positivos: report?.avaliacao_pontos_positivos,
        desafios: report?.avaliacao_desafios,
        sugestoes: report?.avaliacao_sugestoes,
        comentarios: report?.comentarios_gerais,
        atividades,
      })}`,
      response_json_schema: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          introducao: { type: 'string' },
          sintese: { type: 'string' },
          conclusao: { type: 'string' },
        },
        required: ['titulo', 'introducao', 'sintese', 'conclusao'],
      },
    });

    const parsed = result?.data || result;
    return {
      titulo: clean(parsed?.titulo) || fallback.titulo,
      introducao: clean(parsed?.introducao) || fallback.introducao,
      sintese: clean(parsed?.sintese) || fallback.sintese,
      conclusao: clean(parsed?.conclusao) || fallback.conclusao,
    };
  } catch (error) {
    console.warn('IA indisponível; usando conteúdo original do relatório.', error);
    return fallback;
  }
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  try {
    const base44 = createClientFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const reportId = clean(body?.reportId);
    if (!reportId) return Response.json({ error: 'reportId é obrigatório' }, { status: 400 });

    const report = await base44.entities.Report.get(reportId);
    if (!report) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const narrative = await generateNarrativeWithAI(base44, report);
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const addPage = () => {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    };

    const ensure = (height: number) => {
      if (y - height < MARGIN) addPage();
    };

    const drawText = (text: string, options: { size?: number; font?: any; color?: any; gap?: number } = {}) => {
      const size = options.size || 10;
      const font = options.font || regular;
      const color = options.color || rgb(0.12, 0.12, 0.12);
      const lines = wrapText(clean(text), font, size, CONTENT_WIDTH);
      const lineHeight = size * 1.35;
      ensure(Math.max(lineHeight, lines.length * lineHeight));
      for (const line of lines) {
        page.drawText(line || ' ', { x: MARGIN, y, size, font, color });
        y -= lineHeight;
      }
      y -= options.gap ?? 5;
    };

    const section = (title: string) => {
      ensure(34);
      page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 22, color: rgb(0.12, 0.25, 0.47) });
      page.drawText(title, { x: MARGIN + 8, y: y + 2, size: 11, font: bold, color: rgb(1, 1, 1) });
      y -= 32;
    };

    page.drawText('MUSEUS CENTRO', { x: MARGIN, y, size: 20, font: bold, color: rgb(0.12, 0.25, 0.47) });
    y -= 28;
    drawText(narrative.titulo, { size: 14, font: bold, gap: 10 });
    drawText(`Protocolo: ${report.numero_protocolo || '-'} | Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, { size: 9, color: rgb(0.35, 0.35, 0.35), gap: 14 });

    section('IDENTIFICAÇÃO DO RELATÓRIO');
    const fields = [
      ['Profissional', report.author_name],
      ['Função', report.funcao],
      ['Museu', report.museu],
      ['Museu secundário', report.museu_secundario],
      ['Equipe', report.equipe],
      ['Período', `${report.mes_referencia || '-'} / ${report.ano || '-'}`],
      ['Status', statusLabel(report.status)],
      ['Público geral declarado', report.publico_geral_declarado],
    ];
    for (const [label, value] of fields) drawText(`${label}: ${clean(value) || '-'}`, { size: 10, gap: 1 });
    y -= 6;

    section('APRESENTAÇÃO DO PERÍODO');
    drawText(narrative.introducao, { size: 10 });
    drawText(narrative.sintese, { size: 10 });

    const atividades = Array.isArray(report.atividades) ? report.atividades : [];
    section('ATIVIDADES REALIZADAS');
    if (!atividades.length) drawText('Nenhuma atividade foi cadastrada no período.', { size: 10 });

    for (let index = 0; index < atividades.length; index += 1) {
      const activity = atividades[index] || {};
      ensure(90);
      drawText(`${index + 1}. ${activity.nome || activity.titulo || 'Atividade sem título'}`, { size: 12, font: bold, color: rgb(0.12, 0.25, 0.47), gap: 4 });
      const activityFields = [
        ['Classificação', activity.classificacao],
        ['Museu/Local', list(activity.museu_lista || activity.museu).join(', ')],
        ['Tipo de ação', list(activity.tipo_acao_lista || activity.tipo_acao || activity.tipo).join(', ')],
        ['Data', activity.data_realizacao || activity.data_inicio],
        ['Público total', activity.publico_total || activity.publico_estimado || 0],
        ['Ocorrências', activity.quantas_vezes_ocorreu || activity.quantidade_ocorrencias || 1],
      ];
      for (const [label, value] of activityFields) drawText(`${label}: ${clean(value) || '-'}`, { size: 9, gap: 0 });
      if (activity.descricao) drawText(`Descrição: ${activity.descricao}`, { size: 9, gap: 6 });

      const activityPhotos = Array.isArray(activity.fotos) ? activity.fotos : [];
      for (const photo of activityPhotos.slice(0, 4)) {
        const url = clean(photo?.file_url || photo?.url || photo?.src);
        if (!url) continue;
        const loaded = await fetchImage(url);
        if (!loaded) continue;
        try {
          const image = loaded.type.includes('png') ? await pdf.embedPng(loaded.bytes) : await pdf.embedJpg(loaded.bytes);
          const scaled = image.scaleToFit(CONTENT_WIDTH, 230);
          ensure(scaled.height + 28);
          page.drawImage(image, { x: MARGIN, y: y - scaled.height, width: scaled.width, height: scaled.height });
          y -= scaled.height + 5;
          if (photo?.caption || photo?.legenda) drawText(`Foto: ${photo.caption || photo.legenda}`, { size: 8, color: rgb(0.35, 0.35, 0.35), gap: 6 });
        } catch {
          // Imagem incompatível não interrompe o relatório.
        }
      }
      y -= 8;
    }

    const reportPhotos = Array.isArray(report.fotos) ? report.fotos : [];
    if (reportPhotos.length) {
      section('REGISTRO FOTOGRÁFICO');
      for (const photo of reportPhotos.slice(0, 20)) {
        const url = clean(photo?.file_url || photo?.url || photo?.src);
        if (!url) continue;
        const loaded = await fetchImage(url);
        if (!loaded) continue;
        try {
          const image = loaded.type.includes('png') ? await pdf.embedPng(loaded.bytes) : await pdf.embedJpg(loaded.bytes);
          const scaled = image.scaleToFit(CONTENT_WIDTH, 300);
          ensure(scaled.height + 30);
          page.drawImage(image, { x: MARGIN, y: y - scaled.height, width: scaled.width, height: scaled.height });
          y -= scaled.height + 5;
          drawText(clean(photo?.caption || photo?.legenda || photo?.fileName || photo?.file_name || 'Registro fotográfico'), { size: 8, color: rgb(0.35, 0.35, 0.35), gap: 10 });
        } catch {
          // Preserva a geração mesmo quando uma foto específica falhar.
        }
      }
    }

    section('AVALIAÇÃO E CONSIDERAÇÕES FINAIS');
    if (report.avaliacao_pontos_positivos) drawText(`Pontos positivos: ${report.avaliacao_pontos_positivos}`, { size: 10 });
    if (report.avaliacao_desafios) drawText(`Desafios: ${report.avaliacao_desafios}`, { size: 10 });
    if (report.avaliacao_sugestoes) drawText(`Sugestões: ${report.avaliacao_sugestoes}`, { size: 10 });
    if (report.comentarios_gerais) drawText(`Comentários gerais: ${report.comentarios_gerais}`, { size: 10 });
    drawText(narrative.conclusao, { size: 10 });

    ensure(70);
    y -= 18;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 250, y }, thickness: 0.8, color: rgb(0.25, 0.25, 0.25) });
    y -= 18;
    drawText(report.author_name || 'Profissional responsável', { size: 10, font: bold, gap: 0 });
    drawText(`Profissional responsável — ${report.mes_referencia || ''}/${report.ano || ''}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });

    const pages = pdf.getPages();
    for (let index = 0; index < pages.length; index += 1) {
      pages[index].drawText(`Página ${index + 1} de ${pages.length}`, { x: PAGE_WIDTH / 2 - 25, y: 20, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });
    }

    const pdfBytes = await pdf.save();
    if (!pdfBytes || pdfBytes.length < 1200 || pdf.getPageCount() < 1) {
      throw new Error('O PDF gerado ficou vazio ou inválido.');
    }

    const filename = safeFilename(`Relatorio-Mensal-${report.museu || 'Museus-Centro'}-${report.mes_referencia || ''}-${report.ano || ''}.pdf`);
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'no-store',
        'X-Report-AI': 'enabled-with-deterministic-fallback',
      },
    });
  } catch (error) {
    console.error('Erro ao gerar relatório mensal em PDF:', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Erro interno ao gerar relatório e PDF.',
      pdf_gerado: false,
    }, { status: 500 });
  }
});
