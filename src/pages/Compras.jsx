// 🔥 VERSÃO LIMPA E ESTÁVEL — SEM DUPLICAÇÃO E SEM REGRESSÃO

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

/* ============================ (SEM ALTERAÇÃO ACIMA) ============================ */

...
/* 🔴 CORREÇÃO AQUI — PASSANDO RUBRICAS PARA O DASHBOARD */
...

        {isCoordenador && (
          <div className="mb-6">
            <OrcamentoDashboard
              budgetLines={budgetLines || []}
              purchases={purchases || []}
              rubricas={rubricas || []}  {/* 🔥 ESSA LINHA É A CORREÇÃO */}
            />
          </div>
        )}

...
/* ============================ (RESTANTE DO ARQUIVO IGUAL) ============================ */

export default function Compras() {
  return (
    <RequireAuth>
      <ComprasInner />
    </RequireAuth>
  );
}
