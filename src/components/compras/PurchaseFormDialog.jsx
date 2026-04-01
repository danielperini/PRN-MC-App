import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AtividadesSection from '@/components/reports/AtividadesSection';

export default function ReportEditor() {
  const [params] = useSearchParams();
  const reportId = params.get('id');

  const [form, setForm] = useState({
    atividades: [],
  });

  const { data: report } = useQuery({
    queryKey: ['report', reportId],
    enabled: !!reportId,
    queryFn: () => base44.entities.Report.get(reportId),
  });

  useEffect(() => {
    if (report) {
      setForm({
        ...report,
        atividades: report.atividades || [],
      });
    }
  }, [report]);

  function updateAtividade(index, field, value) {
    setForm(prev => {
      const atividades = [...(prev.atividades || [])];
      atividades[index] = {
        ...atividades[index],
        [field]: value === '' ? '' : value,
      };
      return { ...prev, atividades };
    });
  }

  function addAtividade() {
    setForm(prev => ({
      ...prev,
      atividades: [
        ...(prev.atividades || []),
        {
          nome: '',
          quantidade_ocorrencias: '',
          quantidade_produtos_gerados: '',
          publico_estimado: '',
        },
      ],
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        atividades: (form.atividades || []).map(a => ({
          ...a,
          quantidade_ocorrencias:
            a.quantidade_ocorrencias === '' ? null : Number(a.quantidade_ocorrencias),
          quantidade_produtos_gerados:
            a.quantidade_produtos_gerados === '' ? null : Number(a.quantidade_produtos_gerados),
          publico_estimado:
            a.publico_estimado === '' ? null : Number(a.publico_estimado),
        })),
      };

      return base44.entities.Report.update(reportId, payload);
    },
    onSuccess: () => toast.success('Relatório salvo'),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Editar Relatório</h1>

      <AtividadesSection
        atividades={form.atividades}
        onChange={updateAtividade}
        onAdd={addAtividade}
      />

      <button
        onClick={() => saveMutation.mutate()}
        className="px-4 py-2 bg-black text-white rounded"
      >
        Salvar
      </button>
    </div>
  );
}
