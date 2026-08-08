import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Wand2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Botão de ação em lote que dispara a função `corrigirDataEmissaoNFsDrive`.
// Corrige DATAS DE EMISSÃO ERRADAS ou ausentes (antes de 2026, formato
// inválido, string truncada como "2026-07") lendo o PDF real da NF no
// Google Drive via IA (Gemini 3 Flash). Caso a URL não funcione, busca o
// arquivo no Drive por nome/número/chave de acesso e re-faz upload para
// a IA conseguir acessar.
//
// Diferente do "PreencherDatasLoteButton", este sobrescreve datas erradas
// já preenchidas — não é idempotente no sentido restrito.
export default function CorrigirDataEmissaoErradaButton({ onConcluido, variant = 'outline' }) {
  const [open, setOpen] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [limite, setLimite] = useState(20);
  const [apenasComErro, setApenasComErro] = useState(false);

  async function executar() {
    setProcessando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('corrigirDataEmissaoNFsDrive', {
        limite,
        dryRun: false,
        apenasComErro,
      });
      const data = res?.data || res || {};
      const detalhes = Array.isArray(data.detalhes) ? data.detalhes : [];

      const corrigidos = data.corrigidos || 0;
      const semPdf = data.sem_pdf || 0;
      const iaSemData = data.ia_sem_data || 0;
      const iaDataInvalida = data.ia_data_invalida || 0;
      const iaTimeout = data.ia_timeout || 0;
      const erros = data.erros || 0;

      setResultado({ ...data, detalhesSlice: detalhes.slice(0, 10) });

      if (corrigidos > 0) {
        toast.success(
          `${corrigidos} data(s) corrigida(s) via IA. Sem PDF: ${semPdf}. IA sem data: ${iaSemData}. Timeout: ${iaTimeout}.`
        );
      } else {
        toast.warning(
          `Nenhuma data pôde ser corrigida. Sem PDF: ${semPdf}. IA sem data: ${iaSemData}. Timeout: ${iaTimeout}. Erros: ${erros}.`
        );
      }
      if (onConcluido) onConcluido();
    } catch (e) {
      console.error('Erro ao corrigir datas:', e);
      toast.error('Erro ao corrigir datas: ' + (e?.message || e));
    } finally {
      setProcessando(false);
    }
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setResultado(null);
    }
  }

  const baseClass =
    'inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100 transition-colors';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <button className={baseClass} title="Corrige datas de emissão erradas via IA lendo PDFs do Drive">
          <Wand2 className="w-3.5 h-3.5" />
          Corrigir Datas Erradas (IA)
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Corrigir datas de emissão erradas via IA</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Esta ação identifica <strong>solicitações aprovadas/pagas com datas de emissão erradas</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Data vazia ou ausente</li>
                <li>Ano anterior a 2026 (ex: 2023 — data de abertura da empresa)</li>
                <li>Formato inválido (ex: "2026-07" — truncada)</li>
              </ul>
              <p className="text-xs">
                Para cada registro: baixa o PDF da NF no Google Drive, usa IA (Gemini 3 Flash) para
                ler e extrair a <strong>data de emissão correta</strong>, ignorando datas irrelevantes
                (abertura de empresa, contratos, vencimentos). Se a URL não funcionar, busca o arquivo no
                Drive por nome/número/chave de acesso.
              </p>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Esta rotina <strong>sobrescreve datas erradas</strong> já preenchidas. Use em
                  manutenção de dados. Processa em ~22s por NF. Recomendado: lotes de 10-20 por execução.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Limite por execução
                  </label>
                  <Select value={String(limite)} onValueChange={(v) => setLimite(parseInt(v, 10))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 registros (~2 min)</SelectItem>
                      <SelectItem value="10">10 registros (~4 min)</SelectItem>
                      <SelectItem value="20">20 registros (~7 min)</SelectItem>
                      <SelectItem value="50">50 registros (~18 min)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Filtro adicional
                  </label>
                  <Select
                    value={apenasComErro ? 'sim' : 'nao'}
                    onValueChange={(v) => setApenasComErro(v === 'sim')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Todos suspeitos</SelectItem>
                      <SelectItem value="sim">Apenas com erro de backup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {resultado && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 max-h-64 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Resultado da execução
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div className="rounded-md bg-green-50 p-2 text-center">
                      <p className="font-bold text-green-700">{resultado.corrigidos || 0}</p>
                      <p className="text-[10px] uppercase">Corrigidos</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2 text-center">
                      <p className="font-bold text-slate-700">{resultado.sem_pdf || 0}</p>
                      <p className="text-[10px] uppercase">Sem PDF</p>
                    </div>
                    <div className="rounded-md bg-amber-50 p-2 text-center">
                      <p className="font-bold text-amber-700">{resultado.ia_sem_data || 0}</p>
                      <p className="text-[10px] uppercase">IA sem data</p>
                    </div>
                  </div>
                  {resultado.detalhesSlice?.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">NF</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs">Antes</TableHead>
                          <TableHead className="text-xs">Depois</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultado.detalhesSlice.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-1">{d.nf_numero || '-'}</TableCell>
                            <TableCell className="text-xs py-1 max-w-[120px] truncate" title={d.descricao}>
                              {d.descricao}
                            </TableCell>
                            <TableCell className="text-xs py-1 text-red-600">{d.data_antiga}</TableCell>
                            <TableCell className="text-xs py-1 text-green-700 font-medium">
                              {d.data_nova || '-'}
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              <Badge
                                variant="outline"
                                className={
                                  d.status === 'corrigido'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : d.status === 'sem_pdf'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }
                              >
                                {d.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processando}>Fechar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              executar();
            }}
            disabled={processando}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {processando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                Corrigindo...
              </>
            ) : (
              'Corrigir agora'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}