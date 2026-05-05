import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import {
  FileText, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, Download, X, Search, SlidersHorizontal, Trash2, FileX
} from 'lucide-react';

import PDFGeneratorDialog from '../components/reports/PDFGeneratorDialog';
import PeriodExportDialog from '../components/reports/PeriodExportDialog';
import RelatorioFisicoFinanceiroDialog from '../components/reports/RelatorioFisicoFinanceiroDialog';
import ActivityFilters from '../components/reports/ActivityFilters';
import ActivitySummary from '../components/reports/ActivitySummary';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

import { toast } from 'sonner';
import { toastMessages } from '@/lib/toastMessages';

// 🔥 GARANTIA GLOBAL DE INTEIRO
function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function exportCSV(reports) {
  try {
    const rows = [];

    const header = [
      'ID','Profissional','Museu','Equipe','Mês','Ano','Status',
      'Atividade','Classificação','Público','Equipe Responsável',
      'Acessibilidade','Parceria'
    ];

    rows.push(header.join(';'));

    reports.forEach((r) => {
      const atividades = Array.isArray(r.atividades) ? r.atividades : [];

      atividades.forEach((a) => {
        rows.push([
          r.id,
          r.author_name || '',
          r.museu || '',
          r.equipe || '',
          r.mes_referencia || '',
          r.ano || '',
          r.status || '',
          a.nome || '',
          a.classificacao || '',
          inteiro(a.publico_total ?? a.publico_estimado ?? 0), // 🔥 CORREÇÃO
          a.equipe_responsavel || '',
          a.acessibilidade || '',
          a.parceria || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
      });
    });

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorios.csv';
    a.click();
    URL.revokeObjectURL(url);

  } catch (e) {
    console.error(e);
  }
}

function RelatoriosInner() {

  const { user: currentUser, isCoordenador } = useCurrentUser();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Report.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-reports-list']);
      queryClient.invalidateQueries(['my-reports-list']);
      toastMessages.deleteSuccess();
      setDeleteTarget(null);
    },
    onError: () => toastMessages.deleteFailed()
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['all-reports-list'],
    queryFn: () => base44.entities.Report.list('-created_date', 200),
    enabled: !!currentUser
  });

  // 🔥 NORMALIZAÇÃO SEM ALTERAR ESTRUTURA
  const normalizedReports = reports.map(r => ({
    ...r,
    atividades: (r.atividades || []).map(a => ({
      ...a,
      publico_total: inteiro(a.publico_total ?? a.publico_estimado ?? 0),
      publico_estimado: inteiro(a.publico_total ?? a.publico_estimado ?? 0)
    }))
  }));

  const filtered = normalizedReports.filter(r => {
    if (!search) return true;
    return (r.author_name || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-white p-6">

      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>

        <Button onClick={() => exportCSV(filtered)}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <Input
        placeholder="Buscar..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <p className="mt-10 text-center text-gray-400">Carregando...</p>
      ) : (

        <div className="mt-6 space-y-3">

          {filtered.map(report => (
            <div key={report.id} className="border p-4 rounded-xl">

              <div className="flex justify-between">

                <div>
                  <p className="font-semibold">{report.author_name}</p>
                  <p className="text-xs text-gray-500">
                    {report.museu} • {report.mes_referencia}/{report.ano}
                  </p>
                </div>

                <div className="flex gap-2">

                  <button
                    onClick={() => setDeleteTarget(report)}
                    className="text-red-500"
                  >
                    <Trash2 size={16}/>
                  </button>

                </div>

              </div>

              <div className="mt-3 text-sm text-gray-600">
                {(report.atividades || []).map((a, i) => (
                  <div key={i}>
                    {a.nome} — Público: <strong>{inteiro(a.publico_total)}</strong>
                  </div>
                ))}
              </div>

            </div>
          ))}

        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteTarget.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

export default function Relatorios() {
  return <RequireAuth><RelatoriosInner /></RequireAuth>;
}
