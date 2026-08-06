import { useRef } from 'react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Zap } from 'lucide-react';

const IA_BATCH = 20;
const CONFIANCA_MINIMA = 90;

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Calcula score de confiança (0-100) sem nova chamada de IA.
 * (a) campos obrigatórios presentes (rubrica + centro_custo + valor + CNPJ) = 50pts
 * (b) ia_historico_score >= 90 OU resultado_ia sem inconsistências = +40pts
 * (c) XML vinculado = +10pts
 */
export function calcularConfianca(intake) {
  const ia = intake?.resultado_ia || {};
  let score = 0;

  const temRubrica = !!(intake?.rubrica_id_sugerida || intake?.rubrica_id || ia.rubrica_id);
  const temCentro = !!(intake?.centro_custo || ia.centro_custo || ia.centro_custo_sugerido);
  const temValor = Number(ia.nf_valor_total || intake?.nf_valor_total || 0) > 0;
  const cnpj = onlyDigits(
    ia.nf_emitente_cpf_cnpj ||
      intake?.nf_emitente_cpf_cnpj ||
      intake?.fornecedor_cpf_cnpj ||
      ''
  );
  const temCnpj = cnpj.length >= 11;

  if (temRubrica && temCentro && temValor && temCnpj) score += 50;

  const iaScore = Number(ia.ia_historico_score || 0);
  const inconsistencias = Array.isArray(ia.inconsistencias) ? ia.inconsistencias : [];
  const semInconsistencias = inconsistencias.length === 0;
  if (iaScore >= 90 || semInconsistencias) score += 40;

  if (intake?.nf_xml_intake_id || intake?.nf_xml_url) score += 10;

  return score;
}

async function fetchFullList() {
  try {
    const list = await base44.entities.DocumentIntake.filter(
      { status_registro: 'ATIVO' },
      '-created_date',
      200
    );
    if (Array.isArray(list) && list.length > 0) return list;
  } catch (e) {
    console.warn('autoPipeline: filter falhou, tentando list():', e?.message || e);
  }
  try {
    return (await base44.entities.DocumentIntake.list('-created_date', 200)) || [];
  } catch (e) {
    console.warn('autoPipeline: list() também falhou:', e?.message || e);
    return [];
  }
}

/**
 * Pipeline automático de processamento da fila da Entrada Única.
 * Disparado uma vez por sessão, apenas para admin/coordenador, sem intervenção manual.
 *
 * Fases:
 *  1. Vinculação local XML↔PDF (reutiliza tentarVincularLista)
 *  2. Busca XMLs faltantes no Drive/Gmail (conciliarEEnviarNFsPipeline)
 *  3. Preenchimento IA histórico em lotes de 20 (preencherNFsComHistoricoIA)
 *  4. Cálculo de score de confiança (frontend, sem nova IA)
 *  5. Auto-aprovação das NFs elegíveis (PurchaseRequest com status APROVADO_COORD)
 *  6. Arquivamento (ocultação) dos XMLs órfãos + log no BackupLog
 */
export function useAutoProcessarFila({
  canSeeAll,
  filaProcessando,
  tentarVincularLista,
  enviarIntakeParaAprovacao,
  getTipoByFile,
  carregarIntakes,
}) {
  const autoProcessouRef = useRef(false);

  async function executar() {
    if (!canSeeAll) return;
    if (autoProcessouRef.current) return;
    if (filaProcessando) return;

    // Pré-verificação: só prossegue se houver trabalho real a fazer.
    let lista = await fetchFullList().catch(() => []);
    const temTrabalho = (lista || []).some((i) => {
      const tipo = i.tipo_detectado || getTipoByFile(i);
      const status = String(i.status_processamento || '').toUpperCase();
      if (tipo === 'NOTA_FISCAL_PDF' && !i.ocultar_entrada_unica && !i.entidade_destino_id &&
          ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ENVIADO'].includes(status)) return true;
      if (tipo === 'NOTA_FISCAL_XML' && !i.ocultar_entrada_unica &&
          (!i.nf_pdf_intake_id && i.grupo_status !== 'COMPLETO')) return true;
      return false;
    });
    if (!temTrabalho) {
      autoProcessouRef.current = true;
      return;
    }

    autoProcessouRef.current = true;
    toast('Processando fila automaticamente...', { icon: <Zap className="w-4 h-4" /> });

    const resumo = { vinculadas: 0, aprovadas: 0, xmls_arquivados: 0, baixa_confianca: 0 };

    try {
      // ---- Fase 1 — Vinculação local XML↔PDF ----
      try {
        const r1 = await tentarVincularLista(lista || []);
        resumo.vinculadas = (r1?.vinculadosXml || 0) + (r1?.vinculadosRecibo || 0);
      } catch (e) { console.warn('autoPipeline Fase 1:', e?.message || e); }

      // ---- Fase 2 — Busca Drive/Gmail de XMLs faltantes ----
      try {
        await base44.functions.invoke('conciliarEEnviarNFsPipeline', {
          triggeredBy: 'auto_background',
        });
      } catch (e) { console.warn('autoPipeline Fase 2:', e?.message || e); }

      try { lista = await fetchFullList(); } catch { /* mantém lista anterior */ }

      // ---- Fase 3 — Preenchimento IA histórico (lotes de 20) ----
      const pendentesFase3 = (lista || []).filter((i) => {
        const tipo = i.tipo_detectado || getTipoByFile(i);
        if (tipo !== 'NOTA_FISCAL_PDF') return false;
        const status = String(i.status_processamento || '').toUpperCase();
        if (!['AGUARDANDO_REVISAO', 'RASCUNHO', 'ENVIADO'].includes(status)) return false;
        if (i.ocultar_entrada_unica) return false;
        if (i.entidade_destino_id) return false;
        const ia = i.resultado_ia || {};
        const jaTemRubrica = !!(i.rubrica_id_sugerida || ia.rubrica_id);
        const jaHistorico =
          ia.preenchido_por_ia_historico === true && Number(ia.ia_historico_score || 0) >= 70;
        return !jaTemRubrica || !jaHistorico;
      });

      for (let i = 0; i < pendentesFase3.length; i += IA_BATCH) {
        const lote = pendentesFase3.slice(i, i + IA_BATCH).map((p) => p.id);
        if (lote.length === 0) continue;
        try {
          await base44.functions.invoke('preencherNFsComHistoricoIA', { intake_ids: lote });
        } catch (e) { console.warn('autoPipeline Fase 3 lote:', e?.message || e); }
      }

      try { lista = await fetchFullList(); } catch { /* mantém */ }

      // ---- Fase 4 & 5 — Confiança + Auto-aprovação ----
      const nfsPdf = (lista || []).filter((i) => {
        const tipo = i.tipo_detectado || getTipoByFile(i);
        if (tipo !== 'NOTA_FISCAL_PDF') return false;
        const status = String(i.status_processamento || '').toUpperCase();
        if (!['AGUARDANDO_REVISAO', 'RASCUNHO'].includes(status)) return false;
        if (i.ocultar_entrada_unica) return false;
        if (i.entidade_destino_id) return false; // já tem PurchaseRequest vinculada
        if (String(i.duplicidade_status || '').toUpperCase() === 'CONFIRMADA') return false;
        if (i.duplicada_financeira) return false;
        return true;
      });

      for (const nf of nfsPdf) {
        const score = calcularConfianca(nf);
        if (score >= CONFIANCA_MINIMA) {
          try {
            const r = await enviarIntakeParaAprovacao(nf, {
              statusInicial: 'APROVADO_COORD',
              aprovadorNome: 'Sistema IA',
              autoAprovado: true,
            });
            if (r?.ok) resumo.aprovadas++;
            else resumo.baixa_confianca++;
          } catch (e) {
            console.warn('autoPipeline Fase 5:', e?.message || e);
            resumo.baixa_confianca++;
          }
        } else {
          resumo.baixa_confianca++;
        }
      }

      // ---- Fase 6 — XMLs órfãos ----
      const agora = new Date();
      const mesPasta = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
      const xmlsOrfaos = (lista || []).filter((i) => {
        const tipo = i.tipo_detectado || getTipoByFile(i);
        if (tipo !== 'NOTA_FISCAL_XML') return false;
        if (i.ocultar_entrada_unica) return false;
        if (i.grupo_status === 'COMPLETO' || i.nf_pdf_intake_id) return false;
        return true;
      });

      for (const xml of xmlsOrfaos) {
        try {
          await base44.entities.DocumentIntake.update(xml.id, {
            ocultar_entrada_unica: true,
            status_processamento: 'ARQUIVADO',
          });
          await base44.entities.BackupLog.create({
            backup_type: 'drive_nf_sync_mensal',
            entity_type: 'DocumentIntake_XML_ORFAO',
            entity_id: xml.id,
            file_name: xml.file_name_original || '',
            status: 'concluido',
            processed_at: agora.toISOString(),
            details: `XML órfão arquivado da fila. Pasta destino sugerida: NFs/${mesPasta}/XMLs-Orfaos`,
            triggered_by: 'scheduled',
          }).catch(() => {});
          resumo.xmls_arquivados++;
        } catch (e) { console.warn('autoPipeline Fase 6:', e?.message || e); }
      }

      // ---- Recarga final da UI ----
      try { await carregarIntakes(); } catch { /* silencioso */ }

      toast.success(
        `${resumo.aprovadas} aprovadas automaticamente, ${resumo.vinculadas} vinculadas, ${resumo.xmls_arquivados} XMLs arquivados, ${resumo.baixa_confianca} pendentes com baixa confiança.`
      );
    } catch (e) {
      console.error('autoPipeline erro global:', e?.message || e);
    }
  }

  return { executar, autoProcessouRef };
}