import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const ROOT_FOLDER_ID = '1jgV1WdnZUtXzgiBzken1Lw6SBFlxSxl0';

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
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabeçalho
    doc.fontSize(16).font('Helvetica-Bold').text('RELATÓRIO MENSAL DE ATIVIDADES', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(13).font('Helvetica').text(`${report.mes_referencia || ''} / ${report.ano || ''}`, { align: 'center' });
    doc.moveDown(1);

    // Identificação
    doc.fontSize(13).font('Helvetica-Bold').text('IDENTIFICAÇÃO');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    if (report.numero_protocolo) doc.text(`Protocolo: ${report.numero_protocolo}`);
    doc.text(`Profissional: ${report.author_name || '-'}`);
    if (report.funcao) doc.text(`Função: ${report.funcao}`);
    doc.text(`Museu: ${report.museu || '-'}`);
    if (report.equipe) doc.text(`Equipe: ${report.equipe}`);
    doc.text(`Status: ${report.status || '-'}`);
    doc.moveDown(1);

    // Resumo Executivo
    if (report.resumo_executivo) {
      doc.fontSize(13).font('Helvetica-Bold').text('RESUMO EXECUTIVO');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica').text(report.resumo_executivo, { align: 'justify' });
      doc.moveDown(1);
    }

    // Atividades
    const atividadesEmbutidas = Array.isArray(report.atividades) ? report.atividades : [];
    const atividadesEntidade = Array.isArray(activities) ? activities : [];
    const todasAtividades = [...atividadesEmbutidas, ...atividadesEntidade];

    if (todasAtividades.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('ATIVIDADES REALIZADAS');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      todasAtividades.forEach((ativ, idx) => {
        const titulo = ativ.titulo || ativ.nome || `Atividade ${idx + 1}`;
        doc.fontSize(11).font('Helvetica-Bold').text(`${idx + 1}. ${titulo}`);
        if (ativ.classificacao) doc.fontSize(10).font('Helvetica').text(`Classificação: ${ativ.classificacao}`);
        if (ativ.descricao) doc.fontSize(10).font('Helvetica').text(ativ.descricao, { indent: 15, align: 'justify' });
        if (ativ.data_realizacao) doc.fontSize(10).font('Helvetica').text(`Data: ${ativ.data_realizacao}`);
        if (ativ.publico_total) doc.fontSize(10).font('Helvetica').text(`Público Total: ${ativ.publico_total}`);
        if (ativ.meta_codigo) doc.fontSize(10).font('Helvetica').text(`Meta: ${ativ.meta_codigo}`);
        doc.moveDown(0.5);
      });
      doc.moveDown(0.5);
    }

    // Avaliação
    const temAvaliacao = report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes;
    if (temAvaliacao) {
      doc.fontSize(13).font('Helvetica-Bold').text('AVALIAÇÃO');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      if (report.avaliacao_pontos_positivos) {
        doc.fontSize(11).font('Helvetica-Bold').text('Pontos Positivos:');
        doc.fontSize(11).font('Helvetica').text(report.avaliacao_pontos_positivos, { align: 'justify' });
        doc.moveDown(0.5);
      }
      if (report.avaliacao_desafios) {
        doc.fontSize(11).font('Helvetica-Bold').text('Desafios:');
        doc.fontSize(11).font('Helvetica').text(report.avaliacao_desafios, { align: 'justify' });
        doc.moveDown(0.5);
      }
      if (report.avaliacao_sugestoes) {
        doc.fontSize(11).font('Helvetica-Bold').text('Sugestões:');
        doc.fontSize(11).font('Helvetica').text(report.avaliacao_sugestoes, { align: 'justify' });
      }
    }

    // Rodapé
    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica').fillColor('gray')
      .text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Plataforma Gestão MC2026`, { align: 'center' });

    doc.end();
  });
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

    // Pasta raiz com timestamp para cada sincronização
    const now = new Date();
    const syncLabel = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const syncFolderId = await createFolder(accessToken, `Sync_${syncLabel}`, ROOT_FOLDER_ID);

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