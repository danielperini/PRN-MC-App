import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, PlayCircle, Eye, Loader2 } from 'lucide-react';

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AuditarRubricasModal({ open, onClose, onConcluido }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  async function executar(dryRun) {
    setLoading(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('corrigirRubricasOrcamento3Aditivo', { dry_run: dryRun });
      setResultado(res.data);
      if (!dryRun) onConcluido?.();
    } catch (e) {
      setErro(e?.response?.data?.error || e.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setResultado(null);
    setErro(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Auditar e Corrigir Rubricas — 3º Aditivo</DialogTitle>
        </DialogHeader>

        {!resultado && !erro && (
          <div className="py-6 space-y-4">
            <p className="text-sm text-gray-600">
              Esta operação compara as rubricas do <strong>3º Aditivo</strong> com a planilha oficial e:
            </p>
            <ul className="text-sm text-gray-600 space-y-1 list-disc ml-5">
              <li>Corrige valores divergentes da planilha canônica</li>
              <li>Desativa rubricas duplicadas ou não previstas</li>
              <li>Garante o total oficial de <strong>R$ 1.401.719,85</strong></li>
              <li>Não altera rubricas do 4º Aditivo</li>
            </ul>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => executar(true)} disabled={loading} className="flex items-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Dry Run (Simular)
              </Button>
              <Button onClick={() => executar(false)} disabled={loading} className="bg-black hover:bg-gray-800 text-white flex items-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Executar Correção
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Processando rubricas…</p>
          </div>
        )}

        {erro && (
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700">Erro ao processar</p>
                <p className="text-sm text-red-600 mt-1">{erro}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setErro(null)} className="mt-4">Tentar novamente</Button>
          </div>
        )}

        {resultado && (
          <div className="space-y-6">
            {/* Resumo */}
            <div className={`rounded-xl border p-4 ${resultado.dry_run ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center gap-2 mb-3">
                {resultado.dry_run
                  ? <Eye className="w-4 h-4 text-amber-600" />
                  : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                <span className={`text-sm font-semibold ${resultado.dry_run ? 'text-amber-700' : 'text-green-700'}`}>
                  {resultado.dry_run ? 'Simulação — nenhuma alteração salva' : 'Correção aplicada com sucesso'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-500">Total Antes</p>
                  <p className="font-bold text-sm">{fmt(resultado.total_antes)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Depois</p>
                  <p className={`font-bold text-sm ${resultado.desvio_final <= 1 ? 'text-green-700' : 'text-red-600'}`}>{fmt(resultado.total_depois)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Alvo Oficial</p>
                  <p className="font-bold text-sm">{fmt(resultado.alvo)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Desvio Final</p>
                  <p className={`font-bold text-sm ${resultado.desvio_final <= 1 ? 'text-green-700' : 'text-red-600'}`}>{fmt(resultado.desvio_final)}</p>
                </div>
              </div>
            </div>

            {/* Rubricas corrigidas */}
            {resultado.corrigidas?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-gray-800">✏️ Rubricas com valor corrigido ({resultado.corrigidas.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-2 px-3">Grupo</th>
                        <th className="text-left py-2 px-3">Rubrica</th>
                        <th className="text-right py-2 px-3">Antes</th>
                        <th className="text-right py-2 px-3">Depois</th>
                        <th className="text-right py-2 px-3">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.corrigidas.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-500">{r.grupo}</td>
                          <td className="py-2 px-3 font-medium">{r.rubrica}</td>
                          <td className="py-2 px-3 text-right text-red-600">{fmt(r.valor_anterior)}</td>
                          <td className="py-2 px-3 text-right text-green-600">{fmt(r.valor_novo)}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{fmt(r.valor_novo - r.valor_anterior)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rubricas desativadas */}
            {resultado.desativadas?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-gray-800">🚫 Rubricas desativadas ({resultado.desativadas.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-2 px-3">Grupo</th>
                        <th className="text-left py-2 px-3">Rubrica</th>
                        <th className="text-right py-2 px-3">Valor</th>
                        <th className="text-left py-2 px-3">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.desativadas.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-500">{r.grupo}</td>
                          <td className="py-2 px-3 font-medium">{r.rubrica}</td>
                          <td className="py-2 px-3 text-right text-red-600">{fmt(r.valor)}</td>
                          <td className="py-2 px-3 text-gray-500">{r.motivo || 'não consta na planilha oficial'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {resultado.corrigidas?.length === 0 && resultado.desativadas?.length === 0 && (
              <div className="text-center py-4 text-green-700 text-sm font-medium">
                ✅ Nenhuma correção necessária — rubricas já estão em conformidade com a planilha oficial.
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t">
              {resultado.dry_run && (
                <Button onClick={() => executar(false)} disabled={loading} className="bg-black hover:bg-gray-800 text-white flex items-center gap-2">
                  <PlayCircle className="w-4 h-4" />
                  Executar Correção
                </Button>
              )}
              <Button variant="outline" onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}