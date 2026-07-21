import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * renomearTodosNFsBanco
 *
 * Percorre todos os PurchaseRequests no banco, gera o nome padronizado
 * (com data e natureza de despesa) e:
 *   1. Atualiza o campo file_name_final no DocumentIntake vinculado
 *   2. Renomeia o arquivo no Google Drive (backup folder)
 *
 * Padrão de nome:
 *   NF <num> <MesAno> <natureza> - <fornecedor> - MUSEUS CENTRO - R$ <valor>.<ext>
 *
 * Parâmetros:
 *   { dryRun: true/false, limit: 200, skip: 0 }
 */

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function safeStr(v) { return String(v || '').trim(); }

function sanitize(v, max = 50) {
  return safeStr(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .substring(0, max).trim();
}

function parseValor(v) {
  const s = safeStr(v).replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function fmtValor(v) {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return '';
  return ` ${MESES[d.getMonth()]}${d.getFullYear()}`;
}

function getProjeto(cc) {
  return safeStr(cc).toUpperCase().includes('NOTURNO') ? 'NOTURNO NOS MUSEUS 2026' : 'MUSEUS CENTRO';
}

function getMuseu(cc) {
  const raw = safeStr(cc).toUpperCase();
  if (raw.includes('MHAB') || raw.includes('ABILIO')) return 'MHAB';
  if (raw.includes('MIS') || raw.includes('IMAGEM E SOM')) return 'MIS';
  if (raw.includes('MUMO') || raw.includes('MODA')) return 'MUMO';
  if (raw.includes('NOTURNO PAMPULHA')) return 'NOTURNO PAMPULHA';
  if (raw.includes('NOTURNO')) return 'NOTURNO';
  if (raw.includes('PUBLICAC')) return 'PUBLICACOES';
  return 'GERAL';
}

function buildNomePadronizado(pr, ext = 'pdf', prefixo = 'NF') {
  const num = sanitize(pr.nf_numero || '', 10) || 'SN';
  const data = fmtData(pr.nf_data_emissao || pr.data_pagamento_efetivo || pr.created_date);
  const museu = getMuseu(pr.centro_custo || '');
  const natureza = sanitize(
    pr.rubrica_nome || pr.natureza_despesa || pr.natureza_despesa_purchase || pr.categoria || pr.descricao_item || '',
    35
  ) || 'Despesa';
  const fornecedor = sanitize(pr.fornecedor_nome || pr.nf_emitente_nome || 'FORNECEDOR', 50);
  const projeto = getProjeto(pr.centro_custo || '');
  const valor = fmtValor(pr.valor_pago || pr.valor_aprovado_admin || pr.nf_valor_total || pr.valor_solicitado || 0);
  const pref = prefixo === 'COMP' ? 'COMP NF' : prefixo;
  return `${pref} ${num}${data} [${museu}] ${natureza} - ${fornecedor} - ${projeto} - R$ ${valor}.${ext}`;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveReq(token, url, opts = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function renameFile(token, fileId, newName) {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.name;
}

async function getFileName(token, fileId) {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.name || null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // padrão seguro: true
    const limit = Math.min(Number(body.limit) || 100, 300);
    const skip = Number(body.skip) || 0;
    const svc = base44.asServiceRole;

    // Conecta ao Drive
    let token = null;
    try {
      const conn = await svc.connectors.getConnection('googledrive');
      token = conn.accessToken;
    } catch (e) {
      console.warn('Drive não conectado:', e.message);
    }

    const stats = { processados: 0, drive_renomeados: 0, banco_atualizados: 0, erros: 0, sem_arquivo: 0 };
    const logs = [];

    // Busca PurchaseRequests paginado
    let offset = skip;
    let totalProcessados = 0;

    while (totalProcessados < limit) {
      const batch = await svc.entities.PurchaseRequest.filter(
        { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'SOLICITADO'] } },
        '-created_date',
        50,
        offset
      );
      if (!batch || batch.length === 0) break;

      for (const pr of batch) {
        if (totalProcessados >= limit) break;
        totalProcessados++;

        try {
          // Determina extensão a partir do arquivo atual
          const nfPdfUrl = safeStr(pr.nf_pdf_url || pr.nota_fiscal_url || pr.arquivo_url || pr.file_url || '');
          const extPdf = nfPdfUrl.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';

          const novoNomePdf = buildNomePadronizado(pr, extPdf, 'NF');
          const novoNomeXml = buildNomePadronizado(pr, 'xml', 'XML');

          const log: any = {
            id: pr.id,
            fornecedor: pr.fornecedor_nome,
            nf_numero: pr.nf_numero,
            novo_nome_pdf: novoNomePdf,
            novo_nome_xml: novoNomeXml,
            drive_pdf: null,
            drive_xml: null,
          };

          if (!dryRun) {
            // Renomeia no Drive (PDF/NF principal)
            if (token && pr.drive_backup_folder_id) {
              // Tenta renomear cada arquivo dentro da pasta de backup
              try {
                const q = encodeURIComponent(`'${pr.drive_backup_folder_id}' in parents and trashed=false`);
                const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`);
                if (r.ok) {
                  const d = await r.json();
                  const files = d.files || [];
                  for (const f of files) {
                    const nome = safeStr(f.name).toLowerCase();
                    const isXml = nome.endsWith('.xml');
                    const isComp = nome.includes('comp') || nome.includes('comprovante') || nome.includes('pix');
                    const novoNome = isXml ? novoNomeXml : isComp ? buildNomePadronizado(pr, 'pdf', 'COMP') : novoNomePdf;
                    if (novoNome !== f.name) {
                      await renameFile(token, f.id, novoNome);
                      stats.drive_renomeados++;
                      log.drive_pdf = novoNome;
                    }
                  }
                }
              } catch (e) {
                log.drive_erro = e.message;
                stats.erros++;
              }
            }

            // Atualiza DocumentIntake vinculado
            if (pr.documento_intake_id) {
              try {
                await svc.entities.DocumentIntake.update(pr.documento_intake_id, {
                  file_name_final: novoNomePdf,
                });
                stats.banco_atualizados++;
              } catch {}
            }

            // Busca DocumentIntake por purchase_id
            try {
              const intakes = await svc.entities.DocumentIntake.filter(
                { entidade_destino_id: pr.id, entidade_destino: 'PurchaseRequest' },
                '-created_date',
                10
              );
              for (const intake of (intakes || [])) {
                const nomeIntake = safeStr(intake.file_name_original || '').toLowerCase().endsWith('.xml')
                  ? novoNomeXml
                  : novoNomePdf;
                await svc.entities.DocumentIntake.update(intake.id, { file_name_final: nomeIntake });
                stats.banco_atualizados++;
              }
            } catch {}
          }

          stats.processados++;
          logs.push(log);
        } catch (e) {
          stats.erros++;
          logs.push({ id: pr.id, erro: e.message });
        }
      }

      offset += 50;
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      stats,
      total_processados: totalProcessados,
      logs: logs.slice(0, 200),
    });

  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});