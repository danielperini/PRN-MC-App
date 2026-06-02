import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CorrecaoRubricasAdmin() {
  const [loading, setLoading] = useState(false);
  const [plano, setPlano] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [logs, setLogs] = useState([]);
  const [confirmando, setConfirmando] = useState(false);

  async function executarDryRun() {
    setLoading(true);
    setErro(null);
    setPlano(null);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('corrigirRubricasOficiais', { modo: 'dry_run' });
      setPlano(res.data.plano);
      setLogs(res.data.logs || []);
    } catch (e) {
      setErro(e.message || 'Erro ao executar análise');
    } finally {
      setLoading(false);
    }
  }

  async function executarCorrecao() {
    setLoading(true);
    setErro(null);
    setConfirmando(false);
    try {
      const res = await base44.functions.invoke('corrigirRubricasOficiais', { modo: 'executar' });
      setResultado(res.data);
      setLogs(res.data.logs || []);
    } catch (e) {
      setErro(e.message || 'Erro ao executar correção');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Correção de Rubricas — 3º Aditivo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Arquiva rubricas antigas/duplicadas, migra vínculos e garante total previsto = R$ 1.320.000,00
        </p>
      </div>

      {/* Aviso */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">⚠️ Atenção — Operação administrativa irreversível</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-700">
          <li>Execute o <strong>Dry Run</strong> primeiro para revisar o plano</li>
          <li>Nenhuma rubrica com compras será deletada fisicamente</li>
          <li>Valores utilizados aprovados serão preservados</li>
          <li>Vínculos de PurchaseRequest serão migrados para rubricas oficiais</li>
          <li>Toda a operação é registrada em auditoria</li>
        </ul>
      </div>

      {/* Botão Dry Run */}
      {!resultado && (
        <Button onClick={executarDryRun} disabled={loading} variant="outline" className="w-full">
          {loading && !plano ? 'Analisando...' : '🔍 Analisar (Dry Run — sem alterar dados)'}
        </Button>
      )}

      {/* Plano */}
      {plano && !resultado && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Plano de Correção</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Rubricas oficiais identificadas</span>
                <Badge variant="outline" className="text-green-700">{plano.rubricas_oficiais_identificadas}</Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Rubricas não-oficiais</span>
                <Badge variant="outline" className="text-orange-600">{plano.rubricas_nao_oficiais}</Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Migrações de vínculos planejadas</span>
                <Badge variant="outline">{plano.migracoes_planejadas}</Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Para arquivar</span>
                <Badge variant="outline" className="text-red-600">{plano.para_arquivar}</Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Manter ativas (sem correspondência)</span>
                <Badge variant="outline" className="text-blue-600">{plano.sem_correspondencia_manter}</Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Correções decimais</span>
                <Badge variant="outline" className="text-purple-600">{plano.correcoes_decimais}</Badge>
              </div>
              <div className="flex justify-between col-span-2 pt-1">
                <span className="font-semibold">Total previsto após correção</span>
                <span className={`font-bold ${Math.abs(plano.diferenca) < 1 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmt(plano.total_previsto_apos_correcao)}
                  {Math.abs(plano.diferenca) >= 1 && <span className="text-xs ml-2">(dif: {fmt(plano.diferenca)})</span>}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Detalhes de migração */}
          {plano.detalhes?.migracoes?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Migrações de Vínculos</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs max-h-48 overflow-y-auto">
                {plano.detalhes.migracoes.map((m, i) => (
                  <div key={i} className="flex gap-2 items-start border-b pb-1">
                    <span className="text-red-500 shrink-0">{m.de}</span>
                    <span>→</span>
                    <span className="text-green-700 shrink-0">{m.para}</span>
                    <span className="text-gray-500 ml-auto shrink-0">{m.compras} compras · {fmt(m.valor)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Rubricas para arquivar */}
          {plano.detalhes?.arquivar?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-red-600">Rubricas que serão arquivadas ({plano.detalhes.arquivar.length})</CardTitle></CardHeader>
              <CardContent className="text-xs max-h-48 overflow-y-auto space-y-1">
                {plano.detalhes.arquivar.map((r, i) => (
                  <div key={i} className="text-gray-700 border-b pb-1">{r.nome}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Confirmação */}
          {!confirmando ? (
            <Button
              onClick={() => setConfirmando(true)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              disabled={loading}
            >
              Executar Correção
            </Button>
          ) : (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Confirmar execução da correção?</p>
              <p className="text-xs text-red-600">Esta operação irá arquivar rubricas, migrar vínculos e recalcular saldos. Não pode ser desfeita automaticamente.</p>
              <div className="flex gap-2">
                <Button onClick={executarCorrecao} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white flex-1">
                  {loading ? 'Executando...' : 'Confirmar e Executar'}
                </Button>
                <Button onClick={() => setConfirmando(false)} variant="outline" className="flex-1">
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {resultado?.sucesso && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader><CardTitle className="text-green-800">✅ Correção Concluída</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between border-b pb-2 col-span-2">
              <span className="font-semibold text-gray-700">Total previsto ativo</span>
              <span className={`font-bold ${Math.abs(resultado.resumo.diferenca) < 1 ? 'text-green-700' : 'text-red-600'}`}>
                {fmt(resultado.resumo.total_previsto_ativo)}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Migrações realizadas</span>
              <span className="font-semibold">{resultado.resumo.migracoes_realizadas}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Rubricas arquivadas</span>
              <span className="font-semibold">{resultado.resumo.rubricas_arquivadas}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Correções decimais</span>
              <span className="font-semibold">{resultado.resumo.correcoes_decimais}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Erros</span>
              <span className={`font-semibold ${resultado.resumo.erros > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {resultado.resumo.erros}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Total utilizado</span>
              <span className="font-semibold">{fmt(resultado.resumo.total_utilizado_ativo)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Saldo total</span>
              <span className="font-semibold">{fmt(resultado.resumo.saldo_total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Erros */}
      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Erro</p>
          <p className="mt-1 font-mono text-xs">{erro}</p>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Logs de Execução</CardTitle></CardHeader>
          <CardContent className="max-h-64 overflow-y-auto">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{logs.join('\n')}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}