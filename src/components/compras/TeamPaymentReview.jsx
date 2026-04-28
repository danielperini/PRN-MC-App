import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  DollarSign,
  User,
  Loader2,
  FileText,
  LinkIcon,
  BadgeCheck,
  RotateCcw,
  Save
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const STATUS_CONFIG = {
  PENDENTE: { label: 'Pendente', color: 'bg-white border-2 border-black text-black', icon: Clock },
  EM_ANALISE: { label: 'Em Análise', color: 'bg-white border-2 border-black text-black', icon: Clock },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-white border-2 border-black text-black', icon: RotateCcw },
  APROVADO: { label: 'Aprovado', color: 'bg-black text-white', icon: CheckCircle },
  APROVADO_COORD: { label: 'Aprovado Coord.', color: 'bg-black text-white', icon: CheckCircle },
  RECUSADO: { label: 'Recusado', color: 'bg-black text-white', icon: XCircle },
  PAGO: { label: 'Pago', color: 'bg-black text-white', icon: CheckCircle }
};

function getPaymentValue(p) {
  return Number(
    p?.valor_total ||
    p?.valor_nf ||
    p?.valor ||
    p?.valor_pago ||
    0
  );
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(v) || 0);
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getRubricaNome(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';
}

function PaymentDetailModal({
  payment,
  rubricas,
  onClose,
  onSave,
  onStatusChange,
  isCoordinator
}) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    member_name: payment?.member_name || payment?.user_name || '',
    mes_referencia: payment?.mes_referencia || '',
    ano: payment?.ano || '',
    numero_nf: payment?.numero_nf || '',
    valor_nf: payment?.valor_nf || payment?.valor_total || payment?.valor || '',
    rubrica_id: payment?.rubrica_id || '',
    rubrica_nome: payment?.rubrica_nome || '',
    observacoes: payment?.observacoes || ''
  });

  if (!payment) return null;

  const valor = getPaymentValue({
    ...payment,
    valor_nf: form.valor_nf
  });

  const selectedRubrica = (rubricas || []).find((r) => r.id === form.rubrica_id);

  const status = STATUS_CONFIG[normalizeStatus(payment.status)] || {
    label: payment.status,
    color: 'bg-white border-2 border-black text-black'
  };

  const handleSave = async () => {
    setLoading(true);
    await onSave(payment.id, {
      ...form,
      rubrica_nome: selectedRubrica ? getRubricaNome(selectedRubrica) : form.rubrica_nome,
      valor_nf: Number(form.valor_nf || 0),
      valor_total: Number(form.valor_nf || 0)
    });
    setLoading(false);
  };

  const handleAction = async (newStatus) => {
    setLoading(true);
    await onStatusChange(
      payment.id,
      newStatus,
      comment,
      {
        ...form,
        rubrica_nome: selectedRubrica ? getRubricaNome(selectedRubrica) : form.rubrica_nome,
        valor_nf: Number(form.valor_nf || 0),
        valor_total: Number(form.valor_nf || 0)
      }
    );
    setLoading(false);
    onClose();
  };

  const podeAprovar =
    isCoordinator &&
    ['PENDENTE', 'EM_ANALISE', 'DEVOLVIDO'].includes(normalizeStatus(payment.status));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {payment.origem_automatica && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" />
              Pagamento criado automaticamente a partir da aprovação da NF.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Profissional</p>
              <Input
                value={form.member_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, member_name: e.target.value }))
                }
                disabled={!isCoordinator}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Mês de Referência</p>
              <Input
                value={form.mes_referencia}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mes_referencia: e.target.value }))
                }
                disabled={!isCoordinator}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Ano</p>
              <Input
                value={form.ano}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ano: e.target.value }))
                }
                disabled={!isCoordinator}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Número da NF</p>
              <Input
                value={form.numero_nf}
                onChange={(e) =>
                  setForm((f) => ({ ...f, numero_nf: e.target.value }))
                }
                disabled={!isCoordinator}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Valor</p>
              <Input
                type="number"
                value={form.valor_nf}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valor_nf: e.target.value }))
                }
                disabled={!isCoordinator}
              />
              <p className="mt-1 text-xs text-gray-500">{fmtBRL(valor)}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Rubrica vinculada</p>
            <Select
              value={form.rubrica_id}
              onValueChange={(value) => {
                const rubrica = (rubricas || []).find((r) => r.id === value);
                setForm((f) => ({
                  ...f,
                  rubrica_id: value,
                  rubrica_nome: rubrica ? getRubricaNome(rubrica) : ''
                }));
              }}
              disabled={!isCoordinator}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a rubrica" />
              </SelectTrigger>
              <SelectContent>
                {(rubricas || [])
                  .filter((r) => r?.ativo !== false)
                  .sort((a, b) =>
                    getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR')
                  )
                  .map((rubrica) => (
                    <SelectItem key={rubrica.id} value={rubrica.id}>
                      {getRubricaNome(rubrica)}
                      {rubrica.centro_custo ? ` — ${rubrica.centro_custo}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {(payment.nota_fiscal_url || payment.xml_url) && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-medium text-gray-500">Documentos vinculados</p>

              {payment.nota_fiscal_url && (
                <a
                  href={payment.nota_fiscal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  Ver PDF da Nota Fiscal
                </a>
              )}

              {payment.xml_url && (
                <a
                  href={payment.xml_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <LinkIcon className="h-4 w-4" />
                  Ver XML vinculado
                </a>
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500 mb-1">Observações</p>
            <Input
              value={form.observacoes}
              onChange={(e) =>
                setForm((f) => ({ ...f, observacoes: e.target.value }))
              }
              disabled={!isCoordinator}
            />
          </div>

          {isCoordinator && (
            <div className="space-y-3 border-t pt-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Comentário da coordenação
                </label>
                <Input
                  placeholder="Comentário para aprovação ou devolução..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  className="border-2 border-black text-black hover:bg-black hover:text-white"
                  onClick={handleSave}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Salvar edição
                </Button>

                {podeAprovar && (
                  <>
                    <Button
                      variant="outline"
                      className="border-2 border-black text-black hover:bg-black hover:text-white"
                      onClick={() => handleAction('DEVOLVIDO')}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                      Devolver
                    </Button>

                    <Button
                      className="bg-black text-white hover:bg-gray-900"
                      onClick={() => handleAction('APROVADO_COORD')}
                      disabled={loading || !form.rubrica_id}
                    >
                      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Aprovar e debitar rubrica
                    </Button>
                  </>
                )}

                {(payment.status === 'APROVADO' || payment.status === 'APROVADO_COORD') && (
                  <Button
                    className="bg-black text-white hover:bg-gray-900"
                    onClick={() => handleAction('PAGO')}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                    Marcar como Pago
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPaymentReview() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const isCoordinator = [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO'
  ].includes(currentUser?.role);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['team-payments'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
    enabled: !!currentUser
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-team-payment-review'],
    queryFn: () => base44.entities.Rubrica.list('rubrica', 2000),
    enabled: !!currentUser
  });

  async function debitarRubricaSeNecessario(payment, payload) {
    const statusAtual = normalizeStatus(payment?.status);
    const novoStatus = normalizeStatus(payload?.status);

    if (novoStatus !== 'APROVADO_COORD' && novoStatus !== 'APROVADO') return;
    if (statusAtual === 'APROVADO_COORD' || statusAtual === 'APROVADO') return;
    if (payment?.rubrica_debitada_aprovacao === true) return;
    if (!payload?.rubrica_id) throw new Error('Selecione uma rubrica antes de aprovar.');

    const valor = getPaymentValue({
      ...payment,
      ...payload
    });

    if (!valor || valor <= 0) throw new Error('Valor inválido para débito da rubrica.');

    const rubrica = await base44.entities.Rubrica.get(payload.rubrica_id);
    if (!rubrica?.id) throw new Error('Rubrica não encontrada.');

    await base44.entities.Rubrica.update(rubrica.id, {
      saldo_comprometido: Number(rubrica.saldo_comprometido || 0) + valor
    });
  }

  const handleSavePayment = async (paymentId, payload) => {
    const rubrica = (rubricas || []).find((r) => r.id === payload.rubrica_id);

    await base44.entities.TeamPayment.update(paymentId, {
      ...payload,
      rubrica_nome: rubrica ? getRubricaNome(rubrica) : payload.rubrica_nome,
      atualizado_por_coord: currentUser?.email || '',
      atualizado_em: new Date().toISOString()
    });

    queryClient.invalidateQueries({ queryKey: ['team-payments'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas-team-payment-review'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  };

  const handleStatusChange = async (paymentId, newStatus, comment, editedPayload = {}) => {
    const payment = payments.find((p) => p.id === paymentId);
    const rubrica = (rubricas || []).find((r) => r.id === editedPayload.rubrica_id);

    const payload = {
      ...editedPayload,
      rubrica_nome: rubrica ? getRubricaNome(rubrica) : editedPayload.rubrica_nome,
      status: newStatus,
      ...(comment ? { comentario_coordenacao: comment } : {}),
      ...(newStatus === 'DEVOLVIDO'
        ? {
            devolvido_em: new Date().toISOString(),
            devolvido_por: currentUser?.email || ''
          }
        : {}),
      ...(newStatus === 'APROVADO' || newStatus === 'APROVADO_COORD'
        ? {
            aprovado_em: new Date().toISOString(),
            aprovado_por: currentUser?.email || '',
            rubrica_debitada_aprovacao: true
          }
        : {}),
      ...(newStatus === 'PAGO'
        ? {
            pago_em: new Date().toISOString(),
            pago_por: currentUser?.email || ''
          }
        : {})
    };

    await debitarRubricaSeNecessario(payment, payload);

    await base44.entities.TeamPayment.update(paymentId, payload);

    queryClient.invalidateQueries({ queryKey: ['team-payments'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas-team-payment-review'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  };

  const filtered = payments.filter((p) => {
    const matchStatus = statusFilter === 'all' || normalizeStatus(p.status) === statusFilter;
    const busca = search.trim().toLowerCase();

    const matchSearch =
      !busca ||
      String(p.member_name || p.user_name || '').toLowerCase().includes(busca) ||
      String(p.mes_referencia || '').toLowerCase().includes(busca) ||
      String(p.numero_nf || '').toLowerCase().includes(busca) ||
      String(p.rubrica_nome || '').toLowerCase().includes(busca);

    return matchStatus && matchSearch && getPaymentValue(p) > 0;
  });

  const pendentes = payments.filter(
    (p) =>
      normalizeStatus(p.status) === 'PENDENTE' ||
      normalizeStatus(p.status) === 'EM_ANALISE' ||
      normalizeStatus(p.status) === 'DEVOLVIDO'
  ).length;

  const automaticos = payments.filter((p) => p.origem_automatica).length;

  const totalAprovado = payments
    .filter((p) =>
      normalizeStatus(p.status) === 'APROVADO' ||
      normalizeStatus(p.status) === 'APROVADO_COORD' ||
      normalizeStatus(p.status) === 'PAGO'
    )
    .reduce((s, p) => s + getPaymentValue(p), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Pendentes de Análise</p>
          <p className="mt-1 text-2xl font-bold text-black">{pendentes}</p>
        </div>

        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Total de Pagamentos</p>
          <p className="mt-1 text-2xl font-bold text-black">{payments.length}</p>
        </div>

        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Criados por NF</p>
          <p className="mt-1 text-2xl font-bold text-black">{automaticos}</p>
        </div>

        <div className="rounded-xl border-2 border-black bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Total Aprovado / Pago</p>
          <p className="mt-1 text-2xl font-bold text-black">{fmtBRL(totalAprovado)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por profissional, mês, NF ou rubrica..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-gray-400">
          Carregando pagamentos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <DollarSign className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-400">
            Nenhum pagamento encontrado
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-black">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-black text-white text-left">
                <th className="px-3 py-3 font-medium">Profissional</th>
                <th className="px-3 py-3 font-medium">Referência</th>
                <th className="px-3 py-3 font-medium">NF</th>
                <th className="px-3 py-3 font-medium">Rubrica</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="px-3 py-3 text-center font-medium">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((p, i) => {
                const status = STATUS_CONFIG[normalizeStatus(p.status)] || {
                  label: p.status,
                  color: 'bg-white border-2 border-black text-black',
                  icon: Clock
                };

                const StatusIcon = status.icon || Clock;
                const valor = getPaymentValue(p);

                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-200 transition-colors hover:bg-gray-50 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="font-medium text-gray-900">
                            {p.member_name || p.user_name || p.created_by || '—'}
                          </span>

                          {p.origem_automatica && (
                            <p className="text-[11px] text-green-700">
                              Criado automaticamente por NF
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-gray-600">
                      {p.mes_referencia || '—'}{p.ano ? ` / ${p.ano}` : ''}
                    </td>

                    <td className="px-3 py-2.5 text-gray-600">
                      {p.numero_nf ? `NF ${p.numero_nf}` : '—'}
                      {p.nota_fiscal_url && (
                        <p className="text-[11px] text-blue-600">PDF vinculado</p>
                      )}
                      {p.xml_url && (
                        <p className="text-[11px] text-blue-600">XML vinculado</p>
                      )}
                    </td>

                    <td className="max-w-[220px] px-3 py-2.5 text-gray-600">
                      <span className="line-clamp-2 text-xs">
                        {p.rubrica_nome || p.rubrica_id || '—'}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">
                      {fmtBRL(valor)}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setSelectedPayment(p)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-black"
                        title="Ver detalhes"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          rubricas={rubricas}
          onClose={() => setSelectedPayment(null)}
          onSave={handleSavePayment}
          onStatusChange={handleStatusChange}
          isCoordinator={isCoordinator}
        />
      )}
    </div>
  );
}
