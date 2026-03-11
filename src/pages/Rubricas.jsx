import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { BarChart3, FileText, Download } from 'lucide-react';
import RubricaCards from '@/components/rubricas/RubricaCards';
import RubricaTable from '@/components/rubricas/RubricaTable';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import RequireAuth from '@/components/auth/RequireAuth';

function RubricasInner() {
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const queryClient = useQueryClient();

  const { data: rubricas = [], isLoading } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 100),
  });

  const handleExportPDF = () => {
    // Implementar exportação PDF
    alert('Função de exportação PDF em desenvolvimento');
  };

  const handleExportExcel = () => {
    // Implementar exportação Excel
    alert('Função de exportação Excel em desenvolvimento');
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black">Rubricas Orçamentárias</h1>
              <p className="text-sm text-gray-500">Gestão centralizada de rubricas e alocações</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportPDF}>
              <FileText className="w-4 h-4" />
              PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
              <Download className="w-4 h-4" />
              Excel
            </Button>
          </div>
        </div>

        {/* Cards Resumo */}
        {!isLoading && <RubricaCards rubricas={rubricas} />}

        {/* Tabela */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando rubricas...</div>
        ) : (
          <RubricaTable rubricas={rubricas} onSelectRubrica={setSelectedRubrica} />
        )}

        {/* Detalhe Modal */}
        {selectedRubrica && (
          <RubricaDetail
            rubrica={selectedRubrica}
            onClose={() => setSelectedRubrica(null)}
            onRefresh={() => queryClient.invalidateQueries(['rubricas'])}
          />
        )}
      </div>
    </div>
  );
}

export default function Rubricas() {
  return <RequireAuth><RubricasInner /></RequireAuth>;
}