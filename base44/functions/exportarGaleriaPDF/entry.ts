import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsPDF } from 'npm:jspdf@4.0.0';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile', 'SEM_IDENTIFICACAO'];
const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'MUMO — Museu da Moda de Belo Horizonte',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
  SEM_IDENTIFICACAO: 'Sem identificação de museu',
};

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mime = ct.split(';')[0].trim();
    return { b64, mime };
  } catch {
    return null;
  }
}

async function createOrFindFolder(driveToken, name, parentId) {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${driveToken}` },
  });
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) return listData.files[0].id;
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const created = await createRes.json();
  return created.id;
}

async function uploadPdfToDrive(driveToken, pdfBytes, fileName, folderId) {
  const meta = JSON.stringify({ name: fileName, mimeType: 'application/pdf', parents: [folderId] });
  const boundary = 'galeria_pdf_boundary_x7';
  const enc = new TextEncoder();
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const part2 = enc.encode(`\r\n--${boundary}--`);
  const pdfUint8 = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : new Uint8Array(pdfBytes);
  const combined = new Uint8Array(part1.length + pdfUint8.length + part2.length);
  combined.set(part1, 0);
  combined.set(pdfUint8, part1.length);
  combined.set(part2, part1.length + pdfUint8.length);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: combined,
  });
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { fotos = [], destinatario } = body;
    if (!fotos.length) return Response.json({ error: 'Nenhuma foto fornecida' }, { status: 400 });

    // Agrupa fotos por museu na ordem correta
    const grupos = new Map(SECTION_ORDER.map(k => [k, []]));
    for (const foto of fotos) {
      const key = foto.museu && grupos.has(foto.museu) ? foto.museu : 'SEM_IDENTIFICACAO';
      grupos.get(key).push(foto);
    }

    // Gera PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const margin = 12;

    // Capa
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Galeria de Fotos', pageW / 2, 100, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Museus Centro', pageW / 2, 115, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 180);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 135, { align: 'center' });
    doc.text(`${fotos.length} fotos`, pageW / 2, 145, { align: 'center' });

    // Páginas por museu (grade 3x2 = 6 fotos por página)
    for (const sectionKey of SECTION_ORDER) {
      const secFotos = grupos.get(sectionKey) || [];
      if (!secFotos.length) continue;

      // Página título da seção
      doc.addPage();
      doc.setFillColor(245, 245, 245);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(SECTION_LABELS[sectionKey] || sectionKey, pageW / 2, pageH / 2 - 10, { align: 'center', maxWidth: 180 });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`${secFotos.length} foto${secFotos.length !== 1 ? 's' : ''}`, pageW / 2, pageH / 2 + 8, { align: 'center' });

      // Grade 3x2
      const cols = 3, rows = 2;
      const perPage = cols * rows;
      const cellW = (pageW - margin * 2 - (cols - 1) * 4) / cols;
      const imgH = 42;
      const cellH = imgH + 16;

      for (let p = 0; p < Math.ceil(secFotos.length / perPage); p++) {
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');

        // Header da página
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.setFont('helvetica', 'normal');
        doc.text(SECTION_LABELS[sectionKey] || sectionKey, margin, 8);

        const pageFotos = secFotos.slice(p * perPage, (p + 1) * perPage);
        for (let i = 0; i < pageFotos.length; i++) {
          const foto = pageFotos[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cellW + 4);
          const y = 14 + row * (cellH + 6);

          // Tenta carregar imagem
          const imgData = await fetchImageAsBase64(foto.url);
          if (imgData) {
            try {
              doc.addImage(imgData.b64, imgData.mime.includes('png') ? 'PNG' : 'JPEG', x, y, cellW, imgH);
            } catch {
              doc.setFillColor(220, 220, 220);
              doc.rect(x, y, cellW, imgH, 'F');
              doc.setFontSize(7);
              doc.setTextColor(150, 150, 150);
              doc.text('Imagem indisponível', x + cellW / 2, y + imgH / 2, { align: 'center' });
            }
          } else {
            doc.setFillColor(220, 220, 220);
            doc.rect(x, y, cellW, imgH, 'F');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('Imagem indisponível', x + cellW / 2, y + imgH / 2, { align: 'center' });
          }

          // Legenda
          const legenda = foto.legenda || '';
          doc.setFontSize(6.5);
          doc.setTextColor(40, 40, 40);
          doc.setFont('helvetica', 'normal');
          const legendaLines = doc.splitTextToSize(legenda, cellW);
          doc.text(legendaLines.slice(0, 2), x, y + imgH + 4);
          if (foto.periodo) {
            doc.setFontSize(6);
            doc.setTextColor(130, 130, 130);
            doc.text(foto.periodo, x, y + imgH + 10);
          }
        }

        // Rodapé com número da página
        doc.setFontSize(7);
        doc.setTextColor(180, 180, 180);
        doc.text(`Museus Centro — Galeria de Fotos`, margin, pageH - 6);
        doc.text(`${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - 6, { align: 'right' });
      }
    }

    const pdfBytes = doc.output('arraybuffer');

    // Upload para o Drive
    let driveLink = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      const driveToken = conn.accessToken || conn.access_token;

      // Pasta raiz "Exportações" → "Galeria"
      const rootFolders = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D\'Exporta%C3%A7%C3%B5es\'%20and%20mimeType%3D\'application%2Fvnd.google-apps.folder\'%20and%20\'root\'%20in%20parents%20and%20trashed%3Dfalse&fields=files(id,name)', {
        headers: { Authorization: `Bearer ${driveToken}` },
      }).then(r => r.json());
      let rootFolderId = rootFolders.files?.[0]?.id;
      if (!rootFolderId) {
        const created = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Exportações', mimeType: 'application/vnd.google-apps.folder' }),
        }).then(r => r.json());
        rootFolderId = created.id;
      }
      const galeriaFolderId = await createOrFindFolder(driveToken, 'Galeria', rootFolderId);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const fileName = `Galeria_MuseusCentro_${ts}.pdf`;
      const uploaded = await uploadPdfToDrive(driveToken, pdfBytes, fileName, galeriaFolderId);
      driveLink = uploaded.webViewLink;
    } catch (driveErr) {
      console.warn('Falha no upload Drive:', driveErr.message);
    }

    // Envia e-mail
    if (destinatario) {
      const linkHtml = driveLink
        ? `<p><a href="${driveLink}" style="background:#111;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Abrir PDF no Google Drive</a></p>`
        : '<p>O arquivo foi gerado mas não foi possível obter o link. Verifique a pasta "Exportações/Galeria" no Google Drive.</p>';
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: destinatario,
        subject: `Galeria de Fotos — Museus Centro (${fotos.length} fotos)`,
        body: `<h2>Galeria de Fotos — Museus Centro</h2>
<p>Seu PDF com <strong>${fotos.length} fotos</strong> foi gerado com sucesso.</p>
${linkHtml}
<p style="color:#888;font-size:12px;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>`,
      }).catch(e => console.warn('Falha no envio de email:', e.message));
    }

    return Response.json({ ok: true, fotos: fotos.length, driveLink });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});