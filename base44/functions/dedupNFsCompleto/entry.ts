/**
 * dedupNFsCompleto
 *
 * Detecta e elimina registros duplicados de PurchaseRequest com mesma chave
 * (nf_numero + nf_valor_total + fornecedor_nome/nf_emitente_nome).
 *
 * Fluxo:
 *  1. Agrupa PurchaseRequests por chave (nf_numero + valor + fornecedor normalizado).
 *  2. Em cada grupo com 2+ registros, elege o KEEPER:
 *       (a) status = PAGO
 *       (b) com nf_data_emissao preenchida
 *       (c) created_date mais antiga
 *  3. Antes de deletar cada duplicata, transfere para o KEEPER os campos não preenchidos:
 *       nf_data_emissao, nf_pdf_url, nota_fiscal_url, drive_backup_nf_pdf_link,
 *       drive_backup_nf_xml_link, comprovante_url, nf_chave_acesso
 *  4. Marca as duplicatas como duplicada_financeira=true e incluir_no_somatorio=false
 *     (persistência do estado antes da deleção, para rastreabilidade/auditoria).
 *  5. Deleta as duplicatas do banco via base44.asServiceRole.entities.PurchaseRequest.delete(id).
 *  6. Drive dedup: dentro de cada pasta mensal (DEST_PRIMARIO e DEST_SECUNDARIO),
 *     agrupa arquivos por nome exato; se houver 2+ com o mesmo nome, mantém o mais antigo
 *     (menor createdTime) e deleta os demais via files.delete.
 *  7. Idempotência: registros já marcados duplicada_financeira=true são excluídos do
 *     agrupamento (já processados). Registros sem nf_numero/valor são ignorados.
 *  8. Log em BackupLog com detalhes do resultado.
 *
 * Retorna: { grupos, keepers, deletados, campos_transferidos,
 *            arquivos_drive_removidos, erros: [] }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DEST_PRIMARIO = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_SECUNDARIO = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitize(v: any, max = 60): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}

function parseValor(v: any): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function normalizarChave(nfNum: any, valor: any, fornecedor: any): string {
  const n = String(nfNum || '').replace(/\D/g, '');
  const v = parseValor(valor).toFixed(2);
  const f = sanitize(fornecedor, 40).toLowerCase();
  return `${n}__${v}__${f}`;
}

function hasValue(v: any): boolean {
  return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v));
}

// ── KEEPER election ───────────────────────────────────────────────────────────

function elegerKeeper(grupo: any[]): any {
  // (a) status PAGO, escolhe mais antigo por created_date
  const pagos = grupo.filter((p) => p.status === 'PAGO' || p.pago === true);
  if (pagos.length) {
    pagos.sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
    return pagos[0];
  }
  // (b) com nf_data_emissao preenchida, mais antigo
  const comData = grupo.filter((p) => hasValue(p.nf_data_emissao));
  if (comData.length) {
    comData.sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
    return comData[0];
  }
  // (c) created_date mais antiga
  const sorted = [...grupo].sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  return sorted[0];
}

// ── Campos a transferir do duplicato → KEEPER ──────────────────────────────────

const CAMPOS_TRANSFERIVEIS = [
  'nf_data_emissao',
  'nf_pdf_url',
  'nota_fiscal_url',
  'drive_backup_nf_pdf_link',
  'drive_backup_nf_xml_link',
  'comprovante_url',
  'nf_chave_acesso',
];

// ── Drive helpers ──────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listFolderWithTime(token: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime),nextPageToken&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listMonthFolders(token: string, rootId: string): Promise<any[]> {
  const q = encodeURIComponent(`'${rootId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`);
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=200`);
  if (!r.ok) return [];
  const d = await r.json();
  return d.files || [];
}

async function deleteDriveFile(token: string, fileId: string): Promise<boolean> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
  return r.ok || r.status === 204;
}

async function dedupPastaMensal(token: string, folderId: string, limite: number = 0): Promise<{ arquivos_removidos: number; erros: string[]; restantes: number }> {
  const arquivos = await listFolderWithTime(token, folderId);
  const porNome = new Map<string, any[]>();
  for (const arq of arquivos) {
    if (arq.mimeType === FOLDER_MIME) continue;
    const nome = arq.name || '';
    if (!nome) continue;
    if (!porNome.has(nome)) porNome.set(nome, []);
    porNome.get(nome)!.push(arq);
  }
  let removidos = 0;
  const erros: string[] = [];
  let totalParaDeletar = 0;
  const filaDeletar: any[] = [];
  for (const [, grupo] of porNome.entries()) {
    if (grupo.length < 2) continue;
    grupo.sort((a, b) => new Date(a.createdTime || 0).getTime() - new Date(b.createdTime || 0).getTime());
    const duplicados = grupo.slice(1);
    totalParaDeletar += duplicados.length;
    for (const dup of duplicados) filaDeletar.push({ id: dup.id, nome: grupo[0].name });
  }

  // Aplica limite (para chamar um mês grande em múltiplos lotes)
  const alvo = limite > 0 ? filaDeletar.slice(0, limite) : filaDeletar;
  const restantes = filaDeletar.length - alvo.length;

  // Deleta em paralelo (lotes de 10) para acelerar
  const BATCH = 10;
  for (let i = 0; i < alvo.length; i += BATCH) {
    const lote = alvo.slice(i, i + BATCH);
    const resultados = await Promise.all(lote.map((d) => deleteDriveFile(token, d.id).then((ok) => ({ ok, d }))));
    for (const { ok, d } of resultados) {
      if (ok) removidos++;
      else erros.push(`Drive delete falhou: ${d.id} (${d.nome})`);
    }
  }
  return { arquivos_removidos: removidos, erros, restantes };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const erros: string[] = [];
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const skipDriveDedup = body.skipDriveDedup === true;
    // Modo "apenas Drive" (pula etapa do banco) com paginação por raiz/mês
    const driveDedupOnly = body.driveDedupOnly === true;
    const driveRoot = body.driveRoot === 'secundario' ? DEST_SECUNDARIO : DEST_PRIMARIO;
    const driveMonth = body.driveMonth || null; // nome da pasta mensal (ex: '07-2026')
    const driveLimit = Math.max(0, Number(body.driveLimit || 0)); // 0 = sem limite (todos)
    const start = Date.now();

    const sr = base44.asServiceRole;

    let gruposDuplicados: any[] = [];
    let keepersEleitos = 0;
    let duplicatasDeletadas = 0;
    let camposTransferidos = 0;
    let totalRegistros = 0;
    const detalhesGrupos: any[] = [];

    // ── 1-4. Dedup do banco (pulado em modo driveDedupOnly) ──────────────────────
    if (!driveDedupOnly) {
      // Carregar PurchaseRequests elegíveis (com nf_numero e não já marcados como duplicata)
      const todos: any[] = [];
      let skip = 0;
      const query = {
        $and: [
          { nf_numero: { $exists: true } },
          { nf_numero: { $ne: '' } },
          { duplicada_financeira: { $ne: true } },
        ],
      };
      while (true) {
        const lote = await sr.entities.PurchaseRequest.filter(query, '-created_date', 200, skip).catch((e: any) => {
          erros.push(`filter PR: ${e?.message || e}`);
          return [];
        });
        if (!lote?.length) break;
        todos.push(...lote);
        if (lote.length < 200) break;
        skip += 200;
      }
      totalRegistros = todos.length;

      const candidatas = todos.filter((p) => {
        const nfNum = String(p.nf_numero || '').replace(/\D/g, '');
        if (!nfNum) return false;
        const valor = parseValor(p.nf_valor_total || p.valor_pago || p.valor_solicitado || p.valor_total || p.valor_aprovado);
        if (!valor) return false;
        return true;
      });

      const gruposMap = new Map<string, any[]>();
      for (const pr of candidatas) {
        const chave = normalizarChave(
          pr.nf_numero,
          pr.nf_valor_total || pr.valor_pago || pr.valor_solicitado || pr.valor_total || pr.valor_aprovado,
          pr.fornecedor_nome || pr.nf_emitente_nome,
        );
        if (!gruposMap.has(chave)) gruposMap.set(chave, []);
        gruposMap.get(chave)!.push(pr);
      }

      gruposDuplicados = Array.from(gruposMap.values()).filter((g) => g.length >= 2);

      for (const grupo of gruposDuplicados) {
        const keeper = elegerKeeper(grupo);
        const duplicatas = grupo.filter((p) => p.id !== keeper.id);
        const camposTransferidosGrupo: string[] = [];
        const updatesKeeper: any = {};

        for (const dup of duplicatas) {
          for (const campo of CAMPOS_TRANSFERIVEIS) {
            if (!hasValue(keeper[campo]) && hasValue(dup[campo])) {
              updatesKeeper[campo] = dup[campo];
              keeper[campo] = dup[campo];
              camposTransferidosGrupo.push(campo);
              camposTransferidos++;
            }
          }
        }

        if (Object.keys(updatesKeeper).length > 0 && !dryRun) {
          try {
            await sr.entities.PurchaseRequest.update(keeper.id, updatesKeeper);
          } catch (e: any) {
            erros.push(`update keeper ${keeper.id}: ${e?.message || e}`);
          }
        }

        for (const dup of duplicatas) {
          if (!dryRun) {
            try {
              await sr.entities.PurchaseRequest.update(dup.id, {
                duplicada_financeira: true,
                incluir_no_somatorio: false,
                duplicidade_nota_original_id: keeper.id,
              }).catch(() => {});
              await sr.entities.PurchaseRequest.delete(dup.id);
              duplicatasDeletadas++;
            } catch (e: any) {
              erros.push(`delete ${dup.id}: ${e?.message || e}`);
            }
          } else {
            duplicatasDeletadas++;
          }
        }

        keepersEleitos++;
        detalhesGrupos.push({
          chave: normalizarChave(
            keeper.nf_numero,
            keeper.nf_valor_total || keeper.valor_pago || keeper.valor_solicitado,
            keeper.fornecedor_nome || keeper.nf_emitente_nome,
          ),
          keeper_id: keeper.id,
          keeper_status: keeper.status,
          keeper_pago: keeper.pago,
          keeper_nf_data_emissao: keeper.nf_data_emissao || null,
          keeper_created_date: keeper.created_date,
          qtd_duplicatas: duplicatas.length,
          duplicatas: duplicatas.map((d) => ({
            id: d.id,
            created_date: d.created_date,
            status: d.status,
            nf_data_emissao: d.nf_data_emissao || null,
          })),
          campos_transferidos: [...new Set(camposTransferidosGrupo)],
        });
      }
    }

    // ── 5. Drive dedup ───────────────────────────────────────────────────────────
    let arquivosDriveRemovidos = 0;
    if (!skipDriveDedup) {
      try {
        const { accessToken } = await sr.connectors.getConnection('googledrive');
        const driveErros: string[] = [];
        const pastasMes = await listMonthFolders(accessToken, driveRoot);
        for (const pasta of pastasMes) {
          if (driveMonth && pasta.name !== driveMonth) continue;
          try {
            const r = await dedupPastaMensal(accessToken, pasta.id, driveLimit);
            arquivosDriveRemovidos += r.arquivos_removidos;
            driveErros.push(...r.erros);
            if (r.restantes > 0) driveErros.push(`pasta ${pasta.name}: ${r.restantes} arquivos restantes para deletar (chame com driveLimit novamente)`);
          } catch (e: any) {
            driveErros.push(`pasta ${pasta.name} (${pasta.id}): ${e?.message || e}`);
          }
        }
        erros.push(...driveErros);
      } catch (e: any) {
        erros.push(`drive dedup: ${e?.message || e}`);
      }
    }

    // ── 6. Log em BackupLog ─────────────────────────────────────────────────────
    const stats = {
      grupos: gruposDuplicados.length,
      keepers: keepersEleitos,
      deletados: duplicatasDeletadas,
      campos_transferidos: camposTransferidos,
      arquivos_drive_removidos: arquivosDriveRemovidos,
      erros,
    };

    if (!dryRun) {
      try {
        await sr.entities.BackupLog.create({
          backup_type: 'drive_nf_sync_mensal',
          entity_type: 'PURCHASE_DEDUP',
          status: erros.length > 0 ? 'concluido' : 'success',
          total_files: totalRegistros,
          files_copied: duplicatasDeletadas,
          details: JSON.stringify(stats).substring(0, 1500),
          triggered_by: 'manual',
          processed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - start,
        });
      } catch {
        /* log não bloqueia */
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      drive_dedup_only: driveDedupOnly,
      execution_ms: Date.now() - start,
      ...stats,
      detalhes: detalhesGrupos,
    });
  } catch (err) {
    erros.push(`fatal: ${err?.message || err}`);
    return Response.json({ ok: false, error: err?.message || 'Erro interno', erros }, { status: 500 });
  }
});