import React, { useState, useMemo } from 'react';
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FrasesParticipantes({ reports = [] }) {
  const [current, setCurrent] = useState(0);

  // Extrair observações/situações interessantes das atividades
  const frases = useMemo(() => {
    const extraidas = [];
    reports.forEach(r => {
      (r.atividades || []).forEach(a => {
        if (a.observacoes && a.observacoes.trim().length > 15) {
          extraidas.push({
            texto: a.observacoes,
            atividade: a.titulo,
            museu: a.museu || r.museu,
            data: a.data_realizacao,
          });
        }
      });
    });
    return extraidas.length > 0 ? extraidas : [];
  }, [reports]);

  if (frases.length === 0) {
    return null;
  }

  const frase = frases[current];
  const prev = () => setCurrent(i => (i - 1 + frases.length) % frases.length);
  const next = () => setCurrent(i => (i + 1) % frases.length);

  return (
    <div className="border-2 border-black rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black bg-black">
        <div className="flex items-center gap-3">
          <Quote className="w-5 h-5 text-white" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-widest">
            Frases de Participantes
          </h3>
        </div>
      </div>

      {/* Frase principal */}
      <div className="px-8 py-12 bg-white min-h-[240px] flex flex-col justify-between">
        <div>
          <Quote className="w-10 h-10 text-gray-200 mb-4" />
          <p className="text-3xl md:text-4xl font-light text-black leading-tight tracking-tight">
            "{frase.texto}"
          </p>
        </div>
        <div className="mt-8">
          <p className="text-xs font-semibold text-black uppercase tracking-widest">
            {frase.atividade} · {frase.museu}
          </p>
          {frase.data && (
            <p className="text-xs text-gray-400 mt-1">{frase.data}</p>
          )}
        </div>
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
        <span className="text-xs font-medium text-gray-500">
          {current + 1} de {frases.length}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="w-8 h-8 p-0"
            onClick={prev}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-8 h-8 p-0"
            onClick={next}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}