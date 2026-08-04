import React, { useState, useEffect } from 'react';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_DONE = 'app_tour_done';
const STORAGE_NEVER_SHOW = 'app_tour_welcome_never';
const STORAGE_SNOOZE_UNTIL = 'app_tour_welcome_snooze_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 1 semana

// Banner de boas-vindas exibido na primeira vez que o usuário acessa o app.
// Só aparece em telas grandes (o tour usa o sidebar, oculto no mobile).
// "Agora não" silencia por 1 semana; "Não mostrar novamente" oculta definitivamente.
export default function WelcomeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let done, never, snoozeUntil;
    try { done = localStorage.getItem(STORAGE_DONE); } catch {}
    try { never = localStorage.getItem(STORAGE_NEVER_SHOW); } catch {}
    try { snoozeUntil = Number(localStorage.getItem(STORAGE_SNOOZE_UNTIL) || 0); } catch {}
    const now = Date.now();
    const snoozed = snoozeUntil && snoozeUntil > now;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!done && !never && !snoozed && isDesktop) setVisible(true);
    const hide = () => setVisible(false);
    window.addEventListener('app-tour:start', hide);
    return () => window.removeEventListener('app-tour:start', hide);
  }, []);

  const start = () => {
    setVisible(false);
    window.dispatchEvent(new CustomEvent('app-tour:start'));
  };
  const snooze = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_SNOOZE_UNTIL, String(Date.now() + SNOOZE_MS)); } catch {}
  };
  const neverAgain = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_NEVER_SHOW, '1'); } catch {}
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-xs animate-slide-in">
      <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5" />
            <span className="font-semibold text-sm">Bem-vindo(a)!</span>
          </div>
          <button onClick={snooze} className="text-white/80 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-slate-700 mb-4">
            Quer um tour guiado de 1 minuto pelos principais itens do menu lateral? Ele mostra o que cada seção faz.
          </p>
          <div className="flex flex-col gap-2">
            <Button size="sm" className="w-full gap-1" onClick={start}>
              Iniciar Tour <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="w-full text-slate-500" onClick={snooze}>
              Agora não (lembrar em 1 semana)
            </Button>
            <button
              type="button"
              onClick={neverAgain}
              className="w-full text-xs text-slate-400 hover:text-slate-600 underline-offset-2 hover:underline"
            >
              Não mostrar novamente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}