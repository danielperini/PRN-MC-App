import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 42;
const HEADER_HEIGHT = 105;
const FOOTER_HEIGHT = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const PRIMARY = rgb(0.12, 0.11, 0.10);
const BLUE = rgb(0.12, 0.25, 0.47);
const LIGHT = rgb(0.96, 0.97, 0.98);
const BORDER = rgb(0.82, 0.84, 0.87);
const MUTED = rgb(0.38, 0.40, 0.44);

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
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function isValidPdf(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 1200) return false;
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 32)));
  return header === '%PDF-' && tail.includes('%%EOF');
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ['-'];
  const lines: string[] = [];
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
  return lines;
}

function buildFallbackNarrative(report: any) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const totalPublico = atividades.reduce((sum: number, item: any) => sum + Number(item?.publico_total || item?.publico_estimado || 0), 0);
  return {
    titulo: `Relatório Mensal de Atividades Educativas - ${report?.museu || 'Museus Centro'} - ${report?.mes_referencia || ''}/${report?.ano || ''}`,
    introducao: clean(report?.resumo_periodo || report?.resumo_executivo) || `Este relatório apresenta as ações realizadas por ${report?.author_name || 'profissional responsável'} no período informado.`,
    sintese: atividades.length ? `Foram registradas ${atividades.length} atividade(s), com público total informado de ${totalPublico} pessoa(s).` : 'Não há atividades cadastradas neste relatório.',
    conclusao: clean(report?.comentarios_gerais || report?.avaliacao_pontos_positivos || report?.avaliacao_desafios) || 'O relatório consolida os registros do período e as evidências vinculadas às atividades.',
  };
}

async function generateNarrativeWithAI(base44: any, report: any) {
  const fallback = buildFallbackNarrative(report);
  try {
    const atividades = (Array.isArray(report?.atividades) ? report.atividades : []).map((item: any) => ({
      nome: item?.nome || item?.titulo || '',
      descricao: item?.descricao || '',
      museu: item?.museu_lista || item?.museu || '',
      tipo: item?.tipo_acao_lista || item?.tipo_acao || item?.tipo || '',
      data: item?.data_realizacao || item?.data_inicio || '',
      publico: item?.publico_total || item?.publico_estimado || 0,
      ocorrencias: item?.quantas_vezes_ocorreu || item?.quantidade_ocorrencias || 1,
    }));

    const result = await invokeLLM(base44,{
      prompt: `Redija um relatório executivo mensal institucional em português do Brasil. Use apenas os dados fornecidos, não invente fatos, nomes, números ou parcerias. Gere título, introdução, síntese e conclusão.\n\nDADOS:\n${JSON.stringify({
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
    console.warn('IA indisponível; usando conteúdo original.', error);
    return fallback;
  }
}

function resolveDriveImageCandidates(rawUrl: string, photo: any): string[] {
  const urls = [clean(photo?.thumbnail_url || photo?.thumbnailLink), clean(rawUrl)].filter(Boolean);
  const match = clean(rawUrl).match(/\/file\/d\/([^/?#]+)/i) || clean(rawUrl).match(/[?&]id=([^&#]+)/i);
  const driveId = clean(photo?.drive_file_id || photo?.google_drive_file_id || match?.[1]);
  if (driveId) {
    urls.unshift(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`);
    urls.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w1600`);
  }
  return [...new Set(urls)];
}

async function fetchImage(photo: any): Promise<{ bytes: Uint8Array; type: string } | null> {
  const rawUrl = clean(photo?.file_url || photo?.url || photo?.src || photo?.link);
  for (const url of resolveDriveImageCandidates(rawUrl, photo)) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const type = response.headers.get('content-type') || '';
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || (!type.includes('image') && bytes.length < 1000)) continue;
      return { bytes, type };
    } catch {
      // tenta próximo candidato
    }
  }
  return null;
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

    let page: any;
    let y = 0;

    const drawHeader = (target: any) => {
      target.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: rgb(1, 1, 1) });
      target.drawRectangle({ x: 0, y: PAGE_HEIGHT - 98, width: 98, height: 98, color: PRIMARY });
      target.drawText('VIA', { x: 15, y: PAGE_HEIGHT - 35, size: 28, font: bold, color: rgb(1, 1, 1) });
      target.drawText('DU', { x: 15, y: PAGE_HEIGHT - 62, size: 28, font: bold, color: rgb(1, 1, 1) });
      target.drawText('TO', { x: 15, y: PAGE_HEIGHT - 89, size: 28, font: bold, color: rgb(1, 1, 1) });
      target.drawText('DAS ARTES', { x: 73, y: PAGE_HEIGHT - 88, size: 8, font: bold, color: rgb(1, 1, 1), rotate: { type: 'degrees', angle: 90 } as any });
      target.drawText('Viaduto das Artes - Fundado em 16 de junho de 2015', { x: 267, y: PAGE_HEIGHT - 43, size: 10.5, font: regular, color: PRIMARY });
      target.drawText('Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG', { x: 267, y: PAGE_HEIGHT - 60, size: 10.5, font: regular, color: PRIMARY });
      target.drawText('CEP 30640-010 - E-mail: viadutodasartes@gmail.com', { x: 267, y: PAGE_HEIGHT - 77, size: 10.5, font: regular, color: PRIMARY });
      target.drawLine({ start: { x: 120, y: PAGE_HEIGHT - 96 }, end: { x: PAGE_WIDTH - 22, y: PAGE_HEIGHT - 96 }, thickness: 0.8, color: PRIMARY });
    };

    const addPage = () => {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawHeader(page);
      y = PAGE_HEIGHT - HEADER_HEIGHT - 20;
    };

    const ensure = (height: number) => {
      if (y - height < FOOTER_HEIGHT + 20) addPage();
    };

    const drawWrapped = (text: string, options: { x?: number; width?: number; size?: number; font?: any; color?: any; gap?: number; lineHeight?: number } = {}) => {
      const x = options.x ?? MARGIN_X;
      const width = options.width ?? CONTENT_WIDTH;
      const size = options.size ?? 9.5;
      const font = options.font ?? regular;
      const color = options.color ?? PRIMARY;
      const lineHeight = options.lineHeight ?? size * 1.35;
      const lines = wrapText(text, font, size, width);
      ensure(lines.length * lineHeight + (options.gap ?? 5));
      for (const line of lines) {
        page.drawText(line, { x, y, size, font, color });
        y -= lineHeight;
      }
      y -= options.gap ?? 5;
    };

    const section = (title: string) => {
      ensure(38);
      page.drawRectangle({ x: MARGIN_X, y: y - 3, width: CONTENT_WIDTH, height: 23, color: BLUE });
      page.drawText(title, { x: MARGIN_X + 9, y: y + 3, size: 10.5, font: bold, color: rgb(1, 1, 1) });
      y -= 34;
    };

    const drawLabelValue = (label: string, value: unknown, x: number, width: number) => {
      const labelWidth = Math.min(115, width * 0.42);
      page.drawText(`${label}:`, { x, y, size: 9, font: bold, color: PRIMARY });
      const lines = wrapText(clean(value) || '-', regular, 9, width - labelWidth);
      lines.forEach((line, index) => page.drawText(line, { x: x + labelWidth, y: y - index * 12, size: 9, font: regular, color: PRIMARY }));
      y -= Math.max(13, lines.length * 12);
    };

    const drawPhoto = async (photo: any, maxWidth: number, maxHeight: number, x: number) => {
      const loaded = await fetchImage(photo);
      if (!loaded) return false;
      try {
        let image: any;
        if (loaded.type.includes('png')) image = await pdf.embedPng(loaded.bytes);
        else image = await pdf.embedJpg(loaded.bytes);
        const scaled = image.scaleToFit(maxWidth, maxHeight);
        ensure(scaled.height + 26);
        page.drawImage(image, { x, y: y - scaled.height, width: scaled.width, height: scaled.height });
        y -= scaled.height + 5;
        const caption = clean(photo?.caption || photo?.legenda || photo?.descricao || photo?.fileName || photo?.file_name);
        if (caption) drawWrapped(caption, { x, width: maxWidth, size: 7.5, color: MUTED, gap: 7 });
        return true;
      } catch {
        return false;
      }
    };

    addPage();
    drawWrapped('MUSEUS CENTRO', { size: 18, font: bold, color: BLUE, gap: 5 });
    drawWrapped(narrative.titulo, { size: 13.5, font: bold, gap: 8 });
    drawWrapped(`Protocolo: ${report.numero_protocolo || '-'} | Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, { size: 8.5, color: MUTED, gap: 14 });

    section('IDENTIFICAÇÃO DO RELATÓRIO');
    page.drawRectangle({ x: MARGIN_X, y: y - 112, width: CONTENT_WIDTH, height: 116, color: LIGHT, borderColor: BORDER, borderWidth: 0.8 });
    y -= 15;
    const leftX = MARGIN_X + 12;
    const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 5;
    const colWidth = CONTENT_WIDTH / 2 - 22;
    const startY = y;
    drawLabelValue('Profissional', report.author_name, leftX, colWidth);
    drawLabelValue('Função', report.funcao, leftX, colWidth);
    drawLabelValue('Equipe', report.equipe, leftX, colWidth);
    drawLabelValue('Museu', report.museu, leftX, colWidth);
    y = startY;
    drawLabelValue('Museu secundário', report.museu_secundario, rightX, colWidth);
    drawLabelValue('Período', `${report.mes_referencia || '-'} / ${report.ano || '-'}`, rightX, colWidth);
    drawLabelValue('Status', statusLabel(report.status), rightX, colWidth);
    drawLabelValue('Público geral', report.publico_geral_declarado, rightX, colWidth);
    y = startY - 108;

    section('APRESENTAÇÃO DO PERÍODO');
    drawWrapped(narrative.introducao, { size: 9.5, gap: 7 });
    drawWrapped(narrative.sintese, { size: 9.5, gap: 12 });

    const atividades = Array.isArray(report.atividades) ? report.atividades : [];
    section('ATIVIDADES REALIZADAS');
    if (!atividades.length) drawWrapped('Nenhuma atividade foi cadastrada no período.');

    for (let index = 0; index < atividades.length; index += 1) {
      const activity = atividades[index] || {};
      ensure(150);
      const cardTop = y;
      page.drawRectangle({ x: MARGIN_X, y: y - 26, width: CONTENT_WIDTH, height: 28, color: LIGHT, borderColor: BORDER, borderWidth: 0.8 });
      page.drawText(`${index + 1}. ${clean(activity.nome || activity.titulo) || 'Atividade sem título'}`, { x: MARGIN_X + 10, y: y - 9, size: 11, font: bold, color: BLUE });
      y -= 39;

      const activityFields = [
        ['Classificação', activity.classificacao],
        ['Museu/Local', list(activity.museu_lista || activity.museu).join(', ')],
        ['Tipo de ação', list(activity.tipo_acao_lista || activity.tipo_acao || activity.tipo).join(', ')],
        ['Data inicial', activity.data_realizacao || activity.data_inicio],
        ['Data final', activity.data_fim],
        ['Público total', activity.publico_total || activity.publico_estimado || 0],
        ['Público médio', activity.publico_medio_sessao || 0],
        ['Ocorrências', activity.quantas_vezes_ocorreu || activity.quantidade_ocorrencias || 1],
        ['Quantidade de produtos', activity.quantidade_produtos || 0],
        ['Total de produtos', activity.total_produtos || 0],
        ['Meta', activity.meta_codigo || activity.meta_id || list(activity.meta_vinculada_ids).join(', ')],
      ];

      for (let i = 0; i < activityFields.length; i += 2) {
        ensure(18);
        const [labelA, valueA] = activityFields[i];
        const [labelB, valueB] = activityFields[i + 1] || ['', ''];
        page.drawText(`${labelA}:`, { x: MARGIN_X + 10, y, size: 8.5, font: bold, color: PRIMARY });
        page.drawText(clean(valueA) || '-', { x: MARGIN_X + 100, y, size: 8.5, font: regular, color: PRIMARY });
        if (labelB) {
          page.drawText(`${labelB}:`, { x: MARGIN_X + CONTENT_WIDTH / 2 + 2, y, size: 8.5, font: bold, color: PRIMARY });
          page.drawText(clean(valueB) || '-', { x: MARGIN_X + CONTENT_WIDTH / 2 + 88, y, size: 8.5, font: regular, color: PRIMARY });
        }
        y -= 14;
      }

      if (activity.descricao) {
        y -= 2;
        drawWrapped(`Descrição: ${activity.descricao}`, { x: MARGIN_X + 10, width: CONTENT_WIDTH - 20, size: 8.8, gap: 8 });
      }

      const activityPhotos = Array.isArray(activity.fotos) ? activity.fotos : [];
      if (activityPhotos.length) {
        drawWrapped('Evidências fotográficas da atividade', { x: MARGIN_X + 10, width: CONTENT_WIDTH - 20, size: 9, font: bold, color: BLUE, gap: 7 });
        for (const photo of activityPhotos.slice(0, 3)) {
          await drawPhoto(photo, CONTENT_WIDTH - 20, 245, MARGIN_X + 10);
        }
      }

      page.drawLine({ start: { x: MARGIN_X, y: y + 3 }, end: { x: MARGIN_X + CONTENT_WIDTH, y: y + 3 }, thickness: 0.6, color: BORDER });
      y -= 16;
      if (cardTop === y) y -= 10;
    }

    const reportPhotos = Array.isArray(report.fotos) ? report.fotos : [];
    if (reportPhotos.length) {
      section('REGISTRO FOTOGRÁFICO GERAL');
      for (const photo of reportPhotos.slice(0, 20)) {
        await drawPhoto(photo, CONTENT_WIDTH, 300, MARGIN_X);
      }
    }

    section('AVALIAÇÃO E CONSIDERAÇÕES FINAIS');
    if (report.avaliacao_pontos_positivos) drawWrapped(`Pontos positivos: ${report.avaliacao_pontos_positivos}`, { size: 9.5 });
    if (report.avaliacao_desafios) drawWrapped(`Desafios: ${report.avaliacao_desafios}`, { size: 9.5 });
    if (report.avaliacao_sugestoes) drawWrapped(`Sugestões: ${report.avaliacao_sugestoes}`, { size: 9.5 });
    if (report.comentarios_gerais) drawWrapped(`Comentários gerais: ${report.comentarios_gerais}`, { size: 9.5 });
    drawWrapped(narrative.conclusao, { size: 9.5, gap: 14 });

    ensure(75);
    y -= 12;
    page.drawLine({ start: { x: MARGIN_X, y }, end: { x: MARGIN_X + 250, y }, thickness: 0.8, color: PRIMARY });
    y -= 18;
    drawWrapped(report.author_name || 'Profissional responsável', { size: 9.5, font: bold, gap: 1 });
    drawWrapped(`Profissional responsável — ${report.mes_referencia || ''}/${report.ano || ''}`, { size: 8.5, color: MUTED });

    const pages = pdf.getPages();
    pages.forEach((currentPage, index) => {
      currentPage.drawLine({ start: { x: MARGIN_X, y: 28 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 28 }, thickness: 0.5, color: BORDER });
      currentPage.drawText(`Relatório Mensal - ${report.museu || 'Museus Centro'} - ${report.mes_referencia || ''}/${report.ano || ''}`, { x: MARGIN_X, y: 15, size: 7.5, font: regular, color: MUTED });
      currentPage.drawText(`Página ${index + 1} de ${pages.length}`, { x: PAGE_WIDTH - MARGIN_X - 58, y: 15, size: 7.5, font: regular, color: MUTED });
    });

    const pdfBytes = await pdf.save();
    if (!isValidPdf(pdfBytes) || pdf.getPageCount() < 1) throw new Error('O PDF gerado ficou vazio ou inválido.');

    const filename = safeFilename(`Relatorio-Mensal-${report.museu || 'Museus-Centro'}-${report.mes_referencia || ''}-${report.ano || ''}.pdf`);
    return Response.json({
      success: true,
      pdf_gerado: true,
      pdf_base64: bytesToBase64(pdfBytes),
      mime_type: 'application/pdf',
      filename,
      size_bytes: pdfBytes.length,
      page_count: pdf.getPageCount(),
      ai_narrative: true,
      header_institucional: true,
      fotos_por_atividade: true,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Erro ao gerar relatório mensal em PDF:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Erro interno ao gerar relatório e PDF.', pdf_gerado: false }, { status: 500 });
  }
});
