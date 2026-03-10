import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import CommentThread from './CommentThread';
import { toast } from 'sonner';

export default function ReportCommentsPanel({ reportId, currentUser }) {
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState([]);

  const { data: commentsData, isLoading, refetch } = useQuery({
    queryKey: ['comments', reportId],
    queryFn: () => base44.entities.Comment.filter({ report_id: reportId }),
    enabled: !!reportId,
  });

  useEffect(() => {
    if (commentsData) {
      const rootComments = commentsData.filter(c => !c.eh_resposta_a);
      setComments(rootComments);
    }
  }, [commentsData]);

  // Subscribe para atualizações em tempo real
  useEffect(() => {
    const unsubscribe = base44.entities.Comment.subscribe((event) => {
      if (event.data?.report_id === reportId) {
        refetch();
        if (event.type === 'create' && event.data.created_by !== currentUser?.email) {
          toast.success(`${event.data.author_name} comentou no relatório`);
        }
      }
    });
    return unsubscribe;
  }, [reportId, currentUser, refetch]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await base44.entities.Comment.create({
        report_id: reportId,
        author_email: currentUser.email,
        author_name: currentUser.full_name,
        author_role: currentUser.role,
        conteudo: newComment,
      });
      setNewComment('');
      toast.success('Comentário adicionado');
    } catch (error) {
      toast.error('Erro ao adicionar comentário');
    }
  };

  const handleReply = async (parentId, replyText) => {
    if (!replyText.trim()) return;

    try {
      await base44.entities.Comment.create({
        report_id: reportId,
        author_email: currentUser.email,
        author_name: currentUser.full_name,
        author_role: currentUser.role,
        conteudo: replyText,
        eh_resposta_a: parentId,
      });
      toast.success('Resposta adicionada');
    } catch (error) {
      toast.error('Erro ao adicionar resposta');
    }
  };

  const handleResolve = async (commentId) => {
    try {
      await base44.entities.Comment.update(commentId, { resolvido: true });
      toast.success('Comentário marcado como resolvido');
    } catch (error) {
      toast.error('Erro ao resolver comentário');
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm('Tem certeza que deseja deletar este comentário?')) return;

    try {
      await base44.entities.Comment.delete(commentId);
      toast.success('Comentário deletado');
    } catch (error) {
      toast.error('Erro ao deletar comentário');
    }
  };

  const getReplies = (parentId) => {
    return commentsData?.filter(c => c.eh_resposta_a === parentId) || [];
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Comentários ({comments.length})</h3>
      </div>

      {/* Formulário de Novo Comentário */}
      <div className="mb-6 pb-6 border-b">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Adicione um comentário ou feedback..."
          className="w-full p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500"
          rows="3"
        />
        <div className="flex gap-2 mt-2">
          <Button
            onClick={handleAddComment}
            disabled={!newComment.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Comentar
          </Button>
          {newComment && (
            <Button
              variant="outline"
              onClick={() => setNewComment('')}
            >
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Lista de Comentários */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Carregando comentários...</p>
      ) : comments.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
      ) : (
        <div className="space-y-4">
          {comments.map(comment => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={getReplies(comment.id)}
              currentUser={currentUser}
              onReply={handleReply}
              onResolve={handleResolve}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}