import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * InactiveMembersPanel — Permite visualizar e restaurar membros inativos/suspensos
 */
export default function InactiveMembersPanel() {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState(null);

  const { data: inactiveMembers = [], isLoading } = useQuery({
    queryKey: ['inactive-team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.filter({
        status: { $ne: 'ATIVO' }
      });
      return Array.isArray(res) ? res : res?.data || [];
    },
  });

  const handleRestore = async (memberId, memberName) => {
    setRestoringId(memberId);
    try {
      await base44.entities.TeamMember.update(memberId, { status: 'ATIVO' });
      
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inactive-team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members-all'] }),
      ]);

      toast.success(`${memberName} restaurado(a) com sucesso`);
    } catch (error) {
      console.error('Erro ao restaurar membro:', error);
      toast.error(`Erro ao restaurar: ${error?.message || 'Tente novamente'}`);
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-600">
        Carregando membros inativos...
      </div>
    );
  }

  if (inactiveMembers.length === 0) {
    return null;
  }

  return (
    <div className="border-2 border-black rounded-lg p-4 bg-white">
      <div className="flex items-start gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-black">Membros Inativos</h3>
          <p className="text-xs text-gray-600 mt-1">
            {inactiveMembers.length} membro(s) inativo(s) pode(m) ser restaurado(s)
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {inactiveMembers.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-3 border border-black rounded bg-white hover:bg-gray-50"
          >
            <div>
              <p className="font-medium text-sm text-black">{member.user_name}</p>
              <p className="text-xs text-gray-600">{member.funcao || 'Sem cargo'}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRestore(member.id, member.user_name)}
              disabled={restoringId === member.id}
              className="border-2 border-black hover:bg-black hover:text-white"
            >
              {restoringId === member.id ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin mr-1" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCw className="w-3 h-3 mr-1" />
                  Restaurar
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}