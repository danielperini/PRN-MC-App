import React, { useState } from 'react';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const MUSEUS = [
  { key: 'GERAL', label: 'Geral' },
  { key: 'MIS', label: 'MIS' },
  { key: 'MHAB', label: 'MHAB' },
  { key: 'MUMO', label: 'MUMO' },
  { key: 'NOTURNO', label: 'Noturno' },
];

export default function RubricasPorMuseu() {
  const [activeTab, setActiveTab] = useState('GERAL');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rubricas por Museu</h1>
        <p className="text-sm text-gray-500 mt-1">Visualização das rubricas orçamentárias por unidade.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          {MUSEUS.map((m) => (
            <TabsTrigger key={m.key} value={m.key}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map((m) => (
          <TabsContent key={m.key} value={m.key} className="mt-6">
            <RubricasMuseuEditor museu={m.key} canEdit={false} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}