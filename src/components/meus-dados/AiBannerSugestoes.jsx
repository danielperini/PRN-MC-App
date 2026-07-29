import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Banner fixo no topo da aba Dados Pessoais quando há sugestões da IA pendentes.
 * Props:
 *   sugestoes: { campo_label: string, campo_key: string, valor: any }[]
 *   onAplicarTudo: () => void
 *   onDescartar: () => void
 *   onAplicarUm: (key, valor) => void
 */
export default function AiBannerSugestoes({ sugestoes = [], onAplicarTudo, onDescartar, onAplicarUm }) {
  const [expandido, setExpandido] = useState(false);
  const [aplicados, setAplicados] = useState(new Set());

  if (!sugestoes || sugestoes.length === 0) return null;

  const handleAplicarUm = (key, valor) => {
    onAplicarUm(key, valor);
    setAplicados(prev => new Set([...prev, key]));
  };

  const pendentes = sugestoes.filter(s => !aplicados.has(s.campo_key));

  return (
    <div className="rounded-xl border border-yellow-300 bg-yellow-50 overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">
              ✨ {pendentes.length} sugestão{pendentes.length !== 1 ? 'ões' : ''} da IA disponível{pendentes.length !== 1 ? 'is' : ''}
            </p>
            <p className="text-xs text-yellow-700">Extraído automaticamente do seu contrato</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs h-7 px-3"
            onClick={onAplicarTudo}
          >
            Aplicar Tudo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-yellow-700 hover:text-yellow-900 h-7 px-2"
            onClick={() => setExpandido(v => !v)}
          >
            {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-yellow-700 hover:text-red-600 h-7 px-2"
            onClick={onDescartar}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {expandido && (
        <div className="border-t border-yellow-200 divide-y divide-yellow-100">
          {sugestoes.map(s => {
            const isAplicado = aplicados.has(s.campo_key);
            return (
              <div key={s.campo_key} className={`flex items-center justify-between px-4 py-2.5 ${isAplicado ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-yellow-900">{s.campo_label}</p>
                  <p className="text-xs text-yellow-700 truncate max-w-xs">
                    {typeof s.valor === 'number'
                      ? s.valor.toLocaleString('pt-BR')
                      : String(s.valor || '—')}
                  </p>
                </div>
                {isAplicado ? (
                  <span className="text-green-600 flex items-center gap-1 text-xs">
                    <Check className="w-3 h-3" /> Aplicado
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2 border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                    onClick={() => handleAplicarUm(s.campo_key, s.valor)}
                  >
                    Aplicar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}