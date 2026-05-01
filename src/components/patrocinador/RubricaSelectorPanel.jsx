import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
'@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function RubricaSelectorPanel() {
  const [rubricas, setRubricas] = useState([]);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRubricas();
  }, []);

  async function loadRubricas() {
    try {
      setLoading(true);
      const rubricasData = await base44.entities.Rubrica.list('-updated_date', 200);
      setRubricas(rubricasData || []);
      if (rubricasData && rubricasData.length > 0) {
        setSelectedRubrica(rubricasData[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar rubricas:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          Carregando rubricas...
        </CardContent>
      </Card>);

  }

  if (!selectedRubrica) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-slate-600">
          Nenhuma rubrica encontrada
        </CardContent>
      </Card>);

  }

  const chartData = [
  {
    nome: 'Orçamento',
    valor: selectedRubrica.valor_total || 0
  },
  {
    nome: 'Utilizado',
    valor: selectedRubrica.valor_utilizado_aprovado || 0
  },
  {
    nome: 'Saldo',
    valor: selectedRubrica.saldo_disponivel || 0
  }];


  const percentualUtilizado =
  selectedRubrica.valor_total > 0 ?
  (selectedRubrica.valor_utilizado_aprovado || 0) / selectedRubrica.valor_total * 100 :
  0;

  return (
    <Card className="border-2 border-black">
      <CardHeader className="flex flex-col space-y-1.5 p-6 hidden hidden">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Análise de Rubrica
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-0 space-y-6 hidden">
        {/* Seletor de Rubrica */}
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Selecione a Rubrica
          </label>
          <Select
            value={selectedRubrica?.id || ''}
            onValueChange={(id) => {
              const rubrica = rubricas.find((r) => r.id === id);
              setSelectedRubrica(rubrica);
            }}>
            
            <SelectTrigger>
              <SelectValue placeholder="Selecionar rubrica" />
            </SelectTrigger>
            <SelectContent>
              {rubricas.map((rubrica) =>
              <SelectItem key={rubrica.id} value={rubrica.id}>
                  {rubrica.nome} - R$ {(rubrica.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border-2 border-black">
            <p className="text-sm font-medium text-black mb-1">Orçamento Previsto</p>
            <p className="text-xl font-bold text-black">
              {(selectedRubrica.valor_total || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border-2 border-black">
            <p className="text-sm font-medium text-black mb-1">Valor Utilizado</p>
            <p className="text-xl font-bold text-black">
              {(selectedRubrica.valor_utilizado_aprovado || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
            </p>
            <p className="text-xs text-slate-600 mt-1">{percentualUtilizado.toFixed(1)}% utilizado</p>
          </div>
          <div className="bg-white rounded-lg p-4 border-2 border-black">
            <p className="text-sm font-medium text-black mb-1">Saldo Disponível</p>
            <p className="text-xl font-bold text-black">
              {(selectedRubrica.saldo_disponivel || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
            </p>
          </div>
        </div>

        {/* Gráfico */}
        <div className="h-80 border-2 border-black rounded-lg p-4 bg-white">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="0" stroke="#000000" strokeWidth={1.5} />
              <XAxis
                dataKey="nome"
                stroke="#000000"
                strokeWidth={2}
                tick={{ fontSize: 11, fill: '#000000' }} />
              
              <YAxis
                stroke="#000000"
                strokeWidth={2}
                tick={{ fontSize: 11, fill: '#000000' }}
                tickFormatter={(value) =>
                `R$ ${(value / 1000).toFixed(0)}k`
                } />
              
              <Tooltip
                formatter={(value) =>
                value.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })
                }
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  fontSize: '12px'
                }} />
              
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="valor" fill="#000000" stroke="#000000" strokeWidth={2} name="Valor (R$)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>);

}