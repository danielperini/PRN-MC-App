import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingPage({ message = 'Carregando...', fullHeight = true }) {
  return (
    <div className={`${fullHeight ? 'min-h-screen' : 'h-32'} flex flex-col items-center justify-center px-4`}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 bg-slate-100 rounded-xl animate-pulse"
        />
      ))}
    </div>
  );
}