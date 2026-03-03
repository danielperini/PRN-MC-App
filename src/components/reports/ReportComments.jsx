import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

const STAGE_LABELS = {
  SUBMISSION: 'Envio',
  REVIEW: 'Revisão',
  APPROVAL: 'Aprovação',
  REVISION: 'Revisão Solicitada',
};

const STAGE_COLORS = {
  SUBMISSION: 'bg-blue-100 text-blue-800',
  REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVAL: 'bg-green-100 text-green-800',
  REVISION: 'bg-red-100 text-red-800',
};

export default function ReportComments({ reportId, userRole }) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const { data: comments = [] } = useQuery({
    queryKey: ['report-comments', reportId],
    queryFn: () => base44.entities.ApprovalComment.filter({ report_id: reportId }, '-created_date'),
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.ApprovalComment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['report-comments', reportId]);
      setNewComment('');
      setSelectedSection('');
      setIsAdding(false);
      toast.success('Comentário adicionado!');
    },
  });

  const resolveCommentMutation = useMutation({
    mutationFn: (id) => base44.entities.ApprovalComment.update(id, { resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['report-comments', reportId]);
      toast.success('Comentário marcado como resolvido');
    },
  });

  const handleAddComment = async (stage) => {
    if (!newComment.trim()) {
      toast.error('Digite um comentário');
      return;
    }
    const user = await base44.auth.me();
    createCommentMutation.mutate({
      report_id: reportId,
      stage,
      author_email: user.email,
      author_name: user.full_name,
      comment: newComment,
      section: selectedSection,
    });
  };

  const unresolvedComments = comments.filter(c => !c.resolved);
  const resolvedComments = comments.filter(c => c.resolved);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-black">Comentários e Observações</h3>
        {unresolvedComments.length > 0 && (
          <Badge variant="outline" className="text-xs">{unresolvedComments.length} pendente(s)</Badge>
        )}
      </div>

      {/* Novo comentário */}
      {isAdding && (
        <div className="p-4 border border-blue-100 bg-blue-50 rounded-lg space-y-3">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
          >
            <option value="">Selecione uma seção (opcional)</option>
            <option value="Identificação">Identificação</option>
            <option value="Atividades">Atividades</option>
            <option value="Avaliação">Avaliação</option>
          </select>
          <Textarea
            placeholder="Escreva seu comentário..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setNewComment(''); }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-black hover:bg-gray-800 text-white gap-1.5" onClick={() => handleAddComment('REVIEW')} disabled={createCommentMutation.isPending}>
              <Send className="w-3.5 h-3.5" />Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Comentários não resolvidos */}
      {unresolvedComments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Comentários Pendentes</p>
          {unresolvedComments.map((comment) => (
            <div key={comment.id} className="p-3 border border-red-100 bg-red-50 rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${STAGE_COLORS[comment.stage] || 'bg-gray-100 text-gray-700'} text-xs font-medium`}>
                      {STAGE_LABELS[comment.stage]}
                    </Badge>
                    {comment.section && <span className="text-xs text-gray-600">Seção: {comment.section}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{comment.author_name} • {new Date(comment.created_date).toLocaleDateString('pt-BR')}</p>
                </div>
                {['COORDENADOR', 'admin'].includes(userRole) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => resolveCommentMutation.mutate(comment.id)}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-700">{comment.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* Comentários resolvidos */}
      {resolvedComments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Comentários Resolvidos ({resolvedComments.length})</p>
          <div className="space-y-1.5">
            {resolvedComments.map((comment) => (
              <div key={comment.id} className="p-2.5 border border-green-100 bg-green-50 rounded text-xs opacity-75">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                  <span className="text-gray-600">{comment.author_name} • {comment.section && `${comment.section} •`} {new Date(comment.created_date).toLocaleDateString('pt-BR')}</span>
                </div>
                <p className="text-gray-600 mt-1 ml-5">{comment.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botão para adicionar comentário */}
      {!isAdding && (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setIsAdding(true)}>
          <MessageCircle className="w-3.5 h-3.5" />Adicionar Comentário
        </Button>
      )}

      {comments.length === 0 && !isAdding && (
        <p className="text-xs text-gray-400 text-center py-6">Nenhum comentário ainda</p>
      )}
    </section>
  );
}