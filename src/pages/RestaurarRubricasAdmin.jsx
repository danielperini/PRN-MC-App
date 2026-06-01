import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, PlayCircle, Eye } from 'lucide-react';

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
    </div>
  );
}