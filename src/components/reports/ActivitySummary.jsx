import React from 'react';
import { Users, Package, Calendar, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function ActivitySummary({ activities = [], dateRange = null }) {
  if (activities.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Nenhuma atividade para exibir
      </div>
    );
  }

  // Calcular totais
  const totalPublico = activities.reduce((sum, a) => sum + (a.publico_total || 0), 0);
  const totalProdutos = activities.reduce((sum, a) => sum + ((a.produtos_entregues?.length || 0) + (a.quantidade_produtos || 0)), 0);
  const uniqueTeams = new Set(activities.flatMap(a => [a.equipe_responsavel, (a.equipe_envolvida_lista || [])].flat()).filter(Boolean));
  const totalActividades = activities.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Atividades</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{totalActividades}</p>
          </div>
          <Zap className="w-5 h-5 text-blue-500 opacity-40" />
        </div>
      </Card>

      <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Público Total</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{totalPublico.toLocaleString('pt-BR')}</p>
          </div>
          <Users className="w-5 h-5 text-green-500 opacity-40" />
        </div>
      </Card>

      <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Produtos</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">{totalProdutos}</p>
          </div>
          <Package className="w-5 h-5 text-purple-500 opacity-40" />
        </div>
      </Card>

      <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Equipes</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">{uniqueTeams.size}</p>
          </div>
          <Calendar className="w-5 h-5 text-amber-500 opacity-40" />
        </div>
      </Card>
    </div>
  );
}