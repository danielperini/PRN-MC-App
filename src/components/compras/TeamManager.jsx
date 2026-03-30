import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import TeamMemberForm from './TeamMemberForm';

export default function TeamManager() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // 🔹 LISTA DE MEMBROS
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
  });

  // 🔹 RUBRICAS
  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: async () => {
      const res = await base44.entities.BudgetLine.list();
      return Array.isArray(res) ? res : [];
    },
  });

  // 🔥 REFRESH FORÇADO
  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      queryClient.invalidateQueries({ queryKey: ['users-all'] }),
    ]);

    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['team-members'] }),
      queryClient.refetchQueries({ queryKey: ['users-all'] }),
    ]);
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Equipe</h2>

        <Button
          onClick={() => {
            setEditingMember(null);
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar membro
        </Button>
      </div>

      {/* LISTA */}
      {isLoading ? (
        <div>Carregando equipe...</div>
      ) : teamMembers.length === 0 ? (
        <div>Nenhum membro cadastrado.</div>
      ) : (
        teamMembers.map((member) => (
          <Card key={member.id}>
            <CardContent className="flex justify-between items-center py-4">
              <div>
                <div className="font-medium">
                  {member.user_name || member.nome}
                </div>
                <div className="text-sm text-gray-500">
                  {member.funcao || member.role}
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setEditingMember(member);
                  setShowForm(true);
                }}
              >
                Editar
              </Button>
            </CardContent>
          </Card>
        ))
      )}

      {/* FORM */}
      <TeamMemberForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
        onSuccess={async (result) => {
          await refreshAll();

          // 🔥 DIFERENCIA ADD vs EDIT
          if (editingMember) {
            toast.success('Dados da equipe atualizados com sucesso');
          } else {
            toast.success('Novo membro adicionado com sucesso');
          }

          setShowForm(false);
          setEditingMember(null);
        }}
        editingMember={editingMember}
        budgetLines={budgetLines}
      />
    </div>
  );
}
