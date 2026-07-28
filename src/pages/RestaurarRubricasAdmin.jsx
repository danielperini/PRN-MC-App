import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, PlayCircle, Eye, Trash2 } from 'lucide-react';

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function LimparRubricasIndevidasPanel() {
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  async function carregarPreview() {
    setLoading(true);
    setPreview(null);
    setResultado(null);
    const res = await base44.functions.invoke('limparRubricasIndevidas', { confirmar: false });
    setPreview(res.data);
    setLoading(false);
  }

  async function confirmarDelecao() {
    if (!window.confirm(`Confirmar exclusão PERMANENTE de ${preview?.total_indevidas} rubricas? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    const res = await base44.functions.invoke('limparRubricasIndevidas', { confirmar: true });
    setResultado(res.data);
    setPreview(null);
    setLoading(false);
  }

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-red-800">
          <Trash2 className="w-4 h-4" />
          Limpar Rubricas Indevidas (fora do 3º e 4º Aditivo)
        </CardTitle>
        <p className="text-xs text-slate-500">Remove permanentemente rubricas com origem diferente de "3º ADITIVO" ou "4º ADITIVO". Compras vinculadas não são alteradas.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregarPreview} disabled={loading} className="border-red-200 text-red-700 hover:bg-red-50">
            <Eye className="w-4 h-4 mr-1" />
            {loading && !preview ? 'Buscando...' : 'Ver rubricas indevidas'}
          </Button>
          {preview && preview.total_indevidas > 0 && (
            <Button size="sm" onClick={confirmarDelecao} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 mr-1" />
              {loading ? 'Deletando...' : `Deletar ${preview.total_indevidas} rubricas`}
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-700">{preview.total_indevidas} rubricas indevidas encontradas:</p>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {preview.rubricas.map((r) => (
                <div key={r.id} className="flex items-start gap-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-red-800 block truncate">{r.rubrica}</span>
                    <span className="text-red-500">{r.grupo} · {r.origem_recurso} · {fmt(r.valor_rubrica)}</span>
                  </div>
                  <Badge variant="outline" className={r.ativo ? 'border-red-300 text-red-600' : 'border-gray-300 text-gray-400'}>
                    {r.ativo ? 'ativa' : 'inativa'}
                  </Badge>
                </div>
              ))}
            </div>
            {preview.total_indevidas === 0 && (
              <p className="text-sm text-green-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Nenhuma rubrica indevida encontrada.</p>
            )}
          </div>
        )}

        {resultado && (
          <div className={`rounded-lg border p-3 text-sm space-y-2 ${resultado.total_erros > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            <p className={`font-semibold flex items-center gap-2 ${resultado.total_erros > 0 ? 'text-amber-800' : 'text-green-800'}`}>
              {resultado.total_erros > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {resultado.mensagem}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded p-2 border"><span className="text-slate-500">Deletadas</span><br /><span className="font-bold text-lg text-green-700">{resultado.total_deletadas}</span></div>
              <div className="bg-white rounded p-2 border"><span className="text-slate-500">Erros</span><br /><span className="font-bold text-lg text-red-600">{resultado.total_erros}</span></div>
            </div>
            {resultado.erros?.length > 0 && (
              <div className="text-xs text-amber-700 space-y-0.5">
                {resultado.erros.map((e, i) => <p key={i}>⚠ {e.rubrica}: {e.erro}</p>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RestaurarRubricasAdmin() {
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState(null); // 'dry' | 'real'

  async function executar(dryRun) {
    setLoading(true);
    setModo(dryRun ? 'dry' : 'real');
    setResultado(null);
    const res = await base44.functions.invoke('restaurarRubricasOficiais', { dry_run: dryRun });
    setResultado(res.data);
    setLoading(false);
  }

  const ok = resultado?.ok && !resultado?.divergencias?.length;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Restaurar Rubricas Oficiais — 3º Aditivo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Importa/atualiza as 72 rubricas oficiais. Total esperado: <strong>R$ 1.320.000,00</strong>.
          Rubricas antigas fora da tabela ficam inativas (nunca deletadas).
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => executar(true)} disabled={loading}>
          <Eye className="w-4 h-4 mr-2" />
          Pré-validar (simulação)
        </Button>
        <Button onClick={() => executar(false)} disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
          <PlayCircle className="w-4 h-4 mr-2" />
          {loading && modo === 'real' ? 'Importando...' : 'Importar / Atualizar'}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-slate-500 animate-pulse">Processando...</p>
      )}

      {resultado && (
        <Card className={ok ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {ok
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {resultado.mensagem}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-3 border">
                <p className="text-slate-500 text-xs">Rubricas oficiais</p>
                <p className="font-semibold text-lg">{resultado.total_oficiais}</p>
              </div>
              <div className="bg-white rounded p-3 border">
                <p className="text-slate-500 text-xs">Total valor</p>
                <p className="font-semibold text-lg">{fmt(resultado.total_valor)}</p>
              </div>
              {!resultado.dry_run && (
                <>
                  <div className="bg-white rounded p-3 border">
                    <p className="text-slate-500 text-xs">Criadas</p>
                    <p className="font-semibold text-lg text-green-700">{resultado.criadas}</p>
                  </div>
                  <div className="bg-white rounded p-3 border">
                    <p className="text-slate-500 text-xs">Atualizadas</p>
                    <p className="font-semibold text-lg text-blue-700">{resultado.atualizadas}</p>
                  </div>
                  <div className="bg-white rounded p-3 border col-span-2">
                    <p className="text-slate-500 text-xs">Inativadas (antigas fora da tabela)</p>
                    <p className="font-semibold text-lg text-slate-600">{resultado.inativadas}</p>
                  </div>
                </>
              )}
            </div>

            {resultado.divergencias?.length > 0 && (
              <div className="bg-amber-100 border border-amber-300 rounded p-3 space-y-1">
                <p className="font-medium text-amber-800">Divergências:</p>
                {resultado.divergencias.map((d, i) => (
                  <p key={i} className="text-amber-700 text-xs">• {d}</p>
                ))}
              </div>
            )}

            {ok && (
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-green-100 text-green-800">72 rubricas OK</Badge>
                <Badge className="bg-green-100 text-green-800">Total R$ 1.320.000,00 ✓</Badge>
                <Badge className="bg-blue-100 text-blue-800">Sem duplicatas</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <LimparRubricasIndevidasPanel />
    </div>
  );
}