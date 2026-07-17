import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const modo = payload?.modo || 'fotos'; // 'fotos' | 'nfs' | 'ambos'

    const resultado = { fotos: null, nfs: null };

    // ============================================================
    // DEDUPLICAR FOTOS (ReportPhoto) por file_name — todos os meses
    // ============================================================
    if (modo === 'fotos' || modo === 'ambos') {
      const BATCH = 250;
      const todasFotos = [];
      for (let skip = 0; skip < 20000; skip += BATCH) {
        const batch = await base44.asServiceRole.entities.ReportPhoto.list('created_date', BATCH, skip);
        if (!batch || batch.length === 0) break;
        todasFotos.push(...batch);
        if (batch.length < BATCH) break;
      }

      // Agrupar por file_name — chave primária de deduplicação
      const porFileName = {};
      for (const p of todasFotos) {
        const key = (p.file_name || '').trim();
        if (!key) continue;
        if (!porFileName[key]) porFileName[key] = [];
        porFileName[key].push({ id: p.id, created_date: p.created_date });
      }

      // Identificar duplicatas: manter o mais antigo (primeira importação)
      const idsParaDeletar = [];
      for (const items of Object.values(porFileName)) {
        if (items.length <= 1) continue;
        items.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
        idsParaDeletar.push(...items.slice(1).map(i => i.id));
      }

      // Deletar sequencialmente para evitar conflitos de ID já removido
      let deletadas = 0;
      for (const id of idsParaDeletar) {
        try {
          await base44.asServiceRole.entities.ReportPhoto.delete(id);
          deletadas++;
        } catch (_) { /* ignora se já foi deletado */ }
      }

      resultado.fotos = {
        total_verificadas: todasFotos.length,
        grupos_duplicados: Object.values(porFileName).filter(v => v.length > 1).length,
        deletadas,
        restantes: todasFotos.length - deletadas,
      };
    }

    // ============================================================
    // DEDUPLICAR NOTAS FISCAIS (PurchaseRequest) por nf_chave_acesso
    // e também por nf_numero + nf_emitente_nome + nf_valor_total
    // ============================================================
    if (modo === 'nfs' || modo === 'ambos') {
      const BATCH = 250;
      const todasNFs = [];
      for (let skip = 0; skip < 20000; skip += BATCH) {
        const batch = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', BATCH, skip);
        if (!batch || batch.length === 0) break;
        todasNFs.push(...batch);
        if (batch.length < BATCH) break;
      }

      // Agrupar por chave de acesso (44 dígitos) — deduplicação primária
      const porChave = {};
      for (const nf of todasNFs) {
        const chave = (nf.nf_chave_acesso || '').trim().replace(/\D/g, '');
        if (chave.length === 44) {
          if (!porChave[chave]) porChave[chave] = [];
          porChave[chave].push({ id: nf.id, status: nf.status, created_date: nf.created_date });
        }
      }

      // Agrupar também por numero+emitente+valor para NFs sem chave de acesso
      const porNumeroEmitente = {};
      for (const nf of todasNFs) {
        const chave = (nf.nf_chave_acesso || '').trim().replace(/\D/g, '');
        if (chave.length === 44) continue; // já tratado acima
        const num = (nf.nf_numero || '').trim();
        const emit = (nf.nf_emitente_nome || nf.fornecedor_nome || '').trim().toLowerCase();
        const val = String(nf.nf_valor_total || nf.valor_solicitado || '');
        if (!num || !emit) continue;
        const key = `${num}||${emit}||${val}`;
        if (!porNumeroEmitente[key]) porNumeroEmitente[key] = [];
        porNumeroEmitente[key].push({ id: nf.id, status: nf.status, created_date: nf.created_date });
      }

      // Prioridade de sobrevivência: PAGO > APROVADO_ADMIN > APROVADO_COORD > APROVADO > outros
      const PRIORIDADE = ['PAGO', 'APROVADO_ADMIN', 'APROVADO_COORD', 'APROVADO', 'SOLICITADO', 'RASCUNHO'];
      function prioridade(status) {
        const idx = PRIORIDADE.indexOf((status || '').toUpperCase());
        return idx === -1 ? 99 : idx;
      }

      function idsParaDeletarDoGrupo(items) {
        if (items.length <= 1) return [];
        items.sort((a, b) => {
          const diff = prioridade(a.status) - prioridade(b.status);
          if (diff !== 0) return diff;
          return new Date(a.created_date).getTime() - new Date(b.created_date).getTime();
        });
        return items.slice(1).map(i => i.id);
      }

      const idsParaDeletar = [];
      for (const items of Object.values(porChave)) {
        if (items.length > 1) idsParaDeletar.push(...idsParaDeletarDoGrupo(items));
      }
      for (const items of Object.values(porNumeroEmitente)) {
        if (items.length > 1) idsParaDeletar.push(...idsParaDeletarDoGrupo(items));
      }

      // Remover duplicatas no próprio array de IDs a deletar
      const idsUnicos = [...new Set(idsParaDeletar)];

      let deletadas = 0;
      for (const id of idsUnicos) {
        try {
          await base44.asServiceRole.entities.PurchaseRequest.delete(id);
          deletadas++;
        } catch (_) { /* ignora se já foi deletado */ }
      }

      resultado.nfs = {
        total_verificadas: todasNFs.length,
        grupos_por_chave: Object.values(porChave).filter(v => v.length > 1).length,
        grupos_por_numero_emitente: Object.values(porNumeroEmitente).filter(v => v.length > 1).length,
        deletadas,
        restantes: todasNFs.length - deletadas,
      };
    }

    return Response.json({ success: true, resultado });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});