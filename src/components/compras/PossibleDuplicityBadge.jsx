import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function PossibleDuplicityBadge({ purchase }) {
  if (!purchase) return null;

  // Marcar como possível duplicidade se foi criado ignorando aviso
  // Você pode adicionar um campo na entidade ou verificar por padrão
  const isPossibleDuplicate = purchase.created_by_ignoring_duplicate || false;

  if (!isPossibleDuplicate) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 gap-1 flex w-fit">
            <AlertCircle className="h-3 w-3" />
            Possível duplicidade
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Esta solicitação foi criada mesmo com aviso de possível duplicidade.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}