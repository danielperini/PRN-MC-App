import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyUser } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getStatusBadge(status) {
  const s = normalizeStatus(status);
  if (s === 'PAGO') return { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' };
  if (s === 'APROVADO_COORD') return { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' };
  if (s === 'AGUARDANDO_APROVACAO') {
    return { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' };
  }
  if (s === 'DEVOLVIDO_REVISAO') {
    return { label: 'Devolvido', className: 'bg-orange-100 text-orange-800' };
  }
  return { label: status || '—', className: 'bg-gray-100 text-gray-700' };
}

function extractErrorMessage(err) {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.data?.error ||
    err?.data?.message ||
    err?.error ||
    err?.message ||
    'Erro ao processar'
  );
}

function extractErrorDetails(err) {
  const debug =
    err?.response?.data?.debug ||
    err?.data?.debug ||
    err?.response?.data?.details ||
    err?.data?.details ||
    null;

  if (!debug) return '';

  try {
    return JSON.stringify(debug, null, 2);
  } catch {
    return String(debug);
  }
}

function getRubricaNome(payment) {
  return payment?.rubrica_nome || payment?.rubrica || '—';
}

function pickBestPayments(payments = []) {
  const map = new Map();

  for (const p of payments) {
    const key = `${p?.user_email || ''}_${p?.mes_referencia || ''}_${p?.ano || ''}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, p);
      continue;
    }

    const currentValue = toNumber(current?.valor_nf || current?.valor_parcela_previsto);
    const nextValue = toNumber(p?.valor_nf || p?.valor_parcela_previsto);

    if (nextValue > currentValue) {
      map.set(key, p);
      continue;
    }

    const currentDate = new Date(current?.created_date || current?.created_at || 0).getTime();
    const nextDate = new Date(p?.created_date || p?.created_at || 0).getTime();

    if (nextDate > currentDate) {
      map.set(key, p);
    }
  }

  return Array.from(map.values());
}

function isEquipeGestaoRubrica(rubrica) {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '');
  const texto = `${grupo} ${nome}`;

  const termos = [
    'equipe',
    'gestao',
    'gestão',
    'assistente de producao',
    'assistentes de producao',
    'assistente producao',
    'assistentes producao',
    'producao',
    'produção',
    'educador',
    'educadores',
    'diaria',
    'diarias',
    'diárias',
    'publicacao',
    'publicação',
  ];

  return termos.some((termo) => texto.includes(normalizeString(termo)));
}

function getRubricaDisplayName(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || rubrica?.titulo || 'Rubrica sem nome';
}

export default function TeamPaymentReview() {
  const queryClient = useQueryClient();

  const [savingByPayment, setSavingByPayment] = useState({});
  const [loadingPay, setLoadingPay] = useState({});
  const [rubricaDraftByPayment, setRubricaDraftByPayment] = useState({});
  const [errorByPayment, setErrorByPayment] = useState({});
  const [errorDebugByPayment, setErrorDebugByPayment] = useState({});
  const [successByPayment, setSuccessByPayment] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-review'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-team-payment-review'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 500),
  });

  const rubricasEquipeGestao = useMemo(() => {
    const filtered = (rubricas || []).filter(isEquipeGestaoRubrica);
    return [...filtered].sort((a, b) =>
      getRubricaDisplayName(a).localeCompare(getRubricaDisplayName(b), 'pt-BR')
    );
  }, [rubricas]);

  const ordered = useMemo(() => {
    const unique = pickBestPayments(payments || []);
    return [...unique].sort(
      (a, b) =>
        new Date(b?.created_date || b?.created_at || 0).getTime() -
        new Date(a?.created_date || a?.created_at || 0).getTime()
    );
  }, [payments]);

  async function recalculateRubricas() {
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
    } catch (err) {
      console.warn('Falha ao recalcular rubricas', err);
    }
  }

  async function refresh() {
    await Promise.all([
      recalculateRubricas(),
      queryClient.invalidateQueries({ queryKey: ['team-payments-review'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-total-utilizado'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['team-members'] }),
    ]);
  }

  function clearCardMessages(paymentId) {
    setErrorByPayment((prev) => ({ ...prev, [paymentId]: '' }));
    setErrorDebugByPayment((prev) => ({ ...prev, [paymentId]: '' }));
    setSuccessByPayment((prev) => ({ ...prev, [paymentId]: '' }));
  }

  function resolveRubricaFromMember(payment) {
    const member = members.find(
      (m) =>
        String(m.user_email || '').trim().toLowerCase() ===
        String(payment.user_email || '').trim().toLowerCase()
    );

    if (!member || !member?.rubrica_id) return null;

    return {
      rubrica_id: member.rubrica_id,
      rubrica_nome: member.rubrica_nome || '',
    };
  }

  function getSelectedRubricaId(payment) {
    return (
      rubricaDraftByPayment[payment.id] ||
      payment?.rubrica_id ||
      resolveRubricaFromMember(payment)?.rubrica_id ||
      ''
    );
  }

  function getSelectedRubricaNome(payment) {
    const draftId = rubricaDraftByPayment[payment.id];

    if (draftId) {
      const selected = rubricasEquipeGestao.find((r) => r.id === draftId);
      if (selected) return getRubricaDisplayName(selected);
    }

    if (payment?.rubrica_nome) return payment.rubrica_nome;

    const fromMember = resolveRubricaFromMember(payment);
    if (fromMember?.rubrica_nome) return fromMember.rubrica_nome;

    if (fromMember?.rubrica_id) {
      const selected = rubricasEquipeGestao.find((r) => r.id === fromMember.rubrica_id);
      if (selected) return getRubricaDisplayName(selected);
    }

    return '';
  }

  function buildApproveChecklist(payment) {
    const status = normalizeStatus(payment?.status);
    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto || 0);
    const selectedRubricaId = getSelectedRubricaId(payment);
    const selectedRubricaNome = getSelectedRubricaNome(payment);
    const rubricaOption = rubricasEquipeGestao.find((r) => r.id === selectedRubricaId);
    const memberMatch = members.find(
      (m) =>
        String(m.user_email || '').trim().toLowerCase() ===
        String(payment.user_email || '').trim().toLowerCase()
    );

    const checks = [
      {
        key: 'status',
        label: 'Status está em Aguardando aprovação',
        ok: status === 'AGUARDANDO_APROVACAO',
        detailOk: 'Status válido para aprovar.',
        detailError: `Status atual: ${payment?.status || '—'}.`,
      },
      {
        key: 'valor',
        label: 'Valor do pagamento é válido',
        ok: valor > 0,
        detailOk: `Valor identificado: ${formatBRL(valor)}.`,
        detailError: 'Valor zerado ou inválido.',
      },
      {
        key: 'member',
        label: 'Membro de equipe foi localizado',
        ok: !!memberMatch,
        detailOk: 'Vínculo do membro localizado pelo e-mail.',
        detailError: `Nenhum TeamMember encontrado para ${payment?.user_email || '—'}.`,
      },
      {
        key: 'rubrica',
        label: 'Rubrica está definida',
        ok: !!selectedRubricaId,
        detailOk: `Rubrica selecionada: ${selectedRubricaNome || selectedRubricaId}.`,
        detailError: 'Nenhuma rubrica selecionada ou vinculada.',
      },
      {
        key: 'rubrica_lista',
        label: 'Rubrica existe na lista de equipe/gestão',
        ok: !!rubricaOption || !!selectedRubricaId,
        detailOk: rubricaOption
          ? `Rubrica encontrada na lista: ${getRubricaDisplayName(rubricaOption)}.`
          : selectedRubricaId
            ? `Rubrica vinculada por ID: ${selectedRubricaId}.`
            : 'Rubrica não informada.',
        detailError: 'Rubrica não encontrada na lista disponível.',
      },
    ];

    return {
      checks,
      canApprove: checks.every((item) => item.ok),
    };
  }

  async function approve(payment) {
    if (savingByPayment[payment.id]) return;

    clearCardMessages(payment.id);
    setSavingByPayment((prev) => ({ ...prev, [payment.id]: true }));

    try {
      const checklist = buildApproveChecklist(payment);

      if (!checklist.canApprove) {
        const failed = checklist.checks.filter((item) => !item.ok);
        const message = `Aprovação bloqueada. Verifique: ${failed.map((item) => item.label).join(' | ')}`;
        setErrorByPayment((prev) => ({ ...prev, [payment.id]: message }));
        toast.error(message);
        return;
      }

      const selectedRubricaId = getSelectedRubricaId(payment);
      const selectedRubrica = rubricasEquipeGestao.find((r) => r.id === selectedRubricaId);
      const rubricaNomeFinal =
        (selectedRubrica && getRubricaDisplayName(selectedRubrica)) ||
        getSelectedRubricaNome(payment);

      await base44.entities.TeamPayment.update(payment.id, {
        rubrica_id: selectedRubricaId,
        rubrica_nome: rubricaNomeFinal || '',
      });

      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'approve',
        rubrica_id: selectedRubricaId,
        rubrica_nome: rubricaNomeFinal || '',
      });

      const result = res?.data || res || {};

      if (result?.error) {
        throw { response: { data: result } };
      }

      const successMessage = result?.message || `Pagamento aprovado com sucesso. Rubrica vinculada: ${rubricaNomeFinal || selectedRubricaId}.`;
      setSuccessByPayment((prev) => ({ ...prev, [payment.id]: successMessage }));
      toast.success(successMessage);

      try {
        await notifyUser(payment.user_email, {
          title: 'Pagamento aprovado',
          message: 'Sua nota fiscal foi aprovada. O pagamento será efetuado em até 5 dias úteis.',
          type: 'success',
          action_url: `${window.location.origin}/Compras`,
        });
      } catch (notifyErr) {
        console.warn('Falha ao notificar usuário', notifyErr);
      }

      await refresh();
    } catch (e) {
      const message = extractErrorMessage(e);
      const debug = extractErrorDetails(e);

      setErrorByPayment((prev) => ({ ...prev, [payment.id]: message }));
      setErrorDebugByPayment((prev) => ({ ...prev, [payment.id]: debug }));
      toast.error(message);
    } finally {
      setSavingByPayment((prev) => ({ ...prev, [payment.id]: false }));
    }
  }

  async function pay(payment) {
    if (loadingPay[payment.id]) return;

    clearCardMessages(payment.id);
    setLoadingPay((prev) => ({ ...prev, [payment.id]: true }));

    try {
      const selectedRubricaId = getSelectedRubricaId(payment);
      const rubricaNomeFinal = getSelectedRubricaNome(payment);

      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay',
        rubrica_id: selectedRubricaId || '',
        rubrica_nome: rubricaNomeFinal || '',
      });

      const result = res?.data || res || {};

      if (result?.error) {
        throw { response: { data: result } };
      }

      const successMessage = result?.message || 'Pagamento realizado com sucesso.';
      setSuccessByPayment((prev) => ({ ...prev, [payment.id]: successMessage }));
      toast.success(successMessage);

      await refresh();
    } catch (e) {
      const message = extractErrorMessage(e);
      const debug = extractErrorDetails(e);

      setErrorByPayment((prev) => ({ ...prev, [payment.id]: message }));
      setErrorDebugByPayment((prev) => ({ ...prev, [payment.id]: debug }));
      toast.error(message);
    } finally {
      setLoadingPay((prev) => ({ ...prev, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {ordered.length === 0 && (
        <div className="border rounded-xl p-4 text-sm text-gray-500">
          Nenhum pagamento encontrado.
        </div>
      )}

      {ordered.map((payment) => {
        const status = normalizeStatus(payment?.status);
        const badge = getStatusBadge(status);
        const valor = payment?.valor_nf || payment?.valor_parcela_previsto || 0;
        const selectedRubricaId = getSelectedRubricaId(payment);
        const selectedRubricaNome = getSelectedRubricaNome(payment);
        const checklist = buildApproveChecklist(payment);
        const cardError = errorByPayment[payment.id] || '';
        const cardDebug = errorDebugByPayment[payment.id] || '';
        const cardSuccess = successByPayment[payment.id] || '';
        const saving = !!savingByPayment[payment.id];

        return (
          <div key={payment.id} className="border rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{payment?.user_name || payment?.user_email}</div>
                <div className="text-xs">{payment?.mes_referencia}/{payment?.ano}</div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div>Valor: <b>{formatBRL(valor)}</b></div>
            <div>Rubrica: <b>{selectedRubricaNome || getRubricaNome(payment)}</b></div>

            {status === 'AGUARDANDO_APROVACAO' && (
              <div className="space-y-2">
                <Label>Selecionar rubrica</Label>
                <Select
                  value={selectedRubricaId}
                  onValueChange={(value) => {
                    clearCardMessages(payment.id);
                    setRubricaDraftByPayment((prev) => ({
                      ...prev,
                      [payment.id]: value,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a rubrica" />
                  </SelectTrigger>
                  <SelectContent>
                    {rubricasEquipeGestao.map((rubrica) => (
                      <SelectItem key={rubrica.id} value={rubrica.id}>
                        {getRubricaDisplayName(rubrica)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {status === 'AGUARDANDO_APROVACAO' && (
              <div className="rounded-lg border bg-gray-50 p-3 text-xs space-y-2">
                <div className="font-medium text-gray-800">Checklist de aprovação</div>

                {checklist.checks.map((item) => (
                  <div key={item.key} className="flex items-start gap-2">
                    <span className={item.ok ? 'text-emerald-600' : 'text-red-600'}>
                      {item.ok ? '✓' : '✕'}
                    </span>
                    <div>
                      <div className={item.ok ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                        {item.label}
                      </div>
                      <div className="text-gray-600">
                        {item.ok ? item.detailOk : item.detailError}
                      </div>
                    </div>
                  </div>
                ))}

                {!checklist.canApprove && (
                  <div className="text-red-700 font-medium">
                    O botão só libera quando todos os itens do checklist estiverem válidos.
                  </div>
                )}
              </div>
            )}

            {cardError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-2">
                <div className="font-medium">Erro</div>
                <div>{cardError}</div>
                {cardDebug && (
                  <pre className="whitespace-pre-wrap break-words rounded border border-red-200 bg-white p-2 text-xs text-red-900 overflow-x-auto">
                    {cardDebug}
                  </pre>
                )}
              </div>
            )}

            {cardSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <div className="font-medium">Sucesso</div>
                <div>{cardSuccess}</div>
              </div>
            )}

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <Button onClick={() => approve(payment)} disabled={saving || !checklist.canApprove}>
                  {saving ? 'Processando...' : 'Aprovar'}
                </Button>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => pay(payment)} disabled={!!loadingPay[payment.id]}>
                  {loadingPay[payment.id] ? 'Processando...' : 'Marcar como pago'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
