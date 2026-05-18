import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingDataNotice({
  title = 'Carregando dados',
  message = 'A página ainda está recuperando informações do app. Aguarde antes de concluir a ação.',
  className = '',
}) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 ${className}`}>
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-700" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{message}</p>
        </div>
      </div>
    </div>
  );
}
