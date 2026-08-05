import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ===== Normalizadores =====
function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function asNumber(v) {
  const t = String(v || '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
}
function asDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  // ISO ou date-time
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // yyyy-mm-dd em qualquer parte
  const any = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (any) return `${any[1]}-${any[2]}-${any[3]}`;
  return s.slice(0, 10);
}
function chaveDedup(r) {
  const cnpj = digits(r.nf_emitente_cpf_cnpj);
  const numero = digits(r.nf_numero);
  const data = asDate(r.nf_data_emissao);
  const valor = asNumber(r.nf_valor_total).toFixed(2);
  const emissor = norm(r.nf_emitente_nome || r.fornecedor_nome);
  return `${cnpj}|${numero}|${data}|${valor}|${emissor}`;
}

// ===== Drive helpers =====
async function getFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,webViewLink&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return await res.json();
}
async function listChildren(accessToken, parentId) {
  const out = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,webViewLink)');
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return out;
    const data = await res.json();
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return out;
}
function isXml(f) {
  return (f.mimeType === 'text/xml' || f.mimeType === 'application/xml' || String(f.name || '').toLowerCase().endsWith('.xml'));
}
function extractNumberFromName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const nums = base.match(/\d+/g) || [];
  // Procura por sequência longa (geralmente o número da NF)
  const longNums = nums.filter(n => n.length >= 3 && n.length <= 10);
  return longNums.length ? longNums : nums;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'coordenador', 'coordinator'].includes(norm(user.role))) {
      return Response.json({ success: false, error: 'Apenas administradores ou coordenadores.' }, { status: 403 });
    }

    let token = null;
    try {
      token = (await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken || null;
    } catch (_) {}
    if (!token) return Response.json({ success: false, error: 'Google Drive não conectado.' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const budgetMs = Number(payload.budget_ms) || 50000;
    const startMs = Date.now();
    const erros = [];

    // ===== FRENTE 1 — Deduplicação =====
    const intakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 5000);
    const nfs = intakes.filter((i) =>
      (i.tipo_detectado === 'NOTA_FISCAL_PDF' || i.tipo_detectado === 'NOTA_FISCAL_XML') &&
      i.status_processamento !== 'DELETADO' &&
      i.status_processamento !== 'REJEITADO' &&
      !i.ocultar_entrada_unica &&
      i.duplicidade_status !== 'confirmada'
    );

    const grupos = new Map();
    for (const i of nfs) {
      const chave = chaveDedup(i);
      if (!chave || chave === '|||||') continue;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(i);
    }

    let gruposDuplicados = 0;
    let registrosOcultados = 0;
    const duplicatasOcultas = [];

    for (const [chave, grupo] of grupos) {
      if (grupo.length < 2) continue;
      // Original: menor created_date
      grupo.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
      const original = grupo[0];
      const duplicatas = grupo.slice(1);
      gruposDuplicados++;
      for (const dup of duplicatas) {
        if (Date.now() - startMs > budgetMs) break;
        try {
          await base44.asServiceRole.entities.DocumentIntake.update(dup.id, {
            status_processamento: 'DELETADO',
            ocultar_entrada_unica: true,
            duplicidade_status: 'confirmada',
            duplicidade_nota_original_id: original.id,
            duplicidade_motivo: 'Deduplicação automática: CNPJ + número + data + valor + emissor idênticos'
          });
          registrosOcultados++;
          duplicatasOcultas.push({ id: dup.id, file_name: dup.file_name_original, original_id: original.id });
        } catch (e) {
          erros.push({ etapa: 'dedup', intake_id: dup.id, erro: String(e?.message || e) });
        }
      }
      if (Date.now() - startMs > budgetMs) break;
    }

    // ===== FRENTE 2 — Vincular XMLs faltantes =====
    const pdfsSemXml = await base44.asServiceRole.entities.DocumentIntake.filter({
      tipo_detectado: 'NOTA_FISCAL_PDF',
      grupo_status: { $ne: 'VINCULADO' }
    }, '-created_date', 500);

    const pendentesXml = pdfsSemXml.filter((i) => !i.nf_xml_intake_id && !i.nf_xml_url);

    let xmlsVinculados = 0;
    const vinculados = [];
    let xmlsNaoEncontrados = 0;

    for (const pdf of pendentesXml) {
      if (Date.now() - startMs > budgetMs) break;
      try {
        // Recupera o drive_file_id do PDF: pode estar no resultado_ia ou arquivo_original_url
        const resultadoIa = pdf.resultado_ia || {};
        const pdfDriveFileId = resultadoIa.drive_file_id || resultadoIa.drive_pdf_file_id || pdf.arquivo_original_url?.match(/[-\w]{25,}/)?.[0] || null;
        if (!pdfDriveFileId) { xmlsNaoEncontrados++; continue; }

        const fileInfo = await getFile(token, pdfDriveFileId);
        if (!fileInfo || !fileInfo.parents || !fileInfo.parents.length) { xmlsNaoEncontrados++; continue; }

        const parentId = fileInfo.parents[0];
        const siblings = await listChildren(token, parentId);
        const xmls = siblings.filter(isXml);

        // Tenta parear pelo número da NF extraído
        const nfNumeroPdf = digits(pdf.nf_numero);
        let xmlMatch = null;
        if (nfNumeroPdf) {
          xmlMatch = xmls.find((x) => extractNumberFromName(x.name).some((n) => n === nfNumeroPdf || nfNumeroPdf.endsWith(n) || n.endsWith(nfNumeroPdf)));
        }
        // Fallback: matching por nome base (sem extensão)
        if (!xmlMatch) {
          const pdfBase = (pdf.file_name_original || pdf.file_name_final || '').replace(/\.[^.]+$/, '').toLowerCase().trim();
          xmlMatch = xmls.find((x) => {
            const xmlBase = x.name.replace(/\.[^.]+$/, '').toLowerCase().trim();
            return xmlBase === pdfBase || xmlBase.startsWith(pdfBase) || pdfBase.startsWith(xmlBase);
          });
        }

        if (!xmlMatch) { xmlsNaoEncontrados++; continue; }

        // Verifica se já existe DocumentIntake para este XML (idempotência)
        const xmlIntakeExistente = intakes.find((i) =>
          i.tipo_detectado === 'NOTA_FISCAL_XML' &&
          (i.arquivo_original_url?.includes(xmlMatch.id) || (i.resultado_ia?.drive_file_id === xmlMatch.id))
        ) || await base44.asServiceRole.entities.DocumentIntake.filter({
          tipo_detectado: 'NOTA_FISCAL_XML',
          arquivo_original_url: { $regex: xmlMatch.id }
        }, '-created_date', 5).catch(() => []);

        let xmlIntakeId = null;
        let xmlUrl = xmlMatch.webViewLink || `https://drive.google.com/file/d/${xmlMatch.id}/view`;

        if (Array.isArray(xmlIntakeExistente) && xmlIntakeExistente.length > 0) {
          xmlIntakeId = xmlIntakeExistente[0].id;
          xmlUrl = xmlIntakeExistente[0].arquivo_original_url || xmlUrl;
        } else if (xmlIntakeExistente && xmlIntakeExistente.id) {
          xmlIntakeId = xmlIntakeExistente.id;
          xmlUrl = xmlIntakeExistente.arquivo_original_url || xmlUrl;
        } else {
          // Cria novo DocumentIntake para o XML
          try {
            const novoXml = await base44.asServiceRole.entities.DocumentIntake.create({
              user_email: pdf.user_email,
              user_name: pdf.user_name,
              tipo_detectado: 'NOTA_FISCAL_XML',
              status_processamento: 'AGUARDANDO_REVISAO',
              arquivo_original_url: xmlUrl,
              file_name_original: xmlMatch.name,
              mime_type: xmlMatch.mimeType || 'application/xml',
              grupo_upload_id: pdf.grupo_upload_id,
              nf_numero: pdf.nf_numero,
              nf_emitente_cpf_cnpj: pdf.nf_emitente_cpf_cnpj || pdf.fornecedor_cpf_cnpj,
              nf_emitente_nome: pdf.nf_emitente_nome,
              nf_pdf_intake_id: pdf.id,
              nf_pdf_url: pdf.arquivo_original_url,
              resultado_ia: { drive_file_id: xmlMatch.id, origem: 'vinculo_automatico_higienizacao' }
            });
            xmlIntakeId = novoXml.id;
          } catch (e) {
            erros.push({ etapa: 'criar_xml_intake', pdf_id: pdf.id, erro: String(e?.message || e) });
            continue;
          }
        }

        // Atualiza o PDF com o vínculo
        await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
          nf_xml_intake_id: xmlIntakeId,
          nf_xml_url: xmlUrl,
          grupo_status: 'COMPLETO'
        });

        xmlsVinculados++;
        vinculados.push({ pdf_id: pdf.id, pdf_file: pdf.file_name_original, xml_file: xmlMatch.name, xml_intake_id: xmlIntakeId });
      } catch (e) {
        erros.push({ etapa: 'vincular_xml', pdf_id: pdf.id, erro: String(e?.message || e) });
      }
    }

    // ===== Persistir em BackupLog =====
    const timingMs = Date.now() - startMs;
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'DocumentIntake',
        status: 'success',
        total_files: nfs.length,
        execution_time_ms: timingMs,
        triggered_by: 'manual',
        details: JSON.stringify({
          frente1_dedup: { grupos_duplicados: gruposDuplicados, registros_ocultados: registrosOcultados },
          frente2_xml: { pdfs_sem_xml: pendentesXml.length, xmls_vinculados: xmlsVinculados, xmls_nao_encontrados: xmlsNaoEncontrados },
          erros: erros.length,
          truncado_budget: Date.now() - startMs > budgetMs
        })
      });
    } catch (_) {}

    return Response.json({
      success: true,
      resumo: {
        total_nf_verificadas: nfs.length,
        grupos_duplicados: gruposDuplicados,
        duplicatas_ocultadas: registrosOcultados,
        pdfs_sem_xml: pendentesXml.length,
        xmls_vinculados: xmlsVinculados,
        xmls_nao_encontrados: xmlsNaoEncontrados,
        erros: erros.length,
        execution_ms: timingMs
      },
      duplicatasOcultas,
      vinculados,
      erros
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
});