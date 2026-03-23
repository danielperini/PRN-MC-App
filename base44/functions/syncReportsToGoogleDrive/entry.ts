import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

async function createFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function uploadFileToDrive(accessToken, fileName, content, mimeType, parentFolderId) {
  const metadata = { name: fileName, parents: [parentFolderId] };
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', new Blob([content], { type: mimeType }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: formData
  });
  const result = await response.json();
  if (result.error) throw new Error(`Erro upload "${fileName}": ${result.error.message}`);
  return result;
}

async function generateReportPDF(report, activities) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  function addPage() {
    const page = pdfDoc.addPage([595, 842]); // A4
    return { page, y: 800 };
  }

  function drawText(page, yRef, text, { font = regularFont, size = 11, color = rgb(0, 0, 0), x = 50, maxWidth = 495 } = {}) {
    if (!text) return yRef;
    // Limpar HTML tags e caracteres especiais problemáticos
    const clean = String(text).replace(/<[^>]*>/g, '').replace(/[\n\r\t]/g, ' ').replace(/[^\x00-\x7F]/g, c => {
      const map = {
        '\u00e3': 'a', '\u00e2': 'a', '\u00e1': 'a', '\u00e0': 'a', '\u00e4': 'a',
        '\u00c3': 'A', '\u00c2': 'A', '\u00c1': 'A',
        '\u00ea': 'e', '\u00e9': 'e', '\u00e8': 'e', '\u00eb': 'e', '\u00ca': 'E', '\u00c9': 'E',
        '\u00ee': 'i', '\u00ed': 'i', '\u00ec': 'i', '\u00ef': 'i', '\u00ce': 'I', '\u00cd': 'I',
        '\u00f5': 'o', '\u00f4': 'o', '\u00f3': 'o', '\u00f2': 'o', '\u00f6': 'o',
        '\u00d5': 'O', '\u00d4': 'O', '\u00d3': 'O',
        '\u00fa': 'u', '\u00fb': 'u', '\u00f9': 'u', '\u00fc': 'u', '\u00da': 'U', '\u00db': 'U',
        '\u00e7': 'c', '\u00c7': 'C', '\u00f1': 'n', '\u00d1': 'N',
        '\u00b0': 'o', '\u2013': '-', '\u2014': '-', '\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'"
      };
      return map[c] || '?';
    });

    const lineHeight = size + 4;
    const words = clean.split(' ');
    let line = '';
    let currentY = yRef;

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const lineWidth = font.widthOfTextAtSize(testLine, size);
      if (lineWidth > maxWidth && line) {
        if (currentY < 60) {
          const { page: newPage, y: newY } = addPage();
          page = newPage;
          currentY = newY;
        }
        page.drawText(line, { x, y: currentY, size, font, color });
        currentY -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      if (currentY < 60) {
        const { page: newPage, y: newY } = addPage();
        page = newPage;
        currentY = newY;
      }
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= lineHeight;
    }
    return currentY;
  }

  let { page, y } = addPage();

  // Cabeçalho
  y = drawText(page, y, 'RELATORIO MENSAL DE ATIVIDADES', { font: boldFont, size: 16 });
  y -= 4;
  y = drawText(page, y, `${report.mes_referencia || ''} / ${report.ano || ''}`, { size: 13 });
  y -= 20;

  // Identificação
  y = drawText(page, y, 'IDENTIFICACAO', { font: boldFont, size: 13 });
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
  y -= 14;
  if (report.numero_protocolo) y = drawText(page, y, `Protocolo: ${report.numero_protocolo}`);
  y = drawText(page, y, `Profissional: ${report.author_name || '-'}`);
  if (report.funcao) y = drawText(page, y, `Funcao: ${report.funcao}`);
  y = drawText(page, y, `Museu: ${report.museu || '-'}`);
  if (report.equipe) y = drawText(page, y, `Equipe: ${report.equipe}`);
  y = drawText(page, y, `Status: ${report.status || '-'}`);
  y -= 16;

  // Resumo Executivo
  if (report.resumo_executivo) {
    y = drawText(page, y, 'RESUMO EXECUTIVO', { font: boldFont, size: 13 });
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    y = drawText(page, y, report.resumo_executivo);
    y -= 16;
  }

  // Atividades
  const atividadesEmbutidas = Array.isArray(report.atividades) ? report.atividades : [];
  const atividadesEntidade = Array.isArray(activities) ? activities : [];
  const todasAtividades = [...atividadesEmbutidas, ...atividadesEntidade];

  if (todasAtividades.length > 0) {
    y = drawText(page, y, 'ATIVIDADES REALIZADAS', { font: boldFont, size: 13 });
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;

    for (let idx = 0; idx < todasAtividades.length; idx++) {
      const ativ = todasAtividades[idx];
      const titulo = ativ.titulo || ativ.nome || `Atividade ${idx + 1}`;
      y = drawText(page, y, `${idx + 1}. ${titulo}`, { font: boldFont, size: 11 });
      if (ativ.classificacao) y = drawText(page, y, `Classificacao: ${ativ.classificacao}`, { size: 10 });
      if (ativ.descricao) y = drawText(page, y, ativ.descricao, { size: 10, x: 65 });
      if (ativ.data_realizacao) y = drawText(page, y, `Data: ${ativ.data_realizacao}`, { size: 10 });
      if (ativ.publico_total) y = drawText(page, y, `Publico Total: ${ativ.publico_total}`, { size: 10 });
      if (ativ.meta_codigo) y = drawText(page, y, `Meta: ${ativ.meta_codigo}`, { size: 10 });
      y -= 8;
    }
    y -= 8;
  }

  // Avaliação
  if (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes) {
    y = drawText(page, y, 'AVALIACAO', { font: boldFont, size: 13 });
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    if (report.avaliacao_pontos_positivos) {
      y = drawText(page, y, 'Pontos Positivos:', { font: boldFont });
      y = drawText(page, y, report.avaliacao_pontos_positivos);
      y -= 8;
    }
    if (report.avaliacao_desafios) {
      y = drawText(page, y, 'Desafios:', { font: boldFont });
      y = drawText(page, y, report.avaliacao_desafios);
      y -= 8;
    }
    if (report.avaliacao_sugestoes) {
      y = drawText(page, y, 'Sugestoes:', { font: boldFont });
      y = drawText(page, y, report.avaliacao_sugestoes);
    }
  }

  // Rodapé
  const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
  lastPage.drawText(`Gerado em: ${new Date().toISOString()} | Plataforma Gestao MC2026`, {
    x: 50, y: 30, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5)
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [reports, attachments, activities] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-created_date', 500),
      base44.asServiceRole.entities.Attachment.list('-created_date', 5000),
      base44.asServiceRole.entities.Activity.list('-created_date', 1000)
    ]);

    if (!Array.isArray(reports)) {
      return Response.json({ error: 'Falha ao buscar relatórios' }, { status: 500 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Usar pasta Relatórios em PDF para sincronização
    const now = new Date();
    const syncLabel = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    
    // Buscar ou criar pasta "Relatórios em PDF"
    const existingFolders = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${ROOT_FOLDER_ID}' in parents and name='Relatórios em PDF' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    ).then(r => r.json());
    
    let reportsFolderId = existingFolders.files?.[0]?.id;
    if (!reportsFolderId) {
      reportsFolderId = await createFolder(accessToken, 'Relatórios em PDF', ROOT_FOLDER_ID);
    }
    
    // Criar subpasta com timestamp
    const syncFolderId = await createFolder(accessToken, `Sync_${syncLabel}`, reportsFolderId);

    let filesUploaded = 0;
    let pdfsGenerated = 0;
    const errors = [];

    // Agrupar por museu
    const reportsByMuseum = {};
    for (const report of reports) {
      if (!report.id) continue;
      const museu = report.museu || 'Sem Museu';
      if (!reportsByMuseum[museu]) reportsByMuseum[museu] = [];
      reportsByMuseum[museu].push(report);
    }

    for (const [museu, museumReports] of Object.entries(reportsByMuseum)) {
      const museumFolderId = await createFolder(accessToken, museu, syncFolderId);

      for (const report of museumReports) {
        const folderName = `${report.mes_referencia || '?'} ${report.ano || ''} - ${report.author_name || 'Sem Nome'} (${report.status || '?'})`;
        const reportFolderId = await createFolder(accessToken, folderName, museumFolderId);

        // Anexos deste relatório
        const reportAttachments = attachments.filter(att => att.report_id === report.id);
        const images = reportAttachments.filter(att => att.file_type && /^image\//i.test(att.file_type));
        const videos = reportAttachments.filter(att => att.file_type && /^video\//i.test(att.file_type));
        const others = reportAttachments.filter(att => !images.includes(att) && !videos.includes(att));

        let imagesFolderId = null;
        let videosFolderId = null;
        if (images.length > 0) imagesFolderId = await createFolder(accessToken, 'Fotos', reportFolderId);
        if (videos.length > 0) videosFolderId = await createFolder(accessToken, 'Vídeos', reportFolderId);

        // Upload imagens
        for (const att of images) {
          if (!att.file_url) continue;
          try {
            const res = await fetch(att.file_url);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            await uploadFileToDrive(accessToken, att.file_name || `foto_${Date.now()}`, buf, att.file_type || 'image/jpeg', imagesFolderId);
            filesUploaded++;
          } catch (e) { errors.push(`Foto ${att.file_name}: ${e.message}`); }
        }

        // Upload vídeos
        for (const att of videos) {
          if (!att.file_url) continue;
          try {
            const res = await fetch(att.file_url);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            await uploadFileToDrive(accessToken, att.file_name || `video_${Date.now()}`, buf, att.file_type || 'video/mp4', videosFolderId);
            filesUploaded++;
          } catch (e) { errors.push(`Vídeo ${att.file_name}: ${e.message}`); }
        }

        // Upload outros arquivos
        for (const att of others) {
          if (!att.file_url) continue;
          try {
            const res = await fetch(att.file_url);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            await uploadFileToDrive(accessToken, att.file_name || `arquivo_${Date.now()}`, buf, att.file_type || 'application/octet-stream', reportFolderId);
            filesUploaded++;
          } catch (e) { errors.push(`Arquivo ${att.file_name}: ${e.message}`); }
        }

        // Gerar e fazer upload do PDF do relatório
        try {
          const reportActivities = activities.filter(a => a.report_id === report.id);
          const pdfBuffer = await generateReportPDF(report, reportActivities);
          const pdfName = `Relatorio_${report.numero_protocolo || report.id}.pdf`;
          await uploadFileToDrive(accessToken, pdfName, pdfBuffer, 'application/pdf', reportFolderId);
          pdfsGenerated++;
        } catch (e) {
          errors.push(`PDF ${report.id}: ${e.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      message: 'Sincronização concluída com sucesso',
      details: {
        folder_raiz: ROOT_FOLDER_ID,
        sync_folder: `Sync_${syncLabel}`,
        total_relatorios: reports.length,
        arquivos_enviados: filesUploaded,
        pdfs_gerados: pdfsGenerated,
        erros: errors.length > 0 ? errors : null,
        timestamp: now.toISOString()
      }
    });

  } catch (error) {
    console.error('Erro na sincronização:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});