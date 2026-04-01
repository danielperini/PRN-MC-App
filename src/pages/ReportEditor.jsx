import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AtividadesSection from '@/components/reports/AtividadesSection';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function normalizeNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInputValue(value, fallback = '') {
  return value === null || value === undefined ? fallback : value;
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

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

function normalizeOportunidades(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [''];
  return [String(value)];
}

export default function ReportEditor() {
  const [params] = useSearchParams();
  const reportId = params.get('id');

  const [currentTab, setCurrentTab] = useState('identificacao');
  const [form, setForm] = useState({
    atividades: [],
    oportunidades: [''],
    comentarios_coordenacao: '',
    comentarios_gerais: '',
    avaliacao_pontos_positivos: '',
    avaliacao_desafios: '',
    avaliacao_sugestoes: '',
    historico_observacoes: '',
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
      oportunidades: normalizeOportunidades(report.oportunidades),
      comentarios_coordenacao: report?.comentarios_coordenacao ?? '',
      comentarios_gerais: report?.comentarios_gerais ?? '',
      avaliacao_pontos_positivos: report?.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: report?.avaliacao_desafios ?? '',
      avaliacao_sugestoes: report?.avaliacao_sugestoes ?? '',
      historico_observacoes: report?.historico_observacoes ?? '',
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

  const isApproved = form?.status === 'APPROVED';

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateOportunidade(index, value) {
    setForm((prev) => {
      const list = Array.isArray(prev.oportunidades) ? [...prev.oportunidades] : [];
      list[index] = value;
      return {
        ...prev,
        oportunidades: list,
      };
    });
  }

  function addOportunidade() {
    setForm((prev) => ({
      ...prev,
      oportunidades: [...(Array.isArray(prev.oportunidades) ? prev.oportunidades : []), ''],
    }));
  }

  function removeOportunidade(index) {
    setForm((prev) => {
      const list = Array.isArray(prev.oportunidades) ? [...prev.oportunidades] : [];
      list.splice(index, 1);
      return {
        ...prev,
        oportunidades: list.length ? list : [''],
      };
    });
  }

  function buildPayload(nextStatus) {
    return {
      ...form,
      ...(nextStatus ? { status: nextStatus } : {}),
      oportunidades: (form.oportunidades || []).map((item) => String(item || '').trim()).filter(Boolean),
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

  const canSubmit = !isApproved && !saveMutation.isPending && !submitMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Editar Relatório</h1>
          <p className="text-sm text-gray-500">
            Preencha as abas do relatório e envie para revisão da coordenação.
          </p>
        </div>

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

      <ReportTabsNavigation
        currentTab={currentTab}
        formData={form}
        onTabChange={setCurrentTab}
      />

      {currentTab === 'identificacao' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Mês de referência">
              <Input
                value={toInputValue(form?.mes_referencia, '')}
                onChange={(e) => updateField('mes_referencia', e.target.value)}
                disabled={isApproved}
              />
            </Field>

            <Field label="Ano">
              <Input
                type="number"
                value={toInputValue(form?.ano, '')}
                onChange={(e) => updateField('ano', e.target.value)}
                disabled={isApproved}
              />
            </Field>

            <Field label="Museu">
              <Input
                value={toInputValue(form?.museu, '')}
                onChange={(e) => updateField('museu', e.target.value)}
                disabled={isApproved}
              />
            </Field>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Autor do relatório">
              <Input
                value={toInputValue(form?.author_name, '')}
                onChange={(e) => updateField('author_name', e.target.value)}
                disabled={isApproved}
              />
            </Field>

            <Field label="E-mail do autor">
              <Input
                value={toInputValue(form?.author_email, '')}
                onChange={(e) => updateField('author_email', e.target.value)}
                disabled={isApproved}
              />
            </Field>
          </div>

          <Field label="Resumo / apresentação do período">
            <Textarea
              value={toInputValue(form?.resumo_periodo, '')}
              onChange={(e) => updateField('resumo_periodo', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>
        </div>
      )}

      {currentTab === 'atividades' && (
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
      )}

      {currentTab === 'oportunidades' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Oportunidades identificadas
            </h2>

            {!isApproved && (
              <button
                type="button"
                onClick={addOportunidade}
                className="px-3 py-1.5 border rounded text-sm"
              >
                Adicionar oportunidade
              </button>
            )}
          </div>

          {(form.oportunidades || []).map((item, index) => (
            <div key={index} className="flex gap-2">
              <Textarea
                value={toInputValue(item, '')}
                onChange={(e) => updateOportunidade(index, e.target.value)}
                rows={3}
                disabled={isApproved}
              />
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => removeOportunidade(index)}
                  className="px-3 py-2 border rounded h-fit"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {currentTab === 'avaliacao' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <Field label="Pontos positivos">
            <Textarea
              value={toInputValue(form?.avaliacao_pontos_positivos, '')}
              onChange={(e) => updateField('avaliacao_pontos_positivos', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>

          <Field label="Desafios encontrados">
            <Textarea
              value={toInputValue(form?.avaliacao_desafios, '')}
              onChange={(e) => updateField('avaliacao_desafios', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>

          <Field label="Sugestões / encaminhamentos">
            <Textarea
              value={toInputValue(form?.avaliacao_sugestoes, '')}
              onChange={(e) => updateField('avaliacao_sugestoes', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>
        </div>
      )}

      {currentTab === 'comentarios' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <Field label="Comentários gerais">
            <Textarea
              value={toInputValue(form?.comentarios_gerais, '')}
              onChange={(e) => updateField('comentarios_gerais', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>

          <Field label="Comentários para coordenação">
            <Textarea
              value={toInputValue(form?.comentarios_coordenacao, '')}
              onChange={(e) => updateField('comentarios_coordenacao', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>

          {form?.review_comment && (
            <Field label="Comentário de aprovação">
              <Textarea value={toInputValue(form?.review_comment, '')} rows={4} readOnly />
            </Field>
          )}

          {form?.return_comment && (
            <Field label="Comentário de devolução">
              <Textarea value={toInputValue(form?.return_comment, '')} rows={4} readOnly />
            </Field>
          )}
        </div>
      )}

      {currentTab === 'historico' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Criado em">
              <Input value={toInputValue(form?.created_date, '')} readOnly />
            </Field>

            <Field label="Última atualização">
              <Input value={toInputValue(form?.updated_date, '')} readOnly />
            </Field>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Revisor">
              <Input value={toInputValue(form?.reviewer_name, '')} readOnly />
            </Field>

            <Field label="E-mail do revisor">
              <Input value={toInputValue(form?.reviewer_email, '')} readOnly />
            </Field>
          </div>

          <Field label="Observações de histórico">
            <Textarea
              value={toInputValue(form?.historico_observacoes, '')}
              onChange={(e) => updateField('historico_observacoes', e.target.value)}
              rows={5}
              disabled={isApproved}
            />
          </Field>
        </div>
      )}

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
