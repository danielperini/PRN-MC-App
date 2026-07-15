import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsPDF } from 'npm:jspdf@4.0.0';

const FONT_REGULAR_URL = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
const FONT_BOLD_URL = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf';
const PAGE_MARGIN = 15;
const LINE_HEIGHT = 5.2;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado para revisão',
  IN_REVIEW: 'Em revisão',
  RETURNED: 'Devolvido para correção',
  APPROVED: 'Aprovado',
  ARCHIVED: 'Arquivado',
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function installUnicodeFonts(doc: jsPDF) {
  try {
    const [regularResponse, boldResponse] = await Promise.all([
      fetch(FONT_REGULAR_URL),
      fetch(FONT_BOLD_URL),
    ]);
    if (!regularResponse.ok || !boldResponse.ok) throw new Error('Falha ao carregar fontes Unicode.');

    const regular = toBase64(new Uint8Array(await regularResponse.arrayBuffer()));
    const bold = toBase64(new Uint8Array(await boldResponse.arrayBuffer()));
    doc.addFileToVFS('NotoSans-Regular.ttf', regular);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', bold);
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    doc.setFont('NotoSans', 'normal');
    return true;
  } catch (error) {
    console.warn('[generateReportPDF] Fonte Unicode indisponível:', error);
    doc.setFont('helvetica', 'normal');
    return false;
  }
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listText(value: unknown): string {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(', ');
  return cleanText(value);
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? cleanText(value) : date.toLocaleDateString('pt-BR');
}

function formatNumber(value: unknown): string {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat('pt-BR').format(number) : '0';
}

function firstValue(...values: unknown[]): string {
  for (const value of values) {
    const text = listText(value);
    if (text) return text;
  }
  return '';
}

function resolvePhotoUrl(photo: any): string {
  return firstValue(photo?.file_url, photo?.url, photo?.src, photo?.link, photo?.arquivo_url, photo?.thumbnail_url);
}

function resolvePhotoCaption(photo: any): string {
  return firstValue(photo?.caption, photo?.legenda, photo?.descricao, photo?.description, photo?.file_name, photo?.fileName, 'Registro fotográfico');
}

async function fetchImage(url: string): Promise<{ dataUrl: string; format: string } | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return null;

    let format = 'JPEG';
    let mime = 'image/jpeg';
    if (contentType.includes('png')) { format = 'PNG'; mime = 'image/png'; }
    else if (contentType.includes('webp')) { format = 'WEBP'; mime = 'image/webp'; }
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) { format = 'JPEG'; mime = 'image/jpeg'; }
    else if (bytes[0] === 0x89 && bytes[1] === 0x50) { format = 'PNG'; mime = 'image/png'; }

    return { dataUrl: `data:${mime};base64,${toBase64(bytes)}`, format };
  } catch (error) {
    console.warn('[generateReportPDF] Falha ao carregar imagem:', url, error);
    return null;
  }
}

Deno.serve(async (request) => {
  try {
    const base44 = createClientFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const reportId = body?.reportId;
    const selectedFields = Array.isArray(body?.selectedFields)
      ? body.selectedFields
      : Array.isArray(body?.secoes)
        ? body.secoes
        : [];
    const assinatura = cleanText(body?.assinatura);

    if (!reportId) return Response.json({ error: 'reportId é obrigatório.' }, { status: 400 });

    const report = await base44.entities.Report.get(reportId);
    if (!report) return Response.json({ error: 'Relatório não encontrado.' }, { status: 404 });

    const include = (field: string) => selectedFields.length === 0 || selectedFields.includes(field);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    await installUnicodeFonts(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    let y = PAGE_MARGIN;

    const ensureSpace = (height = 12) => {
      if (y + height > pageHeight - 18) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    };

    const setFont = (style: 'normal' | 'bold' = 'normal', size = 10, color: [number, number, number] = [30, 30, 30]) => {
      try { doc.setFont('NotoSans', style); } catch { doc.setFont('helvetica', style); }
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };

    const section = (title: string) => {
      ensureSpace(14);
      doc.setFillColor(30, 64, 120);
      doc.roundedRect(PAGE_MARGIN, y, contentWidth, 9, 1.5, 1.5, 'F');
      setFont('bold', 11, [255, 255, 255]);
      doc.text(cleanText(title), PAGE_MARGIN + 4, y + 6.2);
      y += 13;
    };

    const paragraph = (text: unknown, options: { bold?: boolean; size?: number; indent?: number; spacing?: number } = {}) => {
      const value = cleanText(text);
      if (!value) return;
      const indent = options.indent || 0;
      const width = contentWidth - indent;
      setFont(options.bold ? 'bold' : 'normal', options.size || 10);
      const lines = doc.splitTextToSize(value, width);
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT + 1);
        doc.text(line, PAGE_MARGIN + indent, y);
        y += LINE_HEIGHT;
      }
      y += options.spacing ?? 1.5;
    };

    const field = (label: string, value: unknown) => {
      const text = cleanText(value) || '—';
      ensureSpace(7);
      setFont('bold', 9.5);
      doc.text(`${label}:`, PAGE_MARGIN, y);
      setFont('normal', 9.5);
      const lines = doc.splitTextToSize(text, contentWidth - 47);
      doc.text(lines, PAGE_MARGIN + 47, y);
      y += Math.max(6, lines.length * 4.8);
    };

    const addPhoto = async (photo: any, index: number) => {
      const url = resolvePhotoUrl(photo);
      const caption = resolvePhotoCaption(photo);
      ensureSpace(70);
      const image = await fetchImage(url);
      if (image) {
        try {
          doc.addImage(image.dataUrl, image.format, PAGE_MARGIN, y, contentWidth, 58, undefined, 'FAST');
          y += 61;
        } catch (error) {
          console.warn('[generateReportPDF] Imagem incompatível:', error);
          paragraph(`Foto ${index + 1}: imagem indisponível para incorporação.`, { size: 8.5 });
        }
      } else {
        paragraph(`Foto ${index + 1}: arquivo não acessível.`, { size: 8.5 });
      }
      paragraph(caption, { size: 8.5, spacing: 3 });
    };

    doc.setFillColor(245, 247, 252);
    doc.rect(0, 0, pageWidth, 39, 'F');
    setFont('bold', 18, [30, 64, 120]);
    doc.text('MUSEUS CENTRO', PAGE_MARGIN, 20);
    setFont('normal', 11, [80, 80, 80]);
    doc.text('Relatório Executivo Mensal — Belo Horizonte', PAGE_MARGIN, 27);
    setFont('normal', 8.5, [100, 100, 100]);
    doc.text(`Protocolo: ${report.numero_protocolo || '—'} | Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, PAGE_MARGIN, 34);
    y = 47;

    section('IDENTIFICAÇÃO DO RELATÓRIO');
    field('Profissional', report.author_name);
    field('Papel do autor', report.author_role);
    field('Função', report.funcao);
    field('Museu principal', report.museu);
    field('Museu secundário', report.museu_secundario);
    field('Equipe', report.equipe);
    field('Período', `${report.mes_referencia || '—'} / ${report.ano || '—'}`);
    field('Status', STATUS_LABELS[report.status] || report.status);
    field('Público geral declarado', formatNumber(report.publico_geral_declarado));
    field('Enviado em', formatDate(report.submitted_at));
    field('Responsável pela revisão', firstValue(report.reviewer_name, report.reviewer_email));

    if (include('resumo') && (report.resumo_periodo || report.resumo_executivo)) {
      section('RESUMO DO PERÍODO');
      paragraph(report.resumo_periodo);
      paragraph(report.resumo_executivo);
    }

    if (include('atividades')) {
      section('ATIVIDADES REALIZADAS');
      const activities = Array.isArray(report.atividades) ? report.atividades : [];
      if (!activities.length) paragraph('Nenhuma atividade cadastrada no período.');

      for (let index = 0; index < activities.length; index += 1) {
        const activity = activities[index] || {};
        ensureSpace(30);
        paragraph(`${index + 1}. ${firstValue(activity.nome, activity.titulo, 'Atividade sem título')}`, { bold: true, size: 11 });
        field('Classificação', activity.classificacao);
        field('Museu/Local', firstValue(activity.museu_lista, activity.museu, activity.local, activity.local_realizacao));
        field('Tipo de ação', firstValue(activity.tipo_acao_lista, activity.tipo_acao, activity.tipo, activity.categoria));
        field('Data de início', formatDate(firstValue(activity.data_inicio, activity.data_realizacao)));
        field('Data de término', formatDate(activity.data_fim));
        field('Quantidade de ocorrências', firstValue(activity.quantas_vezes_ocorreu, activity.quantidade_ocorrencias, 1));
        field('Público total', formatNumber(firstValue(activity.publico_total, activity.publico_estimado, 0)));
        field('Público médio por sessão', formatNumber(activity.publico_medio_sessao));
        field('Quantidade de produtos', formatNumber(activity.quantidade_produtos));
        field('Total de produtos', formatNumber(activity.total_produtos));
        field('Meta vinculada', firstValue(activity.meta_codigo, activity.meta_id, activity.meta_vinculada_ids));
        field('Equipe participante', firstValue(activity.equipe_participante_ids, activity.equipe_participante));
        field('Programação vinculada', activity.programacao_id);
        if (activity.descricao) {
          paragraph('Descrição', { bold: true, size: 9.5 });
          paragraph(activity.descricao, { indent: 4 });
        }

        const activityPhotos = Array.isArray(activity.fotos) ? activity.fotos : [];
        if (include('fotos') && activityPhotos.length) {
          paragraph(`Evidências fotográficas da atividade (${activityPhotos.length})`, { bold: true, size: 9.5 });
          for (let photoIndex = 0; photoIndex < activityPhotos.length; photoIndex += 1) {
            await addPhoto(activityPhotos[photoIndex], photoIndex);
          }
        }

        doc.setDrawColor(210, 210, 210);
        doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
        y += 6;
      }
    }

    if (include('fotos')) {
      const reportPhotos = Array.isArray(report.fotos) ? report.fotos : [];
      if (reportPhotos.length) {
        section(`GALERIA FOTOGRÁFICA DO RELATÓRIO (${reportPhotos.length})`);
        for (let index = 0; index < reportPhotos.length; index += 1) await addPhoto(reportPhotos[index], index);
      }
    }

    if (include('avaliacao') && (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes)) {
      section('AVALIAÇÃO DO PERÍODO');
      if (report.avaliacao_pontos_positivos) {
        paragraph('Pontos positivos', { bold: true });
        paragraph(report.avaliacao_pontos_positivos);
      }
      if (report.avaliacao_desafios) {
        paragraph('Desafios enfrentados', { bold: true });
        paragraph(report.avaliacao_desafios);
      }
      if (report.avaliacao_sugestoes) {
        paragraph('Sugestões de melhoria', { bold: true });
        paragraph(report.avaliacao_sugestoes);
      }
    }

    if (report.comentarios_gerais || report.comentarios_coordenacao || report.historico_observacoes) {
      section('COMENTÁRIOS E OBSERVAÇÕES');
      if (report.comentarios_gerais) {
        paragraph('Comentários gerais', { bold: true });
        paragraph(report.comentarios_gerais);
      }
      if (report.comentarios_coordenacao) {
        paragraph('Comentários da coordenação', { bold: true });
        paragraph(report.comentarios_coordenacao);
      }
      if (report.historico_observacoes) {
        paragraph('Histórico de observações', { bold: true });
        paragraph(report.historico_observacoes);
      }
    }

    if (include('oportunidades') && (report.oportunidades_resumo || report.oportunidades?.length)) {
      section('OPORTUNIDADES IDENTIFICADAS');
      paragraph(report.oportunidades_resumo);
      for (const opportunity of report.oportunidades || []) {
        paragraph(firstValue(opportunity?.titulo, opportunity?.nome, 'Oportunidade'), { bold: true });
        paragraph(opportunity?.descricao);
      }
    }

    if (include('depoimentos') && Array.isArray(report.depoimentos) && report.depoimentos.length) {
      section('DEPOIMENTOS E FATOS MARCANTES');
      for (const testimonial of report.depoimentos) {
        paragraph(`“${cleanText(testimonial?.texto)}”`, { indent: 4 });
        paragraph(firstValue(testimonial?.autor, testimonial?.data_criacao), { bold: true, size: 8.5 });
      }
    }

    ensureSpace(35);
    y += 8;
    doc.setDrawColor(80, 80, 80);
    doc.line(PAGE_MARGIN, y, 105, y);
    y += 6;
    paragraph(assinatura || report.author_name || 'Responsável pelo relatório', { bold: true, spacing: 0 });
    paragraph(`Profissional responsável — ${report.mes_referencia || ''}/${report.ano || ''}`, { size: 8.5 });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      setFont('normal', 8, [130, 130, 130]);
      doc.text(`Página ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text('Plataforma Museus Centro — Relatório Oficial', pageWidth / 2, pageHeight - 4, { align: 'center' });
    }

    const pdfBytes = doc.output('arraybuffer');
    const filename = `Relatorio-Mensal-${report.museu || 'Museus-Centro'}-${report.mes_referencia || ''}-${report.ano || ''}.pdf`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[generateReportPDF] Erro:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
