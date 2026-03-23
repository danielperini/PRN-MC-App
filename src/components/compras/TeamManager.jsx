import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Receipt,
  FileText,
  CalendarDays,
  Wallet,
  Layers3,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  CreditCard,
} from 'lucide-react';
import TeamMemberForm from './TeamMemberForm';
import TeamMemberDocsPanel from './TeamMemberDocsPanel';
import TeamPaymentReview from './TeamPaymentReview';
import TeamPaymentSubmit from './TeamPaymentSubmit';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(value) {
  return `R$ ${toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return String(value);
  }
}

function isContratoVencido(dataFim) {
  if (!dataFim) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim = new Date(dataFim);
  if (Number.isNaN(fim.getTime())) return false;
  fim.setHours(0, 0, 0, 0);

  return fim < hoje;
}

function getBudgetLineId(member) {
  return member?.budgetline_id || member?.budget_line_id || '';
}

function getResumoFinanceiro(member, payments) {
  const memberPayments = (payments || [])
    .filter(
      (p) =>
        p?.team_member_id === member?.id ||
        (p?.user_email && p?.user_email === member?.user_email)
    )
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const pagos = memberPayments.filter((p) => p?.status === 'PAGO');
  const aguardando = memberPayments.filter((p) =>
    ['AGUARDANDO_APROVACAO', 'APROVADO_COORD', 'EM_ANALISE_COORD', 'REVISAO'].includes(p?.status)
  );

  const aprovados = memberPayments.filter((p) => p?.status === 'APROVADO_COORD');
  const devolvidos = memberPayments.filter((p) => p?.status === 'DEVOLVIDO_REVISAO');

  const ultimoEnvio = memberPayments[0] || null;
  const ultimoPagamento = pagos[0] || null;

  return {
    totalEnvios: memberPayments.length,
    pagos: pagos.length,
    aguardando: aguardando.length,
    aprovados: aprovados.length,
    devolvidos: devolvidos.length,
    ultimoEnvio,
    ultimoPagamento,
    historico: memberPayments,
  };
}

function getMemberDisplayName(member) {
  return member?.user_name || member?.nome || member?.user_email || 'Membro';
}

function getStatusPagamentoBadge(status) {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'PAGO') {
    return { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (normalized === 'APROVADO_COORD') {
    return { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' };
  }
  if (normalized === 'AGUARDANDO_APROVACAO') {
    return { label: 'Aguardando', className: 'bg-amber-100 text-amber-800' };
  }
  if (normalized === 'DEVOLVIDO_REVISAO') {
    return { label: 'Devolvido', className: 'bg-orange-100 text-orange-800' };
  }
  if (normalized === 'REVISAO' || normalized === 'EM_ANALISE_COORD') {
    return { label: 'Em revisão', className: 'bg-yellow-100 text-yellow-800' };
  }

  return { label: status || '—', className: 'bg-gray-100 text-gray-700' };
}

function PaymentHistoryCard({ payment }) {
  const badge = getStatusPagamentoBadge(payment?.status);
  const valor =
    toNumber(payment?.valor_pago) ||
    toNumber(payment?.valor_nf) ||
    toNumber(payment?.valor_parcela_previsto) ||
    0;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {payment?.mes_referencia || '—'} / {payment?.ano || '—'}
          </p>
          <p className="text-xs text-gray-500">
            Parcela {payment?.numero_parcela || '—'}
          </p>
        </div>

        <Badge className={badge.className}>{badge.label}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-500">Valor</span>
          <div className="font-medium text-gray-800">{formatBRL(valor)}</div>
        </div>

        <div>
          <span className="text-gray-500">Data do envio</span>
          <div className="font-medium text-gray-800">
            {formatDate(payment?.created_date || payment?.data_envio)}
          </div>
        </div>

        <div>
          <span className="text-gray-500">Data do pagamento</span>
          <div className="font-medium text-gray-800">
            {formatDate(payment?.data_pagamento || payment?.updated_date)}
          </div>
        </div>
      </div>

      {(payment?.observacoes || payment?.descricao_nf) && (
        <div className="text-xs text-gray-500">
          {payment?.observacoes || payment?.descricao_nf}
        </div>
      )}
    </div>
  );
}

function MemberCard({
  member,
  budgetLine,
  allTeamPayments,
  isCoordenador,
  onEdit,
  onDocs,
  onPayment,
  onDelete,
  showPayButton = true,
  editLabel = 'Editar equipe',
}) {
  const parcelas = toNumber(member.numero_parcelas);
  const pagasNoContrato = toNumber(member.parcelas_pagas);
  const valorTotal = toNumber(member.valor_total);
  const valorParcela =
    toNumber(member.valor_parcela) ||
    (parcelas > 0 ? valorTotal / parcelas : 0);
  const saldo = Math.max(0, valorTotal - pagasNoContrato * valorParcela);

  const vencido = isContratoVencido(member.data_fim_contrato);
  const resumo = getResumoFinanceiro(member, allTeamPayments);

  return (
    <div className="border p-4 rounded-xl space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-semibold">{getMemberDisplayName(member)}</p>
          <p className="text-xs text-gray-500">{member.funcao || '—'}</p>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <Badge className={vencido ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
            {vencido ? 'Vencido' : 'Válido'}
          </Badge>

          {resumo.aguardando > 0 && (
            <Badge className="bg-amber-100 text-amber-800">
              {resumo.aguardando} pendente(s)
            </Badge>
          )}

          {resumo.pagos > 0 && (
            <Badge className="bg-blue-100 text-blue-800">
              {resumo.pagos} pago(s)
            </Badge>
          )}
        </div>
      </div>

      {budgetLine ? (
        <p className="text-xs text-gray-500">
          {budgetLine.codigo} — {budgetLine.descricao}
        </p>
      ) : (
        <div className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Sem rubrica / linha orçamentária vinculada</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
        <div>
          <CalendarDays className="w-3 h-3 inline mr-1" />
          {formatDate(member.data_inicio_contrato)} → {formatDate(member.data_fim_contrato)}
        </div>

        <div>
          <Layers3 className="w-3 h-3 inline mr-1" />
          {pagasNoContrato}/{parcelas} parcelas
        </div>

        <div>
          <Wallet className="w-3 h-3 inline mr-1" />
          {formatBRL(valorTotal)}
        </div>

        <div>
          Saldo: {formatBRL(saldo)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <Clock3 className="w-3.5 h-3.5" />
            Último envio
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoEnvio
              ? `${resumo.ultimoEnvio.mes_referencia || '—'} / ${resumo.ultimoEnvio.ano || '—'}`
              : 'Nenhum envio'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <Receipt className="w-3.5 h-3.5" />
            Valor da parcela
          </div>
          <div className="font-medium text-gray-800">
            {formatBRL(valorParcela)}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Status último envio
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoEnvio?.status || '—'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
          <div className="flex items-center gap-1 text-gray-500 mb-1">
            <CreditCard className="w-3.5 h-3.5" />
            Último pagamento
          </div>
          <div className="font-medium text-gray-800">
            {resumo.ultimoPagamento
              ? `${formatDate(resumo.ultimoPagamento?.data_pagamento)} • ${formatBRL(
                  resumo.ultimoPagamento?.valor_pago || resumo.ultimoPagamento?.valor_nf || 0
                )}`
              : 'Nenhum pagamento'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(member)}
        >
          <Edit2 className="w-3 h-3 mr-1" />
          {editLabel}
        </Button>

        {showPayButton && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPayment(member)}
          >
            <Receipt className="w-3 h-3 mr-1" />
            Pagar equipe
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => onDocs(member)}
        >
          <FileText className="w-3 h-3 mr-1" />
          Documentos
        </Button>

        {isCoordenador && onDelete && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(member)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TeamManager({ budgetLines = [] }) {
  const [subTab, setSubTab] = useState('membros');
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);
  const [docsPanel, setDocsPanel] = useState(null);

  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me-team-manager'],
    queryFn: () => base44.auth.me(),
  });

  const isCoordinator = [
    'ADMIN',
    'admin',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO',
  ].includes(currentUser?.role);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('-created_date', 300),
  });

  const { data: allTeamPayments = [] } = useQuery({
    queryKey: ['team-payments-manager-all'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const { data: pendingPayments = [] } = useQuery({
    queryKey: ['team-payments-pending'],
    queryFn: () =>
      base44.entities.TeamPayment.filter(
        { status: 'AGUARDANDO_APROVACAO' },
        '-created_date',
        100
      ),
  });

  const ownMember = useMemo(() => {
    if (!currentUser?.email) return null;
    return (
      members.find(
        (m) =>
          String(m?.user_email || '').toLowerCase() ===
          String(currentUser.email || '').toLowerCase()
      ) || null
    );
  }, [members, currentUser]);

  const budgetLineMap = useMemo(() => {
    const map = {};
    (budgetLines || []).forEach((b) => {
      if (b?.id) map[b.id] = b;
    });
    return map;
  }, [budgetLines]);

  const ownBudgetLine = useMemo(() => {
    if (!ownMember) return null;
    return budgetLineMap[getBudgetLineId(ownMember)] || null;
  }, [ownMember, budgetLineMap]);

  const ownResumo = useMemo(() => {
    if (!ownMember) return null;
    return getResumoFinanceiro(ownMember, allTeamPayments);
  }, [ownMember, allTeamPayments]);

  const ownHistoricoPagamentos = useMemo(() => {
    if (!ownResumo) return [];
    return ownResumo.historico.filter((p) =>
      ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO', 'DEVOLVIDO_REVISAO', 'REVISAO', 'EM_ANALISE_COORD']
        .includes(String(p?.status || '').toUpperCase())
    );
  }, [ownResumo]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-manager-all'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-member', ownMember?.id] }),
    ]);
  };

  const handleDelete = async () => {
    try {
      await base44.entities.TeamMember.delete(deletingMember.id);
      toast.success('Membro removido');
      await refreshAll();
      setDeletingMember(null);
    } catch (error) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  const openDocs = (member, initialMode = 'docs') => {
    setDocsPanel({ member, initialMode });
  };

  const openEdit = (member) => {
    setEditingMember(member);
    setShowForm(true);
  };

  const availableTabs = isCoordinator
    ? [
        { id: 'membros', label: 'Membros da Equipe' },
        { id: 'meu_perfil', label: 'Meu Perfil' },
        {
          id: 'revisao',
          label: `Revisão de Envios${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}`,
        },
      ]
    : [{ id: 'meu_perfil', label: 'Meu Perfil' }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-black">Equipe</h2>
            <p className="text-xs text-gray-500">
              {members.length} membro(s) cadastrado(s)
            </p>
          </div>
        </div>

        {isCoordinator && subTab === 'membros' && (
          <Button
            className="bg-black hover:bg-gray-800"
            onClick={() => {
              setEditingMember(null);
              setShowForm(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Membro
          </Button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              subTab === tab.id ? 'bg-white shadow text-black' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'membros' && isCoordinator && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-12">Nenhum membro</div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  budgetLine={budgetLineMap[getBudgetLineId(member)] || null}
                  allTeamPayments={allTeamPayments}
                  isCoordenador={isCoordinator}
                  onEdit={openEdit}
                  onDocs={(m) => openDocs(m, 'docs')}
                  onPayment={(m) => openDocs(m, 'payment')}
                  onDelete={(m) => setDeletingMember(m)}
                  showPayButton={true}
                  editLabel="Editar equipe"
                />
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'meu_perfil' && (
        <div className="space-y-4">
          {!ownMember ? (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Você ainda não está cadastrado como membro da equipe. Peça ao coordenador para criar seu perfil inicial.
            </div>
          ) : (
            <>
              <MemberCard
                member={ownMember}
                budgetLine={ownBudgetLine}
                allTeamPayments={allTeamPayments}
                isCoordenador={false}
                onEdit={openEdit}
                onDocs={(m) => openDocs(m, 'docs')}
                onPayment={(m) => openDocs(m, 'payment')}
                showPayButton={false}
                editLabel="Editar"
              />

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDocs(ownMember, 'payment')}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver e criar meu pagamento
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDocs(ownMember, 'docs')}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Gerenciador de notas fiscais
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Pagamentos concluídos</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {ownResumo?.pagos || 0}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Em análise / aguardando</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {ownResumo?.aguardando || 0}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Último valor pago</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {ownResumo?.ultimoPagamento
                      ? formatBRL(
                          ownResumo.ultimoPagamento?.valor_pago ||
                            ownResumo.ultimoPagamento?.valor_nf ||
                            0
                        )
                      : '—'}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Última data de pagamento</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {ownResumo?.ultimoPagamento
                      ? formatDate(ownResumo.ultimoPagamento?.data_pagamento)
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Meus pagamentos</h3>
                    <p className="text-xs text-gray-500">
                      Histórico de envios, aprovações e pagamentos concluídos
                    </p>
                  </div>
                </div>

                {ownHistoricoPagamentos.length === 0 ? (
                  <div className="text-sm text-gray-500">Nenhum pagamento registrado.</div>
                ) : (
                  <div className="space-y-2">
                    {ownHistoricoPagamentos.map((payment) => (
                      <PaymentHistoryCard key={payment.id} payment={payment} />
                    ))}
                  </div>
                )}
              </div>

              <TeamPaymentSubmit
                userEmail={currentUser?.email || ownMember?.user_email || ''}
              />
            </>
          )}
        </div>
      )}

      {subTab === 'revisao' && isCoordinator && (
        <TeamPaymentReview
          members={members}
          budgetLines={budgetLines}
        />
      )}

      <TeamMemberForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
        onSuccess={async () => {
          await refreshAll();
          setShowForm(false);
          setEditingMember(null);
        }}
        editingMember={editingMember}
        budgetLines={budgetLines}
      />

      {docsPanel && (
        <TeamMemberDocsPanel
          member={docsPanel.member}
          onClose={() => setDocsPanel(null)}
          budgetLines={budgetLines}
          isCoordenador={isCoordinator}
          initialMode={docsPanel.initialMode || 'docs'}
        />
      )}

      <AlertDialog
        open={!!deletingMember}
        onOpenChange={() => setDeletingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Confirmar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
