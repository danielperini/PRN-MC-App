import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 42;
const HEADER_HEIGHT = 105;
const FOOTER_HEIGHT = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const PRIMARY = rgb(0.12, 0.11, 0.10);
const BLUE = rgb(0.12, 0.25, 0.47);
const BORDER = rgb(0.82, 0.84, 0.87);
const MUTED = rgb(0.38, 0.40, 0.44);

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = clean(value).replace(/^data:application\/pdf;base64,/i, '').replace(/\s/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function findPdfPayload(value: any, depth = 0): any {
  if (!value || depth > 8) return null;
  if (typeof value === 'string') {
    try {
      return findPdfPayload(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object') return null;
  if (typeof value.pdf_base64 === 'string') return value;
  for (const key of ['data', 'result', 'body', 'payload', 'response']) {
    const found = findPdfPayload(value[key], depth + 1);
    if (found) return found;
  }
  return null;
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

function photoUrl(photo: any): string {
  return clean(photo?.file_url || photo?.url || photo?.src || photo?.link || photo?.arquivo_url);
}

function photoIdentity(photo: any): string {
  return clean(photo?.id || photo?.drive_file_id || photo?.google_drive_file_id || photoUrl(photo) || photo?.file_name || photo?.fileName);
}

function captionFor(photo: any, activityTitle: string, index: number): string {
  return clean(photo?.caption || photo?.legenda || photo?.descricao || photo?.description || photo?.fileName || photo?.file_name)
    || `${activityTitle} — Foto ${index + 1}`;
}

function resolveDriveImageCandidates(photo: any): string[] {
  const rawUrl = photoUrl(photo);
  const urls = [clean(photo?.thumbnail_url || photo?.thumbnailLink), rawUrl].filter(Boolean);
  const match = rawUrl.match(/\/file\/d\/([^/?#]+)/i) || rawUrl.match(/[?&]id=([^&#]+)/i);
  const driveId = clean(photo?.drive_file_id || photo?.google_drive_file_id || match?.[1]);
  if (driveId) {
    urls.unshift(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`);
    urls.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w1600`);
  }
  return [...new Set(urls)];
}

async function fetchImage(photo: any): Promise<{ bytes: Uint8Array; type: string } | null> {
  for (const url of resolveDriveImageCandidates(photo)) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const type = response.headers.get('content-type') || '';
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || (!type.includes('image') && bytes.length < 1000)) continue;
      return { bytes, type };
    } catch {
      // tenta o próximo endereço disponível
    }
  }
  return null;
}

function photosForActivity(activity: any, reportPhotos: any[]): any[] {
  const activityId = clean(activity?.id || activity?._id);
  const own = Array.isArray(activity?.fotos) ? activity.fotos : [];
  const linked = reportPhotos.filter((photo: any) => {
    const linkedId = clean(photo?.activityId || photo?.activity_id || photo?.atividade_id || photo?.atividadeId);
    return activityId && linkedId === activityId;
  });

  const unique = new Map<string, any>();
  [...own, ...linked].forEach((photo) => {
    const identity = photoIdentity(photo);
    if (identity && !unique.has(identity)) unique.set(identity, photo);
  });
  return [...unique.values()].slice(0, 3);
}

Deno.serve(async (request) => {
  try {
    const base44 = createClientFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const reportId = clean(body?.reportId);
    if (!reportId) return Response.json({ success: false, error: 'reportId é obrigatório' }, { status: 400 });

    const [report, originalResponse] = await Promise.all([
      base44.entities.Report.get(reportId),
      base44.functions.invoke('generateReportPDF', body),
    ]);

    if (!report) return Response.json({ success: false, error: 'Relatório não encontrado' }, { status: 404 });

    const originalPayload = findPdfPayload(originalResponse);
    if (!originalPayload?.pdf_base64) {
      return Response.json({
        success: false,
        error: originalResponse?.data?.error || originalResponse?.error || 'A geração principal não retornou um PDF válido.',
      }, { status: 500 });
    }

    const pdf = await PDFDocument.load(base64ToBytes(originalPayload.pdf_base64));
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
    const reportPhotos = Array.isArray(report?.fotos) ? report.fotos : [];
    const activitiesWithPhotos = atividades
      .map((activity: any) => ({ activity, photos: photosForActivity(activity, reportPhotos) }))
      .filter((item: any) => item.photos.length > 0);

    if (activitiesWithPhotos.length) {
      let page: any;
      let y = 0;

      const drawHeader = (target: any) => {
        target.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: rgb(1, 1, 1) });
        target.drawRectangle({ x: 0, y: PAGE_HEIGHT - 98, width: 98, height: 98, color: PRIMARY });
        target.drawText('VIA', { x: 15, y: PAGE_HEIGHT - 35, size: 28, font: bold, color: rgb(1, 1, 1) });
        target.drawText('DU', { x: 15, y: PAGE_HEIGHT - 62, size: 28, font: bold, color: rgb(1, 1, 1) });
        target.drawText('TO', { x: 15, y: PAGE_HEIGHT - 89, size: 28, font: bold, color: rgb(1, 1, 1) });
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
        if (y - height < FOOTER_HEIGHT + 24) addPage();
      };

      const drawWrapped = (text: string, options: { x?: number; width?: number; size?: number; font?: any; color?: any; gap?: number } = {}) => {
        const x = options.x ?? MARGIN_X;
        const width = options.width ?? CONTENT_WIDTH;
        const size = options.size ?? 9;
        const font = options.font ?? regular;
        const color = options.color ?? PRIMARY;
        const lines = wrapText(text, font, size, width);
        const lineHeight = size * 1.35;
        ensure(lines.length * lineHeight + (options.gap ?? 5));
        for (const line of lines) {
          page.drawText(line, { x, y, size, font, color });
          y -= lineHeight;
        }
        y -= options.gap ?? 5;
      };

      addPage();
      page.drawRectangle({ x: MARGIN_X, y: y - 3, width: CONTENT_WIDTH, height: 23, color: BLUE });
      page.drawText('FOTOS DAS ATIVIDADES', { x: MARGIN_X + 9, y: y + 3, size: 10.5, font: bold, color: rgb(1, 1, 1) });
      y -= 38;
      drawWrapped('Seleção de até três registros fotográficos por atividade, com identificação e legenda.', { size: 9, color: MUTED, gap: 14 });

      for (let activityIndex = 0; activityIndex < activitiesWithPhotos.length; activityIndex += 1) {
        const { activity, photos } = activitiesWithPhotos[activityIndex];
        const title = clean(activity?.nome || activity?.titulo) || `Atividade ${activityIndex + 1}`;
        ensure(75);
        page.drawRectangle({ x: MARGIN_X, y: y - 24, width: CONTENT_WIDTH, height: 26, color: rgb(0.96, 0.97, 0.98), borderColor: BORDER, borderWidth: 0.8 });
        page.drawText(`${activityIndex + 1}. ${title}`, { x: MARGIN_X + 10, y: y - 8, size: 10.5, font: bold, color: BLUE });
        y -= 38;

        for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
          const photo = photos[photoIndex];
          const loaded = await fetchImage(photo);
          if (!loaded) continue;
          try {
            const image = loaded.type.includes('png') ? await pdf.embedPng(loaded.bytes) : await pdf.embedJpg(loaded.bytes);
            const scaled = image.scaleToFit(CONTENT_WIDTH, 290);
            const caption = captionFor(photo, title, photoIndex);
            const captionLines = wrapText(caption, regular, 8, CONTENT_WIDTH);
            ensure(scaled.height + captionLines.length * 11 + 24);
            page.drawImage(image, {
              x: MARGIN_X + (CONTENT_WIDTH - scaled.width) / 2,
              y: y - scaled.height,
              width: scaled.width,
              height: scaled.height,
            });
            y -= scaled.height + 7;
            drawWrapped(`Foto ${photoIndex + 1}: ${caption}`, { size: 8, color: MUTED, gap: 12 });
          } catch {
            // uma imagem incompatível não interrompe a geração do relatório
          }
        }

        page.drawLine({ start: { x: MARGIN_X, y: y + 3 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y + 3 }, thickness: 0.6, color: BORDER });
        y -= 18;
      }
    }

    const pages = pdf.getPages();
    pages.forEach((currentPage, index) => {
      currentPage.drawLine({ start: { x: MARGIN_X, y: 28 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 28 }, thickness: 0.5, color: BORDER });
      currentPage.drawText(`Relatório Mensal - ${report.museu || 'Museus Centro'} - ${report.mes_referencia || ''}/${report.ano || ''}`, { x: MARGIN_X, y: 15, size: 7.5, font: regular, color: MUTED });
      currentPage.drawText(`Página ${index + 1} de ${pages.length}`, { x: PAGE_WIDTH - MARGIN_X - 58, y: 15, size: 7.5, font: regular, color: MUTED });
    });

    const pdfBytes = await pdf.save();
    const header = String.fromCharCode(...pdfBytes.subarray(0, 5));
    if (header !== '%PDF-' || pdfBytes.length < 1200) {
      throw new Error('O PDF final ficou inválido.');
    }

    return Response.json({
      success: true,
      pdf_gerado: true,
      pdf_base64: bytesToBase64(pdfBytes),
      mime_type: 'application/pdf',
      filename: originalPayload.filename || `Relatorio-Mensal-${report.museu || 'Museus-Centro'}-${report.mes_referencia || ''}-${report.ano || ''}.pdf`,
      size_bytes: pdfBytes.length,
      page_count: pdf.getPageCount(),
      fotos_por_atividade_final: true,
      limite_fotos_por_atividade: 3,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Erro ao acrescentar galeria final das atividades:', error);
    return Response.json({
      success: false,
      pdf_gerado: false,
      error: error instanceof Error ? error.message : 'Erro interno ao gerar a galeria final das atividades.',
    }, { status: 500 });
  }
});
