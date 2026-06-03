import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Trash2, Archive } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function CorrecaoRubricasDuplicadas() {
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [confirmado, setConfirmado] = useState(false);

  const handleExecutarCorrecao = async () => {
    if (!confirmado) {
      toast.error('Confirme que deseja executar a correção');
      return;
    }

    setExecutando(true);
    try {
      const response = await base44.functions.invoke('corrigirRubricasDuplicadas', {});
      setResultado(response.data);
      toast.success('Correção executada com sucesso!');
    } catch (error) {
      toast.error('Erro na correção: ' + error.message);
      setResultado({ erro: error.message });
    } finally {
      setExecutando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Correção de Rubricas Duplicadas</h1>
        <p className="text-slate-600 mt-1">
          Esta ferramenta corrige duplicidades de rubricas, migrando para a estrutura oficial do 3º Aditivo.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Ação Irreversível</AlertTitle>
        <AlertDescription className="mt-2">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Rubricas com grupos duplicados serão inativadas ou excluídas</li>
            <li>Solicitações de compra vinculadas serão migradas para rubricas oficiais</li>
            <li>Valores utilizados serão somados às rubricas oficiais correspondentes</li>
            <li>Saldos serão recalculados automaticamente</li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Executar Correção</CardTitle>
          <CardDescription>
            Analisa todas as rubricas e corrige duplicidades conforme mapeamento oficial
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="confirmar"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="confirmar" className="text-sm text-slate-700">
              Confirmo que compreendo as consequências desta operação e desejo executar a correção
            </label>
          </div>

          <Button
            onClick={handleExecutarCorrecao}
            disabled={!confirmado || executando}
            className="w-full"
          >
            {executando ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Executando correção...
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 mr-2" />
                Executar Correção de Rubricas Duplicadas
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <div className="space-y-4">
          {resultado.sucesso ? (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-5 h-5" />
                  Correção Concluída
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-green-900 mb-4">{resultado.mensagem}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-green-700 font-semibold">Total Analisado</p>
                    <p className="text-green-900 text-lg">{resultado.resumo.total_rubricas_analisadas}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-semibold">Rubricas Oficiais</p>
                    <p className="text-green-900 text-lg">{resultado.resumo.rubricas_oficiais_mantidas}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-semibold">Inativadas</p>
                    <p className="text-green-900 text-lg">{resultado.resumo.rubricas_inativadas}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-semibold">Excluídas</p>
                    <p className="text-green-900 text-lg">{resultado.resumo.rubricas_excluidas_fisicamente}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-semibold">Vínculos Migrados</p>
                    <p className="text-green-900 text-lg">{resultado.resumo.vinculos_migrados}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-semibold">Total Previsto Ativo</p>
                    <p className="text-green-900 text-lg">
                      R$ {resultado.resumo.total_previsto_ativo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {resultado.resumo.diferenca_valor_oficial !== 0 && (
                  <Alert className="mt-4 bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <AlertTitle className="text-amber-800">Diferença Orçamentária</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Diferença em relação ao valor oficial: R$ {Math.abs(resultado.resumo.diferenca_valor_oficial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-5 h-5" />
                  Erro na Correção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-900">{resultado.erro}</p>
              </CardContent>
            </Card>
          )}

          {resultado.logs && resultado.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Log Detalhado ({resultado.logs.length} registros)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-2 text-xs font-mono">
                  {resultado.logs.map((log, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded border">
                      <p className="font-semibold text-slate-700">{log.acao}</p>
                      <p className="text-slate-600">Rubrica: {log.rubrica_nome} (ID: {log.rubrica_id})</p>
                      {log.grupo_original && <p className="text-slate-600">Grupo original: {log.grupo_original}</p>}
                      {log.grupo_oficial && <p className="text-slate-600">Grupo oficial: {log.grupo_oficial}</p>}
                      {log.motivo && <p className="text-slate-600">Motivo: {log.motivo}</p>}
                      {log.data && <p className="text-slate-500">{log.data}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}