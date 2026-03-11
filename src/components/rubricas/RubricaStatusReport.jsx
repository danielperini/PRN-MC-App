import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export default function RubricaStatusReport({ rubricas }) {
  if (!rubricas || rubricas.length === 0) return null;

  // Filtrar apenas rubricas ativas (sem admin)
  const activeRubricas = rubricas.filter(r => r.ativo !== false && !r.grupo?.toLowerCase().includes('admin'));

  const totalValor = activeRubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0);
  const totalUtilizado = activeRubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0);
  const totalSaldo = totalValor - totalUtilizado;

  const excedidas = activeRubricas.filter(r => (r.percentual_utilizado || 0) >= 100);
  const alerta80 = activeRubricas.filter(r => (r.percentual_utilizado || 0) >= 80 && (r.percentual_utilizado || 0) < 100);
  const normal = activeRubricas.filter(r => (r.percentual_utilizado || 0) < 80);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
      <h3 className="font-semibold text-black">Relatório de Execução</h3>
      
      <p className="text-sm text-gray-700 leading-relaxed">
        <strong>Atualização das rubricas com valores utilizados:</strong> foram atualizados os valores utilizados das rubricas com base na lista de pagamentos informada, considerando que lançamentos repetidos dentro da mesma rubrica foram consolidados de forma acumulada no campo de valor utilizado. O saldo foi apurado pela diferença entre o valor total da rubrica e o montante já utilizado, e o percentual utilizado foi calculado proporcionalmente sobre o total de cada rubrica.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
        <div className="space-y-1">
          <span className="text-xs text-gray-600 font-semibold">Total Previsto</span>
          <p className="text-lg font-bold text-black">
            R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-gray-600 font-semibold">Total Utilizado</span>
          <p className="text-lg font-bold text-black">
            R$ {totalUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-gray-600 font-semibold">Saldo Restante</span>
          <p className="text-lg font-bold text-green-600">
            R$ {totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-gray-600 font-semibold">% Geral Utilizado</span>
          <p className="text-lg font-bold text-black">
            {(totalValor > 0 ? (totalUtilizado / totalValor) * 100 : 0).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-black">{normal.length} Em execução</p>
            <p className="text-xs text-gray-600">Até 80% utilizado</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-black">{alerta80.length} Atenção</p>
            <p className="text-xs text-gray-600">80% a 100% utilizado</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-black">{excedidas.length} Excedidas</p>
            <p className="text-xs text-gray-600">Acima de 100%</p>
          </div>
        </div>
      </div>
    </div>
  );
}