import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gatherTourSteps } from './tourSteps';

const STORAGE_KEY = 'app_tour_done';
const PADDING = 6;
const TOOLTIP_WIDTH = 320;

export default function AppTour({ active, onExit, sidebarCollapsed, onExpandSidebar }) {
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [finished, setFinished] = useState(false);
  const rafRef = useRef(0);

  // Quando o tour é ativado: expande o sidebar (se recolhido) e coleta os passos visíveis.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setIndex(0);
    setFinished(false);
    setSteps([]);
    setRect(null);
    if (sidebarCollapsed && onExpandSidebar) onExpandSidebar();
    const delay = sidebarCollapsed ? 420 : 80;
    const t = setTimeout(() => {
      if (cancelled) return;
      const asideEl = document.querySelector('aside');
      setSteps(gatherTourSteps(asideEl));
    }, delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [active, sidebarCollapsed, onExpandSidebar]);

  const measure = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const step = steps[index];
      if (!step || !step.element) { setRect(null); return; }
      const r = step.element.getBoundingClientRect();
      if (!r.width && !r.height) { setRect(null); return; }
      setRect({
        top: r.top - PADDING,
        left: r.left - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      });
    });
  }, [steps, index]);

  useLayoutEffect(() => {
    if (!active || finished || steps.length === 0) return;
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, finished, steps, index, measure]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [active, steps, index, finished]);

  if (!active) return null;

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setFinished(true);
  };
  const close = () => { onExit(); };

  const handleNext = () => {
    if (steps.length === 0) return;
    if (index < steps.length - 1) setIndex((i) => i + 1);
    else finish();
  };
  const handlePrev = () => { if (index > 0) setIndex((i) => i - 1); };

  // Tela de conclusão
  if (finished) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-3">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Você conhece a plataforma!</h2>
          <p className="text-sm text-slate-600 mb-4">Explore à vontade — o tour não será exibido novamente automaticamente.</p>
          <Button className="w-full" onClick={close}>Começar a usar</Button>
        </div>
      </div>
    );
  }

  if (steps.length === 0) return null;

  const step = steps[index];

  // Posicionamento do tooltip: à direita do item; se não couber, à esquerda.
  const gap = 16;
  const vh = window.innerHeight;
  let tooltipLeft = rect ? rect.left + rect.width + gap : 264;
  if (tooltipLeft + TOOLTIP_WIDTH > vhToViewportWidth() - 16) {
    tooltipLeft = rect ? rect.left - TOOLTIP_WIDTH - gap : 16;
  }
  let tooltipTop = rect ? rect.top + rect.height / 2 - 90 : 80;
  tooltipTop = Math.max(16, Math.min(tooltipTop, vh - 240));

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Tour da plataforma">
      {/* Overlay escuro com recorte (spotlight) via box-shadow no destaque */}
      <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={close} />

      {rect && (
        <div
          className="absolute rounded-xl border-2 border-white/80 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Card de tooltip */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl border border-slate-200 transition-all duration-300 ease-out"
        style={{ left: tooltipLeft, top: tooltipTop, width: TOOLTIP_WIDTH }}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              Passo {index + 1} de {steps.length}
            </span>
            <button
              onClick={close}
              className="text-slate-400 hover:text-slate-600 transition"
              aria-label="Pular tour"
              title="Pular tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{step.label}</h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">{step.descricao}</p>

          {/* Indicador de progresso (bolinhas) */}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {steps.map((s, i) => (
              <span
                key={s.path}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-300'}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={index === 0} className="gap-1">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={close} className="text-slate-500">Pular tour</Button>
            <Button size="sm" onClick={handleNext} className="gap-1">
              {index === steps.length - 1 ? 'Concluir' : 'Próximo'}
              {index === steps.length - 1 ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function vhToViewportWidth() {
  return typeof window !== 'undefined' ? window.innerWidth : 1024;
}