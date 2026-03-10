import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Plus, Edit2, Trash2, Eye } from 'lucide-react';
import TeamMemberForm from './TeamMemberForm';
import { toast } from 'sonner';

export default function TeamManager() {
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(null);
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('-created_date', 100)
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

  const handleEdit = (member) => {
    setEditingMember(member);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingMember(null);
    setShowForm(true);
  };

  const statusColors = {
    ATIVO: 'bg-green-100 text-green-800',
    INATIVO: 'bg-gray-100 text-gray-800',
    SUSPENSO: 'bg-red-100 text-red-800'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-black">Equipe de Pagamentos</h2>
            <p className="text-xs text-gray-500">{members.length} membro(s)</p>
          </div>
        </div>
        <Button className="bg-black hover:bg-gray-800" onClick={handleAddNew}>
          <Plus className="w-4 h-4 mr-2" />Adicionar Membro
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : members.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum membro cadastrado</p>
          <Button className="mt-4 bg-black text-white" onClick={handleAddNew}>
            <Plus className="w-4 h-4 mr-2" />Adicionar Primeiro Membro
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(member => (
            <div key={member.id} className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-black">{member.user_name}</h3>
                  <p className="text-xs text-gray-600">{member.user_email}</p>
                  {member.funcao && <p className="text-xs text-gray-500 mt-1">{member.funcao}</p>}
                </div>
                <Badge className={statusColors[member.status] || statusColors.ATIVO}>
                  {member.status}
                </Badge>
              </div>

              {/* Contrato Info */}
              <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">Valor Total</p>
                  <p className="font-semibold text-black">R$ {member.valor_total?.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">Parcelas</p>
                  <p className="font-semibold text-black">{member.numero_parcelas} x R$ {member.valor_parcela?.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">Pagas</p>
                  <p className="font-semibold text-black">{member.parcelas_pagas || 0}/{member.numero_parcelas}</p>
                </div>
              </div>

              {/* Dados Bancários */}
              {(member.banco || member.pix_key) && (
                <div className="text-xs text-gray-600 mb-4 flex items-center gap-2">
                  {member.banco && <span>🏦 {member.banco}</span>}
                  {member.pix_key && <span>📱 PIX</span>}
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(member)}
                  className="text-xs"
                >
                  <Edit2 className="w-3 h-3 mr-1" />Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletingMember(member)}
                  className="text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3 mr-1" />Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <TeamMemberForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
        onSuccess={() => queryClient.invalidateQueries(['team-members'])}
        editingMember={editingMember}
      />

      {/* Delete Confirmation */}
      {deletingMember && (
        <AlertDialog open={!!deletingMember} onOpenChange={open => !open && setDeletingMember(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Membro?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover <strong>{deletingMember.user_name}</strong> da equipe? Esta ação não pode ser desfeita.
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