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

function getStatusLabel(status) {
  switch (status) {
    case 'DRAFT':
      return 'Rascunho';
    case 'SUBMITTED':
      return 'Enviado';
    case 'IN_REVIEW':
      return 'Em revisão';
    case 'APPROVED':
      return 'Aprovado';
    case 'RETURNED':
      return 'Devolvido';
    default:
      return status || 'Rascunho';
  }
}

function getStatusClasses(status) {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'RETURNED':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'SUBMITTED':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'IN_REVIEW':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export default function ReportEditor() {
  const [params] = useSearchParams();
  const reportId = params.get('id');

  const [form, setForm] = useState({
    atividades: [],
  });

  const { data: report, refetch } = useQuery({
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
            quantidade_ocorrencias: atividade?.quantidade_ocorrencias ?? '',
            quantidade_produtos_gerados: atividade?.quantidade_produtos_gerados ?? '',
            publico_estimado: atividade?.publico_estimado ?? '',
            total_atividades: atividade?.total_atividades ?? '',
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

  function buildPayload(nextStatus) {
    return {
      ...form,
      ...(nextStatus ? { status: nextStatus } : {}),
      atividades: (form.atividades || []).map((a) => ({
        ...a,
        quantidade_ocorrencias: normalizeNullableNumber(a.quantidade_ocorrencias),
        quantidade_produtos_gerados: normalizeNullableNumber(a.quantidade_produtos_gerados),
        publico_estimado: normalizeNullableNumber(a.publico_estimado),
        total_atividades: normalizeNullableNumber(a.total_atividades),
        publico_total: normalizeNullableNumber(a.publico_total),
        total_produtos_gerados: normalizeNullableNumber(a.total_produtos_gerados),
      })),
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form?.status || 'DRAFT');
      return base44.entities.Report.update(reportId, payload);
    },
    onSuccess: async () => {
      toast.success('Relatório salvo');
      await refetch();
    },
    onError: (e) => toast.error(e?.message || 'Erro ao salvar relatório'),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload('SUBMITTED');
      payload.submitted_at = new Date().toISOString();
      payload.review_status = 'aguardando_revisao';
      return base44.entities.Report.update(reportId, payload);
    },
    onSuccess: async () => {
      toast.success('Relatório enviado para revisão');
      setForm((prev) => ({
        ...prev,
        status: 'SUBMITTED',
        review_status: 'aguardando_revisao',
      }));
      await refetch();
    },
    onError: (e) => toast.error(e?.message || 'Erro ao enviar relatório'),
  });

  const isApproved = form?.status === 'APPROVED';
  const canSubmit = !isApproved && !saveMutation.isPending && !submitMutation.isPending;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">Editar Relatório</h1>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
              form?.status
            )}`}
          >
            {getStatusLabel(form?.status)}
          </span>
        </div>
      </div>

      {form?.status === 'RETURNED' && form?.return_comment && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-700">
            Relatório devolvido pelo coordenador
          </div>
          <p className="mt-1 text-sm text-red-700 whitespace-pre-wrap">
            {form.return_comment}
          </p>
        </div>
      )}

      {form?.status === 'APPROVED' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="text-sm font-semibold text-green-700">
            Relatório aprovado
          </div>
          <p className="mt-1 text-sm text-green-700">
            Este relatório já foi aprovado pela coordenação.
          </p>
        </div>
      )}

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
        canEdit={!isApproved}
        museusOptions={museusOptions}
        tiposAcaoOptions={tiposAcaoOptions}
        mesReferencia={form?.mes_referencia || report?.mes_referencia || ''}
        ano={Number(form?.ano || report?.ano || new Date().getFullYear())}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isApproved}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
        </button>

        <button
          type="button"
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit}
          className="px-4 py-2 border border-black text-black rounded disabled:opacity-60"
        >
          {submitMutation.isPending ? 'Enviando...' : 'Enviar para revisão'}
        </button>
      </div>
    </div>
  );
}
