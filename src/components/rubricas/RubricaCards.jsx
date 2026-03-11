import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function RubricaCards({ rubricas }) {
  if (!rubricas || rubricas.length === 0) return null;

  const totalValor = rubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0);
  const totalUtilizado = rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0);
  const totalSaldo = totalValor - totalUtilizado;
  const percentualGeral = totalValor > 0 ? (totalUtilizado / totalValor) * 100 : 0;

  const getStatusIcon = (percent) => {
    if (percent >= 100) return <AlertTriangle className="w-5 h-5 text-red-600" />;
    if (percent >= 80) return <AlertCircle className="w-5 h-5 text-amber-600" />;
    return <CheckCircle className="w-5 h-5 text-green-600" />;
  };

  const getStatusColor = (percent) => {
    if (percent >= 100) return 'bg-red-50 border-red-200';
    if (percent >= 80) return 'bg-amber-50 border-amber-200';
    return 'bg-green-50 border-green-200';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <Card className={`border ${getStatusColor(percentualGeral)}`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-600 font-medium">TOTAL GERAL</span>
            {getStatusIcon(percentualGeral)}
          </div>
          <p className="text-2xl font-bold text-black mb-1">
            {(percentualGeral || 0).toFixed(2)}%
          </p>
          <p className="text-xs text-gray-600">
            R$ {(totalUtilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {(totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card className="border border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <span className="text-xs text-gray-600 font-medium block mb-2">VALOR TOTAL</span>
          <p className="text-2xl font-bold text-black">
            R$ {(totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card className="border border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <span className="text-xs text-gray-600 font-medium block mb-2">UTILIZADO</span>
          <p className="text-2xl font-bold text-black">
            R$ {(totalUtilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card className="border border-purple-200 bg-purple-50">
        <CardContent className="pt-6">
          <span className="text-xs text-gray-600 font-medium block mb-2">DISPONÍVEL</span>
          <p className="text-2xl font-bold text-black">
            R$ {(totalSaldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}