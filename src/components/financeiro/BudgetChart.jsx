import React from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function BudgetChart({ budgetLines = [], purchases = [] }) {
  // Preparar dados para gráfico de barras (saldo por rubrica)
  const barData = budgetLines.slice(0, 10).map(line => ({
    codigo: line.codigo.substring(0, 8),
    inicial: line.saldo_inicial || 0,
    comprometido: line.saldo_comprometido || 0,
    disponivel: (line.saldo_inicial || 0) - (line.saldo_comprometido || 0),
  }));

  // Preparar dados para gráfico de pizza (status de compras)
  const purchasesByStatus = {
    RASCUNHO: purchases.filter(p => p.status === 'RASCUNHO').length,
    PENDENTE: purchases.filter(p => p.status === 'PENDENTE').length,
    APROVADO: purchases.filter(p => p.status === 'APROVADO').length,
    REJEITADO: purchases.filter(p => p.status === 'REJEITADO').length,
  };

  const pieData = [
    { name: 'Rascunho', value: purchasesByStatus.RASCUNHO, color: '#94a3b8' },
    { name: 'Pendente', value: purchasesByStatus.PENDENTE, color: '#f59e0b' },
    { name: 'Aprovado', value: purchasesByStatus.APROVADO, color: '#10b981' },
    { name: 'Rejeitado', value: purchasesByStatus.REJEITADO, color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Gráfico de Barras - Saldo por Rubrica */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Saldo por Rubrica (Top 10)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="codigo" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Legend />
            <Bar dataKey="comprometido" fill="#f59e0b" name="Comprometido" />
            <Bar dataKey="disponivel" fill="#10b981" name="Disponível" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Gráfico de Pizza - Status de Compras */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Distribuição de Solicitações</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} dataKey="value">
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value} solicitação(ões)`} />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
