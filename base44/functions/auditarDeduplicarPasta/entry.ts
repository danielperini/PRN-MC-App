import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function listFiles(accessToken, parentId) {
  let files = [];
  let pageToken = null;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q='${parentId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,createdTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function trashFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
  return res.json();
}

async function uploadFileToDrive(accessToken, fileName, mimeType, content, parentId) {
  const metadata = { name: fileName, parents: [parentId] };
  const boundary = '-------314159265358979323846';
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
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

// Extrai número NF do nome do arquivo para agrupar duplicatas
function extractNFKey(name) {
  const normalized = name.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();
  // Tenta extrair número NF
  const nfMatch = normalized.match(/nf[\s]?(\d+)/i) || normalized.match(/nota[\s]?fiscal[\s]?(\d+)/i) || normalized.match(/(\d{4,})/);
  const nfNum = nfMatch ? nfMatch[1] : null;
  // Pega extensão
  const ext = name.split('.').pop().toLowerCase();
  return { nfNum, ext, normalized };
}

function isXml(f) {
  return f.name.toLowerCase().endsWith('.xml') || f.mimeType === 'text/xml' || f.mimeType === 'application/xml';
}
function isPdf(f) {
  return f.name.toLowerCase().endsWith('.pdf') || f.mimeType === 'application/pdf';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const folderId = payload.folderId || '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
    const dryRun = payload.dryRun !== false; // default: dry run

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Lista todos os arquivos na pasta raiz
    const rootFiles = await listFiles(accessToken, folderId);
    const subfolders = rootFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const rootOnlyFiles = rootFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    // Coleta todos os arquivos de todas as subpastas
    const allFolderContents = [{ folderId, folderName: 'ROOT', files: rootOnlyFiles }];
    for (const sf of subfolders) {
      const sfFiles = await listFiles(accessToken, sf.id);
      allFolderContents.push({ folderId: sf.id, folderName: sf.name, files: sfFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder') });
    }

    const report = [];
    let totalTrashed = 0;
    let totalXmlAdded = 0;

    // Processa cada pasta
    for (const folderContent of allFolderContents) {
      const { folderId: fid, folderName, files } = folderContent;
      
      // Agrupa por nome base (sem extensão) para detectar duplicatas
      const byBaseName = {};
      for (const f of files) {
        const baseName = f.name.replace(/\.[^.]+$/, '').toLowerCase().trim();
        if (!byBaseName[baseName]) byBaseName[baseName] = [];
        byBaseName[baseName].push(f);
      }

      // Detecta duplicatas (mesmo nome base, mesma extensão)
      const byNameAndExt = {};
      for (const f of files) {
        const key = f.name.toLowerCase().trim();
        if (!byNameAndExt[key]) byNameAndExt[key] = [];
        byNameAndExt[key].push(f);
      }

      const duplicatesFound = [];
      const trashedIds = new Set();

      for (const [key, group] of Object.entries(byNameAndExt)) {
        if (group.length > 1) {
          // Mantém o mais antigo (createdTime menor), remove os demais
          const sorted = group.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
          const toKeep = sorted[0];
          const toRemove = sorted.slice(1);
          duplicatesFound.push({ keep: toKeep.name, keepId: toKeep.id, remove: toRemove.map(f => ({ name: f.name, id: f.id })) });
          
          if (!dryRun) {
            for (const rem of toRemove) {
              if (!trashedIds.has(rem.id)) {
                await trashFile(accessToken, rem.id);
                trashedIds.add(rem.id);
                totalTrashed++;
              }
            }
          } else {
            totalTrashed += toRemove.length;
          }
        }
      }

      // Agora verifica NFs que têm PDF mas não têm XML correspondente
      // Busca nos DocumentIntake vinculados
      const pdfs = files.filter(f => isPdf(f));
      const xmls = files.filter(f => isXml(f));
      const xmlBaseNames = new Set(xmls.map(f => f.name.replace(/\.[^.]+$/, '').toLowerCase().trim()));

      const missingXmls = [];

      for (const pdf of pdfs) {
        const pdfBase = pdf.name.replace(/\.[^.]+$/, '').toLowerCase().trim();
        // Verifica se já existe XML com nome similar
        const hasXml = xmlBaseNames.has(pdfBase) || 
          [...xmlBaseNames].some(xb => {
            // Match por número NF
            const nfPdf = pdfBase.match(/\d{3,}/g);
            const nfXml = xb.match(/\d{3,}/g);
            if (nfPdf && nfXml && nfPdf[0] === nfXml[0]) return true;
            return false;
          });

        if (!hasXml) {
          missingXmls.push({ pdfName: pdf.name, pdfId: pdf.id });

          // Tenta buscar XML vinculado no DocumentIntake
          if (!dryRun) {
            // Procura DocumentIntake com nf_pdf_url ou arquivo_original_url que contenha o pdfId
            // e tenha nf_xml_url ou nf_xml_intake_id
            try {
              const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
                $or: [
                  { nf_pdf_url: { $regex: pdf.id } },
                  { arquivo_original_url: { $regex: pdf.id } },
                  { entidade_destino_id: { $exists: true } }
                ]
              });

              // Tenta também buscar por nome de arquivo
              const intakesByName = await base44.asServiceRole.entities.DocumentIntake.filter({
                file_name_original: { $regex: pdfBase.substring(0, 20) }
              });

              const allIntakes = [...intakes, ...intakesByName];
              let xmlUploaded = false;

              for (const intake of allIntakes) {
                const xmlUrl = intake.nf_xml_url || intake.xml_url;
                if (xmlUrl) {
                  // Busca XML do intake relacionado
                  const xmlIntake = intake.nf_xml_intake_id 
                    ? await base44.asServiceRole.entities.DocumentIntake.get(intake.nf_xml_intake_id).catch(() => null)
                    : null;
                  const finalXmlUrl = xmlIntake?.arquivo_original_url || xmlUrl;

                  if (finalXmlUrl) {
                    // Baixa o XML e faz upload para a pasta
                    const xmlRes = await fetch(finalXmlUrl);
                    if (xmlRes.ok) {
                      const xmlContent = await xmlRes.text();
                      const xmlName = pdf.name.replace(/\.pdf$/i, '.xml');
                      const uploaded = await uploadFileToDrive(accessToken, xmlName, 'text/xml', xmlContent, fid);
                      if (uploaded.id) {
                        missingXmls[missingXmls.length - 1].xmlAdded = xmlName;
                        totalXmlAdded++;
                        xmlUploaded = true;
                      }
                    }
                    break;
                  }
                }
              }

              if (!xmlUploaded) {
                // Tenta buscar via PurchaseRequest
                const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({
                  $or: [
                    { nota_fiscal_url: { $regex: pdf.id } },
                    { nf_pdf_url: { $regex: pdf.id } },
                    { arquivo_url: { $regex: pdf.id } }
                  ]
                });

                for (const pr of purchases) {
                  const xmlUrl = pr.nota_fiscal_xml_url || pr.xml_url || pr.nf_xml_url;
                  if (xmlUrl) {
                    const xmlRes = await fetch(xmlUrl);
                    if (xmlRes.ok) {
                      const xmlContent = await xmlRes.text();
                      const xmlName = pdf.name.replace(/\.pdf$/i, '.xml');
                      const uploaded = await uploadFileToDrive(accessToken, xmlName, 'text/xml', xmlContent, fid);
                      if (uploaded.id) {
                        missingXmls[missingXmls.length - 1].xmlAdded = xmlName;
                        totalXmlAdded++;
                      }
                    }
                    break;
                  }
                }
              }
            } catch (e) {
              missingXmls[missingXmls.length - 1].error = e.message;
            }
          }
        }
      }

      if (duplicatesFound.length > 0 || missingXmls.length > 0) {
        report.push({
          folder: folderName,
          folderId: fid,
          totalFiles: files.length,
          duplicatesFound,
          missingXmls
        });
      }
    }

    return Response.json({
      dryRun,
      summary: { totalTrashed, totalXmlAdded, foldersAnalyzed: allFolderContents.length },
      report
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});