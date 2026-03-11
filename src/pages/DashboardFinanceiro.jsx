import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import BudgetChart from '@/components/financeiro/BudgetChart';
import PurchaseStats from '@/components/financeiro/PurchaseStats';
import BudgetSummary from '@/components/financeiro/BudgetSummary';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

export default function DashboardFinanceiro() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      setCurrentUser(user);
      if (user?.email) {
        base44.entities.UserPermission.filter({ user_email: user.email })
          .then(perms => setUserPermissions(perms[0]))
          .catch(() => {});
      }
    });
  }, []);

  const { data: budgetLines = [], isLoading: loadingBudget } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: () => base44.entities.BudgetLine.list(),
    enabled: !!userPermissions?.can_manage_platform || !!userPermissions?.gestao_compras,
  });

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 500),
    enabled: !!userPermissions?.can_manage_platform || !!userPermissions?.gestao_compras,
  });

  const isCoordinator = currentUser?.role === 'admin' || userPermissions?.can_review_reports;
  const hasFinancialAccess = userPermissions?.can_manage_platform || userPermissions?.gestao_compras;

  if (!isCoordinator || !hasFinancialAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-sm text-gray-600">
            Apenas coordenadores com permissão de gestão financeira podem acessar este dashboard.
          </p>
        </Card>
      </div>
    );
  }

  if (loadingBudget || loadingPurchases) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Financeiro</h1>
          <p className="text-gray-600 text-sm mt-1">Visão consolidada da execução orçamentária em tempo real</p>
        </div>

        {/* Resumo Executivo */}
        <BudgetSummary budgetLines={budgetLines} purchases={purchases} />

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BudgetChart budgetLines={budgetLines} purchases={purchases} />
          </div>
          <div>
            <PurchaseStats purchases={purchases} />
          </div>
        </div>
      </div>
    </div>
  );
}