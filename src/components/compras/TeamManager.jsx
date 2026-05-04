import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import TeamMemberForm from './TeamMemberForm';
import TeamContractsPanel from './TeamContractsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isCoordenador } from '@/components/auth/permissions';

export default function TeamManager() {
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then((u) => setCurrentUser(u))
      .catch(() => setCurrentUser(null))
      .finally(() => setLoadingUser(false));
  }, []);

  const podeGerenciarEquipe = isCoordenador(currentUser);

  const {
    data: teamMembers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      if (!podeGerenciarEquipe) return [];
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: !!currentUser && podeGerenciarEquipe,
  });

  const handleDelete = async (id) => {
    if (!podeGerenciarEquipe) {
      toast.error('Acesso restrito à coordenação.');
      return;
    }

    if (!confirm('Deseja remover este membro?')) return;

    try {
      setDeletingId(id);

      await base44.entities.TeamMember.delete(id);

      toast.success('Membro removido com sucesso');

      await queryClient.invalidateQueries({ queryKey: ['team-members'] });
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao remover membro');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (member) => {
    if (!podeGerenciarEquipe) {
      toast.error('Acesso restrito à coordenação.');
      return;
    }

    setEditingMember(member);
    setIsOpen(true);
  };

  const handleAdd = () => {
    if (!podeGerenciarEquipe) {
      toast.error('Acesso restrito à coordenação.');
      return;
    }

    setEditingMember(null);
    setIsOpen(true);
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['team-members'] });
    await refetch();
  };

  if (loadingUser) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando equipe...
      </div>
    );
  }

  if (!podeGerenciarEquipe) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Acesso restrito à coordenação.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="membros" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="membros">Membros</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
        </TabsList>

        <TabsContent value="membros" className="space-y-4">
          {/* HEADER */}
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Equipe</h2>

            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar membro
            </Button>
          </div>

          {/* LISTA */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando equipe...
            </div>
          ) : teamMembers.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhum membro cadastrado
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {teamMembers.map((member) => (
                <Card key={member.id}>
                  <CardContent className="flex justify-between items-center py-4">
                    <div>
                      <div className="font-medium">
                        {member.user_name || 'Sem nome'}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {member.funcao || member.role || 'Sem função'}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {member.user_email}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(member)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(member.id)}
                        disabled={deletingId === member.id}
                      >
                        {deletingId === member.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contratos">
          <TeamContractsPanel />
        </TabsContent>
      </Tabs>

      {/* FORM */}
      <TeamMemberForm
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
        editingMember={editingMember}
      />
    </div>
  );
}
