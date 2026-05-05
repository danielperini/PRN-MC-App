// 🔥 ARQUIVO COMPLETO — COM ABA NOTURNO

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TrendingUp, RefreshCw, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import CardRubricaEditor from '@/components/rubricas/CardRubricaEditor';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const ABAS = ['MHAB', 'MIS', 'MUMO', 'NOTURNO']; // 🔥 NOVO

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// 🔥 filtro noturno
function isRubricaNoturno(rubrica = {}) {
  const txt = normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria
  ].join(' '));

  return txt.includes('noturno');
}

export default function RubricasPorMuseu() {
  const [abaAtiva, setAbaAtiva] = useState('MHAB');
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const handleRefresh = async () => {
    await base44.functions.invoke('recalculateAllRubricas', {});
    await queryClient.invalidateQueries();
    setRefreshNonce(prev => prev + 1);
    toast.success('Rubricas atualizadas');
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Rubricas por Museu
            </h1>
            <p className="text-gray-500 text-sm">
              Acompanhamento orçamentário consolidado por museu.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Recalcular
            </Button>

            {isCoordenador && (
              <Button variant="outline" onClick={() => setShowCardEditor(true)}>
                <LayoutGrid className="w-4 h-4 mr-2" />
                Editor
              </Button>
            )}
          </div>
        </div>

        {/* 🔥 ABAS */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList className="grid grid-cols-4 bg-gray-100 rounded-xl p-1">

            {ABAS.map((m) => (
              <TabsTrigger
                key={m}
                value={m}
                className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white"
              >
                {m === 'NOTURNO' ? 'NOTURNO' : m}
              </TabsTrigger>
            ))}

          </TabsList>

          {/* 🔥 MUSEUS NORMAIS */}
          {MUSEUS.map((m) => (
            <TabsContent key={m} value={m} className="p-4">
              <RubricasMuseuEditor
                museu={m}
                refreshKey={refreshNonce}
              />
            </TabsContent>
          ))}

          {/* 🔥 NOVA ABA NOTURNO */}
          <TabsContent value="NOTURNO" className="p-4">
            <RubricasMuseuEditor
              museu="GERAL" // 🔥 usa todas
              refreshKey={refreshNonce}
              rubricaFilter={isRubricaNoturno}
            />
          </TabsContent>

        </Tabs>

        <GerenciarRubricasMuseuDialog />
        <CardRubricaEditor open={showCardEditor} onClose={() => setShowCardEditor(false)} />

      </div>
    </div>
  );
}
