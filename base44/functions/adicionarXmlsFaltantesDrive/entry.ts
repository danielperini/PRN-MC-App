import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function listFiles(accessToken, parentId) {
  let files = [];
  let pageToken = null;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q='${parentId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function uploadToDrive(accessToken, fileName, content, parentId) {
  const metadata = { name: fileName, parents: [parentId] };
  const boundary = 'boundary_xml_upload_314159';
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/xml\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`
    },
    body
  });
  return res.json();
}

function isXml(f) {
  return f.name.toLowerCase().endsWith('.xml') || f.mimeType === 'text/xml' || f.mimeType === 'application/xml';
}
function isPdf(f) {
  return f.name.toLowerCase().endsWith('.pdf') || f.mimeType === 'application/pdf';
}

// Extrai tokens numéricos do nome para matching
function extractNFTokens(name) {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase();
  const nums = base.match(/\d+/g) || [];
  return nums;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const folderId = payload.folderId || '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
    const dryRun = payload.dryRun !== false;
    // Permite processar só uma subpasta específica para evitar timeout
    const targetFolder = payload.targetFolder || null; // ex: "Julho 2026"

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Lista raiz para pegar subpastas
    const rootFiles = await listFiles(accessToken, folderId);
    const subfolders = rootFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const rootOnlyFiles = rootFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    let foldersToProcess = [{ folderId, folderName: 'ROOT', files: rootOnlyFiles }];
    for (const sf of subfolders) {
      foldersToProcess.push({ folderId: sf.id, folderName: sf.name, files: null });
    }

    if (targetFolder) {
      foldersToProcess = foldersToProcess.filter(f => f.folderName === targetFolder || f.folderName === 'ROOT');
    }

    // Carrega todos os DocumentIntake XML de uma vez (apenas os que têm url XML)
    const allXmlIntakes = await base44.asServiceRole.entities.DocumentIntake.filter({
      tipo_detectado: 'NOTA_FISCAL_XML'
    }, '-created_date', 500);

    // Carrega PurchaseRequests com XML
    const purchasesWithXml = await base44.asServiceRole.entities.PurchaseRequest.filter({
      $or: [
        { nota_fiscal_url: { $exists: true, $ne: '' } },
        { arquivo_url: { $exists: true, $ne: '' } }
      ]
    }, '-created_date', 500);

    const report = [];
    let totalAdded = 0;

    for (const folderInfo of foldersToProcess) {
      const files = folderInfo.files || await listFiles(accessToken, folderInfo.folderId).then(fs => fs.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'));
      
      const pdfs = files.filter(f => isPdf(f));
      const xmls = files.filter(f => isXml(f));
      
      // Mapa de XMLs existentes por nome base
      const xmlBaseNames = new Set(xmls.map(f => f.name.replace(/\.[^.]+$/, '').toLowerCase().trim()));
      
      const added = [];
      const missing = [];

      for (const pdf of pdfs) {
        const pdfBase = pdf.name.replace(/\.pdf$/i, '').toLowerCase().trim();
        
        // Verifica se já tem XML exato ou numérico similar
        const pdfNums = extractNFTokens(pdf.name);
        const hasXml = xmlBaseNames.has(pdfBase) || 
          [...xmlBaseNames].some(xb => {
            const xbNums = extractNFTokens(xb);
            if (pdfNums.length > 0 && xbNums.length > 0 && pdfNums[0] === xbNums[0]) return true;
            return false;
          });

        if (hasXml) continue;

        // PDF sem XML — tenta encontrar XML no DocumentIntake ou PurchaseRequest
        let xmlUrl = null;
        let xmlName = pdf.name.replace(/\.pdf$/i, '.xml');

        // 1. Busca por nf_pdf_intake_id vinculado
        const linkedIntake = allXmlIntakes.find(i => {
          // Verifica se o XML intake tem referência ao PDF
          if (i.nf_pdf_url && i.nf_pdf_url.includes(pdf.id)) return true;
          if (i.nf_pdf_intake_id) return false; // xml apontando para pdf intake
          return false;
        });

        // 2. Busca por DocumentIntake do tipo XML que referencie o mesmo PDF
        const xmlByPdfRef = allXmlIntakes.find(i => {
          const iNums = extractNFTokens(i.file_name_original || i.file_name_final || '');
          if (pdfNums.length > 0 && iNums.length > 0 && pdfNums[0] === iNums[0]) return true;
          return false;
        });

        if (xmlByPdfRef) {
          xmlUrl = xmlByPdfRef.arquivo_original_url;
          if (xmlByPdfRef.file_name_final) {
            xmlName = xmlByPdfRef.file_name_final.replace(/\.[^.]+$/, '.xml');
          }
        }

        // 3. Busca via PurchaseRequest pelo número da NF
        if (!xmlUrl) {
          const prMatch = purchasesWithXml.find(pr => {
            const prNums = extractNFTokens(pr.nf_numero || pr.descricao_item || '');
            if (pdfNums.length > 0 && prNums.length > 0 && pdfNums[0] === prNums[0]) return true;
            // Tenta pelo ID do arquivo na URL
            const allUrls = [pr.nota_fiscal_url, pr.nf_pdf_url, pr.arquivo_url, pr.file_url].filter(Boolean);
            return allUrls.some(u => u && u.includes(pdf.id));
          });

          if (prMatch) {
            const allUrls = [prMatch.nota_fiscal_url, prMatch.arquivo_url, prMatch.file_url].filter(Boolean);
            // Procura URL que seja XML
            xmlUrl = allUrls.find(u => u && (u.endsWith('.xml') || u.includes('xml')));
            
            // Se não achou XML direto na PR, verifica intakes vinculados
            if (!xmlUrl && prMatch.intake_id) {
              const linkedXmlIntake = allXmlIntakes.find(i => i.id === prMatch.intake_id || i.nf_pdf_intake_id === prMatch.intake_id);
              if (linkedXmlIntake) xmlUrl = linkedXmlIntake.arquivo_original_url;
            }
          }
        }

        // 4. Busca intake do tipo XML pelo nome do fornecedor/número
        if (!xmlUrl) {
          const nameTokens = pdfNums.slice(0, 2);
          const fallbackIntake = allXmlIntakes.find(i => {
            const iNums = extractNFTokens(i.nf_numero || '');
            return nameTokens.some(t => iNums.includes(t));
          });
          if (fallbackIntake) xmlUrl = fallbackIntake.arquivo_original_url;
        }

        if (xmlUrl) {
          if (!dryRun) {
            try {
              const xmlRes = await fetch(xmlUrl);
              if (xmlRes.ok) {
                const xmlContent = await xmlRes.text();
                if (xmlContent.trim().startsWith('<') || xmlContent.includes('<?xml')) {
                  const uploaded = await uploadToDrive(accessToken, xmlName, xmlContent, folderInfo.folderId);
                  if (uploaded.id) {
                    added.push({ pdf: pdf.name, xml: xmlName });
                    totalAdded++;
                  }
                }
              }
            } catch (e) {
              missing.push({ pdf: pdf.name, reason: `Erro upload: ${e.message}` });
            }
          } else {
            added.push({ pdf: pdf.name, xmlWouldAdd: xmlName, xmlUrl });
            totalAdded++;
          }
        } else {
          missing.push({ pdf: pdf.name, reason: 'XML não encontrado nos registros' });
        }
      }

      if (added.length > 0 || missing.length > 0) {
        report.push({ folder: folderInfo.folderName, xmlsAdded: added, xmlsNotFound: missing });
      }
    }

    return Response.json({ dryRun, totalAdded, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});