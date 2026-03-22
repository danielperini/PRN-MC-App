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
  BookOpen,
  CalendarDays,
  Wallet,
  Layers3,
} from 'lucide-react';
import TeamMemberForm from './TeamMemberForm';
import TeamMemberDocsPanel from './TeamMemberDocsPanel';
import TeamPaymentReview from './TeamPaymentReview';
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
  const fim = new Date(dataFim);
  return fim < hoje;
}

export default function TeamManager({ budgetLines = [] }) {
  const [subTab, setSubTab] = useState('membros');
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);
  const [docsPanel, setDocsPanel] = useState(null);
  const [paymentMember, setPaymentMember] = useState(null);

  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('-created_date', 100),
  });

  const { data: pendingPayments = [] } = useQuery({
    queryKey: ['team-payments-pending'],
    queryFn: () =>
      base44.entities.TeamPayment.filter({ status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100),
  });

  const budgetLineMap = useMemo(() => {
    const map = {};
    (budgetLines || []).forEach((b) => {
      if (b?.id) map[b.id] = b;
    });
    return map;
  }, [budgetLines]);

  const handleDelete = async () => {
    try {
      await base44.entities.TeamMember.delete(deletingMember.id);
      toast.success('Membro removido');
      queryClient.invalidateQueries(['team-members']);
      setDeletingMember(null);
    } catch (error) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  const openDocs = (member) => setDocsPanel({ member });

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
        {subTab === 'membros' && (
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

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'membros', label: 'Membros da Equipe' },
          {
            id: 'revisao',
            label: `Revisão de Envios${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}`,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              subTab === t.id ? 'bg-white shadow text-black' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
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
                  budgetLineMap[member.budgetline_id] ||
                  budgetLineMap[member.budget_line_id] ||
                  budgetLineMap[member.rubrica_id] ||
                  null;

                const parcelas = toNumber(member.numero_parcelas);
                const pagas = toNumber(member.parcelas_pagas);
                const valorTotal = toNumber(member.valor_total);
                const valorParcela =
                  parcelas > 0 ? valorTotal / parcelas : 0;
                const saldo = valorTotal - pagas * valorParcela;

                const vencido = isContratoVencido(member.data_fim_contrato);

                return (
                  <div key={member.id} className="border p-4 rounded-xl space-y-2">

                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{member.user_name}</p>
                        <p className="text-xs text-gray-500">{member.funcao}</p>
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
                      <p className="text-xs text-red-500">
                        Sem rubrica vinculada
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <CalendarDays className="w-3 h-3 inline mr-1" />
                        {formatDate(member.data_inicio_contrato)} → {formatDate(member.data_fim_contrato)}
                      </div>
                      <div>
                        <Layers3 className="w-3 h-3 inline mr-1" />
                        {pagas}/{parcelas} parcelas
                      </div>
                      <div>
                        <Wallet className="w-3 h-3 inline mr-1" />
                        {formatBRL(valorTotal)}
                      </div>
                      <div>
                        Saldo: {formatBRL(saldo)}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingMember(member);
                        setShowForm(true);
                      }}>
                        <Edit2 className="w-3 h-3 mr-1" />
                        Editar
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => setPaymentMember(member)}>
                        <Receipt className="w-3 h-3 mr-1" />
                        Pagar
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => openDocs(member)}>
                        <FileText className="w-3 h-3 mr-1" />
                        Documentos
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => setDeletingMember(member)}>
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remover
                      </Button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <TeamMemberForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
        onSuccess={() => queryClient.invalidateQueries(['team-members'])}
        editingMember={editingMember}
        budgetLines={budgetLines}
      />

      {docsPanel && (
        <TeamMemberDocsPanel
          member={docsPanel.member}
          onClose={() => setDocsPanel(null)}
        />
      )}

      {paymentMember && (
        <TeamPaymentReview
          member={paymentMember}
          onClose={() => setPaymentMember(null)}
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
