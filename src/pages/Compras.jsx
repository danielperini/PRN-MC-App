import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  Search,
  ShieldCheck,
  User,
  FileText,
  AlertTriangle,
  Pencil,
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';

function ComprasInner() {
  const [activeTab, setActiveTab] = useState('solicitacoes');
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  const { data: budgetLines = [] } = useBudgetLines();

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => base44.entities.PurchaseRequest.list(),
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: async () => base44.entities.Rubrica.list(),
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (error) {
        console.error('Error loading user:', error);
      }
    };
    loadUser();
  }, []);

  const isCoordenador = currentUser?.role === 'COORDENADOR' || currentUser?.role === 'admin';

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const matchesSearch =
        !searchTerm ||
        p.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.numero?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || p.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [purchases, searchTerm, statusFilter]);

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Compras e Pagamentos</h1>
        {isCoordenador && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Compra
          </Button>
        )}
      </div>

      {isCoordenador && (
        <div className="mb-6">
          <OrcamentoDashboard
            budgetLines={budgetLines || []}
            purchases={purchases || []}
          />
        </div>
      )}

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Buscar por descrição ou número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="RASCUNHO">Rascunho</SelectItem>
              <SelectItem value="AGUARDANDO_APROVACAO">Aguardando Aprovação</SelectItem>
              <SelectItem value="APROVADO_COORD">Aprovado (Coord)</SelectItem>
              <SelectItem value="APROVADO_ADMIN">Aprovado (Admin)</SelectItem>
              <SelectItem value="PAGO">Pago</SelectItem>
              <SelectItem value="RECUSADO">Recusado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhuma compra encontrada
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPurchases.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedPurchase(p)}
                className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-900">{p.descricao}</p>
                    <p className="text-sm text-slate-600">#{p.numero}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">R$ {(p.valor_solicitado || 0).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-1 rounded ${
                      p.status === 'PAGO' ? 'bg-green-100 text-green-800' :
                      p.status === 'RECUSADO' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <PurchaseFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            setShowForm(false);
          }}
        />
      )}

      {selectedPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">{selectedPurchase.descricao}</h2>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p><strong>Número:</strong> {selectedPurchase.numero}</p>
              <p><strong>Valor:</strong> R$ {(selectedPurchase.valor_solicitado || 0).toFixed(2)}</p>
              <p><strong>Status:</strong> {selectedPurchase.status}</p>
              <p><strong>Data:</strong> {new Date(selectedPurchase.created_date).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Compras() {
  return (
    <RequireAuth>
      <ComprasInner />
    </RequireAuth>
  );
}