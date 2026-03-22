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
  AlertDialogTitle
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
  UserCircle2,
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
  return (
    member?.budgetline_id ||
    member?.budget_line_id ||
    member?.rubrica_id ||
    ''
  );
}

function getResumoFinanceiro(member, payments) {
  const memberPayments = (payments || []).filter(
    (p) =>
      p?.team_member_id === member?.id ||
      (p?.user_email && p?.user_email === member?.user_email)
  );

  const pagos = memberPayments.filter((p) => p?.status === 'PAGO');
  const aguardando = memberPayments.filter((p) =>
    ['AGUARDANDO_APROVACAO', 'APROVADO_COORD', 'EM_ANALISE_COORD', 'REVISAO'].includes(p?.status)
  );

  const ultimoEnvio = memberPayments.length > 0 ? memberPayments[0] : null;

  return {
    totalEnvios: memberPayments.length,
    pagos: pagos.length,
    aguardando: aguardando.length,
    ultimoEnvio,
  };
}

function getMemberDisplayName(member) {
  return member?.user_name || member?.nome || member?.user_email || 'Membro';
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
      base44.entities.TeamPayment.filter({ status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100),
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

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-manager-all'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
      queryClient.invalidateQueries({ queryKey: ['own-member', currentUser?.email] }),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-black">Equipe</h2>
            <p className="text-xs text-gray-500">{members.length} membro(s) cadastrado(s)</p>
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
        <button
          onClick={() => setSubTab('membros')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            subTab === 'membros' ? 'bg-white shadow text-black' : 'text-gray-500'
          }`}
        >
          Membros da Equipe
        </button>

        <button
          onClick={() => setSubTab('meu_perfil')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            subTab === 'meu_perfil' ? 'bg-white shadow text-black' : 'text-gray-500'
          }`}
        >
          Meu Perfil
        </button>

        {isCoordinator && (
          <button
            onClick={() => setSubTab('revisao')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              subTab === 'revisao' ? 'bg-white shadow text-black' : 'text-gray-500'
            }`}
          >
            {`Revisão de Envios${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}`}
          </button>
        )}
      </div>

      {subTab === 'membros' && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-12">Nenhum membro</div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const budgetLine =
                  budgetLineMap[getBudgetLineId(member)] || null;

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
                  <div key={member.id} className="border p-4 rounded-xl space-y-3">
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
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
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(member)}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Editar equipe
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDocs(member, 'payment')}
                      >
                        <Receipt className="w-3 h-3 mr-1" />
                        Pagar equipe
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDocs(member, 'docs')}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Documentos
                      </Button>

                      {isCoordinator && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletingMember(member)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
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
              {(() => {
                const budgetLine = budgetLineMap[getBudgetLineId(ownMember)] || null;

                const parcelas = toNumber(ownMember.numero_parcelas);
                const pagasNoContrato = toNumber(ownMember.parcelas_pagas);
                const valorTotal = toNumber(ownMember.valor_total);
                const valorParcela =
                  toNumber(ownMember.valor_parcela) ||
                  (parcelas > 0 ? valorTotal / parcelas : 0);
                const saldo = Math.max(0, valorTotal - pagasNoContrato * valorParcela);

                const vencido = isContratoVencido(ownMember.data_fim_contrato);
                const resumo = getResumoFinanceiro(ownMember, allTeamPayments);

                return (
                  <div className="border p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="font-semibold">{getMemberDisplayName(ownMember)}</p>
                        <p className="text-xs text-gray-500">{ownMember.funcao || '—'}</p>
                      </div>

                      <Badge className={vencido ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                        {vencido ? 'Vencido' : 'Válido'}
                      </Badge>
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
                        {formatDate(ownMember.data_inicio_contrato)} → {formatDate(ownMember.data_fim_contrato)}
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
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
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(ownMember)}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Editar equipe
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDocs(ownMember, 'docs')}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Documentos
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <TeamPaymentSubmit userEmail={currentUser?.email || ownMember?.user_email || ''} />
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

      <AlertDialog open={!!deletingMember} onOpenChange={() => setDeletingMember(null)}>
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
