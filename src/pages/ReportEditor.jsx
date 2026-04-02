import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AtividadesSection from '@/components/reports/AtividadesSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, List, Save } from 'lucide-react';

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

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ANOS = [2024, 2025, 2026];
const MUSEUS_OPTIONS = ['MIS', 'MuMo', 'MHAB', 'Administração', 'Comunicação', 'Coordenação', 'Área'];

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

export default function ReportEditor() {
  const [params] = useSearchParams();
  const reportId = params.get('id');

  const [localReportId, setLocalReportId] = useState(reportId || null);
  const effectiveReportId = localReportId || reportId || null;
  const isEdit = Boolean(effectiveReportId);

  const [currentTab, setCurrentTab] = useState('relatorio');
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [form, setForm] = useState({
    museu: '',
    mes_referencia: '',
    ano: new Date().getFullYear(),
    author_name: '',
    equipe: '',
    resumo_periodo: '',
    atividades: [],
    oportunidades_resumo: '',
    comentarios_coordenacao: '',
    comentarios_gerais: '',
    avaliacao_pontos_positivos: '',
    avaliacao_desafios: '',
    avaliacao_sugestoes: '',
    historico_observacoes: '',
    fotos: [],
    status: 'DRAFT',
  });

  const lastLoadedReportIdRef = useRef(null);
  const isFirstRender = useRef(true);
  const autoSaveTimer = useRef(null);

  const { data: report, refetch } = useQuery({
    queryKey: ['report', effectiveReportId],
    enabled: !!effectiveReportId,
    queryFn: () => base44.entities.Report.get(effectiveReportId),
  });

  useEffect(() => {
    base44.auth.me().then((u) => setCurrentUser(u)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setForm((prev) => ({
      ...prev,
      author_name: prev.author_name || currentUser.full_name || '',
      equipe: prev.equipe || currentUser.email || '',
    }));
  }, [currentUser]);

  useEffect(() => {
    if (!report?.id) return;
    if (lastLoadedReportIdRef.current === report.id) return;

    setForm((prev) => ({
      ...prev,
      ...report,
      resumo_periodo: report?.resumo_periodo ?? '',
      oportunidades_resumo: report?.oportunidades_resumo ?? '',
      atividades: Array.isArray(report.atividades)
        ? report.atividades.map((atividade) => ({
            ...atividade,
            id: atividade?.id || crypto.randomUUID(),
            quantidade_ocorrencias: atividade?.quantidade_ocorrencias ?? '',
            quantidade_produtos_gerados: atividade?.quantidade_produtos_gerados ?? '',
            publico_estimado: atividade?.publico_estimado ?? '',
            total_atividades: atividade?.total_atividades ?? '',
            publico_total: atividade?.publico_total ?? '',
            total_produtos_gerados: atividade?.total_produtos_gerados ?? '',
          }))
        : [],
      fotos: Array.isArray(report.fotos) ? report.fotos : [],
      comentarios_coordenacao: report?.comentarios_coordenacao ?? '',
      comentarios_gerais: report?.comentarios_gerais ?? '',
      avaliacao_pontos_positivos: report?.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: report?.avaliacao_desafios ?? '',
      avaliacao_sugestoes: report?.avaliacao_sugestoes ?? '',
      historico_observacoes: report?.historico_observacoes ?? '',
      status: report?.status || 'DRAFT',
    }));

    lastLoadedReportIdRef.current = report.id;
  }, [report]);

  const museusOptions = useMemo(() => {
    const valores = report?.museusOptions || report?.museus || [];
    return Array.isArray(valores) ? valores.filter(Boolean) : [];
  }, [report]);

  const tiposAcaoOptions = useMemo(() => {
    const valores = report?.tiposAcaoOptions || report?.tipos_acao || [];
    return Array.isArray(valores) ? valores.filter(Boolean) : [];
  }, [report]);

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function buildPayload(nextStatus) {
    return {
      ...form,
      ...(nextStatus ? { status: nextStatus } : {}),
      museu: form?.museu ?? '',
      mes_referencia: form?.mes_referencia ?? '',
      ano: form?.ano ?? new Date().getFullYear(),
      author_name: form?.author_name ?? '',
      equipe: form?.equipe ?? '',
      resumo_periodo: form?.resumo_periodo ?? '',
      oportunidades_resumo: form?.oportunidades_resumo ?? '',
      comentarios_coordenacao: form?.comentarios_coordenacao ?? '',
      comentarios_gerais: form?.comentarios_gerais ?? '',
      avaliacao_pontos_positivos: form?.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: form?.avaliacao_desafios ?? '',
      avaliacao_sugestoes: form?.avaliacao_sugestoes ?? '',
      historico_observacoes: form?.historico_observacoes ?? '',
      atividades: (form.atividades || []).map((a) => ({
        ...a,
        quantidade_ocorrencias: normalizeNullableNumber(a.quantidade_ocorrencias),
        quantidade_produtos_gerados: normalizeNullableNumber(a.quantidade_produtos_gerados),
        publico_estimado: normalizeNullableNumber(a.publico_estimado),
        total_atividades: normalizeNullableNumber(a.total_atividades),
        publico_total: normalizeNullableNumber(a.publico_total),
        total_produtos_gerados: normalizeNullableNumber(a.total_produtos_gerados),
      })),
      fotos: Array.isArray(form.fotos) ? form.fotos : [],
    };
  }

  const isApproved = form?.status === 'APPROVED';
  const canSubmit = !isApproved;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form?.status || 'DRAFT');

      const idAtual = localReportId || reportId;
      const isEditNow = Boolean(idAtual);

      let saved;

      if (!isEditNow) {
        saved = await base44.entities.Report.create({
          ...payload,
          status: payload?.status || 'DRAFT',
        });

        if (saved?.id) {
          setLocalReportId(saved.id);
          lastLoadedReportIdRef.current = null;
          window.history.replaceState(null, '', `/ReportEditor?id=${saved.id}`);
        }
      } else {
        saved = await base44.entities.Report.update(idAtual, payload);
      }

      if (!saved?.id) {
        throw new Error('Servidor não confirmou a gravação.');
      }

      const finalId = saved?.id || idAtual;

      try {
        await base44.functions.invoke('backupReportToDrive', { reportId: finalId });
      } catch (backupErr) {
        console.warn('Backup Drive falhou (silencioso):', backupErr?.message);
      }

      return saved;
    },
    onSuccess: async () => {
      const msg = '✅ Relatório gravado com sucesso!';
      setSuccessMessage({ type: 'save', text: msg });
      toast.success(msg, { duration: 5000 });
      await refetch();
    },
    onError: (e) => {
      toast.error('❌ Erro ao salvar: ' + (e?.message || 'tente novamente'));
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const idAtual = localReportId || reportId;

      if (!idAtual) {
        throw new Error('Salve o relatório antes de enviar para revisão.');
      }

      const payload = buildPayload('SUBMITTED');
      payload.submitted_at = new Date().toISOString();
      payload.review_status = 'aguardando_revisao';

      if (!payload.museu) throw new Error('Selecione um Museu / Área antes de enviar');
      if (!payload.mes_referencia) throw new Error('Selecione um Mês de referência antes de enviar');
      if (!payload.author_name) throw new Error('Preencha o Nome do autor antes de enviar');
      if (!payload.ano) throw new Error('Selecione um Ano antes de enviar');

      const saved = await base44.entities.Report.update(idAtual, payload);

      if (!saved?.id) {
        throw new Error('Servidor não confirmou o envio. Tente novamente.');
      }

      try {
        await base44.functions.invoke('notifyCoordinatorOnSubmit', {
          reportId: idAtual,
          reportData: saved,
        });
      } catch (notifErr) {
        console.warn('Notificação falhou (silenciosa):', notifErr?.message);
      }

      try {
        await base44.functions.invoke('backupReportToDrive', { reportId: idAtual });
      } catch (e) {
        console.warn('Backup Drive ao enviar falhou:', e?.message);
      }

      return saved;
    },
    onSuccess: async () => {
      const msg = '📨 Relatório enviado para revisão com sucesso! A coordenação será notificada.';
      setSuccessMessage({ type: 'submit', text: msg });
      toast.success(msg, { duration: 8000 });
      setForm((prev) => ({
        ...prev,
        status: 'SUBMITTED',
        review_status: 'aguardando_revisao',
      }));
      await refetch();
    },
    onError: (e) => {
      toast.error('❌ Erro ao enviar para revisão: ' + (e?.message || 'tente novamente'));
    },
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isApproved) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(async () => {
      try {
        const payload = buildPayload(form?.status || 'DRAFT');
        const idAutoSave = localReportId || reportId;

        if (!idAutoSave) {
          const created = await base44.entities.Report.create({
            ...payload,
            status: 'DRAFT',
          });

          if (created?.id) {
            setLocalReportId(created.id);
            lastLoadedReportIdRef.current = null;
            window.history.replaceState(null, '', `/ReportEditor?id=${created.id}`);
            console.log('[AutoSave] Relatório criado automaticamente:', created.id);
          }
          return;
        }

        await base44.entities.Report.update(idAutoSave, payload);
        console.log('[AutoSave] Relatório salvo automaticamente');
      } catch (err) {
        console.error('[AutoSave] Erro ao salvar:', err?.message);
      }
    }, 1000);

    return () => clearTimeout(autoSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    localReportId,
    reportId,
    isApproved,
    form.museu,
    form.mes_referencia,
    form.ano,
    form.author_name,
    form.equipe,
    form.resumo_periodo,
    form.atividades,
    form.oportunidades_resumo,
    form.avaliacao_pontos_positivos,
    form.avaliacao_desafios,
    form.avaliacao_sugestoes,
    form.comentarios_gerais,
    form.comentarios_coordenacao,
    form.historico_observacoes,
    form.status,
    form.fotos,
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Editar Relatório</h1>
          <p className="text-sm text-gray-500">
            Preencha as abas do relatório e envie para revisão da coordenação.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
              form?.status
            )}`}
          >
            {getStatusLabel(form?.status)}
          </span>

          {!isApproved && (
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-black text-white text-sm rounded-lg disabled:opacity-60 hover:bg-gray-800 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Rascunho'}
            </button>
          )}

          {!isApproved && (
            <button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit || saveMutation.isPending || submitMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 border border-black text-black text-sm rounded-lg disabled:opacity-60 hover:bg-gray-50 transition-colors"
            >
              {submitMutation.isPending ? 'Enviando...' : 'Enviar para revisão'}
            </button>
          )}
        </div>
      </div>

      {successMessage && (
        <div
          className={`rounded-xl border-2 p-4 flex items-start gap-3 ${
            successMessage.type === 'submit'
              ? 'border-blue-400 bg-blue-50'
              : 'border-green-400 bg-green-50'
          }`}
        >
          <span className="text-2xl">{successMessage.type === 'submit' ? '📨' : '✅'}</span>
          <div className="flex-1">
            <p className={`font-semibold text-sm ${successMessage.type === 'submit' ? 'text-blue-800' : 'text-green-800'}`}>
              {successMessage.type === 'submit' ? 'Relatório Enviado para Revisão!' : 'Relatório Salvo com Sucesso!'}
            </p>
            <p className={`text-xs mt-0.5 ${successMessage.type === 'submit' ? 'text-blue-700' : 'text-green-700'}`}>
              {successMessage.text}
            </p>
            {successMessage.type === 'submit' && (
              <p className="text-xs text-blue-600 mt-1 font-medium">
                ⏳ Status atual: <strong>Aguardando Revisão da Coordenação</strong>
              </p>
            )}
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

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

      {currentTab === 'relatorio' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Mês de referência">
              <Select
                value={form?.mes_referencia || ''}
                onValueChange={(v) => updateField('mes_referencia', v)}
                disabled={isApproved}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Ano">
              <Select
                value={String(form?.ano || '')}
                onValueChange={(v) => updateField('ano', Number(v))}
                disabled={isApproved}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o ano" /></SelectTrigger>
                <SelectContent>
                  {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Museu / Área">
              <Select
                value={form?.museu || ''}
                onValueChange={(v) => updateField('museu', v)}
                disabled={isApproved}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MUSEUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Autor do relatório">
              <Input
                value={toInputValue(form?.author_name, currentUser?.full_name || '')}
                onChange={(e) => updateField('author_name', e.target.value)}
                disabled={isApproved}
                placeholder={currentUser?.full_name || 'Nome do autor'}
              />
            </Field>

            <Field label="Equipe / E-mail de login">
              <Input
                value={toInputValue(form?.equipe, currentUser?.email || '')}
                onChange={(e) => updateField('equipe', e.target.value)}
                disabled={isApproved}
                placeholder={currentUser?.email || 'E-mail de login'}
              />
            </Field>
          </div>

          <Field label="Resumo / apresentação do período">
            <div className="space-y-1">
              {!isApproved && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = form?.resumo_periodo || '';
                      updateField('resumo_periodo', v + (v && !v.endsWith('\n') ? '\n' : '') + '• ');
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 border rounded"
                  >
                    <List className="w-3 h-3" /> Tópico
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      toast.info('✨ IA completando...', { duration: 2000 });
                      const res = await base44.integrations.Core.InvokeLLM({
                        prompt: `Complete ou melhore este resumo de relatório mensal de museu. Escreva em português formal, em tópicos com •. Retorne apenas o texto.\n\nTexto atual:\n${form?.resumo_periodo || ''}`,
                      });
                      if (res) updateField('resumo_periodo', res);
                    }}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 px-2 py-1 border border-purple-200 rounded"
                  >
                    <Sparkles className="w-3 h-3" /> IA
                  </button>
                </div>
              )}

              <Textarea
                value={toInputValue(form?.resumo_periodo, '')}
                onChange={(e) => updateField('resumo_periodo', e.target.value)}
                rows={7}
                disabled={isApproved}
                className="text-base p-4"
              />
            </div>
          </Field>

          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Avaliação do período</h3>
            <div className="space-y-4">
              {[
                { key: 'avaliacao_pontos_positivos', label: 'Pontos positivos' },
                { key: 'avaliacao_desafios', label: 'Desafios encontrados' },
                { key: 'avaliacao_sugestoes', label: 'Sugestões e encaminhamentos' }
              ].map(({ key, label }) => (
                <Field key={key} label={label}>
                  <Textarea
                    value={toInputValue(form?.[key], '')}
                    onChange={(e) => updateField(key, e.target.value)}
                    rows={5}
                    disabled={isApproved}
                    className="text-base p-4"
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Oportunidades identificadas</h3>
            <div className="space-y-4">
              <Field label="Resumo de oportunidades">
                <Textarea
                  value={toInputValue(form?.oportunidades_resumo, '')}
                  onChange={(e) => updateField('oportunidades_resumo', e.target.value)}
                  rows={5}
                  disabled={isApproved}
                  placeholder="Descreva as oportunidades identificadas no período"
                  className="text-base p-4"
                />
              </Field>
            </div>
          </div>

          <div className="border-t pt-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Comentários</h3>
            <div className="space-y-4">
              <Field label="Comentários gerais">
                <Textarea
                  value={toInputValue(form?.comentarios_gerais, '')}
                  onChange={(e) => updateField('comentarios_gerais', e.target.value)}
                  rows={5}
                  disabled={isApproved}
                  className="text-base p-4"
                />
              </Field>

              <Field label="Comentários para coordenação">
                <Textarea
                  value={toInputValue(form?.comentarios_coordenacao, '')}
                  onChange={(e) => updateField('comentarios_coordenacao', e.target.value)}
                  rows={5}
                  disabled={isApproved}
                  className="text-base p-4"
                />
              </Field>

              {form?.review_comment && (
                <Field label="Comentário de aprovação">
                  <Textarea value={toInputValue(form?.review_comment, '')} rows={5} readOnly className="text-base p-4" />
                </Field>
              )}

              {form?.return_comment && (
                <Field label="Comentário de devolução">
                  <Textarea value={toInputValue(form?.return_comment, '')} rows={5} readOnly className="text-base p-4" />
                </Field>
              )}
            </div>
          </div>

          {!isApproved && (
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="mt-6 px-4 py-2 bg-black text-white rounded disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar relatório'}
            </button>
          )}
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
          museu={form?.museu || ''}
          reportId={localReportId || reportId}
          onSave={async () => {
            const idAtual = localReportId || reportId;
            if (!idAtual) throw new Error('Salve o relatório primeiro antes de salvar atividades.');
            const payload = buildPayload(form?.status || 'DRAFT');
            const saved = await base44.entities.Report.update(idAtual, payload);
            if (!saved?.id) throw new Error('Servidor não confirmou a gravação.');
            await refetch();
          }}
        />
      )}

      {currentTab === 'fotos' && effectiveReportId && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">📎 Fotos vinculadas ao relatório</h2>
            <ReportPhotoSection
              photos={form.fotos || []}
              reportId={effectiveReportId}
              onAddPhoto={(photo) => {
                setForm((prev) => ({
                  ...prev,
                  fotos: [...(prev.fotos || []), photo],
                }));
              }}
              onUpdatePhoto={(photoId, caption) => {
                setForm((prev) => ({
                  ...prev,
                  fotos: (prev.fotos || []).map((p) =>
                    p.id === photoId ? { ...p, caption } : p
                  ),
                }));
              }}
              onDeletePhoto={(photoId) => {
                setForm((prev) => ({
                  ...prev,
                  fotos: (prev.fotos || []).filter((p) => p.id !== photoId),
                }));
              }}
            />
            <p className="text-xs text-gray-500 mt-3">
              💡 Vincule fotos da galeria de relatórios aprovados. Salve o relatório para persistir os vínculos.
            </p>
          </div>

          <AttachmentsSection
            reportId={localReportId || reportId}
            canEdit={!isApproved}
            reportData={form}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 items-center mt-6">
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
          disabled={!canSubmit || saveMutation.isPending || submitMutation.isPending}
          className="px-4 py-2 border border-black text-black rounded disabled:opacity-60"
        >
          {submitMutation.isPending ? 'Enviando...' : 'Enviar para revisão'}
        </button>

        {successMessage && (
          <span
            className={`text-sm font-medium flex items-center gap-1 ${
              successMessage.type === 'submit' ? 'text-blue-700' : 'text-green-700'
            }`}
          >
            {successMessage.text}
          </span>
        )}
      </div>
    </div>
  );
}