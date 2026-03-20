import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, RefreshCw, Wrench } from 'lucide-react';
import { toast } from 'sonner';

export default function AuditoriaRubricasPanel({ inconsistencias = [] }) {
  const [loadingFix, setLoadingFix] = useState(false);
  const [loadingRecalc, setLoadingRecalc] = useState(false);

  const hasErrors = inconsistencias.length > 0;

  const handleFix = async () => {
    try {
      setLoadingFix(true);

      const res = await base44.functions.invoke('fixComprasSemRubrica');

      toast.success(
        `Correção concluída: ${res.corrigidas || 0} corrigidas`
      );
    } catch (e) {
      toast.error('Erro ao corrigir compras');
      console.error(e);
    } finally {
      setLoadingFix(false);
    }
  };

  const handleRecalc = async () => {
    try {
      setLoadingRecalc(true);

      await base44.functions.invoke('recalculateAllRubricas', {
        trigger: 'manual'
      });

      toast.success('Rubricas recalculadas com sucesso');
    } catch (e) {
      toast.error('Erro ao recalcular');
      console.error(e);
    } finally {
      setLoadingRecalc(false);
    }
  };

  return (
    <Card className="border-2 border-orange-300 bg-orange-50">
      <CardContent className="p-4 space-y-4">

        {/* HEADER */}
        <div className="flex items-center gap-2">
          {hasErrors ? (
            <AlertTriangle className="text-red-600" />
          ) : (
            <CheckCircle className="text-green-600" />
          )}

          <h2 className="font-semibold text-lg">
            Auditoria de Rubricas
          </h2>
        </div>

        {/* STATUS */}
        <div className="text-sm">
          {hasErrors ? (
            <span className="text-red-600 font-medium">
              ⚠ {inconsistencias.length} compra(s) com problema
            </span>
          ) : (
            <span className="text-green-600 font-medium">
              ✔ Sistema consistente
            </span>
          )}
        </div>

        {/* AÇÕES */}
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleFix}
            disabled={loadingFix}
            variant="destructive"
          >
            <Wrench className="w-4 h-4 mr-2" />
            {loadingFix ? 'Corrigindo...' : 'Corrigir tudo'}
          </Button>

          <Button
            onClick={handleRecalc}
            disabled={loadingRecalc}
            variant="secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {loadingRecalc ? 'Recalculando...' : 'Recalcular rubricas'}
          </Button>
        </div>

        {/* LISTA DE ERROS */}
        {hasErrors && (
          <div className="space-y-2 max-h-60 overflow-auto border-t pt-2">

            {inconsistencias.map((item, idx) => (
              <div
                key={idx}
                className="text-xs bg-white p-2 rounded border"
              >
                <div className="font-medium">
                  {item.titulo || 'Compra'}
                </div>

                <div className="text-gray-600">
                  ID: {item.purchase_id}
                </div>

                {item.valor_pago && (
                  <div>
                    Valor: R$ {Number(item.valor_pago).toLocaleString('pt-BR')}
                  </div>
                )}

                {item.motivo && (
                  <div className="text-red-600">
                    Motivo: {item.motivo}
                  </div>
                )}
              </div>
            ))}

          </div>
        )}

      </CardContent>
    </Card>
  );
}
