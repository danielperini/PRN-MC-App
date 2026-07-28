import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, PlayCircle, Eye, Trash2 } from 'lucide-react';

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function LimparRubricasIndevidas() {
  const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const [preview, setPreview] = useState(null);
  const [resultado, setResultadoLimpeza] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function carregarPreview() {
    setLoading(true);
    setPreview(null);
    setResultadoLimpeza(null);
    setConfirmando(false);
    const res = await base44.functions.invoke('limparRubricasIndevidas', { confirmar: false });
    setPreview(res.data);
    setLoading(false);
  }

  async function executarLimpeza() {
    setLoading(true);
    const res = await base44.functions.invoke('limparRubricasIndevidas', { confirmar: true });
    setResultadoLimpeza(res.data);
    setPreview(null);
    setConfirmando(false);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> Remover Rubricas Indevidas
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Remove permanentemente as rubricas cuja <strong>origem_recurso</strong> não seja <code>3º ADITIVO</code> nem <code>4º ADITIVO</code>.
          As solicitações de compra vinculadas <strong>não são alteradas</strong>.
        </p>
      </div>

      <Button variant="outline" onClick={carregarPreview} disabled={loading} className="border-red-200 text-red-700 hover:bg-red-50">
        <Eye className="w-4 h-4 mr-2" /> Listar rubricas indevidas
      </Button>

      {loading && <p className="text-sm text-slate-500 animate-pulse">Processando...</p>}

      {preview && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {preview.total} rubrica(s) indevida(s) encontrada(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {preview.rubricas.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-white border border-amber-200 rounded px-3 py-2 text-xs">
                  <div>
                    <span className="font-medium text-slate-800">{r.rubrica}</span>
                    {r.grupo && <span className="text-slate-500 ml-2">({r.grupo})</span>}
                  </div>
                  <div className="flex items-center gap-3 text-right shrink-0">
                    <span className="text-slate-500">{r.origem_recurso || '—'}</span>
                    <span className="font-medium text-red-700">{fmt(r.valor_rubrica)}</span>
                  </div>
                </div>
              ))}
            </div>

            {!confirmando ? (
              <Button
                onClick={() => setConfirmando(true)}
                disabled={preview.total === 0}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                <Trash2 className="w-4 h-4" /> Deletar {preview.total} rubrica(s)
              </Button>
            ) : (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-red-800">⚠️ Confirme a exclusão permanente de {preview.total} rubrica(s). Esta ação não pode ser desfeita.</p>
                <div className="flex gap-2">
                  <Button onClick={executarLimpeza} disabled={loading} className="bg-red-700 hover:bg-red-800 text-white gap-2">
                    <Trash2 className="w-4 h-4" /> {loading ? 'Deletando...' : 'Confirmar exclusão'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card className={resultado.total_erros === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {resultado.total_erros === 0
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {resultado.mensagem}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="max-h-48 overflow-y-auto space-y-1">
              {resultado.deletadas.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs text-green-800 bg-white border border-green-200 rounded px-3 py-1.5">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span className="font-medium">{r.rubrica}</span>
                  <span className="text-slate-400">{r.origem_recurso}</span>
                </div>
              ))}
            </div>
            {resultado.erros?.length > 0 && resultado.erros.map((e) => (
              <div key={e.id} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
                ✕ {e.rubrica}: {e.erro}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
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
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      <LimparRubricasIndevidas />
      <hr className="border-slate-200" />
      <div className="space-y-6">
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
    </div>
  );
}