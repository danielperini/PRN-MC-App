import React, { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageCircle, Check, Reply } from 'lucide-react';

export default function CommentThread({ comment, replies, currentUser, onReply, onResolve, onDelete }) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const isAuthor = currentUser?.email === comment.created_by;
  const canResolve = currentUser?.role === 'COORDENADOR' || currentUser?.role === 'ADMIN';

  const getRoleColor = (role) => {
    return role === 'COORDENADOR' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  return (
    <div className="border-l-2 border-gray-200 pl-4 py-2">
      {/* Comentário Principal */}
      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <span className="text-xs">{comment.author_name?.[0]}</span>
            </Avatar>
            <div>
              <p className="font-medium text-sm">{comment.author_name}</p>
              <Badge variant="outline" className={`text-xs ${getRoleColor(comment.author_role)}`}>
                {comment.author_role}
              </Badge>
            </div>
          </div>
          <span className="text-xs text-gray-500">
            {formatDistanceToNow(new Date(comment.created_date), { locale: ptBR, addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-gray-800 mb-3">{comment.conteudo}</p>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setShowReplyForm(!showReplyForm)}
          >
            <Reply className="w-3 h-3 mr-1" />
            Responder
          </Button>
          {canResolve && !comment.resolvido && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onResolve(comment.id)}
            >
              <Check className="w-3 h-3 mr-1" />
              Resolver
            </Button>
          )}
          {isAuthor && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-red-600"
              onClick={() => onDelete(comment.id)}
            >
              Deletar
            </Button>
          )}
        </div>
      </div>

      {/* Respostas */}
      {replies && replies.length > 0 && (
        <div className="space-y-2 ml-4">
          {replies.map(reply => (
            <CommentThread
              key={reply.id}
              comment={reply}
              replies={[]}
              currentUser={currentUser}
              onReply={onReply}
              onResolve={onResolve}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Formulário de Resposta */}
      {showReplyForm && (
        <div className="mt-3 ml-4">
          <textarea
            className="w-full p-2 border rounded text-sm"
            placeholder="Escreva sua resposta..."
            rows="2"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                onReply(comment.id, e.currentTarget.value);
                setShowReplyForm(false);
              }
            }}
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                const textarea = e.currentTarget.parentElement.previousElementSibling;
                onReply(comment.id, textarea.value);
                setShowReplyForm(false);
              }}
            >
              Enviar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReplyForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {comment.resolvido && (
        <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
          <Check className="w-3 h-3" />
          Resolvido
        </div>
      )}
    </div>
  );
}