import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AtividadesSection from '@/components/reports/AtividadesSection';

function normalizeNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
    if (!report) return;

    setForm({
      ...report,
      atividades: Array.isArray(report.atividades)
        ? report.atividades.map((atividade) => ({
            ...atividade,
            quantidade_ocorrencias:
              atividade?.quantidade_ocorrencias ?? '',
            quantidade_produtos_gerados:
              atividade?.quantidade_produtos_gerados ?? '',
            publico_estimado:
              atividade?.publico_estimado ?? '',
          }))
        : [],
    });
  }, [report]);

  const museusOptions = useMemo(() => {
    const valores = report?.museusOptions || report?.museus || [];
    return Array.isArray(valores) ? valores.filter(Boolean) : [];
  }, [report]);

  const tiposAcaoOptions = useMemo(() => {
    const valores = report?.tiposAcaoOptions || report?.tipos_acao || [];
    return Array.isArray(valores) ? valores.filter(Boolean) : [];
  }, [report]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        atividades: (form.atividades || []).map((a) => ({
          ...a,
          quantidade_ocorrencias: normalizeNullableNumber(a.quantidade_ocorrencias),
          quantidade_produtos_gerados: normalizeNullableNumber(a.quantidade_produtos_gerados),
          publico_estimado: normalizeNullableNumber(a.publico_estimado),
        })),
      };

      return base44.entities.Report.update(reportId, payload);
    },
    onSuccess: () => toast.success('Relatório salvo'),
    onError: (e) => toast.error(e?.message || 'Erro ao salvar relatório'),
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Editar Relatório</h1>

      <AtividadesSection
        atividades={form.atividades || []}
        setAtividades={(updater) => {
          setForm((prev) => {
            const atividadesAtuais = Array.isArray(prev.atividades) ? prev.atividades : [];
            const novasAtividades =
              typeof updater === 'function' ? updater(atividadesAtuais) : updater;

            return {
              ...prev,
              atividades: Array.isArray(novasAtividades) ? novasAtividades : [],
            };
          });
        }}
        canEdit={true}
        museusOptions={museusOptions}
        tiposAcaoOptions={tiposAcaoOptions}
        mesReferencia={form?.mes_referencia || report?.mes_referencia || ''}
        ano={Number(form?.ano || report?.ano || new Date().getFullYear())}
      />

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="px-4 py-2 bg-black text-white rounded disabled:opacity-60"
      >
        {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
