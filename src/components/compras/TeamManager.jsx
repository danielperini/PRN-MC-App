import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Plus, Edit2, Trash2, Receipt, FileText, BookOpen } from 'lucide-react';
import TeamMemberForm from './TeamMemberForm';
import TeamMemberDocsPanel from './TeamMemberDocsPanel';
import TeamPaymentReview from './TeamPaymentReview';
import { toast } from 'sonner';

export default function TeamManager({ budgetLines = [] }) {
  const [subTab, setSubTab] = useState('membros');
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);
  const [docsPanel, setDocsPanel] = useState(null); // { member, tab }
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('-created_date', 100),
  });

  const { data: pendingPayments = [] } = useQuery({
    queryKey: ['team-payments-pending'],
    queryFn: () => base44.entities.TeamPayment.filter({ status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100),
  });

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

  const statusColors = {
    ATIVO: 'bg-green-100 text-green-800',
    INATIVO: 'bg-gray-100 text-gray-800',
    SUSPENSO: 'bg-red-100 text-red-800',
  };

  const openDocs = (member, tab) => setDocsPanel({ member, tab });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-black">Equipe Financeira</h2>
            <p className="text-xs text-gray-500">{members.length} membro(s) cadastrado(s)</p>
          </div>
        </div>
        {subTab === 'membros' && (
          <Button className="bg-black hover:bg-gray-800" onClick={() => { setEditingMember(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />Adicionar Membro
          </Button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'membros', label: 'Membros da Equipe' },
          {
            id: 'revisao',
            label: `Revisão de Envios${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}`,
          },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              subTab === t.id ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Membros Tab */}
      {subTab === 'membros' && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : members.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum membro cadastrado</p>
              <p className="text-sm text-gray-400 mt-1">Adicione membros para gerenciar o fluxo de pagamentos</p>
              <Button className="mt-4 bg-black text-white" onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-2" />Adicionar Primeiro Membro
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map(member => {
                const budgetLine = budgetLines.find(b => b.id === member.budgetline_id);
                return (
                  <div key={member.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {member.user_name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-black">{member.user_name}</p>
                          <p className="text-xs text-gray-500">{member.user_email}</p>
                          {member.funcao && (
                            <p className="text-xs text-gray-600 font-medium mt-0.5">{member.funcao}</p>
                          )}
                          {budgetLine && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              📋 {budgetLine.codigo} — {budgetLine.descricao?.substring(0, 40)}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge className={statusColors[member.status] || statusColors.ATIVO}>
                        {member.status}
                      </Badge>
                    </div>

                    {/* Financial summary */}
                    {member.valor_total > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                        <div className="bg-gray-50 p-2 rounded-lg">
                          <p className="text-gray-500">Total Contrato</p>
                          <p className="font-semibold text-black">R$ {member.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-lg">
                          <p className="text-gray-500">Parcelas</p>
                          <p className="font-semibold text-black">{member.numero_parcelas}x R$ {member.valor_parcela?.toFixed(0)}</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-lg">
                          <p className="text-gray-500">Pagas</p>
                          <p className="font-semibold text-black">{member.parcelas_pagas || 0}/{member.numero_parcelas}</p>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => openDocs(member, 'nf')}
                      >
                        <Receipt className="w-3.5 h-3.5" />Notas Fiscais
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                        onClick={() => openDocs(member, 'contrato')}
                      >
                        <FileText className="w-3.5 h-3.5" />Contrato
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
                        onClick={() => openDocs(member, 'relatorios')}
                      >
                        <BookOpen className="w-3.5 h-3.5" />Relatórios
                      </Button>
                      <div className="ml-auto flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8"
                          onClick={() => { setEditingMember(member); setShowForm(true); }}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8 text-red-600 hover:bg-red-50"
                          onClick={() => setDeletingMember(member)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Revisão Tab */}
      {subTab === 'revisao' && (
        <TeamPaymentReview members={members} budgetLines={budgetLines} />
      )}

      {/* Form Dialog */}
      <TeamMemberForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingMember(null); }}
        onSuccess={() => queryClient.invalidateQueries(['team-members'])}
        editingMember={editingMember}
        budgetLines={budgetLines}
      />

      {/* Docs Panel */}
      {docsPanel && (
        <TeamMemberDocsPanel
          member={docsPanel.member}
          initialTab={docsPanel.tab}
          isCoordenador
          budgetLines={budgetLines}
          onClose={() => setDocsPanel(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deletingMember && (
        <AlertDialog open={!!deletingMember} onOpenChange={open => !open && setDeletingMember(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Membro?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover <strong>{deletingMember.user_name}</strong> da equipe?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Remover
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}