import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, Copy, Wrench, Sparkles, Calculator } from 'lucide-react';

export default function PainelAuditoriaDashboard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('diagnostico');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [expandedPhase, setExpandedPhase] = useState(null);

  const run = async (m) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setMode(m);
    try {
      const res = await base44.functions.invoke('auditarCorrigirDashboardIA', { modo: m });
      setReport(res?.data?.report || res?.report || res?.data || res);
      setOpen(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const phaseMeta = [
  { key: 'deduplicacao', label: 'Deduplicação', icon: Copy, color: 'text-purple-600' },
  { key: 'centro_custo', label: 'Centro de Custo', icon: Wrench, color: 'text-blue-600' },
  { key: 'rubricas_compras', label: 'Rubrica → Compra', icon: Sparkles, color: 'text-amber-600' },
  { key: 'recalculo', label: 'Recálculo', icon: Calculator, color: 'text-green-600' }];


  const totalCorrections = report ?
  (report.fases?.deduplicacao?.mescladas || 0) + (
  report.fases?.centro_custo?.corrigidas || 0) + (
  report.fases?.rubricas_compras?.por_historico || 0) + (
  report.fases?.rubricas_compras?.por_palavras || 0) + (
  report.fases?.rubricas_compras?.por_ia || 0) :
  0;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      




























      
      {error &&
      <CardContent className="pt-0">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Erro:</strong> {error}
            </div>
          </div>
        </CardContent>
      }
      {report && !open &&
      <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Auditoria concluída — <strong>{totalCorrections}</strong> correções{' '}
              {report.dry_run ? 'detectadas (diagnóstico)' : 'aplicadas'}.
            </span>
            <Button variant="link" size="sm" onClick={() => setOpen(true)} className="h-auto p-0">
              Ver relatório
            </Button>
          </div>
        </CardContent>
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              Relatório de Auditoria IA {report?.dry_run && '(Diagnóstico)'}
            </DialogTitle>
          </DialogHeader>
          {report &&
          <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {phaseMeta.map((p) => {
                const f = report.fases?.[p.key] || {};
                const Icon = p.icon;
                return (
                  <div
                    key={p.key}
                    className={`rounded-xl border p-3 cursor-pointer hover:shadow-md transition ${
                    expandedPhase === p.key ? 'border-amber-400 bg-amber-50/60' : 'border-border'}`
                    }
                    onClick={() => setExpandedPhase(expandedPhase === p.key ? null : p.key)}>
                    
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${p.color}`} />
                        <span className="text-xs font-semibold">{p.label}</span>
                      </div>
                      <div className="text-lg font-bold">{f.corrigidas || f.mescladas || f.por_historico + (f.por_palavras || 0) + (f.por_ia || 0) || f.rubricas_recalculadas || 0}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {f.analisadas !== undefined && `Analisadas: ${f.analisadas}`}
                      </div>
                    </div>);

              })}
              </div>

              {report.erros?.length > 0 &&
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertCircle className="w-4 h-4" />
                    <strong>{report.erros.length} erro(s)</strong>
                  </div>
                  <ul className="list-disc ml-5 space-y-0.5 max-h-24 overflow-auto">
                    {report.erros.slice(0, 10).map((e, i) =>
                <li key={i}>{e}</li>
                )}
                  </ul>
                </div>
            }

              {expandedPhase && report.detalhes?.[expandedPhase]?.length > 0 &&
            <ScrollArea className="h-64 border rounded-lg">
                  <div className="p-3 space-y-2 text-xs">
                    {report.detalhes[expandedPhase].slice(0, 100).map((d, i) =>
                <div key={i} className="border-b pb-1.5">
                        <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(d, null, 0)}</pre>
                      </div>
                )}
                    {report.detalhes[expandedPhase].length > 100 &&
                <div className="text-muted-foreground text-center pt-2">
                        + {report.detalhes[expandedPhase].length - 100} outros...
                      </div>
                }
                  </div>
                </ScrollArea>
            }

              {expandedPhase && (!report.detalhes?.[expandedPhase] || report.detalhes[expandedPhase].length === 0) &&
            <div className="text-sm text-muted-foreground text-center py-6">
                  Sem detalhes registrados para esta fase.
                </div>
            }

              {!report.dry_run && totalCorrections > 0 &&
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    <strong>{totalCorrections}</strong> correções aplicadas com sucesso. Recarregue o dashboard para
                    ver os cards atualizados.
                  </span>
                </div>
            }
            </div>
          }
        </DialogContent>
      </Dialog>
    </Card>);

}