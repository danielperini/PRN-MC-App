import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// Sufixos de máquina gerados automaticamente pelo sistema
const MACHINE_SUFFIX_RE = /__(nf-pdf|xml|comp)__sol-[a-f0-9]+/i;

function hasMachineName(nome) {
  const s = String(nome ?? '').trim();
  if (!s) return false;
  return MACHINE_SUFFIX_RE.test(s);
}

function replaceNameInUrl(url, oldName, newName) {
  const s = String(url ?? '').trim();
  if (!s || !oldName) return s;
  if (!s.includes(oldName)) return s;
  return s.split(oldName).join(newName);
}

/**
 * LimparNomesMaquinaDialog
 *
 * Remove sufixos de máquina dos nomes de arquivos de NF e substitui pelo
 * padrão canônico oficial simultaneamente no Google Drive (via função
 * `renomearNFsDrive` já deployada) e no banco (client-side via SDK).
 *
 * Fluxo:
 *  1. dry_run → conta arquivos no Drive (via função) + registros no banco
 *     com nome de máquina, mostra amostra.
 *  2. confirmação → chama renomearNFsDrive {dryRun:false} e atualiza banco
 *     client-side para cada par (de→para) retornado.
 *  3. log de resultados (nome antigo → nome novo, status ✅/❌).
 */
export default function LimparNomesMaquinaDialog({ open, onOpenChange }) {
  const [carregandoDryRun, setCarregandoDryRun] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [resultadosAcum, setResultadosAcum] = useState([]);
  const [progresso, setProgresso] = useState({ processados: 0, total: 0, renomeados: 0, banco: 0, erros: 0 });

  // Cache das listas do banco carregadas no dry_run (reusadas na execução)
  const [bancoLists, setBancoLists] = useState({ pr: [], di: [] });

  async function carregarBanco() {
    const [pr, di] = await Promise.all([
      base44.entities.PurchaseRequest.list('-created_date', 5000).catch(() => []),
      base44.entities.DocumentIntake.list('-created_date', 5000).catch(() => []),
    ]);
    const prArr = Array.isArray(pr) ? pr : [];
    const diArr = Array.isArray(di) ? di : [];
    setBancoLists({ pr: prArr, di: diArr });
    return { pr: prArr, di: diArr };
  }

  async function executarDryRun() {
    setCarregandoDryRun(true);
    setDryRunResult(null);
    try {
      // 1. Conta registros no banco com nome de máquina
      const { pr: prArr, di: diArr } = await carregarBanco();
      const prCandidatos = prArr.filter(
        (p) => hasMachineName(p.arquivo_nome) || hasMachineName(p.file_name_final),
      );
      const diCandidatos = diArr.filter((d) => hasMachineName(d.file_name_final));

      // 2. Dry-run da função de Drive (quantos arquivos serão renomeados no Drive)
      const res = await base44.functions.invoke('renomearNFsDrive', { dryRun: true });
      const d = res?.data || res || {};
      if (d?.ok === false) throw new Error(d?.error || 'Falha no diagnóstico do Drive');

      const driveRenameCount = Number(d?.stats?.renomeados || 0);
      const logsSimulados = Array.isArray(d?.logs) ? d.logs.filter((l) => l.para) : [];

      const amostra = [];
      for (const p of prCandidatos.slice(0, 8)) {
        amostra.push({
          entidade: 'PurchaseRequest',
          id: p.id,
          nome_antigo: String(p.arquivo_nome || p.file_name_final || '').trim(),
          nf_numero: p.nf_numero,
        });
      }
      for (const l of logsSimulados.slice(0, 5)) {
        amostra.push({ entidade: 'Drive', nome_antigo: l.de, nome_novo: l.para });
      }

      setDryRunResult({
        total_encontrado: prCandidatos.length + diCandidatos.length,
        total_purchase_requests: prCandidatos.length,
        total_document_intakes: diCandidatos.length,
        drive_renomeados: driveRenameCount,
        amostra,
      });
    } catch (e) {
      console.error('Erro dry_run:', e);
      toast.error('Erro ao diagnosticar: ' + (e?.message || e));
    } finally {
      setCarregandoDryRun(false);
    }
  }

  async function atualizarBancoParaPar(de, para, prArr, diArr) {
    let bancoOk = 0;
    let errosBanco = 0;

    // PurchaseRequest
    const matchPR = prArr.filter(
      (p) => String(p.arquivo_nome || '').trim() === de || String(p.file_name_final || '').trim() === de,
    );
    for (const p of matchPR) {
      const updates = {};
      if (hasMachineName(p.arquivo_nome)) updates.arquivo_nome = para;
      if (hasMachineName(p.file_name_final)) updates.file_name_final = para;
      const links = [
        'nf_pdf_url',
        'nota_fiscal_url',
        'drive_backup_nf_pdf_link',
        'drive_backup_nf_xml_link',
        'drive_backup_comprovante_link',
        'arquivo_url',
        'file_url',
      ];
      for (const c of links) {
        const cur = String(p[c] || '').trim();
        if (cur && cur.includes(de)) updates[c] = replaceNameInUrl(cur, de, para);
      }
      if (Array.isArray(p.drive_backup_files) && p.drive_backup_files.length > 0) {
        updates.drive_backup_files = p.drive_backup_files.map((f) =>
          String(f?.name || '').trim() === de ? { ...f, name: para } : f,
        );
      }
      if (Object.keys(updates).length > 0) {
        try {
          await base44.entities.PurchaseRequest.update(p.id, updates);
          bancoOk++;
        } catch (e) {
          errosBanco++;
        }
      }
    }

    // DocumentIntake
    const matchDI = diArr.filter((d) => String(d.file_name_final || '').trim() === de);
    for (const d of matchDI) {
      const updates = {};
      if (hasMachineName(d.file_name_final)) updates.file_name_final = para;
      const links = ['nf_pdf_url', 'nf_xml_url', 'recibo_url', 'arquivo_original_url'];
      for (const c of links) {
        const cur = String(d[c] || '').trim();
        if (cur && cur.includes(de)) updates[c] = replaceNameInUrl(cur, de, para);
      }
      if (Object.keys(updates).length > 0) {
        try {
          await base44.entities.DocumentIntake.update(d.id, updates);
          bancoOk++;
        } catch (e) {
          errosBanco++;
        }
      }
    }

    return { bancoOk, errosBanco };
  }

  async function executarLote() {
    if (!dryRunResult) return;
    setProcessando(true);
    setResultadosAcum([]);
    const { pr: prArr, di: diArr } = bancoLists;
    setProgresso({ processados: 0, total: dryRunResult.drive_renomeados, renomeados: 0, banco: 0, erros: 0 });

    try {
      // 1. Renomeia no Drive (função deployada processa as 3 pastas raiz)
      toast.info('Renomeando arquivos no Google Drive...');
      const res = await base44.functions.invoke('renomearNFsDrive', { dryRun: false });
      const d = res?.data || res || {};
      if (d?.ok === false) throw new Error(d?.error || 'Falha ao renomear no Drive');

      const logsRenomeados = (Array.isArray(d?.logs) ? d.logs : []).filter((l) => l.para && l.status === 'renomeado');
      const total = logsRenomeados.length;
      setProgresso((p) => ({ ...p, total }));

      let renomeadosTotal = 0;
      let bancoTotal = 0;
      let errosTotal = 0;
      const acum = [];

      // 2. Para cada par (de→para), atualiza o banco
      for (let i = 0; i < logsRenomeados.length; i++) {
        const { de, para } = logsRenomeados[i];
        const log = { nome_antigo: de, nome_novo: para, drive_renomeado: true };

        try {
          const { bancoOk, errosBanco } = await atualizarBancoParaPar(de, para, prArr, diArr);
          log.banco_atualizado = bancoOk > 0;
          log.banco_ok_count = bancoOk;
          if (errosBanco > 0) log.erro_banco = `${errosBanco} registro(s) falharam`;
          renomeadosTotal++;
          bancoTotal += bancoOk;
          errosTotal += errosBanco;
        } catch (e) {
          log.erro_banco = String(e?.message || e);
          errosTotal++;
        }

        acum.push(log);
        setProgresso({
          processados: i + 1,
          total,
          renomeados: renomeadosTotal,
          banco: bancoTotal,
          erros: errosTotal,
        });
        setResultadosAcum([...acum]);
      }

      toast.success(
        `Limpeza concluída: ${renomeadosTotal} renomeados no Drive · ${bancoTotal} registros no banco atualizados · ${errosTotal} erro(s).`
      );
    } catch (e) {
      console.error('Erro lote:', e);
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setProcessando(false);
    }
  }

  function fechar() {
    if (processando) return;
    onOpenChange(false);
    setTimeout(() => {
      setDryRunResult(null);
      setResultadosAcum([]);
      setProgresso({ processados: 0, total: 0, renomeados: 0, banco: 0, erros: 0 });
      setBancoLists({ pr: [], di: [] });
    }, 300);
  }

  const pct = progresso.total > 0 ? Math.round((progresso.processados / progresso.total) * 100) : 0;
  const totalBanco = dryRunResult?.total_encontrado || 0;
  const totalDrive = dryRunResult?.drive_renomeados || 0;

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-black" />
            Limpar nomes de máquina → Padrão oficial
          </DialogTitle>
          <DialogDescription>
            Remove sufixos <code className="rounded bg-gray-100 px-1">__nf-pdf__sol-…</code>,{' '}
            <code className="rounded bg-gray-100 px-1">__xml__sol-…</code> e{' '}
            <code className="rounded bg-gray-100 px-1">__comp__sol-…</code> dos nomes de arquivos de NF,
            renomeando no Google Drive e atualizando o banco (campos <code>arquivo_nome</code>,{' '}
            <code>file_name_final</code> e links) para o padrão canônico oficial.
          </DialogDescription>
        </DialogHeader>

        {!processando && !dryRunResult && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              Esta operação afeta arquivos reais no Google Drive e registros no banco.
              Execute primeiro o diagnóstico para ver quantos arquivos serão renomeados.
            </div>
            <Button
              type="button"
              onClick={executarDryRun}
              disabled={carregandoDryRun}
              className="w-full gap-2 bg-black text-white hover:bg-gray-800"
            >
              {carregandoDryRun ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {carregandoDryRun ? 'Diagnosticando...' : 'Diagnosticar (dry-run)'}
            </Button>
          </div>
        )}

        {dryRunResult && !processando && resultadosAcum.length === 0 && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-blue-200 bg-blue-50 p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{totalBanco}</div>
                  <div className="text-xs text-blue-600">registros no banco<br />com nome de máquina</div>
                </div>
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{totalDrive}</div>
                  <div className="text-xs text-emerald-600">arquivos no Drive<br />serão renomeados</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                PurchaseRequests: <strong>{dryRunResult.total_purchase_requests}</strong> · DocumentIntakes:{' '}
                <strong>{dryRunResult.total_document_intakes}</strong>
              </div>
              {dryRunResult.amostra?.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded border border-gray-200 bg-white p-2 text-[11px]">
                  {dryRunResult.amostra.map((a, i) => (
                    <div key={i} className="truncate text-gray-600">
                      <span className="font-medium text-gray-900">{a.entidade}</span>{' '}
                      {a.nome_antigo}
                      {a.nome_novo && <span className="text-emerald-700"> → {a.nome_novo}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setDryRunResult(null)} className="flex-1">
                Voltar
              </Button>
              <Button
                type="button"
                onClick={executarLote}
                disabled={totalDrive === 0 && totalBanco === 0}
                className="flex-1 gap-2 bg-black text-white hover:bg-gray-800"
              >
                <Sparkles className="h-4 w-4" />
                Confirmar e renomear
              </Button>
            </div>
          </div>
        )}

        {processando && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>
                {progresso.total > 0
                  ? `Atualizando banco ${progresso.processados}/${progresso.total}`
                  : 'Renomeando no Google Drive...'}
              </span>
              {progresso.total > 0 && <span className="font-semibold">{pct}%</span>}
            </div>
            {progresso.total > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-black transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-center">
                <div className="font-bold text-emerald-700">{progresso.renomeados}</div>
                <div className="text-emerald-600">Drive renomeados</div>
              </div>
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-center">
                <div className="font-bold text-blue-700">{progresso.banco}</div>
                <div className="text-blue-600">Banco atualizados</div>
              </div>
              <div className="rounded border border-red-200 bg-red-50 p-2 text-center">
                <div className="font-bold text-red-700">{progresso.erros}</div>
                <div className="text-red-600">Erros</div>
              </div>
            </div>
          </div>
        )}

        {resultadosAcum.length > 0 && (
          <div className="space-y-2 py-2">
            <div className="text-xs font-semibold text-gray-700">
              Log de resultados ({resultadosAcum.length})
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-[11px]">
              {resultadosAcum.map((r, i) => {
                const okIcon = r.drive_renomeado && !r.erro_banco;
                const icone = okIcon ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                );
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 border-b border-gray-200 py-1.5 last:border-b-0"
                  >
                    <div className="mt-0.5 shrink-0">{icone}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-gray-900">{r.nome_antigo}</div>
                      {r.nome_novo && (
                        <div className="truncate font-mono text-emerald-700">→ {r.nome_novo}</div>
                      )}
                      <div className="text-gray-500">
                        drive ✓{r.banco_ok_count ? ` · banco ✓ ${r.banco_ok_count}` : ''}
                        {r.erro_banco && (
                          <span className="ml-1 text-red-600">· {r.erro_banco}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar} disabled={processando}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}