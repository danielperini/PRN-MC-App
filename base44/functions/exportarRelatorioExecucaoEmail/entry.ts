import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsPDF } from 'npm:jspdf@4.0.0';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function safe(s) {
  return String(s || '').replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');
}

function addHeader(doc, titulo, pageW, marginL) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('MUSEUS CENTRO — VIADUTO DAS ARTES', marginL, 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(safe(titulo), marginL, 13);
  doc.setTextColor(0, 0, 0);
}

function addFooter(doc, pageNum, totalPages, pageW, pageH) {
  doc.setDrawColor(200, 200, 200);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text(`Página ${pageNum} de ${totalPages}`, pageW / 2, pageH - 7, { align: 'center' });
  doc.text(new Date().toLocaleDateString('pt-BR'), pageW - 14, pageH - 7, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function block(doc, label, value, x, y, w) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text(safe(label).toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  const lines = doc.splitTextToSize(safe(value || '—'), w);
  doc.text(lines, x, y + 5);
  return y + 5 + lines.length * 5 + 3;
}

function section(doc, title, y, pageW, marginL) {
  doc.setFillColor(241, 245, 249);
  doc.rect(marginL - 2, y - 4, pageW - marginL * 2 + 4, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(safe(title).toUpperCase(), marginL, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return y + 9;
}

function checkY(doc, y, needed, pageH, pageW, marginL, titulo) {
  if (y + needed > pageH - 20) {
    doc.addPage();
    addHeader(doc, titulo, pageW, marginL);
    return 28;
  }
  return y;
}

// ─── Geração dos PDFs ──────────────────────────────────────────────────────

function gerarParte1(rel) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginL = 14, contentW = pageW - marginL * 2;
  const titulo = 'Parte 1 — Identificação, Endereço e Público';
  addHeader(doc, titulo, pageW, marginL);
  let y = 28;

  // Identificação do projeto
  y = section(doc, '1. Identificação do Projeto', y, pageW, marginL);
  const id = rel.identificacao_projeto || {};
  y = block(doc, 'Organização', id.organizacao || 'Viaduto das Artes', marginL, y, contentW / 2);
  y = block(doc, 'Projeto', id.projeto || 'Museus Centro', marginL, y, contentW / 2);
  y = block(doc, 'Instrumento Jurídico', id.instrumento_juridico, marginL, y, contentW);
  y = block(doc, 'Processo Administrativo', id.processo_administrativo, marginL, y, contentW);
  y = block(doc, 'Vigência', `${id.vigencia_inicio || '—'} a ${id.vigencia_fim || '—'}`, marginL, y, contentW / 2);
  y = block(doc, 'Responsável', id.responsavel, marginL, y, contentW / 2);

  // Endereço de execução
  y = checkY(doc, y, 30, pageH, pageW, marginL, titulo);
  y = section(doc, '2. Endereço de Execução', y, pageW, marginL);
  const endTexto = rel.endereco_execucao?.texto_editado || rel.endereco_execucao?.texto_ia || '';
  y = block(doc, 'Locais de Execução', endTexto, marginL, y, contentW);

  // Divulgação e parceria
  y = checkY(doc, y, 30, pageH, pageW, marginL, titulo);
  y = section(doc, '3. Divulgação e Parceria', y, pageW, marginL);
  const divTexto = rel.divulgacao_parceria?.texto_editado || rel.divulgacao_parceria?.texto_ia || '';
  y = block(doc, 'Divulgação / Parceria', divTexto, marginL, y, contentW);

  // Público-alvo
  y = checkY(doc, y, 40, pageH, pageW, marginL, titulo);
  y = section(doc, '4. Público-Alvo', y, pageW, marginL);
  const pub = rel.publico_alvo || {};
  const pubRows = [
    ['Previsto Direto', String(pub.previsto_direto || 0), 'Previsto Indireto', String(pub.previsto_indireto || 0)],
    ['Realizado Direto', String(pub.realizado_direto || 0), 'Realizado Indireto', String(pub.realizado_indireto || 0)],
    ['% Direto', `${pub.percentual_direto || 0}%`, '% Indireto', `${pub.percentual_indireto || 0}%`],
  ];
  const colW = contentW / 4;
  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(marginL, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  ['Métrica', 'Valor', 'Métrica', 'Valor'].forEach((h, i) => doc.text(h, marginL + i * colW + 2, y + 5));
  doc.setTextColor(0, 0, 0);
  y += 7;
  pubRows.forEach((row, ri) => {
    doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 250 : 255, ri % 2 === 0 ? 252 : 255);
    doc.rect(marginL, y, contentW, 7, 'F');
    doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    row.forEach((cell, ci) => doc.text(safe(cell), marginL + ci * colW + 2, y + 5));
    y += 7;
  });
  y += 4;

  const pubInterp = pub.texto_interpretativo_editado || pub.texto_interpretativo_ia || '';
  if (pubInterp) {
    y = checkY(doc, y, 20, pageH, pageW, marginL, titulo);
    y = block(doc, 'Análise do Público', pubInterp, marginL, y, contentW);
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, pageW, pageH);
  }
  return doc.output('arraybuffer');
}

function gerarParte2(rel) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginL = 14, contentW = pageW - marginL * 2;
  const titulo = 'Parte 2 — Cronograma de Metas e Equipe';
  addHeader(doc, titulo, pageW, marginL);
  let y = 28;

  // Metas
  y = section(doc, '5. Cronograma de Metas', y, pageW, marginL);
  const metas = rel.cronograma_metas || [];
  if (metas.length === 0) {
    y = block(doc, '', 'Nenhuma meta preenchida.', marginL, y, contentW);
  }
  for (const meta of metas) {
    y = checkY(doc, y, 35, pageH, pageW, marginL, titulo);
    // Meta header
    doc.setFillColor(226, 232, 240);
    doc.rect(marginL, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const metaLabel = `${meta.meta_nome || ''}`;
    const metaLines = doc.splitTextToSize(safe(metaLabel), contentW - 60);
    doc.text(metaLines, marginL + 2, y + 5.5);
    // status badge
    const status = meta.status_meta || '—';
    const statusColor = status.includes('Integral') ? [34, 197, 94] : status.includes('Parcial') ? [234, 179, 8] : [239, 68, 68];
    doc.setFillColor(...statusColor);
    doc.roundedRect(pageW - marginL - 40, y + 1, 38, 6, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(safe(status), pageW - marginL - 39, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 8;

    const cols = [
      ['Ações Realizadas', meta.acoes],
      ['Resultado Alcançado', meta.resultado_alcancado],
      ['Período', meta.periodo],
      ['% Execução', `${meta.percentual_execucao || 0}%`],
    ];
    for (const [lbl, val] of cols) {
      y = checkY(doc, y, 15, pageH, pageW, marginL, titulo);
      y = block(doc, lbl, val, marginL + 4, y, contentW - 4);
    }
    y += 3;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginL, y, pageW - marginL, y);
    y += 4;
  }

  // Equipe
  y = checkY(doc, y, 30, pageH, pageW, marginL, titulo);
  y = section(doc, '6. Equipe de Trabalho', y, pageW, marginL);
  const equipe = rel.equipe_trabalho || [];
  if (equipe.length === 0) {
    y = block(doc, '', 'Nenhum membro de equipe cadastrado.', marginL, y, contentW);
  } else {
    const colWidths = [65, 45, 30, 25, 17];
    const headers = ['Nome', 'Cargo', 'Contratação', 'Período', 'Valor'];
    doc.setFillColor(15, 23, 42);
    doc.rect(marginL, y, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let xh = marginL;
    headers.forEach((h, i) => { doc.text(h, xh + 2, y + 5); xh += colWidths[i]; });
    doc.setTextColor(0, 0, 0);
    y += 7;
    equipe.forEach((m, ri) => {
      y = checkY(doc, y, 8, pageH, pageW, marginL, titulo);
      doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 250 : 255, ri % 2 === 0 ? 252 : 255);
      doc.rect(marginL, y, contentW, 7, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const row = [m.nome, m.cargo, m.tipo_contratacao, m.periodo, m.valor > 0 ? fmtBRL(m.valor) : '—'];
      let xr = marginL;
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(safe(cell || '—'), colWidths[i] - 3);
        doc.text(lines[0] || '', xr + 2, y + 5);
        xr += colWidths[i];
      });
      y += 7;
    });
    // Total
    y = checkY(doc, y, 8, pageH, pageW, marginL, titulo);
    doc.setFillColor(241, 245, 249);
    doc.rect(marginL, y, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('TOTAL EQUIPE', marginL + 2, y + 5);
    const totalEquipe = equipe.reduce((s, m) => s + (m.valor || 0), 0);
    doc.text(fmtBRL(totalEquipe), marginL + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, y + 5);
    y += 10;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, pageW, pageH);
  }
  return doc.output('arraybuffer');
}

function gerarParte3(rel) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginL = 14, contentW = pageW - marginL * 2;
  const titulo = 'Parte 3 — Impactos, Avaliação e Assinatura';
  addHeader(doc, titulo, pageW, marginL);
  let y = 28;

  const sections34 = [
    ['7. Descrição das Ações', rel.descricao_acoes],
    ['8. Impactos Econômicos e Sociais', rel.impactos_economicos_sociais],
    ['9. Sustentabilidade', rel.sustentabilidade],
    ['10. Avaliação da Parceria', rel.avaliacao_parceria],
  ];
  for (const [title, secObj] of sections34) {
    const txt = secObj?.texto_editado || secObj?.texto_ia || '';
    y = checkY(doc, y, 25, pageH, pageW, marginL, titulo);
    y = section(doc, title, y, pageW, marginL);
    y = block(doc, '', txt || '—', marginL, y, contentW);
    y += 3;
  }

  // Pesquisa de Satisfação
  const ps = rel.pesquisa_satisfacao || {};
  if (ps.possui_dados) {
    y = checkY(doc, y, 30, pageH, pageW, marginL, titulo);
    y = section(doc, '11. Pesquisa de Satisfação', y, pageW, marginL);
    const psRows = [
      ['Média', String(ps.media || '—')],
      ['NPS', String(ps.nps || '—')],
      ['Satisfação', String(ps.satisfacao || '—')],
    ];
    const colW2 = contentW / 2;
    psRows.forEach((row, ri) => {
      doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 250 : 255, ri % 2 === 0 ? 252 : 255);
      doc.rect(marginL, y, contentW, 7, 'F');
      doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.text(safe(row[0]), marginL + 2, y + 5);
      doc.text(safe(row[1]), marginL + colW2 + 2, y + 5);
      y += 7;
    });
    y += 4;
    const psInterp = ps.justificativa_editada || ps.justificativa_ia || '';
    if (psInterp) y = block(doc, 'Interpretação', psInterp, marginL, y, contentW);
    y += 3;
  }

  // Assinatura
  y = checkY(doc, y, 40, pageH, pageW, marginL, titulo);
  y = section(doc, '12. Assinatura', y, pageW, marginL);
  const ass = rel.assinatura || {};
  y = block(doc, 'Representante', ass.nome_representante, marginL, y, contentW / 2);
  y = block(doc, 'Cargo', ass.cargo, marginL, y, contentW / 2);
  y = block(doc, 'Data', ass.data, marginL, y, contentW / 2);
  y += 15;
  // Linha de assinatura
  doc.setDrawColor(0, 0, 0);
  doc.line(marginL + 10, y, marginL + contentW / 2 - 10, y);
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(safe(ass.nome_representante || 'Assinatura'), marginL + 10, y + 5);
  doc.setTextColor(0, 0, 0);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, pageW, pageH);
  }
  return doc.output('arraybuffer');
}

async function gerarGaleriaFotos(fotos, loteIdx, totalLotes, base44Client) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginL = 14;
  const inicio = loteIdx * 20 + 1;
  const fim = Math.min(inicio + 19, fotos.length + loteIdx * 20);
  const titulo = `Fotos ${inicio.toString().padStart(3, '0')}–${fim.toString().padStart(3, '0')} (Galeria ${loteIdx + 1} de ${totalLotes})`;
  addHeader(doc, titulo, pageW, marginL);

  let pageNum = 1;
  for (const foto of fotos) {
    const url = foto.foto_url || foto.file_url || '';
    let imgData = null;

    if (url) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const uint8 = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          imgData = 'data:image/jpeg;base64,' + btoa(binary);
        }
      } catch {
        imgData = null;
      }
    }

    if (pageNum > 1) doc.addPage();
    addHeader(doc, titulo, pageW, marginL);

    if (imgData) {
      try {
        doc.addImage(imgData, 'JPEG', marginL, 24, 182, 200, undefined, 'MEDIUM');
      } catch {
        doc.setFillColor(240, 240, 240);
        doc.rect(marginL, 24, 182, 200, 'F');
        doc.setFontSize(9);
        doc.setTextColor(160, 160, 160);
        doc.text('[Imagem indisponível]', 105, 124, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
    } else {
      doc.setFillColor(240, 240, 240);
      doc.rect(marginL, 24, 182, 200, 'F');
      doc.setFontSize(9);
      doc.setTextColor(160, 160, 160);
      doc.text('[Imagem indisponível]', 105, 124, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }

    // Legenda
    const legenda = foto.legenda_editada || foto.legenda_ia || '';
    const ativNome = foto.atividade_nome || '';
    const metaNome = foto.meta_nome || '';
    let captionY = 230;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    if (ativNome) {
      doc.text(safe(ativNome), marginL, captionY);
      captionY += 5;
    }
    if (metaNome) {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text(safe(`Meta: ${metaNome}`), marginL, captionY);
      doc.setTextColor(0, 0, 0);
      captionY += 5;
    }
    if (legenda) {
      doc.setFont('helvetica', 'normal');
      const legendaLines = doc.splitTextToSize(safe(legenda), 182);
      doc.text(legendaLines.slice(0, 3), marginL, captionY);
    }

    addFooter(doc, pageNum, fotos.length, pageW, pageH);
    pageNum++;
  }

  return doc.output('arraybuffer');
}

// ─── Upload ao Drive ────────────────────────────────────────────────────────

async function uploadPDFToDrive(base44Client, pdfBuffer, fileName, folderId) {
  const uint8 = new Uint8Array(pdfBuffer);
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const metaJson = JSON.stringify({ name: fileName, mimeType: 'application/pdf', ...(folderId ? { parents: [folderId] } : {}) });

  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const endPart = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const dataHeaderBytes = new TextEncoder().encode(dataPart);
  const endBytes = new TextEncoder().encode(endPart);

  const totalLen = metaBytes.length + dataHeaderBytes.length + uint8.length + endBytes.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  combined.set(metaBytes, offset); offset += metaBytes.length;
  combined.set(dataHeaderBytes, offset); offset += dataHeaderBytes.length;
  combined.set(uint8, offset); offset += uint8.length;
  combined.set(endBytes, offset);

  const conn = await base44Client.asServiceRole.connectors.getConnection('googledrive');
  const token = conn.accessToken || conn.access_token;

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(combined.length),
    },
    body: combined,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Drive upload falhou: ${resp.status} — ${err}`);
  }
  return await resp.json();
}

async function getOrCreateFolder(base44Client, folderName, parentId) {
  const conn = await base44Client.asServiceRole.connectors.getConnection('googledrive');
  const token = conn.accessToken || conn.access_token;
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const searchData = await searchResp.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
  const folderData = await createResp.json();
  return folderData.id;
}

async function getFolderLink(base44Client, folderId) {
  const conn = await base44Client.asServiceRole.connectors.getConnection('googledrive');
  const token = conn.accessToken || conn.access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await resp.json();
  return data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
}

// ─── Email builder ──────────────────────────────────────────────────────────

function buildEmailBody(resultados, folderLink, erros, nomeRelatorio?: string) {
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Separa capítulos de fotos para exibição organizada
  const capitulos = resultados.filter(r => !r.nome.startsWith('Fotos'));
  const fotos     = resultados.filter(r =>  r.nome.startsWith('Fotos'));

  const renderItem = (r) =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:600;">
        <a href="${r.link}" style="color:#1d4ed8;text-decoration:none;">${r.nome}</a>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">${r.arquivo}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">
        <a href="${r.link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:4px 12px;border-radius:6px;font-size:11px;text-decoration:none;font-weight:600;">Abrir PDF</a>
      </td>
    </tr>`;

  const capSection = capitulos.length > 0 ? `
    <h3 style="font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:20px 0 8px;">📄 Capítulos</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      ${capitulos.map(renderItem).join('')}
    </table>` : '';

  const fotSection = fotos.length > 0 ? `
    <h3 style="font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:20px 0 8px;">🖼️ Galeria de Fotos</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      ${fotos.map(renderItem).join('')}
    </table>` : '';

  const errosHTML = erros.length > 0
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;">
        <p style="color:#dc2626;font-size:13px;margin:0;font-weight:600;">⚠️ ${erros.length} parte(s) com erro:</p>
        <ul style="margin:6px 0 0;padding-left:16px;color:#b91c1c;font-size:12px;">${erros.map(e => `<li>${e}</li>`).join('')}</ul>
       </div>`
    : '';

  const tituloRelatorio = nomeRelatorio
    ? nomeRelatorio.replace(/_/g, ' ')
    : 'Relatório de Execução';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:22px 28px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;font-size:18px;margin:0;font-weight:700;">✅ PDFs prontos no Google Drive</h1>
    <p style="color:#94a3b8;font-size:13px;margin:6px 0 0;">Museus Centro — Viaduto das Artes</p>
  </div>
  <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="color:#166534;font-size:14px;margin:0;font-weight:600;">📂 ${tituloRelatorio}</p>
      <p style="color:#15803d;font-size:12px;margin:4px 0 0;">Gerado em ${dataHora} · ${resultados.length} arquivo(s) salvos no Drive</p>
    </div>

    ${capSection}
    ${fotSection}
    ${errosHTML}

    <div style="margin-top:28px;text-align:center;">
      <a href="${folderLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.3px;">
        📁 Abrir Pasta Completa no Drive →
      </a>
      <p style="font-size:11px;color:#94a3b8;margin-top:12px;">Clique no link acima para acessar todos os arquivos organizados por capítulo e fotos.</p>
    </div>

  </div>
  <p style="font-size:10px;color:#cbd5e1;text-align:center;margin-top:12px;">Notificação automática · Sistema Museus Centro · Viaduto das Artes</p>
</div>`;
}

// ─── Handler principal ──────────────────────────────────────────────────────
// Modo 1: { relatorio_id } → cria job na fila e retorna job_id imediatamente
// Modo 2: { job_id, parte } → processa uma parte e atualiza o job (chamado internamente)

Deno.serve(async (req) => {
  try {
    const base44Client = createClientFromRequest(req);
    const user = await base44Client.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();

    // ── MODO 2: processar uma parte do job ──────────────────────────────────
    if (body.job_id && body.parte !== undefined) {
      const { job_id, parte } = body;
      const job = await base44Client.asServiceRole.entities.ExportQueue.get(job_id);
      if (!job) return Response.json({ error: 'Job não encontrado' }, { status: 404 });

      const rel = await base44Client.asServiceRole.entities.RelatorioExecucaoObjeto.get(job.relatorio_id);
      if (!rel) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

      const fotos = rel.anexos_evidencias || [];
      const totalLotesFotos = Math.ceil(fotos.length / 20);
      // partes: 0=Parte1, 1=Parte2, 2=Parte3, 3..=lotes de fotos
      const loteIdx = parte - 3;

      let resultado = null;
      let erro = null;

      // Subpastas: usa as do job, ou cai de volta na pasta raiz
      const capPastaId  = job.folder_capitulos_id || job.folder_id;
      const fotosPastaId = job.folder_fotos_id   || job.folder_id;

      try {
        if (parte === 0) {
          await base44Client.asServiceRole.entities.ExportQueue.update(job_id, { parte_atual: 'Parte 1 — Identificação e Público' });
          const pdf = gerarParte1(rel);
          const file = await uploadPDFToDrive(base44Client, pdf, `${job.nome_relatorio}_Parte1_Identificacao.pdf`, capPastaId);
          resultado = { nome: 'Parte 1 — Identificação e Público', link: file.webViewLink, arquivo: file.name };
        } else if (parte === 1) {
          await base44Client.asServiceRole.entities.ExportQueue.update(job_id, { parte_atual: 'Parte 2 — Metas e Equipe' });
          const pdf = gerarParte2(rel);
          const file = await uploadPDFToDrive(base44Client, pdf, `${job.nome_relatorio}_Parte2_Metas_Equipe.pdf`, capPastaId);
          resultado = { nome: 'Parte 2 — Cronograma de Metas e Equipe', link: file.webViewLink, arquivo: file.name };
        } else if (parte === 2) {
          await base44Client.asServiceRole.entities.ExportQueue.update(job_id, { parte_atual: 'Parte 3 — Impactos e Assinatura' });
          const pdf = gerarParte3(rel);
          const file = await uploadPDFToDrive(base44Client, pdf, `${job.nome_relatorio}_Parte3_Impactos_Assinatura.pdf`, capPastaId);
          resultado = { nome: 'Parte 3 — Impactos, Avaliação e Assinatura', link: file.webViewLink, arquivo: file.name };
        } else if (loteIdx >= 0 && loteIdx < totalLotesFotos) {
          const lote = fotos.slice(loteIdx * 20, (loteIdx + 1) * 20);
          const ini = (loteIdx * 20 + 1).toString().padStart(3, '0');
          const fim = Math.min((loteIdx + 1) * 20, fotos.length).toString().padStart(3, '0');
          await base44Client.asServiceRole.entities.ExportQueue.update(job_id, { parte_atual: `Fotos ${ini}–${fim}` });
          const pdfFotos = await gerarGaleriaFotos(lote, loteIdx, totalLotesFotos, base44Client);
          const file = await uploadPDFToDrive(base44Client, pdfFotos, `${job.nome_relatorio}_Fotos_${ini}-${fim}.pdf`, fotosPastaId);
          resultado = { nome: `Fotos ${ini}–${fim} (${lote.length} imagens)`, link: file.webViewLink, arquivo: file.name };
        }
      } catch (e) {
        erro = `Parte ${parte}: ${e.message}`;
      }

      // Atualiza job com resultado desta parte
      const novosResultados = resultado ? [...(job.resultados || []), resultado] : (job.resultados || []);
      const novosErros = erro ? [...(job.erros || []), erro] : (job.erros || []);
      const novasConcluidas = (job.partes_concluidas || 0) + 1;
      const totalPartes = job.partes_total || 1;
      const isUltimaParte = novasConcluidas >= totalPartes;

      const updatePayload: any = {
        resultados: novosResultados,
        erros: novosErros,
        partes_concluidas: novasConcluidas,
      };

      if (isUltimaParte) {
        // Envia email final com todos os links
        const emailBody = buildEmailBody(novosResultados, job.folder_link, novosErros, job.nome_relatorio);
        const COORDENACAO_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
        const emails = [...new Set([job.destinatario, COORDENACAO_EMAIL].filter(Boolean))];
        const totalCapitulos = novosResultados.filter(r => !r.nome.startsWith('Fotos')).length;
        const totalFotos     = novosResultados.filter(r =>  r.nome.startsWith('Fotos')).length;
        const subjectSuffix  = [
          totalCapitulos > 0 ? `${totalCapitulos} capítulo(s)` : '',
          totalFotos > 0     ? `${totalFotos} lote(s) de fotos` : '',
        ].filter(Boolean).join(' + ') || `${novosResultados.length} arquivo(s)`;

        for (const em of emails) {
          try {
            await base44Client.asServiceRole.integrations.Core.SendEmail({
              to: em,
              subject: `✅ Relatório de Execução gerado — ${subjectSuffix} prontos no Drive`,
              body: emailBody,
            });
          } catch (_) {}
        }

        // Atualiza relatório original
        await base44Client.asServiceRole.entities.RelatorioExecucaoObjeto.update(job.relatorio_id, {
          drive_backup_status: 'concluido',
          drive_backup_at: new Date().toISOString(),
        }).catch(() => {});

        // Registra no histórico de backups
        await base44Client.asServiceRole.entities.BackupLog.create({
          backup_type: 'reports',
          entity_type: 'RELATORIO_EXECUCAO_EXPORT',
          entity_id: job.relatorio_id,
          drive_file_id: job.folder_id,
          file_name: job.nome_relatorio,
          status: novosErros.length > 0 ? 'concluido' : 'success',
          processed_at: new Date().toISOString(),
          files_copied: novosResultados.length,
          details: `Exportação concluída: ${novosResultados.length} arquivo(s), ${novosErros.length} erro(s). Pasta: ${job.folder_link}`,
          backup_folder_id: job.folder_id,
        }).catch(() => {});

        updatePayload.status = novosErros.length === totalPartes ? 'erro' : 'concluido';
        updatePayload.email_enviado = true;
        updatePayload.concluido_em = new Date().toISOString();
        updatePayload.parte_atual = null;
      }

      await base44Client.asServiceRole.entities.ExportQueue.update(job_id, updatePayload);

      return Response.json({ ok: true, concluida: parte, concluidas: novasConcluidas, total: totalPartes, finalizado: isUltimaParte });
    }

    // ── MODO 1: criar job e retornar imediatamente ──────────────────────────
    const { relatorio_id } = body;
    if (!relatorio_id) return Response.json({ error: 'relatorio_id obrigatório' }, { status: 400 });

    const rel = await base44Client.asServiceRole.entities.RelatorioExecucaoObjeto.get(relatorio_id);
    if (!rel) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const destinatario = rel.gerado_por_email || user.email;
    const nomeRelatorio = `Rel_Exec_${(rel.data_inicio || '').slice(0, 7)}_${(rel.data_fim || '').slice(0, 7)}`.replace(/-/g, '');
    const fotos = rel.anexos_evidencias || [];
    const totalLotesFotos = fotos.length > 0 ? Math.ceil(fotos.length / 20) : 0;
    const totalPartes = 3 + totalLotesFotos;

    // Hierarquia de pastas organizada por ano/mês com histórico de versões
    // Estrutura: Museus Centro / Relatórios de Execução / 2026 / Jun-2026 / <nome_relatorio> / <timestamp> / Capítulos | Fotos
    const ano = (rel.data_fim || rel.data_inicio || '').slice(0, 4) || new Date().getFullYear().toString();
    const mesNum = parseInt((rel.data_fim || rel.data_inicio || '').slice(5, 7) || '0');
    const MESES_PT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mesLabel = mesNum > 0 ? `${MESES_PT[mesNum]}-${ano}` : ano;

    // Pasta raiz do relatório (reutilizada entre exportações)
    const rootId      = await getOrCreateFolder(base44Client, 'Museus Centro', null);
    const execId      = await getOrCreateFolder(base44Client, 'Relatórios de Execução', rootId);
    const anoId       = await getOrCreateFolder(base44Client, ano, execId);
    const mesId       = await getOrCreateFolder(base44Client, mesLabel, anoId);
    const relRootId   = await getOrCreateFolder(base44Client, nomeRelatorio, mesId);

    // Subpasta com timestamp para manter histórico de cada exportação
    const now = new Date();
    const tsLabel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`;
    const versaoId    = await getOrCreateFolder(base44Client, tsLabel, relRootId);

    // Subpastas Capítulos e Fotos dentro da versão
    const capitulosId = await getOrCreateFolder(base44Client, 'Capítulos', versaoId);
    const fotosId     = await getOrCreateFolder(base44Client, 'Fotos', versaoId);
    const folderId    = versaoId;

    const folderLink = await getFolderLink(base44Client, folderId).catch(() => `https://drive.google.com/drive/folders/${folderId}`);

    // Salva referência da exportação mais recente no relatório
    await base44Client.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
      drive_backup_id: relRootId,
      drive_backup_url: `https://drive.google.com/drive/folders/${relRootId}`,
      drive_backup_status: 'em_processamento',
    }).catch(() => {});

    // Cria job na fila (inclui IDs das subpastas)
    const job = await base44Client.asServiceRole.entities.ExportQueue.create({
      relatorio_id,
      destinatario,
      folder_id: folderId,
      folder_link: folderLink,
      nome_relatorio: nomeRelatorio,
      status: 'pendente',
      partes_total: totalPartes,
      partes_concluidas: 0,
      total_fotos: fotos.length,
      total_lotes_fotos: totalLotesFotos,
      resultados: [],
      erros: [],
      email_enviado: false,
      iniciado_em: new Date().toISOString(),
      // subpastas para organização por tipo
      folder_capitulos_id: capitulosId,
      folder_fotos_id: fotosId,
    });

    return Response.json({
      ok: true,
      job_id: job.id,
      partes_total: totalPartes,
      folder_link: folderLink,
      destinatario,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});