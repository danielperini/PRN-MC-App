// ================================================================
// reclassificarComprovantesMalClassificados
// Detecta DocumentIntake marcados como NOTA_FISCAL_PDF que na verdade são
// comprovantes de pagamento, reclassifica para RECIBO_PDF, oculta-os da fila
// principal (ocultar_entrada_unica=true, status_processamento='APROVADO') e,
// quando possível, vincula a PurchaseRequests pelo número da NF extraído do
// nome do arquivo (NF-XX) + similaridade de fornecedor.
//
// Parâmetros:
//   apenas_novos (default true): restringe a registros criados há menos de 24h
//   limite: máximo a inspecionar (default 250, hard 500)
//
// Critérios de detecção (OR):
//   1) Regex determinística no nome: /\b(comp|comprovante|pgto|pago|recibo|pagamento)\b/i
//      aplicada ao nome do arquivo sem a extensão .pdf.
//   2) Fallback IA: resultado_ia sem nf_numero e sem nf_emitente_nome, mas com
//      data_pagamento ou favorecido — características típicas de comprovante.
//
// Vinculação: extrai NF-NN do nome (ex: "NF-17" => nf_numero="17"), busca
// PurchaseRequests pelo número, escolhe o de maior similaridade pelo
// fornecedor_nome. Se confiança >= 80%, seta comprovante_url e
// status_pagamento='aguardando_comprovante'.
//
// Retorna: { ok, apenas_novos, inspecionados, reclassificados, vinculados, sem_match }
// ================================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const PALAVRAS_COMP = /\b(comp|comprovante|pgto|pago|recibo|pagamento)\b/i;
const NF_NUM_REGEX = /NF[\s\-._]*(\d{1,4})\b/i;
const LIMIAR_VINC = 80;
const LIMITE_DEFAULT = 250;
const LIMITE_HARD = 500;

function stripPdfExt(name) {
  return String(name || '').replace(/\.(pdf)$/i, '');
}

function eComprovantePorNome(fileName) {
  if (!fileName) return false;
  return PALAVRAS_COMP.test(stripPdfExt(fileName));
}

function resultadoIALembraComprovante(intake) {
  const r = intake?.resultado_ia;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const nfNum = r.nf_numero || r.numero_nota || r.numero_nf || r.numero;
  const nfEmitente = r.nf_emitente_nome || r.emitente_nome;
  const temIssue = !nfNum && !nfEmitente;
  const hasComprovanteSignal = !!r.data_pagamento || !!r.favorecido_nome || !!r.favorecido || !!r.valor_pago || r.tipo_documento === 'COMPROVANTE';
  return temIssue && hasComprovanteSignal;
}

function extrairNFNumero(fileName) {
  if (!fileName) return null;
  const m = String(fileName).match(NF_NUM_REGEX);
  return m ? m[1] : null;
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similaridadeString(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 90;
  const tokensA = new Set(na.split(' ').filter((t) => t.length > 2));
  const tokensB = new Set(nb.split(' ').filter((t) => t.length > 2));
  if (!tokensA.size || !tokensB.size) return 0;
  let comum = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) comum++; });
  const base = Math.min(tokensA.size, tokensB.size);
  return Math.round((comum / base) * 100);
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const apenas_novos = body?.apenas_novos !== false;
    const limite = Math.min(Number(body?.limite) || LIMITE_DEFAULT, LIMITE_HARD);
    const corte = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let candidates = [];
    try {
      candidates = await svc.entities.DocumentIntake.filter(
        { tipo_detectado: 'NOTA_FISCAL_PDF', status_registro: 'ATIVO' },
        '-created_date',
        limite,
      );
    } catch (_e) {
      candidates = [];
    }
    candidates = candidates || [];

    if (apenas_novos) {
      const corteDate = new Date(corte);
      candidates = candidates.filter((c) => {
        const d = new Date(c.created_date || c.updated_date || 0);
        return d && d > corteDate;
      });
    }

    let reclassificados = 0;
    let vinculados = 0;
    let semMatch = 0;

    for (const c of candidates) {
      let candidato = false;
      if (eComprovantePorNome(c.file_name_original)) candidato = true;
      else if (resultadoIALembraComprovante(c)) candidato = true;
      if (!candidato) continue;

      try {
        await svc.entities.DocumentIntake.update(c.id, {
          tipo_detectado: 'RECIBO_PDF',
          ocultar_entrada_unica: true,
          status_processamento: 'APROVADO',
        });
      } catch (e) {
        semMatch++;
        continue;
      }
      reclassificados++;

      const nfNum = extrairNFNumero(c.file_name_original);
      if (!nfNum) {
        semMatch++;
        continue;
      }

      let prs = [];
      try {
        prs = await svc.entities.PurchaseRequest.filter({ nf_numero: nfNum }, '-created_date', 30);
      } catch (_e) {
        prs = [];
      }
      prs = prs || [];
      if (!prs.length) {
        semMatch++;
        continue;
      }

      const favComp = c?.resultado_ia?.favorecido_nome || c?.resultado_ia?.favorecido || c?.fornecedor_nome;
      let best = null;
      let bestScore = 0;
      for (const p of prs) {
        const score = similaridadeString(favComp, p.fornecedor_nome || p.nf_emitente_nome);
        if (score > bestScore) {
          best = p;
          bestScore = score;
        }
      }

      if (best && bestScore >= LIMIAR_VINC) {
        try {
          await svc.entities.PurchaseRequest.update(best.id, {
            comprovante_url: c.arquivo_original_url,
            comprovante_pagamento_url: c.arquivo_original_url,
            status_pagamento: 'aguardando_comprovante',
            comprovante_pagamento_url: c.arquivo_original_url,
          });
          try {
            await svc.entities.DocumentIntake.update(c.id, {
              entidade_destino: 'PurchaseRequest',
              entidade_destino_id: best.id,
            });
          } catch (_e) { /* não bloqueia */ }
          vinculados++;
        } catch (e) {
          semMatch++;
        }
      } else {
        semMatch++;
      }
    }

    return Response.json({
      ok: true,
      apenas_novos,
      inspecionados: candidates.length,
      reclassificados,
      vinculados,
      sem_match: semMatch,
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    console.error('[reclassificarComprovantes] erro fatal:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});