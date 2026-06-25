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
        base44.entities.PurchaseRequest.list('-created_date', 200)
      ]);

      setRelatorios(listaRelatorios || []);
      
      const aprovadas = (listaCompras || []).filter(
        c => c.status === 'APROVADO_COORD' || c.status === 'APROVADO_ADMIN'
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
    aprovados: relatorios.filter(r => r.status === 'aprovado').length,
    gerando: relatorios.filter(r => r.status === 'gerando_ia').length,
    revisao: relatorios.filter(r => r.status === 'revisao').length
  };

  const comprasFiltradas = filtroStatus === 'todos' 
    ? comprasAprovadas 
    : comprasAprovadas.filter(c => c.centro_custo === filtroStatus);

  const centrosCusto = [...new Set(comprasAprovadas.map(c => c.centro_custo).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Relatórios</p>
              <p className="text-2xl font-bold">{estatisticas.total}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Aprovados</p>
              <p className="text-2xl font-bold text-green-600">{estatisticas.aprovados}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Gerando IA</p>
              <p className="text-2xl font-bold text-blue-600">{estatisticas.gerando}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Em Revisão</p>
              <p className="text-2xl font-bold text-amber-600">{estatisticas.revisao}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
        </Card>
      </div>

      {/* Compras Aprovadas Pendentes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Compras Aprovadas Pendentes</h3>
          <div className="flex gap-2">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="border rounded-md px-3 py-1 text-sm"
            >
              <option value="todos">Todos os centros</option>
              {centrosCusto.map(centro => (
                <option key={centro} value={centro}>{centro}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {comprasFiltradas.slice(0, 10).map((compra) => (
            <Card key={compra.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">{compra.descricao_item || 'Sem descrição'}</p>
                  <p className="text-sm text-gray-600">
                    Fornecedor: {compra.fornecedor_nome || 'Não informado'}
                  </p>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span className="text-gray-600">
                      Valor: R$ {(compra.valor_solicitado || 0).toFixed(2)}
                    </span>
                    <span className="text-gray-600">
                      Centro: {compra.centro_custo || 'Não informado'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Aprovado em: {compra.approved_at 
                      ? new Date(compra.approved_at).toLocaleString('pt-BR') 
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-700">Pendente</span>
                </div>
              </div>
            </Card>
          ))}

          {comprasFiltradas.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Nenhuma compra aprovada pendente
            </div>
          )}

          {comprasFiltradas.length > 10 && (
            <p className="text-sm text-gray-500 mt-2 text-center">
              + {comprasFiltradas.length - 10} compras não exibidas
            </p>
          )}
        </div>
      </div>

      {/* Relatórios Recentes */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Relatórios Recentes</h3>
        <div className="space-y-2">
          {relatorios.slice(0, 5).map((relatorio) => (
            <Card key={relatorio.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {relatorio.tipo === 'parcial' ? 'Relatório Parcial' : 'Relatório Final'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {relatorio.data_inicio && relatorio.data_fim 
                      ? `${new Date(relatorio.data_inicio).toLocaleDateString('pt-BR')} - ${new Date(relatorio.data_fim).toLocaleDateString('pt-BR')}`
                      : 'Período não informado'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Status: {relatorio.status || 'rascunho'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">
                    Criado em: {relatorio.created_date 
                      ? new Date(relatorio.created_date).toLocaleString('pt-BR') 
                      : '—'}
                  </p>
                </div>
              </div>
            </Card>
          ))}

          {relatorios.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Nenhum relatório encontrado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}