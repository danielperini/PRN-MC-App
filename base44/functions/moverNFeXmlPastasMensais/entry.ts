/**
 * moverNFeXmlPastasMensais
 *
 * Move cada PDF de Nota Fiscal e seu respectivo XML para a pasta mensal
 * correta (MM-YYYY) baseada em nf_data_emissao, nos dois destinos canônicos:
 *   PRIMÁRIO  = 13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T (notasfiscais-App)
 *   SECUNDÁRIO = 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp (arquivo final)
 *
 * O PDF é MOVIDO (files.update addParents/removeParents — preserva o mesmo
 * arquivo e seu id/url). O XML é COPIADO se não existir no destino (não temos
 * um id canônico de XML para mover de forma segura em todos os casos).
 *
 * Idempotente: pula arquivos já na pasta mensal correta.
 * Suporta dryRun (preview), skip/limite (paginação).
 *
 * Resumo:
 *   - candidatos = PurchaseRequests com PDF link OU XML link preenchido
 *   - mes-ano derivado de nf_data_emissao (fallback: aprov_*_data, created_date)
 *   - pula PRs sem data de referência (sem mes-ano)
 *   - garante pasta MM-YYYY em ambos os destinos
 *   - move PDF para SECUNDÁRIO/MM-YYYY (e copia para PRIMÁRIO/MM-YYYY se faltar)
 *   - copia XML (via url) para SECUNDÁRIO/MM-YYYY e PRIMÁRIO/MM-YYYY se faltar
 *   - registra em BackupLog (backup_type = drive_nf_sync_mensal)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DEST_PRIMARIO = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_SECUNDARIO = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const r = await driveReq(token, 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id || null;
}

async function getOrCreateMesFolder(token: string, mesAno: string, rootId: string, cache: Map<string, string>): Promise<string | null> {
  if (!mesAno) return null;
  const cacheKey = `${rootId}::${mesAno}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || null;
  let id = await findFolder(token, mesAno, rootId);
  if (!id) id = await createFolder(token, mesAno, rootId);
  cache.set(cacheKey, id || '');
  return id || null;
}

function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

function extrairMesAno(dataRaw: any): string {
  if (!dataRaw) return '';
  const s = String(dataRaw).trim();
  let iso = '';
  if (/^\d{4}-\d{2}/.test(s)) {
    iso = s;
  } else {
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  }
  if (!iso) return '';
  const d = new Date(iso.substring(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Extrai MM-YYYY do nome do arquivo (padrao "NF X - MM-YYYY - ...").
// Mais confiavel que nf_data_emissao quando o banco foi poluido por IA.
function extrairMesAnoArquivo(nomeRaw: any): string {
  if (!nomeRaw) return '';
  const s = String(nomeRaw);
  const m = s.match(/\b(0[1-9]|1[0-2])-(20\d{2})\b/);
  if (!m) return '';
  return `${m[1]}-${m[2]}`;
}

// Escolhe o mes-ano prioritizando o filename quando o banco eh suspeito
// (vazio, ano < 2024 ou ano divergente do filename por mais de 1 ano).
function escolherMesAno(mesAnoDb: string, mesAnoArq: string): string {
  if (!mesAnoArq) return mesAnoDb;
  if (!mesAnoDb) return mesAnoArq;
  const anoDb = Number(mesAnoDb.slice(3));
  const anoArq = Number(mesAnoArq.slice(3));
  if (anoDb < 2024) return mesAnoArq; // provavel alucinacao de IA
  if (Math.abs(anoDb - anoArq) > 1) return mesAnoArq; // divergencia grande
  return mesAnoDb;
}

async function getFileParents(token: string, fileId: string): Promise<string[]> {
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
  );
  if (!r.ok) return [];
  const d = await r.json();
  return d.parents || [];
}

async function fileExistsInFolder(token: string, fileName: string, folderId: string): Promise<boolean> {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true`);
  if (!r.ok) return false;
  const d = await r.json();
  return (d.files?.length || 0) > 0;
}

async function getFileName(token: string, fileId: string): Promise<string> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`);
  if (!r.ok) return '';
  const d = await r.json();
  return d.name || '';
}

async function moveFile(token: string, fileId: string, addParent: string, removeParents: string[]): Promise<void> {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true&addParents=${encodeURIComponent(addParent)}`;
  if (removeParents?.length) {
    url += `&removeParents=${encodeURIComponent(removeParents.join(','))}`;
  }
  const r = await driveReq(token, url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Move HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
}

async function copyFile(token: string, fileId: string, destFolderId: string): Promise<void> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parents: [destFolderId] }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Copy HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
}

async function uploadFromUrl(token: string, fileUrl: string, fileName: string, folderId: string, mime: string): Promise<void> {
  const dl = await fetch(fileUrl);
  if (!dl.ok) throw new Error(`Download falhou (${dl.status}): ${fileUrl}`);
  const buf = await dl.arrayBuffer();
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([buf], { type: mime }), fileName);
  const up = await driveReq(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
    method: 'POST',
    body: form,
  });
  if (!up.ok) {
    const txt = await up.text().catch(() => '');
    throw new Error(`Upload HTTP ${up.status}: ${txt.slice(0, 120)}`);
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const skip = Math.max(0, Number(body.skip || 0));
    const limite = body.limite ? Math.min(Number(body.limite), 300) : null;
    const apenasSecundario = body.apenasSecundario === true;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const mesFolderCache = new Map<string, string>();

    // ── Coletar candidatos (PRs com PDF link OU XML link) ────────────────────
    const candidatos: any[] = [];
    let skipPR = 0;
    while (true) {
      const lote = await base44.asServiceRole.entities.PurchaseRequest
        .filter({}, '-updated_date', 200, skipPR)
        .catch(() => []);
      if (!lote?.length) break;
      for (const pr of lote) {
        const pdfUrl = pr.drive_backup_nf_pdf_link || pr.nf_pdf_url || pr.nota_fiscal_url || '';
        const xmlUrl = pr.nf_xml_url || pr.nota_fiscal_xml_url || pr.xml_url || '';
        if (!pdfUrl && !xmlUrl) continue;
        const dataRef = pr.nf_data_emissao || pr.aprov_admin_data || pr.aprov_coord_data || pr.data_pagamento_efetivo || '';
        const mesAnoDb = extrairMesAno(dataRef);
        const mesAnoArq = extrairMesAnoArquivo(pr.arquivo_nome || '');
        const mesAno = escolherMesAno(mesAnoDb, mesAnoArq);
        if (!mesAno) continue;
        const conflito = !!(mesAnoArq && mesAnoDb && mesAno !== mesAnoDb);
        const anoDb = mesAnoDb ? Number(mesAnoDb.slice(3)) : 0;
        // Se a data do banco for suspeita (ano < 2024) e nao temos MM-YYYY do
        // banco do arquivo, precisamos buscar o nome real no Drive para
        // recalcular o mes-ano antes de mover.
        const precisa_arquivo = !!(!mesAnoArq && anoDb > 0 && anoDb < 2024);
        candidatos.push({
          pr_id: pr.id,
          nf_numero: pr.nf_numero || '',
          fornecedor: pr.fornecedor_nome || pr.nf_emitente_nome || '',
          pdf_url: pdfUrl,
          xml_url: xmlUrl,
          mes_ano: mesAno,
          mes_ano_db: mesAnoDb,
          mes_ano_arq: mesAnoArq,
          conflito_data: conflito,
          precisa_arquivo,
          data_emissao: pr.nf_data_emissao || '',
          arquivo_nome: pr.arquivo_nome || '',
        });
      }
      if (lote.length < 200) break;
      skipPR += 200;
    }

    const totalDisponivel = candidatos.length;
    const fatia = limite ? candidatos.slice(skip, skip + limite) : (skip > 0 ? candidatos.slice(skip) : candidatos);
    const hasMore = limite ? skip + limite < totalDisponivel : false;

    const stats = {
      total_candidatos: totalDisponivel,
      processados: fatia.length,
      skip,
      has_more: hasMore,
      movidos_pdf: 0,
      copiados_pdf_primario: 0,
      copiados_xml: 0,
      movidos_xml: 0,
      ja_correto: 0,
      sem_fileid: 0,
      sem_mes_ano: 0,
      conflitos_data_banco: 0,
      erros: 0,
    };
    const linhas: any[] = [];

    for (const c of fatia) {
      const linha: any = {
        pr_id: c.pr_id,
        nf_numero: c.nf_numero,
        fornecedor: c.fornecedor,
        mes_ano: c.mes_ano,
        mes_ano_db: c.mes_ano_db || '',
        mes_ano_arq: c.mes_ano_arq || '',
        conflito_data: !!c.conflito_data,
        pdf_status: 'pulado',
        xml_status: 'pulado',
        erro: '',
      };
      if (c.conflito_data) stats.conflitos_data_banco++;

      // ── PDF ──────────────────────────────────────────────────────────────
      let pdfFileId: string | null = null;
      if (c.pdf_url) {
        pdfFileId = extrairDriveFileId(c.pdf_url);
        if (!pdfFileId) {
          linha.pdf_status = 'sem_fileid';
          stats.sem_fileid++;
        }
      } else {
        linha.pdf_status = 'sem_pdf';
      }

      // ── Recalcular mes-ano a partir do nome real no Drive quando o banco
      //    estiver suspeito (ano < 2024, provavel alucinacao de IA) ──────
      if (pdfFileId && c.precisa_arquivo) {
        const nomeReal = await getFileName(token, pdfFileId).catch(() => '');
        if (nomeReal) {
          c.arquivo_nome = c.arquivo_nome || nomeReal;
          const novoMesAno = extrairMesAnoArquivo(nomeReal);
          if (novoMesAno) {
            c.mes_ano = novoMesAno;
            linha.mes_ano = novoMesAno;
            linha.mes_ano_arq = novoMesAno;
            if (c.mes_ano_db && c.mes_ano_db !== novoMesAno) {
              linha.conflito_data = true;
              stats.conflitos_data_banco++;
            }
          }
        }
      }

      // ── SECUNDÁRIO (MOVER) ────────────────────────────────────────────────
      if (pdfFileId && !dryRun && !apenasSecundario === false ? true : true) {
        try {
          const destSec = await getOrCreateMesFolder(token, c.mes_ano, DEST_SECUNDARIO, mesFolderCache);
          if (!destSec) {
            linha.pdf_status = 'sem_pasta_destino';
          } else {
            const parents = await getFileParents(token, pdfFileId);
            if (parents.includes(destSec)) {
              linha.pdf_status = 'ja_correto_secundario';
              stats.ja_correto++;
            } else if (dryRun) {
              const nome = await getFileName(token, pdfFileId).catch(() => c.arquivo_nome || '');
              linha.pdf_status = `simulado_move_para '${c.mes_ano}'`;
              linha.nome_atual = nome;
            } else {
              await moveFile(token, pdfFileId, destSec, parents);
              linha.pdf_status = 'movido_secundario';
              stats.movidos_pdf++;
            }
          }
        } catch (e: any) {
          linha.pdf_status = 'erro_move';
          linha.erro = e.message;
          stats.erros++;
        }
      }

      // ── PRIMÁRIO (COPIAR se faltar) ──────────────────────────────────────
      if (pdfFileId && !apenasSecundario) {
        try {
          const destPrim = await getOrCreateMesFolder(token, c.mes_ano, DEST_PRIMARIO, mesFolderCache);
          if (destPrim) {
            const nome = c.arquivo_nome || (await getFileName(token, pdfFileId).catch(() => ''));
            const existe = await fileExistsInFolder(token, nome, destPrim);
            if (existe) {
              linha.pdf_primario = 'ja_existia';
            } else if (dryRun) {
              linha.pdf_primario = 'simulado_copia';
            } else {
              await copyFile(token, pdfFileId, destPrim);
              linha.pdf_primario = 'copiado';
              stats.copiados_pdf_primario++;
            }
          } else {
            linha.pdf_primario = 'sem_pasta_primario';
          }
        } catch (e: any) {
          linha.pdf_primario = 'erro_copia';
          if (!linha.erro) linha.erro = `Primário: ${e.message}`;
        }
      }

      // ── XML ──────────────────────────────────────────────────────────────
      if (c.xml_url) {
        const xmlId = extrairDriveFileId(c.xml_url);
        try {
          const destSec = await getOrCreateMesFolder(token, c.mes_ano, DEST_SECUNDARIO, mesFolderCache);
          if (destSec) {
            // XML por id: copia para SECUNDÁRIO se faltar
            if (xmlId) {
              const nomeXml = (await getFileName(token, xmlId).catch(() => '')) || '';
              const existe = nomeXml ? await fileExistsInFolder(token, nomeXml, destSec) : false;
              if (existe) {
                linha.xml_status = 'ja_existia_secundario';
              } else if (dryRun) {
                linha.xml_status = 'simulado_copia_xml';
              } else {
                await copyFile(token, xmlId, destSec);
                linha.xml_status = 'copiado_secundario';
                stats.copiados_xml++;
              }
            } else {
              // XML por URL externa (não-Drive): upload
              if (dryRun) {
                linha.xml_status = 'simulado_upload_xml';
              } else {
                await uploadFromUrl(token, c.xml_url, `XML ${c.nf_numero || 'SN'}.xml`, destSec, 'application/xml');
                linha.xml_status = 'upload_secundario';
                stats.copiados_xml++;
              }
            }
          }

          // PRIMÁRIO (copia XML se faltar) — apenas se não apenasSecundario
          if (!apenasSecundario) {
            const destPrim = await getOrCreateMesFolder(token, c.mes_ano, DEST_PRIMARIO, mesFolderCache);
            if (destPrim) {
              if (xmlId) {
                const nomeXml = (await getFileName(token, xmlId).catch(() => '')) || '';
                const existe = nomeXml ? await fileExistsInFolder(token, nomeXml, destPrim) : false;
                if (!existe && !dryRun) {
                  await copyFile(token, xmlId, destPrim);
                }
              } else if (!dryRun) {
                await uploadFromUrl(token, c.xml_url, `XML ${c.nf_numero || 'SN'}.xml`, destPrim, 'application/xml');
              }
            }
          }
        } catch (e: any) {
          linha.xml_status = 'erro_xml';
          if (!linha.erro) linha.erro = `XML: ${e.message}`;
        }
      }

      linhas.push(linha);
    }

    // ── Log ──────────────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        entity_type: 'moverNFeXmlPastasMensais',
        status: stats.erros > 0 ? 'concluido' : 'success',
        total_files: stats.processados,
        files_copied: stats.movidos_pdf + stats.copiados_pdf_primario + stats.copiados_xml,
        details: `PDFs movidos(sec): ${stats.movidos_pdf} | PDFs copiados(pri): ${stats.copiados_pdf_primario} | XMLs copiados: ${stats.copiados_xml} | Já corretos: ${stats.ja_correto} | Sem file_id: ${stats.sem_fileid} | Conflitos data banco: ${stats.conflitos_data_banco} | Erros: ${stats.erros}`,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - start,
      });
    } catch { /* log não bloqueia */ }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      execution_ms: Date.now() - start,
      stats,
      amostra: linhas.slice(0, 10),
      total_linhas: linhas.length,
    });
  } catch (err) {
    console.error('[moverNFeXmlPastasMensais] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});