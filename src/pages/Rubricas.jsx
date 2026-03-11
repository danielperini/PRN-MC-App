import React, { useState } from 'react';
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
  AlertCircle,
  AlertTriangle,
  Download,
  Plus,
  Search,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import RubricaListView from '@/components/rubricas/RubricaListView';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import GastosRubricaPanel from '@/components/compras/GastosRubricaPanel';

export default function RubricasPage() {
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const queryClient = useQueryClient();

  const handleRubricaSelected = (rubrica) => {
    setSelectedRubrica(rubrica);
  };

  const handleCloseDetail = () => {
    setSelectedRubrica(null);
    queryClient.invalidateQueries({ queryKey: ['rubricas'] });
  };

  return (
    <RequireAuth>
      <div>
        {!selectedRubrica ? (
          <RubricaListView onSelectRubrica={handleRubricaSelected} />
        ) : (
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
        )}
      </div>
    </RequireAuth>
  );
}