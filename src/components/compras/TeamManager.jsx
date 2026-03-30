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

/* ===== helpers (mantidos iguais) ===== */

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

  return {
    totalEnvios: memberPayments.length,
    pagos: pagos.length,
    aguardando: aguardando.length,
    ultimoEnvio: memberPayments[0] || null,
    ultimoPagamento: pagos[0] || null,
    historico: memberPayments,
  };
}

function getMemberDisplayName(member) {
  return member?.user_name || member?.nome || member?.user_email || 'Membro';
}

/* ===== COMPONENTE PRINCIPAL ===== */

export default function TeamManager({ budgetLines = [] }) {
  const [subTab, setSubTab] = useState('membros');
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);

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

  /* ===== 🔥 REFRESH CORRIGIDO ===== */

  const refreshAll = async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      ]);

      // força refetch real (resolve delay visual)
      await queryClient.refetchQueries({ queryKey: ['team-members'] });

    } catch (e) {
      console.error('Erro ao atualizar dados:', e);
    }
  };

  /* ===== DELETE ===== */

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

  /* ===== RENDER ===== */

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-black">Equipe</h2>

        {isCoordinator && (
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

      {/* LISTA */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12">Nenhum membro</div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="border p-3 rounded-lg flex justify-between">
              <span>{getMemberDisplayName(member)}</span>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeletingMember(member)}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* FORM */}
      <TeamMemberForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
        onSuccess={async () => {
          // 🔥 ordem correta
          await refreshAll();

          toast.success('Membro adicionado e lista atualizada');

          setShowForm(false);
          setEditingMember(null);
        }}
      />

      {/* DELETE */}
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
