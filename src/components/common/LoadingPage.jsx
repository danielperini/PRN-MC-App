import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

const ETAPAS_PADRAO = [
  { limite: 35, texto: 'Carregando relatórios' },
  { limite: 70, texto: 'Calculando rubricas' },
  { limite: 92, texto: 'Conferindo dados e preparando a página' },
  { limite: 99, texto: 'Finalizando carregamento' },
];

export default function LoadingPage({
  message = 'Carregando página...',
  description = 'Estamos carregando todas as informações. Aguarde alguns instantes.',
  fullHeight = true,
  error = false,
  errorTitle = 'Não foi possível carregar a página',
  errorDescription = 'Atualize a página ou tente novamente em alguns instantes.',
  etapas = ETAPAS_PADRAO,
  duracaoMinimaMs = 5000,
}) {
  const [progresso, setProgresso] = useState(4);

  useEffect(() => {
    if (error) return undefined;
    const inicio = Date.now();
    const intervalo = window.setInterval(() => {
      const decorrido = Date.now() - inicio;
      const alvo = Math.min(99, Math.round((decorrido / Math.max(1000, duracaoMinimaMs)) * 100));
      setProgresso((atual) => Math.max(atual, alvo));
    }, 120);
    return () => window.clearInterval(intervalo);
  }, [duracaoMinimaMs, error]);

  const etapaAtual = useMemo(() => {
    return etapas.find((etapa) => progresso <= etapa.limite)?.texto || etapas[etapas.length - 1]?.texto || message;
  }, [etapas, progresso, message]);

  if (error) {
    return (
      <div className={`${fullHeight ? 'min-h-screen' : 'min-h-[60vh]'} flex flex-col items-center justify-center px-6 bg-white`}>
        <div className="max-w-md w-full text-center rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-red-700">{errorTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{errorDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${fullHeight ? 'min-h-screen' : 'min-h-[60vh]'} flex flex-col items-center justify-center px-6 bg-white`}>
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-slate-500" />
        <h2 className="text-center text-lg font-semibold text-slate-900">{message}</h2>
        <p className="mt-2 text-center text-sm font-medium text-slate-700">{etapaAtual}…</p>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-800 transition-[width] duration-300 ease-out"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>{description}</span>
          <strong className="text-slate-600">{progresso}%</strong>
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

export function LoadingCardSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
          <div className="mt-5 h-7 w-32 rounded bg-slate-100 animate-pulse" />
          <div className="mt-3 h-3 w-20 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function LoadingTableSkeleton({ rows = 6 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 h-5 w-40 rounded bg-slate-100 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((__, coluna) => (
              <div key={coluna} className="h-4 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
