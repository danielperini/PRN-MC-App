import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function MuseuManager() {
  const { data: museus = [] } = useQuery({
    queryKey: ['museus'],
    queryFn: () => base44.entities.Museu.list(),
  });

  return (
    <section>
      <div className="mb-4 pb-2 border-b border-gray-100">
        <h3 className="text-base font-semibold text-black">Museus</h3>
      </div>

      <div className="space-y-2">
        {museus.map((museu) => (
          <div key={museu.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex-1">
              <p className="font-medium text-sm text-black">{museu.nome}</p>
              <p className="text-xs text-gray-400">{museu.sigla} {museu.descricao && `• ${museu.descricao}`}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}