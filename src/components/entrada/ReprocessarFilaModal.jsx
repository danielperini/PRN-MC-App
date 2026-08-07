import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, X,
  Sparkles, Link2, Send, FileX, Eraser,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { enviarIntakeParaAprovacao, parseValorBR } from '@/lib/enviarIntakeParaAprovacao';

const FASES = [
  { key: 'limpeza', label: 'Limpeza dos dados cruzados', icon: Eraser, color: 'text-amber-600' },
  { key: 'reanalise', label: 'Leitura Profunda (lerNotaFiscalGPT)', icon: Sparkles, color: 'text-violet-600' },
  { key: 'revinculacao', label: 'Revinculação XML (critérios triplos)', icon: Link2, color: 'text-blue-600' },
  { key: 'auto_envio', label: 'Auto-envio para aprovação', icon: Send, color: 'text-emerald-600' },
  { key: 'orfaos', label: 'Arquivamento de XMLs órfãos', icon: FileX, color: 'text-slate-600' },
];

const TIMEOUT_LEITURA_PROFUNDA_MS = 90000;

// Helper: chama lerNotaFiscalGPT (leitura profunda GPT-4o estruturada) para um
// DocumentIntake PDF. Sequencial, com timeout de 90s. Mapeia o resultado
// validado para o formato esperado por calcularConfiancaNF e
// enviarIntakeParaAprovacao, e persiste tudo no DocumentIntake.
// Retorna { ok, resultado, error }.
async function chamarLeituraProfunda(intake) {
  const acionar = base44.functions.invoke('lerNotaFiscalGPT', {
    intake_id: intake.id,
    file_url: intake.arquivo_original_url,
  });
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('Timeout 90s na leitura profunda')), TIMEOUT_LEITURA_PROFUNDA_MS)
  );
  const res = await Promise.race([acionar, timeout]).catch((e) => ({
    ok: false,
    error: e?.message || String(e),
  }));
  if (!res || !res.ok || !res.resultado) {
    return { ok: false, error: res?.error || 'sem resultado' };
  }
  const r = res.resultado;
  const resultadoIa = {
    ...r,
    nf_numero: String(r.numero_nota || '').replace(/\D/g, ''),
    nf_emitente_nome: r.fornecedor_nome || '',
    nf_emitente_cpf_cnpj: String(r.fornecedor_cnpj || r.fornecedor_cpf || '').replace(/\D/g, ''),
    nf_valor_total: r.valor_total || 0,
    nf_data_emissao: r.data_emissao || '',
    valor: r.valor_total || 0,
    valor_total: r.valor_total || 0,
    rubrica_id: r.rubrica_id || null,
    rubrica_nome: r.rubrica_nome || '',
    centro_custo_sugerido: r.centro_custo || '',
    meta_id: r.meta_id || null,
    descricao_servico: r.descricao_normalizada || '',
    ia_historico_score: Math.round((r.score || 0) * 10),
    inconsistencias: r.campos_incertos || [],
    alertas: r.alertas || [],
    status_revisao: r.status_revisao || '',
    nota_cancelada: r.nota_cancelada || false,
    fonte: 'lerNotaFiscalGPT',
    processado_em: new Date().toISOString(),
  };

  try {
    await base44.entities.DocumentIntake.update(intake.id, {
      resultado_ia: resultadoIa,
      status_processamento: 'AGUARDANDO_REVISAO',
      rubrica_id_sugerida: r.rubrica_id || null,
      rubrica_nome_sugerida: r.rubrica_nome || '',
      centro_custo: r.centro_custo || '',
      nf_numero: resultadoIa.nf_numero,
      nf_emitente_nome: r.fornecedor_nome || '',
      nf_emitente_cpf_cnpj: resultadoIa.nf_emitente_cpf_cnpj,
      nf_valor_total: r.valor_total || null,
      nf_data_emissao: r.data_emissao || '',
      fornecedor_nome: r.fornecedor_nome || '',
      fornecedor_cpf_cnpj: resultadoIa.nf_emitente_cpf_cnpj,
      erros_validacao: r.alertas || [],
    });
  } catch (e) {
    console.warn('[leituraProfunda] update falhou:', e?.message || e);
  }

  return { ok: true, resultado: resultadoIa };
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

// Pontua a confiança da análise IA da NF para decidir auto-envio.
// Máximo 100: número (20) + CNPJ (20) + valor (25) + data (5) + rubrica (15) + centro_custo (15).
function calcularConfiancaNF(intake) {
  const ia = intake?.resultado_ia || {};
  let score = 0;
  if (onlyDigits(ia.nf_numero || intake?.nf_numero).length >= 3) score += 20;
  if (onlyDigits(ia.nf_emitente_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || intake?.fornecedor_cpf_cnpj).length >= 11) score += 20;
  const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || intake?.nf_valor_total || 0);
  if (valor > 0) score += 25;
  if (String(ia.nf_data_emissao || ia.data_emissao || intake?.nf_data_emissao || '').trim()) score += 5;
  if (ia.rubrica_id || intake?.rubrica_id_sugerida || intake?.rubrica_id) score += 15;
  if (ia.centro_custo_sugerido || intake?.centro_custo) score += 15;
  return Math.min(score, 100);
}

// Critérios triplos: número NF, CNPJ, valor. Pelo menos 2/3 coincidem.
// Score: 3/3 = 100, 2/3 = 90, <2 = 0.
function calcularScoreVinculoTriplo(pdfIa, xmlData) {
  let matches = 0;
  const pdfNum = onlyDigits(pdfIa?.nf_numero || '');
  const xmlNum = onlyDigits(xmlData?.nf_numero || '');
  if (pdfNum && xmlNum && pdfNum === xmlNum) matches++;

  const pdfCnpj = onlyDigits(pdfIa?.nf_emitente_cpf_cnpj || pdfIa?.fornecedor_cpf_cnpj || '');
  const xmlCnpj = onlyDigits(xmlData?.nf_emitente_cpf_cnpj || xmlData?.fornecedor_cpf_cnpj || '');
  if (pdfCnpj && xmlCnpj && pdfCnpj === xmlCnpj) matches++;

  const pdfValor = parseValorBR(pdfIa?.nf_valor_total || 0);
  const xmlValor = parseValorBR(xmlData?.nf_valor_total || 0);
  if (pdfValor > 0 && xmlValor > 0 && Math.abs(pdfValor - xmlValor) < 0.02) matches++;

  if (matches === 3) return 100;
  if (matches === 2) return 90;
  return 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ReprocessarFilaModal({ open, intakes, onClose, onConcluir, currentUserName }) {
  const [running, setRunning] = useState(false);
  const [faseKey, setFaseKey] = useState(null);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [resumo, setResumo] = useState(null);

  const pdfsParaReprocessar = useMemo(
    () =>
      (intakes || []).filter((i) => {
        if ((i.tipo_detectado || '') !== 'NOTA_FISCAL_PDF') return false;
        const status = String(i.status_processamento || '').toUpperCase();
        return ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO'].includes(status);
      }),
    [intakes]
  );

  const xmlsParaReprocessar = useMemo(
    () =>
      (intakes || []).filter(
        (i) => (i.tipo_detectado || '') === 'NOTA_FISCAL_XML' && !i.ocultar_entrada_unica && i.grupo_status !== 'COMPLETO'
      ),
    [intakes]
  );

  const faseIndex = faseKey ? FASES.findIndex((f) => f.key === faseKey) : -1;

  async function recarregarPorIds(ids) {
    if (!ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25);
      const res = await base44.entities.DocumentIntake.filter({ id: { $in: batch } }).catch(() => []);
      out.push(...(res || []));
    }
    return out;
  }

  async function parseXmlViaLLM(xml) {
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt:
          'Extraia do XML fiscal anexado os seguintes campos do EMITENTE/PRESTADOR: nf_numero (somente dígitos), nf_emitente_cpf_cnpj (CNPJ ou CPF do emitente, somente dígitos), nf_valor_total (número decimal). Retorne apenas JSON válido.',
        file_urls: [xml.arquivo_original_url],
        response_json_schema: {
          type: 'object',
          properties: {
            nf_numero: { type: 'string' },
            nf_emitente_cpf_cnpj: { type: 'string' },
            nf_valor_total: { type: 'number' },
          },
        },
      });
      return res || {};
    } catch (e) {
      console.warn('Falha ao parsear XML via LLM:', e?.message || e);
      return null;
    }
  }

  async function runPipeline() {
    if (pdfsParaReprocessar.length === 0 && xmlsParaReprocessar.length === 0) {
      toast.info('Nenhuma NF pendente para reprocessar.');
      return;
    }

    setRunning(true);
    setResumo(null);

    const totals = {
      limpos: 0,
      xmls_desvinculados: 0,
      reanalisados: 0,
      xmls_parseados: 0,
      revinculados: 0,
      enviados: 0,
      xmls_arquivados: 0,
      pendentes_revisao: 0,
      erros: [],
    };

    try {
      // === FASE 1: LIMPEZA ===
      setFaseKey('limpeza');
      setProgresso({ atual: 0, total: pdfsParaReprocessar.length });

      for (let i = 0; i < pdfsParaReprocessar.length; i++) {
        const intake = pdfsParaReprocessar[i];
        try {
          // Desvincula o XML que estava associado (possivelmente incorreto)
          if (intake.nf_xml_intake_id) {
            await base44.entities.DocumentIntake.update(intake.nf_xml_intake_id, {
              nf_pdf_intake_id: null,
              nf_pdf_url: null,
              grupo_status: 'INCOMPLETO',
              ocultar_entrada_unica: false,
            }).catch(() => {});
            totals.xmls_desvinculados++;
          }

          await base44.entities.DocumentIntake.update(intake.id, {
            resultado_ia: {},
            nf_xml_intake_id: null,
            nf_xml_url: null,
            nf_pdf_intake_id: null,
            fornecedor_nome: '',
            fornecedor_cpf_cnpj: '',
            nf_emitente_nome: '',
            nf_emitente_cpf_cnpj: '',
            nf_numero: '',
            nf_valor_total: null,
            grupo_status: 'INCOMPLETO',
            rubrica_id_sugerida: null,
            rubrica_nome_sugerida: null,
            rubrica_id: null,
            rubrica_nome: null,
            centro_custo: null,
            status_processamento: 'ENVIADO',
            erros_validacao: [],
            enviado_sem_xml: false,
            xml_obrigatorio_pendente: false,
            xml_pendente_desde: null,
          });
          totals.limpos++;
        } catch (e) {
          totals.erros.push(`Limpeza ${intake.file_name_original || intake.id}: ${e?.message || e}`);
        }
        setProgresso({ atual: i + 1, total: pdfsParaReprocessar.length });
      }

      // === FASE 2: LEITURA PROFUNDA (lerNotaFiscalGPT, sequencial 1-por-vez) ===
      // Cada PDF é processado individualmente com timeout de 90s por documento
      // para evitar rate limit. Em caso de falha/timeout, mantém AGUARDANDO_REVISAO
      // com mensagem de erro no card.
      setFaseKey('reanalise');
      setProgresso({ atual: 0, total: pdfsParaReprocessar.length });

      for (let i = 0; i < pdfsParaReprocessar.length; i++) {
        const intake = pdfsParaReprocessar[i];
        setProgresso({ atual: i, total: pdfsParaReprocessar.length });
        try {
          await base44.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'ANALISANDO_IA',
            erros_validacao: [],
          }).catch(() => {});

          const out = await chamarLeituraProfunda(intake);
          if (out.ok) {
            totals.reanalisados++;
          } else {
            await base44.entities.DocumentIntake.update(intake.id, {
              status_processamento: 'AGUARDANDO_REVISAO',
              erros_validacao: [`Leitura profunda falhou: ${out.error || 'resposta inválida'}`],
            }).catch(() => {});
            totals.erros.push(
              `Leitura profunda ${intake.file_name_original || intake.id}: ${out.error || 'sem resultado'}`
            );
          }
        } catch (e) {
          await base44.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'AGUARDANDO_REVISAO',
            erros_validacao: [`Leitura profunda: ${e?.message || e}`],
          }).catch(() => {});
          totals.erros.push(
            `Leitura profunda ${intake.file_name_original || intake.id}: ${e?.message || e}`
          );
        }
        setProgresso({ atual: i + 1, total: pdfsParaReprocessar.length });
        // Delay curto entre documentos para evitar rate limit do GPT-4o
        await sleep(250);
      }

      // Parse dos XMLs para revinculação (em batches de 5)
      const xmlsData = [];
      for (let i = 0; i < xmlsParaReprocessar.length; i += 5) {
        const batch = xmlsParaReprocessar.slice(i, i + 5);
        await Promise.all(
          batch.map(async (xml) => {
            let data = xml.resultado_ia || null;
            if (!data || (!data.nf_numero && !data.nf_emitente_cpf_cnpj)) {
              data = await parseXmlViaLLM(xml);
              if (data) totals.xmls_parseados++;
            }
            if (data && (data.nf_numero || data.nf_emitente_cpf_cnpj || data.nf_valor_total)) {
              xmlsData.push({ ref: xml, data });
            }
          })
        );
      }

      // Recarrega PDFs reanalisados
      const pdfsReanalisados = await recarregarPorIds(pdfsParaReprocessar.map((p) => p.id));

      // === FASE 3: REVINCULAÇÃO (critérios triplos) ===
      setFaseKey('revinculacao');
      const pdfsParaVincular = pdfsReanalisados.filter((p) => !p.nf_xml_intake_id);
      let xmlsDisponiveis = [...xmlsData];
      setProgresso({ atual: 0, total: pdfsParaVincular.length });

      for (let i = 0; i < pdfsParaVincular.length; i++) {
        const pdf = pdfsParaVincular[i];
        const pdfIa = pdf.resultado_ia || {};
        let melhorXml = null;
        let melhorScore = 0;
        let melhorIdx = -1;

        for (let j = 0; j < xmlsDisponiveis.length; j++) {
          const xmlEntry = xmlsDisponiveis[j];
          if (xmlEntry.ref.grupo_status === 'COMPLETO' || xmlEntry.ref.nf_pdf_intake_id) continue;
          const score = calcularScoreVinculoTriplo(pdfIa, xmlEntry.data);
          if (score > melhorScore) {
            melhorScore = score;
            melhorXml = xmlEntry;
            melhorIdx = j;
          }
        }

        if (melhorXml && melhorScore >= 85) {
          try {
            await base44.entities.DocumentIntake.update(pdf.id, {
              nf_xml_intake_id: melhorXml.ref.id,
              nf_xml_url: melhorXml.ref.arquivo_original_url,
              grupo_status: 'COMPLETO',
              xml_obrigatorio_pendente: false,
              enviado_sem_xml: false,
              xml_pendente_desde: null,
            });
            await base44.entities.DocumentIntake.update(melhorXml.ref.id, {
              nf_pdf_intake_id: pdf.id,
              nf_pdf_url: pdf.arquivo_original_url,
              grupo_status: 'COMPLETO',
              ocultar_entrada_unica: true,
            });
            totals.revinculados++;
            xmlsDisponiveis.splice(melhorIdx, 1);
          } catch (e) {
            totals.erros.push(`Vinculação ${pdf.file_name_original || pdf.id}: ${e?.message || e}`);
          }
        }
        setProgresso({ atual: i + 1, total: pdfsParaVincular.length });
      }

      // === FASE 4: AUTO-ENVIO ===
      setFaseKey('auto_envio');
      const pdfsFinais = await recarregarPorIds(pdfsReanalisados.map((p) => p.id));
      // Critério de auto-envio (PRD): rubrica_id + centro_custo + valor > 0 +
      // CNPJ preenchido + score ≥70 (ia_historico_score ou confiança combinada ou
      // status_revisao PRE_APROVADO). Não exige XML vinculado. Exclui notas
      // bloqueadas/canceladas.
      const autoEnviaveis = pdfsFinais.filter((p) => {
        const ia = p.resultado_ia || {};
        const rubrica_id = p.rubrica_id_sugerida || p.rubrica_id || ia.rubrica_id;
        const centro_custo = p.centro_custo || ia.centro_custo_sugerido;
        const valor = parseValorBR(ia.nf_valor_total || ia.valor || p.nf_valor_total || 0);
        const cnpj = onlyDigits(
          ia.nf_emitente_cpf_cnpj || p.nf_emitente_cpf_cnpj || p.fornecedor_cpf_cnpj || ''
        );
        const statusRevisao = String(ia.status_revisao || '').toUpperCase();
        if (!rubrica_id || !centro_custo || valor <= 0 || cnpj.length < 11) return false;
        if (statusRevisao === 'BLOQUEADO' || ia.nota_cancelada === true) return false;
        const scoreCC = calcularConfiancaNF(p);
        const iaScore = Number(ia.ia_historico_score || 0);
        const scoreRevisaoNum = Number(ia.score || 0);
        if (scoreCC >= 70) return true;
        if (iaScore >= 70) return true;
        if (statusRevisao === 'PRE_APROVADO' || scoreRevisaoNum >= 7) return true;
        return false;
      });

      setProgresso({ atual: 0, total: autoEnviaveis.length });
      for (let i = 0; i < autoEnviaveis.length; i++) {
        const intake = autoEnviaveis[i];
        try {
          const r = await enviarIntakeParaAprovacao(intake);
          if (r?.ok) totals.enviados++;
          else totals.erros.push(`Auto-envio ${intake.file_name_original || intake.id}: ${r?.motivo || 'falha'}`);
        } catch (e) {
          totals.erros.push(`Auto-envio ${intake.file_name_original || intake.id}: ${e?.message || e}`);
        }
        setProgresso({ atual: i + 1, total: autoEnviaveis.length });
      }

      // === FASE 5: ARQUIVAMENTO DE XMLS ÓRFÃOS ===
      setFaseKey('orfaos');
      const xmlsFinal = await recarregarPorIds(xmlsParaReprocessar.map((x) => x.id));
      const orfaos = xmlsFinal.filter((x) => !x.nf_pdf_intake_id && x.grupo_status !== 'COMPLETO');
      setProgresso({ atual: 0, total: orfaos.length });
      for (let i = 0; i < orfaos.length; i++) {
        try {
          await base44.entities.DocumentIntake.update(orfaos[i].id, {
            ocultar_entrada_unica: true,
          });
          totals.xmls_arquivados++;
        } catch (e) {
          totals.erros.push(`Orfão ${orfaos[i].file_name_original || orfaos[i].id}: ${e?.message || e}`);
        }
        setProgresso({ atual: i + 1, total: orfaos.length });
      }

      // Pendentes para revisão manual = PDFs reanalisados que não foram auto-enviados
      const pendentes = pdfsFinais.filter((p) => {
        const status = String(p.status_processamento || '').toUpperCase();
        return status === 'AGUARDANDO_REVISAO' && !p.entidade_destino_id;
      });
      totals.pendentes_revisao = pendentes.length;

      setResumo(totals);
      toast.success('Reprocessamento da fila concluído.');
      if (onConcluir) await onConcluir();
    } catch (e) {
      console.error('Erro no pipeline de reprocessamento:', e);
      totals.erros.push(`Erro geral: ${e?.message || e}`);
      setResumo(totals);
      toast.error('Erro no reprocessamento: ' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  }

  function handleClose() {
    if (running) {
      toast.warning('Aguarde o término do reprocessamento para fechar.');
      return;
    }
    setFaseKey(null);
    setProgresso({ atual: 0, total: 0 });
    setResumo(null);
    if (onClose) onClose();
  }

  const progressPercent = progresso.total > 0 ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 text-amber-600 ${running ? 'animate-spin' : ''}`} />
            Reprocessar Fila — Correção de dados IA cruzados
          </DialogTitle>
          <DialogDescription>
            Limpa os dados IA contaminados, realiza <strong>leitura profunda</strong> de cada NF via
            GPT-4o (lerNotaFiscalGPT, sequencial com timeout de 90s por documento), revincula XMLs
            com critérios triplos (número, CNPJ, valor) e envia automaticamente para aprovação as
            NFs com rubrica + centro de custo + valor + CNPJ e confiança ≥70. XMLs órfãos são
            arquivados.
          </DialogDescription>
        </DialogHeader>

        {/* Lista de fases */}
        <div className="space-y-2 my-2">
          {FASES.map((fase, idx) => {
            const Icon = fase.icon;
            const isActive = faseKey === fase.key;
            const isComplete = faseKey && idx < faseIndex;
            const isPending = !faseKey || idx > faseIndex;
            return (
              <div
                key={fase.key}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                  isActive
                    ? 'border-amber-300 bg-amber-50'
                    : isComplete
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  ) : (
                    <Icon className={`w-4 h-4 ${isPending ? 'text-slate-400' : fase.color}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      isActive ? 'text-amber-800' : isComplete ? 'text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {fase.label}
                  </p>
                  {isActive && progresso.total > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      {progresso.atual} de {progresso.total}
                    </p>
                  )}
                </div>
                {isActive && progresso.total > 0 && (
                  <span className="text-xs font-semibold text-amber-700">{progressPercent}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Barra de progresso da fase atual */}
        {running && progresso.total > 0 && (
          <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Resumo final */}
        {resumo && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800">Resumo do reprocessamento</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ResumeItem label="NFs limpas" value={resumo.limpos} color="text-amber-700" />
              <ResumeItem label="XMLs desvinculados" value={resumo.xmls_desvinculados} color="text-amber-700" />
              <ResumeItem label="NFs com leitura profunda" value={resumo.reanalisados} color="text-violet-700" />
              <ResumeItem label="XMLs parseados" value={resumo.xmls_parseados} color="text-violet-700" />
              <ResumeItem label="Vínculos criados (≥85%)" value={resumo.revinculados} color="text-blue-700" />
              <ResumeItem label="Enviados p/ aprovação (auto)" value={resumo.enviados} color="text-emerald-700" />
              <ResumeItem label="XMLs órfãos arquivados" value={resumo.xmls_arquivados} color="text-slate-700" />
              <ResumeItem label="Pendentes de revisão manual" value={resumo.pendentes_revisao} color="text-orange-700" />
            </div>
            {resumo.erros.length > 0 && (
              <details className="text-xs text-red-700">
                <summary className="cursor-pointer font-semibold">
                  {resumo.erros.length} erro(s) durante o processamento
                </summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                  {resumo.erros.slice(0, 20).map((e, i) => (
                    <li key={i} className="truncate">• {e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Aviso pré-execução */}
        {!running && !resumo && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold">Antes de iniciar:</p>
              <p className="mt-0.5">
                {pdfsParaReprocessar.length} NF(s) PDF serão limpas, reanalisadas e revinculadas.
                {xmlsParaReprocessar.length} XML(s) serão parseados e casados.
                A operação pode levar alguns minutos. Não feche esta janela durante o processamento.
              </p>
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={running}>
            {resumo ? 'Fechar' : 'Cancelar'}
          </Button>
          {!resumo && (
            <Button
              onClick={runPipeline}
              disabled={running || (pdfsParaReprocessar.length === 0 && xmlsParaReprocessar.length === 0)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Iniciar reprocessamento
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResumeItem({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5">
      <span className="text-slate-500 truncate">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}