import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ShoppingCart, AlertTriangle, CheckCircle } from 'lucide-react';

export default function DashboardRelatorioExecucao() {
  const [relatorios, setRelatorios] = useState([]);
  const [comprasAprovadas, setComprasAprovadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      const [listaRelatorios, listaCompras] = await Promise.all([
      base44.entities.RelatorioExecucaoObjeto.list('-created_date', 100),
      base44.entities.PurchaseRequest.list('-created_date', 200)]
      );

      setRelatorios(listaRelatorios || []);

      const aprovadas = (listaCompras || []).filter(
        (c) => c.status === 'APROVADO_COORD' || c.status === 'APROVADO_ADMIN'
      );
      setComprasAprovadas(aprovadas);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const estatisticas = {
    total: relatorios.length,
    aprovados: relatorios.filter((r) => r.status === 'aprovado').length,
    gerando: relatorios.filter((r) => r.status === 'gerando_ia').length,
    revisao: relatorios.filter((r) => r.status === 'revisao').length
  };

  const comprasFiltradas = filtroStatus === 'todos' ?
  comprasAprovadas :
  comprasAprovadas.filter((c) => c.centro_custo === filtroStatus);

  const centrosCusto = [...new Set(comprasAprovadas.map((c) => c.centro_custo).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>);

  }

  return null;



















































































































































}