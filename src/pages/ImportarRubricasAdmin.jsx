/**
 * ImportarRubricasAdmin
 *
 * Página administrativa para importar as 72 rubricas oficiais do 3º Aditivo
 * a partir da fonte: nova_planilha_ceu_museus_centro.xlsx — aba "Rubricas alteradas".
 *
 * Operação idempotente: pode ser executada múltiplas vezes sem duplicar.
 * Acesso restrito a admin/coordenador.
 */
import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, Upload, Info } from 'lucide-react';
import { importarRubricasOficiais } from '@/lib/importarRubricasOficiais';
import { getRubricasOficiais3Aditivo, TOTAL_OFICIAL_3_ADITIVO } from '@/lib/rubricasOficiais3Aditivo';
import RequireAuth from '@/components/auth/RequireAuth';

function formatCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function StatusBadge({ ok, label }) {
  return ok
    ? <Badge className="bg-green-100 text-green-700 border-green-200">{label} ✓</Badge>
    : <Badge className="bg-red-100 text-red-700 border-red-200">{label} ✗</Badge>;
}

function ImportarRubricasAdminInner() {
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  const oficiais = useMemo(() => getRubricasOficiais3Aditivo(), []);
  const totalCalculado = useMemo(() => oficiais.reduce((acc, r) => acc + (r.valor_total || 0), 0), [oficiais]);

  const handleImportar = async () => {
    setIsRunning(true);
    setLog([]);
    setResultado(null);
    setError(null);

    try {
      const res = await importarRubricasOficiais({
        onProgress: ({ fase, msg, resultado: r }) => {
          setLog((prev) => [...prev, `[${fase}] ${msg}`]);
          if (r) setResultado(r);
        },
      });
      setResultado(res);
      setLog((prev) => [
        ...prev,
        `✅ Importação concluída: ${res.criadas} criadas, ${res.atualizadas} atualizadas, ${res.inativadas} inativadas.`,
      ]);
    } catch (err) {
      setError(err?.message || 'Erro desconhecido durante a importação.');
    }

    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-black flex items-center gap-2">
            <Upload className="w-5 h-5" /> Importar Rubricas Oficiais — 3º Aditivo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Fonte: nova_planilha_ceu_museus_centro.xlsx — aba "Rubricas alteradas". Operação idempotente.
          </p>
        </div>

        {/* Validação prévia */}
        <Card className="rounded-2xl border-gray-200">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Validação da Fonte</h2>
            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={oficiais.length === 72} label={`${oficiais.length} rubricas`} />
              <StatusBadge ok={totalCalculado === TOTAL_OFICIAL_3_ADITIVO} label={`Total: ${formatCurrency(totalCalculado)}`} />
              <StatusBadge ok label="Idempotente" />
            </div>
            {totalCalculado !== TOTAL_OFICIAL_3_ADITIVO && (
              <div className="flex gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Total calculado ({formatCurrency(totalCalculado)}) difere do esperado ({formatCurrency(TOTAL_OFICIAL_3_ADITIVO)}). Verifique a lista de rubricas.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista prévia */}
        <Card className="rounded-2xl border-gray-200">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-black uppercase tracking-wide">
              Rubricas a importar ({oficiais.length})
            </h2>
            <div className="overflow-auto max-h-64 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Rubrica</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Museu</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Escopo</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {oficiais.map((r, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-black">{r.rubrica}</td>
                      <td className="px-3 py-1.5">
                        <span className={`font-semibold ${r.museu_codigo === 'GERAL' ? 'text-gray-400' : 'text-black'}`}>
                          {r.museu_codigo}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{r.escopo_orcamentario}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-black">{formatCurrency(r.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-bold text-black text-xs">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold text-black text-xs">{formatCurrency(totalCalculado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Aviso */}
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-blue-800 text-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Operação segura e idempotente</p>
            <p className="text-xs mt-1">
              Rubricas existentes serão atualizadas (preservando valor_utilizado). Rubricas novas serão criadas.
              Rubricas do 3º Aditivo não presentes na planilha serão inativadas.
              Solicitações, pagamentos e histórico não são afetados.
            </p>
          </div>
        </div>

        {/* Botão */}
        <Button
          onClick={handleImportar}
          disabled={isRunning}
          className="bg-black text-white hover:bg-gray-900 rounded-xl px-6 gap-2"
        >
          {isRunning
            ? <><Loader2 className="w-4 h-4 animate-spin" />Importando...</>
            : <><Upload className="w-4 h-4" />Executar Importação</>}
        </Button>

        {/* Log */}
        {log.length > 0 && (
          <Card className="rounded-2xl border-gray-200">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-3">Log de execução</h2>
              <div className="font-mono text-xs space-y-1 bg-gray-50 rounded-xl p-4 max-h-48 overflow-auto">
                {log.map((line, i) => (
                  <div key={i} className={line.startsWith('✅') ? 'text-green-700' : 'text-gray-700'}>{line}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resultado */}
        {resultado && (
          <Card className="rounded-2xl border-green-200 bg-green-50">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h2 className="text-sm font-semibold text-green-800">Importação concluída</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Criadas', value: resultado.criadas },
                  { label: 'Atualizadas', value: resultado.atualizadas },
                  { label: 'Inativadas', value: resultado.inativadas },
                  { label: 'Total rubricas', value: resultado.totalRubricas },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-xl border border-green-200 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-green-600 font-semibold">{label}</p>
                    <p className="text-xl font-bold text-green-800">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge ok={resultado.validacoes?.totalCorreto} label={`Total R$ ${formatCurrency(resultado.totalOficial)}`} />
                <StatusBadge ok={resultado.validacoes?.quantidadeCorreta} label={`${resultado.totalRubricas} rubricas`} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Erro */}
        {error && (
          <Card className="rounded-2xl border-red-200 bg-red-50">
            <CardContent className="p-5">
              <div className="flex gap-3 text-red-800">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Erro durante a importação</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ImportarRubricasAdmin() {
  return (
    <RequireAuth>
      <ImportarRubricasAdminInner />
    </RequireAuth>
  );
}