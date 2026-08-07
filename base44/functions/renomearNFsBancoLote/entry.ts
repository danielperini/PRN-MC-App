import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * renomearNFsBancoLote
 *
 * Renomeia no Google Drive os PDFs de Notas Fiscais referenciados pelo campo
 * `drive_backup_nf_pdf_link` dos PurchaseRequests, para o padrão canônico:
 *
 *   NF {nf_numero} {descricao 40} - {fornecedor 30} - {centro_custo} - R$ {valor}.pdf
 *
 * Diferente do `renomearNFsDrive` (que varre pastas do Drive), esta função opera
 * sobre o BANCO: itera PurchaseRequests com `drive_backup_nf_pdf_link` preenchido,
 * extrai o file_id do link, lê o nome atual do arquivo no Drive, monta o nome
 * canônico e renomeia via PATCH. Não move arquivos entre pastas e não altera o
 * `drive_backup_nf_pdf_link` (o ID do arquivo não muda com o rename).
 *
 * Parâmetros:
 *   - dry_run: true (padrão, preview) | false (efetiva)
 *   - limit:   máximo de arquivos por invocação (padrão 20, máx 50)
 *   - offset:  índice inicial da paginação (padrão 0)
 *
 * Retorna: { ok, dry_run, total_alvos, offset, limit, processados, stats, amostra, log_id }
 *   stats: { ok, pulado, erro, ja_padrao }
 */

const FILE_ID_RE = /\/d\/([^/]+)/;

function sanitize(v: any, max = 60): string {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}

function formatBRL(v: any): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0,00';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extrairFileId(url: string): string | null {
  if (!url) return null;
  const m = String(url).match(FILE_ID_RE);
  if (m) return m[1];
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function buildNomeOficial(pr: any): { nome: string; motivoPular: string | null } {
  const descricao = sanitize(pr?.descricao_item || pr?.rubrica_nome || 'Despesa', 40);
  const fornecedor = sanitize(pr?.fornecedor_nome || pr?.nf_emitente_nome || '', 30);
  const centro = sanitize(pr?.centro_custo || 'Geral', 30);
  const valor = Number(pr?.nf_valor_total || pr?.valor_solicitado || 0);

  if (!fornecedor) return { nome: '', motivoPular: 'sem fornecedor' };
  if (!valor || valor <= 0) return { nome: '', motivoPular: 'sem valor' };

  const numRaw = String(pr?.nf_numero || '').replace(/\D/g, '');
  const num = numRaw ? String(numRaw).replace(/^0+(\d)/, '$1') : 'SN';

  const nome = `NF ${num} ${descricao} - ${fornecedor} - ${centro} - R$ ${formatBRL(valor)}.pdf`;
  return { nome, motivoPular: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Permite chamada autenticada (frontend/automação) ou serviço (sem user).
    await base44.auth.me().catch(() => null);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // padrão: preview
    const limit = Math.min(Math.max(1, Number(body.limit || 20)), 50);
    const offset = Math.max(0, Number(body.offset || 0));

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Carrega PRs — busca ampla e filtra os que têm drive_backup_nf_pdf_link preenchido
    const MAX_SCAN = 300;
    let lista: any[] = [];
    try {
      lista = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', MAX_SCAN);
    } catch (e: any) {
      // fallback: filtro vazio paginado
      lista = await base44.asServiceRole.entities.PurchaseRequest.filter({}, '-created_date', MAX_SCAN);
    }
    const alvos = (lista || []).filter(
      (p: any) => p?.drive_backup_nf_pdf_link && String(p.drive_backup_nf_pdf_link).trim(),
    );
    const totalAlvos = alvos.length;
    const slice = alvos.slice(offset, offset + limit);

    const stats = { ok: 0, pulado: 0, erro: 0, ja_padrao: 0 };
    const amostra: any[] = [];
    const detalhe: any[] = [];

    for (const pr of slice) {
      const fileId = extrairFileId(pr.drive_backup_nf_pdf_link);
      const { nome: novoNome, motivoPular } = buildNomeOficial(pr);

      if (!fileId) {
        stats.erro++;
        detalhe.push({ pr_id: pr.id, status: 'erro', motivo: 'sem file_id no link' });
        continue;
      }
      if (motivoPular) {
        stats.pulado++;
        detalhe.push({ pr_id: pr.id, status: 'pulado', motivo: motivoPular });
        continue;
      }

      // Lê o nome atual no Drive
      let nomeAtual = '';
      try {
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,trashed`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (r.ok) {
          const d = await r.json();
          nomeAtual = d.name || '';
          if (d.trashed) {
            stats.pulado++;
            detalhe.push({ pr_id: pr.id, status: 'pulado', motivo: 'arquivo na lixeira' });
            continue;
          }
        } else {
          const err = await r.json().catch(() => ({}));
          if (r.status === 404) {
            stats.pulado++;
            detalhe.push({ pr_id: pr.id, status: 'pulado', motivo: 'arquivo nao encontrado (404)' });
            continue;
          }
          stats.erro++;
          detalhe.push({ pr_id: pr.id, status: 'erro', motivo: err?.error?.message || `HTTP ${r.status}` });
          continue;
        }
      } catch (e: any) {
        stats.erro++;
        detalhe.push({ pr_id: pr.id, status: 'erro', motivo: e?.message || 'falha ao ler arquivo' });
        continue;
      }

      // Já está no padrão
      if (nomeAtual === novoNome) {
        stats.ja_padrao++;
        detalhe.push({ pr_id: pr.id, status: 'ja_padrao', de: nomeAtual, para: novoNome });
        continue;
      }

      if (dryRun) {
        stats.ok++;
        if (amostra.length < 5) {
          amostra.push({ pr_id: pr.id, de: nomeAtual, para: novoNome });
        }
        detalhe.push({ pr_id: pr.id, status: 'simulado', de: nomeAtual, para: novoNome });
        continue;
      }

      // Efetiva: rename no Drive
      try {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: novoNome }),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        // Atualiza arquivo_nome no banco
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, { arquivo_nome: novoNome });
        stats.ok++;
        if (amostra.length < 5) {
          amostra.push({ pr_id: pr.id, de: nomeAtual, para: novoNome });
        }
        detalhe.push({ pr_id: pr.id, status: 'renomeado', de: nomeAtual, para: novoNome });
      } catch (e: any) {
        stats.erro++;
        detalhe.push({ pr_id: pr.id, status: 'erro', de: nomeAtual, para: novoNome, motivo: e?.message || String(e) });
      }
    }

    // Log em BackupLog
    let logId = null;
    try {
      const log = await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        entity_type: 'PurchaseRequest',
        status: dryRun ? 'em_processamento' : (stats.erro > 0 ? 'failure' : 'success'),
        total_files: slice.length,
        files_copied: stats.ok,
        processed_at: new Date().toISOString(),
        details: JSON.stringify({
          dry_run: dryRun,
          offset,
          limit,
          total_alvos: totalAlvos,
          stats,
          amostra,
          detalhe: detalhe.slice(0, 100),
        }),
        triggered_by: 'manual',
      });
      logId = log?.id || null;
    } catch (e: any) {
      // log é secundário — não bloqueia a resposta
      console.warn('[renomearNFsBancoLote] falha ao registrar BackupLog:', e?.message);
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      offset,
      limit,
      total_alvos: totalAlvos,
      processados: slice.length,
      stats,
      amostra,
      log_id: logId,
    });
  } catch (err) {
    console.error('[renomearNFsBancoLote]', err);
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
});