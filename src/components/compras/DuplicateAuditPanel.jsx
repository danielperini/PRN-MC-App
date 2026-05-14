import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useDuplicateAudit } from '@/hooks/useDuplicateAudit';

export default function DuplicateAuditPanel() {
  const { duplicates, loading, error } = useDuplicateAudit();

  if (loading) {
    return (
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Auditoria de Duplicidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            Erro na Auditoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const hasDuplicates = duplicates.length > 0;

  return (
    <Card className={hasDuplicates ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {hasDuplicates ? (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          {hasDuplicates ? 'Possíveis Duplicidades' : 'Integridade Financeira OK'}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {hasDuplicates ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 font-medium">
                {duplicates.length} solicitação(ões) com possível duplicidade detectada
              </span>
              <Badge className="bg-amber-600 text-white">
                Atenção
              </Badge>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2">
              {duplicates.map((dup, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-amber-300 bg-white p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-amber-900">
                      NF: {dup.nf || 'sem número'}
                    </span>
                    <Badge className="text-xs">{dup.status}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-amber-700">
                    <div>
                      <p className="text-xs opacity-75">Fornecedor</p>
                      <p className="font-medium truncate">{dup.fornecedor || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-75">Valor</p>
                      <p className="font-medium">
                        {(dup.valor || 0).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs opacity-50 mt-1">
                    {new Date(dup.created_date).toLocaleDateString('pt-BR')} • {dup.created_by}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs text-green-700">
              Nenhuma duplicidade detectada nos últimos registros.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}