import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, Clock, CheckCircle2, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

export default function PendingActionsAlert() {
  const { user } = useCurrentUser();
  const [pendingActions, setPendingActions] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const loadPendingActions = useCallback(async () => {
    if (!user?.email) return;
    try {
      setLoading(true);
      const returnedReports = await base44.entities.Report.filter(
        { created_by: user.email, status: 'RETURNED' },
        '-updated_date',
        10
      );

      const actions = [];
      returnedReports.forEach(report => {
        actions.push({
          id: `report_${report.id}`,
          type: 'report_returned',
          title: `Relatório devolvido: ${report.author_name}`,
          subtitle: `${report.mes_referencia}/${report.ano}`,
          description: report.return_comment || 'Revise os comentários do coordenador',
          icon: AlertCircle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          createdAt: report.updated_date
        });
      });

      actions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPendingActions(actions);
    } catch (error) {
      console.error('Erro ao carregar ações pendentes:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  // Versão com debounce para as subscriptions (evita rate limit)
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPendingActions(), 5000);
  }, [loadPendingActions]);

  useEffect(() => {
    if (!user?.email) return;

    loadPendingActions();

    // Subscriptions só disparam reload com debounce de 5s
    const unsubReport = base44.entities.Report.subscribe(event => {
      if (event.type === 'update' && event.data?.created_by === user.email) {
        debouncedLoad();
      }
    });

    return () => {
      unsubReport();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [user?.email, loadPendingActions, debouncedLoad]);

  if (pendingActions.length === 0) {
    return null;
  }

  const totalCount = pendingActions.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowPanel(!showPanel)}
        className="relative text-amber-600 hover:bg-amber-50 h-11 w-11"
        title="Ações pendentes"
      >
        <AlertCircle className="w-5 h-5" />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </Button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Ações Pendentes</h3>
              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{totalCount} item(ns) aguardando ação</p>
          </div>

          {/* Lista de ações */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-xs text-gray-400">Carregando...</div>
            ) : (
              pendingActions.map(action => {
                const Icon = action.icon;
                return (
                  <div
                    key={action.id}
                    className={`p-3 border-l-4 ${action.border} ${action.bg} hover:bg-opacity-75 transition-colors cursor-pointer`}
                  >
                    <div className="flex gap-3">
                      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${action.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900">{action.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{action.subtitle}</p>
                        <p className="text-xs text-gray-600 mt-1">{action.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
            <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Ver todas as ações →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}