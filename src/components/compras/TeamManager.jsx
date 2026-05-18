import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import TeamMemberForm from './TeamMemberForm';
import TeamContractsPanel from './TeamContractsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EntityLinkDialog from '@/components/linking/EntityLinkDialog';

export default function TeamManager() {
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [linkingMember, setLinkingMember] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const {
    data: teamMembers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
  });

  const handleDelete = async (id) => {
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
    setEditingMember(member);
    setIsOpen(true);
  };

  const handleAdd = () => {
    setEditingMember(null);
    setIsOpen(true);
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['team-members'] });
    await refetch();
  };

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
                        {member.user_email || member.email_pessoal || 'Membro sem usuário de acesso'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!member.user_email && <Badge variant="outline">sem login</Badge>}
                        {member.managed_by_user_email && <Badge variant="secondary">responsável: {member.managed_by_user_email}</Badge>}
                        {member.cpf_cnpj && <Badge variant="outline">doc. vinculado</Badge>}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setLinkingMember(member)}
                        title="Vincular registros"
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>

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
      <EntityLinkDialog
        open={Boolean(linkingMember)}
        onClose={() => setLinkingMember(null)}
        source={{ ...(linkingMember || {}), __entityType: 'TeamMember' }}
        sourceType="TeamMember"
        sourceId={linkingMember?.id}
        onApplied={handleSuccess}
      />
    </div>
  );
}
