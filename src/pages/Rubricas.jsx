import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toastMessages } from '@/lib/toastMessages';
import RequireAuth from '@/components/auth/RequireAuth';
import RubricasGrid from '@/components/rubricas/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import RubricaExporter from '@/components/rubricas/RubricaExporter';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import MapeamentoRubricasEditor from '@/components/rubricas/MapeamentoRubricasEditor';
import RevincularRubricasOrfasButton from '@/components/financeiro/RevincularRubricasOrfasButton';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { canManageRubricas } from '@/components/auth/permissions';

export default function RubricasPage() {
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [showNewRubrica, setShowNewRubrica] = useState(false);
  const [showMapeamento, setShowMapeamento] = useState(false);
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const canManage = canManageRubricas(currentUser);

  const [initializing, setInitializing] = useState(false);

  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 1000),
  });

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      const res = await base44.functions.invoke('reinitializeRubricas', {});
      if (res.data?.success) {
        toastMessages.createSuccess();
        queryClient.invalidateQueries({ queryKey: ['rubricas'] });
      } else {
        toastMessages.warning(res.data?.error || 'Erro ao inicializar rubricas');
      }
    } catch (e) {
      toastMessages.createFailed(e.message);
    } finally {
      setInitializing(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedRubrica(null);
    queryClient.invalidateQueries({ queryKey: ['rubricas'] });
  };

  if (selectedRubrica) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
            <Button
              variant="outline"
              onClick={handleCloseDetail}
              className="mb-4"
            >
              ← Voltar para Rubricas
            </Button>
            <RubricaDetail
              rubrica={selectedRubrica}
              onClose={handleCloseDetail}
            />
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Rubricas</h1>
            <p className="text-gray-600">Controle do orçamento do Projeto Museus Centro</p>
          </div>

          {/* Texto de apoio */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-blue-900">
              O valor utilizado é calculado a partir das solicitações aprovadas vinculadas à rubrica, sem digitação manual. Clique no valor de qualquer linha para conferir a composição, inclusive quando for zero. O saldo é a diferença entre o orçamento e o valor utilizado.
            </p>
          </div>

          {/* Relatório */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-gray-700">
              <strong>📊 Composição:</strong> A consulta usa a mesma regra fiscal do backend: solicitações aprovadas ou pagas, excluindo duplicatas e itens fora do somatório. O total exibido corresponde à soma das solicitações abertas no detalhamento.
            </p>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-2 flex-wrap mb-6">
            {canManage && (
              <Button
                className="bg-black hover:bg-gray-800 text-white gap-2"
                onClick={() => setShowNewRubrica(true)}
              >
                <Plus className="w-4 h-4" />
                Nova Rubrica
              </Button>
            )}
            {rubricas.length === 0 && !loadingRubricas && (
              <Button
                variant="outline"
                className="gap-2 border-orange-400 text-orange-700 hover:bg-orange-50"
                onClick={handleInitialize}
                disabled={initializing}
              >
                <RefreshCw className={`w-4 h-4 ${initializing ? 'animate-spin' : ''}`} />
                {initializing ? 'Inicializando...' : 'Inicializar Rubricas Padrão'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowMapeamento(true)}
              className="gap-2"
            >
              🔗 Mapeamentos
            </Button>
            {canManage && <RevincularRubricasOrfasButton onConcluido={() => queryClient.invalidateQueries({ queryKey: ['rubricas'] })} />}
            <RubricaExporter rubricas={rubricas} />
          </div>

          {/* Grade de Rubricas */}
          <RubricasGrid
            rubricas={rubricas}
            onSelectRubrica={setSelectedRubrica}
            isCoordenador={canManage}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['rubricas'] })}
          />
        </div>

        {/* Diálogos */}
        {showNewRubrica && (
          <NovaRubricaDialog
            open={showNewRubrica}
            currentUser={currentUser}
            onClose={() => {
              setShowNewRubrica(false);
              queryClient.invalidateQueries({ queryKey: ['rubricas'] });
            }}
          />
        )}

        {showMapeamento && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-black">Mapeamento de Rubricas</h2>
                <button
                  onClick={() => setShowMapeamento(false)}
                  className="text-gray-400 hover:text-black"
                >
                  ✕
                </button>
              </div>
              <MapeamentoRubricasEditor />
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
