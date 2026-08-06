import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ScanLine, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Padrão de nome interno do sistema: 2026-07__ESTUDIO_FOLHA__NF-03__nf-pdf__sol-04d6d698.pdf
const SISTEMA_NAME_REGEX = /^\d{4}-\d{2}__/;
const PARSE_REGEX = /^(\d{4})-(\d{2})__(.+?)__NF-(\d+)__nf-pdf__sol-([a-f0-9]+)\.pdf$/i;
const STATUS_EXCLUIDOS = new Set(['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO']);
const BATCH_SIZE = 5;
const DELAY_ENTRE_LOTES_MS = 500;

function titleCase(str) {
  return (str || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();
}

function parseSistemaName(fileName) {
  const m = PARSE_REGEX.exec(fileName || '');
  if (!m) return null;
  const [, ano, mes, fornecedorRaw, nfNumero] = m;
  const fornecedor = titleCase(fornecedorRaw.replace(/_/g, ' '));
  return { ano, mes, fornecedor, nfNumero };
}

function formatValorBR(v) {
  const num = Number(v) || 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function centroCustoLabel(centroCusto) {
  return /noturno/i.test(centroCusto || '') ? 'NOTURNO NOS MUSEUS 2026' : 'MUSEUS CENTRO';
}

function buildNomeOficial({ nfNumero, fornecedor, centroCusto, valor }) {
  const num = nfNumero || 'SEM-NUM';
  const forn = (fornecedor || 'FORNECEDOR').substring(0, 40);
  const label = centroCustoLabel(centroCusto);
  const val = formatValorBR(valor);
  return `NF-${num} - ${forn} - ${label} - R$ ${val}.pdf`;
}

/**
 * Botão "Reanalisar NFs com nome de sistema" para o PainelSyncDrive.
 * Filtra DocumentIntake com file_name_original no padrão interno do sistema
 * /^\d{4}-\d{2}__/ (ex: 2026-07__ESTUDIO_FOLHA__NF-03__nf-pdf__sol-xxx.pdf),
 * ainda não renomeados (file_name_final === file_name_original) e com status
 * diferente de APROVADO/ENVIADO_APROVACAO/DELETADO.
 *
 * Ao confirmar, itera em lotes de 5 disparando processarNotaFiscalComClaude
 * (OCR completo via GPT-4o) para cada intake. Após cada chamada bem-sucedida,
 * aplica a regra de renomeação oficial usando os dados do OCR com fallback
 * nos dados embutidos no próprio nome de sistema (número, fornecedor).
 */
export default function ReanalisarNFsSistemaButton({ intakes, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [log, setLog] = useState([]);

  const alvos = useMemo(() => {
    return (intakes || []).filter((i) => {
      if (!i?.file_name_original || !SISTEMA_NAME_REGEX.test(i.file_name_original)) return false;
      if (STATUS_EXCLUIDOS.has(String(i.status_processamento || '').toUpperCase())) return false;
      if (!i?.arquivo_original_url) return false;
      // Idempotente: pula se já foi renomeado (file_name_final diferente do original)
      if (i.file_name_final && i.file_name_final !== i.file_name_original) return false;
      return true;
    });
  }, [intakes]);

  const count = alvos.length;
  const exemplos = alvos.slice(0, 5);

  const handleConfirm = useCallback(async () => {
    if (processing || count === 0) return;
    setProcessing(true);
    setLog([]);
    setProgress({ current: 0, total: count, name: alvos[0]?.file_name_original || '' });

    let renomeadasOCR = 0;
    let renomeadasFallback = 0;
    let comErro = 0;
    let processados = 0;
    const novosLog = [];

    for (let i = 0; i < alvos.length; i += BATCH_SIZE) {
      const lote = alvos.slice(i, i + BATCH_SIZE);

      // Dispara o lote em paralelo (5 por vez)
      await Promise.all(
        lote.map(async (intake) => {
          const oldName = intake.file_name_original;
          processados++;
          setProgress({ current: processados, total: count, name: oldName });
          try {
            await base44.functions.invoke('processarNotaFiscalComClaude', {
              intake_id: intake.id,
              file_url: intake.arquivo_original_url,
            });

            // Busca o intake atualizado para verificar o que o OCR extraiu
            const atualizado = await base44.entities.DocumentIntake.get(intake.id).catch(() => null);

            const ocrNome = atualizado?.nf_emitente_nome || atualizado?.fornecedor_nome || '';
            const ocrNumero = atualizado?.nf_numero || '';
            const ocrValor = Number(atualizado?.nf_valor_total) || 0;
            const centroCusto = atualizado?.centro_custo || intake.centro_custo || '';

            // Fallback do nome de sistema para campos que o OCR não preencheu
            const parsed = parseSistemaName(oldName);
            const finalNumero = ocrNumero || parsed?.nfNumero || '';
            const finalFornecedor = ocrNome || parsed?.fornecedor || '';
            const finalValor = ocrValor || 0;

            const novoNome = buildNomeOficial({
              nfNumero: finalNumero,
              fornecedor: finalFornecedor,
              centroCusto,
              valor: finalValor,
            });

            const nomeAtual = atualizado?.file_name_final || '';
            if (novoNome && novoNome !== nomeAtual) {
              await base44.entities.DocumentIntake.update(intake.id, { file_name_final: novoNome }).catch(() => {});
            }

            if (ocrNome || ocrNumero) {
              renomeadasOCR++;
              novosLog.push({ old: oldName, new: novoNome, status: 'ocr' });
            } else {
              renomeadasFallback++;
              novosLog.push({ old: oldName, new: novoNome, status: 'fallback' });
            }
          } catch (e) {
            comErro++;
            novosLog.push({ old: oldName, new: '', status: 'erro', erro: e?.message || String(e) });
          }
          setLog([...novosLog]);
        })
      );

      // Delay entre lotes para evitar rate limit
      if (i + BATCH_SIZE < alvos.length) {
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_LOTES_MS));
      }
    }

    setProcessing(false);
    setProgress({ current: count, total: count, name: '' });
    toast.success(
      `Reanálise concluída: ${renomeadasOCR} renomeadas com dados OCR, ${renomeadasFallback} renomeadas com fallback do nome, ${comErro} com erro. Recarregando fila...`
    );
    if (typeof onRefresh === 'function') onRefresh();
  }, [alvos, count, processing, onRefresh]);

  if (count === 0) return null;

  return (
    <>
      <AlertDialog open={open} onOpenChange={(v) => !processing && setOpen(v)}>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Reanalisar por OCR as NFs importadas com nome interno do sistema"
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            Reanalisar NFs com nome de sistema
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-[10px] font-bold">
              {count}
            </span>
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reanalisar {count} NF{count !== 1 ? 's' : ''} com nome de sistema</AlertDialogTitle>
            <AlertDialogDescription>
              {count} NF{count !== 1 ? 's' : ''} com nome de sistema será{count !== 1 ? 'ão' : ''} reanalisada{count !== 1 ? 's' : ''} por OCR completo via IA. Isso sobrescreve os dados da IA Histórico com os dados reais extraídos do PDF. Tempo estimado: ~{Math.max(1, Math.ceil((count * 30) / 60))} minutos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Exemplos que serão processados:</p>
            <ul className="text-xs text-gray-600 space-y-1">
              {exemplos.map((e) => (
                <li key={e.id} className="truncate font-mono text-[11px]">{e.file_name_original}</li>
              ))}
              {count > exemplos.length && (
                <li className="text-gray-400 italic">... e mais {count - exemplos.length} documento(s)</li>
              )}
            </ul>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e?.preventDefault?.();
                handleConfirm();
              }}
              disabled={processing}
            >
              {processing ? 'Processando...' : 'Iniciar Reanálise'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {processing && (
        <div className="w-full space-y-1.5">
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {progress.current} de {progress.total}
            {progress.name && (
              <span className="block truncate text-gray-400 text-[11px] mt-0.5">{progress.name}</span>
            )}
          </p>
        </div>
      )}

      {log.length > 0 && !processing && (
        <details className="w-full rounded-lg border border-gray-100 bg-gray-50 p-2.5">
          <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
            Log de renomeação ({log.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-600 max-h-48 overflow-y-auto">
            {log.map((l, idx) => (
              <li key={idx} className="font-mono text-[11px] leading-relaxed">
                <span className="text-gray-400">{l.old}</span>
                {l.new ? (
                  <span className="text-emerald-600"> → {l.new}</span>
                ) : (
                  <span className="text-red-500"> — erro{l.erro ? `: ${l.erro}` : ''}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}